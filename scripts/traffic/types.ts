import type { TrafficUpdate } from "../domain/types.ts";

export type { TrafficUpdate };

export type TrafficTimeline = {
  initial?: TrafficUpdate[];
  updates?: Array<TrafficUpdate & { t?: number; offset?: number }>;
};

export type TrafficPayload = unknown;
export type OnTrafficUpdate = (payload: TrafficPayload) => void;
export type StopTraffic = () => void;

export type FetchJson = (path: string) => Promise<unknown>;
