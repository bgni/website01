import { assertEquals } from "@std/assert";
import { createTrafficService } from "./trafficService.ts";
import type { Action } from "./actions.ts";
import type { TrafficUpdate } from "../domain/types.ts";

Deno.test("trafficService: restartCurrentSource no-ops without current paths", async () => {
  const actions: Action[] = [];
  let connectorCalls = 0;

  const service = createTrafficService({
    dispatch: (action) => actions.push(action),
    loadJson: () => Promise.resolve(null),
    doFetch: () =>
      Promise.resolve(
        new Response(null, {
          status: 404,
        }),
      ),
    formatStatusError: (err) => String(err),
    onGraphResetTraffic: () => {},
    onGraphUpdateTraffic: () => {},
    onGraphRefreshFromState: () => {},
    parseTrafficConnectorSpecFn: () => ({ kind: "flow" }),
    parseTrafficUpdatesPayloadFn: () => [],
    createTrafficConnectorFn: () => {
      connectorCalls += 1;
      return Promise.resolve({ kind: "default", start: () => () => {} });
    },
  });

  await service.restartCurrentSource("real");

  assertEquals(connectorCalls, 0);
  assertEquals(actions.length, 0);
});

Deno.test("trafficService: merges updates and dispatches setTraffic", async () => {
  const actions: Action[] = [];
  const graphTrafficUpdates: TrafficUpdate[][] = [];
  let graphRefreshCalls = 0;
  const updateCallbacks: Array<(payload: unknown) => void> = [];

  const service = createTrafficService({
    dispatch: (action) => actions.push(action),
    loadJson: () => Promise.resolve(null),
    doFetch: () =>
      Promise.resolve(
        new Response(null, {
          status: 404,
        }),
      ),
    formatStatusError: (err) => String(err),
    onGraphResetTraffic: () => {},
    onGraphUpdateTraffic: (updates) => graphTrafficUpdates.push(updates),
    onGraphRefreshFromState: () => {
      graphRefreshCalls += 1;
    },
    parseTrafficConnectorSpecFn: () => ({ kind: "flow" }),
    createTrafficConnectorFn: () =>
      Promise.resolve({
        kind: "default",
        start: (onUpdate) => {
          updateCallbacks.push(onUpdate as (payload: unknown) => void);
          return () => {};
        },
      }),
    parseTrafficUpdatesPayloadFn: (payload) => payload as TrafficUpdate[],
  });

  service.setCurrentPaths({
    basePath: "data/networks/small-office",
    trafficPath: "data/networks/small-office/traffic.json",
  });
  await service.startForCurrentSource("default");

  const callback = updateCallbacks[0];
  if (typeof callback !== "function") {
    throw new Error("Expected connector callback function");
  }

  callback([
    { connectionId: "c1", utilization: 0.2 },
    { connectionId: "c2", utilization: 0.5 },
  ]);
  callback([{ connectionId: "c1", utilization: 0.9 }]);

  const setTrafficActions = actions.filter((a) =>
    a.type === "setTraffic"
  ) as Array<{ type: "setTraffic"; traffic: TrafficUpdate[] }>;

  assertEquals(setTrafficActions.length, 2);
  assertEquals(setTrafficActions[1].traffic, [
    { connectionId: "c1", utilization: 0.9 },
    { connectionId: "c2", utilization: 0.5 },
  ]);
  assertEquals(graphTrafficUpdates.length, 2);
  assertEquals(graphRefreshCalls, 2);
});

Deno.test("trafficService: restartCurrentSource reports source failure", async () => {
  const actions: Action[] = [];
  let graphResetCalls = 0;

  const service = createTrafficService({
    dispatch: (action) => actions.push(action),
    loadJson: () => Promise.resolve(null),
    doFetch: () =>
      Promise.resolve(
        new Response(null, {
          status: 404,
        }),
      ),
    formatStatusError: (err) => String((err as Error).message ?? err),
    onGraphResetTraffic: () => {
      graphResetCalls += 1;
    },
    onGraphUpdateTraffic: () => {},
    onGraphRefreshFromState: () => {},
    parseTrafficConnectorSpecFn: () => ({ kind: "flow" }),
    parseTrafficUpdatesPayloadFn: () => [],
    createTrafficConnectorFn: () => Promise.reject(new Error("boom")),
  });

  service.setCurrentPaths({
    basePath: "data/networks/small-office",
    trafficPath: "data/networks/small-office/traffic.json",
  });
  await service.restartCurrentSource("real");

  assertEquals(graphResetCalls, 1);
  assertEquals(actions.some((a) => a.type === "resetTraffic"), true);
  assertEquals(actions[actions.length - 1], {
    type: "setStatusText",
    text: "Traffic source failed: boom",
  });
});

