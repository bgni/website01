import type { SortDir, SortKey } from "../search.ts";
import type {
  Connection,
  DeviceType,
  NetworkDevice,
  TrafficUpdate,
} from "../domain/types.ts";

export type Action =
  | { type: "setNetworkId"; networkId: string }
  | { type: "setStatusText"; text: string }
  | {
    type: "networkLoaded";
    devices: NetworkDevice[];
    connections: Connection[];
    deviceTypes: Record<string, DeviceType>;
  }
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
  | { type: "setTrafficSourceKind"; kind: string }
  | { type: "setTrafficVizKind"; kind: string }
  | { type: "setLayoutKind"; kind: string };
