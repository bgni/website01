import type { Action } from "./actions.ts";
import type { State } from "./types.ts";
import { getClampedPage } from "./selectors.ts";

export const reduce = (state: State, action: Action): State => {
  switch (action.type) {
    case "setNetworkId": {
      return {
        ...state,
        networkId: action.networkId,
        statusText: "",
        filter: "",
        page: 1,
        selected: new Set<string>(),
        traffic: [],
      };
    }
    case "setStatusText": {
      return { ...state, statusText: action.text };
    }
    case "setTopology": {
      const selected = new Set(
        Array.from(state.selected).filter((id) =>
          action.devices.some((d) => d.id === id)
        ),
      );
      const next: State = {
        ...state,
        devices: action.devices,
        connections: action.connections,
        selected,
        page: 1,
      };
      return { ...next, page: getClampedPage(next) };
    }
    case "networkLoaded": {
      const next: State = {
        ...state,
        statusText: "",
        devices: action.devices,
        connections: action.connections,
        deviceTypes: action.deviceTypes,
        page: 1,
        selected: new Set<string>(),
        traffic: [],
      };
      return { ...next, page: getClampedPage(next) };
    }
    case "setFilter": {
      const next = { ...state, filter: action.filter, page: 1 };
      return { ...next, page: getClampedPage(next) };
    }
    case "clearFilter": {
      const next = { ...state, filter: "", page: 1 };
      return { ...next, page: getClampedPage(next) };
    }
    case "setSort": {
      const next = {
        ...state,
        sortKey: action.sortKey,
        sortDir: action.sortDir,
        page: 1,
      };
      return { ...next, page: getClampedPage(next) };
    }
    case "toggleSelect": {
      const selected = new Set(state.selected);
      if (action.forceOn) selected.add(action.id);
      else if (selected.has(action.id)) selected.delete(action.id);
      else selected.add(action.id);
      return { ...state, selected };
    }
    case "clearSelection": {
      return { ...state, selected: new Set<string>() };
    }
    case "prevPage": {
      const next = { ...state, page: state.page - 1 };
      return { ...next, page: getClampedPage(next) };
    }
    case "nextPage": {
      const next = { ...state, page: state.page + 1 };
      return { ...next, page: getClampedPage(next) };
    }
    case "setPageSize": {
      const pageSize = Number(action.pageSize) || state.pageSize;
      const next = { ...state, pageSize, page: 1 };
      return { ...next, page: getClampedPage(next) };
    }
    case "setTraffic": {
      return { ...state, traffic: action.traffic };
    }
    case "resetTraffic": {
      return { ...state, traffic: [] };
    }
    case "setTrafficSourceKind": {
      return { ...state, trafficSourceKind: action.kind };
    }
    case "setTrafficVizKind": {
      return { ...state, trafficVizKind: action.kind };
    }
    case "setLayoutKind": {
      return { ...state, layoutKind: action.kind };
    }
  }
};
