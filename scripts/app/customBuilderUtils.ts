import type { Connection, DeviceType, NetworkDevice } from "../domain/types.ts";
import { isLinkableInterfaceType } from "../domain/interfaceTypes.ts";

export type LinkablePort = { id: string; interfaceType?: string };

export const isContainerDevice = (device: NetworkDevice): boolean =>
  Boolean(device.isContainer === true);

export const getUsedInterfaceIds = (
  connections: Connection[],
  deviceId: string,
): Set<string> => {
  const used = new Set<string>();
  connections.forEach((connection) => {
    if (
      connection.from.deviceId === deviceId &&
      typeof connection.from.interfaceId === "string"
    ) {
      used.add(connection.from.interfaceId);
    }
    if (
      connection.to.deviceId === deviceId &&
      typeof connection.to.interfaceId === "string"
    ) {
      used.add(connection.to.interfaceId);
    }
  });
  return used;
};

export const getFreeLinkablePorts = (
  device: NetworkDevice,
  connections: Connection[],
  deviceTypes: Record<string, DeviceType>,
): LinkablePort[] => {
  const slug = device.deviceTypeSlug;
  if (!slug) return [];
  const deviceType = deviceTypes[slug];
  if (!deviceType) return [];

  const used = getUsedInterfaceIds(connections, device.id);
  return deviceType.ports
    .filter((port) =>
      !port.mgmtOnly && isLinkableInterfaceType(port.interfaceType)
    )
    .filter((port) => !used.has(port.id))
    .map((port) => ({ id: port.id, interfaceType: port.interfaceType }));
};

export const choosePortPair = (
  firstPorts: LinkablePort[],
  secondPorts: LinkablePort[],
): { fromInterfaceId: string; toInterfaceId: string } | null => {
  if (!firstPorts.length || !secondPorts.length) return null;

  for (const fromPort of firstPorts) {
    if (!fromPort.interfaceType) continue;
    const sameType = secondPorts.find((toPort) =>
      toPort.interfaceType === fromPort.interfaceType
    );
    if (sameType) {
      return { fromInterfaceId: fromPort.id, toInterfaceId: sameType.id };
    }
  }

  return {
    fromInterfaceId: firstPorts[0].id,
    toInterfaceId: secondPorts[0].id,
  };
};

export const stripManagedDeviceFields = (
  value: Record<string, unknown>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  const blocked = new Set([
    "id",
    "name",
    "type",
    "deviceKind",
    "deviceTypeSlug",
    "x",
    "y",
    "fx",
    "fy",
    "layoutTierIndexHint",
    "layoutSiteRank",
    "layoutStableKey",
    "brand",
    "model",
    "ports",
    "thumbPng",
    "thumbJpg",
    "partNumber",
  ]);

  Object.entries(value).forEach(([key, item]) => {
    if (blocked.has(key)) return;
    out[key] = item;
  });

  return out;
};

export const pruneConnectionsForDeviceType = (
  {
    device,
    nextDeviceTypeSlug,
    connections,
    deviceTypes,
  }: {
    device: NetworkDevice;
    nextDeviceTypeSlug: string;
    connections: Connection[];
    deviceTypes: Record<string, DeviceType>;
  },
): { nextConnections: Connection[]; removedCount: number } => {
  const nextType = deviceTypes[nextDeviceTypeSlug];
  if (!nextType) return { nextConnections: connections, removedCount: 0 };

  const validPorts = new Set(nextType.ports.map((port) => port.id));
  const nextConnections = connections.filter((connection) => {
    if (connection.from.deviceId === device.id) {
      return typeof connection.from.interfaceId === "string"
        ? validPorts.has(connection.from.interfaceId)
        : false;
    }
    if (connection.to.deviceId === device.id) {
      return typeof connection.to.interfaceId === "string"
        ? validPorts.has(connection.to.interfaceId)
        : false;
    }
    return true;
  });

  return {
    nextConnections,
    removedCount: connections.length - nextConnections.length,
  };
};

export const computeNewDevicePosition = (
  {
    selectedAnchor,
    selectedAnchorPosition,
    viewportCenter,
    totalDevices,
  }: {
    selectedAnchor: NetworkDevice | null;
    selectedAnchorPosition: { x: number; y: number } | null;
    viewportCenter: { x: number; y: number } | null;
    totalDevices: number;
  },
): { x: number; y: number } | null => {
  if (selectedAnchor && selectedAnchorPosition) {
    const angle = (totalDevices % 8) * (Math.PI / 4);
    const radius = 95;
    return {
      x: selectedAnchorPosition.x + Math.cos(angle) * radius,
      y: selectedAnchorPosition.y + Math.sin(angle) * radius,
    };
  }

  if (viewportCenter) {
    const angle = (totalDevices % 12) * (Math.PI / 6);
    const radius = 28;
    return {
      x: viewportCenter.x + Math.cos(angle) * radius,
      y: viewportCenter.y + Math.sin(angle) * radius,
    };
  }

  return null;
};
