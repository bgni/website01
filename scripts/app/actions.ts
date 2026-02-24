import type { SortDir, SortKey } from "../search.ts";
import type { Connection, Device, TrafficUpdate } from "../domain/types.ts";

export type Action =
  | { type: "setNetworkId"; networkId: string }
  | { type: "setStatusText"; text: string }
  | { type: "networkLoaded"; devices: Device[]; connections: Connection[] }
  | { type: "setFilter"; filter: string }
  | { type: "clearFilter" }
  | { type: "setSort"; sortKey: SortKey; sortDir: SortDir }
  | { type: "toggleSelect"; id: string; forceOn?: boolean }
  | { type: "clearSelection" }
  | { type: "prevPage" }
  | { type: "nextPage" }
  | { type: "setPageSize"; pageSize: number }
  | { type: "setTraffic"; traffic: TrafficUpdate[] }
  | { type: "resetTraffic" }
  | { type: "setTrafficVizKind"; kind: string }
  | { type: "setLayoutKind"; kind: string };
