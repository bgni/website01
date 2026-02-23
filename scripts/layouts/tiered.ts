type NodeRef = string | { id: string };

export type TieredLayoutNode = {
  id: string;
  name?: string;
  role?: string;
  site?: string;
  room_id?: string;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  __tier?: string;
  __tierIndex?: number;
  __tx?: number;
  __ty?: number;
};

export type TieredLayoutLink = {
  source: NodeRef;
  target: NodeRef;
  id?: string;
};

type SimulationLike = { stop: () => void };

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

const normalizeRole = (role: unknown) =>
  String(role || "").trim().toLowerCase();

const degreeFor = (links: TieredLayoutLink[]): Map<string, number> => {
  const deg = new Map<string, number>();
  links.forEach((l: TieredLayoutLink) => {
    const a = typeof l.source === "string" ? l.source : l.source?.id;
    const b = typeof l.target === "string" ? l.target : l.target?.id;
    if (a) deg.set(a, (deg.get(a) || 0) + 1);
    if (b) deg.set(b, (deg.get(b) || 0) + 1);
  });
  return deg;
};

const roleToTier = (role: unknown) => {
  const r = normalizeRole(role);

  if (r === "internet" || r === "isp") return "internet";
  if (r.includes("firewall")) return "edge";
  if (r.includes("router") || r.includes("wan") || r.includes("edge")) {
    return "edge";
  }

  if (r === "core") return "core";
  if (
    r.includes("distribution") || r.includes("dist") || r.includes("agg") ||
    r.includes("aggregation")
  ) return "agg";
  if (r.includes("access")) return "access";

  if (
    r.includes("server") || r.includes("service") || r.includes("dns") ||
    r.includes("idp")
  ) return "service";
  if (
    r.includes("load balancer") || r === "lb" || r.includes("load-balancer")
  ) return "service";

  if (r.includes("access point") || r === "ap" || r.includes("wifi")) {
    return "endpoint";
  }
  if (
    r.includes("endpoint") || r.includes("client") ||
    r.includes("workstation") || r.includes("printer")
  ) return "endpoint";
  if (r.includes("iot")) return "endpoint";

  // A generic "switch" needs inference.
  if (r.includes("switch")) return "switch";

  return "unknown";
};

const TIER_ORDER = [
  "internet",
  "edge",
  "core",
  "agg",
  "access",
  "service",
  "endpoint",
  "unknown",
];
const tierIndexFor = (tier: string) => {
  const idx = TIER_ORDER.indexOf(tier);
  return idx >= 0 ? idx : (TIER_ORDER.length - 1);
};

const getNodeId = (
  nodeOrId: NodeRef | null | undefined,
):
  | string
  | undefined => (typeof nodeOrId === "string" ? nodeOrId : nodeOrId?.id);

