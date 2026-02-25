import type { Connection, DeviceType, NetworkDevice } from "./types.ts";
import { FixtureValidationError } from "./errors.ts";
import { isLinkableInterfaceType } from "./interfaceTypes.ts";

const fail = (ctx: string, msg: string): never => {
  throw new FixtureValidationError(ctx, msg);
};

const nonEmptyStr = (v: unknown): string => (v == null ? "" : String(v)).trim();

// Legacy authoring shorthand: allow connections to reference interfaces as "pN".
// This maps to the Nth interface on the device type (preferring non-mgmtOnly
// interfaces when available). This is intentionally supported to keep writing
// network maps ergonomic while the canonical internal representation remains a
// real `interfaceId`.
const parseLegacyInterfaceOrdinal = (interfaceId: string): number | null => {
  const m = /^p(\d+)$/i.exec(interfaceId.trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
};

export function normalizeLegacyInterfaceIds(
  {
    devices,
    connections,
    deviceTypes,
    devicesCtx = "devices",
    connectionsCtx = "connections",
  }: {
    devices: NetworkDevice[];
    connections: Connection[];
    deviceTypes: Record<string, DeviceType>;
    devicesCtx?: string;
    connectionsCtx?: string;
  },
): Connection[] {
  const deviceById = new Map<string, NetworkDevice>();
  const deviceCtxById = new Map<string, string>();
  devices.forEach((d, index) => {
    deviceById.set(d.id, d);
    deviceCtxById.set(d.id, `${devicesCtx}[${index}]`);
  });

  const mapEnd = (
    end: { deviceId: string; interfaceId?: string },
    endCtx: string,
  ): { deviceId: string; interfaceId?: string } => {
    const interfaceId = end.interfaceId;
    if (!interfaceId) return end;

    const ordinal = parseLegacyInterfaceOrdinal(interfaceId);
    if (!ordinal) return end;

    const dev = deviceById.get(end.deviceId);
    if (!dev) {
      throw new FixtureValidationError(
        `${endCtx}.deviceId`,
        `unknown deviceId '${end.deviceId}'`,
      );
    }

    const typeSlug = dev.deviceTypeSlug;
    if (!typeSlug) {
      const devCtx = deviceCtxById.get(end.deviceId) ?? devicesCtx;
      throw new FixtureValidationError(
        `${devCtx}.deviceTypeSlug`,
        `required when referenced by a connection interface (${endCtx}.interfaceId=${interfaceId})`,
      );
    }

    const dt = deviceTypes[typeSlug];
    if (!dt) {
      throw new FixtureValidationError(
        `${deviceCtxById.get(end.deviceId) ?? devicesCtx}.deviceTypeSlug`,
        `unknown device type slug '${typeSlug}'`,
      );
    }

    const linkableCandidates = dt.ports.filter((p) =>
      !p.mgmtOnly && isLinkableInterfaceType(p.interfaceType)
    );
    const nonMgmtCandidates = dt.ports.filter((p) => !p.mgmtOnly);
    const ports = linkableCandidates.length
      ? linkableCandidates
      : (nonMgmtCandidates.length ? nonMgmtCandidates : dt.ports);
    if (!ports.length) {
      throw new FixtureValidationError(
        `${endCtx}.interfaceId`,
        `device type '${typeSlug}' has no ports`,
      );
    }

    const idx = ordinal - 1;
    const mapped = ports[idx]?.id;
    if (!mapped) {
      throw new FixtureValidationError(
        `${endCtx}.interfaceId`,
        `legacy interface '${interfaceId}' out of range for device type '${typeSlug}'`,
      );
    }

    return { ...end, interfaceId: mapped };
  };

  return connections.map((c, index) => {
    const cctx = `${connectionsCtx}[${index}]`;
    return {
      ...c,
      from: mapEnd(c.from, `${cctx}.from`),
      to: mapEnd(c.to, `${cctx}.to`),
    };
  });
}

export function validateTopology(
  {
    devices,
    connections,
    deviceTypes,
    devicesCtx = "devices",
    connectionsCtx = "connections",
  }: {
    devices: NetworkDevice[];
    connections: Connection[];
    deviceTypes: Record<string, DeviceType>;
    devicesCtx?: string;
    connectionsCtx?: string;
  },
): void {
  const deviceById = new Map<string, NetworkDevice>();
  const deviceCtxById = new Map<string, string>();

  devices.forEach((d, index) => {
    deviceById.set(d.id, d);
    deviceCtxById.set(d.id, `${devicesCtx}[${index}]`);

    if (d.deviceTypeSlug) {
      if (!deviceTypes[d.deviceTypeSlug]) {
        fail(
          `${devicesCtx}[${index}].deviceTypeSlug`,
          `unknown device type slug '${d.deviceTypeSlug}'`,
        );
      }
    }
  });

  const interfacesByType = new Map<
    string,
    Map<string, DeviceType["ports"][number]>
  >();
  const getInterfacesById = (
    typeSlug: string,
  ): Map<string, DeviceType["ports"][number]> => {
    const cached = interfacesByType.get(typeSlug);
    if (cached) return cached;

    const dt = deviceTypes[typeSlug];
    if (!dt) {
      // This should be caught when validating devices, but keep this defensive.
      fail("deviceTypes", `missing required device type '${typeSlug}'`);
    }
    const byId = new Map(dt.ports.map((p) => [p.id, p] as const));
    interfacesByType.set(typeSlug, byId);
    return byId;
  };

  connections.forEach((c, index) => {
    const cctx = `${connectionsCtx}[${index}]`;

    const ends: Array<[
      "from" | "to",
      { deviceId: string; interfaceId?: string },
    ]> = [["from", c.from], ["to", c.to]];

    for (const [side, end] of ends) {
      const endCtx = `${cctx}.${side}`;

      const deviceId = nonEmptyStr(end.deviceId);
      if (!deviceId) fail(`${endCtx}.deviceId`, "must be a non-empty string");

      const dev = deviceById.get(deviceId);
      if (!dev) {
        throw new FixtureValidationError(
          `${endCtx}.deviceId`,
          `unknown deviceId '${deviceId}'`,
        );
      }

      if (end.interfaceId) {
        const interfaceId = nonEmptyStr(end.interfaceId);
        if (!interfaceId) {
          fail(`${endCtx}.interfaceId`, "must be a non-empty string");
        }

        const typeSlug = dev.deviceTypeSlug;
        if (!typeSlug) {
          const devCtx = deviceCtxById.get(deviceId) ?? devicesCtx;
          throw new FixtureValidationError(
            `${devCtx}.deviceTypeSlug`,
            `required when referenced by a connection interface (${c.id} ${side}.${interfaceId})`,
          );
        }

        const byId = getInterfacesById(typeSlug);
        const port = byId.get(interfaceId);
        if (!port) {
          throw new FixtureValidationError(
            `${endCtx}.interfaceId`,
            `unknown interfaceId '${interfaceId}' for device type '${typeSlug}'`,
          );
        }

        if (!isLinkableInterfaceType(port.interfaceType)) {
          const raw = typeof port.type === "string" ? port.type : "";
          fail(
            `${endCtx}.interfaceId`,
            `interface '${interfaceId}' is not linkable (type '${
              raw || "unknown"
            }')`,
          );
        }
      }
    }
  });
}
