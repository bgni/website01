import type { DeviceKind } from "./deviceKind.ts";
export type { DeviceKind } from "./deviceKind.ts";

export type NetworkDevice = {
  id: string;
  name: string;
  type: string;
  deviceKind: DeviceKind;
  deviceTypeSlug?: string;
  [k: string]: unknown;
};

// Normalized interface type buckets (derived at the boundary from NetBox-ish strings).
// Unknown/unmodeled types are represented as 'unsupported' and are allowed to exist
// in catalogs, but links that reference them are rejected at load time.
export type InterfaceType =
  | "eth-100m"
  | "eth-1g"
  | "eth-2.5g"
  | "eth-5g"
  | "eth-10g"
  | "eth-25g"
  | "eth-40g"
  | "eth-50g"
  | "eth-100g"
  | "wifi"
  | "unsupported";

export type DeviceTypePort = {
  id: string;
  kind?: string;
  type?: string;
  interfaceType?: InterfaceType;
  mgmtOnly?: boolean;
  [k: string]: unknown;
};

// Device type (capabilities/catalog entry). Today this is backed by
// `data/netbox-device-types.json` (generated from the NetBox devicetype-library).
export type DeviceType = {
  id: string;
  slug: string;
  brand: string;
  model: string;
  partNumber?: string;
  ports: DeviceTypePort[];
  thumbPng?: string;
  thumbJpg?: string;
  [k: string]: unknown;
};

export type ConnectionEnd = {
  deviceId: string;
  interfaceId?: string;
  [k: string]: unknown;
};

export type Connection = {
  id: string;
  from: ConnectionEnd;
  to: ConnectionEnd;
  [k: string]: unknown;
};

export type TrafficUpdate = {
  connectionId: string;
  status?: string;
  rateMbps?: number;
  utilization?: number;
  [k: string]: unknown;
};
