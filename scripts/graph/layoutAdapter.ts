import { applyLayout } from "../layouts/registry.ts";

export type LayoutApplyArgs = {
  simulation: unknown;
  d3: unknown;
  nodes: unknown;
  links: unknown;
  width: number;
  height: number;
};

export type LayoutMeta = { guides?: Array<{ y: number }> } | null | undefined;

export const applyLayoutToGraph = (kind: string, args: LayoutApplyArgs) =>
  applyLayout(
    kind,
    args as {
      simulation: unknown;
      d3: unknown;
      nodes: unknown;
      links: unknown;
      width: number;
      height: number;
    },
  ) as LayoutMeta;
