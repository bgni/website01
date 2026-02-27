import type { TrafficUpdate } from "../domain/types.ts";
import type {
  TrafficConnectorKind,
  TrafficConnectorSpec,
} from "../traffic/registry.ts";
import type {
  TrafficConnectorPort,
  TrafficGraphPort,
  TrafficLoadPort,
} from "./ports.ts";
import type { Dispatch } from "./types.ts";

type StopTraffic = () => void;

const isTrafficConnectorKind = (v: string): v is TrafficConnectorKind =>
  v === "flow" || v === "generated" || v === "static" || v === "real" ||
  v === "timeline";

export type TrafficPaths = { basePath: string; trafficPath: string };

type TrafficServiceDeps =
  & {
    dispatch: Dispatch;
    formatStatusError: (err: unknown) => string;
  }
  & TrafficLoadPort
  & TrafficGraphPort
  & TrafficConnectorPort;

export type TrafficService = {
  teardown: () => void;
  setCurrentPaths: (paths: TrafficPaths | null) => void;
  setSpeedMultiplier: (multiplier: number) => void;
  resetTrafficState: () => void;
  startForCurrentSource: (sourceKind: string) => Promise<void>;
  restartCurrentSource: (sourceKind: string) => Promise<void>;
};

const normalizeSpeedMultiplier = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.max(0.1, Math.min(64, value));
};

export const createTrafficService = (
  deps: TrafficServiceDeps,
): TrafficService => {
  const doFetch = deps.doFetch ?? fetch;
  const createTrafficConnectorImpl = deps.createTrafficConnectorFn;
  const parseTrafficConnectorSpecImpl = deps.parseTrafficConnectorSpecFn;
  const parseTrafficUpdatesPayloadImpl = deps.parseTrafficUpdatesPayloadFn;

  let stopTraffic: StopTraffic = () => {};
  let currentPaths: TrafficPaths | null = null;
  const trafficByConn = new Map<string, TrafficUpdate>();
  let speedMultiplier = 1;

  const loadJsonOptional = async (path: string): Promise<unknown | null> => {
    const res = await doFetch(path);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to load ${path}`);
    return await res.json();
  };

  const resetTrafficState = () => {
    trafficByConn.clear();
    deps.dispatch({ type: "resetTraffic" });
    deps.onGraphResetTraffic();
  };

  const attachTraffic = (trafficUpdates: unknown) => {
    let updates: TrafficUpdate[] = [];
    try {
      updates = parseTrafficUpdatesPayloadImpl(trafficUpdates);
      deps.dispatch({ type: "setStatusText", text: "" });
    } catch (err) {
      deps.dispatch({
        type: "setStatusText",
        text: `Traffic payload invalid: ${deps.formatStatusError(err)}`,
      });
      return;
    }

    updates.forEach((t) => {
      const prev = trafficByConn.get(t.connectionId) || {
        connectionId: t.connectionId,
      };
      trafficByConn.set(t.connectionId, { ...prev, ...t });
    });

    deps.dispatch({
      type: "setTraffic",
      traffic: Array.from(trafficByConn.values()),
    });
    deps.onGraphUpdateTraffic(updates);
    deps.onGraphRefreshFromState();
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
    const connectorPath = `${basePath}/traffic.connector.json`;
    const connector = await loadJsonOptional(connectorPath);

    const parsed = parseTrafficConnectorSpecImpl(connector);
    const spec: TrafficConnectorSpec | null = sourceKind === "default"
      ? parsed
      : (isTrafficConnectorKind(sourceKind) ? { kind: sourceKind } : parsed);

    const trafficConnector = await createTrafficConnectorImpl(spec, {
      basePath,
      trafficPath,
      loadJson: deps.loadJson,
      speedMultiplier,
    });

    return trafficConnector.start(attachTraffic);
  };

  const setCurrentPaths = (paths: TrafficPaths | null) => {
    currentPaths = paths;
  };

  const setSpeedMultiplier = (multiplier: number) => {
    speedMultiplier = normalizeSpeedMultiplier(multiplier);
  };

  const teardown = () => {
    stopTraffic?.();
    stopTraffic = () => {};
    currentPaths = null;
  };

  const startForCurrentSource = async (sourceKind: string) => {
    if (!currentPaths) return;
    stopTraffic = await startTrafficConnector({
      basePath: currentPaths.basePath,
      trafficPath: currentPaths.trafficPath,
      sourceKind,
    });
    deps.dispatch({ type: "setStatusText", text: "" });
  };

  const restartCurrentSource = async (sourceKind: string) => {
    if (!currentPaths) return;

    stopTraffic?.();
    stopTraffic = () => {};
    resetTrafficState();

    try {
      await startForCurrentSource(sourceKind);
    } catch (err) {
      stopTraffic = () => {};
      deps.dispatch({
        type: "setStatusText",
        text: `Traffic source failed: ${deps.formatStatusError(err)}`,
      });
    }
  };

  return {
    teardown,
    setCurrentPaths,
    setSpeedMultiplier,
    resetTrafficState,
    startForCurrentSource,
    restartCurrentSource,
  };
};
