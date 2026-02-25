In this repo, “where things belong” is the main structural debt:

- `scripts/main.ts` is simultaneously **domain model**, **app state**, **UI
  rendering**, **event wiring**, **data loading orchestration**, and **graph
  orchestration**. ([GitHub][1])
- `scripts/graph.ts` mixes **graph/domain types**, **rendering**, **layout
  selection**, and **traffic visualization integration**. ([GitHub][2])
- `scripts/buildPages.ts` is build tooling living next to runtime modules; it’s
  not “wrong”, but it blurs the mental model of `scripts/` as “browser code”.
  ([GitHub][3])

Below is a concrete restructuring that fixes exactly what you’re complaining
about: _what functionality belongs where_.

---

## Target structure (clean boundaries)

### 1) Split “tooling” from “runtime”

Right now you have build tooling under `scripts/` (`scripts/buildPages.ts`).
([GitHub][3])

**Change:**

- Move build and validation scripts into a top-level `tools/` (or `devtools/`)
  directory:

  - `tools/build_pages.ts` (from `scripts/buildPages.ts`)
  - `tools/validate_fixtures.ts`
  - `tools/render_network_svgs.ts`
  - etc.

**Resulting rule of thumb:**

- `tools/**` runs in Deno (node-like tooling).
- `scripts/**` runs in the browser.

This alone makes the repo read correctly on first glance.

---

### 2) Move domain types out of `scripts/main.ts`

Currently `scripts/main.ts` defines `Device`, `Connection`, `TrafficUpdate`, and
`State`. ([GitHub][1])

**Change:**

- Create `scripts/domain/`:

```
scripts/
  domain/
    types.ts
    fixtures.ts        // runtime validators/guards for fixture JSON
```

**`scripts/domain/types.ts` should own:**

- `Device`, `ConnectionEnd`, `Connection`, `TrafficUpdate`
- Narrow “UI state” types _only if_ they’re cross-module.

**`scripts/domain/fixtures.ts` should own:**

- Runtime validation/normalization from `unknown -> DomainTypes`
- Example:
  `parseNetworkFixture(json): { devices: Device[]; connections: Connection[]; traffic?: TrafficUpdate[] }`

That removes the “Device and State doesn’t belong in main.ts” issue at the root.

---

### 3) Make `scripts/main.ts` into composition glue (thin)

Right now it does:

- state storage + mutations
- DOM rendering (selected cards, search table) using `innerHTML`
- wiring traffic connectors
- creating/updating graph
- loading fixtures
- layout + traffic viz selection

That’s all in one file. ([GitHub][1])

**Change: split into 4 modules + keep main tiny:**

```
scripts/
  app/
    bootstrap.ts     // main entry: create app, wire deps
    state.ts         // State + reducer + selectors
    controller.ts    // orchestrates: load network, update graph, start/stop traffic
  ui/
    selectedPanel.ts
    searchPanel.ts
    controls.ts      // dropdowns, buttons, status line
```

#### State ownership

Use a reducer-style store so mutations are not scattered across UI/event
handlers.

- `app/state.ts`:

  - `State` type
  - `Action` union
  - `reduce(state, action) -> state`
  - selectors (`getFilteredDevices(state)`)

- `ui/*` modules become pure renderers:

  - `renderSelected(root, state, dispatch)`
  - `renderSearch(root, state, dispatch)`

- `app/controller.ts` owns side effects:

  - start/stop traffic connector
  - create graph once, call `graph.update()` on state changes

**Outcome:**

- UI doesn’t directly call `graph.update` or mutate global state.
- Main doesn’t “know” how selected cards are rendered, only that it passes
  state + dispatch.

---

### 4) Break up `scripts/graph.ts` into “renderer” + “integrations”

Right now `scripts/graph.ts` contains:

- local `Device`/`Connection` types (duplicate)
- D3 init and layers
- traffic styling helpers
- traffic viz registry integration
- layout registry integration
- update loops and tick/render logic ([GitHub][2])

That’s too much in one module for future maintenance.

**Change:**

