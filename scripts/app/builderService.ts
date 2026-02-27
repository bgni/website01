import type { Connection, DeviceType, NetworkDevice } from "../domain/types.ts";
import { inferDeviceKindFromType } from "../domain/deviceKind.ts";
import {
  DEFAULT_GROUP_BACKGROUND_COLOR,
  DEFAULT_GROUP_LAYOUT,
} from "../domain/groupStyles.ts";
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
  shortlistByKind: Record<string, string>;
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
  groupSelectedDevices: () => void;
  deleteSelectedDevices: () => void;
  assignDeviceToContainer: (
    deviceId: string,
    containerId: string | null,
  ) => void;
  updateContainerGeometry: (
    containerId: string,
    geometry: { x: number; y: number; width: number; height: number },
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
  const buildDeviceTypeDecorations = (
    deviceType: DeviceType,
  ): Record<string, unknown> => ({
    brand: deviceType.brand,
    model: deviceType.model,
    ports: deviceType.ports,
    ...(typeof deviceType.partNumber === "string" && deviceType.partNumber
      ? { partNumber: deviceType.partNumber }
      : {}),
    ...(typeof deviceType.thumbPng === "string" && deviceType.thumbPng
      ? { thumbPng: deviceType.thumbPng }
      : {}),
    ...(typeof deviceType.thumbJpg === "string" && deviceType.thumbJpg
      ? { thumbJpg: deviceType.thumbJpg }
      : {}),
  });

  const pushHistorySnapshot = (label: string) => {
    deps.history.pushUndo(deps.createHistorySnapshot(label));
  };

  const requireCustomMode = (): State | null => {
    const state = deps.getState();
    if (state.networkId === deps.customNetworkId) return state;
    deps.dispatch({
      type: "setStatusText",
      text: "Open editor mode first.",
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
      ...buildDeviceTypeDecorations(deviceType),
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
      groupLayout: DEFAULT_GROUP_LAYOUT,
      groupBackgroundColor: DEFAULT_GROUP_BACKGROUND_COLOR,
    };

    pushHistorySnapshot("add container");
    deps.refreshCustomGraph([...state.devices, container], state.connections, {
      selectedIds: [containerId],
    });
    deps.dispatch({ type: "setStatusText", text: `Added ${container.name}.` });
  };

  const groupSelectedDevices = () => {
    const state = requireCustomMode();
    if (!state) return;

    const selectedDevices = Array.from(state.selected)
      .map((id) => state.devices.find((device) => device.id === id))
      .filter((device): device is NetworkDevice =>
        device !== undefined && !isContainerDevice(device)
      );

    if (!selectedDevices.length) {
      deps.dispatch({
        type: "setStatusText",
        text: "Select one or more devices to group.",
      });
      return;
    }

    const positions = deps.getNodePositions();
    const positioned = selectedDevices.map((device) => {
      const pos = positions.get(device.id);
      const x = Number(pos?.x ?? device.x);
      const y = Number(pos?.y ?? device.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { id: device.id, x, y };
    }).filter((entry): entry is { id: string; x: number; y: number } =>
      entry !== null
    );

    if (!positioned.length) {
      deps.dispatch({
        type: "setStatusText",
        text: "Unable to group selected devices (missing positions).",
      });
      return;
    }

    const minX = Math.min(...positioned.map((p) => p.x));
    const maxX = Math.max(...positioned.map((p) => p.x));
    const minY = Math.min(...positioned.map((p) => p.y));
    const maxY = Math.max(...positioned.map((p) => p.y));

    const paddingX = 70;
    const paddingY = 56;
    const width = Math.max(220, maxX - minX + paddingX * 2);
    const height = Math.max(170, maxY - minY + paddingY * 2);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

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
      width,
      height,
      x: centerX,
      y: centerY,
      groupLayout: DEFAULT_GROUP_LAYOUT,
      groupBackgroundColor: DEFAULT_GROUP_BACKGROUND_COLOR,
    };

    const selectedSet = new Set(positioned.map((p) => p.id));
    const nextDevices = state.devices.map((device) => {
      if (!selectedSet.has(device.id)) return device;
      return {
        ...device,
        containerId,
      };
    });

    pushHistorySnapshot("group selected");
    deps.refreshCustomGraph(
      [...nextDevices, container],
      state.connections,
      { selectedIds: [containerId] },
    );
    deps.dispatch({
      type: "setStatusText",
      text: `Grouped ${positioned.length} device(s) into ${container.name}.`,
    });
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

  const updateContainerGeometry = (
    containerId: string,
    geometry: { x: number; y: number; width: number; height: number },
  ) => {
    const state = requireCustomMode();
    if (!state) return;

    const existing = state.devices.find((device) =>
      device.id === containerId && isContainerDevice(device)
    );
    if (!existing) return;

    const nextX = Number(geometry.x);
    const nextY = Number(geometry.y);
    const nextWidth = Number(geometry.width);
    const nextHeight = Number(geometry.height);
    if (
      !Number.isFinite(nextX) ||
      !Number.isFinite(nextY) ||
      !Number.isFinite(nextWidth) ||
      !Number.isFinite(nextHeight)
    ) {
      return;
    }

    const clampedWidth = Math.max(180, Math.min(2400, Math.round(nextWidth)));
    const clampedHeight = Math.max(120, Math.min(1800, Math.round(nextHeight)));
    const roundedX = Math.round(nextX);
    const roundedY = Math.round(nextY);

    const prevX = Number(existing.x);
    const prevY = Number(existing.y);
    const prevWidth = Number(existing.width);
    const prevHeight = Number(existing.height);
    const unchanged =
      Math.round(Number.isFinite(prevX) ? prevX : roundedX) === roundedX &&
      Math.round(Number.isFinite(prevY) ? prevY : roundedY) === roundedY &&
      Math.round(Number.isFinite(prevWidth) ? prevWidth : clampedWidth) ===
        clampedWidth &&
      Math.round(Number.isFinite(prevHeight) ? prevHeight : clampedHeight) ===
        clampedHeight;
    if (unchanged) return;

    const nextDevices = state.devices.map((device) =>
      device.id === containerId
        ? {
          ...device,
          x: roundedX,
          y: roundedY,
          width: clampedWidth,
          height: clampedHeight,
        }
        : device
    );

    pushHistorySnapshot("update group frame");
    deps.refreshCustomGraph(nextDevices, state.connections, {
      selectedIds: [containerId],
    });
  };

  const deleteSelectedDevices = () => {
    const state = requireCustomMode();
    if (!state) return;

    const selectedIds = Array.from(state.selected);
    if (!selectedIds.length) {
      deps.dispatch({
        type: "setStatusText",
        text: "Select one or more devices to delete.",
      });
      return;
    }

    const selectedSet = new Set(selectedIds);
    const selectedDevices = state.devices.filter((device) =>
      selectedSet.has(device.id)
    );
    if (!selectedDevices.length) {
      deps.dispatch({
        type: "setStatusText",
        text: "Selected devices are no longer available.",
      });
      return;
    }

    const removeIds = new Set(selectedDevices.map((device) => device.id));

    const nextDevices = state.devices
      .filter((device) => !removeIds.has(device.id))
      .map((device) => {
        const containerId = typeof device.containerId === "string"
          ? device.containerId
          : "";
        if (!containerId || !removeIds.has(containerId)) return device;
        const copy = { ...device };
        delete copy.containerId;
        return copy;
      });

    const nextConnections = state.connections.filter((connection) =>
      !removeIds.has(connection.from.deviceId) &&
      !removeIds.has(connection.to.deviceId)
    );

    pushHistorySnapshot(
      selectedDevices.length === 1
        ? "delete device"
        : "delete selected devices",
    );
    deps.refreshCustomGraph(nextDevices, nextConnections);
    deps.dispatch({
      type: "setStatusText",
      text: `Deleted ${selectedDevices.length} device(s).`,
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
    const nextDevices = state.devices.map((device) => {
      if (device.id !== deviceId) return device;
      const base = { ...device } as Record<string, unknown>;
      delete base.brand;
      delete base.model;
      delete base.partNumber;
      delete base.ports;
      delete base.thumbPng;
      delete base.thumbJpg;
      return {
        ...base,
        deviceTypeSlug: slug,
        type: nextTypeText,
        deviceKind: inferDeviceKindFromType(nextTypeText),
        ...buildDeviceTypeDecorations(nextDeviceType),
      } as NetworkDevice;
    });

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
        ...(typeof device.brand === "string" ? { brand: device.brand } : {}),
        ...(typeof device.model === "string" ? { model: device.model } : {}),
        ...(typeof device.partNumber === "string" && device.partNumber
          ? { partNumber: device.partNumber }
          : {}),
        ...(Array.isArray(device.ports) ? { ports: device.ports } : {}),
        ...(typeof device.thumbPng === "string" && device.thumbPng
          ? { thumbPng: device.thumbPng }
          : {}),
        ...(typeof device.thumbJpg === "string" && device.thumbJpg
          ? { thumbJpg: device.thumbJpg }
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
    groupSelectedDevices,
    deleteSelectedDevices,
    assignDeviceToContainer,
    updateContainerGeometry,
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
