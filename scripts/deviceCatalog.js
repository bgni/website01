const toStr = (v) => (v == null ? '' : String(v));

const normalizePort = (port, index) => {
  if (port == null) return { id: `p${index + 1}` };
  if (typeof port === 'string') return { id: port };
  if (typeof port === 'number') return { id: `p${port}` };
  if (typeof port === 'object' && port.id != null) return { ...port, id: String(port.id) };
  return { id: `p${index + 1}` };
};

export const normalizeDevice = (device) => {
  const ports = Array.isArray(device?.ports) ? device.ports.map(normalizePort) : [];
  return {
    ...device,
    id: toStr(device?.id),
    name: toStr(device?.name),
    brand: toStr(device?.brand),
    model: toStr(device?.model),
    type: toStr(device?.type),
    ports,
  };
};

const normalizeQuery = (q) => toStr(q).trim();

export function createDeviceLookup(devices = []) {
  const normalized = devices.map(normalizeDevice);

  const byId = new Map();
  const byIdLower = new Map();

  normalized.forEach((d) => {
    if (!d.id) return;
    byId.set(d.id, d);
    byIdLower.set(d.id.toLowerCase(), d);
  });

  const getBySlugOrThrow = (slug) => {
    const raw = normalizeQuery(slug);
    if (!raw) throw new Error('Device slug is required');

    if (byId.has(raw)) return byId.get(raw);
    const lower = raw.toLowerCase();
    if (byIdLower.has(lower)) return byIdLower.get(lower);

    throw new Error(`Unknown device slug: ${raw}`);
  };

  const getManyBySlugOrThrow = (slugs) => {
    const list = Array.isArray(slugs) ? slugs : [slugs];
    const devicesOut = list.map(getBySlugOrThrow);
    if (devicesOut.length !== list.length) {
      throw new Error(`Expected ${list.length} devices, got ${devicesOut.length}`);
    }
    return devicesOut;
  };

  return {
    devices: normalized,
    getBySlugOrThrow,
    getManyBySlugOrThrow,
  };
}

export async function loadDeviceLookup({ devicesPath = 'data/devices_v2.json' } = {}) {
  const res = await fetch(devicesPath);
  if (!res.ok) throw new Error(`Failed to load ${devicesPath}`);
  const devices = await res.json();
  return createDeviceLookup(devices);
}

const joinPath = (...parts) => parts
  .filter((p) => p != null && String(p).length)
  .map((p) => String(p).replace(/(^\/|\/$)/g, ''))
  .filter(Boolean)
  .join('/');

const assertSafeSlug = (slug) => {
  const raw = normalizeQuery(slug);
  if (!raw) throw new Error('Device type slug is required');
  if (raw.includes('..') || raw.includes('\\') || raw.startsWith('/')) {
    throw new Error(`Invalid device type slug: ${raw}`);
  }
  const parts = raw.split('/').filter(Boolean);
  if (parts.length !== 2) {
    throw new Error(`Device type slug must be '<Manufacturer>/<Model>': ${raw}`);
  }
  return { raw, manufacturer: parts[0], model: parts[1] };
};

