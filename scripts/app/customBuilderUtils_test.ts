import { assertEquals } from "@std/assert";
import {
  choosePortPair,
  computeNewDevicePosition,
  getFreeLinkablePorts,
  getUsedInterfaceIds,
  isContainerDevice,
  pruneConnectionsForDeviceType,
  stripManagedDeviceFields,
} from "./customBuilderUtils.ts";
import {
  DEVICE_KIND_ROUTER,
  DEVICE_KIND_SWITCH,
} from "../domain/deviceKind.ts";
import type { Connection, DeviceType, NetworkDevice } from "../domain/types.ts";

Deno.test("customBuilderUtils: choosePortPair prefers matching interface types", () => {
  const pair = choosePortPair(
    [
      { id: "a1", interfaceType: "eth-1g" },
      { id: "a2", interfaceType: "eth-10g" },
    ],
    [
      { id: "b1", interfaceType: "eth-10g" },
      { id: "b2", interfaceType: "eth-1g" },
    ],
  );

  assertEquals(pair, {
    fromInterfaceId: "a1",
    toInterfaceId: "b2",
  });
});

Deno.test("customBuilderUtils: choosePortPair falls back to first available ports", () => {
  const pair = choosePortPair(
    [{ id: "a1", interfaceType: "eth-1g" }],
    [{ id: "b1", interfaceType: "eth-10g" }],
  );

  assertEquals(pair, {
    fromInterfaceId: "a1",
    toInterfaceId: "b1",
  });
});

Deno.test("customBuilderUtils: choosePortPair returns null when either side has no ports", () => {
  assertEquals(
    choosePortPair([], [{ id: "b1", interfaceType: "eth-1g" }]),
    null,
  );
  assertEquals(
    choosePortPair([{ id: "a1", interfaceType: "eth-1g" }], []),
    null,
  );
});

Deno.test("customBuilderUtils: pruneConnectionsForDeviceType removes invalid interfaces", () => {
  const device: NetworkDevice = {
    id: "dev-1",
    name: "Device 1",
    type: "switch",
    deviceKind: DEVICE_KIND_SWITCH,
  };

  const connections: Connection[] = [
    {
      id: "c-keep",
      from: { deviceId: "dev-1", interfaceId: "ge-0/0/1" },
      to: { deviceId: "dev-2", interfaceId: "eth0" },
    },
    {
      id: "c-remove",
      from: { deviceId: "dev-1", interfaceId: "ge-0/0/9" },
      to: { deviceId: "dev-3", interfaceId: "eth0" },
    },
    {
      id: "c-other",
      from: { deviceId: "dev-2", interfaceId: "eth1" },
      to: { deviceId: "dev-3", interfaceId: "eth2" },
    },
  ];

  const deviceTypes: Record<string, DeviceType> = {
    "switch/new": {
      id: "switch/new",
      slug: "switch/new",
      brand: "Acme",
      model: "S1",
      ports: [{ id: "ge-0/0/1" }, { id: "ge-0/0/2" }],
    },
  };

  const result = pruneConnectionsForDeviceType({
    device,
    nextDeviceTypeSlug: "switch/new",
    connections,
    deviceTypes,
  });

  assertEquals(result.removedCount, 1);
  assertEquals(result.nextConnections.map((c) => c.id), ["c-keep", "c-other"]);
});

Deno.test("customBuilderUtils: computeNewDevicePosition uses selected anchor first", () => {
  const anchor: NetworkDevice = {
    id: "r1",
    name: "Router 1",
    type: "router",
    deviceKind: DEVICE_KIND_ROUTER,
  };

  const position = computeNewDevicePosition({
    selectedAnchor: anchor,
    selectedAnchorPosition: { x: 100, y: 100 },
    viewportCenter: { x: 400, y: 300 },
    totalDevices: 0,
  });

  assertEquals(position, { x: 195, y: 100 });
});

Deno.test("customBuilderUtils: computeNewDevicePosition uses viewport center fallback", () => {
  const position = computeNewDevicePosition({
    selectedAnchor: null,
    selectedAnchorPosition: null,
    viewportCenter: { x: 400, y: 300 },
    totalDevices: 6,
  });

  assertEquals(position, { x: 372, y: 300 });
});

