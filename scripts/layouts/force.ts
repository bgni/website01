type LayoutNode = { fx?: number | null; fy?: number | null };
type PositionedLayoutNode = LayoutNode & { x?: number; y?: number };

type ForceLinkLike = {
  distance?: (value: number) => unknown;
  strength?: (value: number) => unknown;
};

type SimulationLike = {
  force: {
    (name: string, force: unknown): SimulationLike;
    (name: string): ForceLinkLike | null | undefined;
  };
  alpha: (value: number) => SimulationLike;
  restart: () => SimulationLike;
};

type D3Like = {
  forceCenter: (x: number, y: number) => unknown;
  forceManyBody: () => { strength: (value: number) => unknown };
  forceCollide: (radius: number) => unknown;
};

const RACK_LINK_DISTANCE = 140;
const RACK_COLLIDE_RADIUS = 78;
const RACK_CHARGE_STRENGTH = -320;

export function applyForceLayout(
  {
    simulation,
    d3,
    nodes,
    width,
    height,
  }: {
    simulation: SimulationLike;
    d3: D3Like;
    nodes: LayoutNode[];
    width: number;
    height: number;
  },
) {
  const layoutNodes =
    (Array.isArray(nodes) ? nodes : []) as PositionedLayoutNode[];

  // Tiered layout locks nodes via fx/fy; unlock when returning to force.
  if (layoutNodes.length) {
    layoutNodes.forEach((n) => {
      n.fx = null;
      n.fy = null;
    });
  }

  const positionedCount = layoutNodes.reduce((count, node) => {
    const hasX = Number.isFinite(Number(node.x));
    const hasY = Number.isFinite(Number(node.y));
    return hasX && hasY ? count + 1 : count;
  }, 0);
  const hasMostlyPositionedNodes = layoutNodes.length > 0 &&
    positionedCount / layoutNodes.length >= 0.6;
  const initialAlpha = hasMostlyPositionedNodes ? 0.2 : 0.85;

  simulation
    .force("x", null)
    .force("y", null)
    .force("bounds", null)
    .force("center", d3.forceCenter(width / 2, height / 2));

  const link = simulation.force("link");
  if (link?.distance) link.distance(RACK_LINK_DISTANCE);
  if (link?.strength) link.strength(0.6);

  simulation
    .force("charge", d3.forceManyBody().strength(RACK_CHARGE_STRENGTH))
    .force("collide", d3.forceCollide(RACK_COLLIDE_RADIUS))
    .alpha(initialAlpha)
    .restart();

  return { guides: [] };
}
