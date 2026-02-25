import { applyForceLayout } from "./force.ts";
import { applyTieredLayout } from "./tiered.ts";
import { applyDotLayout } from "./dot.ts";

export const LAYOUTS = [
  { id: "force", name: "Force" },
  { id: "tiered", name: "Layered" },
  { id: "tiered-xmin", name: "Layered (cross-min)" },
  { id: "dot", name: "DOT (Sugiyama)" },
];

export function applyLayout(kind: string, ctx: unknown) {
  if (kind === "tiered" || kind === "tiered-xmin") {
    const meta = applyTieredLayout(
      {
        ...(ctx as Parameters<typeof applyTieredLayout>[0]),
        crossMinimize: kind === "tiered-xmin",
      },
    ) || {};
    return { kind, guides: meta.guides || [] };
  }
  if (kind === "dot") {
    const meta = applyDotLayout(
      ctx as Parameters<typeof applyDotLayout>[0],
    ) || {};
    return { kind: "dot", guides: meta.guides || [] };
  }
  const meta =
    applyForceLayout(ctx as Parameters<typeof applyForceLayout>[0]) ||
    {};
  return { kind: "force", guides: meta.guides || [] };
}
