# Restructuring Plan (Incremental, Behavior-Preserving)

This plan turns the architecture direction into an execution sequence with clear
gates. It is designed for incremental delivery while keeping UX stable and CI
green.

## Scope and Intent

- Target hotspots: `scripts/app/controller.ts`, `scripts/app/bootstrap.ts`,
  graph/runtime orchestration boundaries.
- Preserve current behavior while reducing coupling and churn.
- Favor mechanical extraction + explicit contracts over broad rewrites.

## Constraints

- `deno task ci` must stay green throughout.
- No implicit global `d3`; use `getD3()`.
- Bootstrap resolves DOM and injects dependencies.
- Controller/services own lifecycle concerns (`ResizeObserver`, runtime start/
  stop, teardown).
- No behavior changes bundled with module moves unless explicitly scoped.

## Baseline (Current State)

- Domain helpers are partially extracted (`customBuilderUtils.ts`).
- Undo/redo state machine extracted (`historyService.ts`).
- Builder service exists (`scripts/app/builderService.ts`) but is not yet wired
  into `controller.ts`.
- `controller.ts` still contains substantial builder and lifecycle
  orchestration, so the churn hotspot remains active.
- Architecture target map exists: `architecture_hexagonal_target_map.md`.

## Current Gaps to Close First

1. **Duplicate builder logic risk**
   - `scripts/app/builderService.ts` exists while `controller.ts` still owns
     equivalent logic.
   - Immediate priority: choose one source of truth by wiring controller to the
     service and removing duplicated branches.
2. **Contract layer not yet introduced**
   - `ports.ts` is still missing, so services continue to depend on concrete
     modules.
3. **Service-level tests not yet protecting orchestration**
   - Existing coverage is still concentrated in catalog-related tests.
4. **Layout and orchestration testability not yet explicit in plan gates**

- We need deterministic input/output tests that do not depend on browser
  screenshots.

## Target End State

1. `controller.ts` becomes a narrow orchestration facade.
2. Services encapsulate use-cases (builder, traffic runtime, network lifecycle).
3. Ports define stable app-to-infra contracts.
4. Adapters implement ports with isolated infra details.
5. Service-level tests validate logic through fake ports.
6. Layout and graph-policy behavior are testable via deterministic input/output
   assertions outside the browser.

## Workstreams

### Workstream A — Contract Layer (`ports.ts`)

Deliverables:

- Create `scripts/app/ports.ts` with stable interfaces:
  - `GraphPort`
  - `TopologyRepoPort`
  - `TrafficRuntimePort`
  - `CatalogPort`
- Add lightweight adapter wrappers around existing concrete modules.

Design note:

- Keep ports intentionally narrow at first (only methods already used by
  `controller.ts`/services). Expand only when a real call-site needs it.

Exit criteria:

- Controller/services consume ports rather than concrete infra directly.
- No user-visible behavior changes.

### Workstream B — Traffic Runtime Service

Deliverables:

- Extract runtime orchestration from controller into
  `scripts/app/services/trafficService.ts`.
- Service responsibilities:
  - connector start/stop lifecycle
  - subscription/update wiring
  - status text/result signaling

Exit criteria:

- Controller delegates traffic commands to the service.
- Runtime start/stop semantics match current behavior.
- No memory/lifecycle regressions in repeated start/stop cycles.

### Workstream C — Builder Service Completion

Deliverables:

- Complete migration of builder command handlers into
  `scripts/app/builderService.ts` (current location).
- Keep selection, placement, auto-connect, and import/export behavior consistent
  with current UX invariants.

Optional follow-up (separate mechanical PR):

- Move service modules under `scripts/app/services/*` once behavior is already
  stable and tests are in place.

Exit criteria:

- Controller builder-related methods are thin pass-throughs.
- Builder behavior parity is verified via existing interactions.

### Workstream D — Network Lifecycle Service

Deliverables:

- Extract network load/mount/refresh/teardown orchestration into
  `scripts/app/services/networkLifecycleService.ts`.
- Encapsulate graph mount/update lifecycle and shared refresh paths.

Exit criteria:

- Controller no longer owns low-level mount/refresh branching.
- Reload/refresh keeps viewport + positioning continuity where expected.

### Workstream E — Focused Test Coverage

Deliverables:

- Add service-level tests for extracted services with fake ports.
- Add deterministic layout contract tests that compare topology/layout input to
  expected structured output (positions/order/group hints), without relying on
  browser rendering.
