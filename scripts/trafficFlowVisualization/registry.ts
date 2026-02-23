import { createClassicTrafficVisualization } from "./classic.ts";
import { createUtilWidthTrafficVisualization } from "./utilWidth.ts";
import { createFlowDashesTrafficVisualization } from "./flowDashes.ts";
import type { TrafficViz, TrafficVizHelpers, TrafficVizKind } from "./types.ts";

export const TRAFFIC_VIZ_OPTIONS = [
  { id: "classic", name: "Classic (width=rate, color=util)" },
  { id: "util-width", name: "Util width (width=util, color=status)" },
  { id: "flow-dashes", name: "Flow dashes (speed=rate)" },
];

export function createTrafficFlowVisualization(
  kind: TrafficVizKind,
  helpers: TrafficVizHelpers,
): TrafficViz {
  switch (kind) {
    case "util-width":
      return createUtilWidthTrafficVisualization(helpers);
    case "flow-dashes":
      return createFlowDashesTrafficVisualization(helpers);
    case "classic":
    default:
      return createClassicTrafficVisualization(helpers);
  }
}
