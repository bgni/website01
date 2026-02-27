import type {
  Connection,
  ConnectionEnd,
  NetworkDevice,
  TrafficUpdate,
} from "./types.ts";
import { FixtureValidationError } from "./errors.ts";
import { computeTieredLayoutHints } from "./layoutHints.ts";
import { inferDeviceKindFromType } from "./deviceKind.ts";

type Rec = Record<string, unknown>;

const isRecord = (v: unknown): v is Rec =>
  v != null && typeof v === "object" && !Array.isArray(v);

const toStr = (v: unknown): string => (v == null ? "" : String(v));

const nonEmptyStr = (v: unknown): string => toStr(v).trim();

const fail = (ctx: string, msg: string): never => {
  throw new FixtureValidationError(ctx, msg);
};

const optStr = (v: unknown, ctx: string): string | undefined => {
  if (v == null) return undefined;
  if (typeof v === "string") {
    const s = v.trim();
    return s ? s : undefined;
  }
  fail(ctx, "must be a string");
};

const toNum = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
};

export function parseDevicesFixture(
  raw: unknown,
  ctx = "devices",
): NetworkDevice[] {
  if (!Array.isArray(raw)) fail(ctx, "expected an array");
  const list = raw as unknown[];

  return list.map((item, index) => {
    const itemCtx = `${ctx}[${index}]`;
    if (!isRecord(item)) fail(itemCtx, "expected an object");
    const rec = item as Rec;

    const id = nonEmptyStr(rec.id);
    if (!id) fail(itemCtx, "missing required field 'id'");

    const name = nonEmptyStr(rec.name) || id;

    // Prefer explicit `type`, otherwise fall back to role.
    const type = nonEmptyStr(rec.type) || nonEmptyStr(rec.role) || "";

    const deviceKind = inferDeviceKindFromType(type);

    const deviceTypeSlugMaybe =
      optStr(rec.deviceTypeSlug, `${itemCtx}.deviceTypeSlug`) ??
        optStr(rec.type_slug, `${itemCtx}.type_slug`);
    const deviceTypeSlug = deviceTypeSlugMaybe;

    // Precompute layout hints at the domain boundary so internal layout logic
    // can avoid string parsing and heuristic inference.
    const { layoutTierIndexHint, layoutSiteRank, layoutStableKey } =
      computeTieredLayoutHints(rec);

    return {
      ...rec,
      id,
      name,
      type,
      deviceKind,
      ...(deviceTypeSlug ? { deviceTypeSlug } : {}),
      layoutTierIndexHint,
      layoutSiteRank,
      layoutStableKey,
    } satisfies NetworkDevice;
  });
}

const parseConnectionEnd = (
  raw: unknown,
  ctx: string,
  { allowLegacyPortIdMismatch = false }: {
    allowLegacyPortIdMismatch?: boolean;
  } = {},
): ConnectionEnd => {
  if (!isRecord(raw)) fail(ctx, "expected an object");
  const rec = raw as Rec;
  const deviceId = nonEmptyStr(rec.deviceId);
  if (!deviceId) fail(ctx, "missing required field 'deviceId'");

  // Preferred: `interfaceId` (real interface name like "GigabitEthernet1/0/1").
  // Legacy: `portId` (including "pN" shorthand). We accept it at the boundary
  // to keep fixture authoring simple, and normalize into `interfaceId`.
  const interfaceId = optStr(rec.interfaceId, `${ctx}.interfaceId`) ??
    optStr(rec.portId, `${ctx}.portId`);

  if (
    typeof rec.interfaceId === "string" && typeof rec.portId === "string" &&
    rec.interfaceId.trim() && rec.portId.trim() &&
    rec.interfaceId.trim() !== rec.portId.trim()
  ) {
    if (!allowLegacyPortIdMismatch) {
      fail(ctx, "fields 'interfaceId' and legacy 'portId' disagree");
    }
  }
  const out = { ...rec };
  delete out.portId;
  return {
    ...out,
    deviceId,
    ...(interfaceId ? { interfaceId } : {}),
  } satisfies ConnectionEnd;
};

export function parseConnectionsFixture(
  raw: unknown,
  ctx = "connections",
  options?: { allowLegacyPortIdMismatch?: boolean },
): Connection[] {
  if (!Array.isArray(raw)) fail(ctx, "expected an array");
  const list = raw as unknown[];

  return list.map((item, index) => {
    const itemCtx = `${ctx}[${index}]`;
    if (!isRecord(item)) fail(itemCtx, "expected an object");
    const rec = item as Rec;

    const id = nonEmptyStr(rec.id);
    if (!id) fail(itemCtx, "missing required field 'id'");

    const from = parseConnectionEnd(rec.from, `${itemCtx}.from`, options);
    const to = parseConnectionEnd(rec.to, `${itemCtx}.to`, options);

    // Prefer camelCase, but tolerate the legacy snake_case.
    const connectionType = nonEmptyStr(rec.connectionType) ||
      nonEmptyStr(rec.connection_type) ||
      undefined;

    return {
      ...rec,
      id,
      from,
      to,
      ...(connectionType ? { connectionType } : {}),
    } satisfies Connection;
  });
}

// Optional helper for cases where runtime wants to validate/normalize traffic fixtures.
// Not wired everywhere yet because traffic connectors intentionally accept loose payloads.
export function parseTrafficUpdatesFixture(
  raw: unknown,
  ctx = "traffic",
): TrafficUpdate[] {
  if (!Array.isArray(raw)) fail(ctx, "expected an array");
  const list = raw as unknown[];
  return list
    .filter(isRecord)
    .map((t, index) => {
      const itemCtx = `${ctx}[${index}]`;
      const rec = t as Rec;
      const connectionId = nonEmptyStr(rec.connectionId);
      if (!connectionId) fail(itemCtx, "missing required field 'connectionId'");
      return {
        ...rec,
        connectionId,
      } satisfies TrafficUpdate;
    });
}

// Strict helper for runtime traffic connectors.
// Accepts:
// - an array of update objects
// - a single update object
// - a timeline object `{ initial, updates }` (uses `initial` when present)
// Throws on invalid payload shape or invalid update entries.
export function parseTrafficUpdatesPayload(
  raw: unknown,
  ctx = "trafficPayload",
): TrafficUpdate[] {
  const list: unknown[] = (() => {
    if (Array.isArray(raw)) return raw;

    if (isRecord(raw)) {
      const rec = raw as Record<string, unknown>;
      if (Array.isArray(rec.initial)) return rec.initial;
      if (Array.isArray(rec.updates)) return rec.updates;
      return [raw];
    }

    return fail(ctx, "expected an array, an object, or a timeline object");
  })();

  return list.map((v, index) => {
    const itemCtx = `${ctx}[${index}]`;
    if (!isRecord(v)) fail(itemCtx, "expected an object");
    const rec = v as Rec;

    const connectionId = nonEmptyStr(rec.connectionId);
    if (!connectionId) fail(itemCtx, "missing required field 'connectionId'");

    const out: TrafficUpdate = { ...rec, connectionId };

    const statusRaw = rec.status;
    if (typeof statusRaw === "string") {
      const status = statusRaw.trim();
      if (status) out.status = status;
    } else if (statusRaw !== undefined) {
      fail(itemCtx, "field 'status' must be a string when provided");
    }

    const rateMbps = toNum(rec.rateMbps);
    if (rateMbps != null) out.rateMbps = rateMbps;

    const utilization = toNum(rec.utilization);
    if (utilization != null) out.utilization = utilization;

    return out;
  });
}
