type LayoutNode = { fx?: number | null; fy?: number | null };

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
  // Tiered layout locks nodes via fx/fy; unlock when returning to force.
  if (Array.isArray(nodes)) {
    nodes.forEach((n) => {
      n.fx = null;
      n.fy = null;
    });
  }

  simulation
    .force("x", null)
    .force("y", null)
    .force("bounds", null)
    .force("center", d3.forceCenter(width / 2, height / 2));

  const link = simulation.force("link");
  if (link?.distance) link.distance(60);
  if (link?.strength) link.strength(0.6);

  simulation
    .force("charge", d3.forceManyBody().strength(-260))
    .force("collide", d3.forceCollide(26))
    .alpha(0.85)
    .restart();

  return { guides: [] };
}
