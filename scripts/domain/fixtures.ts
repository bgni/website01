import type {
  Connection,
  ConnectionEnd,
  Device,
  TrafficUpdate,
} from "./types.ts";
import { FixtureValidationError } from "./errors.ts";

type Rec = Record<string, unknown>;

const isRecord = (v: unknown): v is Rec =>
  v != null && typeof v === "object" && !Array.isArray(v);

const toStr = (v: unknown): string => (v == null ? "" : String(v));

const nonEmptyStr = (v: unknown): string => toStr(v).trim();

const fail = (ctx: string, msg: string): never => {
  throw new FixtureValidationError(ctx, msg);
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
): Device[] {
  if (!Array.isArray(raw)) fail(ctx, "expected an array");
  const list = raw as unknown[];

  return list.map((item, index) => {
    const itemCtx = `${ctx}[${index}]`;
    if (!isRecord(item)) fail(itemCtx, "expected an object");
    const rec = item as Rec;

    const id = nonEmptyStr(rec.id);
    if (!id) fail(itemCtx, "missing required field 'id'");

    const name = nonEmptyStr(rec.name) || id;

    // Fixtures frequently omit these when `type_slug` is present (NetBox enrichment fills them).
    // Normalize to empty strings so UI rendering doesn't show "undefined".
    const brand = toStr(rec.brand);
    const model = toStr(rec.model);

    // Prefer explicit `type`, otherwise fall back to role.
    const type = nonEmptyStr(rec.type) || nonEmptyStr(rec.role) || "";

    const ports = Array.isArray(rec.ports) ? rec.ports : [];

    const deviceTypeSlug = nonEmptyStr(rec.deviceTypeSlug) ||
      nonEmptyStr(rec.type_slug) ||
      undefined;

    return {
      ...rec,
      id,
      name,
      type,
      brand,
      model,
      ports,
      deviceTypeSlug,
    } satisfies Device;
  });
}

const parseConnectionEnd = (
  raw: unknown,
  ctx: string,
): ConnectionEnd => {
  if (!isRecord(raw)) fail(ctx, "expected an object");
  const rec = raw as Rec;
  const deviceId = nonEmptyStr(rec.deviceId);
  if (!deviceId) fail(ctx, "missing required field 'deviceId'");

  const portId = nonEmptyStr(rec.portId);
  return {
    ...rec,
    deviceId,
    ...(portId ? { portId } : {}),
  } satisfies ConnectionEnd;
};

export function parseConnectionsFixture(
  raw: unknown,
  ctx = "connections",
): Connection[] {
  if (!Array.isArray(raw)) fail(ctx, "expected an array");
  const list = raw as unknown[];

  return list.map((item, index) => {
    const itemCtx = `${ctx}[${index}]`;
    if (!isRecord(item)) fail(itemCtx, "expected an object");
    const rec = item as Rec;

    const id = nonEmptyStr(rec.id);
    if (!id) fail(itemCtx, "missing required field 'id'");

    const from = parseConnectionEnd(rec.from, `${itemCtx}.from`);
    const to = parseConnectionEnd(rec.to, `${itemCtx}.to`);

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

// Lenient helper for runtime traffic connectors.
// Accepts:
// - a single update object
// - an array of update objects
// - a timeline object `{ initial, updates }` (uses `initial` when present)
// Drops invalid entries rather than throwing.
export function normalizeTrafficUpdatesPayload(
  raw: unknown,
): TrafficUpdate[] {
  const asList = (v: unknown): unknown[] => {
    if (Array.isArray(v)) return v;
    if (!v || typeof v !== "object") return [];
    const rec = v as Record<string, unknown>;
    if (Array.isArray(rec.initial)) return rec.initial;
    if (Array.isArray(rec.updates)) return rec.updates;
    return [v];
  };

  const normalizeOne = (v: unknown): TrafficUpdate | null => {
    if (!isRecord(v)) return null;
    const rec = v as Rec;
    const connectionId = nonEmptyStr(rec.connectionId);
    if (!connectionId) return null;

    const status = typeof rec.status === "string" ? rec.status.trim() : "";
    const rateMbps = toNum(rec.rateMbps);
    const utilization = toNum(rec.utilization);

    const out: TrafficUpdate = { ...rec, connectionId };
    if (status) out.status = status;
    if (rateMbps != null) out.rateMbps = rateMbps;
    if (utilization != null) out.utilization = utilization;
    return out;
  };

  return asList(raw)
    .map(normalizeOne)
    .filter((x): x is TrafficUpdate => Boolean(x));
}
