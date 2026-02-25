import type { TrafficUpdate } from "../domain/types.ts";
import { GRAPH_COLORS, GRAPH_DEFAULTS, TRAFFIC_STYLE } from "../config.ts";
import { getD3 } from "../lib/d3.ts";
import type {
  GraphLinkDatum,
  LinkDasharrayArgs,
  LinkStrokeArgs,
  LinkWidthArgs,
  TrafficViz,
  TrafficVizAfterStyleArgs,
  TrafficVizHelpers,
  TrafficVizStartArgs,
} from "./types.ts";

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

const getEndId = (end: string | { id: string }): string =>
  typeof end === "string" ? end : end.id;

const buildFanoutOffsetsByEndpoint = (links: GraphLinkDatum[]) => {
  const byNode = new Map<string, GraphLinkDatum[]>();
  const add = (nodeId: string, link: GraphLinkDatum) => {
    const arr = byNode.get(nodeId);
    if (arr) arr.push(link);
    else byNode.set(nodeId, [link]);
  };

  links.forEach((link) => {
    add(getEndId(link.source), link);
    add(getEndId(link.target), link);
  });

  const out = new Map<string, number>();
  for (const [nodeId, nodeLinks] of byNode.entries()) {
    const sorted = [...nodeLinks].sort((a, b) => {
      const aOther = getEndId(a.source) === nodeId
        ? getEndId(a.target)
        : getEndId(a.source);
      const bOther = getEndId(b.source) === nodeId
        ? getEndId(b.target)
        : getEndId(b.source);
      return `${aOther}\n${a.id}`.localeCompare(`${bOther}\n${b.id}`);
    });

    const mid = (sorted.length - 1) / 2;
    sorted.forEach((link, idx) => {
      out.set(`${link.id}|${nodeId}`, idx - mid);
    });
  }
  return out;
};

const speedFromRate = (rateMbps: unknown) => {
  const r = Math.max(0, Number(rateMbps) || 0);
  // Map 0..10G to a reasonable px/sec-ish range for dash offset.
  const clamped = Math.min(r, 10000);
  return 2 + (clamped / 10000) * 26; // 2..28
};

