import { assertEquals } from "@std/assert";
import {
  createAddedDevice,
  createConnectionUsingFirstPorts,
} from "./networkEdit.ts";
import type {
  Connection,
  DeviceType,
  NetworkDevice,
} from "../domain/types.ts";

Deno.test("createAddedDevice creates slug id and increments duplicates", () => {
  const devices: NetworkDevice[] = [{
    id: "edge-router",
    name: "Edge Router",
    type: "router",
    deviceKind: "router",
  }];
  const device = createAddedDevice({
    name: "Edge Router",
    type: "router",
    devices,
  });
  assertEquals(device.id, "edge-router-2");
  assertEquals(device.deviceKind, "router");
});

Deno.test("createConnectionUsingFirstPorts chooses first free known ports", () => {
  const devices: NetworkDevice[] = [
    {
      id: "sw-1",
      name: "Switch",
      type: "switch",
      deviceKind: "switch",
      deviceTypeSlug: "acme/sw",
    },
    {
      id: "sw-2",
      name: "Switch 2",
      type: "switch",
      deviceKind: "switch",
      deviceTypeSlug: "acme/sw",
    },
  ];
  const deviceTypes: Record<string, DeviceType> = {
    "acme/sw": {
      id: "acme/sw",
      slug: "acme/sw",
      brand: "Acme",
      model: "SW",
      ports: [{ id: "p1" }, { id: "p2" }],
    },
  };
  const connections: Connection[] = [{
    id: "conn-a",
    from: { deviceId: "sw-1", interfaceId: "p1" },
    to: { deviceId: "sw-2", interfaceId: "p1" },
  }];

  const out = createConnectionUsingFirstPorts({
    fromId: "sw-1",
    toId: "sw-2",
    devices,
    connections: [],
    deviceTypes,
  });
  assertEquals(out.connection?.from.interfaceId, "p1");
  assertEquals(out.connection?.to.interfaceId, "p1");

  const out2 = createConnectionUsingFirstPorts({
    fromId: "sw-1",
    toId: "sw-2",
    devices,
    connections,
    deviceTypes,
  });
  assertEquals(out2.error, "Devices are already connected.");
});
