import type { Action } from "./actions.ts";
import { reduce } from "./reducers.ts";
import type { Dispatch, State, Store, Subscribe } from "./types.ts";

export function createStore(initial: State): Store {
  let current = initial;
  const listeners = new Set<(state: State, action: Action) => void>();

  const getState = () => current;

  const dispatch: Dispatch = (action) => {
    current = reduce(current, action);
    for (const l of listeners) l(current, action);
  };

  const subscribe: Subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return { getState, dispatch, subscribe };
}
