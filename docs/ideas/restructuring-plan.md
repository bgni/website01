# Restructuring Plan (Incremental, Behavior-Preserving, Convergence-First)

This plan converts the architecture direction into an execution sequence with
clear gates. It is designed for incremental delivery while keeping UX stable and
CI green.

Key intent:
- Preserve current behavior.
- Reduce churn hotspots (especially `controller.ts`) by consolidating ownership.
- Prefer mechanical refactors, but require **adoption + deletion** (no extract-only limbo).

---

## Scope and Intent

- Primary hotspots:
  - `scripts/app/controller.ts`
  - `scripts/app/bootstrap.ts`
  - graph/runtime orchestration boundaries
- Preserve behavior while reducing coupling and churn.
- Favor mechanical moves + explicit contracts over rewrites.

---

## Hard Constraints

- `deno task ci` must stay green throughout.
- No implicit global `d3`; use `getD3()`.
- Bootstrap resolves DOM and injects dependencies.
- Controller/services own lifecycle concerns (`ResizeObserver`, runtime start/stop, teardown).
- No behavior changes bundled with module moves unless explicitly scoped.

---

## Baseline (Current State)

- Builder helpers extracted (`customBuilderUtils.ts`).
- Undo/redo state machine extracted (`historyService.ts`).
- Builder service exists (`scripts/app/builderService.ts`) but is not yet the single source of truth.
- `controller.ts` still contains substantial builder + runtime orchestration; churn hotspot remains active.
- Architecture target map exists: `architecture_hexagonal_target_map.md`.

---

## Immediate Priority (Close These Gaps First)

1) **Duplicate builder logic risk (P0)**
   - Builder logic exists both in `builderService.ts` and in `controller.ts`.
   - Goal: choose one source of truth by wiring controller to the service and removing duplicates.

2) **Undo/redo split-brain (P0)**
   - `historyService.ts` exists but controller still owns its own undo/redo stacks.
   - Goal: single history owner (service or historyService), controller delegates.

3) **Contract layer not yet introduced (P1)**
   - Missing `ports.ts` keeps services/controller coupled to concrete modules.
   - Goal: introduce minimal ports after consolidation to avoid abstraction creep.

4) **Service-level tests are not guarding orchestration (P1)**
   - Most regression protection is not at the service seam yet.
   - Goal: targeted tests around extracted services via fakes.

---

## Target End State

1. `controller.ts` is a narrow orchestration facade.
2. Services encapsulate use-cases (builder, traffic runtime, network lifecycle).
3. Ports define stable app-to-infra contracts.
4. Adapters implement ports with isolated infra details.
5. Service-level tests validate logic through fake ports.
6. Layout/graph-policy behavior is testable via deterministic input/output assertions outside the browser.

---

## Convergence Rule (Anti-Stagnation)

Extraction is not “done” until adoption is complete.

If:
- a service exists, and
- controller duplicates equivalent logic,

Then the next PR must:
- route calls through the service, and
- delete the duplicate controller path in the same PR,
- with behavior preserved and CI green.

No “temporary dual paths”.

---

## Workstreams

### Workstream A — Builder + History Consolidation (First)

Deliverables:
- Make `builderService.ts` the single source of truth for builder commands.
- Make `historyService.ts` (or the builder service) the single owner of undo/redo state.
- Controller becomes pass-through for builder commands.

Exit criteria:
- Controller builder methods are thin pass-throughs.
- No duplicated builder logic remains in controller.
- Undo/redo stacks are not re-implemented in controller.
- Behavior parity: add/connect/delete/rename/type-change/import/export/undo/redo unchanged.

---

### Workstream B — Contract Layer (`ports.ts`) + Adapters (Second)

Deliverables:
- Create `scripts/app/ports.ts` with minimal interfaces (only used methods):
  - `GraphPort`
  - `TopologyRepoPort`
  - `TrafficRuntimePort`
  - `CatalogPort`
- Add lightweight adapters over existing concrete modules.

Design constraints:
- Ports mirror existing behavior; no redesign.
- Keep ports narrow; expand only when a real call-site needs it.

Exit criteria:
- Controller/services consume ports rather than importing infra directly.
- No user-visible behavior changes.
- No new abstractions beyond necessary method signatures.

---

### Workstream C — Traffic Runtime Service

Deliverables:
- Extract traffic connector lifecycle orchestration from controller into
  `scripts/app/services/trafficService.ts` (or similar).
