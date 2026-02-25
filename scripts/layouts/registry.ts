import { applyForceLayout } from "./force.ts";
import { applyTieredLayout } from "./tiered.ts";

export const LAYOUTS = [
  { id: "force", name: "Force" },
  { id: "tiered", name: "Layered" },
  { id: "tiered-xmin", name: "Layered (cross-min)" },
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
  const meta =
    applyForceLayout(ctx as Parameters<typeof applyForceLayout>[0]) ||
    {};
  return { kind: "force", guides: meta.guides || [] };
}
