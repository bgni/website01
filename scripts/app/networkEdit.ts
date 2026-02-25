import type { Connection, DeviceType, NetworkDevice } from "../domain/types.ts";
import { inferDeviceKindFromType } from "../domain/deviceKind.ts";

const toSlug = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const nextId = (base: string, taken: Set<string>): string => {
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
};

export const createAddedDevice = (
  {
    name,
    type,
    devices,
  }: { name: string; type: string; devices: NetworkDevice[] },
): NetworkDevice => {
  const taken = new Set(devices.map((d) => d.id));
  const id = nextId(toSlug(name) || "device", taken);
  const normalizedType = type.trim() || "other";
  return {
    id,
    name: name.trim(),
    type: normalizedType,
    brand: "",
    model: "",
    deviceKind: inferDeviceKindFromType(normalizedType),
  };
};

export const getFirstAvailablePort = (
  {
    deviceId,
    devices,
    connections,
    deviceTypes,
  }: {
    deviceId: string;
    devices: NetworkDevice[];
    connections: Connection[];
    deviceTypes: Record<string, DeviceType>;
  },
): string | undefined => {
  const used = new Set<string>();
  connections.forEach((connection) => {
    if (connection.from.deviceId === deviceId && connection.from.interfaceId) {
      used.add(connection.from.interfaceId);
    }
    if (connection.to.deviceId === deviceId && connection.to.interfaceId) {
      used.add(connection.to.interfaceId);
    }
  });

  const device = devices.find((d) => d.id === deviceId);
  const slug = typeof device?.deviceTypeSlug === "string"
    ? device.deviceTypeSlug
    : "";
  const knownType = slug ? deviceTypes[slug] : undefined;
  if (knownType?.ports?.length) {
    for (const port of knownType.ports) {
      const id = typeof port.id === "string" ? port.id.trim() : "";
      if (!id || port.mgmtOnly || used.has(id)) continue;
      return id;
    }
    return undefined;
  }

  let nextPort = 1;
  while (used.has(`p${nextPort}`)) nextPort += 1;
  return `p${nextPort}`;
};

export const createConnectionUsingFirstPorts = (
  {
    fromId,
    toId,
    devices,
    connections,
    deviceTypes,
  }: {
    fromId: string;
    toId: string;
    devices: NetworkDevice[];
    connections: Connection[];
    deviceTypes: Record<string, DeviceType>;
  },
): { connection?: Connection; error?: string } => {
  if (fromId === toId) return { error: "Pick two different devices." };
  const knownIds = new Set(devices.map((d) => d.id));
  if (!knownIds.has(fromId) || !knownIds.has(toId)) {
    return { error: "Selected devices were not found." };
  }
  const duplicate = connections.some((c) =>
    (c.from.deviceId === fromId && c.to.deviceId === toId) ||
    (c.from.deviceId === toId && c.to.deviceId === fromId)
  );
  if (duplicate) return { error: "Devices are already connected." };

  const fromPort = getFirstAvailablePort({
    deviceId: fromId,
    devices,
    connections,
    deviceTypes,
  });
  const toPort = getFirstAvailablePort({
    deviceId: toId,
    devices,
    connections,
    deviceTypes,
  });
  if (!fromPort || !toPort) {
    return { error: "No free port is available on one of the devices." };
  }

  const existingIds = new Set(connections.map((c) => c.id));
  const id = nextId(`conn-${toSlug(fromId)}-${toSlug(toId)}`, existingIds);
  return {
    connection: {
      id,
      connectionType: "eth-1g",
      from: { deviceId: fromId, interfaceId: fromPort },
      to: { deviceId: toId, interfaceId: toPort },
    },
  };
};
