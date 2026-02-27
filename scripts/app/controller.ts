import {
  loadData as defaultLoadData,
  loadJson as defaultLoadJson,
} from "../dataLoader.ts";
import { buildAdjacency } from "../lib/graph/adjacency.ts";
import { createGraph } from "../graph.ts";
import {
  createTrafficConnector,
  parseTrafficConnectorSpec,
} from "../traffic/registry.ts";
import type { Connection, DeviceType, NetworkDevice } from "../domain/types.ts";
import { FixtureValidationError } from "../domain/errors.ts";
import { parseTrafficUpdatesPayload } from "../domain/fixtures.ts";
import { loadDeviceTypeIndex as defaultLoadDeviceTypeIndex } from "../domain/deviceTypes.ts";
import {
  CUSTOM_NETWORK_ID,
  loadCustomTopology,
  saveCustomTopology,
} from "./customTopology.ts";
import {
  DEVICE_KIND_ACCESS_POINT,
  DEVICE_KIND_ROUTER,
  DEVICE_KIND_SERVER,
  DEVICE_KIND_SWITCH,
  DEVICE_KIND_UNKNOWN,
  inferDeviceKindFromType,
} from "../domain/deviceKind.ts";
import {
  type Dispatch,
  getFilteredDevices,
  type State,
  type Store,
} from "./state.ts";
import { createBuilderService } from "./builderService.ts";
import { createCustomHistoryService } from "./historyService.ts";
import { createTrafficService } from "./trafficService.ts";
import { GRAPH_DEFAULTS } from "../config.ts";

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

type ControllerDisplaySettings = {
  edgeOpacity: number;
  labelTextSize: number;
  labelMargin: number;
};

const getNetworkBasePath = (networkId: string) => {
  const DEFAULT_NETWORK_ID = "small-office";
  return `data/networks/${networkId || DEFAULT_NETWORK_ID}`;
};

export type Controller = {
  start: () => Promise<void>;
  loadNetwork: (networkId: string) => Promise<void>;
  startBuilderFromNetwork: (networkId: string) => Promise<void>;
  startBuilderFromBlank: () => Promise<void>;
  enterBuilderMode: () => Promise<void>;
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
    shortlistByKind: Record<string, string>;
  };
  setBuilderShortlistDevice: (kindId: number, slug: string) => void;
  clientPointToGraph: (
    clientX: number,
    clientY: number,
  ) => { x: number; y: number } | null;
  getGraphViewportCenter: () => { x: number; y: number };
  setTrafficSourceKind: (kind: string) => Promise<void>;
  setFlowSpeedMultiplier: (multiplier: number) => Promise<void>;
  setDisplaySettings: (settings: ControllerDisplaySettings) => void;
  setLayoutKind: (kind: string) => void;
  setTrafficVizKind: (kind: string) => void;
  clearSelection: () => void;
  dispatch: Dispatch;
};

