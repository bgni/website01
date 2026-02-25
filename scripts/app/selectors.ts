import type { DeviceTypePort, NetworkDevice } from "../domain/types.ts";
import { applyFilter, applySort, paginate } from "../search.ts";
import type { State } from "./types.ts";

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

export type ResolvedNetworkDevice = NetworkDevice & {
  brand: string;
  model: string;
  ports: DeviceTypePort[];
  thumbPng?: string;
  thumbJpg?: string;
  partNumber?: string;
};

const resolveDevice = (
  state: State,
  d: NetworkDevice,
): ResolvedNetworkDevice => {
  const deviceType = d.deviceTypeSlug
    ? state.deviceTypes[d.deviceTypeSlug]
    : undefined;

  return {
    ...d,
    brand: deviceType?.brand ?? "",
    model: deviceType?.model ?? "",
    partNumber: deviceType?.partNumber,
    ports: deviceType?.ports ?? [],
    thumbPng: deviceType?.thumbPng,
    thumbJpg: deviceType?.thumbJpg,
  };
};

export const getFilteredDevices = (state: State): ResolvedNetworkDevice[] =>
  applySort(
    applyFilter(
      state.devices.map((d) => resolveDevice(state, d)),
      state.filter,
    ),
    state.sortKey,
    state.sortDir,
  );

export const getTotalPages = (state: State): number => {
  const results = getFilteredDevices(state);
  return Math.max(1, Math.ceil(results.length / state.pageSize));
};

export const getClampedPage = (state: State): number =>
  clamp(state.page, 1, getTotalPages(state));

export const getPageDevices = (state: State): ResolvedNetworkDevice[] => {
  const results = getFilteredDevices(state);
  const page = getClampedPage(state);
  return paginate(results, page, state.pageSize);
};

export const getSelectedDevices = (state: State): ResolvedNetworkDevice[] =>
  state.devices
    .filter((d) => state.selected.has(d.id))
    .map((d) => resolveDevice(state, d));
