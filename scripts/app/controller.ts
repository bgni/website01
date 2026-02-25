import {
  loadData as defaultLoadData,
  loadJson as defaultLoadJson,
} from "../dataLoader.ts";
import { buildAdjacency } from "../lib/graph/adjacency.ts";
import { createGraph } from "../graph.ts";
import {
  createTrafficConnector,
  parseTrafficConnectorSpec,
  type TrafficConnectorKind,
} from "../traffic/registry.ts";
import type { StopTraffic } from "../traffic/types.ts";
import type {
  Connection,
  DeviceType,
  NetworkDevice,
  TrafficUpdate,
} from "../domain/types.ts";
import { FixtureValidationError } from "../domain/errors.ts";
import { parseTrafficUpdatesPayload } from "../domain/fixtures.ts";
import { loadDeviceTypeIndex as defaultLoadDeviceTypeIndex } from "../domain/deviceTypes.ts";
import { inferDeviceKindFromType } from "../domain/deviceKind.ts";
import {
  buildExportPayload,
  CUSTOM_NETWORK_ID,
  getFrequentDeviceTypeSlugs,
  loadCustomTopology,
  parseImportPayload,
  saveCustomTopology,
  trackRecentDeviceType,
} from "./customTopology.ts";
import {
  type Dispatch,
  getFilteredDevices,
  type State,
  type Store,
} from "./state.ts";
import {
  choosePortPair,
  computeNewDevicePosition,
  getFreeLinkablePorts,
  isContainerDevice,
  pruneConnectionsForDeviceType,
  stripManagedDeviceFields,
} from "./customBuilderUtils.ts";

type Adjacency = Record<
  string,
  Array<{ neighbor: string; connectionId: string }>
>;

