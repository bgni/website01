# Codebase Review 4 — website01

Date: 2026-02-24

This review is a follow-up to CODEBASE_REVIEW2/3, based on the current repo
state (on branch `codex/improve-network-graph-visualization`). It focuses on the
next set of maintainability wins you called out:

- Too many “top-level” modules under `scripts/`
- Oversized modules (notably `scripts/trafficConnector.ts`)
- Magic numbers / hard-coded colors in graph + traffic styling
- Hard-coded graph dimensions (width/height)
- Missing central configuration for app/graph/traffic defaults

---

## What’s already improved since REVIEW3

The repo is in a much better place structurally:

- Runtime is split into clear boundaries: `scripts/app/**`, `scripts/ui/**`,
  `scripts/domain/**`, `scripts/graph/**`, `scripts/lib/**`.
- Compatibility shims are in place (`scripts/graph.ts`,
  `scripts/graphLogic.ts`), which is the right move to keep churn manageable.
- UI code avoids `innerHTML` and uses safe DOM creation.

These are the right foundations. The remaining work is mostly about: **naming +
module placement + “constants/config hygiene”**.

---

## Changeability retrospective (what’s been easy vs difficult)

This is based on the recent REVIEW2/3-driven refactor work and a quick scan of
the current wiring.

### What has been easy to change (good signs)

- **Moving code across folders**: TypeScript ES module imports + Deno tasks made
  it straightforward to relocate code when boundaries were clear.
- **Adding shims to control churn**: keeping `scripts/graph.ts` and
  `scripts/graphLogic.ts` as compatibility exports was a big force multiplier.
  It allowed large internal refactors while keeping external import paths
  stable.
- **UI refactors**: splitting into small UI modules (`scripts/ui/*.ts`) and
  avoiding `innerHTML` reduced risk; most UI changes are now local.
- **Domain parsing/validation**: `scripts/domain/*` gives a “single place” to
  tighten types without chasing call-sites everywhere.

### What has been difficult to change (signals of coupling)

- **Traffic code as a mixed boundary**: `scripts/trafficConnector.ts` mixes
  parsing/normalization, scheduling, connectors, and graph-ish algorithms.
  Changes here have a large blast radius and are hard to test in isolation.
- **Controller as an orchestrator of everything**: `scripts/app/controller.ts`
  pulls together IO (`fetch`), fixture loading, graph creation, traffic
  connector selection, and UI status reporting. It’s correct functionally, but
  it makes behavior changes (e.g., “add a connector kind”) require touching the
  controller.
- **Renderer/view-model styling constants**: values are spread across
  `scripts/graph/renderer.ts`, `scripts/graph/viewModel.ts`, and
  `scripts/graph/trafficAdapter.ts`, so purely-visual tuning requires hopping
  between files.
- **Implicit global dependency on D3**: renderer/graph code uses `d3` without an
  explicit import (runtime relies on `window.d3`). That’s convenient, but it
  couples graph code to the browser/global environment and complicates tests and
  non-browser execution.

---

## Coupling hotspots (where changes tend to “ripple”)

### A) `controller.ts` ↔ traffic connector selection

`scripts/app/controller.ts` has a kind-switch for
`flow|generated|static|real|timeline` and a “default” behavior. This means:

- Adding a new connector kind is **not open/closed** (must edit controller).
- The controller must know connector-specific config keys (`url`, `intervalMs`,
  `configPath`, etc.).

**Recommendation** (small, focused)

- Introduce a traffic connector registry similar to
  `scripts/trafficFlowVisualization/registry.ts`.
  - `createTrafficConnector(kind, config, deps)` chooses implementation.
  - controller becomes “read config + call registry” rather than owning the
    `if/else` chain.

### B) `graph.ts` ↔ renderer ↔ traffic viz (leaky integration)

`scripts/graph/graph.ts` wires:

- renderer selections (`renderer.links`, `renderer.linkSelection`,
  `renderer.vizLayer`)
