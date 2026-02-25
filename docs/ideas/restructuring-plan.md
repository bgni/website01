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
- Builder logic extraction has started (`builderService.ts` exists).
- Architecture target map exists: `architecture_hexagonal_target_map.md`.

## Target End State

1. `controller.ts` becomes a narrow orchestration facade.
2. Services encapsulate use-cases (builder, traffic runtime, network lifecycle).
3. Ports define stable app-to-infra contracts.
4. Adapters implement ports with isolated infra details.
5. Service-level tests validate logic through fake ports.

## Workstreams

### Workstream A — Contract Layer (`ports.ts`)

Deliverables:

- Create `scripts/app/ports.ts` with stable interfaces:
  - `GraphPort`
  - `TopologyRepoPort`
  - `TrafficRuntimePort`
  - `CatalogPort`
- Add lightweight adapter wrappers around existing concrete modules.

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
  `scripts/app/services/builderService.ts`.
- Keep selection, placement, auto-connect, and import/export behavior consistent
  with current UX invariants.

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
- Prioritize behavior contracts:
  - command-to-dispatch outcomes
  - lifecycle ordering
  - error-path signaling

Exit criteria:

- Critical service paths are testable without DOM.
- Tests guard against orchestration regressions.

## Sequencing (Recommended)

1. Contract layer (`ports.ts`) and adapters.
2. Traffic service extraction.
3. Builder service completion.
4. Network lifecycle service extraction.
5. Service-level tests and cleanup.

Rationale: maximize decoupling with lowest UX risk early.

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
