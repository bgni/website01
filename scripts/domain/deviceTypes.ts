import type { DeviceType, DeviceTypePort } from "./types.ts";
import { FixtureValidationError } from "./errors.ts";
import { computeNetboxElevationThumbs } from "./netboxElevationThumbs.ts";
import { normalizeInterfaceType } from "./interfaceTypes.ts";

type Rec = Record<string, unknown>;

const isRecord = (v: unknown): v is Rec =>
  v != null && typeof v === "object" && !Array.isArray(v);

const toStr = (v: unknown): string => (v == null ? "" : String(v));

const nonEmptyStr = (v: unknown): string => toStr(v).trim();

const fail = (ctx: string, msg: string): never => {
  throw new FixtureValidationError(ctx, msg);
};

const parsePort = (raw: unknown, ctx: string): DeviceTypePort => {
  if (!isRecord(raw)) fail(ctx, "expected an object");
  const rec = raw as Rec;
  const id = nonEmptyStr(rec.id);
  if (!id) fail(ctx, "missing required field 'id'");

  const out: DeviceTypePort = { ...rec, id };

  if (typeof rec.kind === "string") out.kind = rec.kind;
  if (typeof rec.type === "string") {
    out.type = rec.type;
    out.interfaceType = normalizeInterfaceType(rec.type);
  }
  if (typeof rec.mgmtOnly === "boolean") out.mgmtOnly = rec.mgmtOnly;

  return out;
};

export type DeviceTypeIndex = {
  schemaVersion: number;
  generatedAt?: string;
  sourceRoot?: string;
  items: Record<string, unknown>;
};

export function parseDeviceTypeIndex(
  raw: unknown,
  ctx = "deviceTypes",
): Record<string, DeviceType> {
  if (!isRecord(raw)) fail(ctx, "expected an object");
  const rec = raw as Rec;

  const itemsRaw = rec.items;
  if (!isRecord(itemsRaw)) fail(`${ctx}.items`, "expected an object");

  const items = itemsRaw as Record<string, unknown>;

  const out: Record<string, DeviceType> = {};
  for (const [key, value] of Object.entries(items)) {
    const itemCtx = `${ctx}.items[${JSON.stringify(key)}]`;
    if (!isRecord(value)) fail(itemCtx, "expected an object");
    const item = value as Rec;

    const slug = nonEmptyStr(item.slug);
    const id = nonEmptyStr(item.id) || slug || key;
    const brand = nonEmptyStr(item.brand);
    const model = nonEmptyStr(item.model);

    if (!id) fail(itemCtx, "missing required field 'id'");
    if (!slug) fail(itemCtx, "missing required field 'slug'");
    if (!brand) fail(itemCtx, "missing required field 'brand'");
    if (!model) fail(itemCtx, "missing required field 'model'");

    const partNumber = nonEmptyStr(item.partNumber) || undefined;

    const ports = Array.isArray(item.ports)
      ? (item.ports as unknown[]).map((p, i) =>
        parsePort(p, `${itemCtx}.ports[${i}]`)
      )
      : [];

    const thumbs = computeNetboxElevationThumbs(slug, `${itemCtx}.slug`);

    if (out[slug]) {
      fail(itemCtx, `duplicate device type slug '${slug}'`);
    }

    out[slug] = {
      ...item,
      id,
      slug,
      brand,
      model,
      ...(partNumber ? { partNumber } : {}),
      ports,
      ...(thumbs ? thumbs : {}),
    } satisfies DeviceType;
  }

  return out;
}

export async function loadDeviceTypeIndex(
  {
    indexPath = "data/netbox-device-types.json",
  }: { indexPath?: string } = {},
): Promise<Record<string, DeviceType>> {
  const res = await fetch(indexPath);
  if (!res.ok) throw new Error(`Failed to load ${indexPath}`);
  const raw = await res.json();
  return parseDeviceTypeIndex(raw, indexPath);
}
