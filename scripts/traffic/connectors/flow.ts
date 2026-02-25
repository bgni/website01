import type { OnTrafficUpdate, StopTraffic, TrafficUpdate } from "../types.ts";
import {
  buildUndirectedAdjacency,
  findShortestPathConnectionIds,
} from "../graph.ts";
import { asArray, clamp, isObject } from "../util.ts";

type ConnectionLike = {
  id?: unknown;
  from?: { deviceId?: unknown };
  to?: { deviceId?: unknown };
  connectionType?: unknown;
  connection_type?: unknown;
};

// Flow connector: deterministic end-to-end traffic that propagates across the network.
// Config:
// {
//   "tickSeconds": 1,
//   "flows": [{ "id": "f1", "fromDeviceId": "a", "toDeviceId": "b", "rateMbps": 50 }],
//   "events": [{ "t": 10, "flowId": "f1", "rateMbps": 200 }]
// }
export function createFlowTrafficConnector({
  config,
  connections,
  connectionTypes,
}: {
  config: unknown;
  connections: unknown;
  connectionTypes?: unknown;
}) {
  if (!isObject(config)) throw new Error("config is required");
  if (!Array.isArray(connections)) throw new Error("connections is required");

  const cfg = config as Record<string, unknown>;
  const connTypes = isObject(connectionTypes)
    ? (connectionTypes as Record<string, { capacityMbps?: number }>)
    : {};

  const tickSeconds = typeof cfg.tickSeconds === "number" && cfg.tickSeconds > 0
    ? cfg.tickSeconds
    : 1;
  const flows = asArray<Record<string, unknown>>(cfg.flows);
  const events = asArray<Record<string, unknown>>(cfg.events);

  const adjacency = buildUndirectedAdjacency(connections);

  const capacityByConnectionId = new Map<string, number>();
  (connections as ConnectionLike[]).forEach((c) => {
    const id = String(c?.id || "").trim();
    if (!id) return;

    const typeId = String(c?.connectionType || c?.connection_type || "").trim();
    const cap = typeId && typeof connTypes?.[typeId]?.capacityMbps === "number"
      ? connTypes[typeId].capacityMbps
      : null;
    if (typeof cap === "number" && cap > 0) capacityByConnectionId.set(id, cap);
  });

  // Precompute paths per flow for determinism + speed.
  const flowDefs = flows
    .map((f, idx) => {
      const id = String(f?.id || `flow-${idx + 1}`).trim();
      const fromDeviceId = String(f?.fromDeviceId || "").trim();
      const toDeviceId = String(f?.toDeviceId || "").trim();
      const rateMbps = typeof f?.rateMbps === "number" ? f.rateMbps : 0;
      const status = String(f?.status || "up");
      const path = findShortestPathConnectionIds({
        adjacency,
        fromDeviceId,
        toDeviceId,
      });
      return {
        id,
        fromDeviceId,
        toDeviceId,
        pathConnectionIds: path,
        rateMbps,
        status,
      };
    })
    .filter((f) => f.id && f.fromDeviceId && f.toDeviceId);

  type FlowEvent = {
    t: number;
    flowId?: string;
    rateMbps?: number;
    status?: string;
  };

  const eventsQueueBase: FlowEvent[] = events
    .map((e) => {
      const rec = isObject(e) ? e : {};
      return {
        t: typeof rec.t === "number" ? rec.t : 0,
        flowId: typeof rec.flowId === "string" ? rec.flowId : undefined,
        rateMbps: typeof rec.rateMbps === "number" ? rec.rateMbps : undefined,
        status: typeof rec.status === "string" ? rec.status : undefined,
      };
    })
    .filter((e) => e.flowId && Number.isFinite(e.t) && e.t >= 0)
    .sort((a, b) => a.t - b.t);

  return {
    kind: "flow",
    start(onUpdate: OnTrafficUpdate): StopTraffic {
      if (typeof onUpdate !== "function") {
        throw new Error("onUpdate callback is required");
      }

      const flowState = new Map<string, { rateMbps: number; status: string }>();
      flowDefs.forEach((f) =>
        flowState.set(f.id, { rateMbps: f.rateMbps, status: f.status })
      );

      const prevByConn = new Map<string, number>();

      const computeTotals = () => {
        const totals = new Map<string, number>();
        const touched = new Set<string>();

        for (const f of flowDefs) {
          const st = flowState.get(f.id) || { rateMbps: 0, status: "up" };
          const status = String(st.status || "up");
          const rate = typeof st.rateMbps === "number" ? st.rateMbps : 0;
          if (status === "down") continue;
          if (!rate || rate <= 0) continue;
          if (!Array.isArray(f.pathConnectionIds)) continue;

          for (const connId of f.pathConnectionIds) {
            const prev = totals.get(connId) || 0;
            totals.set(connId, prev + rate);
            touched.add(connId);
          }
        }

        // Include previously-touched links so we can explicitly decay them to 0.
        for (const connId of prevByConn.keys()) touched.add(connId);

        return { totals, touched };
      };

      const emitDiff = (
        { totals, touched }: {
          totals: Map<string, number>;
          touched: Set<string>;
        },
      ) => {
        const batch: TrafficUpdate[] = [];
        for (const connId of touched) {
          const nextRate = totals.get(connId) || 0;
          const prevRate = prevByConn.get(connId) || 0;

          const cap = capacityByConnectionId.get(connId) || null;
          const nextUtil = cap ? clamp(nextRate / cap, 0, 1) : 0;
          const prevUtil = cap ? clamp(prevRate / cap, 0, 1) : 0;

          const rateChanged = Math.abs(prevRate - nextRate) >= 1;
          const utilChanged = Math.abs(prevUtil - nextUtil) >= 0.005;
          if (!rateChanged && !utilChanged) continue;

          const update: TrafficUpdate = {
            connectionId: connId,
            status: "up",
            rateMbps: Math.round(nextRate),
            utilization: Math.round(nextUtil * 100) / 100,
          };

          batch.push(update);
          prevByConn.set(connId, nextRate);
        }

        if (batch.length) onUpdate(batch);
      };

      // Seed.
      const seeded = computeTotals();
      const initial: TrafficUpdate[] = Array.from(seeded.touched).map(
        (connId) => {
          const rate = seeded.totals.get(connId) || 0;
          const cap = capacityByConnectionId.get(connId) || null;
          const util = cap ? clamp(rate / cap, 0, 1) : 0;
          prevByConn.set(connId, rate);
          return {
            connectionId: connId,
            status: "up",
            rateMbps: Math.round(rate),
            utilization: Math.round(util * 100) / 100,
          };
        },
      );
      onUpdate({ initial, updates: [] });

      const start = performance.now();
      let eventIdx = 0;

      const tick = () => {
        const elapsedSec = (performance.now() - start) / 1000;

        // Apply scheduled flow events.
        while (
          eventIdx < eventsQueueBase.length &&
          eventsQueueBase[eventIdx].t <= elapsedSec
        ) {
          const { t: _t, ...ev } = eventsQueueBase[eventIdx];
          const flowId = String(ev.flowId || "").trim();
          if (flowId) {
            const prev = flowState.get(flowId) || { rateMbps: 0, status: "up" };
            const next = { ...prev };
            if (typeof ev.rateMbps === "number") next.rateMbps = ev.rateMbps;
            if (typeof ev.status === "string") next.status = ev.status;
            flowState.set(flowId, next);
          }
          eventIdx += 1;
        }

        const { totals, touched } = computeTotals();
        emitDiff({ totals, touched });
      };

      const timer = setInterval(tick, Math.max(100, tickSeconds * 1000));
      return () => clearInterval(timer);
    },
  };
}
