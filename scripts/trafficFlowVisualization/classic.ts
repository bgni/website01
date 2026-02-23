import type {
  LinkDasharrayArgs,
  LinkStrokeArgs,
  LinkWidthArgs,
  TrafficViz,
  TrafficVizHelpers,
} from "./types.ts";

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
      return highlighted ? "#e2e8f0" : defaultStroke;
    },
    getLinkWidth({ traffic, highlighted, defaultWidth }: LinkWidthArgs) {
      const base = traffic
        ? (trafficWidthRate?.(traffic.rateMbps) ?? defaultWidth)
        : defaultWidth;
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