- Add graph-policy tests (selection/highlight/visibility decisions) as pure data
  transformations where possible.
- Prioritize behavior contracts:
  - command-to-dispatch outcomes
  - lifecycle ordering
  - error-path signaling

Exit criteria:

- Critical service paths are testable without DOM.
- Layout behavior regressions can be detected by non-browser tests.
- Tests guard against orchestration regressions.

## Testability Strategy (Non-Browser First)

### Testing Pyramid for This Repo

1. **Pure/domain tests (highest volume)**
   - Topology transforms, adjacency/path, placement helpers, layout heuristics.
2. **Service/port tests (high value)**
   - Controller-facing services tested with fake `GraphPort`/
     `TrafficRuntimePort`/`TopologyRepoPort`.
3. **Adapter tests (targeted)**
   - Thin checks that adapters correctly map port calls to concrete modules.
4. **Browser high-level smoke tests (small set)**
   - Validate integration and UI wiring only; avoid using screenshots as the
     primary correctness oracle.

### Layout Contract Tests (Explicit)

For each layout module, define test fixtures with:

- input: nodes, links, optional layout hints and bounds,
- output assertions: stable ordering, expected tier/group assignment,
  deterministic position invariants (and exact values where feasible).

Rule:

- A layout refactor is not complete unless its behavior is protected by
  input/output tests that run without browser APIs.

## Sequencing (Recommended)

1. Contract layer (`ports.ts`) and adapters.
2. Builder service completion (wire existing service, remove duplication).
3. Traffic service extraction.
4. Network lifecycle service extraction.
5. Service-level tests and cleanup.

Rationale: maximize decoupling with lowest UX risk early.

## Next 3 PRs (Concrete)

### PR-A: Wire existing builder service (no behavior change)

Scope:

- Instantiate `createBuilderService(...)` from `controller.ts`.
- Delegate all builder actions from controller API methods to service methods.
- Remove duplicated builder command logic from `controller.ts`.

Acceptance:

- Builder UX parity:
  add/connect/delete/rename/type-change/import/export/undo-redo all behave the
  same.
- `deno task ci` green.

### PR-B: Introduce minimal `ports.ts` + adapter wrappers

Scope:

- Add `scripts/app/ports.ts` with only currently-needed methods.
- Add wrappers for graph/storage/traffic/catalog integrations.
- Update controller/services to consume interfaces, not concrete modules.

Acceptance:

- No user-visible behavior changes.
- Reduced direct imports of infra modules in controller/service layers.

### PR-C: Extract traffic lifecycle service

Scope:

- Move connector start/stop/restart orchestration out of `controller.ts` into a
  dedicated service.
- Keep controller as routing/facade only for traffic actions.

Acceptance:

- Repeated network/source switching does not leak observers/connectors.
- Traffic status and updates remain functionally identical.

## PR Strategy

Use small, reviewable PRs with one dominant concern each:

1. Mechanical extraction PRs (moves/shims only).
2. Contract adoption PRs (ports wired, behavior unchanged).
3. Behavior PRs (if needed), scoped to one subsystem.
4. Cleanup PRs (renames/dead code) only after stability.

## Validation Gates Per PR

Required:

- `deno task fmt`
- `deno task lint`
- `deno task check`
- `deno task test`

Recommended for restructuring PRs (even if not strictly required):

- `deno task test:cov`
- `deno task coverage:check`

When applicable:

- `deno task validate` (fixture-affecting changes)
- `deno task render:svgs` (layout/render-affecting changes)

Release gate for milestone merges:

- `deno task ci`

## Risk Register and Controls

Risk: hidden behavioral drift during extraction.

- Control: mechanical-first PRs + explicit parity checks.

Risk: lifecycle leaks (observers/connectors not torn down).

- Control: service-owned lifecycle with clear start/stop contracts and tests.

Risk: adapter/port mismatch creating duplicated logic.

- Control: keep ports narrow and map one-to-one to existing responsibilities.

Risk: scope creep from architecture cleanup.

- Control: no mixed “move + redesign” PRs; defer non-essential cleanup.

## Done Definition (Restructuring)

Restructuring is complete when:

1. Controller is materially reduced to coordination/facade responsibilities.
2. Builder/traffic/network lifecycle logic lives in dedicated services.
3. App-to-infra communication happens through `ports.ts` contracts.
4. Service-level tests cover core orchestration behavior.
5. CI remains green, and key UX invariants remain intact.