- into traffic viz via `scripts/graph/trafficAdapter.ts` and `TrafficViz`.

This is workable, but it’s **structural coupling**: if the renderer changes its
layering or selection structure, the traffic visualization integration can
break.

**Recommendation**

- Define a small, stable `GraphMount` type (already implied by `VizMount`) that
  is owned by the renderer boundary, not the adapter.
- Keep D3 selection typing internal if possible (avoid `unknown`/`never` casts).

### C) DOM coupling via `#graph`

`scripts/graph/renderer.ts` selects `d3.select("#graph")`. This makes the graph
renderer depend on a specific DOM id.

**Recommendation**

- Prefer passing the SVG element (or selector) into `createGraphRenderer`. That
  improves reusability and testability and makes the dependency explicit.

---

## SOLID / SRP / Open-Closed assessment

### Single Responsibility (SRP)

Good:

- `scripts/ui/*Panel.ts` modules are mostly single-purpose and easy to reason
  about.
- `scripts/graph/viewModel.ts` is conceptually clean: it maps state → style
  args.
- `scripts/domain/fixtures.ts` and `scripts/domain/errors.ts` provide a clear
  boundary for validation.

Needs work:

- `scripts/trafficConnector.ts` is the primary SRP offender (multiple connector
  kinds + parsing + scheduling + algorithms).
- `scripts/app/controller.ts` mixes state transitions, side effects, IO, and
  policy decisions (connector choice, default behaviors).

### Open/Closed Principle (OCP)

Good:

- Traffic visualizations are **extensible** via
  `scripts/trafficFlowVisualization/registry.ts`. Adding a viz kind is close to
  OCP-friendly (implement new viz and register).

Not as good:

- Traffic connectors are **not** OCP-friendly today: connector kinds are hard-
  coded in `controller.ts` and implementations live together.

### Liskov / Interface Segregation

- `TrafficViz` being an interface with optional hooks is fine, but the adapter
  boundary currently leaks D3 selection types (cast-heavy). This is more an
  **interface hygiene** issue than a correctness issue.

### Dependency Inversion (DIP)

- Controller depends on concrete modules (`loadData`, `createGraph`,
  `create*TrafficConnector`). For production that’s fine, but for tests it would
  be stronger if `createController()` accepted optional factories/adapters.
- Graph code depends on the global `d3` object. Making D3 an explicit dependency
  (pass it in, or import it consistently) would better match DIP and reduce
  hidden coupling.

---

## Snapshot: top-level `scripts/*.ts` (what’s left there)

Current top-level modules under `scripts/`:

- `scripts/main.ts` — thin browser entrypoint (✅ belongs here)
- `scripts/graph.ts` — shim re-exporting `createGraph` (✅ acceptable)
- `scripts/graphLogic.ts` — shim re-exporting graph helpers (✅ acceptable)
- `scripts/dataLoader.ts` — fetch + enrichment + fixture parsing (⚠️ boundary
  module; name/location could be better)
- `scripts/search.ts` — pure filtering/sorting/pagination utilities (⚠️ should
  live in `scripts/lib/**`)
- `scripts/deviceCatalog.ts` — NetBox catalog reading + enrichment helpers (⚠️
  domain-ish; likely belongs in `scripts/domain/**`)
- `scripts/trafficConnector.ts` — multiple connectors + flow/generator logic (⚠️
  too large; should be split)

**Rule of thumb going forward**

- Top-level `scripts/*.ts` should be:
  - `main.ts` (entry) and shims that preserve stable import paths
  - potentially “public” facades
- Everything else should move under a boundary folder.

---

## Key findings (with concrete recommendations)

### 1) `scripts/trafficConnector.ts` is doing too much

**Symptoms**

- Multiple connector implementations in one file:
  - polling (“real”), static, timeline player, generated random-walk, and flow
    propagation.
- It also contains graph-adjacent logic:
  - undirected adjacency building
  - BFS shortest path (connection ids)
