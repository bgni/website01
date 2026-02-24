import type { Connection, Device } from "../domain/types.ts";

export type SimNode = Device & {
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
};

type ResolvedLinkEnd = { id: string; x: number; y: number };

export type SimLink = {
  id: string;
  source: string | ResolvedLinkEnd;
  target: string | ResolvedLinkEnd;
} & Record<string, unknown>;

export type Guide = { y: number };

export type RendererUpdateArgs = {
  getLinkStroke: (d: SimLink) => string;
  getLinkWidth: (d: SimLink) => number;
  getLinkDasharray: (d: SimLink) => string | null | undefined;
  getLinkOpacity: (d: SimLink) => number;
  afterLinkStyle?: () => void;
  getHalo: (
    d: SimNode,
  ) => { r: number; stroke: string; strokeWidth: number; opacity: number };
  getNodeFilter: (d: SimNode) => string;
  getLabelOpacity: (d: SimNode) => number;
};

export function createGraphRenderer(
  {
    devices,
    connections,
    getNodeFill,
    onNodeSelect,
    width = 1200,
    height = 720,
  }: {
    devices: Device[];
    connections: Connection[];
    getNodeFill: (d: SimNode) => string;
    onNodeSelect: (id: string) => void;
    width?: number;
    height?: number;
  },
) {
  const svg = d3.select("#graph");

  // Clear any prior render (important when switching networks).
  svg.on(".zoom", null);
  svg.selectAll("*").remove();

  svg
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");
  const container = svg.append("g");

  const zoom = d3.zoom().scaleExtent([0.5, 3]).on(
    "zoom",
    (event: { transform: { toString(): string } }) => {
      container.attr("transform", event.transform.toString());
    },
  );
  svg.call(zoom);

  const guideLayer = container.append("g").attr("class", "guide-layer");
  const linkLayer = container.append("g").attr("class", "link-layer");
  const vizLayer = container.append("g").attr("class", "viz-layer");
  const haloLayer = container.append("g").attr("class", "halo-layer");
  const nodeLayer = container.append("g").attr("class", "node-layer");
  const labelLayer = container.append("g").attr("class", "label-layer");

  const nodes = devices.map((d: Device) => ({ ...d })) as SimNode[];
  const links = connections.map((c: Connection) => ({
    ...c,
    source: c.from.deviceId,
    target: c.to.deviceId,
  })) as SimLink[];

  const linkSelection = linkLayer
    .attr("stroke", "#334155")
    .attr("stroke-opacity", 0.6)
    .selectAll("line")
    .data(links, (d: SimLink) => d.id)
    .join("line")
    .attr("stroke-width", 1.4);

  // Selection/highlight indicator that doesn't compete with fill colors.
  const haloSelection = haloLayer
    .attr("pointer-events", "none")
    .selectAll("circle")
    .data(nodes, (d: SimNode) => d.id)
    .join("circle")
    .attr("r", 16)
    .attr("fill", "none")
    .attr("stroke", "#e2e8f0")
    .attr("stroke-width", 2.5)
    .attr("opacity", 0);

  let layoutKind = "force";

  const simulation = d3.forceSimulation(nodes)
    .force(
      "link",
      d3.forceLink(links).id((d: { id: string }) => d.id).distance(130)
        .strength(0.6),
    )
    .force("charge", d3.forceManyBody().strength(-260))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide(26));

  const nodeSelection = nodeLayer
    .selectAll("circle")
    .data(nodes, (d: SimNode) => d.id)
    .join("circle")
    .attr("r", 12)
    .attr("fill", (d: SimNode) => getNodeFill(d))
    .attr("stroke", "#0b1220")
    .attr("stroke-width", 2)
    .on("click", (_event: unknown, d: SimNode) => onNodeSelect(d.id))
    .call(
      d3.drag()
        .on("start", (event: { active?: boolean }, d: SimNode) => {
          if (layoutKind === "force") {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
            return;
          }

          // Tiered is static: don't restart the simulation.
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event: { x: number; y: number }, d: SimNode) => {
          if (layoutKind === "force") {
            d.fx = event.x;
            d.fy = event.y;
            return;
          }

          // Tiered: move immediately and keep locked.
          d.x = event.x;
          d.y = event.y;
          d.fx = d.x;
          d.fy = d.y;

          renderPositions();
        })
        .on("end", (event: { active?: boolean }, d: SimNode) => {
          if (layoutKind === "force") {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }
        }),
    );

  const labelSelection = labelLayer
    .selectAll("text")
    .data(nodes, (d: SimNode) => d.id)
    .join("text")
    .attr("fill", "#e2e8f0")
    .attr("font-size", 11)
    .attr("text-anchor", "middle")
    .attr("dy", 22)
    .text((d: SimNode) => d.name);

  let onTickHook: (() => void) | null = null;

  const renderPositions = () => {
    linkSelection
      .attr("x1", (d: SimLink) => (d.source as { x: number }).x)
      .attr("y1", (d: SimLink) => (d.source as { y: number }).y)
      .attr("x2", (d: SimLink) => (d.target as { x: number }).x)
      .attr("y2", (d: SimLink) => (d.target as { y: number }).y);

    onTickHook?.();
    nodeSelection
      .attr("cx", (d: SimNode) => {
        d.x = Math.max(20, Math.min(width - 20, d.x || width / 2));
        return d.x;
      })
      .attr("cy", (d: SimNode) => {
        d.y = Math.max(20, Math.min(height - 20, d.y || height / 2));
        return d.y;
      });

    haloSelection
      .attr("cx", (d: SimNode) => d.x)
      .attr("cy", (d: SimNode) => d.y);
    labelSelection
      .attr("x", (d: SimNode) => d.x)
      .attr("y", (d: SimNode) => (d.y ?? 0) + 24);
  };

  const renderGuides = (guides: Guide[] = []) => {
    const g = Array.isArray(guides) ? guides : [];
    guideLayer
      .attr("pointer-events", "none")
      .attr("opacity", g.length ? 1 : 0);

    guideLayer
      .selectAll("line")
      .data(g, (d: Guide, i: number) => `${i}:${d?.y}`)
      .join("line")
      .attr("x1", 0)
      .attr("x2", width)
      .attr("y1", (d: Guide) => d.y)
      .attr("y2", (d: Guide) => d.y)
      .attr("stroke", "#1f2937")
      .attr("stroke-width", 1)
      .attr("stroke-opacity", 0.75);
  };

  const setLayoutKind = (kind: string) => {
    layoutKind = kind || "force";
  };

  const updateStyles = (args: RendererUpdateArgs) => {
    const linkT = linkSelection.interrupt().transition().duration(220).ease(
      d3.easeCubicOut,
    );

    linkT
      .attr("stroke", args.getLinkStroke)
      .attr("stroke-width", args.getLinkWidth)
      .attr("stroke-dasharray", args.getLinkDasharray)
      .attr("opacity", args.getLinkOpacity);

    args.afterLinkStyle?.();

    haloSelection
      .attr("r", (d: SimNode) => args.getHalo(d).r)
      .attr("stroke", (d: SimNode) => args.getHalo(d).stroke)
      .attr("stroke-width", (d: SimNode) => args.getHalo(d).strokeWidth)
      .attr("opacity", (d: SimNode) => args.getHalo(d).opacity);

    nodeSelection
      .attr("r", 12)
      .attr("fill", (d: SimNode) => getNodeFill(d))
      .attr("stroke", "#0b1220")
      .attr("stroke-width", 2)
      // Keep nodes opaque so links never visually "sit on top" of devices.
      .attr("opacity", 1)
      // De-emphasize via filter rather than transparency.
      .style("filter", args.getNodeFilter);

    labelSelection.attr("opacity", args.getLabelOpacity);
  };

  simulation.on("tick", renderPositions);

  const destroy = () => {
    simulation.stop();
    svg.on(".zoom", null);
    svg.selectAll("*").remove();
  };

  return {
    width,
    height,
    nodes,
    links,
    simulation,
    vizLayer,
    linkSelection,
    renderPositions,
    renderGuides,
    setLayoutKind,
    setOnTickHook: (fn: (() => void) | null) => {
      onTickHook = fn;
    },
    updateStyles,
    destroy,
  };
}
