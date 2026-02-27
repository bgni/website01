import type { Connection, DeviceType, NetworkDevice } from "../domain/types.ts";
import {
  parseConnectionsFixture,
  parseDevicesFixture,
} from "../domain/fixtures.ts";
import {
  normalizeLegacyInterfaceIds,
  validateTopology,
} from "../domain/topology.ts";

type CustomTopologyEnvelopeV1 = {
  v: 1;
  devices: NetworkDevice[];
  connections: Connection[];
  updatedAt: string;
};

type CustomTopologyPersistedV1 = CustomTopologyEnvelopeV1 & {
  recentDeviceTypeSlugs: string[];
  frequentDeviceTypeCounts: Record<string, number>;
  shortlistByKind: Record<string, string>;
};

type Rec = Record<string, unknown>;

export type LoadedCustomTopology = {
  devices: NetworkDevice[];
  connections: Connection[];
  recentDeviceTypeSlugs: string[];
  frequentDeviceTypeCounts: Record<string, number>;
  shortlistByKind: Record<string, string>;
};

export const CUSTOM_NETWORK_ID = "custom-local";
export const CUSTOM_TOPOLOGY_STORAGE_KEY = "website01.builder.topology.v1";

const isRecord = (v: unknown): v is Rec =>
  v != null && typeof v === "object" && !Array.isArray(v);

const emptyTopology = (): LoadedCustomTopology => ({
  devices: [],
  connections: [],
  recentDeviceTypeSlugs: [],
  frequentDeviceTypeCounts: {},
  shortlistByKind: {},
});

const normalizeRecent = (v: unknown): string[] => {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  v.forEach((item) => {
    if (typeof item !== "string") return;
    const slug = item.trim();
    if (!slug || seen.has(slug)) return;
    seen.add(slug);
    out.push(slug);
  });
  return out;
};

const normalizeFrequent = (v: unknown): Record<string, number> => {
  if (!isRecord(v)) return {};
  const out: Record<string, number> = {};
  Object.entries(v).forEach(([key, value]) => {
    const slug = key.trim();
    if (!slug) return;
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n) || n <= 0) return;
    out[slug] = Math.floor(n);
  });
  return out;
};

const normalizeShortlistByKind = (v: unknown): Record<string, string> => {
  if (!isRecord(v)) return {};
  const out: Record<string, string> = {};
  Object.entries(v).forEach(([kindId, slugValue]) => {
    const kindKey = kindId.trim();
    if (!kindKey) return;
    const slug = typeof slugValue === "string" ? slugValue.trim() : "";
    if (!slug) return;
    out[kindKey] = slug;
  });
  return out;
};

const connectionsNeedLegacyPortCleanup = (raw: unknown): boolean => {
  if (!Array.isArray(raw)) return false;
  return raw.some((item) => {
    if (!isRecord(item)) return false;
    const rec = item as Rec;
    return [rec.from, rec.to].some((end) => {
      if (!isRecord(end)) return false;
      const endRec = end as Rec;
      const interfaceId = typeof endRec.interfaceId === "string"
        ? endRec.interfaceId.trim()
        : "";
      const portId = typeof endRec.portId === "string" ? endRec.portId.trim() : "";
      if (!portId) return false;
      if (!interfaceId) return true;
      return interfaceId !== portId;
    });
  });
};

const parseAndValidateTopology = (
  raw: unknown,
  deviceTypes: Record<string, DeviceType>,
  ctx: string,
  {
    allowLegacyPortIdMismatch = false,
  }: {
    allowLegacyPortIdMismatch?: boolean;
  } = {},
): { devices: NetworkDevice[]; connections: Connection[] } => {
  if (!isRecord(raw)) {
    throw new Error(`${ctx} must be an object with devices/connections`);
  }

  const devices = parseDevicesFixture(raw.devices ?? [], `${ctx}.devices`);
  const connections = parseConnectionsFixture(
    raw.connections ?? [],
    `${ctx}.connections`,
    { allowLegacyPortIdMismatch },
  );
  const normalizedConnections = normalizeLegacyInterfaceIds({
    devices,
    connections,
    deviceTypes,
    devicesCtx: `${ctx}.devices`,
    connectionsCtx: `${ctx}.connections`,
  });

  validateTopology({
    devices,
    connections: normalizedConnections,
    deviceTypes,
    devicesCtx: `${ctx}.devices`,
    connectionsCtx: `${ctx}.connections`,
  });

  return { devices, connections: normalizedConnections };
};