Deno.test("customBuilderUtils: computeNewDevicePosition returns null with no anchors", () => {
  const position = computeNewDevicePosition({
    selectedAnchor: null,
    selectedAnchorPosition: null,
    viewportCenter: null,
    totalDevices: 0,
  });

  assertEquals(position, null);
});

Deno.test("customBuilderUtils: getUsedInterfaceIds includes both ends", () => {
  const used = getUsedInterfaceIds([
    {
      id: "c1",
      from: { deviceId: "d1", interfaceId: "p1" },
      to: { deviceId: "d2", interfaceId: "p2" },
    },
    {
      id: "c2",
      from: { deviceId: "d3", interfaceId: "p3" },
      to: { deviceId: "d1", interfaceId: "p4" },
    },
  ], "d1");

  assertEquals(Array.from(used).sort(), ["p1", "p4"]);
});

Deno.test("customBuilderUtils: getFreeLinkablePorts filters mgmt and used ports", () => {
  const device: NetworkDevice = {
    id: "d1",
    name: "Switch",
    type: "switch",
    deviceKind: DEVICE_KIND_SWITCH,
    deviceTypeSlug: "switch/core",
  };

  const deviceTypes: Record<string, DeviceType> = {
    "switch/core": {
      id: "switch/core",
      slug: "switch/core",
      brand: "Acme",
      model: "Core 48",
      ports: [
        { id: "p1", interfaceType: "eth-1g" },
        { id: "p2", interfaceType: "unsupported" },
        { id: "p3", interfaceType: "eth-1g", mgmtOnly: true },
      ],
    },
  };

  const free = getFreeLinkablePorts(
    device,
    [{
      id: "c1",
      from: { deviceId: "d1", interfaceId: "p1" },
      to: { deviceId: "d2", interfaceId: "p9" },
    }],
    deviceTypes,
  );

  assertEquals(free, []);
});

Deno.test("customBuilderUtils: getFreeLinkablePorts returns empty without slug or type", () => {
  const noSlug: NetworkDevice = {
    id: "d1",
    name: "Unknown",
    type: "other",
    deviceKind: DEVICE_KIND_SWITCH,
  };

  const withMissingType: NetworkDevice = {
    ...noSlug,
    deviceTypeSlug: "missing/type",
  };

  assertEquals(getFreeLinkablePorts(noSlug, [], {}), []);
  assertEquals(getFreeLinkablePorts(withMissingType, [], {}), []);
});

Deno.test("customBuilderUtils: stripManagedDeviceFields keeps only editable keys", () => {
  const stripped = stripManagedDeviceFields({
    id: "d1",
    name: "Device 1",
    type: "switch",
    deviceKind: "switch",
    ports: [1],
    note: "kept",
    rack: "A1",
  });

  assertEquals(stripped, {
    note: "kept",
    rack: "A1",
  });
});

Deno.test("customBuilderUtils: pruneConnectionsForDeviceType keeps original set when type missing", () => {
  const connections: Connection[] = [{
    id: "c1",
    from: { deviceId: "d1", interfaceId: "p1" },
    to: { deviceId: "d2", interfaceId: "p1" },
  }];

  const result = pruneConnectionsForDeviceType({
    device: {
      id: "d1",
      name: "Device 1",
      type: "switch",
      deviceKind: DEVICE_KIND_SWITCH,
    },
    nextDeviceTypeSlug: "missing/type",
    connections,
    deviceTypes: {},
  });

  assertEquals(result.removedCount, 0);
  assertEquals(result.nextConnections, connections);
});

Deno.test("customBuilderUtils: isContainerDevice checks explicit flag", () => {
  assertEquals(
    isContainerDevice({
      id: "c1",
      name: "Container",
      type: "container",
      deviceKind: DEVICE_KIND_SWITCH,
      isContainer: true,
    }),
    true,
  );

  assertEquals(
    isContainerDevice({
      id: "d1",
      name: "Device",
      type: "switch",
      deviceKind: DEVICE_KIND_SWITCH,
    }),
    false,
  );
});
