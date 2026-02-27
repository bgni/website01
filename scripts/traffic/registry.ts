import type { OnTrafficUpdate, StopTraffic } from "./types.ts";
import { isObject } from "./util.ts";
import { createFlowTrafficConnector } from "./connectors/flow.ts";
import { createGeneratedTrafficConnector } from "./connectors/generated.ts";
import { createRealTrafficConnector } from "./connectors/real.ts";
import { createStaticTrafficConnector } from "./connectors/static.ts";
import { createTimelineTrafficConnector } from "./connectors/timeline.ts";

type LoadJson = (path: string) => Promise<unknown>;

export type TrafficConnectorKind =
  | "flow"
  | "generated"
  | "static"
  | "real"
  | "timeline";

export const TRAFFIC_CONNECTOR_OPTIONS: Array<{ id: string; name: string }> = [
  { id: "default", name: "Source: Default" },
  { id: "flow", name: "Source: Flow" },
  { id: "generated", name: "Source: Generated" },
  { id: "static", name: "Source: Static" },
  { id: "real", name: "Source: Real (poll)" },
  { id: "timeline", name: "Source: Timeline" },
];

export type TrafficConnectorSpec = {
  kind: TrafficConnectorKind;
  configPath?: string;
  url?: string;
  intervalMs?: number;
};

export type TrafficConnector = {
  kind: string;
  start: (onUpdate: OnTrafficUpdate) => StopTraffic;
};

export const parseTrafficConnectorSpec = (
  connector: unknown,
): TrafficConnectorSpec | null => {
  if (!isObject(connector)) return null;

  const kind = connector.kind;
  if (
    kind !== "flow" &&
    kind !== "generated" &&
    kind !== "static" &&
    kind !== "real" &&
    kind !== "timeline"
  ) {
    return null;
  }

  const configPath = typeof connector.configPath === "string"
    ? connector.configPath
    : undefined;
  const url = typeof connector.url === "string" ? connector.url : undefined;
  const intervalMs = typeof connector.intervalMs === "number"
    ? connector.intervalMs
    : undefined;

  return { kind, configPath, url, intervalMs };
};

const resolveInNetwork = (basePath: string, configPath: string) =>
  `${basePath}/${configPath}`;

const normalizeSpeedMultiplier = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.max(0.1, Math.min(64, value));
};

export async function createTrafficConnector(
  spec: TrafficConnectorSpec | null,
  {
    basePath,
    trafficPath,
    loadJson,
    speedMultiplier = 1,
  }: {
    basePath: string;
    trafficPath: string;
    loadJson: LoadJson;
    speedMultiplier?: number;
  },
): Promise<TrafficConnector> {
  const normalizedSpeedMultiplier = normalizeSpeedMultiplier(speedMultiplier);

  if (spec?.kind === "flow") {
    const configPath = spec.configPath || "traffic.flow.json";
    const config = await loadJson(resolveInNetwork(basePath, configPath));

    const connections = await loadJson(
      resolveInNetwork(basePath, "connections.json"),
    );
    const connectionTypes = await loadJson("data/connectionTypes.json");

    return createFlowTrafficConnector({
      config,
      connections,
      connectionTypes,
      speedMultiplier: normalizedSpeedMultiplier,
    });
  }

  if (spec?.kind === "generated") {
    const configPath = spec.configPath || "traffic.generator.json";
    const config = await loadJson(resolveInNetwork(basePath, configPath));
    return createGeneratedTrafficConnector({
      config,
      speedMultiplier: normalizedSpeedMultiplier,
    });
  }

  if (spec?.kind === "static") {
    const configPath = spec.configPath || "traffic.json";
    const source = await loadJson(resolveInNetwork(basePath, configPath));
    return createStaticTrafficConnector({ source });
  }

  if (spec?.kind === "real") {
    const url = spec.url || trafficPath;
    const intervalMs = typeof spec.intervalMs === "number"
      ? spec.intervalMs
      : 5000;
    return createRealTrafficConnector({
      url,
      intervalMs,
      speedMultiplier: normalizedSpeedMultiplier,
    });
  }

  if (spec?.kind === "timeline") {
    const configPath = spec.configPath || "traffic.json";
    const timeline = await loadJson(resolveInNetwork(basePath, configPath));
    return createTimelineTrafficConnector({
      timeline,
      speedMultiplier: normalizedSpeedMultiplier,
    });
  }

  // Default behavior: if traffic.json is a timeline, play it; otherwise poll it.
  const source = await loadJson(trafficPath);
  if (isObject(source) && Array.isArray(source.initial)) {
    const tl = createTimelineTrafficConnector({
      timeline: source,
      speedMultiplier: normalizedSpeedMultiplier,
    });
    return { kind: "default", start: tl.start };
  }

  const real = createRealTrafficConnector({
    url: trafficPath,
    intervalMs: 5000,
    speedMultiplier: normalizedSpeedMultiplier,
  });
  return { kind: "default", start: real.start };
}
