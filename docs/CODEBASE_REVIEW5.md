# Codebase Review 5 — website01

Date: 2026-02-25

This review is the “next tranche” after CODEBASE_REVIEW4. REVIEW4 identified a
set of maintainability wins (module placement, config/constants hygiene, and
traffic connector modularity). Some of those have been completed during
subsequent refactors, but several are still open.

The goal of REVIEW5 is to:

- Record what’s **done vs still pending** from REVIEW4.
- Provide a **tight, low-risk PR sequence** to finish the remaining
  maintainability wins.

---

## Status: REVIEW4 recommendations

### Completed since REVIEW4

- Tiered layout domain heuristics moved to the domain boundary and consumed as
  numeric hints.
  - Domain: `scripts/domain/layoutHints.ts`
  - Layout consumes hints without string parsing: `scripts/layouts/tiered.ts`
- Load-time strictness direction materially advanced (fixtures/device type
  integration, interface normalization, topology validation).
  - This goes beyond REVIEW4’s “next wins”, but it reduces downstream defensive
    checks and supports the “boundary-only parsing” rule.

- Fixture validation is now automated and CI-enforced.
  - Validator: `tools/validate_fixtures.ts` runs strict domain-level topology
    validation (`deviceTypeSlug` existence, interface existence/linkability,
    legacy interface normalization).
  - CI: `deno task ci` now includes `deno task validate`.

- UI state is persisted across reload.
  - `scripts/app/bootstrap.ts` restores and persists selected network and key UI
    settings (filter/sort/page size, layout kind, traffic viz kind) via
    `localStorage` with safe parsing + allowed-value checks.

- Traffic visualization switching now changes runtime behavior.
  - `scripts/graph/trafficAdapter.ts` delegates style hooks to the _current_
    `TrafficViz` instance (instead of binding once), and cleans up the previous
    viz on switch.

- Fixtures were remediated to comply with strict topology rules.
  - Invalid legacy `pN` references were removed from untyped endpoints across
    multiple networks.
  - `home` was aligned to the device type catalog (exact slugs + interface ids).

- Central graph/traffic constants are now consolidated.
  - Added `scripts/config.ts` and updated the renderer/view-model/traffic
    visualizations to pull shared constants from it.

- Module placement improvements completed with shims.
  - Search utilities moved to `scripts/lib/search.ts` with a compatibility shim
    at `scripts/search.ts`.
  - Network loading boundary moved to `scripts/domain/loadNetwork.ts` with a
    compatibility shim at `scripts/dataLoader.ts`.
  - Device catalog integration moved to `scripts/domain/deviceCatalog.ts` with a
    compatibility shim at `scripts/deviceCatalog.ts`.

- Traffic connector modularization completed with a shim.
  - Connector implementations now live under `scripts/traffic/**`.
  - `scripts/trafficConnector.ts` is now a re-export compatibility shim.

- Traffic connector selection is now registry-driven.
  - Added `scripts/traffic/registry.ts` and updated `scripts/app/controller.ts`
    to delegate connector creation/selection via the registry.

### Still pending (carry forward)

- Continue consolidating remaining constants
  - `scripts/config.ts` now exists and covers core graph/traffic constants.
  - Remaining work is to keep migrating any lingering magic values in adjacent
    modules as they’re touched (keeping refactors mechanical).
- Responsive sizing (or at least centralized default sizing)
  - Renderer still defaults to `width = 1200`, `height = 720`.
  - No `ResizeObserver`-driven sizing is present.
- Traffic connector modularization + OCP improvements
  - Connector kinds are now selected via a registry.
  - Remaining work is optional enhancements (e.g. cleaner dependency injection
    for connector loaders), but the core decoupling is done.
- Reduce DOM coupling in the renderer
  - Renderer still hard-codes `d3.select("#graph")`.
- Reduce implicit global coupling to D3
  - Renderer/layout code uses `d3` without an explicit import or injected
    dependency.
- Module placement / top-level cleanup
  - `scripts/deviceCatalog.ts` is now a shim; the implementation lives in
    `scripts/domain/deviceCatalog.ts`.

### Boundary rule follow-up (string comparisons)

If we continue the “string parsing/comparisons only at the outside-world
boundary” rule strictly, there are still internal string comparisons in
graph-related code:

- `scripts/graph/trafficAdapter.ts` compares `status === "down"` and normalizes
  a string `kind`.
- `scripts/graph/viewModel.ts` compares `t?.status === "down"`.

