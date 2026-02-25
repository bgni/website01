import type { Connection, NetworkDevice } from "../domain/types.ts";

export type CustomHistorySnapshot = {
  devices: NetworkDevice[];
  connections: Connection[];
  label: string;
};

export type CustomHistoryService = {
  clear: () => void;
  pushUndo: (snapshot: CustomHistorySnapshot) => void;
  pushUndoFromRedo: (snapshot: CustomHistorySnapshot) => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  undo: () => CustomHistorySnapshot | null;
  redo: () => CustomHistorySnapshot | null;
  pushRedo: (snapshot: CustomHistorySnapshot) => void;
};

export const createCustomHistoryService = (
  { maxSnapshots = 20 }: { maxSnapshots?: number } = {},
): CustomHistoryService => {
  let undoStack: CustomHistorySnapshot[] = [];
  let redoStack: CustomHistorySnapshot[] = [];

  const clear = () => {
    undoStack = [];
    redoStack = [];
  };

  const pushUndo = (snapshot: CustomHistorySnapshot) => {
    redoStack = [];
    undoStack.push(snapshot);

    if (undoStack.length > maxSnapshots) {
      undoStack = undoStack.slice(undoStack.length - maxSnapshots);
    }
  };

  const pushUndoFromRedo = (snapshot: CustomHistorySnapshot) => {
    undoStack.push(snapshot);

    if (undoStack.length > maxSnapshots) {
      undoStack = undoStack.slice(undoStack.length - maxSnapshots);
    }
  };

  const canUndo = () => undoStack.length > 0;
  const canRedo = () => redoStack.length > 0;

  const undo = (): CustomHistorySnapshot | null => {
    const snapshot = undoStack.pop();
    return snapshot ?? null;
  };

  const redo = (): CustomHistorySnapshot | null => {
    const snapshot = redoStack.pop();
    return snapshot ?? null;
  };

  const pushRedo = (snapshot: CustomHistorySnapshot) => {
    redoStack.push(snapshot);
  };

  return {
    clear,
    pushUndo,
    pushUndoFromRedo,
    canUndo,
    canRedo,
    undo,
    redo,
    pushRedo,
  };
};