- Service responsibilities:
  - start/stop lifecycle
  - subscription/update wiring
  - status signaling

Exit criteria:
- Controller delegates traffic commands to the service.
- Repeated start/stop and source switching does not leak observers/connectors.
- Traffic status and updates remain functionally identical.

---

### Workstream D — Network Lifecycle Service

Deliverables:
- Extract network load/mount/refresh/teardown orchestration into
  `scripts/app/services/networkLifecycleService.ts`.
- Encapsulate graph mount/update lifecycle and shared refresh paths.

Exit criteria:
- Controller no longer owns low-level mount/refresh branching.
- Reload/refresh keeps viewport + positioning continuity where expected.

---

### Workstream E — Focused Test Coverage (Non-Browser First)

Deliverables:
- Service-level tests for extracted services using fake ports.
- Deterministic layout contract tests:
  - input: nodes/links/hints/bounds
  - assertions: stable ordering, tier/group assignment, deterministic invariants
- Graph-policy tests (selection/highlight/filter decisions) as pure transforms where possible.

Exit criteria:
- Critical service paths testable without DOM.
- Layout regressions detected without browser rendering.
- Tests guard orchestration order and error signaling paths.

---

## Sequencing (Recommended)

1. Builder + history consolidation (wire + delete duplicates).
2. Contract layer (`ports.ts`) + adapters.
3. Traffic runtime service extraction.
4. Network lifecycle service extraction.
5. Service-level tests and cleanup.

Rationale: eliminate duplication before adding abstraction.

---

## Next 3 PRs (Concrete)

### PR-A: Adopt builder + history services (no behavior change)

Scope:
- Instantiate `createBuilderService(...)` from controller.
- Delegate all builder actions to service methods.
- Replace controller-owned undo/redo stacks with the extracted history mechanism.
- Delete duplicated builder + history logic from `controller.ts` in the same PR.

Acceptance:
- `deno task ci` green.
- Builder behavior parity verified manually:
  add/connect/delete/rename/type-change/import/export/undo/redo.
- No parallel/legacy builder execution paths remain.

---

### PR-B: Introduce minimal `ports.ts` + adapter wrappers

Scope:
- Add `scripts/app/ports.ts` with only currently-needed methods.
- Add adapters for graph/storage/traffic/catalog integrations.
- Update controller/services to depend on ports, not concrete modules.

Acceptance:
- No user-visible behavior changes.
- Reduced direct imports of infra modules in controller/service layers.
- Ports remain narrow and one-to-one with existing responsibilities.

---

### PR-C: Extract traffic lifecycle service

Scope:
- Move connector start/stop/restart orchestration out of controller into service.
- Keep controller as routing/facade only for traffic actions.

Acceptance:
- Repeated network/source switching does not leak observers/connectors.
- Traffic status and updates remain identical.

---

## PR Strategy

Use small, reviewable PRs with one dominant concern each:

1. Adoption PRs (wire + delete duplicates; behavior unchanged).
2. Contract adoption PRs (ports wired; behavior unchanged).
3. Behavior PRs (only if explicitly required; one subsystem).
4. Cleanup PRs (renames/dead code) after stability.

---

## Validation Gates Per PR

Required:
- `deno task fmt`
- `deno task lint`
- `deno task check`
- `deno task test`

When applicable:
- `deno task validate` (fixture changes)
- `deno task render:svgs` (layout/render changes)
- `deno task build:pages` (wiring/build changes)

Release gate:
- `deno task ci`

---

## Risk Register and Controls

Risk: hidden behavioral drift during consolidation.
- Control: adoption+deletion in same PR; explicit parity checklist.

Risk: lifecycle leaks (observers/connectors not torn down).
- Control: service-owned lifecycle with start/stop contracts; targeted tests.

Risk: port layer becomes abstraction creep.
- Control: narrow ports; no redesign; one-to-one mapping with existing behavior.

Risk: scope creep from architecture cleanup.
- Control: no mixed “move + redesign” PRs; defer non-essential cleanup.

---

## Done Definition (Restructuring)

Restructuring is complete when:

1. Controller is materially reduced to coordination/facade responsibilities.
2. Builder/traffic/network lifecycle logic lives in dedicated services.
3. App-to-infra communication happens through `ports.ts` contracts.
4. Service-level tests cover core orchestration behavior.
5. CI remains green and key UX invariants remain intact.
