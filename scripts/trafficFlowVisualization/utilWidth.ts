import type {
  LinkDasharrayArgs,
  LinkStrokeArgs,
  LinkWidthArgs,
  TrafficViz,
  TrafficVizHelpers,
} from "./types.ts";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const widthFromUtil = (util: unknown) => {
  const u = clamp01(typeof util === "number" ? util : 0);
  // Keep it readable but not huge.
  const min = 1.2;
  const max = 8;
  return min + u * (max - min);
};

export function createUtilWidthTrafficVisualization(
  _helpers: TrafficVizHelpers = {},
): TrafficViz {
  return {
    id: "util-width",
    getLinkStroke({ traffic, highlighted, defaultStroke }: LinkStrokeArgs) {
      if (traffic) {
        if (traffic.status === "down") return "#f87171";
        // Keep "up" neutral; width already encodes utilization for this mode.
        return "#64748b";
      }
      return highlighted ? "#e2e8f0" : defaultStroke;
    },
    getLinkWidth({ traffic, highlighted, defaultWidth }: LinkWidthArgs) {
      const base = traffic ? widthFromUtil(traffic.utilization) : defaultWidth;
      return highlighted ? Math.max(base, 3) : base;
    },
    getLinkDasharray({ traffic }: LinkDasharrayArgs) {
      if (traffic?.status === "down") return "6 4";
      return "0";
    },
    start() {
      return () => {};
    },
    onSimulationTick() {},
    destroy() {},
  };
}