- Many defaults and thresholds are embedded as literals:
  - polling interval (`5000`), timeline tick (`250`), generator tick lower bound
    (`100`)
  - jitter (`0.03`), “meaningful” change thresholds (`>= 1`, `>= 0.01`,
    `>= 0.005`)

**Risks**

- Hard to reason about changes (a connector tweak risks affecting others).
- Hard to test (connectors + algorithms + scheduling in one module).
- Duplication risk: graph traversal/path logic already exists under
  `scripts/lib/graph/**`.

**Recommended refactor**

Split into a `scripts/traffic/**` boundary and keep a compatibility shim:

- `scripts/traffic/types.ts`
  - `TrafficPayload`, `TrafficTimeline`, `OnTrafficUpdate`, `StopTraffic`,
    helper types
- `scripts/traffic/fetch.ts`
  - `FetchJson`, default `fetchJson()`
- `scripts/traffic/connectors/real.ts`
- `scripts/traffic/connectors/static.ts`
- `scripts/traffic/connectors/timeline.ts`
- `scripts/traffic/connectors/generated.ts`
- `scripts/traffic/connectors/flow.ts`
- `scripts/trafficConnector.ts` (shim)
  - re-export the public APIs to avoid breaking imports

**Algorithm dedup**

- The flow connector’s adjacency/path logic should reuse `scripts/lib/graph/**`.
  - Best: make flow connector accept typed `Connection[]` (from
    `scripts/domain/types.ts`) and build adjacency via `buildAdjacency`.
  - If it must accept `unknown`, parse/normalize at the boundary once.

---

### 2) Magic numbers + hex colors are spread across renderer/styling

You called this out explicitly, and it’s correct.

**Where it shows up now**

- `scripts/graph/trafficAdapter.ts`
  - Util-to-color mapping uses embedded hues and a “hot threshold” (0.9).
  - Width mapping embeds min/max width and a 10Gbps ceiling.
  - Down-state color is hardcoded (`#f87171`).
- `scripts/graph/renderer.ts` and `scripts/graph/viewModel.ts`
  - Many repeated palette values (`#334155`, `#e2e8f0`, `#0b1220`, `#1f2937`, …)
  - Transition duration (`220`) and D3 forces are embedded.
- `scripts/trafficFlowVisualization/*`
  - Each visualization has its own defaults; some repeat colors.

**Recommended fix: introduce a configuration module**

Create a single config source that is safe to import from both browser/runtime
and tools (pure constants + plain objects only).

Suggested structure:

- `scripts/config.ts`
  - `APP_DEFAULTS` (default network/layout/traffic kind, page size)
  - `GRAPH_DEFAULTS` (width/height fallback, simulation constants)
  - `GRAPH_COLORS` (baseline palette used by renderer/view-model)
  - `TRAFFIC_DEFAULTS` (poll intervals, tick rates, rate ceilings)
  - `TRAFFIC_STYLE` (down color, hot threshold, width scaling)

Then:

- `trafficAdapter.ts` consumes `TRAFFIC_STYLE` and `TRAFFIC_DEFAULTS`.
- `renderer.ts` consumes `GRAPH_DEFAULTS` and `GRAPH_COLORS`.
- `viewModel.ts` consumes `GRAPH_COLORS` (and keeps only policy/logic).

**Naming guidance**

Prefer intent-revealing constant names over generic “MIN/MAX”:

- `TRAFFIC_DOWN_COLOR`
- `TRAFFIC_RATE_CEILING_MBPS`
- `TRAFFIC_UTIL_HOT_THRESHOLD`
- `LINK_WIDTH_MIN_PX`, `LINK_WIDTH_MAX_PX`
- `GRAPH_VIEWBOX_DEFAULT_WIDTH`, `GRAPH_VIEWBOX_DEFAULT_HEIGHT`
- `GRAPH_LINK_BASE_STROKE`, `GRAPH_NODE_STROKE`, `GRAPH_LABEL_COLOR`

This makes it easier to tune “the look” without reading algorithmic code.