const defaultReadText = async (path) => {
  if (typeof globalThis.Deno !== 'undefined' && typeof globalThis.Deno.readTextFile === 'function') {
    return globalThis.Deno.readTextFile(path);
  }
  if (typeof fetch === 'function') {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load ${path}`);
    return res.text();
  }
  throw new Error('No reader available; provide readText()');
};

export const normalizeNetboxDeviceType = ({ slug, manufacturerFromPath, modelFromPath, raw }) => {
  const manufacturer = toStr(raw?.manufacturer || manufacturerFromPath);
  const model = toStr(raw?.model || modelFromPath);

  const ports = [];
  const pushPorts = (list, kind) => {
    if (!Array.isArray(list)) return;
    list.forEach((p) => {
      if (!p || p.name == null) return;
      ports.push({
        id: toStr(p.name),
        kind,
        type: toStr(p.type),
        mgmtOnly: Boolean(p.mgmt_only),
        poeMode: toStr(p.poe_mode),
        poeType: toStr(p.poe_type),
        description: toStr(p.description),
      });
    });
  };

  pushPorts(raw?.interfaces, 'interface');
  pushPorts(raw?.['console-ports'], 'console');
  pushPorts(raw?.['power-ports'], 'power');
  pushPorts(raw?.['power-outlets'], 'power-outlet');
  pushPorts(raw?.['rear-ports'], 'rear');
  pushPorts(raw?.['front-ports'], 'front');

  return {
    id: slug,
    slug,
    name: model || slug,
    brand: manufacturer,
    model,
    type: 'device type',
    ports,
    raw,
  };
};

// NetBox devicetype-library loader.
// Slug format is strict: '<Manufacturer>/<Model>' and resolves to:
//   <rootDir>/device-types/<Manufacturer>/<Model>.yaml
export function createNetboxDeviceTypeCatalog({
  rootDir = 'vendor/netbox-devicetype-library',
  deviceTypesDir = 'device-types',
  readText = defaultReadText,
  parseYaml,
} = {}) {
  const cache = new Map();

  const loadOne = async (slug) => {
    const { raw, manufacturer, model } = assertSafeSlug(slug);
    if (cache.has(raw)) return cache.get(raw);

    const path = joinPath(rootDir, deviceTypesDir, manufacturer, `${model}.yaml`);
    const text = await readText(path);
    if (typeof parseYaml !== 'function') throw new Error('parseYaml() is required for YAML catalogs');
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

  const getBySlugOrThrow = async (slug) => loadOne(slug);

  const getManyBySlugOrThrow = async (slugs) => {
    const list = Array.isArray(slugs) ? slugs : [slugs];
    const out = [];
    for (const slug of list) out.push(await loadOne(slug));
    if (out.length !== list.length) throw new Error(`Expected ${list.length} items, got ${out.length}`);
    return out;
  };

  return {
    getBySlugOrThrow,
    getManyBySlugOrThrow,
  };
}

export function createNetboxDeviceTypeCatalogFromIndex(index = {}) {
  const items = index?.items && typeof index.items === 'object' ? index.items : {};

  const getBySlugOrThrow = async (slug) => {
    const { raw } = assertSafeSlug(slug);
    const v = items[raw];
    if (!v) throw new Error(`Unknown device slug: ${raw}`);
    return v;
  };

  const getManyBySlugOrThrow = async (slugs) => {
    const list = Array.isArray(slugs) ? slugs : [slugs];
    const out = [];
    for (const slug of list) out.push(await getBySlugOrThrow(slug));
    if (out.length !== list.length) throw new Error(`Expected ${list.length} items, got ${out.length}`);
    return out;
  };

  return { getBySlugOrThrow, getManyBySlugOrThrow };
}

// Runtime-friendly loader: load a prebuilt JSON index (generated from NetBox YAML via a Deno build step).
export function createNetboxDeviceTypeCatalogJson({ indexPath = 'data/netbox-device-types.json' } = {}) {
  let indexPromise;

  const loadIndex = async () => {
    if (!indexPromise) {
      indexPromise = (async () => {
        const text = await defaultReadText(indexPath);
        return JSON.parse(text);
      })();
    }
    return indexPromise;
  };

  const getBySlugOrThrow = async (slug) => {
    const index = await loadIndex();
    const catalog = createNetboxDeviceTypeCatalogFromIndex(index);
    return catalog.getBySlugOrThrow(slug);
  };

  const getManyBySlugOrThrow = async (slugs) => {
    const index = await loadIndex();
    const catalog = createNetboxDeviceTypeCatalogFromIndex(index);
    return catalog.getManyBySlugOrThrow(slugs);
  };

  return { getBySlugOrThrow, getManyBySlugOrThrow };
}

// Enrich per-network device instances from NetBox device types.
// - If a device has `deviceTypeSlug` (Manufacturer/Model), the matching NetBox spec is loaded.
// - Instance fields like `id`, `name` remain authoritative.
// - If instance `ports` is missing/empty, ports are taken from NetBox spec.
/**
 * @param {{ devices?: any[], catalog: { getBySlugOrThrow: (slug: string) => Promise<any> }, slugField?: string }} params
 */
export async function enrichDevicesFromNetbox({ devices = /** @type {any[]} */ ([]), catalog, slugField = 'deviceTypeSlug' } = {}) {
  if (!catalog) throw new Error('catalog is required');
  if (!Array.isArray(devices)) throw new Error('devices must be an array');

  const out = [];
  for (const device of devices) {
    const slug = normalizeQuery(device?.[slugField]);
    if (!slug) {
      out.push(normalizeDevice(device));
      continue;
    }

    const spec = await catalog.getBySlugOrThrow(slug);
    const normalizedInstance = normalizeDevice(device);
    const instanceHasPorts = Array.isArray(normalizedInstance.ports) && normalizedInstance.ports.length > 0;
    const role = toStr(device?.role);
    const type = normalizedInstance.type || role || toStr(spec?.type);

    out.push({
      ...spec,
      ...normalizedInstance,
      brand: normalizedInstance.brand || spec.brand,
      model: normalizedInstance.model || spec.model,
      type,
      deviceTypeSlug: slug,
      deviceType: spec,
      ports: instanceHasPorts ? normalizedInstance.ports : spec.ports,
    });
  }
  return out;
}
