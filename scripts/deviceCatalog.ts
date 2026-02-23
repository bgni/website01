type DevicePort = { id: string; [k: string]: unknown };
type NormalizedDevice = {
  id: string;
  name: string;
  brand: string;
  model: string;
  type: string;
  ports: DevicePort[];
  [k: string]: unknown;
};

type NetboxDeviceTypeSpec = {
  id: string;
  slug: string;
  name: string;
  brand: string;
  model: string;
  type: string;
  ports: DevicePort[];
  raw: unknown;
  [k: string]: unknown;
};

type NetboxDeviceTypeCatalog<T = unknown> = {
  getBySlugOrThrow: (slug: string) => Promise<T>;
  getManyBySlugOrThrow: (slugs: string[] | string) => Promise<T[]>;
};

const toStr = (v: unknown): string => (v == null ? "" : String(v));

const normalizePort = (port: unknown, index: number): DevicePort => {
  if (port == null) return { id: `p${index + 1}` };
  if (typeof port === "string") return { id: port };
  if (typeof port === "number") return { id: `p${port}` };
  if (typeof port === "object" && (port as { id?: unknown }).id != null) {
    return {
      ...(port as Record<string, unknown>),
      id: String((port as { id?: unknown }).id),
    };
  }
  return { id: `p${index + 1}` };
};

export const normalizeDevice = (device: unknown): NormalizedDevice => {
  const d = (device ?? {}) as Record<string, unknown>;
  const ports = Array.isArray(d.ports)
    ? (d.ports as unknown[]).map(normalizePort)
    : [];
  return {
    ...(d as Record<string, unknown>),
    id: toStr(d.id),
    name: toStr(d.name),
    brand: toStr(d.brand),
    model: toStr(d.model),
    type: toStr(d.type),
    ports,
  };
};

const normalizeQuery = (q: unknown): string => toStr(q).trim();

export function createDeviceLookup(devices: unknown[] = []) {
  const normalized = devices.map((d) => normalizeDevice(d));

  const byId = new Map<string, NormalizedDevice>();
  const byIdLower = new Map<string, NormalizedDevice>();

  normalized.forEach((d) => {
    if (!d.id) return;
    byId.set(d.id, d);
    byIdLower.set(d.id.toLowerCase(), d);
  });

  const getBySlugOrThrow = (slug: unknown): NormalizedDevice => {
    const raw = normalizeQuery(slug);
    if (!raw) throw new Error("Device slug is required");

    if (byId.has(raw)) return byId.get(raw)!;
    const lower = raw.toLowerCase();
    if (byIdLower.has(lower)) return byIdLower.get(lower)!;

    throw new Error(`Unknown device slug: ${raw}`);
  };

  const getManyBySlugOrThrow = (slugs: unknown): NormalizedDevice[] => {
    const list = Array.isArray(slugs) ? slugs : [slugs];
    const devicesOut = list.map((s) => getBySlugOrThrow(s));
    if (devicesOut.length !== list.length) {
      throw new Error(
        `Expected ${list.length} devices, got ${devicesOut.length}`,
      );
    }
    return devicesOut;
  };

  return {
    devices: normalized,
    getBySlugOrThrow,
    getManyBySlugOrThrow,
  };
}

export async function loadDeviceLookup(
  { devicesPath = "data/networks/small-office/devices.json" } = {},
) {
  const res = await fetch(devicesPath);
  if (!res.ok) throw new Error(`Failed to load ${devicesPath}`);
  const devices = await res.json();
  return createDeviceLookup(devices);
}

const joinPath = (
  ...parts: Array<string | number | null | undefined>
): string =>
  parts
    .filter((p) => p != null && String(p).length)
    .map((p) => String(p).replace(/(^\/|\/$)/g, ""))
    .filter(Boolean)
    .join("/");

const assertSafeSlug = (
  slug: unknown,
): { raw: string; manufacturer: string; model: string } => {
  const raw = normalizeQuery(slug);
  if (!raw) throw new Error("Device type slug is required");
  if (raw.includes("..") || raw.includes("\\") || raw.startsWith("/")) {
    throw new Error(`Invalid device type slug: ${raw}`);
  }
  const parts = raw.split("/").filter(Boolean);
  if (parts.length !== 2) {
    throw new Error(
      `Device type slug must be '<Manufacturer>/<Model>': ${raw}`,
    );
  }
  return { raw, manufacturer: parts[0], model: parts[1] };
};

