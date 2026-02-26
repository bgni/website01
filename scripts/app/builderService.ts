import type { Connection, NetworkDevice } from "../domain/types.ts";
import { inferDeviceKindFromType } from "../domain/deviceKind.ts";
import {
  buildExportPayload,
  getFrequentDeviceTypeSlugs,
  parseImportPayload,
  trackRecentDeviceType,
} from "./customTopology.ts";
import {
  choosePortPair,
  computeNewDevicePosition,
  getFreeLinkablePorts,
  isContainerDevice,
  pruneConnectionsForDeviceType,
  stripManagedDeviceFields,
} from "./customBuilderUtils.ts";
import type {
  BuilderGraphPort,
  BuilderHistoryPort,
  BuilderIdentityPort,
  BuilderModePort,
} from "./ports.ts";
import type { Dispatch, State } from "./types.ts";

export type BuilderStatsState = {
  recentDeviceTypeSlugs: string[];
  frequentDeviceTypeCounts: Record<string, number>;
};

type BuilderServiceDeps =
  & {
    getState: () => State;
    dispatch: Dispatch;
    customNetworkId: string;
    builderStats: BuilderStatsState;
    formatStatusError: (err: unknown) => string;
  }
  & BuilderGraphPort
  & BuilderHistoryPort
  & BuilderIdentityPort
  & BuilderModePort;

export type BuilderService = {
  addCustomDevice: (deviceTypeSlug: string) => void;
  addCustomDeviceAt: (
    deviceTypeSlug: string,
    position: { x: number; y: number },
  ) => void;
  addCustomContainerAt: (position: { x: number; y: number }) => void;
  assignDeviceToContainer: (
    deviceId: string,
    containerId: string | null,
  ) => void;
  connectSelectedDevices: () => void;
  deleteSelectedConnection: () => void;
  renameCustomDevice: (deviceId: string, nextName: string) => void;
  changeCustomDeviceType: (
    deviceId: string,
    nextDeviceTypeSlug: string,
  ) => void;
  updateCustomDeviceProperties: (
    deviceId: string,
    propertiesJsonText: string,
  ) => void;
  deleteCustomDevice: (deviceId: string) => void;
  exportTopologyJson: () => string;
  importCustomTopologyJson: (text: string) => Promise<void>;
  getBuilderDeviceStats: () => {
    recentDeviceTypeSlugs: string[];
    frequentDeviceTypeSlugs: string[];
  };
};

