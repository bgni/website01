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

const mkStatefulHarness = (initial: State) => {
  const actions: Action[] = [];
  const undoLabels: string[] = [];
  const refreshes: Array<{
    devices: NetworkDevice[];
    connections: State["connections"];
    selectedIds: string[] | undefined;
  }> = [];

  let state = initial;

  const service = createBuilderService({
    getState: () => state,
    dispatch: (action) => actions.push(action),
    customNetworkId: "custom-local",
    builderStats: {
      recentDeviceTypeSlugs: [],
      frequentDeviceTypeCounts: {},
    },
    nextUniqueId: (prefix, existing) => `${prefix}-${existing.size + 1}`,
    getNodePositions: () => new Map(),
    getViewportCenter: () => ({ x: 400, y: 300 }),
    refreshCustomGraph: (devices, connections, options) => {
      refreshes.push({
        devices,
        connections,
        selectedIds: options?.selectedIds,
      });
      state = {
        ...state,
        devices,
        connections,
        selected: new Set(options?.selectedIds ?? Array.from(state.selected)),
      };
    },
    pushCustomUndoSnapshot: (label) => undoLabels.push(label),
    clearCustomUndo: () => {
      undoLabels.length = 0;
    },
    ensureBuilderMode: () => {
      state = {
        ...state,
        networkId: "custom-local",
      };
      return Promise.resolve();
    },
    formatStatusError: (err) => String((err as Error).message ?? err),
  });

  return {
    service,
    actions,
    undoLabels,
    refreshes,
    getState: () => state,
    setState: (next: State) => {
      state = next;
    },
  };
};

Deno.test("builderService: addCustomContainerAt creates container node", () => {
  const harness = mkStatefulHarness(createBaseState({
    networkId: "custom-local",
  }));

  harness.service.addCustomContainerAt({ x: 120, y: 80 });

  assertEquals(harness.undoLabels, ["add container"]);
  assertEquals(harness.getState().devices.length, 1);
  assertEquals(harness.getState().devices[0].isContainer, true);
  assertEquals(harness.refreshes[0].selectedIds, ["custom-container-1"]);
});

Deno.test("builderService: assign and unassign device container", () => {
  const state = createBaseState({
    networkId: "custom-local",
    devices: [
      {
        id: "d1",
        name: "Device 1",
        type: "switch",
        deviceKind: DEVICE_KIND_SWITCH,
      },
      {
        id: "c1",
        name: "Group 1",
        type: "container",
        deviceKind: DEVICE_KIND_SWITCH,
        isContainer: true,
      },
    ],
  });
  const harness = mkStatefulHarness(state);

  harness.service.assignDeviceToContainer("d1", "c1");
  assertEquals(harness.getState().devices[0].containerId, "c1");

  harness.service.assignDeviceToContainer("d1", null);
  assertEquals(harness.getState().devices[0].containerId, undefined);
});

Deno.test("builderService: connectSelectedDevices adds connection", () => {
  const state = createBaseState({
    networkId: "custom-local",
    selected: new Set(["d1", "d2"]),
    deviceTypes: {
      "switch/core": mkSwitchType("switch/core", "Core 48"),
    },
    devices: [
      {
        id: "d1",
        name: "Device 1",
        type: "switch/core Core 48",
        deviceKind: DEVICE_KIND_SWITCH,
        deviceTypeSlug: "switch/core",
      },
      {
        id: "d2",
        name: "Device 2",
        type: "switch/core Core 48",
        deviceKind: DEVICE_KIND_SWITCH,
        deviceTypeSlug: "switch/core",
      },
    ],
  });
  const harness = mkStatefulHarness(state);

  harness.service.connectSelectedDevices();

  assertEquals(
    harness.undoLabels[harness.undoLabels.length - 1],
    "connect devices",
  );
  assertEquals(harness.getState().connections.length, 1);
  assertEquals(harness.getState().connections[0].from.deviceId, "d1");
  assertEquals(harness.getState().connections[0].to.deviceId, "d2");
});

Deno.test("builderService: deleteSelectedConnection removes matching links", () => {
  const state = createBaseState({
    networkId: "custom-local",
    selected: new Set(["d1", "d2"]),
    devices: [
      {
        id: "d1",
        name: "Device 1",
        type: "switch",
        deviceKind: DEVICE_KIND_SWITCH,
      },
      {
        id: "d2",
        name: "Device 2",
        type: "switch",
        deviceKind: DEVICE_KIND_SWITCH,
      },
    ],
    connections: [{
      id: "c1",
      from: { deviceId: "d1", interfaceId: "p1" },
      to: { deviceId: "d2", interfaceId: "p1" },
    }],
  });
  const harness = mkStatefulHarness(state);

  harness.service.deleteSelectedConnection();
  assertEquals(harness.getState().connections.length, 0);
});

Deno.test("builderService: rename and delete custom device", () => {
  const state = createBaseState({
    networkId: "custom-local",
    devices: [{
      id: "d1",
      name: "Device 1",
      type: "switch",
      deviceKind: DEVICE_KIND_SWITCH,
    }],
  });
  const harness = mkStatefulHarness(state);

  harness.service.renameCustomDevice("d1", "Core Renamed");
  assertEquals(harness.getState().devices[0].name, "Core Renamed");

  harness.service.deleteCustomDevice("d1");
  assertEquals(harness.getState().devices.length, 0);
});

