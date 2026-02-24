import { join } from "@std/path";
import { applyTieredLayout } from "../scripts/layouts/tiered.ts";
import { typeColor } from "../scripts/lib/colors.ts";
import { inferDeviceKindFromType } from "../scripts/domain/deviceKind.ts";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

type NetworkDevice = {
  id: string;
  name?: string;
  role?: string;
  type?: string;
  site?: string;
  room_id?: string;
};

type Connection = {
  id: string;
  description?: string;
  from: { deviceId: string; portId?: string };
  to: { deviceId: string; portId?: string };
};

type LayoutNode = NetworkDevice & {
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  __tier?: string;
  __tierIndex?: number;
};

type LayoutLink = {
  id: string;
  source: string | { id: string; x?: number; y?: number };
  target: string | { id: string; x?: number; y?: number };
};

type NetworkIndex = {
  defaultId?: string;
  networks?: { id: string; name?: string }[];
};

type RenderOptions = {
  width: number;
  height: number;
  outDir: string;
  networks: string[] | null;
  layouts: string[];
};

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 720;
const DEFAULT_LAYOUTS = ["tiered", "force"];

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await Deno.readTextFile(path));

const ensureDir = async (path: string) => {
  await Deno.mkdir(path, { recursive: true });
};

const getArgValue = (args: string[], name: string) => {
  const idx = args.indexOf(name);
  if (idx < 0) return null;
  return args[idx + 1] ?? null;
};

const getArgValues = (args: string[], name: string): string[] => {
  const idx = args.indexOf(name);
  if (idx < 0) return [];
  const value = args[idx + 1] ?? "";
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
};

const hasFlag = (args: string[], name: string) => args.includes(name);

const usage = () => {
  console.log(
    `Usage: deno run --allow-read --allow-write tools/render_network_svgs.ts [options]

Options:
  --out <dir>           Output directory (default: docs/rendered)
  --networks <a,b,c>    Only render specific network IDs
  --layouts <a,b,c>     Layouts to render (default: ${
      DEFAULT_LAYOUTS.join(",")
    })
  --width <n>           SVG width / viewBox width (default: ${DEFAULT_WIDTH})
  --height <n>          SVG height / viewBox height (default: ${DEFAULT_HEIGHT})
  --help                Show help

Notes:
  - "tiered" uses the deterministic Layered layout (applyTieredLayout)
  - "force" is rendered deterministically by seeding initial node positions and running a fixed number of ticks
  - Output is stable and suitable for documentation + diffs
`,
  );
};

const parseOptions = (args: string[]): RenderOptions => {
  if (hasFlag(args, "--help") || hasFlag(args, "-h")) {
    usage();
    Deno.exit(0);
  }

  const outDir = getArgValue(args, "--out") || "docs/rendered";
  const networks = getArgValues(args, "--networks");
  const layoutsRaw = getArgValues(args, "--layouts");
  const width = Number(getArgValue(args, "--width") || DEFAULT_WIDTH);
  const height = Number(getArgValue(args, "--height") || DEFAULT_HEIGHT);

  if (!Number.isFinite(width) || width <= 0) {
    throw new Error(`Invalid --width: ${width}`);
  }
  if (!Number.isFinite(height) || height <= 0) {
    throw new Error(`Invalid --height: ${height}`);
  }

  return {
    width,
    height,
    outDir,
    networks: networks.length ? networks : null,
    layouts: (layoutsRaw.length ? layoutsRaw : DEFAULT_LAYOUTS)
      .map((l) => String(l).trim().toLowerCase())
      .filter(Boolean),
  };
};