type ZoomTransformSnapshot = { x: number; y: number; k: number };

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

  let adjacency: Adjacency = {};
  let graph: ReturnType<typeof createGraph> | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let trafficSpeedMultiplier = 1;
  let displaySettings: ControllerDisplaySettings = {
    edgeOpacity: 1,
    labelTextSize: GRAPH_DEFAULTS.label.fontSize,
    labelMargin: GRAPH_DEFAULTS.label.yOffset,
  };
  let onConnectionDragCreate:
    | ((fromDeviceId: string, toDeviceId: string) => Promise<void>)
    | null = null;
  let onDeviceDropOnContainer:
    | ((deviceId: string, containerId: string | null) => Promise<void>)
    | null = null;
  let onContainerGeometryCommit:
    | ((containerId: string, geometry: {
      x: number;
      y: number;
      width: number;
      height: number;
    }) => void)
    | null = null;
  const builderStats = {
    recentDeviceTypeSlugs: [] as string[],
    frequentDeviceTypeCounts: {} as Record<string, number>,
    shortlistByKind: {} as Record<string, string>,
  };
  const customHistory = createCustomHistoryService();

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
      recentDeviceTypeSlugs: builderStats.recentDeviceTypeSlugs,
      frequentDeviceTypeCounts: builderStats.frequentDeviceTypeCounts,
      shortlistByKind: builderStats.shortlistByKind,
    });
  };

  const hydrateBuilderStatsFromStorage = (
    deviceTypes: Record<string, DeviceType>,
  ) => {
    const customTopology = loadCustomTopology(storage, deviceTypes);
    builderStats.recentDeviceTypeSlugs = customTopology.recentDeviceTypeSlugs;
    builderStats.frequentDeviceTypeCounts =
      customTopology.frequentDeviceTypeCounts;
    builderStats.shortlistByKind = customTopology.shortlistByKind;
    return customTopology;
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

  const createHistorySnapshot = (label: string) => {
    const state = store.getState();
    return {
      devices: cloneDevices(state.devices),
      connections: cloneConnections(state.connections),
      label,
    };
  };

  const clearCustomUndo = () => {
    customHistory.clear();
  };

  const updateGraphFromState = (state: State) => {
    if (!graph) return;
    const filteredIds = new Set(getFilteredDevices(state).map((d) => d.id));
    graph.update({ filteredIds, selected: state.selected });
  };

  store.subscribe((state) => {
    updateGraphFromState(state);
  });

  const trafficService = createTrafficService({
    dispatch,
    loadJson,
    doFetch,
    formatStatusError,
    onGraphResetTraffic: () => graph?.resetTraffic?.(),
    onGraphUpdateTraffic: (updates) => graph?.updateTraffic(updates),
    onGraphRefreshFromState: () => updateGraphFromState(store.getState()),
    createTrafficConnectorFn: createTrafficConnector,
    parseTrafficConnectorSpecFn: parseTrafficConnectorSpec,
    parseTrafficUpdatesPayloadFn: parseTrafficUpdatesPayload,
  });

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
      onSelectionReplaced: (ids: string[]) => setSelection(ids),
      onConnectionDragCreate: (fromDeviceId: string, toDeviceId: string) => {
        void onConnectionDragCreate?.(fromDeviceId, toDeviceId);
      },
      onConnectionSelect: (
        _connectionId: string,
        fromDeviceId: string,
        toDeviceId: string,
      ) => {
        const fromId = fromDeviceId.trim();
        const toId = toDeviceId.trim();
        if (!fromId || !toId) return;
        setSelection([fromId, toId]);
      },
      onDeviceDropOnContainer: (
        deviceId: string,
        containerId: string | null,
      ) => {
        void onDeviceDropOnContainer?.(deviceId, containerId);
      },
      onContainerGeometryCommit: (
        containerId: string,
        geometry: { x: number; y: number; width: number; height: number },
      ) => {
        onContainerGeometryCommit?.(containerId, geometry);
      },
    });

    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(() => {
      if (!graph) return;
      graph.resize(getSvgSize(graphSvg));
    });
    resizeObserver.observe(graphSvg);

    const state = store.getState();
    graph.setDisplaySettings(displaySettings);
    graph.setTrafficVisualization(state.trafficVizKind);
    graph.setTrafficSpeedMultiplier(trafficSpeedMultiplier);
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

  const openCustomTopology = async (
    devices: NetworkDevice[],
    connections: Connection[],
    statusText: string,
  ) => {
    clearCustomUndo();
    trafficService.teardown();
    trafficService.setCurrentPaths(null);
    destroyGraph();
    trafficService.resetTrafficState();

    const deviceTypes = await ensureDeviceTypesLoaded();
    hydrateBuilderStatsFromStorage(deviceTypes);

    const nextDevices = cloneDevices(devices);
    const nextConnections = cloneConnections(connections);
    dispatch({ type: "setNetworkId", networkId: CUSTOM_NETWORK_ID });
    dispatch({
      type: "networkLoaded",
      devices: nextDevices,
      connections: nextConnections,
      deviceTypes,
    });
    mountGraph(nextDevices, nextConnections);
    persistCustomTopology(nextDevices, nextConnections);
    dispatch({ type: "setStatusText", text: statusText });
  };

  const builderService = createBuilderService({
    getState: () => store.getState(),
    dispatch,
    customNetworkId: CUSTOM_NETWORK_ID,
    builderStats,
    nextUniqueId,
    getNodePositions: () => graph?.getNodePositions() ?? new Map(),
    getViewportCenter: () => graph?.getViewportCenter() ?? null,
    refreshCustomGraph,
    history: customHistory,
    createHistorySnapshot,
    ensureBuilderMode: async () => {
      await loadNetwork(CUSTOM_NETWORK_ID);
    },
    formatStatusError,
  });

  const loadNetwork = async (networkId: string) => {
    try {
      clearCustomUndo();
      trafficService.teardown();
      destroyGraph();

      dispatch({ type: "setNetworkId", networkId });
      trafficService.resetTrafficState();

      if (networkId === CUSTOM_NETWORK_ID) {
        trafficService.setCurrentPaths(null);
        const deviceTypes = await ensureDeviceTypesLoaded();
        const customTopology = hydrateBuilderStatsFromStorage(deviceTypes);

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
      trafficService.setCurrentPaths({ basePath, trafficPath });

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

      // Traffic is optional. Startup failures should not tear down a successfully
      // loaded topology view.
      await trafficService.restartCurrentSource(
        store.getState().trafficSourceKind,
      );
    } catch (err) {
      trafficService.teardown();
      destroyGraph();

      trafficService.resetTrafficState();
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

  const startBuilderFromNetwork = async (networkId: string) => {
    const sourceNetworkId = networkId.trim();
    if (!sourceNetworkId || sourceNetworkId === CUSTOM_NETWORK_ID) {
      await enterBuilderMode();
      return;
    }

    try {
      const state = store.getState();
      if (state.networkId === sourceNetworkId) {
        await openCustomTopology(
          state.devices,
          state.connections,
          `Editing local copy of ${sourceNetworkId}.`,
        );
        return;
      }

      const basePath = getNetworkBasePath(sourceNetworkId);
      const { devices, connections } = await loadData({
        basePath,
        includeTraffic: false,
      });
      await openCustomTopology(
        devices,
        connections,
        `Editing local copy of ${sourceNetworkId}.`,
      );
    } catch (err) {
      dispatch({
        type: "setStatusText",
        text: `Editor start failed: ${formatStatusError(err)}`,
      });
      console.error("Failed to open builder from source network.", err);
    }
  };

  const startBuilderFromBlank = async () => {
    try {
      await openCustomTopology([], [], "New empty topology ready.");
    } catch (err) {
      dispatch({
        type: "setStatusText",
        text: `Editor start failed: ${formatStatusError(err)}`,
      });
      console.error("Failed to start blank topology.", err);
    }
  };

  const connectDevicesByDrag = async (
    fromDeviceId: string,
    toDeviceId: string,
  ) => {
    const fromId = fromDeviceId.trim();
    const toId = toDeviceId.trim();
    if (!fromId || !toId || fromId === toId) return;

    let state = store.getState();
    if (state.networkId !== CUSTOM_NETWORK_ID) {
      const sourceNetworkId = state.networkId.trim();
      if (!sourceNetworkId || sourceNetworkId === CUSTOM_NETWORK_ID) return;
      await startBuilderFromNetwork(sourceNetworkId);
      state = store.getState();
      if (state.networkId !== CUSTOM_NETWORK_ID) return;
    }

    const hasFromDevice = state.devices.some((device) => device.id === fromId);
    const hasToDevice = state.devices.some((device) => device.id === toId);
    if (!hasFromDevice || !hasToDevice) return;

    setSelection([fromId, toId]);
    builderService.connectSelectedDevices();
  };
  onConnectionDragCreate = connectDevicesByDrag;

  const assignDeviceToContainerByDrag = async (
    deviceId: string,
    containerId: string | null,
  ) => {
    const draggedId = deviceId.trim();
    if (!draggedId) return;

    let state = store.getState();
    if (state.networkId !== CUSTOM_NETWORK_ID) {
      const sourceNetworkId = state.networkId.trim();
      if (!sourceNetworkId || sourceNetworkId === CUSTOM_NETWORK_ID) return;
      await startBuilderFromNetwork(sourceNetworkId);
      state = store.getState();
      if (state.networkId !== CUSTOM_NETWORK_ID) return;
    }

    const hasDevice = state.devices.some((device) => device.id === draggedId);
    if (!hasDevice) return;

    const nextContainerId = containerId?.trim() ? containerId.trim() : null;
    if (nextContainerId) {
      const container = state.devices.find((device) =>
        device.id === nextContainerId && device.isContainer === true
      );
      if (!container) return;
    }

    builderService.assignDeviceToContainer(draggedId, nextContainerId);
  };
  onDeviceDropOnContainer = assignDeviceToContainerByDrag;

  const commitContainerGeometry = (
    containerId: string,
    geometry: { x: number; y: number; width: number; height: number },
  ) => {
    builderService.updateContainerGeometry(containerId, geometry);
  };
  onContainerGeometryCommit = commitContainerGeometry;

  const addCustomDevice = (deviceTypeSlug: string) => {
    builderService.addCustomDevice(deviceTypeSlug);
  };

  const addCustomDeviceAt = (
    deviceTypeSlug: string,
    position: { x: number; y: number },
  ) => {
    builderService.addCustomDeviceAt(deviceTypeSlug, position);
  };

  const addCustomContainerAt = (position: { x: number; y: number }) => {
    builderService.addCustomContainerAt(position);
  };

  const groupSelectedDevices = () => {
    builderService.groupSelectedDevices();
  };

  const deleteSelectedDevices = () => {
    builderService.deleteSelectedDevices();
  };

  const assignDeviceToContainer = (
    deviceId: string,
    containerId: string | null,
  ) => {
    builderService.assignDeviceToContainer(deviceId, containerId);
  };

  const connectSelectedDevices = () => {
    builderService.connectSelectedDevices();
  };

  const deleteSelectedConnection = () => {
    builderService.deleteSelectedConnection();
  };

  const renameCustomDevice = (deviceId: string, nextName: string) => {
    builderService.renameCustomDevice(deviceId, nextName);
  };

  const changeCustomDeviceType = (
    deviceId: string,
    nextDeviceTypeSlug: string,
  ) => {
    builderService.changeCustomDeviceType(deviceId, nextDeviceTypeSlug);
  };

  const updateCustomDeviceProperties = (
    deviceId: string,
    propertiesJsonText: string,
  ) => {
    builderService.updateCustomDeviceProperties(deviceId, propertiesJsonText);
  };

  const deleteCustomDevice = (deviceId: string) => {
    builderService.deleteCustomDevice(deviceId);
  };

  const exportTopologyJson = () => builderService.exportTopologyJson();

  const importCustomTopologyJson = async (text: string) => {
    await builderService.importCustomTopologyJson(text);
  };

  const getBuilderDeviceStats = () => {
    const stats = builderService.getBuilderDeviceStats();
    return {
      ...stats,
      shortlistByKind: { ...builderStats.shortlistByKind },
    };
  };

  const setBuilderShortlistDevice = (kindId: number, slug: string) => {
    const nextSlug = slug.trim();
    if (!nextSlug) return;
    const kindKey = String(kindId);
    const state = store.getState();
    const deviceType = state.deviceTypes[nextSlug];
    if (!deviceType) return;
    const inferredKind = inferDeviceKindFromType(
      `${deviceType.slug} ${deviceType.model}`,
    );
    if (inferredKind !== kindId) return;

    if (builderStats.shortlistByKind[kindKey] === nextSlug) return;
    builderStats.shortlistByKind = {
      ...builderStats.shortlistByKind,
      [kindKey]: nextSlug,
    };
    const kindLabel = (() => {
      switch (kindId) {
        case DEVICE_KIND_SWITCH:
          return "switch";
        case DEVICE_KIND_ROUTER:
          return "router";
        case DEVICE_KIND_SERVER:
          return "server";
        case DEVICE_KIND_ACCESS_POINT:
          return "access point";
        case DEVICE_KIND_UNKNOWN:
          return "other";
        default:
          return "device";
      }
    })();
    const topologyToPersist = state.networkId === CUSTOM_NETWORK_ID
      ? { devices: state.devices, connections: state.connections }
      : loadCustomTopology(storage, state.deviceTypes);
    persistCustomTopology(
      topologyToPersist.devices,
      topologyToPersist.connections,
    );
    dispatch({
      type: "setStatusText",
      text:
        `Updated default ${kindLabel} model to ${deviceType.brand} ${deviceType.model}.`,
    });
  };

  const clientPointToGraph = (clientX: number, clientY: number) =>
    graph?.clientPointToGraph(clientX, clientY) ?? null;

  const getGraphViewportCenter = () =>
    graph?.getViewportCenter() ?? { x: 600, y: 360 };

  const canUndoCustomEdit = () =>
    store.getState().networkId === CUSTOM_NETWORK_ID &&
    customHistory.canUndo();

  const canRedoCustomEdit = () =>
    store.getState().networkId === CUSTOM_NETWORK_ID &&
    customHistory.canRedo();

  const undoLastCustomEdit = () => {
    const state = store.getState();
    if (state.networkId !== CUSTOM_NETWORK_ID) {
      dispatch({
        type: "setStatusText",
        text: "Open editor mode first.",
      });
      return;
    }

    const previous = customHistory.undo();
    if (!previous) {
      dispatch({ type: "setStatusText", text: "Nothing to undo." });
      return;
    }

    customHistory.pushRedo({
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
        text: "Open editor mode first.",
      });
      return;
    }

    const next = customHistory.redo();
    if (!next) {
      dispatch({ type: "setStatusText", text: "Nothing to redo." });
      return;
    }

    customHistory.pushUndoFromRedo({
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
    await trafficService.restartCurrentSource(kind);
  };

  const setFlowSpeedMultiplier = async (multiplier: number) => {
    trafficSpeedMultiplier = Number.isFinite(multiplier) && multiplier > 0
      ? multiplier
      : 1;
    trafficService.setSpeedMultiplier(trafficSpeedMultiplier);
    graph?.setTrafficSpeedMultiplier(trafficSpeedMultiplier);
    await trafficService.restartCurrentSource(
      store.getState().trafficSourceKind,
    );
  };

  const setDisplaySettings = (settings: ControllerDisplaySettings) => {
    displaySettings = {
      edgeOpacity: Number.isFinite(settings.edgeOpacity) &&
          settings.edgeOpacity > 0
        ? settings.edgeOpacity
        : 1,
      labelTextSize: Number.isFinite(settings.labelTextSize) &&
          settings.labelTextSize > 0
        ? settings.labelTextSize
        : GRAPH_DEFAULTS.label.fontSize,
      labelMargin: Number.isFinite(settings.labelMargin) &&
          settings.labelMargin > 0
        ? settings.labelMargin
        : GRAPH_DEFAULTS.label.yOffset,
    };
    graph?.setDisplaySettings(displaySettings);
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
    startBuilderFromNetwork,
    startBuilderFromBlank,
    enterBuilderMode,
    addCustomDevice,
    addCustomDeviceAt,
    addCustomContainerAt,
    groupSelectedDevices,
    deleteSelectedDevices,
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
    setBuilderShortlistDevice,
    clientPointToGraph,
    getGraphViewportCenter,
    setTrafficSourceKind,
    setFlowSpeedMultiplier,
    setDisplaySettings,
    setLayoutKind,
    setTrafficVizKind,
    clearSelection,
    dispatch,
  };
}
