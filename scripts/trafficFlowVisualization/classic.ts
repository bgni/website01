import type {
  LinkDasharrayArgs,
  LinkStrokeArgs,
  LinkWidthArgs,
  TrafficViz,
  TrafficVizHelpers,
} from "./types.ts";
import { GRAPH_COLORS, TRAFFIC_STYLE } from "../config.ts";

export function createClassicTrafficVisualization(
  { trafficColor, trafficWidthRate }: TrafficVizHelpers = {},
): TrafficViz {
  return {
    id: "classic",
    getLinkStroke({ traffic, highlighted, defaultStroke }: LinkStrokeArgs) {
      if (traffic) {
        return trafficColor?.(traffic.status, traffic.utilization) ||
          defaultStroke;
      }
      return highlighted ? GRAPH_COLORS.highlight : defaultStroke;
    },
    getLinkWidth({ traffic, highlighted, defaultWidth }: LinkWidthArgs) {
      const base = traffic
        ? (trafficWidthRate?.(traffic.rateMbps) ?? defaultWidth)
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
    start() {
      return () => {};
    },
    onSimulationTick() {},
    destroy() {},
  };
}