Deno.test("trafficService: explicit source kind overrides parsed connector spec", async () => {
  const specs: unknown[] = [];

  const service = createTrafficService({
    dispatch: () => {},
    loadJson: () => Promise.resolve(null),
    doFetch: () =>
      Promise.resolve(
        new Response(JSON.stringify({ kind: "timeline" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    formatStatusError: (err) => String(err),
    onGraphResetTraffic: () => {},
    onGraphUpdateTraffic: () => {},
    onGraphRefreshFromState: () => {},
    parseTrafficConnectorSpecFn: () => ({ kind: "timeline" }),
    parseTrafficUpdatesPayloadFn: () => [],
    createTrafficConnectorFn: (spec) => {
      specs.push(spec);
      return Promise.resolve({ kind: "default", start: () => () => {} });
    },
  });

  service.setCurrentPaths({
    basePath: "data/networks/small-office",
    trafficPath: "data/networks/small-office/traffic.json",
  });
  await service.startForCurrentSource("real");

  assertEquals(specs, [{ kind: "real" }]);
});

Deno.test("trafficService: passes configured flow speed multiplier to connector factory", async () => {
  const speedMultipliers: number[] = [];

  const service = createTrafficService({
    dispatch: () => {},
    loadJson: () => Promise.resolve(null),
    doFetch: () =>
      Promise.resolve(
        new Response(JSON.stringify({ kind: "flow" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    formatStatusError: (err) => String(err),
    onGraphResetTraffic: () => {},
    onGraphUpdateTraffic: () => {},
    onGraphRefreshFromState: () => {},
    parseTrafficConnectorSpecFn: () => ({ kind: "flow" }),
    parseTrafficUpdatesPayloadFn: () => [],
    createTrafficConnectorFn: (_spec, args) => {
      speedMultipliers.push(args.speedMultiplier);
      return Promise.resolve({ kind: "default", start: () => () => {} });
    },
  });

  service.setCurrentPaths({
    basePath: "data/networks/small-office",
    trafficPath: "data/networks/small-office/traffic.json",
  });
  service.setSpeedMultiplier(2.5);
  await service.startForCurrentSource("default");

  assertEquals(speedMultipliers, [2.5]);
});

Deno.test("trafficService: invalid payload is reported and does not update graph", async () => {
  const actions: Action[] = [];
  let graphUpdateCalls = 0;

  const service = createTrafficService({
    dispatch: (action) => actions.push(action),
    loadJson: () => Promise.resolve(null),
    doFetch: () =>
      Promise.resolve(
        new Response(JSON.stringify({ kind: "flow" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    formatStatusError: (err) => String((err as Error).message ?? err),
    onGraphResetTraffic: () => {},
    onGraphUpdateTraffic: () => {
      graphUpdateCalls += 1;
    },
    onGraphRefreshFromState: () => {},
    parseTrafficConnectorSpecFn: () => ({ kind: "flow" }),
    parseTrafficUpdatesPayloadFn: () => {
      throw new Error("bad payload");
    },
    createTrafficConnectorFn: () =>
      Promise.resolve({
        kind: "default",
        start: (onUpdate) => {
          onUpdate({ nope: true });
          return () => {};
        },
      }),
  });

  service.setCurrentPaths({
    basePath: "data/networks/small-office",
    trafficPath: "data/networks/small-office/traffic.json",
  });
  await service.startForCurrentSource("default");

  assertEquals(graphUpdateCalls, 0);
  assertEquals(
    actions.some((action) =>
      action.type === "setStatusText" &&
      action.text === "Traffic payload invalid: bad payload"
    ),
    true,
  );
});