These should be addressed by normalizing at the boundary into stable internal
tags/unions (see PR plan below).

Note: normalizing the UI-selected traffic viz kind to a `TrafficVizKind` union
is already effectively happening in `scripts/graph/trafficAdapter.ts` via
`toKind(kind: string)`. The remaining stringly-typed bits are primarily the
traffic status and any other “outside-world” values flowing into graph logic.

---

## Recommended PR plan (small, safe steps)

### PR1 — Add config + eliminate magic constants (highest ROI)

Status: completed (2026-02-25)

Create `scripts/config.ts` containing only constants and plain objects (safe to
import in browser and tools).

Minimum suggested exports:

- `GRAPH_DEFAULTS` (width/height fallback, simulation constants, transition
  durations)
- `GRAPH_COLORS` (baseline palette used by renderer/view-model)
- `TRAFFIC_STYLE` (down color, utilization “hot threshold”, link width scaling
  constants)

Then update:

- `scripts/graph/renderer.ts`
- `scripts/graph/viewModel.ts`
- `scripts/graph/trafficAdapter.ts`
- (optional but consistent) `scripts/trafficFlowVisualization/*`

Acceptance:

- `deno task ci` green
- No UX/behavior change beyond making values centralized

### PR2 — Move pure utilities out of top-level `scripts/`

Status: completed (2026-02-25)

- Move `scripts/search.ts` → `scripts/lib/search.ts`
- Keep `scripts/search.ts` as a shim that re-exports from
  `scripts/lib/search.ts`

Acceptance:

- `deno task ci` green
- No import breakage (shim preserves old path)

### PR3 — Make loader/boundaries explicit

Status: completed (2026-02-25)

- Move `scripts/dataLoader.ts` → `scripts/domain/loadNetwork.ts` (or
  `scripts/domain/fixtureLoader.ts`)
- Keep `scripts/dataLoader.ts` as a shim re-export

Optional (nice, but keep it small): add a typed helper like
`loadJson(path, guard?)` so boundary modules can stop returning `unknown`
everywhere.

### PR4 — Split `scripts/trafficConnector.ts`

Status: completed (2026-02-25)

Split into `scripts/traffic/**` and keep a compatibility shim:

- `scripts/traffic/types.ts`
- `scripts/traffic/fetch.ts`
- `scripts/traffic/connectors/{real,static,timeline,generated,flow}.ts`
- `scripts/trafficConnector.ts` re-exports the public APIs

Keep the split mechanical: no behavior changes, just smaller files.

### PR4.5 — Traffic connector registry (reduce controller coupling)

Status: completed (2026-02-25)

Add `scripts/traffic/registry.ts`:

- `createTrafficConnector(kind, config, deps)`
- kind → factory map

Update `scripts/app/controller.ts` to:

- parse config once
- delegate connector creation to the registry

Acceptance:

- Adding a connector kind does not require editing controller logic beyond
  “wiring the kind into the registry”.

### PR5 — Responsive sizing + renderer dependency injection

Status: completed (2026-02-25)

Two focused improvements:

1. Stop hard-coding `#graph`

- Update the renderer API to accept an SVG element or a selector.

2. Stop relying on global `d3` implicitly

- Either import D3 consistently or inject a `d3` dependency into the
  renderer/layout boundary.

If you want actual responsive behavior:

- Use a `ResizeObserver` to measure the container
- Update `viewBox`, force center, and dependent constants on resize
- Retain config fallbacks for headless/tool rendering

Implemented:

- `createGraphRenderer` now accepts `svg: string | SVGSVGElement` (no hard-coded
  `#graph`).
- Centralized D3 access via `scripts/lib/d3.ts` (`getD3()`), avoiding implicit
  global `d3` usage.
- Added `resize()` plumbing (`graph.resize` → `renderer.resize`) and a
  `ResizeObserver` in the controller to keep `viewBox` and layout bounds in sync
  with the rendered SVG size.
- Controller now accepts injected IO deps (`loadData`/`loadJson`) from bootstrap
  to keep boundary IO explicit and make the controller easier to test.

---

## Notes / guardrails

- Keep REVIEW5 work “mechanical” where possible: shims for moved modules,
  refactors that preserve behavior.
- Keep string parsing/heuristics at the boundary. For graph code, normalize once
  into typed unions/tags (e.g. `TrafficStatus`, `TrafficVizKind`) and then
  switch on those.
