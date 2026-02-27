import { assert, assertEquals } from "@std/assert";
import type { DeviceType } from "../domain/types.ts";
import {
  CUSTOM_TOPOLOGY_STORAGE_KEY,
  loadCustomTopology,
} from "./customTopology.ts";

class MemoryStorage implements Storage {
  #map = new Map<string, string>();

  get length(): number {
    return this.#map.size;
  }

  clear(): void {
    this.#map.clear();
  }

  getItem(key: string): string | null {
    return this.#map.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.#map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.#map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#map.set(key, value);
  }
}

const mkDeviceType = (slug: string): DeviceType => ({
  id: slug,
  slug,
  brand: "Acme",
  model: "Rack 1G",
  ports: [
    { id: "ge-0/0/1", interfaceType: "eth-1g" },
    { id: "ge-0/0/2", interfaceType: "eth-1g" },
  ],
  thumbPng: "vendor/netbox-devicetype-library/elevation-images/Acme/acme-rack.front.png",
});

Deno.test(
  "loadCustomTopology: tolerates mismatched legacy portId in storage and rewrites sanitized payload",
  () => {
    const storage = new MemoryStorage();
    storage.setItem(
      CUSTOM_TOPOLOGY_STORAGE_KEY,
      JSON.stringify({
        v: 1,
        devices: [
          {
            id: "d1",
            name: "Device 1",
            type: "Switch",
            deviceTypeSlug: "Acme/Rack-1G",
          },
          {
            id: "d2",
            name: "Device 2",
            type: "Switch",
            deviceTypeSlug: "Acme/Rack-1G",
          },
        ],
        connections: [
          {
            id: "c1",
            from: { deviceId: "d1", interfaceId: "ge-0/0/1", portId: "p1" },
            to: { deviceId: "d2", interfaceId: "ge-0/0/1", portId: "p9" },
          },
        ],
        recentDeviceTypeSlugs: ["Acme/Rack-1G"],
        frequentDeviceTypeCounts: { "Acme/Rack-1G": 2 },
        shortlistByKind: { "2": "Acme/Rack-1G" },
      }),
    );

    const loaded = loadCustomTopology(storage, {
      "Acme/Rack-1G": mkDeviceType("Acme/Rack-1G"),
    });

    assertEquals(loaded.connections.length, 1);
    assertEquals(loaded.connections[0].from.interfaceId, "ge-0/0/1");
    assertEquals(loaded.connections[0].to.interfaceId, "ge-0/0/1");

    const rewritten = storage.getItem(CUSTOM_TOPOLOGY_STORAGE_KEY);
    assert(rewritten);
    assert(!rewritten.includes("\"portId\""));
  },
);
