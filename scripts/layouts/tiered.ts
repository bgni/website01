import { GRAPH_DEFAULTS } from "../config.ts";

type NodeRef = string | { id: string };

export type TieredLayoutNode = {
  id: string;
  name?: string;
  // Domain boundary can attach these hints to avoid parsing in the layout layer.
  layoutTierIndexHint?: number;
  layoutSiteRank?: number;
  layoutStableKey?: number;
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

const TIER_UNKNOWN_INDEX = TIER_ORDER.length - 1;
const TIER_SWITCH_SENTINEL = -1;

const getNodeId = (
  nodeOrId: NodeRef | null | undefined,
):
  | string
  | undefined => (typeof nodeOrId === "string" ? nodeOrId : nodeOrId?.id);

const estimateLabelWidth = (node: TieredLayoutNode) => {
  const text = String(node?.name || node?.id || "");
  // Font size is 11px; 6.1px/char is a decent heuristic.
  const px = text.length * 6.1;
  return clamp(px, 48, 190);
};

const getLabelSafeBounds = (
  node: TieredLayoutNode,
  left: number,
  right: number,
) => {
  const half = estimateLabelWidth(node) / 2 + 8;
  const min = left + half;
  const max = right - half;
  if (max >= min) return { min, max };
  const center = (left + right) / 2;
  return { min: center, max: center };
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
  const internet = nodes.filter((n) =>
    (n.layoutTierIndexHint ?? TIER_UNKNOWN_INDEX) === 0
  );
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

  const sortNeighbors = (ids: Set<string>) => {
    return [...ids].sort((a: string, b: string) => {
      const na = nodeById.get(a);
      const nb = nodeById.get(b);
      const ta = typeof na?.layoutTierIndexHint === "number"
        ? na.layoutTierIndexHint
        : TIER_UNKNOWN_INDEX;
      const tb = typeof nb?.layoutTierIndexHint === "number"
        ? nb.layoutTierIndexHint
        : TIER_UNKNOWN_INDEX;
      if (ta !== tb) return ta - tb;

      const sa = typeof na?.layoutSiteRank === "number" ? na.layoutSiteRank : 0;
      const sb = typeof nb?.layoutSiteRank === "number" ? nb.layoutSiteRank : 0;
      if (sa !== sb) return sa - sb;

      const da = deg.get(a) || 0;
      const db = deg.get(b) || 0;
      if (db !== da) return db - da;

      const ka = typeof na?.layoutStableKey === "number"
        ? na.layoutStableKey
        : 0;
      const kb = typeof nb?.layoutStableKey === "number"
        ? nb.layoutStableKey
        : 0;
      if (ka !== kb) return ka - kb;

      // Final deterministic fallback without additional parsing.
      return a < b ? -1 : (a > b ? 1 : 0);
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

  const fullSpan = Math.max(220, width - paddingX * 2);
  const span = Math.min(
    fullSpan,
    GRAPH_DEFAULTS.layout.tieredMaxHorizontalSpan,
  );
  const left = (width - span) / 2;
  const right = left + span;

  const { parent, children, roots, deg } = buildTree({ nodes, links });
  const treeX = assignTreeX({ roots, children });

  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // Tier assignment (role-driven, with deterministic inference for generic switches/unknowns).
  nodes.forEach((n) => {
    const baseIndex = typeof n.layoutTierIndexHint === "number"
      ? n.layoutTierIndexHint
      : TIER_UNKNOWN_INDEX;

    let tierIndex = baseIndex;

    if (tierIndex === TIER_SWITCH_SENTINEL) {
      const d = deg.get(n.id) || 0;
      if (d >= 6) tierIndex = 2;
      else if (d >= 4) tierIndex = 3;
      else tierIndex = 4;
    }

    if (tierIndex === TIER_UNKNOWN_INDEX) {
      const p = parent.get(n.id);
      if (p) {
        const pn = nodeById.get(p);
        const pi =
          typeof pn?.__tierIndex === "number" && Number.isFinite(pn.__tierIndex)
            ? pn.__tierIndex
            : (typeof pn?.layoutTierIndexHint === "number" &&
                Number.isFinite(pn.layoutTierIndexHint)
              ? pn.layoutTierIndexHint
              : TIER_UNKNOWN_INDEX);
        tierIndex = Math.min(pi + 1, TIER_UNKNOWN_INDEX);
      } else {
        const d = deg.get(n.id) || 0;
        if (d <= 1) tierIndex = 6;
      }
    }

    const clamped = Math.max(0, Math.min(TIER_UNKNOWN_INDEX, tierIndex));
    n.__tierIndex = clamped;
    n.__tier = TIER_ORDER[clamped] || "unknown";
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
    return left + t * span;
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

    if (count <= 1) {
      const only = tierNodes[0];
      if (only) {
        const { min, max } = getLabelSafeBounds(only, left, right);
        only.__tx = clamp(only.__tx ?? (left + right) / 2, min, max);
      }
      continue;
    }

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
      const { min, max } = getLabelSafeBounds(n, left, right);
      const desired = clamp(n.__tx ?? min, min, max);
      const w = estimateLabelWidth(n);
      const gap = idx === 0 ? 0 : Math.max(minGap, ((prevW + w) / 2) + 18);
      const placed = Math.max(desired, prevX + gap);
      n.__tx = clamp(placed, min, max);
      prevX = n.__tx;
      prevW = w;
    });

    let nextX = Infinity;
    let nextW = 0;
    for (let i = tierNodes.length - 1; i >= 0; i -= 1) {
      const n = tierNodes[i];
      const { min, max } = getLabelSafeBounds(n, left, right);
      const w = estimateLabelWidth(n);
      const gap = i === tierNodes.length - 1
        ? 0
        : Math.max(minGap, ((nextW + w) / 2) + 18);
      const placed = Math.min(n.__tx ?? right, nextX - gap);
      n.__tx = clamp(placed, min, max);
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
        const { min, max } = getLabelSafeBounds(n, left, right);
        n.__tx = clamp(left + t * available, min, max);
      });
    }
  }

  // Apply final positions and lock nodes.
  nodes.forEach((n) => {
    const { min, max } = getLabelSafeBounds(n, left, right);
    const x = clamp(n.__tx ?? (left + right) / 2, min, max);
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
