import {
  createNetboxDeviceTypeCatalogJson,
  enrichDevicesFromNetbox,
} from "./deviceCatalog.ts";

export async function loadJson(path: string): Promise<unknown> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json() as Promise<unknown>;
}

type LoadDataOptions = { basePath?: string; includeTraffic?: boolean };

type LoadDataResult = {
  devices: unknown;
  connections: unknown;
  traffic: unknown | undefined;
};

export async function loadData(
  {
    basePath = "data/networks/small-office",
    includeTraffic = true,
  }: LoadDataOptions = {},
): Promise<LoadDataResult> {
  const devicesPath = `${basePath}/devices.json`;
  const connectionsPath = `${basePath}/connections.json`;
  const trafficPath = `${basePath}/traffic.json`;

  const [devices, connections, traffic] = await Promise.all([
    loadJson(devicesPath),
    loadJson(connectionsPath),
    includeTraffic ? loadJson(trafficPath) : Promise.resolve(undefined),
  ]);

  // Allow instance devices to use `type_slug` (preferred) or `deviceTypeSlug` (legacy).
  const devicesWithSlug = Array.isArray(devices)
    ? (devices as unknown[]).map((d: unknown) => {
      if (!d || typeof d !== "object") return d;
      const rec = d as Record<string, unknown>;

      const deviceTypeSlug = typeof rec.deviceTypeSlug === "string"
        ? rec.deviceTypeSlug.trim()
        : "";
      if (deviceTypeSlug) return d;

      const typeSlug = typeof rec.type_slug === "string"
        ? rec.type_slug.trim()
        : "";
      if (typeSlug) return { ...rec, deviceTypeSlug: typeSlug };

      return d;
    })
    : devices;

  let devicesOut = devicesWithSlug;
  if (
    Array.isArray(devicesWithSlug) &&
    devicesWithSlug.some((d) =>
      d && typeof d.deviceTypeSlug === "string" &&
      d.deviceTypeSlug.trim().length
    )
  ) {
    try {
      const catalog = createNetboxDeviceTypeCatalogJson({
        indexPath: "data/netbox-device-types.json",
      });
      devicesOut = await enrichDevicesFromNetbox({
        devices: devicesWithSlug,
        catalog,
      });
    } catch (err) {
      console.warn(
        "NetBox catalog unavailable; continuing without enrichment.",
        err,
      );
    }
  }

  return { devices: devicesOut, connections, traffic };
}