```
scripts/graph/
  types.ts            // GraphNode/GraphLink (render-level types)
  renderer.ts         // D3 selection, layers, zoom, drag, tick -> positions
  layoutAdapter.ts    // applyLayout(...) integration only
  trafficAdapter.ts   // traffic getter + viz start/stop + styling policy
  graph.ts            // facade: createGraph(...) returns update/updateTraffic/etc
```

**Rules:**

- `renderer.ts` should not import layouts or traffic. It should accept:

  - nodes, links, and callbacks like `onNodeClick`
  - “styling functions” for link/node style
  - optional “overlay/viz” hook

- `layoutAdapter.ts` is the only place that knows about `layouts/registry.ts`.

- `trafficAdapter.ts` is the only place that knows about
  `trafficFlowVisualization/registry.ts`.

This fixes the “graph.ts is mixing responsibilities” problem without changing
behavior.

---

## Practical refactor plan (3 PRs, minimal churn)

### PR1 — directory split + type consolidation

1. Move build tooling:

   - `scripts/buildPages.ts` → `tools/build_pages.ts` ([GitHub][3])
   - Update `deno.json` tasks accordingly ([GitHub][4])
2. Add `scripts/domain/types.ts`
3. Replace the duplicate `Device/Connection` types in `scripts/graph.ts` with
   imports from `domain/types.ts` ([GitHub][2])
4. Remove `Device/Connection/TrafficUpdate` type defs from `scripts/main.ts` and
   import them ([GitHub][1])

This doesn’t require touching logic much, but it establishes “source of truth”.

---

### PR2 — state + UI separation (the big readability win)

1. Create `scripts/app/state.ts` and move `State`, filter/sort/page state, and
   helpers out of `scripts/main.ts` ([GitHub][1])
2. Create `scripts/ui/selectedPanel.ts` and move `renderSelected()` there
3. Create `scripts/ui/searchPanel.ts` and move `renderSearchDropdown()` there
4. Replace direct calls (`toggleSelect`, button handlers) with
   `dispatch(Action)`.

At the end of PR2, `scripts/main.ts` should be mostly:

- `const app = bootstrap(document)`
- `app.start()`

---

### PR3 — graph split into renderer + adapters

1. Extract D3 renderer core out of `scripts/graph.ts` into
   `scripts/graph/renderer.ts` ([GitHub][2])
2. Create `layoutAdapter.ts` that wraps the current `applyLayout()` call
   ([GitHub][2])
3. Create `trafficAdapter.ts` that wraps current traffic viz lifecycle
4. Keep a small facade `scripts/graph/graph.ts` to preserve your existing
   external API (`createGraph({ ... })`)

This reduces cognitive load and localizes future changes.

---

## What should _not_ move (so you don’t over-refactor)

- `scripts/layouts/**` can stay as-is; it’s already a clean “plugin” boundary
  via registry.
- `scripts/trafficFlowVisualization/**` can stay as-is; also registry-based.
- `main.ts` (Deno dev server) is a separate concern and is fine at repo root.
  ([GitHub][5]) (Though it should be hardened later; but that’s not your concern
  right now.)

---

## One crisp mental model for “belongs where”

Use this test:

1. **Does it touch the DOM?** → `scripts/ui/**`
2. **Does it orchestrate modules + side effects?** → `scripts/app/**`
3. **Is it domain data / fixtures / validation?** → `scripts/domain/**`
4. **Is it rendering/visualization engine code?** → `scripts/graph/**`
5. **Is it build/dev tooling?** → `tools/**`

If a module fails the test (needs 2+ answers), it’s probably mixing concerns.

---

If you want, I can turn the above into a concrete “move map” with exact file
moves + updated imports + updated `deno.json` tasks (so it’s a
mechanically-applied refactor, not just architectural advice).

[1]: https://raw.githubusercontent.com/bgni/website01/master/scripts/main.ts "raw.githubusercontent.com"
[2]: https://raw.githubusercontent.com/bgni/website01/master/scripts/graph.ts "raw.githubusercontent.com"
[3]: https://raw.githubusercontent.com/bgni/website01/master/scripts/buildPages.ts "raw.githubusercontent.com"
[4]: https://raw.githubusercontent.com/bgni/website01/master/deno.json "raw.githubusercontent.com"
[5]: https://raw.githubusercontent.com/bgni/website01/master/main.ts "raw.githubusercontent.com"
