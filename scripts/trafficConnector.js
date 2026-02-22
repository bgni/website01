const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

const isObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

const defaultFetchJson = async (path) => {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
};

export function createRealTrafficConnector({
  url,
  fetchJson = defaultFetchJson,
  intervalMs = 5000,
} = {}) {
  if (!url) throw new Error('url is required');

  return {
    kind: 'real',
    start(onUpdate) {
      if (typeof onUpdate !== 'function') throw new Error('onUpdate callback is required');

      const tick = async () => {
        const data = await fetchJson(url);
        if (Array.isArray(data)) onUpdate(data);
        else if (isObject(data) && Array.isArray(data.initial)) onUpdate(data);
      };

      // Fire immediately then poll.
      tick().catch((err) => console.error(err));
      const timer = setInterval(() => tick().catch((err) => console.error(err)), intervalMs);

      return () => clearInterval(timer);
    },
  };
}

export function createStaticTrafficConnector({
  source,
} = {}) {
  return {
    kind: 'static',
    start(onUpdate) {
      if (typeof onUpdate !== 'function') throw new Error('onUpdate callback is required');
      onUpdate(source);
      return () => {};
    },
  };
}

export function createTimelineTrafficConnector({
  timeline,
  tickMs = 250,
  loop = false,
} = {}) {
  const initial = Array.isArray(timeline?.initial) ? timeline.initial : [];
  const updates = Array.isArray(timeline?.updates) ? timeline.updates : [];

  const queueBase = updates
    .map((u) => ({
      t: typeof u?.t === 'number' ? u.t : (typeof u?.offset === 'number' ? u.offset : 0),
      ...u,
    }))
    .filter((u) => u && u.connectionId && Number.isFinite(u.t) && u.t >= 0)
    .sort((a, b) => a.t - b.t);

  return {
    kind: 'timeline',
    start(onUpdate) {
      if (typeof onUpdate !== 'function') throw new Error('onUpdate callback is required');

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
} = {}) {
  if (!isObject(config)) throw new Error('config is required');

  const tickSeconds = typeof config.tickSeconds === 'number' && config.tickSeconds > 0 ? config.tickSeconds : 1;
  const initial = Array.isArray(config.initial) ? config.initial : [];
  const links = isObject(config.links) ? config.links : {};
  const events = Array.isArray(config.events) ? config.events : [];

  const eventsQueueBase = events
    .map((e) => ({ t: typeof e?.t === 'number' ? e.t : 0, ...e }))
    .filter((e) => e && e.connectionId && Number.isFinite(e.t) && e.t >= 0)
    .sort((a, b) => a.t - b.t);

  return {
    kind: 'generated',
    start(onUpdate) {
      if (typeof onUpdate !== 'function') throw new Error('onUpdate callback is required');

      // Seed.
      onUpdate({ initial, updates: [] });

      const state = new Map();
      initial.forEach((t) => {
        if (!t || !t.connectionId) return;
        state.set(t.connectionId, { ...t });
      });

      const start = performance.now();
      let eventIdx = 0;

      const tick = () => {
        const elapsedSec = (performance.now() - start) / 1000;
        const batch = [];

        // Apply scheduled events.
        while (eventIdx < eventsQueueBase.length && eventsQueueBase[eventIdx].t <= elapsedSec) {
          const { t: _t, ...ev } = eventsQueueBase[eventIdx];
          batch.push(ev);
          const prev = state.get(ev.connectionId) || { connectionId: ev.connectionId };
          state.set(ev.connectionId, { ...prev, ...ev });
          eventIdx += 1;
        }

        // Random walk updates.
        Object.entries(links).forEach(([connectionId, rules]) => {
          const prev = state.get(connectionId) || { connectionId, status: 'up', rateMbps: 0, utilization: 0 };

          const status = prev.status || 'up';
          const rateRule = isObject(rules?.rateMbps) ? rules.rateMbps : null;
          const utilRule = isObject(rules?.utilization) ? rules.utilization : null;

          if (status === 'down') {
            // Keep it pinned at 0 unless events change it.
            return;
          }

          let nextRate = prev.rateMbps;
          let nextUtil = prev.utilization;

          if (rateRule) {
            const min = typeof rateRule.min === 'number' ? rateRule.min : 0;
            const max = typeof rateRule.max === 'number' ? rateRule.max : Math.max(min, 1000);
            const delta = typeof rateRule.delta === 'number' ? rateRule.delta : 0;
            if (delta > 0) nextRate = clamp((Number(nextRate) || 0) + (Math.random() * 2 - 1) * delta, min, max);
          }

          if (utilRule) {
            const min = typeof utilRule.min === 'number' ? utilRule.min : 0;
            const max = typeof utilRule.max === 'number' ? utilRule.max : 1;
            const delta = typeof utilRule.delta === 'number' ? utilRule.delta : 0;
            if (delta > 0) nextUtil = clamp((Number(nextUtil) || 0) + (Math.random() * 2 - 1) * delta, min, max);
          }

          // Emit only if it changed meaningfully.
          const rateChanged = typeof nextRate === 'number' && Math.abs((Number(prev.rateMbps) || 0) - nextRate) >= 1;
          const utilChanged = typeof nextUtil === 'number' && Math.abs((Number(prev.utilization) || 0) - nextUtil) >= 0.01;
          if (!rateChanged && !utilChanged) return;

          const update = { connectionId };
          if (rateChanged) update.rateMbps = Math.round(nextRate);
          if (utilChanged) update.utilization = Math.round(nextUtil * 100) / 100;

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
