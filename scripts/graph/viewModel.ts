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
    defaultStroke = "#334155",
    defaultWidth = 1.4,
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
      if (t?.status === "down") return 1;
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
        ? 18
        : (highlightedNodes.has(d.id) ? 16 : 16);
      const stroke = selected.has(d.id)
        ? "#e2e8f0"
        : (highlightedNodes.has(d.id) ? "#94a3b8" : "#e2e8f0");
      const strokeWidth = selected.has(d.id)
        ? 2.5
        : (highlightedNodes.has(d.id) ? 2 : 2);
      const opacity = !hasSelection
        ? 0
        : (selected.has(d.id) ? 0.95 : (highlightedNodes.has(d.id) ? 0.55 : 0));
      return { r, stroke, strokeWidth, opacity };
    },
    getNodeFilter: (d: SimNode) => {
      if (hasSelection) {
        return highlightedNodes.has(d.id)
          ? "none"
          : "brightness(0.65) saturate(0.4)";
      }
      return filteredSet.has(d.id) ? "none" : "brightness(0.78) saturate(0.55)";
    },
    getLabelOpacity: (d: SimNode) => {
      if (hasSelection) return highlightedNodes.has(d.id) ? 0.95 : 0.25;
      return filteredSet.has(d.id) ? 0.85 : 0.4;
    },
  };
};