---

### 3) Hard-coded width/height should become responsive (or at least centralized)

Right now the renderer defaults to `width = 1200`, `height = 720`. That’s fine
as a fallback, but it should not be the _primary_ sizing mechanism.

**Recommended approach (incremental)**

Phase 1 (low-risk): centralize defaults

- Move 1200×720 into config constants.
- Ensure tools (SVG render) reuse the same defaults.

Phase 2 (better UX): measure the actual viewport

- Measure the SVG container on init and on resize.
  - e.g. use a `ResizeObserver` on the parent container.
- Update:
  - `viewBox`
  - force center
  - any padding constants that depend on width/height

This makes the graph scale correctly across smaller screens and avoids layout
surprises.

---

### 4) `scripts/dataLoader.ts` is a boundary module; name/location could be clearer

Today it:

- fetches fixtures
- optionally does NetBox enrichment (deviceTypeSlug)
- parses fixtures via `scripts/domain/fixtures.ts`

This is _domain boundary work_.

**Recommendation**

- Move it under `scripts/domain/` and rename for intent:
  - `scripts/domain/fixtureLoader.ts` or `scripts/domain/loadNetwork.ts`
- Keep `scripts/dataLoader.ts` as a shim that re-exports the new functions.

Also consider:

- `loadJson(path)` could accept an optional guard/validator for typed
  boundaries, instead of returning `unknown` everywhere.

---

### 5) `scripts/search.ts` is pure utility code

This file belongs in `scripts/lib/**`.

**Recommendation**

- Move to `scripts/lib/search.ts`.
- Keep `scripts/search.ts` as a shim re-export (or update imports in one sweep).

This improves the mental model:

- `lib/**` = pure, reusable
- `domain/**` = parsing/validation and domain logic

---

### 6) `scripts/deviceCatalog.ts` is “domain integration” code

It’s not UI and not graph rendering; it’s an enrichment layer.

**Recommendation**

Move it under domain with a name that reflects the responsibility:

- `scripts/domain/netbox/catalog.ts` (or
  `scripts/domain/netboxDeviceCatalog.ts`)
- Keep `scripts/deviceCatalog.ts` as a shim if external imports exist.

---

### 7) Boundary leak: layout/UI modules contain domain heuristics

You called out a good example: `scripts/layouts/tiered.ts` is a layout module,
but it currently contains **domain classification and string parsing**:

- `roleToTier()` does role normalization + keyword matching.
- `inferSiteKey()` infers a site key from the device `name` and `room_id`.

This works, but it makes the tiered layout:

- harder to test as “pure layout” (geometry)
- harder to reuse across datasets (because it encodes assumptions about naming)
- order-dependent and hard to evolve safely (keyword precedence is implicit)

There are a couple more “similar smell” hotspots:

- `scripts/ui/selectedPanel.ts` (fixed) previously guessed NetBox elevation
  image paths from `deviceTypeSlug` and hard-coded the vendored library path
  under `vendor/netbox-devicetype-library/**`. That logic now lives at the
  domain boundary and UI consumes precomputed thumb paths.
- `scripts/lib/colors.ts` (fixed) now maps `DeviceKind` to colors; string-based
  classification lives at the domain boundary.

**Recommendation (keeps responsibilities clean)**

Option A — precompute “layout hints” in the domain boundary:

- Add something like `scripts/domain/layoutHints.ts` that exports helpers:
  - `inferTierFromRole(role: string): Tier`
  - `inferSiteKeyFromDevice(device: NetworkDevice): string`
- In the loader/controller path, compute and attach hints to nodes (or keep a
  side-map keyed by `device.id`).
- `applyTieredLayout()` consumes `node.__tierHint` / `node.__siteKey` (or
  passed-in maps) and focuses on geometry + deterministic packing.

Option B — inject resolvers into the layout (more open/closed):

- `applyTieredLayout({ ..., getTierForNode, getSiteKeyForNode })`
- the layout stays generic, and the app decides which heuristic to use.

