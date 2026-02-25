import { assertEquals } from "@std/assert";
import {
  choosePortPair,
  computeNewDevicePosition,
  pruneConnectionsForDeviceType,
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
