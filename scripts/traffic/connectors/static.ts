import type { OnTrafficUpdate, StopTraffic } from "../types.ts";

export type StaticTrafficConnectorOptions = { source: unknown };

export function createStaticTrafficConnector(
  { source }: StaticTrafficConnectorOptions,
) {
  return {
    kind: "static",
    start(onUpdate: OnTrafficUpdate): StopTraffic {
      if (typeof onUpdate !== "function") {
        throw new Error("onUpdate callback is required");
      }
      onUpdate(source);
      return () => {};
    },
  };
}
