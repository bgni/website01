import type { TrafficUpdate } from "./domain/types.ts";

export type { TrafficUpdate };

export type TrafficTimeline = {
  initial?: TrafficUpdate[];
  updates?: Array<TrafficUpdate & { t?: number; offset?: number }>;
};

export type TrafficPayload = unknown;
export type OnTrafficUpdate = (payload: TrafficPayload) => void;
export type StopTraffic = () => void;

type FetchJson = (path: string) => Promise<unknown>;

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

const isObject = (v: unknown): v is Record<string, unknown> =>
  v != null && typeof v === "object" && !Array.isArray(v);

const defaultFetchJson: FetchJson = async (path: string) => {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
};

export type RealTrafficConnectorOptions = {
  url: string;
  fetchJson?: FetchJson;
  intervalMs?: number;
};

export function createRealTrafficConnector({
  url,
  fetchJson = defaultFetchJson,
  intervalMs = 5000,
}: RealTrafficConnectorOptions) {
  if (!url) throw new Error("url is required");

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
        intervalMs,
      );

      return () => clearInterval(timer);
    },
  };
}

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

export type TimelineTrafficConnectorOptions = {
  timeline: unknown;
  tickMs?: number;
  loop?: boolean;
};

export function createTimelineTrafficConnector({
  timeline,
  tickMs = 250,
  loop = false,
}: TimelineTrafficConnectorOptions) {
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
        const elapsedSec = (performance.now() - start) / 1000;
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
      }, tickMs);

      return () => clearInterval(timer);
    },
  };
}

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
}: { config: unknown }) {
  if (!isObject(config)) throw new Error("config is required");

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
        const elapsedSec = (performance.now() - start) / 1000;
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

      const timer = setInterval(tick, Math.max(100, tickSeconds * 1000));
      return () => clearInterval(timer);
    },
  };
}

const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

type ConnectionLike = {
  id?: unknown;
  from?: { deviceId?: unknown };
  to?: { deviceId?: unknown };
  connectionType?: unknown;
  connection_type?: unknown;
};

type AdjacencyEdge = { neighborId: string; connectionId: string };

const buildUndirectedAdjacency = (connections: unknown) => {
  const adj = new Map<string, AdjacencyEdge[]>();
  const add = (fromId: string, toId: string, connectionId: string) => {
    if (!fromId || !toId || !connectionId) return;
    if (!adj.has(fromId)) adj.set(fromId, []);
    adj.get(fromId)!.push({ neighborId: toId, connectionId });
  };

  asArray<ConnectionLike>(connections).forEach((c) => {
    const connectionId = String(c?.id || "").trim();
    const a = String(c?.from?.deviceId || "").trim();
    const b = String(c?.to?.deviceId || "").trim();
    if (!connectionId || !a || !b) return;
    add(a, b, connectionId);
    add(b, a, connectionId);
  });

  // Deterministic traversal order.
  for (const [deviceId, list] of adj.entries()) {
    list.sort((x: AdjacencyEdge, y: AdjacencyEdge) => {
      const n = String(x.neighborId).localeCompare(String(y.neighborId));
      if (n !== 0) return n;
      return String(x.connectionId).localeCompare(String(y.connectionId));
    });
    adj.set(deviceId, list);
  }

  return adj;
};

const findShortestPathConnectionIds = (
  {
    adjacency,
    fromDeviceId,
    toDeviceId,
  }: {
    adjacency: Map<string, AdjacencyEdge[]>;
    fromDeviceId: string;
    toDeviceId: string;
  },
) => {
  if (!fromDeviceId || !toDeviceId) return null;
  if (fromDeviceId === toDeviceId) return [];

  const visited = new Set([fromDeviceId]);
  const prev = new Map<
    string,
    { prevDeviceId: string; viaConnectionId: string }
  >(); // deviceId -> { prevDeviceId, viaConnectionId }
  const queue = [fromDeviceId];

  while (queue.length) {
    const cur = queue.shift();
    if (!cur) break;
    if (cur === toDeviceId) break;

    const neighbors = adjacency.get(cur) || [];
    for (const edge of neighbors) {
      const next = edge.neighborId;
      if (visited.has(next)) continue;
      visited.add(next);
      prev.set(next, { prevDeviceId: cur, viaConnectionId: edge.connectionId });
      queue.push(next);
    }
  }

  if (!visited.has(toDeviceId)) return null;

  const path: string[] = [];
  let cur = toDeviceId;
  while (cur !== fromDeviceId) {
    const p = prev.get(cur);
    if (!p) return null;
    path.push(p.viaConnectionId);
    cur = p.prevDeviceId;
  }

  path.reverse();
  return path;
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
