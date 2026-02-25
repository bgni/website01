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
  type Dispatch,
  getFilteredDevices,
  type State,
  type Store,
} from "./state.ts";
import { createBuilderService } from "./builderService.ts";
import { createCustomHistoryService } from "./historyService.ts";
import { createTrafficService } from "./trafficService.ts";

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
  const builderStats = {
    recentDeviceTypeSlugs: [] as string[],
    frequentDeviceTypeCounts: {} as Record<string, number>,
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

    customHistory.pushUndo({
      devices: cloneDevices(state.devices),
      connections: cloneConnections(state.connections),
      label,
    });
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

  const builderService = createBuilderService({
    getState: () => store.getState(),
    dispatch,
    customNetworkId: CUSTOM_NETWORK_ID,
    builderStats,
    nextUniqueId,
    getNodePositions: () => graph?.getNodePositions() ?? new Map(),
    getViewportCenter: () => graph?.getViewportCenter() ?? null,
    refreshCustomGraph,
    pushCustomUndoSnapshot,
    clearCustomUndo,
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
        const customTopology = loadCustomTopology(storage, deviceTypes);
        builderStats.recentDeviceTypeSlugs =
          customTopology.recentDeviceTypeSlugs;
        builderStats.frequentDeviceTypeCounts =
          customTopology.frequentDeviceTypeCounts;

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

      await trafficService.startForCurrentSource(
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

  const getBuilderDeviceStats = () => builderService.getBuilderDeviceStats();

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
        text: "Open Create/Edit mode first.",
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
        text: "Open Create/Edit mode first.",
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
