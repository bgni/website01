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

### Still pending (carry forward)

- Central config/constants module
  - `scripts/config.ts` does not exist yet.
  - Magic numbers / palette values remain spread across:
    - `scripts/graph/renderer.ts`
    - `scripts/graph/viewModel.ts`
    - `scripts/graph/trafficAdapter.ts`
    - `scripts/trafficFlowVisualization/*`
  - Example hotspots (not exhaustive):
    - `scripts/graph/viewModel.ts` default stroke/halo colors and filter
      strings.
    - `scripts/graph/trafficAdapter.ts` down color and utilization→color/width
      scaling constants.
- Responsive sizing (or at least centralized default sizing)
  - Renderer still defaults to `width = 1200`, `height = 720`.
  - No `ResizeObserver`-driven sizing is present.
- Traffic connector modularization + OCP improvements
  - `scripts/trafficConnector.ts` is still monolithic.
  - `scripts/app/controller.ts` still selects connector kinds directly rather
    than delegating to a registry.
- Reduce DOM coupling in the renderer
  - Renderer still hard-codes `d3.select("#graph")`.
- Reduce implicit global coupling to D3
  - Renderer/layout code uses `d3` without an explicit import or injected
    dependency.
- Module placement / top-level cleanup
  - `scripts/search.ts` is still top-level (should move under `scripts/lib/**`
    with a shim).
  - `scripts/dataLoader.ts` is still top-level (boundary loader; should move
    under `scripts/domain/**` with a shim).
  - `scripts/deviceCatalog.ts` is still top-level (domain integration; should
    move under `scripts/domain/**` with a shim).

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

- Move `scripts/search.ts` → `scripts/lib/search.ts`
- Keep `scripts/search.ts` as a shim that re-exports from
  `scripts/lib/search.ts`

Acceptance:

- `deno task ci` green
- No import breakage (shim preserves old path)

### PR3 — Make loader/boundaries explicit

- Move `scripts/dataLoader.ts` → `scripts/domain/loadNetwork.ts` (or
  `scripts/domain/fixtureLoader.ts`)
- Keep `scripts/dataLoader.ts` as a shim re-export

Optional (nice, but keep it small): add a typed helper like
`loadJson(path, guard?)` so boundary modules can stop returning `unknown`
everywhere.

### PR4 — Split `scripts/trafficConnector.ts`

Split into `scripts/traffic/**` and keep a compatibility shim:

- `scripts/traffic/types.ts`
- `scripts/traffic/fetch.ts`
- `scripts/traffic/connectors/{real,static,timeline,generated,flow}.ts`
- `scripts/trafficConnector.ts` re-exports the public APIs

Keep the split mechanical: no behavior changes, just smaller files.

### PR4.5 — Traffic connector registry (reduce controller coupling)

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

---

## Notes / guardrails

- Keep REVIEW5 work “mechanical” where possible: shims for moved modules,
  refactors that preserve behavior.
- Keep string parsing/heuristics at the boundary. For graph code, normalize once
  into typed unions/tags (e.g. `TrafficStatus`, `TrafficVizKind`) and then
  switch on those.