const formatStatusError = (err: unknown): string => {
  if (err instanceof FixtureValidationError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
};

type LoadDataFn = typeof defaultLoadData;
type LoadJsonFn = typeof defaultLoadJson;
type LoadDeviceTypeIndexFn = typeof defaultLoadDeviceTypeIndex;

type ControllerDeps = {
  loadData?: LoadDataFn;
  loadJson?: LoadJsonFn;
  loadDeviceTypeIndex?: LoadDeviceTypeIndexFn;
  fetch?: typeof fetch;
  storage?: Storage;
};

const getNetworkBasePath = (networkId: string) => {
  const DEFAULT_NETWORK_ID = "small-office";
  return `data/networks/${networkId || DEFAULT_NETWORK_ID}`;
};

export type Controller = {
  start: () => Promise<void>;
  loadNetwork: (networkId: string) => Promise<void>;
  enterBuilderMode: () => Promise<void>;
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
  undoLastCustomEdit: () => void;
  redoLastCustomEdit: () => void;
  canUndoCustomEdit: () => boolean;
  canRedoCustomEdit: () => boolean;
  exportTopologyJson: () => string;
  importCustomTopologyJson: (text: string) => Promise<void>;
  getBuilderDeviceStats: () => {
    recentDeviceTypeSlugs: string[];
    frequentDeviceTypeSlugs: string[];
  };
  setTrafficSourceKind: (kind: string) => Promise<void>;
  setLayoutKind: (kind: string) => void;
  setTrafficVizKind: (kind: string) => void;
  clearSelection: () => void;
  dispatch: Dispatch;
};

type CustomUndoSnapshot = {
  devices: NetworkDevice[];
  connections: Connection[];
  label: string;
};

type ZoomTransformSnapshot = { x: number; y: number; k: number };

const isTrafficConnectorKind = (v: string): v is TrafficConnectorKind =>
  v === "flow" || v === "generated" || v === "static" || v === "real" ||
  v === "timeline";

export function createController(
  {
    store,
    dispatch,
    graphSvg,
    deps,
  }: {
    store: Store;
    dispatch: Dispatch;
    graphSvg: SVGSVGElement;
    deps?: ControllerDeps;
  },
): Controller {
  const loadData = deps?.loadData ?? defaultLoadData;
  const loadJson = deps?.loadJson ?? defaultLoadJson;
  const loadDeviceTypeIndex = deps?.loadDeviceTypeIndex ??
    defaultLoadDeviceTypeIndex;
  const doFetch = deps?.fetch ?? fetch;
  const storage = deps?.storage;

  const loadJsonOptional = async (path: string): Promise<unknown | null> => {
    const res = await doFetch(path);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to load ${path}`);
    return await res.json();
  };

  let adjacency: Adjacency = {};
  let graph: ReturnType<typeof createGraph> | null = null;
  let stopTraffic: StopTraffic = () => {};
  const trafficByConn = new Map<string, TrafficUpdate>();
  let resizeObserver: ResizeObserver | null = null;
  let currentTrafficPaths: { basePath: string; trafficPath: string } | null =
    null;
  let recentDeviceTypeSlugs: string[] = [];
  let frequentDeviceTypeCounts: Record<string, number> = {};
  let customUndoStack: CustomUndoSnapshot[] = [];
  let customRedoStack: CustomUndoSnapshot[] = [];

  const getSvgSize = (svg: SVGSVGElement) => {
    const rect = svg.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  };

  const nextUniqueId = (
    prefix: string,
    existing: Set<string>,
  ): string => {
    let index = existing.size + 1;
    let candidate = `${prefix}-${index}`;
    while (existing.has(candidate)) {
      index += 1;
      candidate = `${prefix}-${index}`;
    }
    return candidate;
  };

  const ensureDeviceTypesLoaded = async (): Promise<
    Record<string, DeviceType>
  > => {
    const current = store.getState().deviceTypes;
    if (Object.keys(current).length > 0) return current;
    return await loadDeviceTypeIndex({
      indexPath: "data/netbox-device-types.json",
    });
  };

  const persistCustomTopology = (
    devices: NetworkDevice[],
    connections: Connection[],
  ) => {
    saveCustomTopology(storage, {
      devices,
      connections,
      recentDeviceTypeSlugs,
      frequentDeviceTypeCounts,
    });
  };

  const cloneDevices = (devices: NetworkDevice[]): NetworkDevice[] =>
    devices.map((device) => ({ ...device }));

  const cloneConnections = (connections: Connection[]): Connection[] =>
    connections.map((connection) => ({
      ...connection,
      from: { ...connection.from },
      to: { ...connection.to },
    }));

  const setSelection = (ids: string[]) => {
    dispatch({ type: "clearSelection" });
    ids.forEach((id) => dispatch({ type: "toggleSelect", id, forceOn: true }));
  };

  const getCustomGraphSnapshot = () => {
    if (!graph || store.getState().networkId !== CUSTOM_NETWORK_ID) {
      return {
        positions: new Map<string, { x: number; y: number }>(),
        viewport: null as ZoomTransformSnapshot | null,
      };
    }

    return {
      positions: graph.getNodePositions(),
      viewport: graph.getViewportTransform(),
    };
  };

  const withPosition = (
    device: NetworkDevice,
    position: { x: number; y: number } | null,
  ): NetworkDevice => {
    if (!position) return device;
    return {
      ...device,
      x: position.x,
      y: position.y,
    };
  };

  const preserveDevicePositions = (
    devices: NetworkDevice[],
    positions: Map<string, { x: number; y: number }>,
  ): NetworkDevice[] =>
    devices.map((device) => {
      const stored = positions.get(device.id);
      if (!stored) return device;
      return withPosition(device, stored);
    });

  const pushCustomUndoSnapshot = (label: string) => {
    const state = store.getState();
    if (state.networkId !== CUSTOM_NETWORK_ID) return;

    customRedoStack = [];
    customUndoStack.push({
      devices: cloneDevices(state.devices),
      connections: cloneConnections(state.connections),
      label,
    });

    if (customUndoStack.length > 20) {
      customUndoStack = customUndoStack.slice(customUndoStack.length - 20);
    }
  };

  const clearCustomUndo = () => {
    customUndoStack = [];
    customRedoStack = [];
  };

  const updateGraphFromState = (state: State) => {
    if (!graph) return;
    const filteredIds = new Set(getFilteredDevices(state).map((d) => d.id));
    graph.update({ filteredIds, selected: state.selected });
  };

  store.subscribe((state) => {
    updateGraphFromState(state);
  });

  const resetTrafficState = () => {
    trafficByConn.clear();
    dispatch({ type: "resetTraffic" });
    graph?.resetTraffic?.();
  };

  const attachTraffic = (trafficUpdates: unknown) => {
    let updates: TrafficUpdate[] = [];
    try {
      updates = parseTrafficUpdatesPayload(trafficUpdates);
      dispatch({ type: "setStatusText", text: "" });
    } catch (err) {
      dispatch({
        type: "setStatusText",
        text: `Traffic payload invalid: ${formatStatusError(err)}`,
      });
      console.warn("Invalid traffic payload.", err);
      return;
    }
    updates.forEach((t) => {
      const prev = trafficByConn.get(t.connectionId) || {
        connectionId: t.connectionId,
      };
      trafficByConn.set(t.connectionId, { ...prev, ...t });
    });

    const traffic = Array.from(trafficByConn.values());
    dispatch({ type: "setTraffic", traffic });
    if (graph) graph.updateTraffic(updates);

    // Force re-style of links based on latest traffic.
    updateGraphFromState(store.getState());
  };

  const startTrafficConnector = async (
    {
      basePath,
      trafficPath,
      sourceKind,
    }: {
      basePath: string;
      trafficPath: string;
      sourceKind: string;
    },
  ): Promise<StopTraffic> => {
    // Optional connector config per network.
    const connectorPath = `${basePath}/traffic.connector.json`;
    const connector = await loadJsonOptional(connectorPath);

    const parsed = parseTrafficConnectorSpec(connector);
    const spec = sourceKind === "default"
      ? parsed
      : (isTrafficConnectorKind(sourceKind) ? { kind: sourceKind } : parsed);
    const trafficConnector = await createTrafficConnector(spec, {
      basePath,
      trafficPath,
      loadJson,
    });

    return trafficConnector.start(attachTraffic);
  };

  const destroyGraph = () => {
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (graph?.destroy) graph.destroy();
    graph = null;
  };

  const mountGraph = (
    devices: NetworkDevice[],
    connections: Connection[],
    viewportTransform: ZoomTransformSnapshot | null = null,
  ) => {
    adjacency = buildAdjacency(connections) as Adjacency;

    graph = createGraph({
      svg: graphSvg,
      devices,
      connections,
      adjacency,
      onNodeSelect: (id: string) => dispatch({ type: "toggleSelect", id }),
      onCanvasDeselect: () => dispatch({ type: "clearSelection" }),
    });

    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(() => {
      if (!graph) return;
      graph.resize(getSvgSize(graphSvg));
    });
    resizeObserver.observe(graphSvg);

    const state = store.getState();
    graph.setTrafficVisualization(state.trafficVizKind);
    graph.setLayout(state.layoutKind);
    graph.resize(getSvgSize(graphSvg));
    graph.setViewportTransform(viewportTransform);
    updateGraphFromState(state);
  };

  const refreshCustomGraph = (
    devices: NetworkDevice[],
    connections: Connection[],
    options?: { selectedIds?: string[] },
  ) => {
    const snapshot = getCustomGraphSnapshot();
    const positionedDevices = preserveDevicePositions(
      devices,
      snapshot.positions,
    );

    dispatch({ type: "setTopology", devices: positionedDevices, connections });

    if (options?.selectedIds) {
      setSelection(options.selectedIds);
    }

    destroyGraph();
    mountGraph(positionedDevices, connections, snapshot.viewport);
    persistCustomTopology(positionedDevices, connections);
  };

  const loadNetwork = async (networkId: string) => {
    try {
      clearCustomUndo();
      stopTraffic?.();
      stopTraffic = () => {};
      destroyGraph();

      dispatch({ type: "setNetworkId", networkId });
      resetTrafficState();

      if (networkId === CUSTOM_NETWORK_ID) {
        currentTrafficPaths = null;
        const deviceTypes = await ensureDeviceTypesLoaded();
        const customTopology = loadCustomTopology(storage, deviceTypes);
        recentDeviceTypeSlugs = customTopology.recentDeviceTypeSlugs;
        frequentDeviceTypeCounts = customTopology.frequentDeviceTypeCounts;

        dispatch({
          type: "networkLoaded",
          devices: customTopology.devices,
          connections: customTopology.connections,
          deviceTypes,
        });

        mountGraph(customTopology.devices, customTopology.connections);
        dispatch({ type: "setStatusText", text: "Custom topology ready." });
        return;
      }

      const basePath = getNetworkBasePath(networkId);
      const trafficPath = `${basePath}/traffic.json`;
      currentTrafficPaths = { basePath, trafficPath };

      const {
        devices: devicesOut,
        connections: connectionsOut,
        deviceTypes,
      } = await loadData(
        {
          basePath,
          includeTraffic: false,
        },
      );

      dispatch({
        type: "networkLoaded",
        devices: devicesOut,
        connections: connectionsOut,
        deviceTypes,
      });
      mountGraph(devicesOut, connectionsOut);

      stopTraffic = await startTrafficConnector({
        basePath,
        trafficPath,
        sourceKind: store.getState().trafficSourceKind,
      });
      dispatch({ type: "setStatusText", text: "" });
    } catch (err) {
      stopTraffic?.();
      stopTraffic = () => {};
      destroyGraph();
      currentTrafficPaths = null;

      resetTrafficState();
      dispatch({
        type: "setStatusText",
        text: `Load failed: ${formatStatusError(err)}`,
      });
      console.error("Failed to load network.", err);
    }
  };

  const enterBuilderMode = async () => {
    await loadNetwork(CUSTOM_NETWORK_ID);
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

  const addCustomDeviceInternal = (
    deviceTypeSlug: string,
    preferredPosition: { x: number; y: number } | null,
  ) => {
    const state = store.getState();
    if (state.networkId !== CUSTOM_NETWORK_ID) {
      dispatch({
        type: "setStatusText",
        text: "Open Create/Edit mode first.",
      });
      return;
    }

    const slug = deviceTypeSlug.trim();
    if (!slug) {
      dispatch({ type: "setStatusText", text: "Choose a device type first." });
      return;
    }

    const deviceType = state.deviceTypes[slug];
    if (!deviceType) {
      dispatch({
        type: "setStatusText",
        text: `Unknown device type '${slug}'.`,
      });
      return;
    }

    const ids = new Set(state.devices.map((d) => d.id));
    const deviceId = nextUniqueId("custom-device", ids);
    const sameTypeCount = state.devices.filter((d) => d.deviceTypeSlug === slug)
      .length;
    const name = `${deviceType.model} ${sameTypeCount + 1}`;
    const typeText = `${deviceType.slug} ${deviceType.model}`;

    const selectedIds = Array.from(state.selected);
    const selectedAnchor = selectedIds.length === 1
      ? (state.devices.find((d) => d.id === selectedIds[0]) ?? null)
      : null;
    const graphSnapshot = getCustomGraphSnapshot();
    const selectedAnchorPosition = selectedAnchor
      ? (graphSnapshot.positions.get(selectedAnchor.id) ?? null)
      : null;
    const viewportCenter = graph ? graph.getViewportCenter() : null;
    const computedPosition = computeNewDevicePosition({
      selectedAnchor,
      selectedAnchorPosition,
      viewportCenter,
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
      recentDeviceTypeSlugs,
      frequentDeviceTypeCounts,
      slug,
    );
    recentDeviceTypeSlugs = tracked.recentDeviceTypeSlugs;
    frequentDeviceTypeCounts = tracked.frequentDeviceTypeCounts;

    pushCustomUndoSnapshot("add device");
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
        const connectionId = nextUniqueId("custom-connection", connectionIds);
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

    refreshCustomGraph(nextDevices, nextConnections, {
      selectedIds: [device.id],
    });
    dispatch({ type: "setStatusText", text: statusText });
  };

  const addCustomContainerAt = (position: { x: number; y: number }) => {
    const state = store.getState();
    if (state.networkId !== CUSTOM_NETWORK_ID) {
      dispatch({
        type: "setStatusText",
        text: "Open Create/Edit mode first.",
      });
      return;
    }

    const ids = new Set(state.devices.map((d) => d.id));
    const containerId = nextUniqueId("custom-container", ids);
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

    pushCustomUndoSnapshot("add container");
    refreshCustomGraph([...state.devices, container], state.connections, {
      selectedIds: [containerId],
    });
    dispatch({ type: "setStatusText", text: `Added ${container.name}.` });
  };

  const assignDeviceToContainer = (
    deviceId: string,
    containerId: string | null,
  ) => {
    const state = store.getState();
    if (state.networkId !== CUSTOM_NETWORK_ID) {
      dispatch({
        type: "setStatusText",
        text: "Open Create/Edit mode first.",
      });
      return;
    }

    const device = state.devices.find((d) => d.id === deviceId);
    if (!device) {
      dispatch({ type: "setStatusText", text: "Device not found." });
      return;
    }
    if (isContainerDevice(device)) {
      dispatch({
        type: "setStatusText",
        text: "Containers cannot be assigned to another container.",
      });
      return;
    }

    const nextContainerId = containerId?.trim() ? containerId.trim() : null;
    if (nextContainerId) {
      const container = state.devices.find((d) => d.id === nextContainerId);
      if (!container || !isContainerDevice(container)) {
        dispatch({
          type: "setStatusText",
          text: "Container not found.",
        });
        return;
      }
    }

    if ((device.containerId as string | undefined) === nextContainerId) return;

    pushCustomUndoSnapshot("assign to container");
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

    refreshCustomGraph(nextDevices, state.connections, {
      selectedIds: [deviceId],
    });
    dispatch({
      type: "setStatusText",
      text: nextContainerId
        ? `Assigned ${device.name} to container.`
        : `Removed ${device.name} from container.`,
    });
  };

  const connectSelectedDevices = () => {
    const state = store.getState();
    if (state.networkId !== CUSTOM_NETWORK_ID) {
      dispatch({
        type: "setStatusText",
        text: "Open Create/Edit mode first.",
      });
      return;
    }

    const selectedIds = Array.from(state.selected);
    if (selectedIds.length !== 2) {
      dispatch({
        type: "setStatusText",
        text: "Select exactly 2 devices to connect.",
      });
      return;
    }

    const fromDevice = state.devices.find((d) => d.id === selectedIds[0]);
    const toDevice = state.devices.find((d) => d.id === selectedIds[1]);
    if (!fromDevice || !toDevice) {
      dispatch({
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
      dispatch({
        type: "setStatusText",
        text: "No compatible free ports found on one or both devices.",
      });
      return;
    }

    const connectionIds = new Set(state.connections.map((c) => c.id));
    const connectionId = nextUniqueId("custom-connection", connectionIds);

    pushCustomUndoSnapshot("connect devices");
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

    refreshCustomGraph(state.devices, nextConnections);
    dispatch({
      type: "setStatusText",
      text:
        `Connected ${fromDevice.name}:${pair.fromInterfaceId} → ${toDevice.name}:${pair.toInterfaceId}.`,
    });
  };

  const deleteSelectedConnection = () => {
    const state = store.getState();
    if (state.networkId !== CUSTOM_NETWORK_ID) {
      dispatch({
        type: "setStatusText",
        text: "Open Create/Edit mode first.",
      });
      return;
    }

    const selectedIds = Array.from(state.selected);
    if (selectedIds.length !== 2) {
      dispatch({
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
      dispatch({
        type: "setStatusText",
        text: "No connection exists between selected devices.",
      });
      return;
    }

    pushCustomUndoSnapshot("delete connection");
    const removeIds = new Set(toRemove.map((connection) => connection.id));
    const nextConnections = state.connections.filter((connection) =>
      !removeIds.has(connection.id)
    );
    refreshCustomGraph(state.devices, nextConnections);
    dispatch({
      type: "setStatusText",
      text:
        `Deleted ${toRemove.length} connection(s) between selected devices.`,
    });
  };

  const renameCustomDevice = (deviceId: string, nextName: string) => {
    const state = store.getState();
    if (state.networkId !== CUSTOM_NETWORK_ID) {
      dispatch({
        type: "setStatusText",
        text: "Open Create/Edit mode first.",
      });
      return;
    }

    const trimmed = nextName.trim();
    if (!trimmed) {
      dispatch({
        type: "setStatusText",
        text: "Device name cannot be empty.",
      });
      return;
    }

    const existing = state.devices.find((device) => device.id === deviceId);
    if (!existing) {
      dispatch({
        type: "setStatusText",
        text: "Device not found.",
      });
      return;
    }

    if (existing.name === trimmed) return;

    pushCustomUndoSnapshot("rename device");
    const nextDevices = state.devices.map((device) =>
      device.id === deviceId ? { ...device, name: trimmed } : device
    );
    refreshCustomGraph(nextDevices, state.connections);
    dispatch({ type: "setStatusText", text: `Renamed device to ${trimmed}.` });
  };

  const changeCustomDeviceType = (
    deviceId: string,
    nextDeviceTypeSlug: string,
  ) => {
    const state = store.getState();
    if (state.networkId !== CUSTOM_NETWORK_ID) {
      dispatch({
        type: "setStatusText",
        text: "Open Create/Edit mode first.",
      });
      return;
    }

    const slug = nextDeviceTypeSlug.trim();
    if (!slug) {
      dispatch({
        type: "setStatusText",
        text: "Choose a device type.",
      });
      return;
    }

    const nextDeviceType = state.deviceTypes[slug];
    if (!nextDeviceType) {
      dispatch({
        type: "setStatusText",
        text: `Unknown device type '${slug}'.`,
      });
      return;
    }

    const existing = state.devices.find((device) => device.id === deviceId);
    if (!existing) {
      dispatch({ type: "setStatusText", text: "Device not found." });
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

    pushCustomUndoSnapshot("change device type");
    refreshCustomGraph(nextDevices, nextConnections, {
      selectedIds: [deviceId],
    });

    const baseText =
      `Updated ${existing.name} to ${nextDeviceType.brand} ${nextDeviceType.model}.`;
    dispatch({
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
    const state = store.getState();
    if (state.networkId !== CUSTOM_NETWORK_ID) {
      dispatch({
        type: "setStatusText",
        text: "Open Create/Edit mode first.",
      });
      return;
    }

    const existing = state.devices.find((device) => device.id === deviceId);
    if (!existing) {
      dispatch({ type: "setStatusText", text: "Device not found." });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(propertiesJsonText);
    } catch {
      dispatch({
        type: "setStatusText",
        text: "Properties must be valid JSON object.",
      });
      return;
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      dispatch({
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

    pushCustomUndoSnapshot("update device properties");
    refreshCustomGraph(nextDevices, state.connections, {
      selectedIds: [deviceId],
    });
    dispatch({
      type: "setStatusText",
      text: `Updated properties for ${existing.name}.`,
    });
  };

  const deleteCustomDevice = (deviceId: string) => {
    const state = store.getState();
    if (state.networkId !== CUSTOM_NETWORK_ID) {
      dispatch({
        type: "setStatusText",
        text: "Open Create/Edit mode first.",
      });
      return;
    }

    const device = state.devices.find((item) => item.id === deviceId);
    if (!device) {
      dispatch({ type: "setStatusText", text: "Device not found." });
      return;
    }

    const nextDevices = state.devices.filter((item) => item.id !== deviceId);
    const removedConnections = state.connections.filter((connection) =>
      connection.from.deviceId === deviceId ||
      connection.to.deviceId === deviceId
    );
    pushCustomUndoSnapshot("delete device");
    const nextConnections = state.connections.filter((connection) =>
      connection.from.deviceId !== deviceId &&
      connection.to.deviceId !== deviceId
    );

    refreshCustomGraph(nextDevices, nextConnections);
    dispatch({
      type: "setStatusText",
      text:
        `Deleted ${device.name} and ${removedConnections.length} linked connection(s).`,
    });
  };

  const exportTopologyJson = () => {
    const state = store.getState();
    const payload = buildExportPayload(state.devices, state.connections);
    return JSON.stringify(payload, null, 2);
  };

  const importCustomTopologyJson = async (text: string) => {
    if (store.getState().networkId !== CUSTOM_NETWORK_ID) {
      await enterBuilderMode();
    }

    try {
      const state = store.getState();
      const parsed = parseImportPayload(text, state.deviceTypes);
      clearCustomUndo();
      refreshCustomGraph(parsed.devices, parsed.connections);
      dispatch({ type: "setStatusText", text: "Imported custom topology." });
    } catch (err) {
      dispatch({
        type: "setStatusText",
        text: `Import failed: ${formatStatusError(err)}`,
      });
    }
  };

  const getBuilderDeviceStats = () => ({
    recentDeviceTypeSlugs,
    frequentDeviceTypeSlugs: getFrequentDeviceTypeSlugs(
      frequentDeviceTypeCounts,
    ),
  });

  const canUndoCustomEdit = () =>
    store.getState().networkId === CUSTOM_NETWORK_ID &&
    customUndoStack.length > 0;

  const canRedoCustomEdit = () =>
    store.getState().networkId === CUSTOM_NETWORK_ID &&
    customRedoStack.length > 0;

  const undoLastCustomEdit = () => {
    const state = store.getState();
    if (state.networkId !== CUSTOM_NETWORK_ID) {
      dispatch({
        type: "setStatusText",
        text: "Open Create/Edit mode first.",
      });
      return;
    }

    const previous = customUndoStack.pop();
    if (!previous) {
      dispatch({ type: "setStatusText", text: "Nothing to undo." });
      return;
    }

    customRedoStack.push({
      devices: cloneDevices(state.devices),
      connections: cloneConnections(state.connections),
      label: previous.label,
    });

    refreshCustomGraph(previous.devices, previous.connections);
    dispatch({
      type: "setStatusText",
      text: `Undid ${previous.label}.`,
    });
  };

  const redoLastCustomEdit = () => {
    const state = store.getState();
    if (state.networkId !== CUSTOM_NETWORK_ID) {
      dispatch({
        type: "setStatusText",
        text: "Open Create/Edit mode first.",
      });
      return;
    }

    const next = customRedoStack.pop();
    if (!next) {
      dispatch({ type: "setStatusText", text: "Nothing to redo." });
      return;
    }

    customUndoStack.push({
      devices: cloneDevices(state.devices),
      connections: cloneConnections(state.connections),
      label: next.label,
    });

    refreshCustomGraph(next.devices, next.connections);
    dispatch({
      type: "setStatusText",
      text: `Redid ${next.label}.`,
    });
  };

  const setLayoutKind = (kind: string) => {
    dispatch({ type: "setLayoutKind", kind });
    if (graph?.setLayout) graph.setLayout(kind);
    updateGraphFromState(store.getState());
  };

  const setTrafficSourceKind = async (kind: string) => {
    dispatch({ type: "setTrafficSourceKind", kind });
    const paths = currentTrafficPaths;
    if (!paths) return;

    stopTraffic?.();
    stopTraffic = () => {};
    resetTrafficState();

    try {
      stopTraffic = await startTrafficConnector({
        basePath: paths.basePath,
        trafficPath: paths.trafficPath,
        sourceKind: kind,
      });
      dispatch({ type: "setStatusText", text: "" });
    } catch (err) {
      stopTraffic = () => {};
      dispatch({
        type: "setStatusText",
        text: `Traffic source failed: ${formatStatusError(err)}`,
      });
      console.error("Failed to start traffic source.", err);
    }
  };

  const setTrafficVizKind = (kind: string) => {
    dispatch({ type: "setTrafficVizKind", kind });
    if (graph?.setTrafficVisualization) graph.setTrafficVisualization(kind);
    updateGraphFromState(store.getState());
  };

  const clearSelection = () => {
    dispatch({ type: "clearSelection" });
    updateGraphFromState(store.getState());
  };

  const start = async () => {
    await loadNetwork(store.getState().networkId);
  };

  return {
    start,
    loadNetwork,
    enterBuilderMode,
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
    undoLastCustomEdit,
    redoLastCustomEdit,
    canUndoCustomEdit,
    canRedoCustomEdit,
    exportTopologyJson,
    importCustomTopologyJson,
    getBuilderDeviceStats,
    setTrafficSourceKind,
    setLayoutKind,
    setTrafficVizKind,
    clearSelection,
    dispatch,
  };
}