const hash32 = (input: string) => {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

const seeded01 = (seed: number) => {
  // Deterministic 0..1 using xorshift.
  let x = seed >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return (x >>> 0) / 0xffffffff;
};

const buildInitialPositions = (
  nodes: LayoutNode[],
  width: number,
  height: number,
) => {
  // Keep nodes away from UI overlay area (similar to tiered padding).
  const paddingTop = 56;
  const paddingBottom = 24;
  const paddingX = 28;
  const left = paddingX;
  const right = Math.max(left + 1, width - paddingX);
  const top = paddingTop;
  const bottom = Math.max(top + 1, height - paddingBottom);

  for (const n of nodes) {
    const h = hash32(String(n.id));
    const rx = seeded01(h ^ 0x9e3779b9);
    const ry = seeded01(h ^ 0x85ebca6b);
    n.x = left + rx * (right - left);
    n.y = top + ry * (bottom - top);
    n.fx = null;
    n.fy = null;
  }
};

const applyDeterministicForceLayout = (
  nodes: LayoutNode[],
  links: LayoutLink[],
  width: number,
  height: number,
) => {
  buildInitialPositions(nodes, width, height);

  // d3-force mutates link endpoints to node objects.
  type ForceNode = LayoutNode & SimulationNodeDatum;
  type ForceLink = SimulationLinkDatum<ForceNode> & { id: string };
  const simLinks = links.map((l) => ({ ...l })) as ForceLink[];

  const sim = forceSimulation(nodes as ForceNode[])
    .force(
      "link",
      forceLink<ForceNode, ForceLink>(simLinks)
        .id((d: ForceNode) => d.id)
        .distance(130)
        .strength(0.6),
    )
    .force("charge", forceManyBody().strength(-260))
    .force("center", forceCenter(width / 2, height / 2))
    .force("collide", forceCollide(26));

  // Fixed tick count for stable output.
  sim.alpha(1);
  for (let i = 0; i < 320; i += 1) sim.tick();
  sim.stop();

  return { guides: [] as { y: number }[] };
};

const renderSvg = ({
  networkId,
  networkName,
  nodes,
  links,
  guides,
  width,
  height,
}: {
  networkId: string;
  networkName?: string;
  nodes: LayoutNode[];
  links: LayoutLink[];
  guides: { y: number }[];
  width: number;
  height: number;
}) => {
  const title = networkName ? `${networkName} (${networkId})` : networkId;

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const resolvePos = (ref: LayoutLink["source"]) => {
    const id = typeof ref === "string" ? ref : ref?.id;
    const n = nodeById.get(id);
    return {
      id,
      x: n?.x ?? 0,
      y: n?.y ?? 0,
    };
  };

  const guideEls = [...guides]
    .filter((g) => Number.isFinite(g?.y))
    .sort((a, b) => a.y - b.y)
    .map((g) =>
      `<line x1="0" y1="${g.y}" x2="${width}" y2="${g.y}" stroke="#1f2937" stroke-width="1" stroke-opacity="0.75" />`
    )
    .join("\n");

  const linkEls = [...links]
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map((l) => {
      const s = resolvePos(l.source);
      const t = resolvePos(l.target);
      return `<line data-id="${
        escapeXml(String(l.id))
      }" x1="${s.x}" y1="${s.y}" x2="${t.x}" y2="${t.y}" stroke="#334155" stroke-opacity="0.6" stroke-width="1.4" />`;
    })
    .join("\n");

  const nodeEls = [...nodes]
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map((n) => {
      const type = String(n.type || n.role || "").trim();
      const fill = typeColor(inferDeviceKindFromType(type));
      return `<circle data-id="${
        escapeXml(n.id)
      }" cx="${n.x}" cy="${n.y}" r="12" fill="${fill}" stroke="#0b1220" stroke-width="2" />`;
    })
    .join("\n");

  const labelEls = [...nodes]
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map((n) => {
      const name = escapeXml(String(n.name || n.id));
      const x = n.x ?? 0;
      const y = (n.y ?? 0) + 24;
      return `<text x="${x}" y="${y}" fill="#e2e8f0" font-size="11" text-anchor="middle">${name}</text>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${
    escapeXml(title)
  }">
  <title>${escapeXml(title)}</title>
  <desc>Generated by tools/render_network_svgs.ts.</desc>
  <g class="layer-guides" pointer-events="none">
${guideEls ? "    " + guideEls.split("\n").join("\n    ") : ""}
  </g>
  <g class="layer-links">
${linkEls ? "    " + linkEls.split("\n").join("\n    ") : ""}
  </g>
  <g class="layer-nodes">
${nodeEls ? "    " + nodeEls.split("\n").join("\n    ") : ""}
  </g>
  <g class="layer-labels">
${labelEls ? "    " + labelEls.split("\n").join("\n    ") : ""}
  </g>
</svg>
`;
};

const main = async () => {
  const options = parseOptions(Deno.args);
  const root = Deno.cwd();

  const indexPath = join(root, "data", "networks", "index.json");
  const index = await readJson<NetworkIndex>(indexPath);
  const allNetworks = (index.networks || []).map((n) => ({
    id: String(n.id),
    name: n.name,
  }));

  const selectedNetworks = options.networks
    ? allNetworks.filter((n) => options.networks!.includes(n.id))
    : allNetworks;

  if (!selectedNetworks.length) {
    throw new Error(
      `No matching networks found. Available: ${
        allNetworks.map((n) => n.id).join(", ")
      }`,
    );
  }

  const outAbs = join(root, options.outDir);
  await ensureDir(outAbs);

  const layouts = options.layouts.length ? options.layouts : DEFAULT_LAYOUTS;
  const supported = new Set(["tiered", "force"]);
  for (const l of layouts) {
    if (!supported.has(l)) {
      throw new Error(`Unsupported layout "${l}". Supported: tiered, force`);
    }
  }

  for (const layout of layouts) {
    const layoutDir = join(outAbs, layout);
    await ensureDir(layoutDir);

    for (const net of selectedNetworks) {
      const networkId = net.id;
      const basePath = join(root, "data", "networks", networkId);

      const devices = await readJson<NetworkDevice[]>(
        join(basePath, "devices.json"),
      );
      const connections = await readJson<Connection[]>(
        join(basePath, "connections.json"),
      );

      // Fresh node/link copies per layout (layouts mutate x/y/fx/fy, and force mutates links).
      const nodes: LayoutNode[] = devices.map((d) => ({
        ...d,
        // Keep renderer behavior aligned with UI: if type is absent, role is used.
        type: d.type || d.role || "",
      }));
      const links: LayoutLink[] = connections.map((c) => ({
        id: c.id,
        source: c.from.deviceId,
        target: c.to.deviceId,
      }));

      let guides: { y: number }[] = [];
      if (layout === "tiered") {
        const dummySimulation = { stop: () => {} };

        const meta = applyTieredLayout({
          simulation: dummySimulation,
          d3: null,
          nodes,
          links,
          width: options.width,
          height: options.height,
        }) as { guides?: { y: number }[] };

        guides = meta?.guides || [];
      } else if (layout === "force") {
        applyDeterministicForceLayout(
          nodes,
          links,
          options.width,
          options.height,
        );
        guides = [];
      }

      const svg = renderSvg({
        networkId,
        networkName: net.name,
        nodes,
        links,
        guides,
        width: options.width,
        height: options.height,
      });

      const outPath = join(layoutDir, `${networkId}.svg`);
      await Deno.writeTextFile(outPath, svg);
      console.log(`Wrote ${join(options.outDir, layout, `${networkId}.svg`)}`);
    }
  }
};

await main();