const defaultReadText = async (path: string): Promise<string> => {
  if (
    typeof globalThis.Deno !== "undefined" &&
    typeof globalThis.Deno.readTextFile === "function"
  ) {
    return globalThis.Deno.readTextFile(path);
  }
  if (typeof fetch === "function") {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load ${path}`);
    return res.text();
  }
  throw new Error("No reader available; provide readText()");
};

export const normalizeNetboxDeviceType = ({
  slug,
  manufacturerFromPath,
  modelFromPath,
  raw,
}: {
  slug: string;
  manufacturerFromPath?: string;
  modelFromPath?: string;
  raw: unknown;
}): NetboxDeviceTypeSpec => {
  const rawRec: Record<string, unknown> = (raw && typeof raw === "object")
    ? (raw as Record<string, unknown>)
    : {};
  const manufacturer = toStr(rawRec.manufacturer ?? manufacturerFromPath);
  const model = toStr(rawRec.model ?? modelFromPath);

  const ports: DevicePort[] = [];
  const pushPorts = (list: unknown, kind: string) => {
    if (!Array.isArray(list)) return;
    list.forEach((p: unknown) => {
      const rec = (p && typeof p === "object")
        ? (p as Record<string, unknown>)
        : null;
      if (!rec || rec.name == null) return;
      ports.push({
        id: toStr(rec.name),
        kind,
        type: toStr(rec.type),
        mgmtOnly: Boolean(rec.mgmt_only),
        poeMode: toStr(rec.poe_mode),
        poeType: toStr(rec.poe_type),
        description: toStr(rec.description),
      });
    });
  };

  pushPorts(rawRec.interfaces, "interface");
  pushPorts(rawRec["console-ports"], "console");
  pushPorts(rawRec["power-ports"], "power");
  pushPorts(rawRec["power-outlets"], "power-outlet");
  pushPorts(rawRec["rear-ports"], "rear");
  pushPorts(rawRec["front-ports"], "front");

  return {
    id: slug,
    slug,
    name: model || slug,
    brand: manufacturer,
    model,
    type: "device type",
    ports,
    raw,
  };
};

// NetBox devicetype-library loader.
// Slug format is strict: '<Manufacturer>/<Model>' and resolves to:
//   <rootDir>/device-types/<Manufacturer>/<Model>.yaml
export function createNetboxDeviceTypeCatalog({
  rootDir = "vendor/netbox-devicetype-library",
  deviceTypesDir = "device-types",
  readText = defaultReadText,
  parseYaml,
}: {
  rootDir?: string;
  deviceTypesDir?: string;
  readText?: (path: string) => Promise<string>;
  parseYaml?: (text: string) => unknown | Promise<unknown>;
} = {}): NetboxDeviceTypeCatalog<NetboxDeviceTypeSpec> {
  const cache = new Map<string, NetboxDeviceTypeSpec>();

  const loadOne = async (slug: string): Promise<NetboxDeviceTypeSpec> => {
    const { raw, manufacturer, model } = assertSafeSlug(slug);
    if (cache.has(raw)) return cache.get(raw)!;

    const path = joinPath(
      rootDir,
      deviceTypesDir,
      manufacturer,
      `${model}.yaml`,
    );
    const text = await readText(path);
    if (typeof parseYaml !== "function") {
      throw new Error("parseYaml() is required for YAML catalogs");
    }
    const parsed = await parseYaml(text);
    const normalized = normalizeNetboxDeviceType({
      slug: raw,
      manufacturerFromPath: manufacturer,
      modelFromPath: model,
      raw: parsed,
    });

    cache.set(raw, normalized);
    return normalized;
  };

  const getBySlugOrThrow = (slug: string) => loadOne(slug);

  const getManyBySlugOrThrow = async (
    slugs: string[] | string,
  ): Promise<NetboxDeviceTypeSpec[]> => {
    const list = Array.isArray(slugs) ? slugs : [slugs];
    const out: NetboxDeviceTypeSpec[] = [];
    for (const slug of list) out.push(await loadOne(slug));
    if (out.length !== list.length) {
      throw new Error(`Expected ${list.length} items, got ${out.length}`);
    }
    return out;
  };

  return {
    getBySlugOrThrow,
    getManyBySlugOrThrow,
  };
}

export function createNetboxDeviceTypeCatalogFromIndex<T = unknown>(
  index: unknown = {},
): NetboxDeviceTypeCatalog<T> {
  const idxRec: Record<string, unknown> = (index && typeof index === "object")
    ? (index as Record<string, unknown>)
    : {};
  const items: Record<string, unknown> =
    (idxRec.items && typeof idxRec.items === "object")
      ? (idxRec.items as Record<string, unknown>)
      : {};

  const getBySlugOrThrow = (slug: string): Promise<T> => {
    const { raw } = assertSafeSlug(slug);
    const v = items[raw];
    if (!v) throw new Error(`Unknown device slug: ${raw}`);
    return Promise.resolve(v as T);
  };

  const getManyBySlugOrThrow = async (
    slugs: string[] | string,
  ): Promise<T[]> => {
    const list = Array.isArray(slugs) ? slugs : [slugs];
    const out: T[] = [];
    for (const slug of list) out.push(await getBySlugOrThrow(slug));
    if (out.length !== list.length) {
      throw new Error(`Expected ${list.length} items, got ${out.length}`);
    }
    return out;
  };

  return { getBySlugOrThrow, getManyBySlugOrThrow };
}

// Runtime-friendly loader: load a prebuilt JSON index (generated from NetBox YAML via a Deno build step).
export function createNetboxDeviceTypeCatalogJson(
  { indexPath = "data/netbox-device-types.json" } = {},
) {
  let indexPromise: Promise<unknown> | null = null;

  const loadIndex = () => {
    if (!indexPromise) {
      indexPromise = (async () => {
        const text = await defaultReadText(indexPath);
        return JSON.parse(text);
      })();
    }
    return indexPromise;
  };

  const getBySlugOrThrow = async (slug: string) => {
    const index = await loadIndex();
    const catalog = createNetboxDeviceTypeCatalogFromIndex<NetboxDeviceTypeSpec>(
      index,
    );
    return catalog.getBySlugOrThrow(slug);
  };

  const getManyBySlugOrThrow = async (slugs: string[] | string) => {
    const index = await loadIndex();
    const catalog = createNetboxDeviceTypeCatalogFromIndex<NetboxDeviceTypeSpec>(
      index,
    );
    return catalog.getManyBySlugOrThrow(slugs);
  };

  return { getBySlugOrThrow, getManyBySlugOrThrow };
}

// Enrich per-network device instances from NetBox device types.
// - If a device has `deviceTypeSlug` (Manufacturer/Model), the matching NetBox spec is loaded.
// - Instance fields like `id`, `name` remain authoritative.
// - If instance `ports` is missing/empty, ports are taken from NetBox spec.
export async function enrichDevicesFromNetbox({
  devices = [],
  catalog,
  slugField = "deviceTypeSlug",
}: {
  devices?: unknown[];
  catalog: { getBySlugOrThrow: (slug: string) => Promise<unknown> };
  slugField?: string;
}): Promise<Record<string, unknown>[]> {
  if (!catalog) throw new Error("catalog is required");
  if (!Array.isArray(devices)) throw new Error("devices must be an array");

  const out: Record<string, unknown>[] = [];
  for (const device of devices) {
    const rec = (device ?? {}) as Record<string, unknown>;
    const slug = normalizeQuery(rec[slugField]);
    if (!slug) {
      out.push(normalizeDevice(device));
      continue;
    }

    const spec = await catalog.getBySlugOrThrow(slug);
    const specRec: Record<string, unknown> = (spec && typeof spec === "object")
      ? (spec as Record<string, unknown>)
      : {};
    const normalizedInstance = normalizeDevice(device);
    const instanceHasPorts = Array.isArray(normalizedInstance.ports) &&
      normalizedInstance.ports.length > 0;
    const role = toStr(rec.role);
    const type = normalizedInstance.type || role || toStr(specRec.type);
    const specPorts = Array.isArray(specRec.ports) ? specRec.ports : [];

    out.push({
      ...specRec,
      ...normalizedInstance,
      brand: normalizedInstance.brand || toStr(specRec.brand),
      model: normalizedInstance.model || toStr(specRec.model),
      type,
      deviceTypeSlug: slug,
      deviceType: specRec,
      ports: instanceHasPorts ? normalizedInstance.ports : specPorts,
    });
  }
  return out;
}
