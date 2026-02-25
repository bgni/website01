# CODEBASE_TODO

This file tracks how closely the current repo matches the restructuring guidance
in:

- `docs/archive/reviews/review-01-structure-plan.md` (the concrete 3‑PR plan)
- `docs/archive/reviews/review-02-target-architecture-tree.md` (a more ambitious
  “target tree” + boundary rules)

The goal is to keep the repo’s mental model obvious:

- `tools/**` = Deno tooling (CI/build-time)
- `scripts/**` = browser/runtime
- `scripts/domain/**` = domain types + fixture parsing/validation
- `scripts/app/**` = state/store + orchestration
- `scripts/ui/**` = DOM rendering + event wiring
- `scripts/graph/**` = graph visualization engine (renderer + adapters)

---

## Compliance: CODEBASE_REVIEW2

### 1) Tooling vs runtime split

- [x] Tooling moved to `tools/**` (`tools/build_pages.ts`,
      `tools/validate_fixtures.ts`, etc.)
- [x] `deno.json` tasks point at `tools/**`
- [x] `scripts/**` remains browser/runtime-only

### 2) Domain types moved out of `scripts/main.ts`

- [x] `scripts/domain/types.ts` is the single source of truth for:
  - `Device`, `ConnectionEnd`, `Connection`, `TrafficUpdate`
- [x] Add `scripts/domain/fixtures.ts` with runtime parsing/guards
  - Implemented `parseDevicesFixture()` + `parseConnectionsFixture()` and wired
    them into `scripts/dataLoader.ts`.
  - `scripts/app/controller.ts` now consumes typed `Device[]`/`Connection[]`
    without `unknown` casts.

### 3) Thin `scripts/main.ts` + app/ui split

- [x] `scripts/main.ts` is a thin entry point (delegates to app bootstrap)
- [x] `scripts/app/**` exists and owns orchestration/state:
  - `scripts/app/bootstrap.ts`
  - `scripts/app/controller.ts`
  - `scripts/app/state.ts` (reducer/store/selectors in one module)
- [x] `scripts/ui/**` exists and owns DOM rendering + event wiring:
  - `scripts/ui/controls.ts`
  - `scripts/ui/searchPanel.ts`
  - `scripts/ui/selectedPanel.ts`

### 4) Split `scripts/graph.ts` into renderer + integrations

- [x] Graph split into `scripts/graph/**`:
  - `scripts/graph/renderer.ts` (D3/SVG core)
  - `scripts/graph/layoutAdapter.ts` (only place importing
    `scripts/layouts/registry.ts`)
  - `scripts/graph/trafficAdapter.ts` (only place importing
    `scripts/trafficFlowVisualization/registry.ts`)
  - `scripts/graph/graph.ts` facade (preserves `createGraph(...)` API)
- [x] `scripts/graph.ts` is a stable re-export shim
- [ ] Optional clean-up: add `scripts/graph/types.ts` for render-level types
  - Current state: `SimNode`/`SimLink` types live in `renderer.ts`.

**Overall (REVIEW2):** compliant with the 3-PR plan.

---

## Compliance: CODEBASE_REVIEW3 (deeper/optional target)

CODEBASE_REVIEW3 describes a more granular tree
(store/actions/reducers/selectors split, `scripts/lib/**`, a graph view-model
module, stricter import rules, and “no innerHTML” helpers). The repo matches the
_spirit_ but not the full tree yet.

### What matches well

- [x] High-level boundaries are in place (`tools/`, `domain/`, `app/`, `ui/`,
      `graph/`).
- [x] Orchestration is centralized in `scripts/app/controller.ts`.
- [x] Layout + traffic registry integration is isolated behind adapters.

### Partial / not yet implemented

- [x] `scripts/lib/**` for pure reusable utilities
  - Implemented. Pure algorithms and style mapping moved into `scripts/lib/**`,
    with `scripts/graphLogic.ts` kept as a re-export shim.
- [x] Split app layer into smaller leaf modules
  - Suggested split (if desired):
    - `scripts/app/store.ts` (createStore/subscribe)
    - `scripts/app/actions.ts` (Action union + creators)
    - `scripts/app/reducers.ts` (reduce)
    - `scripts/app/selectors.ts` (getFilteredDevices/getPageDevices/etc.)
  - Updated: implemented these leaf modules; `scripts/app/state.ts` remains a
    facade re-export for minimal churn.
- [x] Domain fixture parsing + typed errors
  - Implemented `scripts/domain/errors.ts` + `scripts/domain/fixtures.ts`.
  - `scripts/dataLoader.ts` validates devices/connections at load time.
  - `scripts/app/controller.ts` reports load failures via a simple status
    string.
- [x] Graph view-model layer
  - Suggested: `scripts/graph/viewModel.ts` to map domain+state → render types.
  - Current state: implemented in `scripts/graph/viewModel.ts` and used by
    `scripts/graph/graph.ts`.
- [x] “No `innerHTML`” / safe DOM helpers
  - Updated: UI modules now build DOM nodes via `createElement` + `textContent`.

**Overall (REVIEW3):** mostly compliant (high-level boundaries + stricter
leaf-module boundaries are in place; remaining gaps are optional refinements).

---

## What’s left to do (prioritized)

### P0 — correctness + maintainability

- [x] Add typed domain parse errors + traffic normalization helpers
  - `parseTrafficUpdatesPayload()` is used by the controller to accept both
    arrays and timeline-shaped traffic payloads (and now rejects invalid shapes
    instead of silently returning `[]`).

### P1 — enforce boundaries (optional but high value)

- [x] Create `scripts/lib/**` and move pure code out of `scripts/graphLogic.ts`
  - Moved `buildAdjacency`, `findShortestPath`, `collectHighlights`,
    `typeColor`.
- [x] Tighten graph renderer boundary (optional)
  - Make `renderer.ts` accept a node fill callback instead of importing
    `typeColor`.

### P2 — structure refinement (optional)

- [x] Split `scripts/app/state.ts` into store/actions/reducers/selectors (per
      REVIEW3)
- [x] Add `scripts/graph/viewModel.ts` (domain+state → render types)

### P3 — UI safety / hygiene (optional)

- [x] Remove `innerHTML` usage in UI modules
  - Replace template strings with DOM element creation + `textContent`.
  - If you keep HTML templates, at least ensure user-controlled fields are
    escaped.

---

## Notes / constraints

- Keep `deno task ci` green after each step.
- Prefer minimal churn: REVIEW2 items are “must-do”; REVIEW3 items are
  “nice-to-have” unless they fix real bugs or security issues.
