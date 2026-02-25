import type { Connection, DeviceType, NetworkDevice } from "./types.ts";
import { loadDeviceTypeIndex } from "./deviceTypes.ts";
import { normalizeLegacyInterfaceIds, validateTopology } from "./topology.ts";
import { parseConnectionsFixture, parseDevicesFixture } from "./fixtures.ts";

export async function loadJson(path: string): Promise<unknown> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json() as Promise<unknown>;
}

type LoadDataOptions = { basePath?: string; includeTraffic?: boolean };

type LoadDataResult = {
  devices: NetworkDevice[];
  connections: Connection[];
  traffic: unknown | undefined;
  deviceTypes: Record<string, DeviceType>;
};

const hasInterfaceIds = (rawConnections: unknown): boolean => {
  if (!Array.isArray(rawConnections)) return false;
  for (const c of rawConnections) {
    if (!c || typeof c !== "object") continue;
    const rec = c as Record<string, unknown>;
    for (const side of ["from", "to"] as const) {
      const end = rec[side];
      if (!end || typeof end !== "object") continue;
      const endRec = end as Record<string, unknown>;
      const interfaceId = endRec.interfaceId;
      const portId = endRec.portId;
      if (typeof interfaceId === "string" && interfaceId.trim()) return true;
      if (typeof portId === "string" && portId.trim()) return true;
    }
  }
  return false;
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

  const shouldLoadDeviceTypes = (Array.isArray(devicesWithSlug) &&
    devicesWithSlug.some((d) =>
      d && typeof d.deviceTypeSlug === "string" &&
      d.deviceTypeSlug.trim().length
    )) || hasInterfaceIds(connections);

  let deviceTypes: Record<string, DeviceType> = {};
  if (shouldLoadDeviceTypes) {
    deviceTypes = await loadDeviceTypeIndex({
      indexPath: "data/netbox-device-types.json",
    });
  }

  const devicesParsed = parseDevicesFixture(devicesWithSlug, devicesPath);
  const connectionsParsed = parseConnectionsFixture(
    connections,
    connectionsPath,
  );

  const connectionsNormalized = normalizeLegacyInterfaceIds({
    devices: devicesParsed,
    connections: connectionsParsed,
    deviceTypes,
    devicesCtx: devicesPath,
    connectionsCtx: connectionsPath,
  });

  validateTopology({
    devices: devicesParsed,
    connections: connectionsNormalized,
    deviceTypes,
    devicesCtx: devicesPath,
    connectionsCtx: connectionsPath,
  });

  return {
    devices: devicesParsed,
    connections: connectionsNormalized,
    traffic,
    deviceTypes,
  };
}