export function createFlowDashesTrafficVisualization(
  { trafficColor, trafficWidthRate }: TrafficVizHelpers = {},
): TrafficViz {
  const d3 = getD3();
  // deno-lint-ignore no-explicit-any
  let overlay: any;
  let rafId = 0;
  let running = false;
  let getTraffic: ((connectionId: string) => TrafficUpdate | undefined) | null =
    null;
  // deno-lint-ignore no-explicit-any
  let linkSelection: any;
  let lastNow = 0;
  const offsetById = new Map<string, number>();
  let fanoutByEndpoint = new Map<string, number>();

  const animate = (now: number) => {
    if (!running) return;

    if (!lastNow) lastNow = now;
    const dt = Math.max(0, (now - lastNow) / 1000);
    lastNow = now;

    overlay
      .attr("stroke-dashoffset", (d: GraphLinkDatum) => {
        const t = getTraffic?.(d.id);
        const speed = speedFromRate(t?.rateMbps);
        const prev = offsetById.get(d.id) ?? 0;
        // negative makes it look like it moves forward; direction is arbitrary without A->B metrics
        const next = prev - dt * speed;
        offsetById.set(d.id, next);
        return next;
      });

    rafId = requestAnimationFrame(animate);
  };

  return {
    id: "flow-dashes",

    // Base line stays understated; overlay carries most of the traffic encoding.
    getLinkStroke({ traffic, highlighted, defaultStroke }: LinkStrokeArgs) {
      if (traffic) return GRAPH_COLORS.linkStroke;
      return highlighted ? GRAPH_COLORS.highlight : defaultStroke;
    },
    getLinkWidth({ traffic, highlighted, defaultWidth }: LinkWidthArgs) {
      const base = traffic
        ? Math.max(
          1.1,
          (trafficWidthRate?.(traffic.rateMbps) ?? defaultWidth) * 0.45,
        )
        : defaultWidth;
      return highlighted
        ? Math.max(base, TRAFFIC_STYLE.highlightMinWidth)
        : base;
    },
    getLinkDasharray({ traffic }: LinkDasharrayArgs) {
      if (traffic?.status === TRAFFIC_STYLE.downStatus) {
        return TRAFFIC_STYLE.dash.down;
      }
      return TRAFFIC_STYLE.dash.none;
    },

    start({ container, links, link }: TrafficVizStartArgs) {
      // deno-lint-ignore no-explicit-any
      linkSelection = link as any;

      // D3 selection is provided by the graph module; avoid pulling in full D3 typings.
      // deno-lint-ignore no-explicit-any
      const c = container as any;

      fanoutByEndpoint = buildFanoutOffsetsByEndpoint(links);

      overlay = c.append("g")
        .attr("pointer-events", "none")
        .selectAll("line")
        .data(links, (d: GraphLinkDatum) => d.id)
        .join("line")
        .attr("stroke-linecap", "round")
        .attr("stroke-opacity", 0.9);

      running = true;
      lastNow = 0;
      rafId = requestAnimationFrame(animate);

      return () => {
        running = false;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
        lastNow = 0;
        offsetById.clear();
        fanoutByEndpoint.clear();
        overlay?.remove();
        overlay = null;
      };
    },

    setTrafficGetter(fn: (connectionId: string) => TrafficUpdate | undefined) {
      getTraffic = fn;
    },

    onSimulationTick() {
      if (!overlay || !linkSelection) return;
      const cache = new Map<
        string,
        { x1: number; y1: number; x2: number; y2: number }
      >();
      const linkPos = (d: GraphLinkDatum) => {
        const hit = cache.get(d.id);
        if (hit) return hit;

        const source = d.source;
        const target = d.target;
        const dx = (target.x ?? 0) - (source.x ?? 0);
        const dy = (target.y ?? 0) - (source.y ?? 0);
        const length = Math.max(1e-6, Math.hypot(dx, dy));
        const nx = -dy / length;
        const ny = dx / length;

        const sourceOffset =
          (fanoutByEndpoint.get(`${d.id}|${source.id}`) ?? 0) *
          GRAPH_DEFAULTS.link.fanoutPx;
        const targetOffset =
          (fanoutByEndpoint.get(`${d.id}|${target.id}`) ?? 0) *
          GRAPH_DEFAULTS.link.fanoutPx;

        const out = {
          x1: source.x + nx * sourceOffset,
          y1: source.y + ny * sourceOffset,
          x2: target.x + nx * targetOffset,
          y2: target.y + ny * targetOffset,
        };
        cache.set(d.id, out);
        return out;
      };

      // Keep overlay in sync with base link positions.
      overlay
        .attr("x1", (d: GraphLinkDatum) => linkPos(d).x1)
        .attr("y1", (d: GraphLinkDatum) => linkPos(d).y1)
        .attr("x2", (d: GraphLinkDatum) => linkPos(d).x2)
        .attr("y2", (d: GraphLinkDatum) => linkPos(d).y2);
    },

    afterLinkStyle(
      { highlightedLinks, hasSelection, filteredSet }: TrafficVizAfterStyleArgs,
    ) {
      if (!overlay) return;

      const o = overlay.interrupt().transition().duration(
        GRAPH_DEFAULTS.transitionMs,
      ).ease(
        d3.easeCubicOut,
      );

      o
        .attr("stroke", (d: GraphLinkDatum) => {
          const t = getTraffic?.(d.id);
          if (!t) return "transparent";
          return trafficColor?.(t.status, t.utilization) ||
            GRAPH_COLORS.trafficOverlayFallback;
        })
        .attr("stroke-width", (d: GraphLinkDatum) => {
          const t = getTraffic?.(d.id);
          if (!t) return 0;
          const base = trafficWidthRate?.(t.rateMbps) ??
            GRAPH_DEFAULTS.link.defaultWidth;
          const w = clamp(base * 0.35 + 0.8, 1.2, 6);
          return t?.status === TRAFFIC_STYLE.downStatus
            ? Math.max(w, TRAFFIC_STYLE.highlightMinWidth)
            : w;
        })
        .attr("opacity", (d: GraphLinkDatum) => {
          const t = getTraffic?.(d.id);
          if (t?.status === TRAFFIC_STYLE.downStatus) return 1;
          // Mirror base-link opacity rules.
          if (hasSelection) {
            if (highlightedLinks.size) {
              return highlightedLinks.has(d.id) ? 1 : 0.14;
            }
            return 0.28;
          }
          return (filteredSet.has(d.source.id) || filteredSet.has(d.target.id))
            ? 0.9
            : 0.18;
        });

      // Keep dasharray changes immediate (avoids odd tweening artifacts).
      overlay.attr("stroke-dasharray", (d: GraphLinkDatum) => {
        const t = getTraffic?.(d.id);
        if (!t) return TRAFFIC_STYLE.dash.none;
        if (t.status === TRAFFIC_STYLE.downStatus) {
          return TRAFFIC_STYLE.dash.down;
        }
        // Keep pattern stable; only speed should change.
        return TRAFFIC_STYLE.dash.up;
      });
    },

    destroy() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      lastNow = 0;
      offsetById.clear();
      fanoutByEndpoint.clear();
      overlay?.remove();
      overlay = null;
    },
  };
}