Either approach makes `scripts/layouts/*` more clearly “layout-only” and reduces
the temptation to grow more parsing/heuristics inside the layout layer.

---

### 8) Policy mismatch: string parsing/comparison exists outside “outside-world” boundaries

If we adopt your rule literally — _no string parsing or string comparisons
anywhere except in modules that deal with the outside world_ — the current repo
still has several potential violations (though some of the earlier ones have now
been fixed).

#### Clear violations (internal modules doing string parsing/heuristics)

- `scripts/layouts/tiered.ts` (fixed)
  - tier/site heuristics are precomputed at the domain boundary
    (`scripts/domain/layoutHints.ts`) and consumed as numeric hints.
- `scripts/lib/colors.ts` (fixed)
  - `typeColor(deviceKind: DeviceKind)` is now a pure mapping (no string ops);
    `deviceKind` is inferred at the domain boundary in `scripts/domain/**`.

#### “Comparisons-only” cases that still violate the strict reading

These aren’t parsing, but they are still string comparisons outside the
boundary:

- `scripts/graph/trafficAdapter.ts` compares `kind` against string literals and
  compares `status === "down"`.
- `scripts/graph/viewModel.ts` compares `traffic.status === "down"`.
- `scripts/layouts/registry.ts` / graph renderer compare layout kind strings
  (`"tiered"`, `"force"`).

If you want to eliminate _all_ of these, the system needs a stronger internal
representation than raw strings.

#### Recommendation: normalize once at the boundary, consume typed tags internally

The cleanest way to satisfy the rule without making the UI/graph/layout code
awkward is:

- At the boundary (fixture parsing / enrichment), compute canonical fields:
  - `device.roleClass` or `device.kind` as an enum-like union (not free-form)
  - `device.siteKey` as a normalized string (computed once)
  - `traffic.status` as `"up" | "down"` (or an enum) with validation
  - visualization/layout kinds as `TrafficVizKind` / `LayoutKind` unions
- Internal layers (`layouts/**`, `lib/**`, `graph/**`) consume these canonical
  values and avoid any `toLowerCase/includes/regex`.

Concretely:

- Move `roleToTier()` and `inferSiteKey()` into `scripts/domain/**` (or
  `scripts/domain/layoutHints.ts`) and have the loader/controller compute hints.
- Replace `typeColor(type: string)` with `typeColor(kind: DeviceKind)` where
  `DeviceKind` is assigned during fixture parsing/enrichment. (Done.)
- Make `createTrafficAdapter({ kind })` accept `TrafficVizKind` (union) instead
  of `string`, and validate/coerce the UI value at the boundary.

This aligns with SOLID too: the “outside world” parsing stays at boundaries, and
internal modules operate over stable, typed representations.

---

### 9) Direction: stricter parsing so internal code can stop “defensive checking”

You mentioned you want to keep moving in the same direction: enforce rules on
`NetworkDevice` (and other external data) at parse time so that internal layers
don’t need repeated `if (field) …` and `typeof field === …` checks.

This is a good direction, and it pairs well with the “string parsing only at
boundaries” rule: **make the domain boundary the only place where data can be
partial, messy, or loosely typed**.

#### What “strict at parse time” means in this repo

- `scripts/domain/fixtures.ts` becomes the enforcement point for fixtures.
- NetBox enrichment and other integrations should produce the same normalized
  shapes as fixtures.
- Internal layers (`ui/**`, `graph/**`, `layouts/**`, `lib/**`) should treat
  domain objects as already-normalized and avoid runtime type narrowing.

#### Suggested invariants for `NetworkDevice`

Aim for:

- Required, normalized primitives:
  - `id: string` (non-empty)
  - `name: string` (non-empty; default to id)
  - `brand: string` and `model: string` (default to empty strings if unknown)
  - `type: string` (default to empty string; or consider making it required and
    meaningful if you want stricter semantics)
- Required derived tags:
  - `deviceKind: DeviceKind` (already implemented)
