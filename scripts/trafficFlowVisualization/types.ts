import type { TrafficUpdate } from "../trafficConnector.ts";

export type TrafficVizKind = "classic" | "util-width" | "flow-dashes";

export type TrafficVizHelpers = {
  trafficColor?: (
    status: string | undefined,
    utilization: number | undefined,
  ) => string;
  trafficWidthRate?: (rateMbps: number | undefined) => number;
};

export type GraphLinkDatum = {
  id: string;
  source: { id: string; x: number; y: number };
  target: { id: string; x: number; y: number };
};

export type LinkStrokeArgs = {
  traffic?: TrafficUpdate;
  highlighted: boolean;
  defaultStroke: string;
};

export type LinkWidthArgs = {
  traffic?: TrafficUpdate;
  highlighted: boolean;
  defaultWidth: number;
};

export type LinkDasharrayArgs = { traffic?: TrafficUpdate; highlighted: boolean };

export type TrafficVizStartArgs = {
  container: unknown;
  links: GraphLinkDatum[];
  link: unknown;
};

export type TrafficVizAfterStyleArgs = {
  highlightedLinks: Set<string>;
  hasSelection: boolean;
  filteredSet: Set<string>;
  selected?: Set<string>;
};

export type TrafficViz = {
  id: TrafficVizKind;
  getLinkStroke(args: LinkStrokeArgs): string;
  getLinkWidth(args: LinkWidthArgs): number;
  getLinkDasharray(args: LinkDasharrayArgs): string;
  start?(args: TrafficVizStartArgs): () => void;
  setTrafficGetter?(fn: (connectionId: string) => TrafficUpdate | undefined): void;
  onSimulationTick?(): void;
  afterLinkStyle?(args: TrafficVizAfterStyleArgs): void;
  destroy?(): void;
};
