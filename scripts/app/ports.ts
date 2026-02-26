import type { Connection, NetworkDevice } from "../domain/types.ts";
import type { CustomHistorySnapshot } from "./historyService.ts";

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
