// SECURITY NOTE:
// This script currently parses YAML using Deno std (@std/yaml).
// TODO(security): Replace YAML parsing with a non-JS converter/binary (preferably Rust)
// that converts the NetBox YAML library into a JSON index, so no YAML parsing is
// needed in our codebase.

import { parse } from "@std/yaml";
import { expandGlob } from "@std/fs";
import { dirname, join, relative } from "@std/path";

type NetboxRaw = Record<string, unknown>;

type Port = {
  id: string;
  kind: string;
  type?: string;
  mgmtOnly?: boolean;
  poeMode?: string;
  poeType?: string;
  description?: string;
};

type DeviceType = {
  id: string; // "Manufacturer/ModelFileBase"
  slug: string; // same as id
  brand: string;
  model: string;
  partNumber?: string;
  ports: Port[];
  sourcePath: string;
};

type IndexFile = {
  schemaVersion: 1;
  generatedAt: string;
  sourceRoot: string;
  items: Record<string, DeviceType>;
};

function toStr(v: unknown): string {
  return v == null ? "" : String(v);
}

function normalizeFromNetbox({
  slug,
  manufacturerFromPath,
  modelFromPath,
  raw,
  sourcePath,
}: {
  slug: string;
  manufacturerFromPath: string;
  modelFromPath: string;
  raw: NetboxRaw;
  sourcePath: string;
}): DeviceType {
  const manufacturer = toStr(raw.manufacturer ?? manufacturerFromPath);
  const model = toStr(raw.model ?? modelFromPath);
  const partNumber = toStr(raw.part_number);

  const ports: Port[] = [];

  const pushPorts = (list: unknown, kind: string) => {
    if (!Array.isArray(list)) return;
    for (const p of list) {
      if (p == null || typeof p !== "object") continue;
      const name = (p as Record<string, unknown>).name;
      if (name == null) continue;
      ports.push({
        id: toStr(name),
        kind,
        type: toStr((p as Record<string, unknown>).type) || undefined,
        mgmtOnly: Boolean((p as Record<string, unknown>).mgmt_only),
        poeMode: toStr((p as Record<string, unknown>).poe_mode) || undefined,
        poeType: toStr((p as Record<string, unknown>).poe_type) || undefined,
        description: toStr((p as Record<string, unknown>).description) ||
          undefined,
      });
    }
  };

  pushPorts(raw.interfaces, "interface");
  pushPorts(raw["console-ports"], "console");
  pushPorts(raw["power-ports"], "power");
  pushPorts(raw["power-outlets"], "power-outlet");
  pushPorts(raw["rear-ports"], "rear");
  pushPorts(raw["front-ports"], "front");

  return {
    id: slug,
    slug,
    brand: manufacturer,
    model: model || modelFromPath,
    partNumber: partNumber || undefined,
    ports,
    sourcePath,
  };
}

function assertSafeRoot(rootDir: string) {
  if (!rootDir || rootDir.includes("..")) {
    throw new Error(`Invalid rootDir: ${rootDir}`);
  }
}

export async function buildNetboxDeviceTypeIndex({
  rootDir,
  deviceTypesDir = "device-types",
}: {
  rootDir: string;
  deviceTypesDir?: string;
}): Promise<IndexFile> {
  assertSafeRoot(rootDir);
  const base = join(rootDir, deviceTypesDir);

  const items: Record<string, DeviceType> = {};

  for await (const entry of expandGlob("**/*.yaml", { root: base })) {
    if (!entry.isFile) continue;

    // NetBox library layout: device-types/<Manufacturer>/<Model>.yaml
    const rel = relative(base, entry.path);
    const parts = rel.split("/");
    if (parts.length < 2) continue;

    const manufacturer = parts[0];
    const fileName = parts[parts.length - 1];
    const modelFileBase = fileName.replace(/\.ya?ml$/i, "");
    const slug = `${manufacturer}/${modelFileBase}`;

    const text = await Deno.readTextFile(entry.path);
    const raw = parse(text) as NetboxRaw;

    items[slug] = normalizeFromNetbox({
      slug,
      manufacturerFromPath: manufacturer,
      modelFromPath: modelFileBase,
      raw,
      sourcePath: rel,
    });
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceRoot: rootDir,
    items,
  };
}

if (import.meta.main) {
  const rootDir = Deno.args[0] ?? "vendor/netbox-devicetype-library";
  const outPath = Deno.args[1] ?? "data/netbox-device-types.json";

  const index = await buildNetboxDeviceTypeIndex({ rootDir });
  await Deno.mkdir(dirname(outPath), { recursive: true }).catch(() => {});
  await Deno.writeTextFile(outPath, JSON.stringify(index, null, 2) + "\n");
  console.log(
    `Wrote ${Object.keys(index.items).length} device types to ${outPath}`,
  );
}