export const createBuilderService = (
  deps: BuilderServiceDeps,
): BuilderService => {
  const pushHistorySnapshot = (label: string) => {
    deps.history.pushUndo(deps.createHistorySnapshot(label));
  };

  const requireCustomMode = (): State | null => {
    const state = deps.getState();
    if (state.networkId === deps.customNetworkId) return state;
    deps.dispatch({
      type: "setStatusText",
      text: "Open Create/Edit mode first.",
    });
    return null;
  };

  const addCustomDeviceInternal = (
    deviceTypeSlug: string,
    preferredPosition: { x: number; y: number } | null,
  ) => {
    const state = requireCustomMode();
    if (!state) return;

    const slug = deviceTypeSlug.trim();
    if (!slug) {
      deps.dispatch({
        type: "setStatusText",
        text: "Choose a device type first.",
      });
      return;
    }

    const deviceType = state.deviceTypes[slug];
    if (!deviceType) {
      deps.dispatch({
        type: "setStatusText",
        text: `Unknown device type '${slug}'.`,
      });
      return;
    }

    const ids = new Set(state.devices.map((d) => d.id));
    const deviceId = deps.nextUniqueId("custom-device", ids);
    const sameTypeCount = state.devices.filter((d) => d.deviceTypeSlug === slug)
      .length;
    const name = `${deviceType.model} ${sameTypeCount + 1}`;
    const typeText = `${deviceType.slug} ${deviceType.model}`;

    const selectedIds = Array.from(state.selected);
    const selectedAnchor = selectedIds.length === 1
      ? (state.devices.find((d) => d.id === selectedIds[0]) ?? null)
      : null;

    const selectedAnchorPosition = selectedAnchor
      ? (deps.getNodePositions().get(selectedAnchor.id) ?? null)
      : null;

    const computedPosition = computeNewDevicePosition({
      selectedAnchor,
      selectedAnchorPosition,
      viewportCenter: deps.getViewportCenter(),
      totalDevices: state.devices.length,
    });
    const newPosition = preferredPosition ?? computedPosition;

    const device: NetworkDevice = {
      id: deviceId,
      name,
      type: typeText,
      deviceKind: inferDeviceKindFromType(typeText),
      deviceTypeSlug: slug,
      ...(newPosition ? { x: newPosition.x, y: newPosition.y } : {}),
    };

    const tracked = trackRecentDeviceType(
      deps.builderStats.recentDeviceTypeSlugs,
      deps.builderStats.frequentDeviceTypeCounts,
      slug,
    );
    deps.builderStats.recentDeviceTypeSlugs = tracked.recentDeviceTypeSlugs;
    deps.builderStats.frequentDeviceTypeCounts =
      tracked.frequentDeviceTypeCounts;

    pushHistorySnapshot("add device");
    const nextDevices = [...state.devices, device];

    let nextConnections = state.connections;
    let statusText = `Added ${name}.`;

    if (selectedAnchor && !isContainerDevice(selectedAnchor)) {
      const fromPorts = getFreeLinkablePorts(
        selectedAnchor,
        state.connections,
        state.deviceTypes,
      );
      const toPorts = getFreeLinkablePorts(
        device,
        state.connections,
        state.deviceTypes,
      );
      const pair = choosePortPair(fromPorts, toPorts);

      if (pair) {
        const connectionIds = new Set(state.connections.map((c) => c.id));
        const connectionId = deps.nextUniqueId(
          "custom-connection",
          connectionIds,
        );
        nextConnections = [
          ...state.connections,
          {
            id: connectionId,
            from: {
              deviceId: selectedAnchor.id,
              interfaceId: pair.fromInterfaceId,
            },
            to: {
              deviceId: device.id,
              interfaceId: pair.toInterfaceId,
            },
          },
        ];
        statusText =
          `Added ${name} and connected ${selectedAnchor.name}:${pair.fromInterfaceId} → ${name}:${pair.toInterfaceId}.`;
      } else {
        statusText =
          `Added ${name}. Could not auto-connect to ${selectedAnchor.name} (no compatible free ports).`;
      }
    }

    deps.refreshCustomGraph(nextDevices, nextConnections, {
      selectedIds: [device.id],
    });
    deps.dispatch({ type: "setStatusText", text: statusText });
  };

  const addCustomDevice = (deviceTypeSlug: string) => {
    addCustomDeviceInternal(deviceTypeSlug, null);
  };

  const addCustomDeviceAt = (
    deviceTypeSlug: string,
    position: { x: number; y: number },
  ) => {
    addCustomDeviceInternal(deviceTypeSlug, position);
  };

  const addCustomContainerAt = (position: { x: number; y: number }) => {
    const state = requireCustomMode();
    if (!state) return;

    const ids = new Set(state.devices.map((d) => d.id));
    const containerId = deps.nextUniqueId("custom-container", ids);
    const containerCount = state.devices.filter((d) => isContainerDevice(d))
      .length;

    const container: NetworkDevice = {
      id: containerId,
      name: `Group ${containerCount + 1}`,
      type: "container group",
      deviceKind: inferDeviceKindFromType("other"),
      isContainer: true,
      width: 260,
      height: 170,
      x: position.x,
      y: position.y,
    };

    pushHistorySnapshot("add container");
    deps.refreshCustomGraph([...state.devices, container], state.connections, {
      selectedIds: [containerId],
    });
    deps.dispatch({ type: "setStatusText", text: `Added ${container.name}.` });
  };

  const assignDeviceToContainer = (
    deviceId: string,
    containerId: string | null,
  ) => {
    const state = requireCustomMode();
    if (!state) return;

    const device = state.devices.find((d) => d.id === deviceId);
    if (!device) {
      deps.dispatch({ type: "setStatusText", text: "Device not found." });
      return;
    }
    if (isContainerDevice(device)) {
      deps.dispatch({
        type: "setStatusText",
        text: "Containers cannot be assigned to another container.",
      });
      return;
    }

    const nextContainerId = containerId?.trim() ? containerId.trim() : null;
    if (nextContainerId) {
      const container = state.devices.find((d) => d.id === nextContainerId);
      if (!container || !isContainerDevice(container)) {
        deps.dispatch({
          type: "setStatusText",
          text: "Container not found.",
        });
        return;
      }
    }

    if ((device.containerId as string | undefined) === nextContainerId) return;

    pushHistorySnapshot("assign to container");
    const nextDevices = state.devices.map((entry) =>
      entry.id === deviceId
        ? {
          ...entry,
          ...(nextContainerId ? { containerId: nextContainerId } : {}),
        }
        : entry
    ).map((entry) => {
      if (entry.id !== deviceId || nextContainerId) return entry;
      const copy = { ...entry };
      delete copy.containerId;
      return copy;
    });

    deps.refreshCustomGraph(nextDevices, state.connections, {
      selectedIds: [deviceId],
    });
    deps.dispatch({
      type: "setStatusText",
      text: nextContainerId
        ? `Assigned ${device.name} to container.`
        : `Removed ${device.name} from container.`,
    });
  };

  const connectSelectedDevices = () => {
    const state = requireCustomMode();
    if (!state) return;

    const selectedIds = Array.from(state.selected);
    if (selectedIds.length !== 2) {
      deps.dispatch({
        type: "setStatusText",
        text: "Select exactly 2 devices to connect.",
      });
      return;
    }

    const fromDevice = state.devices.find((d) => d.id === selectedIds[0]);
    const toDevice = state.devices.find((d) => d.id === selectedIds[1]);
    if (!fromDevice || !toDevice) {
      deps.dispatch({
        type: "setStatusText",
        text: "Selected devices are no longer available.",
      });
      return;
    }

    const fromPorts = getFreeLinkablePorts(
      fromDevice,
      state.connections,
      state.deviceTypes,
    );
    const toPorts = getFreeLinkablePorts(
      toDevice,
      state.connections,
      state.deviceTypes,
    );

    const pair = choosePortPair(fromPorts, toPorts);
    if (!pair) {
      deps.dispatch({
        type: "setStatusText",
        text: "No compatible free ports found on one or both devices.",
      });
      return;
    }

    const connectionIds = new Set(state.connections.map((c) => c.id));
    const connectionId = deps.nextUniqueId("custom-connection", connectionIds);

    pushHistorySnapshot("connect devices");
    const nextConnections: Connection[] = [
      ...state.connections,
      {
        id: connectionId,
        from: {
          deviceId: fromDevice.id,
          interfaceId: pair.fromInterfaceId,
        },
        to: {
          deviceId: toDevice.id,
          interfaceId: pair.toInterfaceId,
        },
      },
    ];

    deps.refreshCustomGraph(state.devices, nextConnections);
    deps.dispatch({
      type: "setStatusText",
      text:
        `Connected ${fromDevice.name}:${pair.fromInterfaceId} → ${toDevice.name}:${pair.toInterfaceId}.`,
    });
  };

  const deleteSelectedConnection = () => {
    const state = requireCustomMode();
    if (!state) return;

    const selectedIds = Array.from(state.selected);
    if (selectedIds.length !== 2) {
      deps.dispatch({
        type: "setStatusText",
        text: "Select exactly 2 devices to delete a connection.",
      });
      return;
    }

    const [leftId, rightId] = selectedIds;
    const toRemove = state.connections.filter((connection) =>
      (connection.from.deviceId === leftId &&
        connection.to.deviceId === rightId) ||
      (connection.from.deviceId === rightId &&
        connection.to.deviceId === leftId)
    );

    if (!toRemove.length) {
      deps.dispatch({
        type: "setStatusText",
        text: "No connection exists between selected devices.",
      });
      return;
    }

    pushHistorySnapshot("delete connection");
    const removeIds = new Set(toRemove.map((connection) => connection.id));
    const nextConnections = state.connections.filter((connection) =>
      !removeIds.has(connection.id)
    );
    deps.refreshCustomGraph(state.devices, nextConnections);
    deps.dispatch({
      type: "setStatusText",
      text:
        `Deleted ${toRemove.length} connection(s) between selected devices.`,
    });
  };

  const renameCustomDevice = (deviceId: string, nextName: string) => {
    const state = requireCustomMode();
    if (!state) return;

    const trimmed = nextName.trim();
    if (!trimmed) {
      deps.dispatch({
        type: "setStatusText",
        text: "Device name cannot be empty.",
      });
      return;
    }

    const existing = state.devices.find((device) => device.id === deviceId);
    if (!existing) {
      deps.dispatch({
        type: "setStatusText",
        text: "Device not found.",
      });
      return;
    }

    if (existing.name === trimmed) return;

    pushHistorySnapshot("rename device");
    const nextDevices = state.devices.map((device) =>
      device.id === deviceId ? { ...device, name: trimmed } : device
    );
    deps.refreshCustomGraph(nextDevices, state.connections);
    deps.dispatch({
      type: "setStatusText",
      text: `Renamed device to ${trimmed}.`,
    });
  };

  const changeCustomDeviceType = (
    deviceId: string,
    nextDeviceTypeSlug: string,
  ) => {
    const state = requireCustomMode();
    if (!state) return;

    const slug = nextDeviceTypeSlug.trim();
    if (!slug) {
      deps.dispatch({
        type: "setStatusText",
        text: "Choose a device type.",
      });
      return;
    }

    const nextDeviceType = state.deviceTypes[slug];
    if (!nextDeviceType) {
      deps.dispatch({
        type: "setStatusText",
        text: `Unknown device type '${slug}'.`,
      });
      return;
    }

    const existing = state.devices.find((device) => device.id === deviceId);
    if (!existing) {
      deps.dispatch({ type: "setStatusText", text: "Device not found." });
      return;
    }

    if (existing.deviceTypeSlug === slug) return;

    const nextTypeText = `${nextDeviceType.slug} ${nextDeviceType.model}`;
    const nextDevices = state.devices.map((device) =>
      device.id === deviceId
        ? {
          ...device,
          deviceTypeSlug: slug,
          type: nextTypeText,
          deviceKind: inferDeviceKindFromType(nextTypeText),
        }
        : device
    );

    const { nextConnections, removedCount } = pruneConnectionsForDeviceType({
      device: existing,
      nextDeviceTypeSlug: slug,
      connections: state.connections,
      deviceTypes: state.deviceTypes,
    });

    pushHistorySnapshot("change device type");
    deps.refreshCustomGraph(nextDevices, nextConnections, {
      selectedIds: [deviceId],
    });

    const baseText =
      `Updated ${existing.name} to ${nextDeviceType.brand} ${nextDeviceType.model}.`;
    deps.dispatch({
      type: "setStatusText",
      text: removedCount > 0
        ? `${baseText} Removed ${removedCount} incompatible connection(s).`
        : baseText,
    });
  };

  const updateCustomDeviceProperties = (
    deviceId: string,
    propertiesJsonText: string,
  ) => {
    const state = requireCustomMode();
    if (!state) return;

    const existing = state.devices.find((device) => device.id === deviceId);
    if (!existing) {
      deps.dispatch({ type: "setStatusText", text: "Device not found." });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(propertiesJsonText);
    } catch {
      deps.dispatch({
        type: "setStatusText",
        text: "Properties must be valid JSON object.",
      });
      return;
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      deps.dispatch({
        type: "setStatusText",
        text: "Properties must be a JSON object.",
      });
      return;
    }

    const sanitized = stripManagedDeviceFields(
      parsed as Record<string, unknown>,
    );

    const nextDevices = state.devices.map((device) => {
      if (device.id !== deviceId) return device;

      const base: NetworkDevice = {
        id: device.id,
        name: device.name,
        type: device.type,
        deviceKind: device.deviceKind,
        ...(device.deviceTypeSlug
          ? { deviceTypeSlug: device.deviceTypeSlug }
          : {}),
        ...(Number.isFinite(Number(device.x)) ? { x: Number(device.x) } : {}),
        ...(Number.isFinite(Number(device.y)) ? { y: Number(device.y) } : {}),
      };

      return {
        ...base,
        ...sanitized,
      };
    });

    pushHistorySnapshot("update device properties");
    deps.refreshCustomGraph(nextDevices, state.connections, {
      selectedIds: [deviceId],
    });
    deps.dispatch({
      type: "setStatusText",
      text: `Updated properties for ${existing.name}.`,
    });
  };

  const deleteCustomDevice = (deviceId: string) => {
    const state = requireCustomMode();
    if (!state) return;

    const device = state.devices.find((item) => item.id === deviceId);
    if (!device) {
      deps.dispatch({ type: "setStatusText", text: "Device not found." });
      return;
    }

    const nextDevices = state.devices.filter((item) => item.id !== deviceId);
    const removedConnections = state.connections.filter((connection) =>
      connection.from.deviceId === deviceId ||
      connection.to.deviceId === deviceId
    );
    pushHistorySnapshot("delete device");
    const nextConnections = state.connections.filter((connection) =>
      connection.from.deviceId !== deviceId &&
      connection.to.deviceId !== deviceId
    );

    deps.refreshCustomGraph(nextDevices, nextConnections);
    deps.dispatch({
      type: "setStatusText",
      text:
        `Deleted ${device.name} and ${removedConnections.length} linked connection(s).`,
    });
  };

  const exportTopologyJson = () => {
    const state = deps.getState();
    const payload = buildExportPayload(state.devices, state.connections);
    return JSON.stringify(payload, null, 2);
  };

  const importCustomTopologyJson = async (text: string) => {
    if (deps.getState().networkId !== deps.customNetworkId) {
      await deps.ensureBuilderMode();
    }

    try {
      const state = deps.getState();
      const parsed = parseImportPayload(text, state.deviceTypes);
      deps.history.clear();
      deps.refreshCustomGraph(parsed.devices, parsed.connections);
      deps.dispatch({
        type: "setStatusText",
        text: "Imported custom topology.",
      });
    } catch (err) {
      deps.dispatch({
        type: "setStatusText",
        text: `Import failed: ${deps.formatStatusError(err)}`,
      });
    }
  };

  const getBuilderDeviceStats = () => ({
    recentDeviceTypeSlugs: deps.builderStats.recentDeviceTypeSlugs,
    frequentDeviceTypeSlugs: getFrequentDeviceTypeSlugs(
      deps.builderStats.frequentDeviceTypeCounts,
    ),
  });

  return {
    addCustomDevice,
    addCustomDeviceAt,
    addCustomContainerAt,
    assignDeviceToContainer,
    connectSelectedDevices,
    deleteSelectedConnection,
    renameCustomDevice,
    changeCustomDeviceType,
    updateCustomDeviceProperties,
    deleteCustomDevice,
    exportTopologyJson,
    importCustomTopologyJson,
    getBuilderDeviceStats,
  };
};
