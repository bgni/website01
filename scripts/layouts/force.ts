type LayoutNode = { fx?: number | null; fy?: number | null };

type SimulationLike = {
  // deno-lint-ignore no-explicit-any
  force: (...args: any[]) => any;
  alpha: (value: number) => SimulationLike;
  restart: () => SimulationLike;
};

export function applyForceLayout(
  {
    simulation,
    // deno-lint-ignore no-explicit-any
    d3,
    nodes,
    width,
    height,
  }: {
    simulation: SimulationLike;
    // deno-lint-ignore no-explicit-any
    d3: any;
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
