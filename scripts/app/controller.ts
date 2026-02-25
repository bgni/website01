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
import type { DeviceType, TrafficUpdate } from "../domain/types.ts";
import { FixtureValidationError } from "../domain/errors.ts";
import { parseTrafficUpdatesPayload } from "../domain/fixtures.ts";
import {
  createAddedDevice,
  createConnectionUsingFirstPorts,
} from "./networkEdit.ts";
import {
  type Dispatch,
  getFilteredDevices,
  type State,
  type Store,
} from "./state.ts";

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

type ControllerDeps = {
  loadData?: LoadDataFn;
  loadJson?: LoadJsonFn;
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
  addDevice: (name: string, type?: string) => void;
  connectDevices: (fromId: string, toId: string) => void;
  setTrafficSourceKind: (kind: string) => Promise<void>;
  setLayoutKind: (kind: string) => void;
  setTrafficVizKind: (kind: string) => void;
  clearSelection: () => void;
  dispatch: Dispatch;
};

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
  const doFetch = deps?.fetch ?? fetch;
  const storage = deps?.storage;
  const networkEditStoragePrefix = "website01.networkEdits.v1.";

  const loadJsonOptional = async (path: string): Promise<unknown | null> => {
    const res = await doFetch(path);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to load ${path}`);
    return await res.json();
  };

  let adjacency: Adjacency = {};
  let graph: ReturnType<typeof createGraph> | null = null;
  let currentNetworkId = "";
  let currentDevices: State["devices"] = [];
  let currentConnections: State["connections"] = [];
  let currentDeviceTypes: Record<string, DeviceType> = {};
  let stopTraffic: StopTraffic = () => {};
  const trafficByConn = new Map<string, TrafficUpdate>();
  let resizeObserver: ResizeObserver | null = null;
  let currentTrafficPaths: { basePath: string; trafficPath: string } | null =
    null;

  const getSvgSize = (svg: SVGSVGElement) => {
    const rect = svg.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
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

  const loadPersistedNetworkEdits = (
    networkId: string,
  ):
    | { devices: State["devices"]; connections: State["connections"] }
    | null => {
    if (!storage) return null;
    try {
      const raw = storage.getItem(`${networkEditStoragePrefix}${networkId}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      const rec = parsed as Record<string, unknown>;
      if (rec.v !== 1) return null;
      const devices = Array.isArray(rec.devices) ? rec.devices : null;
      const connections = Array.isArray(rec.connections)
        ? rec.connections
        : null;
      if (!devices || !connections) return null;
      return {
        devices: devices as State["devices"],
        connections: connections as State["connections"],
      };
    } catch {
      return null;
    }
  };

  const persistNetworkEdits = () => {
    if (!storage || !currentNetworkId) return;
    try {
      storage.setItem(
        `${networkEditStoragePrefix}${currentNetworkId}`,
        JSON.stringify({
          v: 1,
          devices: currentDevices,
          connections: currentConnections,
        }),
      );
    } catch {
      // Ignore storage errors.
    }
  };

  const renderCurrentNetwork = () => {
    destroyGraph();
    dispatch({
      type: "networkLoaded",
      devices: currentDevices,
      connections: currentConnections,
      deviceTypes: currentDeviceTypes,
    });

    adjacency = buildAdjacency(currentConnections) as Adjacency;
    graph = createGraph({
      svg: graphSvg,
      devices: currentDevices,
      connections: currentConnections,
      adjacency,
      onNodeSelect: (id: string) => dispatch({ type: "toggleSelect", id }),
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
    graph.updateTraffic(Array.from(trafficByConn.values()));
    updateGraphFromState(state);
  };

  const loadNetwork = async (networkId: string) => {
    try {
      stopTraffic?.();
      stopTraffic = () => {};
      destroyGraph();

      dispatch({ type: "setNetworkId", networkId });
      resetTrafficState();

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

      currentNetworkId = networkId;
      currentDeviceTypes = deviceTypes;
      const persisted = loadPersistedNetworkEdits(networkId);
      currentDevices = persisted?.devices ?? devicesOut;
      currentConnections = persisted?.connections ?? connectionsOut;
      renderCurrentNetwork();

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

  const addDevice = (name: string, type = "other") => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      dispatch({ type: "setStatusText", text: "Device name is required." });
      return;
    }
    currentDevices = [
      ...currentDevices,
      createAddedDevice({ name: trimmedName, type, devices: currentDevices }),
    ];
    persistNetworkEdits();
    renderCurrentNetwork();
    dispatch({ type: "setStatusText", text: "" });
  };

  const connectDevices = (fromId: string, toId: string) => {
    const out = createConnectionUsingFirstPorts({
      fromId,
      toId,
      devices: currentDevices,
      connections: currentConnections,
      deviceTypes: currentDeviceTypes,
    });
    if (!out.connection) {
      dispatch({
        type: "setStatusText",
        text: out.error ?? "Unable to connect devices.",
      });
      return;
    }
    currentConnections = [...currentConnections, out.connection];
    persistNetworkEdits();
    renderCurrentNetwork();
    dispatch({ type: "setStatusText", text: "" });
  };

  const start = async () => {
    await loadNetwork(store.getState().networkId);
  };

  return {
    start,
    loadNetwork,
    addDevice,
    connectDevices,
    setTrafficSourceKind,
    setLayoutKind,
    setTrafficVizKind,
    clearSelection,
    dispatch,
  };
}