const inferSiteKey = (name: unknown) => {
  const raw = String(name || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();

  if (lower.startsWith("hq ")) return "hq";
  if (lower === "hq") return "hq";

  const branch = lower.match(/^branch\s*[-_]?\s*(\d+)\b/);
  if (branch?.[1]) return `branch-${branch[1]}`;

  if (lower.startsWith("campus ")) return "campus";
  if (lower === "campus") return "campus";

  const bldg = lower.match(/^bldg\s*[-_]?\s*([a-z0-9]+)\b/);
  if (bldg?.[1]) return `bldg-${bldg[1]}`;

  return "";
};

const siteKeyForNode = (node: TieredLayoutNode | undefined) => {
  const explicit = String(node?.site || "").trim();
  if (explicit) return explicit.toLowerCase();

  const room = String(node?.room_id || "").trim();
  if (room) return room.toLowerCase();

  return inferSiteKey(node?.name);
};

const estimateLabelWidth = (node: TieredLayoutNode) => {
  const text = String(node?.name || node?.id || "");
  // Font size is 11px; 6.1px/char is a decent heuristic.
  const px = text.length * 6.1;
  return clamp(px, 48, 190);
};

const buildNeighbors = (links: TieredLayoutLink[]) => {
  const neighbors = new Map<string, Set<string>>();
  const ensure = (id: string): Set<string> => {
    if (!neighbors.has(id)) neighbors.set(id, new Set<string>());
    return neighbors.get(id)!;
  };

  links.forEach((l: TieredLayoutLink) => {
    const a = getNodeId(l.source);
    const b = getNodeId(l.target);
    if (!a || !b) return;
    ensure(a).add(b);
    ensure(b).add(a);
  });

  return neighbors;
};

const pickRoots = ({
  nodes,
  deg,
}: {
  nodes: TieredLayoutNode[];
  deg: Map<string, number>;
}) => {
  const byId = new Map<string, TieredLayoutNode>(nodes.map((n) => [n.id, n]));
  const internet = nodes.filter((n) => roleToTier(n.role) === "internet");
  if (internet.length) return internet.map((n) => n.id);

  // Fall back: highest degree (often core/edge).
  let best = null;
  let bestDeg = -1;
  for (const n of nodes) {
    const d = deg.get(n.id) || 0;
    if (d > bestDeg) {
      bestDeg = d;
      best = n.id;
    }
  }
  if (best) return [best];

  // Empty graph.
  return Array.from(byId.keys()).slice(0, 1);
};

const buildTree = ({
  nodes,
  links,
}: {
  nodes: TieredLayoutNode[];
  links: TieredLayoutLink[];
}) => {
  const deg = degreeFor(links);
  const neighbors = buildNeighbors(links);
  const roots = pickRoots({ nodes, deg });

  const parent = new Map<string, string | null>();
  const children = new Map<string, string[]>();
  const order: string[] = [];

  const ensureChildren = (id: string) => {
    if (!children.has(id)) children.set(id, [] as string[]);
    return children.get(id)!;
  };

  const seen = new Set<string>();
  const queue: string[] = [];
  roots.forEach((r) => {
    if (!r) return;
    seen.add(r);
    parent.set(r, null);
    queue.push(r);
  });

  const nodeById = new Map<string, TieredLayoutNode>(
    nodes.map((n) => [n.id, n]),
  );
  const siteKeyCache = new Map<string, string>();
  const siteKeyFor = (id: string) => {
    if (siteKeyCache.has(id)) return siteKeyCache.get(id);
    const n = nodeById.get(id);
    const key = siteKeyForNode(n);
    siteKeyCache.set(id, key);
    return key;
  };

  const sortNeighbors = (ids: Set<string>) => {
    return [...ids].sort((a: string, b: string) => {
      const na = nodeById.get(a);
      const nb = nodeById.get(b);
      const ta = tierIndexFor(roleToTier(na?.role));
      const tb = tierIndexFor(roleToTier(nb?.role));
      if (ta !== tb) return ta - tb;

      const sa = siteKeyFor(a);
      const sb = siteKeyFor(b);
      if (sa !== sb) return String(sa).localeCompare(String(sb));

      const da = deg.get(a) || 0;
      const db = deg.get(b) || 0;
      if (db !== da) return db - da;
      return String(na?.name || a).localeCompare(String(nb?.name || b));
    });
  };

  while (queue.length) {
    const id = queue.shift();
    if (!id) break;
    order.push(id);
    const nbs = neighbors.get(id);
    if (!nbs) continue;
    const sorted = sortNeighbors(nbs);
    sorted.forEach((nb: string) => {
      if (seen.has(nb)) return;
      seen.add(nb);
      parent.set(nb, id);
      ensureChildren(id).push(nb);
      queue.push(nb);
    });
  }

  // Handle disconnected components by treating their root as additional roots.
  nodes.forEach((n: TieredLayoutNode) => {
    if (seen.has(n.id)) return;
    const id = n.id;
    seen.add(id);
    parent.set(id, null);
    queue.push(id);
    while (queue.length) {
      const cur = queue.shift();
      if (!cur) break;
      order.push(cur);
      const nbs = neighbors.get(cur);
      if (!nbs) continue;
      const sorted = sortNeighbors(nbs);
      sorted.forEach((nb: string) => {
        if (seen.has(nb)) return;
        seen.add(nb);
        parent.set(nb, cur);
        ensureChildren(cur).push(nb);
        queue.push(nb);
      });
    }
  });

  return { parent, children, roots, deg, order };
};

const assignTreeX = ({
  roots,
  children,
}: {
  roots: string[];
  children: Map<string, string[]>;
}) => {
  const x = new Map<string, number>();
  let cursor = 0;

  const dfs = (id: string): number => {
    const kids = children.get(id) || [];
    if (!kids.length) {
      x.set(id, cursor);
      cursor += 1;
      return x.get(id)!;
    }
    const childXs = kids.map((k) => dfs(k));
    const avg = childXs.reduce((a, b) => a + b, 0) / childXs.length;
    x.set(id, avg);
    return avg;
  };

  roots.forEach((r) => {
    if (!r) return;
    if (!x.has(r)) dfs(r);
    // Add a little spacing between root components.
    cursor += 1;
  });

  return x;
};

export function applyTieredLayout(
  {
    simulation,
    d3: _d3,
    nodes,
    links,
    width,
    height,
  }: {
    simulation: SimulationLike;
    d3: unknown;
    nodes: TieredLayoutNode[];
    links: TieredLayoutLink[];
    width: number;
    height: number;
  },
) {
  const paddingTop = 56; // leave room for overlay controls
  const paddingBottom = 24;
  const paddingX = 28;

  // Static layout: compute coordinates once and lock nodes in place (no force simulation).
  // We still reuse the existing tree ordering and tier inference.

  const usableH = Math.max(220, height - paddingTop - paddingBottom);
  const bandH = usableH / TIER_ORDER.length;

  const { parent, children, roots, deg } = buildTree({ nodes, links });
  const treeX = assignTreeX({ roots, children });

  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // Tier assignment (role-driven, with deterministic inference for generic switches/unknowns).
  nodes.forEach((n) => {
    const base = roleToTier(n.role);
    let tier = base;

    if (tier === "switch") {
      const d = deg.get(n.id) || 0;
      if (d >= 6) tier = "core";
      else if (d >= 4) tier = "agg";
      else tier = "access";
    }

    if (tier === "unknown") {
      const p = parent.get(n.id);
      if (p) {
        const pn = nodeById.get(p);
        const pt = pn?.__tier || roleToTier(pn?.role);
        const pi = tierIndexFor(pt);
        tier = TIER_ORDER[Math.min(pi + 1, TIER_ORDER.length - 1)] || "unknown";
      } else {
        const d = deg.get(n.id) || 0;
        if (d <= 1) tier = "endpoint";
      }
    }

    n.__tier = tier;
    n.__tierIndex = tierIndexFor(tier);
  });

  const xVals = nodes
    .map((n) => treeX.get(n.id))
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const minX = xVals.length ? Math.min(...xVals) : 0;
  const maxX = xVals.length ? Math.max(...xVals) : 1;
  const spanX = Math.max(1e-6, maxX - minX);

  const xTarget = (n: TieredLayoutNode) => {
    const raw = treeX.get(n.id);
    const t = typeof raw === "number" && Number.isFinite(raw)
      ? (raw - minX) / spanX
      : 0.5;
    return paddingX + t * (width - paddingX * 2);
  };
  const yTarget = (n: TieredLayoutNode) => {
    const idx =
      typeof n.__tierIndex === "number" && Number.isFinite(n.__tierIndex)
        ? n.__tierIndex
        : 0;
    return paddingTop + (idx + 0.5) * bandH;
  };

  // Store target positions for debugging.
  nodes.forEach((n) => {
    n.__tx = xTarget(n);
    n.__ty = yTarget(n);
  });

  // Resolve overlaps deterministically per tier.
  const left = paddingX;
  const right = width - paddingX;
  const minGap = 30; // circle-safe spacing; labels handled by per-node widths below

  const byTier = new Map<number, TieredLayoutNode[]>();
  nodes.forEach((n: TieredLayoutNode) => {
    const idx = typeof n.__tierIndex === "number" &&
        Number.isFinite(n.__tierIndex)
      ? n.__tierIndex
      : TIER_ORDER.length - 1;
    const bucket = byTier.get(idx);
    if (bucket) bucket.push(n);
    else byTier.set(idx, [n]);
  });

  for (const tierNodes of byTier.values()) {
    tierNodes.sort((a, b) =>
      ((a.__tx ?? 0) - (b.__tx ?? 0)) ||
      String(a.id).localeCompare(String(b.id))
    );
    const count = tierNodes.length;
    if (count <= 1) continue;

    const available = Math.max(1, right - left);
    const maxGap = available / Math.max(1, count - 1);

    // If we can't fit even the circle-safe minimum gap, spread evenly across the band.
    if (maxGap < minGap) {
      tierNodes.forEach((n, i) => {
        const t = count === 1 ? 0.5 : (i / (count - 1));
        n.__tx = left + t * available;
      });
      continue;
    }

    // Constrained sweep that accounts for label widths so names don't pile up.
    let prevX = -Infinity;
    let prevW = 0;
    tierNodes.forEach((n, idx) => {
      const desired = clamp(n.__tx ?? left, left, right);
      const w = estimateLabelWidth(n);
      const gap = idx === 0 ? 0 : Math.max(minGap, ((prevW + w) / 2) + 18);
      const placed = Math.max(desired, prevX + gap);
      n.__tx = clamp(placed, left, right);
      prevX = n.__tx;
      prevW = w;
    });

    let nextX = Infinity;
    let nextW = 0;
    for (let i = tierNodes.length - 1; i >= 0; i -= 1) {
      const n = tierNodes[i];
      const w = estimateLabelWidth(n);
      const gap = i === tierNodes.length - 1
        ? 0
        : Math.max(minGap, ((nextW + w) / 2) + 18);
      const placed = Math.min(n.__tx ?? right, nextX - gap);
      n.__tx = clamp(placed, left, right);
      nextX = n.__tx;
      nextW = w;
    }

    // If constraints pushed us outside bounds, fall back to even spacing.
    const firstTx = tierNodes[0]?.__tx ?? left;
    const lastTx = tierNodes[tierNodes.length - 1]?.__tx ?? right;
    if (firstTx <= left + 0.5 && lastTx >= right - 0.5) {
      // already max-spread
    } else if (
      firstTx < left - 0.5 ||
      lastTx > right + 0.5
    ) {
      tierNodes.forEach((n, i) => {
        const t = count === 1 ? 0.5 : (i / (count - 1));
        n.__tx = left + t * available;
      });
    }
  }

  // Apply final positions and lock nodes.
  nodes.forEach((n) => {
    const x = clamp(n.__tx ?? left, left, right);
    const y = clamp(n.__ty ?? paddingTop, paddingTop, height - paddingBottom);
    n.x = x;
    n.y = y;
    n.fx = x;
    n.fy = y;
  });

  // Stop any ongoing simulation to prevent wobble.
  simulation.stop();

  const guides = [];
  for (let i = 1; i < TIER_ORDER.length; i += 1) {
    guides.push({ y: paddingTop + i * bandH });
  }

  return { guides };
}
