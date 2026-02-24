import type { Connection, Device, TrafficUpdate } from "../domain/types.ts";
import type { SortDir, SortKey } from "../search.ts";
import type { Action } from "./actions.ts";

export type State = {
  networkId: string;
  statusText: string;
  filter: string;
  sortKey: SortKey;
  sortDir: SortDir;
  selected: Set<string>;
  page: number;
  pageSize: number;
  devices: Device[];
  connections: Connection[];
  traffic: TrafficUpdate[];
  trafficVizKind: string;
  layoutKind: string;
};

export type Dispatch = (action: Action) => void;
export type Subscribe = (
  listener: (state: State, action: Action) => void,
) => () => void;

export type Store = {
  getState: () => State;
  dispatch: Dispatch;
  subscribe: Subscribe;
};
