export type {
  FetchJson,
  OnTrafficUpdate,
  StopTraffic,
  TrafficPayload,
  TrafficTimeline,
  TrafficUpdate,
} from "./traffic/types.ts";

export type { RealTrafficConnectorOptions } from "./traffic/connectors/real.ts";
export { createRealTrafficConnector } from "./traffic/connectors/real.ts";

export type { StaticTrafficConnectorOptions } from "./traffic/connectors/static.ts";
export { createStaticTrafficConnector } from "./traffic/connectors/static.ts";

export type { TimelineTrafficConnectorOptions } from "./traffic/connectors/timeline.ts";
export { createTimelineTrafficConnector } from "./traffic/connectors/timeline.ts";

export { createGeneratedTrafficConnector } from "./traffic/connectors/generated.ts";

export { createFlowTrafficConnector } from "./traffic/connectors/flow.ts";