export const loadCustomTopology = (
  storage: Storage | undefined,
  deviceTypes: Record<string, DeviceType>,
): LoadedCustomTopology => {
  if (!storage) return emptyTopology();

  const raw = storage.getItem(CUSTOM_TOPOLOGY_STORAGE_KEY);
  if (!raw) return emptyTopology();

  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return emptyTopology();
    if (parsed.v !== 1) return emptyTopology();

    const { devices, connections } = parseAndValidateTopology(
      parsed,
      deviceTypes,
      "customTopology",
      { allowLegacyPortIdMismatch: true },
    );

    if (connectionsNeedLegacyPortCleanup(parsed.connections)) {
      saveCustomTopology(storage, {
        devices,
        connections,
        recentDeviceTypeSlugs: normalizeRecent(parsed.recentDeviceTypeSlugs),
        frequentDeviceTypeCounts: normalizeFrequent(
          parsed.frequentDeviceTypeCounts,
        ),
        shortlistByKind: normalizeShortlistByKind(parsed.shortlistByKind),
      });
    }

    return {
      devices,
      connections,
      recentDeviceTypeSlugs: normalizeRecent(parsed.recentDeviceTypeSlugs),
      frequentDeviceTypeCounts: normalizeFrequent(
        parsed.frequentDeviceTypeCounts,
      ),
      shortlistByKind: normalizeShortlistByKind(parsed.shortlistByKind),
    };
  } catch (err) {
    console.warn("Failed to load custom topology from storage.", err);
    return emptyTopology();
  }
};

export const saveCustomTopology = (
  storage: Storage | undefined,
  topology: {
    devices: NetworkDevice[];
    connections: Connection[];
    recentDeviceTypeSlugs: string[];
    frequentDeviceTypeCounts: Record<string, number>;
    shortlistByKind: Record<string, string>;
  },
): void => {
  if (!storage) return;

  const payload: CustomTopologyPersistedV1 = {
    v: 1,
    devices: topology.devices,
    connections: topology.connections,
    recentDeviceTypeSlugs: topology.recentDeviceTypeSlugs,
    frequentDeviceTypeCounts: topology.frequentDeviceTypeCounts,
    shortlistByKind: topology.shortlistByKind,
    updatedAt: new Date().toISOString(),
  };

  try {
    storage.setItem(CUSTOM_TOPOLOGY_STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn("Failed to save custom topology.", err);
  }
};

export const buildExportPayload = (
  devices: NetworkDevice[],
  connections: Connection[],
): CustomTopologyEnvelopeV1 => ({
  v: 1,
  devices,
  connections,
  updatedAt: new Date().toISOString(),
});

export const parseImportPayload = (
  text: string,
  deviceTypes: Record<string, DeviceType>,
): { devices: NetworkDevice[]; connections: Connection[] } => {
  const parsed = JSON.parse(text);
  const source = isRecord(parsed) && isRecord(parsed.topology)
    ? parsed.topology
    : parsed;

  return parseAndValidateTopology(source, deviceTypes, "importTopology");
};

export const trackRecentDeviceType = (
  recent: string[],
  frequent: Record<string, number>,
  slug: string,
): {
  recentDeviceTypeSlugs: string[];
  frequentDeviceTypeCounts: Record<string, number>;
} => {
  const cleanedSlug = slug.trim();
  if (!cleanedSlug) {
    return {
      recentDeviceTypeSlugs: recent,
      frequentDeviceTypeCounts: frequent,
    };
  }

  const nextRecent = [
    cleanedSlug,
    ...recent.filter((item) => item !== cleanedSlug),
  ].slice(0, 8);

  const nextFrequent = { ...frequent };
  nextFrequent[cleanedSlug] = (nextFrequent[cleanedSlug] ?? 0) + 1;

  return {
    recentDeviceTypeSlugs: nextRecent,
    frequentDeviceTypeCounts: nextFrequent,
  };
};

export const getFrequentDeviceTypeSlugs = (
  frequent: Record<string, number>,
  limit = 8,
): string[] =>
  Object.entries(frequent)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(0, limit))
    .map(([slug]) => slug);
