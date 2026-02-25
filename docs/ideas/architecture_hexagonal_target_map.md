# Architecture Target Map (Hexagonal-Inspired, Pragmatic)

## Why this direction

The codebase already has useful separation (state/reducer, controller
orchestration, graph adapter), but `controller.ts` remains a high-churn
integration point.

This target keeps existing behavior and UI architecture, while making boundaries
explicit using ports/adapters and application services.

---

## Proposed Module Boundaries

## 1) Domain (pure)

Location examples:

- `scripts/domain/*`
- `scripts/app/customBuilderUtils.ts`

Rules:

- No DOM.
- No network I/O.
- No store dispatch.
- Pure transformations and validation.
- Deterministic behavior for the same input (critical for layout/policy tests).

Current examples:

- Port matching and free-port selection.
- Device property sanitization.
- Connection pruning when type changes.

---

## 2) Application Services (use-case orchestration)

Target locations:

- `scripts/app/services/builderService.ts`
- `scripts/app/services/networkLifecycleService.ts`
- `scripts/app/services/trafficService.ts`
- `scripts/app/historyService.ts`

Rules:

- Coordinate use-cases.
- Depend on ports/interfaces, not concrete adapters.
- Return result objects/messages, avoid direct DOM interaction.
- Be runnable in tests with fake ports and no browser APIs.

Current status:

- `historyService.ts` extracted as first template slice.

---

## 3) Ports (interfaces/contracts)

Target location:

- `scripts/app/ports.ts`

Proposed ports:

- `GraphPort`: mount/update/layout/resize/snapshot/selection callbacks.
- `TopologyRepoPort`: load/save/import/export custom topology.
- `TrafficSourcePort`: start/stop traffic connectors.
- `CatalogPort`: device type loading.

Rules:

- Ports are stable contracts.
- Adapters can change independently.

---

## 4) Adapters (infrastructure/UI)

Current/target locations:

- Graph adapter: `scripts/graph/*`
- Storage adapter: `scripts/app/customTopology.ts`
- Traffic adapters: `scripts/traffic/*`
- UI adapters: `scripts/ui/*`

Rules:

- Implement ports.
- Keep infra details contained.

---

## 5) Composition Root

Location:

- `scripts/app/bootstrap.ts`

Rules:

- Instantiate services/adapters.
- Wire UI events to application service API.
- Minimal business logic.

---

## Contract Summary

## UI -> App API

`bootstrap.ts` calls a narrow controller facade:

- Builder actions
- Network/traffic controls
- Undo/redo controls

## App -> Ports

Application services call:

- Graph port
- Topology repo port
- Traffic port
- Catalog port

## Domain <-> App

App services call pure domain functions, passing explicit data and using
returned results.

## Testability Contract

- Prefer testing behavior as data-in/data-out before testing browser rendering.
- Layout modules should expose deterministic outputs/invariants that can be
  asserted in unit tests.
- Services should be validated with fake ports (no real DOM, no D3 dependency).
- Keep browser tests as high-level integration confidence checks, not the
  primary source of functional correctness.

---

## Coupling Reduction Roadmap

## Phase 1 (now)

- Extract pure helpers (done: `customBuilderUtils.ts`).
- Extract history state machine (done: `historyService.ts`).

## Phase 2

- Move builder command handlers out of `controller.ts` into `builderService.ts`.
- Keep controller as thin facade and wiring layer.

## Phase 3

- Extract network lifecycle (`loadNetwork`, graph mount/destroy, traffic
  connector orchestration).
- Introduce explicit `ports.ts` and adapter implementations.

## Phase 4

- Add targeted service-level tests on pure-ish use-case outputs.

---

## Non-goals

- No full framework rewrite.
- No strict academic hexagonal purity at expense of delivery speed.
- No forced MVC migration.

This is an incremental architecture evolution designed to reduce churn risk and
improve testability without slowing product iteration.
