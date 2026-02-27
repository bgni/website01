import type { OnTrafficUpdate, StopTraffic, TrafficUpdate } from "../types.ts";
import { clamp, isObject } from "../util.ts";

// Generated connector: random-walk updates driven by a config file.
// Config format (minimal):
// {
//   "tickSeconds": 1,
//   "initial": [{ connectionId, status, rateMbps, utilization }, ...],
//   "links": {
//     "conn-id": { "rateMbps": {"min":0,"max":1000,"delta":50}, "utilization": {"min":0,"max":1,"delta":0.05} }
//   },
//   "events": [{"t": 10, "connectionId": "...", "status": "down" }, ...]
// }
export function createGeneratedTrafficConnector({
  config,
  speedMultiplier = 1,
}: { config: unknown; speedMultiplier?: number }) {
  if (!isObject(config)) throw new Error("config is required");
  const normalizedSpeed =
    Number.isFinite(speedMultiplier) && speedMultiplier > 0
      ? speedMultiplier
      : 1;

  const cfg = config as Record<string, unknown>;

  const tickSeconds = typeof cfg.tickSeconds === "number" && cfg.tickSeconds > 0
    ? cfg.tickSeconds
    : 1;
  const initial = Array.isArray(cfg.initial) ? cfg.initial : [];
  const links = isObject(cfg.links)
    ? (cfg.links as Record<string, unknown>)
    : {};
  const events = Array.isArray(cfg.events) ? cfg.events : [];

  const eventsQueueBase = events
    .map((e) => ({ t: typeof e?.t === "number" ? e.t : 0, ...e }))
    .filter((e) => e && e.connectionId && Number.isFinite(e.t) && e.t >= 0)
    .sort((a, b) => a.t - b.t);

  return {
    kind: "generated",
    start(onUpdate: OnTrafficUpdate): StopTraffic {
      if (typeof onUpdate !== "function") {
        throw new Error("onUpdate callback is required");
      }

      // Seed.
      onUpdate({ initial, updates: [] });

      const state = new Map();
      initial.forEach((t) => {
        if (!isObject(t) || typeof t.connectionId !== "string") return;
        state.set(t.connectionId, { ...t } as TrafficUpdate);
      });

      const start = performance.now();
      let eventIdx = 0;

      const tick = () => {
        const elapsedSec = ((performance.now() - start) / 1000) *
          normalizedSpeed;
        const batch = [];

        // Apply scheduled events.
        while (
          eventIdx < eventsQueueBase.length &&
          eventsQueueBase[eventIdx].t <= elapsedSec
        ) {
          const { t: _t, ...ev } = eventsQueueBase[eventIdx];
          batch.push(ev);
          const prev = state.get(ev.connectionId) ||
            { connectionId: ev.connectionId };
          state.set(ev.connectionId, { ...prev, ...ev });
          eventIdx += 1;
        }

        // Random walk updates.
        Object.entries(links).forEach(([connectionId, rulesUnknown]) => {
          const rules = isObject(rulesUnknown)
            ? (rulesUnknown as Record<string, unknown>)
            : ({} as Record<string, unknown>);

          const prev: TrafficUpdate = state.get(connectionId) ||
            { connectionId, status: "up", rateMbps: 0, utilization: 0 };

          const status = prev.status || "up";
          const rateRule = isObject(rules.rateMbps)
            ? (rules.rateMbps as Record<string, unknown>)
            : null;
          const utilRule = isObject(rules.utilization)
            ? (rules.utilization as Record<string, unknown>)
            : null;
          const capacityMbps =
            typeof rules.capacityMbps === "number" && rules.capacityMbps > 0
              ? rules.capacityMbps
              : null;

          if (status === "down") {
            // Keep it pinned at 0 unless events change it.
            return;
          }

          let nextRate: number = typeof prev.rateMbps === "number"
            ? prev.rateMbps
            : 0;
          let nextUtil: number = typeof prev.utilization === "number"
            ? prev.utilization
            : 0;

          if (rateRule) {
            const min = typeof rateRule.min === "number" ? rateRule.min : 0;
            const max = typeof rateRule.max === "number"
              ? rateRule.max
              : Math.max(min, 1000);
            const delta = typeof rateRule.delta === "number"
              ? rateRule.delta
              : 0;
            if (delta > 0) {
              nextRate = clamp(
                (Number(nextRate) || 0) + (Math.random() * 2 - 1) * delta,
                min,
                max,
              );
            }
          }

          if (utilRule) {
            const min = typeof utilRule.min === "number" ? utilRule.min : 0;
            const max = typeof utilRule.max === "number" ? utilRule.max : 1;
            const delta = typeof utilRule.delta === "number"
              ? utilRule.delta
              : 0;
            if (delta > 0) {
              nextUtil = clamp(
                (Number(nextUtil) || 0) + (Math.random() * 2 - 1) * delta,
                min,
                max,
              );
            }
          }

          // If a capacity is supplied, keep utilization consistent with rate.
          // This makes "link speed" (capacity) and traffic (rate) coherent.
          if (capacityMbps) {
            const utilMin = utilRule && typeof utilRule.min === "number"
              ? utilRule.min
              : 0;
            const utilMax = utilRule && typeof utilRule.max === "number"
              ? utilRule.max
              : 1;

            const base = clamp((Number(nextRate) || 0) / capacityMbps, 0, 1);
            const jitter = (Math.random() * 2 - 1) * 0.03; // +/- 3% wiggle keeps it from looking too perfect
            nextUtil = clamp(base + jitter, utilMin, utilMax);
          }

          // Emit only if it changed meaningfully.
          const rateChanged = typeof nextRate === "number" &&
            Math.abs((Number(prev.rateMbps) || 0) - nextRate) >= 1;
          const utilChanged = typeof nextUtil === "number" &&
            Math.abs((Number(prev.utilization) || 0) - nextUtil) >= 0.01;
          if (!rateChanged && !utilChanged) return;

          const update: TrafficUpdate = { connectionId };
          if (rateChanged) update.rateMbps = Math.round(nextRate);
          if (utilChanged) {
            update.utilization = Math.round(nextUtil * 100) / 100;
          }

          batch.push(update);
          state.set(connectionId, { ...prev, ...update });
        });

        if (batch.length) onUpdate(batch);
      };

      const timer = setInterval(
        tick,
        Math.max(100, (tickSeconds * 1000) / normalizedSpeed),
      );
      return () => clearInterval(timer);
    },
  };
}
