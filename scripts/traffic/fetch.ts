import type { FetchJson } from "./types.ts";
import { isObject } from "./util.ts";

export const defaultFetchJson: FetchJson = async (path: string) => {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
};

export const coerceTrafficPayload = (data: unknown): unknown => {
  if (Array.isArray(data)) return data;
  if (isObject(data) && Array.isArray(data.initial)) return data;
  return null;
};
