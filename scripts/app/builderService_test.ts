import { assertEquals } from "@std/assert";
import { createBuilderService } from "./builderService.ts";
import { DEVICE_KIND_SWITCH } from "../domain/deviceKind.ts";
import type { DeviceType, NetworkDevice } from "../domain/types.ts";
import type { Action } from "./actions.ts";
import type { State } from "./types.ts";

const createBaseState = (partial?: Partial<State>): State => ({
  networkId: "small-office",
  statusText: "",
  filter: "",
  sortKey: "name",
  sortDir: "asc",
  selected: new Set<string>(),
  page: 1,
  pageSize: 25,
  devices: [],
  connections: [],
  traffic: [],
  deviceTypes: {},
  trafficSourceKind: "default",
  trafficVizKind: "classic",
  layoutKind: "force",
  ...partial,
});

const mkSwitchType = (slug: string, model: string): DeviceType => ({
  id: slug,
  slug,
  brand: "Acme",
  model,
  ports: [
    { id: "p1", interfaceType: "eth-1g" },
    { id: "p2", interfaceType: "eth-1g" },
  ],
});

Deno.test("builderService: blocks edits outside custom mode", () => {
  const actions: Action[] = [];
  let refreshCalls = 0;

  const service = createBuilderService({
    getState: () => createBaseState({ networkId: "small-office" }),
    dispatch: (action) => actions.push(action),
    customNetworkId: "custom-local",
    builderStats: {
      recentDeviceTypeSlugs: [],
      frequentDeviceTypeCounts: {},
    },
    nextUniqueId: () => "unused",
    getNodePositions: () => new Map(),
    getViewportCenter: () => ({ x: 100, y: 100 }),
    refreshCustomGraph: () => {
      refreshCalls += 1;
    },
    pushCustomUndoSnapshot: () => {},
    clearCustomUndo: () => {},
    ensureBuilderMode: async () => {},
    formatStatusError: (err) => String(err),
  });

  service.addCustomDevice("switch/core");

  assertEquals(refreshCalls, 0);
  assertEquals(actions[0], {
    type: "setStatusText",
    text: "Open Create/Edit mode first.",
  });
});

Deno.test("builderService: rejects unknown device type slug", () => {
  const actions: Action[] = [];

  const service = createBuilderService({
    getState: () =>
      createBaseState({
        networkId: "custom-local",
        deviceTypes: {},
      }),
    dispatch: (action) => actions.push(action),
    customNetworkId: "custom-local",
    builderStats: {
      recentDeviceTypeSlugs: [],
      frequentDeviceTypeCounts: {},
    },
    nextUniqueId: () => "unused",
    getNodePositions: () => new Map(),
    getViewportCenter: () => ({ x: 100, y: 100 }),
    refreshCustomGraph: () => {},
    pushCustomUndoSnapshot: () => {},
    clearCustomUndo: () => {},
    ensureBuilderMode: async () => {},
    formatStatusError: (err) => String(err),
  });

  service.addCustomDevice("missing/type");

  assertEquals(actions[0], {
    type: "setStatusText",
    text: "Unknown device type 'missing/type'.",
  });
});

Deno.test("builderService: adds custom device and updates recents/frequents", () => {
  const actions: Action[] = [];
  const refreshCalls: Array<{
    devices: NetworkDevice[];
    selectedIds: string[] | undefined;
  }> = [];
  let undoLabel = "";

  const builderStats = {
    recentDeviceTypeSlugs: [] as string[],
    frequentDeviceTypeCounts: {} as Record<string, number>,
  };

  const service = createBuilderService({
    getState: () =>
      createBaseState({
        networkId: "custom-local",
        deviceTypes: {
          "switch/core": mkSwitchType("switch/core", "Core 48"),
        },
      }),
    dispatch: (action) => actions.push(action),
    customNetworkId: "custom-local",
    builderStats,
    nextUniqueId: () => "custom-device-1",
    getNodePositions: () => new Map(),
    getViewportCenter: () => ({ x: 200, y: 100 }),
    refreshCustomGraph: (devices, _connections, options) => {
      refreshCalls.push({
        devices,
        selectedIds: options?.selectedIds,
      });
    },
    pushCustomUndoSnapshot: (label) => {
      undoLabel = label;
    },
    clearCustomUndo: () => {},
    ensureBuilderMode: async () => {},
    formatStatusError: (err) => String(err),
  });

  service.addCustomDevice("switch/core");

  assertEquals(undoLabel, "add device");
  assertEquals(builderStats.recentDeviceTypeSlugs, ["switch/core"]);
  assertEquals(builderStats.frequentDeviceTypeCounts["switch/core"], 1);

  if (!refreshCalls.length) {
    throw new Error("Expected refreshCustomGraph to be called");
  }
  const refreshArgs = refreshCalls[0];
  assertEquals(refreshArgs.devices.length, 1);
  assertEquals(refreshArgs.devices[0].id, "custom-device-1");
  assertEquals(refreshArgs.devices[0].deviceKind, DEVICE_KIND_SWITCH);
  assertEquals(refreshArgs.selectedIds, ["custom-device-1"]);

  assertEquals(actions[0], {
    type: "setStatusText",
    text: "Added Core 48 1.",
  });
});
