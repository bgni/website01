import type { Connection, NetworkDevice } from "../domain/types.ts";
import { GRAPH_COLORS, GRAPH_DEFAULTS } from "../config.ts";
import { getD3 } from "../lib/d3.ts";

export type SimNode = NetworkDevice & {
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
};

const isContainerNode = (node: SimNode): boolean =>
  Boolean(node.isContainer === true);

const getContainerWidth = (node: SimNode): number => {
  const width = Number(node.width);
  return Number.isFinite(width) && width > 80 ? width : 260;
};

const getContainerHeight = (node: SimNode): number => {
  const height = Number(node.height);
  return Number.isFinite(height) && height > 60 ? height : 170;
};

type ResolvedLinkEnd = { id: string; x: number; y: number };

export type SimLink = {
  id: string;
  source: string | ResolvedLinkEnd;
  target: string | ResolvedLinkEnd;
} & Record<string, unknown>;

export type Guide = { y: number };

export type ZoomTransformSnapshot = { x: number; y: number; k: number };

const getLinkEndId = (end: string | ResolvedLinkEnd): string =>
  typeof end === "string" ? end : end.id;

const linkFanoutOffsetsByEndpoint = (links: SimLink[]) => {
  const byNode = new Map<string, SimLink[]>();
  const push = (nodeId: string, link: SimLink) => {
    const arr = byNode.get(nodeId);
    if (arr) arr.push(link);
    else byNode.set(nodeId, [link]);
  };

  links.forEach((link) => {
    const sourceId = getLinkEndId(link.source);
    const targetId = getLinkEndId(link.target);
    push(sourceId, link);
    push(targetId, link);
  });

  const out = new Map<string, number>();

  for (const [nodeId, nodeLinks] of byNode.entries()) {
    const sorted = [...nodeLinks].sort((a, b) => {
      const aOther = getLinkEndId(a.source) === nodeId
        ? getLinkEndId(a.target)
        : getLinkEndId(a.source);
      const bOther = getLinkEndId(b.source) === nodeId
        ? getLinkEndId(b.target)
        : getLinkEndId(b.source);
      return `${aOther}\n${a.id}`.localeCompare(`${bOther}\n${b.id}`);
    });

    const mid = (sorted.length - 1) / 2;
    sorted.forEach((link, idx) => {
      out.set(`${link.id}|${nodeId}`, idx - mid);
    });
  }

  return out;
};

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
    svg,
    devices,
    connections,
    getNodeFill,
    onNodeSelect,
    onCanvasDeselect,
    onSelectionReplaced,
    width: initialWidth = GRAPH_DEFAULTS.width,
    height: initialHeight = GRAPH_DEFAULTS.height,
  }: {
    svg: string | SVGSVGElement;
    devices: NetworkDevice[];
    connections: Connection[];
    getNodeFill: (d: SimNode) => string;
    onNodeSelect: (id: string) => void;
    onCanvasDeselect?: () => void;
    onSelectionReplaced?: (ids: string[]) => void;
    width?: number;
    height?: number;
  },
) {
  const d3 = getD3();
  const svgSel = d3.select(svg);

  let width = initialWidth;
  let height = initialHeight;
  let lastGuides: Guide[] = [];

  // Clear any prior render (important when switching networks).
  svgSel.on(".zoom", null);
  svgSel.selectAll("*").remove();

  svgSel
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");
  const container = svgSel.append("g");

  const zoom = d3.zoom().scaleExtent([
    GRAPH_DEFAULTS.zoom.minScale,
    GRAPH_DEFAULTS.zoom.maxScale,
  ]).on(
    "zoom",
    (event: { transform: { toString(): string } }) => {
      container.attr("transform", event.transform.toString());
    },
  );
  svgSel.call(zoom);

  const isInteractiveTarget = (target: Element) =>
    Boolean(
      target.closest(".node-layer circle") ||
        target.closest(".label-layer text") ||
        target.closest(".link-layer line") ||
        target.closest(".viz-layer *"),
    );

  let suppressCanvasClickUntil = 0;
  const getGraphPoint = (event: MouseEvent) => {
    const node = svgSel.node();
    const [sx, sy] = d3.pointer(event, node);
    const t = node ? d3.zoomTransform(node) : d3.zoomIdentity;
    return {
      x: t.invertX(sx),
      y: t.invertY(sy),
    };
  };

  svgSel.on("click", (event: Event) => {
    if (Date.now() < suppressCanvasClickUntil) return;

    const target = event.target;
    if (!(target instanceof Element)) return;

    if (isInteractiveTarget(target)) return;

    onCanvasDeselect?.();
  });

  const getViewportTransform = (): ZoomTransformSnapshot => {
    const node = svgSel.node();
    const current = node ? d3.zoomTransform(node) : d3.zoomIdentity;
    return {
      x: Number(current.x) || 0,
      y: Number(current.y) || 0,
      k: Number(current.k) || 1,
    };
  };

  const setViewportTransform = (snapshot: ZoomTransformSnapshot | null) => {
    if (!snapshot) return;
    const node = svgSel.node();
    if (!node) return;

    const k = Number.isFinite(snapshot.k) && snapshot.k > 0 ? snapshot.k : 1;
    const x = Number.isFinite(snapshot.x) ? snapshot.x : 0;
    const y = Number.isFinite(snapshot.y) ? snapshot.y : 0;
    const t = d3.zoomIdentity.translate(x, y).scale(k);
    svgSel.call(zoom.transform, t);
  };

  const getViewportCenter = () => {
    const node = svgSel.node();
    const t = node ? d3.zoomTransform(node) : d3.zoomIdentity;
    const cx = Number.isFinite(t.invertX(width / 2))
      ? t.invertX(width / 2)
      : width / 2;
    const cy = Number.isFinite(t.invertY(height / 2))
      ? t.invertY(height / 2)
      : height / 2;
    return { x: cx, y: cy };
  };

  const getNodePositions = () => {
    const out = new Map<string, { x: number; y: number }>();
    nodes.forEach((node) => {
      const x = Number(node.x);
      const y = Number(node.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      out.set(node.id, { x, y });
    });
    return out;
  };

  const guideLayer = container.append("g").attr("class", "guide-layer");
  const containerLayer = container.append("g").attr("class", "container-layer");
  const linkLayer = container.append("g").attr("class", "link-layer");
  const vizLayer = container.append("g").attr("class", "viz-layer");
  const marqueeLayer = container.append("g").attr("class", "marquee-layer");
  const haloLayer = container.append("g").attr("class", "halo-layer");
  const nodeLayer = container.append("g").attr("class", "node-layer");
  const labelLayer = container.append("g").attr("class", "label-layer");

  const marqueeRect = marqueeLayer
    .append("rect")
    .attr("class", "marquee-rect")
    .attr("display", "none")
    .attr("pointer-events", "none");

  let dragSelect:
    | {
      startX: number;
      startY: number;
      lastX: number;
      lastY: number;
      active: boolean;
    }
    | null = null;

  const updateMarqueeRect = () => {
    if (!dragSelect || !dragSelect.active) {
      marqueeRect.attr("display", "none");
      return;
    }

    const x = Math.min(dragSelect.startX, dragSelect.lastX);
    const y = Math.min(dragSelect.startY, dragSelect.lastY);
    const w = Math.abs(dragSelect.lastX - dragSelect.startX);
    const h = Math.abs(dragSelect.lastY - dragSelect.startY);

    marqueeRect
      .attr("display", null)
      .attr("x", x)
      .attr("y", y)
      .attr("width", w)
      .attr("height", h);
  };

  const finalizeDragSelection = () => {
    if (!dragSelect) return;

    if (dragSelect.active) {
      const minX = Math.min(dragSelect.startX, dragSelect.lastX);
      const maxX = Math.max(dragSelect.startX, dragSelect.lastX);
      const minY = Math.min(dragSelect.startY, dragSelect.lastY);
      const maxY = Math.max(dragSelect.startY, dragSelect.lastY);

      const ids = nodes
        .filter((node) => {
          const x = Number(node.x);
          const y = Number(node.y);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
          return x >= minX && x <= maxX && y >= minY && y <= maxY;
        })
        .map((node) => node.id);

      onSelectionReplaced?.(ids);
      suppressCanvasClickUntil = Date.now() + 120;
    }

    dragSelect = null;
    updateMarqueeRect();
  };

  svgSel.on("mousedown.marquee", (event: MouseEvent) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (isInteractiveTarget(target)) return;

    const point = getGraphPoint(event);
    dragSelect = {
      startX: point.x,
      startY: point.y,
      lastX: point.x,
      lastY: point.y,
      active: false,
    };
    event.preventDefault();
  });

  svgSel.on("mousemove.marquee", (event: MouseEvent) => {
    if (!dragSelect) return;
    const point = getGraphPoint(event);
    dragSelect.lastX = point.x;
    dragSelect.lastY = point.y;

    if (!dragSelect.active) {
      const dx = dragSelect.lastX - dragSelect.startX;
      const dy = dragSelect.lastY - dragSelect.startY;
      dragSelect.active = Math.hypot(dx, dy) >= 8;
    }

    if (dragSelect.active) {
      event.preventDefault();
      updateMarqueeRect();
    }
  });

  svgSel.on("mouseup.marquee", () => {
    finalizeDragSelection();
  });

  svgSel.on("mouseleave.marquee", () => {
    finalizeDragSelection();
  });

  const nodes = devices.map((d: NetworkDevice) => ({ ...d })) as SimNode[];
  const containerNodes = nodes.filter((node) => isContainerNode(node));
  const deviceNodes = nodes.filter((node) => !isContainerNode(node));
  const links = connections.map((c: Connection) => ({
    ...c,
    source: c.from.deviceId,
    target: c.to.deviceId,
  })) as SimLink[];
  const fanoutOffsetByEndpoint = linkFanoutOffsetsByEndpoint(links);

  const linkSelection = linkLayer
    .attr("stroke", GRAPH_COLORS.linkStroke)
    .attr("stroke-opacity", GRAPH_DEFAULTS.link.defaultOpacity)
    .selectAll("line")
    .data(links, (d: SimLink) => d.id)
    .join("line")
    .attr("stroke-width", GRAPH_DEFAULTS.link.defaultWidth);

  // Selection/highlight indicator that doesn't compete with fill colors.
  const haloSelection = haloLayer
    .attr("pointer-events", "none")
    .selectAll("circle")
    .data(nodes, (d: SimNode) => d.id)
    .join("circle")
    .attr("r", GRAPH_DEFAULTS.halo.radius.default)
    .attr("fill", "none")
    .attr("stroke", GRAPH_COLORS.halo.default)
    .attr("stroke-width", GRAPH_DEFAULTS.halo.strokeWidth.selected)
    .attr("opacity", 0);

  const containerSelection = containerLayer
    .selectAll("rect")
    .data(containerNodes, (d: SimNode) => d.id)
    .join("rect")
    .attr("rx", 10)
    .attr("ry", 10)
    .attr("class", "graph-container")
    .on("click", (_event: unknown, d: SimNode) => onNodeSelect(d.id))
    .call(
      d3.drag()
        .on("drag", (event: { x: number; y: number }, d: SimNode) => {
          d.x = event.x;
          d.y = event.y;
          d.fx = d.x;
          d.fy = d.y;
          renderPositions();
        })
        .on("end", (_event: unknown, d: SimNode) => {
          d.fx = d.x;
          d.fy = d.y;
        }),
    );

  let layoutKind = "force";

  const simulation = d3.forceSimulation(deviceNodes)
    .force(
      "link",
      d3.forceLink(links).id((d: { id: string }) => d.id).distance(
        GRAPH_DEFAULTS.link.force.distance,
      )
        .strength(GRAPH_DEFAULTS.link.force.strength),
    )
    .force(
      "charge",
      d3.forceManyBody().strength(GRAPH_DEFAULTS.simulation.chargeStrength),
    )
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide(GRAPH_DEFAULTS.simulation.collideRadius));

  const nodeSelection = nodeLayer
    .selectAll("circle")
    .data(deviceNodes, (d: SimNode) => d.id)
    .join("circle")
    .attr("r", GRAPH_DEFAULTS.node.radius)
    .attr("fill", (d: SimNode) => getNodeFill(d))
    .attr("stroke", GRAPH_COLORS.nodeStroke)
    .attr("stroke-width", GRAPH_DEFAULTS.node.strokeWidth)
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
    .data(deviceNodes, (d: SimNode) => d.id)
    .join("text")
    .attr("fill", GRAPH_COLORS.label)
    .attr("font-size", GRAPH_DEFAULTS.label.fontSize)
    .attr("text-anchor", "middle")
    .attr("dy", GRAPH_DEFAULTS.label.dy)
    .text((d: SimNode) => d.name);

  let onTickHook: (() => void) | null = null;

  const renderPositions = () => {
    const linkPosCache = new Map<string, {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }>();

    const linkPos = (d: SimLink) => {
      const cached = linkPosCache.get(d.id);
      if (cached) return cached;

      const source = d.source as ResolvedLinkEnd;
      const target = d.target as ResolvedLinkEnd;

      const dx = (target.x ?? 0) - (source.x ?? 0);
      const dy = (target.y ?? 0) - (source.y ?? 0);
      const length = Math.max(1e-6, Math.hypot(dx, dy));
      const nx = -dy / length;
      const ny = dx / length;

      const sourceOffset =
        (fanoutOffsetByEndpoint.get(`${d.id}|${source.id}`) ?? 0) *
        GRAPH_DEFAULTS.link.fanoutPx;
      const targetOffset =
        (fanoutOffsetByEndpoint.get(`${d.id}|${target.id}`) ?? 0) *
        GRAPH_DEFAULTS.link.fanoutPx;

      const positioned = {
        x1: source.x + nx * sourceOffset,
        y1: source.y + ny * sourceOffset,
        x2: target.x + nx * targetOffset,
        y2: target.y + ny * targetOffset,
      };
      linkPosCache.set(d.id, positioned);
      return positioned;
    };

    linkSelection
      .attr("x1", (d: SimLink) => linkPos(d).x1)
      .attr("y1", (d: SimLink) => linkPos(d).y1)
      .attr("x2", (d: SimLink) => linkPos(d).x2)
      .attr("y2", (d: SimLink) => linkPos(d).y2);

    containerSelection
      .attr("x", (d: SimNode) => (d.x ?? width / 2) - getContainerWidth(d) / 2)
      .attr(
        "y",
        (d: SimNode) => (d.y ?? height / 2) - getContainerHeight(d) / 2,
      )
      .attr("width", (d: SimNode) => getContainerWidth(d))
      .attr("height", (d: SimNode) => getContainerHeight(d));

    onTickHook?.();
    nodeSelection
      .attr("cx", (d: SimNode) => {
        d.x = Math.max(
          GRAPH_DEFAULTS.node.boundsPadding,
          Math.min(width - GRAPH_DEFAULTS.node.boundsPadding, d.x || width / 2),
        );
        return d.x;
      })
      .attr("cy", (d: SimNode) => {
        d.y = Math.max(
          GRAPH_DEFAULTS.node.boundsPadding,
          Math.min(
            height - GRAPH_DEFAULTS.node.boundsPadding,
            d.y || height / 2,
          ),
        );
        return d.y;
      });

    haloSelection
      .attr("cx", (d: SimNode) => d.x)
      .attr("cy", (d: SimNode) => d.y);

    labelSelection
      .attr("text-anchor", "middle")
      .attr("x", (d: SimNode) => d.x)
      .attr("y", (d: SimNode) => (d.y ?? 0) + GRAPH_DEFAULTS.label.yOffset);
  };

  const renderGuides = (guides: Guide[] = []) => {
    const g = Array.isArray(guides) ? guides : [];
    lastGuides = g;
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
      .attr("stroke", GRAPH_COLORS.guide)
      .attr("stroke-width", GRAPH_DEFAULTS.guides.strokeWidth)
      .attr("stroke-opacity", GRAPH_DEFAULTS.guides.strokeOpacity);
  };

  const setLayoutKind = (kind: string) => {
    layoutKind = kind || "force";
  };

  const updateStyles = (args: RendererUpdateArgs) => {
    const linkT = linkSelection.interrupt().transition().duration(
      GRAPH_DEFAULTS.transitionMs,
    ).ease(
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
      .attr("r", GRAPH_DEFAULTS.node.radius)
      .attr("fill", (d: SimNode) => getNodeFill(d))
      .attr("stroke", GRAPH_COLORS.nodeStroke)
      .attr("stroke-width", GRAPH_DEFAULTS.node.strokeWidth)
      // Keep nodes opaque so links never visually "sit on top" of devices.
      .attr("opacity", 1)
      // De-emphasize via filter rather than transparency.
      .style("filter", args.getNodeFilter);

    labelSelection.attr("opacity", args.getLabelOpacity);
  };

  simulation.on("tick", renderPositions);

  const resize = (next: { width: number; height: number }) => {
    const w = Math.max(1, Math.floor(Number(next?.width) || 0));
    const h = Math.max(1, Math.floor(Number(next?.height) || 0));
    if (!w || !h) return;

    width = w;
    height = h;

    svgSel
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    simulation.force("center", d3.forceCenter(width / 2, height / 2));
    if (layoutKind === "force") simulation.alpha(0.5).restart();

    renderGuides(lastGuides);
    renderPositions();
  };

  const destroy = () => {
    simulation.stop();
    svgSel.on(".marquee", null);
    svgSel.on(".zoom", null);
    svgSel.selectAll("*").remove();
  };

  return {
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    nodes,
    links,
    getNodePositions,
    getViewportCenter,
    getViewportTransform,
    setViewportTransform,
    simulation,
    vizLayer,
    linkSelection,
    renderPositions,
    renderGuides,
    resize,
    setLayoutKind,
    setOnTickHook: (fn: (() => void) | null) => {
      onTickHook = fn;
    },
    updateStyles,
    destroy,
  };
}
