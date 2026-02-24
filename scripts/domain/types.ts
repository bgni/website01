export type Device = {
  id: string;
  name: string;
  type: string;
  brand: string;
  model: string;
  ports: unknown[];
  deviceTypeSlug?: string;
  [k: string]: unknown;
};

export type ConnectionEnd = {
  deviceId: string;
  portId?: string;
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
