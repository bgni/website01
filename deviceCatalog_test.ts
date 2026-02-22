import { assertEquals, assertRejects } from "@std/assert";
import {
  createNetboxDeviceTypeCatalogJson,
  enrichDevicesFromNetbox,
  normalizeDevice,
} from "./scripts/deviceCatalog.js";

Deno.test("deviceCatalog: normalizes device ports to objects with ids", () => {
  const d = normalizeDevice({ id: 1, name: "X", ports: ["p1", { id: 2 }, 3] });
  assertEquals(d.id, "1");
  assertEquals(d.ports, [{ id: "p1" }, { id: "2" }, { id: "p3" }]);
});

Deno.test("deviceCatalog (NetBox): loads a device type by '<Manufacturer>/<Model>' slug", async () => {
  const catalog = createNetboxDeviceTypeCatalogJson({
    indexPath: "testdata/netbox-mock-device-types.json",
  });

  const d = await catalog.getBySlugOrThrow("Ubiquiti/U6-LR");
  assertEquals(d.id, "Ubiquiti/U6-LR");
  assertEquals(d.brand, "Ubiquiti");
  assertEquals(d.model, "U6 Long-Range");
  // eth0 + wlan0 + wlan1 from the mock file
  assertEquals(d.ports.map((p: { id: string }) => p.id), ["eth0", "wlan0", "wlan1"]);
});

Deno.test("deviceCatalog (NetBox): getMany returns exact number requested (or throws)", async () => {
  const catalog = createNetboxDeviceTypeCatalogJson({
    indexPath: "testdata/netbox-mock-device-types.json",
  });

  const res = await catalog.getManyBySlugOrThrow([
    "Ubiquiti/U6-LR",
    "Cisco/C9300-24T",
  ]);
  assertEquals(res.map((d) => d.id), ["Ubiquiti/U6-LR", "Cisco/C9300-24T"]);

  await assertRejects(
    () => catalog.getManyBySlugOrThrow(["Ubiquiti/U6-LR", "Nope/Missing"]),
    Error,
  );
});

Deno.test("deviceCatalog (NetBox): enriches device instances via deviceTypeSlug", async () => {
  const catalog = createNetboxDeviceTypeCatalogJson({
    indexPath: "testdata/netbox-mock-device-types.json",
  });

  const devices = await enrichDevicesFromNetbox({
    catalog,
    devices: [
      { id: "ap-1", name: "AP 1", deviceTypeSlug: "Ubiquiti/U6-LR" },
      { id: "sw-1", name: "Switch 1" },
    ],
  });

  assertEquals(devices[0].id, "ap-1");
  assertEquals(devices[0].deviceTypeSlug, "Ubiquiti/U6-LR");
  assertEquals(devices[0].ports.map((p: { id: string }) => p.id), ["eth0", "wlan0", "wlan1"]);
  assertEquals(devices[1].id, "sw-1");
});
