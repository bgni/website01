import type { Connection, NetworkDevice } from "../domain/types.ts";

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
  pushCustomUndoSnapshot: (label: string) => void;
  clearCustomUndo: () => void;
};

export type BuilderIdentityPort = {
  nextUniqueId: (prefix: string, existing: Set<string>) => string;
};

export type BuilderModePort = {
  ensureBuilderMode: () => Promise<void>;
};