Deno.test("builderService: change type and update properties", () => {
  const state = createBaseState({
    networkId: "custom-local",
    deviceTypes: {
      "switch/old": mkSwitchType("switch/old", "Old"),
      "switch/new": mkSwitchType("switch/new", "New"),
    },
    devices: [{
      id: "d1",
      name: "Device 1",
      type: "switch/old Old",
      deviceKind: DEVICE_KIND_SWITCH,
      deviceTypeSlug: "switch/old",
    }],
    connections: [{
      id: "c1",
      from: { deviceId: "d1", interfaceId: "p1" },
      to: { deviceId: "d2", interfaceId: "p1" },
    }],
  });
  const harness = mkStatefulHarness(state);

  harness.service.changeCustomDeviceType("d1", "switch/new");
  assertEquals(harness.getState().devices[0].deviceTypeSlug, "switch/new");

  harness.service.updateCustomDeviceProperties(
    "d1",
    JSON.stringify({
      id: "blocked",
      note: "kept",
    }),
  );

  assertEquals(
    (harness.getState().devices[0] as Record<string, unknown>).note,
    "kept",
  );
  assertEquals(harness.getState().devices[0].id, "d1");
});

Deno.test("builderService: export topology JSON includes v1 envelope", () => {
  const harness = mkStatefulHarness(createBaseState({
    networkId: "custom-local",
    devices: [{
      id: "d1",
      name: "Device 1",
      type: "switch",
      deviceKind: DEVICE_KIND_SWITCH,
    }],
  }));

  const json = harness.service.exportTopologyJson();
  const parsed = JSON.parse(json) as { v: number; devices: unknown[] };
  assertEquals(parsed.v, 1);
  assertEquals(parsed.devices.length, 1);
});

Deno.test("builderService: connectSelectedDevices requires exactly two selected", () => {
  const harness = mkStatefulHarness(createBaseState({
    networkId: "custom-local",
    selected: new Set(["d1"]),
  }));

  harness.service.connectSelectedDevices();

  const last = harness.actions[harness.actions.length - 1];
  assertEquals(last, {
    type: "setStatusText",
    text: "Select exactly 2 devices to connect.",
  });
});

Deno.test("builderService: connectSelectedDevices reports incompatible free ports", () => {
  const state = createBaseState({
    networkId: "custom-local",
    selected: new Set(["d1", "d2"]),
    deviceTypes: {
      "switch/a": {
        ...mkSwitchType("switch/a", "A"),
        ports: [{ id: "ma", interfaceType: "unsupported" }],
      },
      "switch/b": {
        ...mkSwitchType("switch/b", "B"),
        ports: [{ id: "mb", interfaceType: "unsupported" }],
      },
    },
    devices: [
      {
        id: "d1",
        name: "Device 1",
        type: "switch/a A",
        deviceKind: DEVICE_KIND_SWITCH,
        deviceTypeSlug: "switch/a",
      },
      {
        id: "d2",
        name: "Device 2",
        type: "switch/b B",
        deviceKind: DEVICE_KIND_SWITCH,
        deviceTypeSlug: "switch/b",
      },
    ],
  });
  const harness = mkStatefulHarness(state);

  harness.service.connectSelectedDevices();
  const last = harness.actions[harness.actions.length - 1];
  assertEquals(last, {
    type: "setStatusText",
    text: "No compatible free ports found on one or both devices.",
  });
});

Deno.test("builderService: deleteSelectedConnection reports missing connection", () => {
  const state = createBaseState({
    networkId: "custom-local",
    selected: new Set(["d1", "d2"]),
    devices: [
      { id: "d1", name: "D1", type: "switch", deviceKind: DEVICE_KIND_SWITCH },
      { id: "d2", name: "D2", type: "switch", deviceKind: DEVICE_KIND_SWITCH },
    ],
    connections: [],
  });
  const harness = mkStatefulHarness(state);

  harness.service.deleteSelectedConnection();
  const last = harness.actions[harness.actions.length - 1];
  assertEquals(last, {
    type: "setStatusText",
    text: "No connection exists between selected devices.",
  });
});

Deno.test("builderService: rename/update validation errors", () => {
  const state = createBaseState({
    networkId: "custom-local",
    devices: [{
      id: "d1",
      name: "Device 1",
      type: "switch",
      deviceKind: DEVICE_KIND_SWITCH,
    }],
  });
  const harness = mkStatefulHarness(state);

  harness.service.renameCustomDevice("d1", "   ");
  harness.service.updateCustomDeviceProperties("d1", "bad-json");
  harness.service.updateCustomDeviceProperties("d1", "[]");

  const texts = harness.actions.filter((a) => a.type === "setStatusText").map((
    a,
  ) => a.text);
  assertEquals(texts.includes("Device name cannot be empty."), true);
  assertEquals(texts.includes("Properties must be valid JSON object."), true);
  assertEquals(texts.includes("Properties must be a JSON object."), true);
});