- Normalized collections:
  - `ports: Port[]` rather than `unknown[]` (port normalization already exists
    in `deviceCatalog.ts`; it could be part of fixture parsing too)
- Optional-but-typed fields:
  - `deviceTypeSlug?: string` (undefined when absent)
  - `thumbPng?: string`, `thumbJpg?: string` (only set when valid; internal UI
    should just do a truthy check)

#### Structural tightening that will pay off later

Right now `NetworkDevice` is still a “wide” record (`[k: string]: unknown`) to
preserve raw fixture fields. That’s convenient, but it pushes ambiguity inward.

Two incremental options (both work; pick based on how much strictness you want):

- Option A (small step): keep `NetworkDevice` strict-ish, but add
  `extra?: Record<string, unknown>` to hold unknown passthrough fields.
- Option B (stricter): introduce `RawDevice` (unknown/wide) at the IO edge and
  `NetworkDevice` as a sealed normalized type. Only `RawDevice` crosses the
  boundary.

Either option makes it easier to remove downstream checks because the compiler
can trust the shape.

#### Concrete next strictness wins

- Make `TrafficUpdate.status` a validated union at the boundary (e.g.
  `"up" | "down"`), so graph/view-model code stops comparing raw strings.
- Make layout/viz kinds typed unions (`LayoutKind`, `TrafficVizKind`) and
  validate UI inputs once, rather than switching on arbitrary strings in
  multiple files.
- Move more “normalization defaults” into parsing:
  - avoid `String(x)` spread across internal code
  - avoid `Array.isArray(x) ? x : []` patterns outside the boundary

---

## Suggested PR plan (small, safe steps)

### PR1 — Add config + replace magic numbers/colors (highest value)

- Add `scripts/config.ts` (pure constants + nested objects)
- Refactor:
  - `scripts/graph/trafficAdapter.ts`
  - `scripts/graph/renderer.ts`
  - `scripts/graph/viewModel.ts`
  - (optionally) `scripts/trafficFlowVisualization/*` to use shared constants

Acceptance:

- `deno task ci` stays green
- No behavioral change beyond easier-to-read code

### PR2 — Move pure utilities out of top-level `scripts/`

- Move `scripts/search.ts` → `scripts/lib/search.ts` (shim retained)
- Consider moving any other pure helpers similarly

### PR3 — Move domain boundary loader under `scripts/domain/**`

- Move `scripts/dataLoader.ts` → `scripts/domain/fixtureLoader.ts` (shim
  retained)
- Optional: add typed `loadJson<T>(path, guard?)`

### PR4 — Split `scripts/trafficConnector.ts`

- Introduce `scripts/traffic/**` and split connectors
- Reuse `scripts/lib/graph/**` where possible
- Keep `scripts/trafficConnector.ts` shim

### (Optional) PR4.5 — Connector registry (reduce controller coupling)

- Add `scripts/traffic/registry.ts` with a simple `kind -> factory` map
- Move config parsing per-kind next to each connector
- Update `scripts/app/controller.ts` to delegate to the registry

### PR5 — Responsive graph sizing

- Measure available size and update renderer on resize
- Keep config fallbacks for tools/headless renders

---

## Optional (but good) cleanups

- Consolidate repeated palette values into one place.
  - If you want to go further, define CSS variables in `styles.css` and read
    them from TS; but that’s a bigger “theme system” change.
- Reduce `unknown` usage at boundaries.
  - Prefer parsing once (domain boundary) and then using typed objects.
- Add tests around connector scheduling logic (timeline/flow/generator).
  - Especially for flow connector path computation and utilization calculation.

---

## TL;DR

The architecture is now solid. The next maintainability wins are:

1. Introduce `scripts/config.ts` and eliminate magic constants
2. Move `search`, `dataLoader`, and `deviceCatalog` under clearer boundaries
   (keep shims)
3. Split `trafficConnector` into smaller connector modules
4. Make graph sizing responsive (or at least centralized)
