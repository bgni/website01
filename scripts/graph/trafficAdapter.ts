import { createTrafficFlowVisualization } from "../trafficFlowVisualization/registry.ts";
import type { TrafficUpdate } from "../domain/types.ts";
import type {
  LinkDasharrayArgs,
  LinkStrokeArgs,
  LinkWidthArgs,
  TrafficViz,
  TrafficVizAfterStyleArgs,
  TrafficVizHelpers,
  TrafficVizKind,
} from "../trafficFlowVisualization/types.ts";

type VizMount = {
  container: unknown;
  links: unknown;
  linkSelection: unknown;
};

type Stop = () => void;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// Ops-friendly semantics:
// - "down" is the only critical hue-shifted state (red).
// - "up" is neutral; brightness indicates utilization.
// - Near saturation, hue drifts slightly toward orange to signal "hot" without implying "bad" at moderate levels.
const trafficColor = (status: string | undefined, util: number | undefined) => {
  if (status === "down") return "#f87171";
  const u = clamp01(Number(util) || 0);

  // Neutral slate/blue baseline.
  const baseHue = 215;
  const hotHue = 35; // orange
  const hotT = clamp01((u - 0.9) / 0.1); // only last 10% shifts hue
  const hue = baseHue + (hotHue - baseHue) * hotT;

  const saturation = 18 + u * 32; // 18..50
  const lightness = 26 + u * 46; // 26..72
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

const trafficWidth = (rateMbps: number | undefined) => {
  const minWidth = 0.7; // about half prior base
  const maxWidth = 14; // 10x base for 10Gbps+
  const clamped = Math.min(rateMbps || 0, 10000); // 10Gbps ceiling
  if (clamped <= 0.008) return minWidth; // ~1kB/s
  const scaled = minWidth + (clamped / 10000) * (maxWidth - minWidth);
  return Math.min(maxWidth, Math.max(minWidth, scaled));
};

const toKind = (kind: string): TrafficVizKind =>
  (kind === "util-width" || kind === "flow-dashes" || kind === "classic")
    ? kind
    : "classic";

export function createTrafficAdapter(
  {
    kind,
    getTraffic,
  }: {
    kind: string;
    getTraffic: (connectionId: string) => TrafficUpdate | undefined;
  },
) {
  const helpers: TrafficVizHelpers = {
    trafficColor,
    trafficWidthRate: trafficWidth,
  };

  let trafficViz: TrafficViz = createTrafficFlowVisualization(
    toKind(kind),
    helpers,
  );
  let stopViz: Stop = () => {};

  const cleanupCurrentViz = () => {
    stopViz?.();
    stopViz = () => {};
    trafficViz?.destroy?.();
  };

  const attach = ({ container, links, linkSelection }: VizMount) => {
    if (typeof trafficViz?.setTrafficGetter === "function") {
      trafficViz.setTrafficGetter(getTraffic);
    }
    if (typeof trafficViz?.start === "function") {
      const stop = trafficViz.start({
        container: container as never,
        links: links as never,
        link: linkSelection as never,
      });
      if (typeof stop === "function") stopViz = stop;
    }
  };

  const destroy = () => {
    cleanupCurrentViz();
  };

  const setKind = (next: string, mount: VizMount) => {
    cleanupCurrentViz();
    trafficViz = createTrafficFlowVisualization(toKind(next), helpers);
    attach(mount);
  };

  return {
    attach,
    destroy,
    setKind,
    // NOTE: these must delegate to the *current* trafficViz.
    // Binding once would pin them to the initial instance and make
    // runtime switching appear to "do nothing".
    getLinkStroke: (args: LinkStrokeArgs) =>
      trafficViz.getLinkStroke.call(trafficViz, args),
    getLinkWidth: (args: LinkWidthArgs) =>
      trafficViz.getLinkWidth.call(trafficViz, args),
    getLinkDasharray: (args: LinkDasharrayArgs) =>
      trafficViz.getLinkDasharray.call(trafficViz, args),
    afterLinkStyle: (args: TrafficVizAfterStyleArgs) =>
      trafficViz.afterLinkStyle?.call(trafficViz, args),
    onSimulationTick: () => trafficViz.onSimulationTick?.call(trafficViz),
  };
}
