import type { FetchJson, OnTrafficUpdate, StopTraffic } from "../types.ts";
import { defaultFetchJson } from "../fetch.ts";
import { isObject } from "../util.ts";

export type RealTrafficConnectorOptions = {
  url: string;
  fetchJson?: FetchJson;
  intervalMs?: number;
  speedMultiplier?: number;
};

export function createRealTrafficConnector({
  url,
  fetchJson = defaultFetchJson,
  intervalMs = 5000,
  speedMultiplier = 1,
}: RealTrafficConnectorOptions) {
  if (!url) throw new Error("url is required");
  const normalizedSpeed =
    Number.isFinite(speedMultiplier) && speedMultiplier > 0
      ? speedMultiplier
      : 1;

  return {
    kind: "real",
    start(onUpdate: OnTrafficUpdate): StopTraffic {
      if (typeof onUpdate !== "function") {
        throw new Error("onUpdate callback is required");
      }

      const tick = async () => {
        const data = await fetchJson(url);
        if (Array.isArray(data)) onUpdate(data);
        else if (isObject(data) && Array.isArray(data.initial)) onUpdate(data);
      };

      // Fire immediately then poll.
      tick().catch((err) => console.error(err));
      const timer = setInterval(
        () => tick().catch((err) => console.error(err)),
        Math.max(100, intervalMs / normalizedSpeed),
      );

      return () => clearInterval(timer);
    },
  };
}
