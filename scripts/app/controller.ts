import { loadData, loadJson } from "../dataLoader.ts";
import { buildAdjacency } from "../lib/graph/adjacency.ts";
import { createGraph } from "../graph.ts";
import {
  createFlowTrafficConnector,
  createGeneratedTrafficConnector,
  createRealTrafficConnector,
  createStaticTrafficConnector,
  createTimelineTrafficConnector,
  type StopTraffic,
} from "../trafficConnector.ts";
import type { TrafficUpdate } from "../domain/types.ts";
import { FixtureValidationError } from "../domain/errors.ts";
import { parseTrafficUpdatesPayload } from "../domain/fixtures.ts";
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

const asRecord = (v: unknown): Record<string, unknown> | null => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
};

const formatStatusError = (err: unknown): string => {
  if (err instanceof FixtureValidationError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
};

const loadJsonOptional = async (path: string): Promise<unknown | null> => {
  const res = await fetch(path);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return await res.json();
};

const getNetworkBasePath = (networkId: string) => {
  const DEFAULT_NETWORK_ID = "small-office";
  return `data/networks/${networkId || DEFAULT_NETWORK_ID}`;
};

export type Controller = {
  start: () => Promise<void>;
  loadNetwork: (networkId: string) => Promise<void>;
  setLayoutKind: (kind: string) => void;
  setTrafficVizKind: (kind: string) => void;
  clearSelection: () => void;
  dispatch: Dispatch;
};

export function createController(
  { store, dispatch }: { store: Store; dispatch: Dispatch },
): Controller {
  let adjacency: Adjacency = {};
  let graph: ReturnType<typeof createGraph> | null = null;
  let stopTraffic: StopTraffic = () => {};
  const trafficByConn = new Map<string, TrafficUpdate>();

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
    { basePath, trafficPath }: { basePath: string; trafficPath: string },
  ): Promise<StopTraffic> => {
    // Optional connector config per network.
    const connectorPath = `${basePath}/traffic.connector.json`;
    const connector = await loadJsonOptional(connectorPath);

    const connectorRec = asRecord(connector);
    const kind = typeof connectorRec?.kind === "string"
      ? connectorRec.kind
      : null;

    if (kind === "flow") {
      const configPath = typeof connectorRec?.configPath === "string"
        ? connectorRec.configPath
        : "traffic.flow.json";
      const full = `${basePath}/${configPath}`;
      const config = await loadJson(full);

      const connections = await loadJson(`${basePath}/connections.json`);
      const connectionTypes = await loadJson("data/connectionTypes.json");

      const flow = createFlowTrafficConnector({
        config,
        connections,
        connectionTypes,
      });
      return flow.start(attachTraffic);
    }

    if (kind === "generated") {
      const configPath = typeof connectorRec?.configPath === "string"
        ? connectorRec.configPath
        : "traffic.generator.json";
      const full = `${basePath}/${configPath}`;
      const config = await loadJson(full);
      const generator = createGeneratedTrafficConnector({
        config,
      });
      return generator.start(attachTraffic);
    }

    if (kind === "static") {
      const configPath = typeof connectorRec?.configPath === "string"
        ? connectorRec.configPath
        : "traffic.json";
      const full = `${basePath}/${configPath}`;
      const source = await loadJson(full);
      const staticConn = createStaticTrafficConnector({ source });
      return staticConn.start(attachTraffic);
    }

    if (kind === "real") {
      const url = typeof connectorRec?.url === "string"
        ? connectorRec.url
        : trafficPath;
      const intervalMs = typeof connectorRec?.intervalMs === "number"
        ? connectorRec.intervalMs
        : 5000;
      const real = createRealTrafficConnector({ url, intervalMs });
      return real.start(attachTraffic);
    }

    if (kind === "timeline") {
      const configPath = typeof connectorRec?.configPath === "string"
        ? connectorRec.configPath
        : "traffic.json";
      const full = `${basePath}/${configPath}`;
      const source = await loadJson(full);
      const tl = createTimelineTrafficConnector({ timeline: source });
      return tl.start(attachTraffic);
    }

    // Default behavior: if traffic.json is a timeline, play it; otherwise poll it.
    const source = await loadJson(trafficPath);
    const sourceRec = asRecord(source);
    if (sourceRec && Array.isArray(sourceRec.initial)) {
      const tl = createTimelineTrafficConnector({ timeline: sourceRec });
      return tl.start(attachTraffic);
    }
    const real = createRealTrafficConnector({
      url: trafficPath,
      intervalMs: 5000,
    });
    return real.start(attachTraffic);
  };

  const destroyGraph = () => {
    if (graph?.destroy) graph.destroy();
    graph = null;
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

      adjacency = buildAdjacency(connectionsOut) as Adjacency;

      graph = createGraph({
        devices: devicesOut,
        connections: connectionsOut,
        adjacency,
        onNodeSelect: (id: string) => dispatch({ type: "toggleSelect", id }),
      });

      const state = store.getState();
      graph.setTrafficVisualization(state.trafficVizKind);
      graph.setLayout(state.layoutKind);
      updateGraphFromState(state);

      stopTraffic = await startTrafficConnector({ basePath, trafficPath });
      dispatch({ type: "setStatusText", text: "" });
    } catch (err) {
      stopTraffic?.();
      stopTraffic = () => {};
      destroyGraph();

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
    setLayoutKind,
    setTrafficVizKind,
    clearSelection,
    dispatch,
  };
}
