import type { Device } from "../domain/types.ts";
import { applyFilter, applySort, paginate } from "../search.ts";
import type { State } from "./types.ts";

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

export const getFilteredDevices = (state: State): Device[] =>
  applySort(
    applyFilter(state.devices, state.filter),
    state.sortKey,
    state.sortDir,
  );

export const getTotalPages = (state: State): number => {
  const results = getFilteredDevices(state);
  return Math.max(1, Math.ceil(results.length / state.pageSize));
};

export const getClampedPage = (state: State): number =>
  clamp(state.page, 1, getTotalPages(state));

export const getPageDevices = (state: State): Device[] => {
  const results = getFilteredDevices(state);
  const page = getClampedPage(state);
  return paginate(results, page, state.pageSize);
};

export const getSelectedDevices = (state: State): Device[] =>
  state.devices.filter((d) => state.selected.has(d.id));
