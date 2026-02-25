import type { TrafficUpdate } from "../domain/types.ts";
import type { Adjacency } from "../lib/graph/adjacency.ts";
import { collectHighlights } from "../lib/graph/highlights.ts";
import type {
  LinkDasharrayArgs,
  LinkStrokeArgs,
  LinkWidthArgs,
  TrafficVizAfterStyleArgs,
} from "../trafficFlowVisualization/types.ts";
import type { RendererUpdateArgs, SimLink, SimNode } from "./renderer.ts";
import { GRAPH_COLORS, GRAPH_DEFAULTS, TRAFFIC_STYLE } from "../config.ts";

type TrafficAdapter = {
  getLinkStroke(args: LinkStrokeArgs): string;
  getLinkWidth(args: LinkWidthArgs): number;
  getLinkDasharray(args: LinkDasharrayArgs): string;
  afterLinkStyle?: (args: TrafficVizAfterStyleArgs) => void;
};

export const buildRendererUpdateArgs = (
  {
    adjacency,
    selected,
    filteredSet,
    trafficById,
    trafficAdapter,
    defaultStroke = GRAPH_COLORS.linkStroke,
    defaultWidth = GRAPH_DEFAULTS.link.defaultWidth,
  }: {
    adjacency: Adjacency;
    selected: Set<string>;
    filteredSet: Set<string>;
    trafficById: Record<string, TrafficUpdate>;
    trafficAdapter: TrafficAdapter;
    defaultStroke?: string;
    defaultWidth?: number;
  },
): RendererUpdateArgs => {
  const { nodes: highlightedNodes, links: highlightedLinks } =
    collectHighlights(adjacency, selected);
  const hasSelection = selected.size > 0;

  return {
    getLinkStroke: (d: SimLink) =>
      trafficAdapter.getLinkStroke({
        traffic: trafficById[d.id],
        highlighted: highlightedLinks.has(d.id),
        defaultStroke,
      }),
    getLinkWidth: (d: SimLink) =>
      trafficAdapter.getLinkWidth({
        traffic: trafficById[d.id],
        highlighted: highlightedLinks.has(d.id),
        defaultWidth,
      }),
    getLinkDasharray: (d: SimLink) =>
      trafficAdapter.getLinkDasharray({
        traffic: trafficById[d.id],
        highlighted: highlightedLinks.has(d.id),
      }),
    getLinkOpacity: (d: SimLink) => {
      const t = trafficById[d.id];
      // Always make down links clearly visible.
      if (t?.status === TRAFFIC_STYLE.downStatus) return 1;
      if (hasSelection) {
        if (highlightedLinks.size) {
          return highlightedLinks.has(d.id) ? 1 : 0.2;
        }
        return (selected.has((d.source as { id: string }).id) ||
            selected.has((d.target as { id: string }).id))
          ? 0.85
          : 0.25;
      }
      return (filteredSet.has((d.source as { id: string }).id) ||
          filteredSet.has((d.target as { id: string }).id))
        ? 0.8
        : 0.25;
    },
    afterLinkStyle: trafficAdapter.afterLinkStyle
      ? () => {
        trafficAdapter.afterLinkStyle?.({
          highlightedLinks,
          hasSelection,
          filteredSet,
          selected,
        });
      }
      : undefined,
    getHalo: (d: SimNode) => {
      const r = selected.has(d.id)
        ? GRAPH_DEFAULTS.halo.radius.selected
        : GRAPH_DEFAULTS.halo.radius.default;
      const stroke = selected.has(d.id)
        ? GRAPH_COLORS.halo.default
        : (highlightedNodes.has(d.id)
          ? GRAPH_COLORS.halo.highlighted
          : GRAPH_COLORS.halo.default);
      const strokeWidth = selected.has(d.id)
        ? GRAPH_DEFAULTS.halo.strokeWidth.selected
        : GRAPH_DEFAULTS.halo.strokeWidth.default;
      const opacity = !hasSelection
        ? GRAPH_DEFAULTS.halo.opacity.none
        : (selected.has(d.id)
          ? GRAPH_DEFAULTS.halo.opacity.selected
          : (highlightedNodes.has(d.id)
            ? GRAPH_DEFAULTS.halo.opacity.highlighted
            : GRAPH_DEFAULTS.halo.opacity.none));
      return { r, stroke, strokeWidth, opacity };
    },
    getNodeFilter: (d: SimNode) => {
      if (hasSelection) {
        return highlightedNodes.has(d.id)
          ? "none"
          : GRAPH_DEFAULTS.filters.selectedDim;
      }
      return filteredSet.has(d.id)
        ? "none"
        : GRAPH_DEFAULTS.filters.filteredDim;
    },
    getLabelOpacity: (d: SimNode) => {
      if (hasSelection) return highlightedNodes.has(d.id) ? 0.95 : 0.25;
      return filteredSet.has(d.id) ? 0.85 : 0.4;
    },
  };
};
