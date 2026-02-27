type NodeRef = string | { id: string };

type DotNode = {
  id: string;
  layoutTierIndexHint?: number;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
};

type DotLink = {
  source: NodeRef;
  target: NodeRef;
};

type SimulationLike = { stop: () => void };

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

const getNodeId = (v: NodeRef | null | undefined): string | undefined =>
  typeof v === "string" ? v : v?.id;

const avg = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;

const tierHint = (n: DotNode | undefined) =>
  typeof n?.layoutTierIndexHint === "number" &&
    Number.isFinite(n.layoutTierIndexHint)
    ? n.layoutTierIndexHint
    : Number.POSITIVE_INFINITY;

const orientEdge = (
  a: string,
  b: string,
  byId: Map<string, DotNode>,
): [string, string] => {
  const na = byId.get(a);
  const nb = byId.get(b);
  const ta = tierHint(na);
  const tb = tierHint(nb);

  if (ta !== tb) return ta < tb ? [a, b] : [b, a];
  return a < b ? [a, b] : [b, a];
};

export function applyDotLayout(
  {
    simulation,
    nodes,
    links,
    width,
    height,
  }: {
    simulation: SimulationLike;
    d3: unknown;
    nodes: DotNode[];
    links: DotLink[];
    width: number;
    height: number;
  },
) {
  const paddingTop = 56;
  const paddingBottom = 24;
  const paddingX = 28;
  const maxSpan = 1240;
  const nodeGap = 136;

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const nodeIds = nodes.map((n) => n.id);

  const oriented: Array<[string, string]> = [];
  links.forEach((l) => {
    const a = getNodeId(l.source);
    const b = getNodeId(l.target);
    if (!a || !b || a === b) return;
    oriented.push(orientEdge(a, b, byId));
  });

  const out = new Map<string, Set<string>>();
  const inDeg = new Map<string, number>();
  const inAdj = new Map<string, Set<string>>();
  nodeIds.forEach((id) => {
    out.set(id, new Set<string>());
    inAdj.set(id, new Set<string>());
    inDeg.set(id, 0);
  });

  oriented.forEach(([u, v]) => {
    if (!out.get(u)?.has(v)) {
      out.get(u)?.add(v);
      inAdj.get(v)?.add(u);
      inDeg.set(v, (inDeg.get(v) || 0) + 1);
    }
  });

  // Kahn topo with deterministic tie-break.
  const queue = nodeIds
    .filter((id) => (inDeg.get(id) || 0) === 0)
    .sort((a, b) => a.localeCompare(b));
  const topo: string[] = [];
  while (queue.length) {
    const u = queue.shift();
    if (!u) break;
    topo.push(u);
    for (const v of out.get(u) || []) {
      const next = (inDeg.get(v) || 0) - 1;
      inDeg.set(v, next);
      if (next === 0) {
        queue.push(v);
        queue.sort((a, b) => a.localeCompare(b));
      }
    }
  }

  // In degenerate cyclic leftovers, append deterministically.
  nodeIds.forEach((id) => {
    if (!topo.includes(id)) topo.push(id);
  });

  const layer = new Map<string, number>();
  topo.forEach((id) => {
    const preds = [...(inAdj.get(id) || [])];
    const base = preds.length
      ? Math.max(...preds.map((p) => layer.get(p) || 0)) + 1
      : 0;
    layer.set(id, base);
  });

  const maxLayer = Math.max(0, ...[...layer.values()]);
  const layers = new Map<number, string[]>();
  for (let i = 0; i <= maxLayer; i += 1) layers.set(i, []);
  topo.forEach((id) => {
    const l = layer.get(id) || 0;
    layers.get(l)?.push(id);
  });

  const pos = new Map<string, number>();
  for (let l = 0; l <= maxLayer; l += 1) {
    const ids = layers.get(l) || [];
    ids.forEach((id, i) => pos.set(id, i));
  }

  const downNeighbors = (id: string) =>
    [...(out.get(id) || [])].filter((n) =>
      (layer.get(n) || 0) > (layer.get(id) || 0)
    );
  const upNeighbors = (id: string) =>
    [...(inAdj.get(id) || [])].filter((n) =>
      (layer.get(n) || 0) < (layer.get(id) || 0)
    );

  const reorderByBarycenter = (l: number, useUp: boolean) => {
    const ids = [...(layers.get(l) || [])];
    ids.sort((a, b) => {
      const na = useUp ? upNeighbors(a) : downNeighbors(a);
      const nb = useUp ? upNeighbors(b) : downNeighbors(b);
      const ba = avg(na.map((n) => pos.get(n) || 0));
      const bb = avg(nb.map((n) => pos.get(n) || 0));
      const va = Number.isNaN(ba) ? (pos.get(a) || 0) : ba;
      const vb = Number.isNaN(bb) ? (pos.get(b) || 0) : bb;
      if (va !== vb) return va - vb;
      return a.localeCompare(b);
    });
    layers.set(l, ids);
    ids.forEach((id, i) => pos.set(id, i));
  };

  // A few Sugiyama-style sweeps.
  for (let pass = 0; pass < 6; pass += 1) {
    for (let l = 1; l <= maxLayer; l += 1) reorderByBarycenter(l, true);
    for (let l = maxLayer - 1; l >= 0; l -= 1) reorderByBarycenter(l, false);
  }

  const fullSpan = Math.max(220, width - paddingX * 2);
  const span = Math.min(fullSpan, maxSpan);
  const left = (width - span) / 2;
  const right = left + span;

  const usableH = Math.max(220, height - paddingTop - paddingBottom);
  const layerGap = usableH / Math.max(1, maxLayer + 1);

  for (let l = 0; l <= maxLayer; l += 1) {
    const ids = layers.get(l) || [];
    const count = ids.length;
    const available = Math.max(1, right - left);
    const baseGap = Math.min(nodeGap, available / Math.max(1, count - 1));
    const rowSpan = baseGap * Math.max(0, count - 1);
    const rowLeft = (left + right) / 2 - rowSpan / 2;

    ids.forEach((id, i) => {
      const n = byId.get(id);
      if (!n) return;
      const x = count <= 1 ? (left + right) / 2 : rowLeft + i * baseGap;
      const y = paddingTop + (l + 0.5) * layerGap;
      const clampedX = clamp(x, left, right);
      const clampedY = clamp(y, paddingTop, height - paddingBottom);
      n.x = clampedX;
      n.y = clampedY;
      n.fx = clampedX;
      n.fy = clampedY;
    });
  }

  simulation.stop();

  const guides = [];
  for (let i = 1; i <= maxLayer; i += 1) {
    guides.push({ y: paddingTop + i * layerGap });
  }

  return { guides };
}
