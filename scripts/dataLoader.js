import { createNetboxDeviceTypeCatalogJson, enrichDevicesFromNetbox } from './deviceCatalog.js';

export async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

export async function loadData({ basePath = 'data/networks/small-office', includeTraffic = true } = {}) {
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
    ? devices.map((d) => {
      if (!d || typeof d !== 'object') return d;
      if (typeof d.deviceTypeSlug === 'string' && d.deviceTypeSlug.trim().length) return d;
      if (typeof d.type_slug === 'string' && d.type_slug.trim().length) return { ...d, deviceTypeSlug: d.type_slug };
      return d;
    })
    : devices;

  let devicesOut = devicesWithSlug;
  if (Array.isArray(devicesWithSlug) && devicesWithSlug.some((d) => d && typeof d.deviceTypeSlug === 'string' && d.deviceTypeSlug.trim().length)) {
    try {
      const catalog = createNetboxDeviceTypeCatalogJson({
        indexPath: 'data/netbox-device-types.json',
      });
      devicesOut = await enrichDevicesFromNetbox({ devices: devicesWithSlug, catalog });
    } catch (err) {
      console.warn('NetBox catalog unavailable; continuing without enrichment.', err);
    }
  }

  return { devices: devicesOut, connections, traffic };
}

