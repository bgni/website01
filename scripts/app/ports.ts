import type { Connection, NetworkDevice } from "../domain/types.ts";
import type { TrafficUpdate } from "../domain/types.ts";
import type { CustomHistorySnapshot } from "./historyService.ts";
import type { TrafficConnectorSpec } from "../traffic/registry.ts";

export type BuilderGraphPort = {
  getNodePositions: () => Map<string, { x: number; y: number }>;
  getViewportCenter: () => { x: number; y: number } | null;
  refreshCustomGraph: (
    devices: NetworkDevice[],
    connections: Connection[],
    options?: { selectedIds?: string[] },
  ) => void;
};

export type BuilderHistoryPort = {
  history: {
    pushUndo: (snapshot: CustomHistorySnapshot) => void;
    clear: () => void;
  };
  createHistorySnapshot: (label: string) => CustomHistorySnapshot;
};

export type BuilderIdentityPort = {
  nextUniqueId: (prefix: string, existing: Set<string>) => string;
};

export type BuilderModePort = {
  ensureBuilderMode: () => Promise<void>;
};

export type TrafficLoadPort = {
  loadJson: (path: string) => Promise<unknown>;
  doFetch?: typeof fetch;
};

export type TrafficGraphPort = {
  onGraphResetTraffic: () => void;
  onGraphUpdateTraffic: (updates: TrafficUpdate[]) => void;
  onGraphRefreshFromState: () => void;
};

export type TrafficConnectorPort = {
  createTrafficConnectorFn: (
    spec: TrafficConnectorSpec | null,
    args: {
      basePath: string;
      trafficPath: string;
      loadJson: (path: string) => Promise<unknown>;
    },
  ) => Promise<{
    start: (onUpdate: (payload: unknown) => void) => () => void;
  }>;
  parseTrafficConnectorSpecFn: (raw: unknown) => TrafficConnectorSpec | null;
  parseTrafficUpdatesPayloadFn: (payload: unknown) => TrafficUpdate[];
};
