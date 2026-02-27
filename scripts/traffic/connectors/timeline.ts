import type { OnTrafficUpdate, StopTraffic, TrafficUpdate } from "../types.ts";
import { isObject } from "../util.ts";

export type TimelineTrafficConnectorOptions = {
  timeline: unknown;
  tickMs?: number;
  loop?: boolean;
  speedMultiplier?: number;
};

export function createTimelineTrafficConnector({
  timeline,
  tickMs = 250,
  loop = false,
  speedMultiplier = 1,
}: TimelineTrafficConnectorOptions) {
  const normalizedSpeed =
    Number.isFinite(speedMultiplier) && speedMultiplier > 0
      ? speedMultiplier
      : 1;
  const timelineRec = isObject(timeline) ? timeline : null;
  const initial = Array.isArray(timelineRec?.initial)
    ? (timelineRec.initial as TrafficUpdate[])
    : [];
  const updates = Array.isArray(timelineRec?.updates)
    ? (timelineRec.updates as Array<Record<string, unknown>>)
    : [];

  type TimelineUpdate = Record<string, unknown> & {
    t: number;
    offset?: number;
    connectionId?: string;
  };

  const queueBase: TimelineUpdate[] = updates
    .map((u) => {
      const rec = isObject(u) ? u : {};
      return {
        t: typeof rec.t === "number"
          ? rec.t
          : (typeof rec.offset === "number" ? rec.offset : 0),
        ...rec,
      } as TimelineUpdate;
    })
    .filter((u) =>
      u && typeof u.connectionId === "string" &&
      Number.isFinite(u.t) && u.t >= 0
    )
    .sort((a, b) => a.t - b.t);

  return {
    kind: "timeline",
    start(onUpdate: OnTrafficUpdate): StopTraffic {
      if (typeof onUpdate !== "function") {
        throw new Error("onUpdate callback is required");
      }

      onUpdate({ initial, updates: [] });

      let start = performance.now();
      let idx = 0;
      let queue = queueBase;

      const timer = setInterval(() => {
        const elapsedSec = ((performance.now() - start) / 1000) *
          normalizedSpeed;
        const batch = [];

        while (idx < queue.length && queue[idx].t <= elapsedSec) {
          const { t: _t, offset: _offset, ...rest } = queue[idx];
          batch.push(rest);
          idx += 1;
        }

        if (batch.length) onUpdate(batch);

        if (loop && idx >= queue.length) {
          start = performance.now();
          idx = 0;
          queue = queueBase;
        }
      }, Math.max(50, tickMs / normalizedSpeed));

      return () => clearInterval(timer);
    },
  };
}
