import type {
  LinkDasharrayArgs,
  LinkStrokeArgs,
  LinkWidthArgs,
  TrafficViz,
  TrafficVizHelpers,
} from "./types.ts";
import { GRAPH_COLORS, TRAFFIC_STYLE } from "../config.ts";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const widthFromUtil = (util: unknown) => {
  const u = clamp01(typeof util === "number" ? util : 0);
  // Keep it readable but not huge.
  const min = TRAFFIC_STYLE.utilWidth.minWidth;
  const max = TRAFFIC_STYLE.utilWidth.maxWidth;
  return min + u * (max - min);
};

export function createUtilWidthTrafficVisualization(
  _helpers: TrafficVizHelpers = {},
): TrafficViz {
  return {
    id: "util-width",
    getLinkStroke({ traffic, highlighted, defaultStroke }: LinkStrokeArgs) {
      if (traffic) {
        if (traffic.status === TRAFFIC_STYLE.downStatus) {
          return TRAFFIC_STYLE.downColor;
        }
        // Keep "up" neutral; width already encodes utilization for this mode.
        return GRAPH_COLORS.trafficNeutral;
      }
      return highlighted ? GRAPH_COLORS.highlight : defaultStroke;
    },
    getLinkWidth({ traffic, highlighted, defaultWidth }: LinkWidthArgs) {
      const base = traffic ? widthFromUtil(traffic.utilization) : defaultWidth;
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
