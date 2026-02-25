# Advanced Agent Lessons (Architecture + Delivery)

This document captures higher-order lessons from recent builder UX work,
controller refactors, and architecture planning. It is intentionally focused on
decision quality, boundary design, and change strategy (not basic repo setup).

## 1) Core Architecture Stance

Use **pragmatic hexagonal architecture** as the direction of travel:

- Keep a pure domain core for topology transforms and validation.
- Put use-case orchestration in application services.
- Isolate infrastructure/UI details behind explicit ports/adapters.
- Keep `bootstrap.ts` as composition root and `controller.ts` as a thin facade.

This is not a rewrite mandate. Move in slices that preserve behavior.

## 2) Topology-First Modeling Rule

Treat topology as a generic graph model, then layer network semantics on top.

- Topology core: nodes, links, groups/containers, metadata envelopes.
- Network policy layer: roles, interface constraints, allowed link types,
  auto-connect heuristics.
- Scenario layer: traffic simulation/runtime overlays and presentation state.

Practical payoff: the same topology primitives support future domains without
rebuilding core interactions.

## 3) Boundary Ownership (Hard Rule)

- `bootstrap.ts` resolves DOM elements and injects dependencies.
- Controller/service layer owns lifecycle (`ResizeObserver`, mount/unmount,
  long-lived handles).
- Renderers never hard-code DOM selectors for required roots.
- Domain helpers never access DOM, storage, fetch, or D3 globals.

If a module needs environment access, represent it as an injected port.

## 4) Refactor Strategy for High-Churn Files

When a file is large and changes frequently (for example
`scripts/app/controller.ts`), extract by **cohesive behavior slices**:

1. Extract pure helpers first (zero behavior change).
2. Extract state machines next (undo/redo, lifecycle states).
3. Extract one use-case service (builder or traffic) behind a small interface.
4. Keep shims/facades so call sites migrate gradually.

Avoid “big-bang” structural edits that mix behavior changes with moves.

## 5) UX Interaction Invariants (Builder)

These behaviors should remain stable unless intentionally redesigned:

- Add action respects current selection context.
- New nodes appear near selected node or viewport center.
- Existing layout should not be aggressively disrupted after local edits.
- Empty canvas click clears selection.
- Drag marquee supports selection replacement for parity with visual editors.
- Advanced/raw property editing is discoverable but not noisy by default.

Any future UX work should preserve these invariants or document why not.

## 6) Determinism + Predictability Over Cleverness

- Prefer deterministic layout and transform outcomes for the same input state.
- Preserve viewport and node-position continuity across refresh/rebuild paths.
- Use constrained reheating and local updates before global force changes.

The product value is operator trust, not algorithm novelty.

## 7) Ports to Prioritize Next

Introduce explicit contracts before further decomposition:

- `GraphPort`: mount/update/layout/resize/snapshot/callback hooks.
- `TopologyRepoPort`: load/save/import/export custom topology.
- `TrafficRuntimePort`: start/stop/update runtime connectors.
- `CatalogPort`: load/query device type metadata.

Once contracts exist, services can be tested with fake ports.

## 8) Change-Risk Heuristic

Use this ordering when shipping non-trivial changes:

1. Mechanical extraction (no behavior changes).
2. Contract introduction (ports + adapters, same behavior).
3. Focused behavior changes in one subsystem.
4. Optional cleanup/renames after CI is stable.

If one PR attempts all four, split it.

## 9) Advanced Testing Guidance

- Keep `deno task ci` green at each extraction step.
- Add service-level tests where logic becomes pure-ish through ports.
- Validate fixture consistency whenever topology semantics or catalogs change.
- Treat renderer-level changes as interaction contracts (selection, viewport,
  callback semantics), not only visual output.
- Prefer deterministic data-contract tests over screenshot-based assertions.
- For layout work, define fixture-driven input/output expectations and
  invariants (tier/group/order/position constraints) that run outside browser
  APIs.

## 10) Anti-Patterns to Reject

- Hidden coupling from controller directly touching DOM internals.
- Implicit global `d3` usage outside `getD3()` wrapper.
- Refactors that combine moves, renames, and semantics in one commit.
- Exposing raw JSON/property editing as the default path for common tasks.
- Introducing policy logic directly inside renderer code.

## 11) Decision Record Template (Use in PRs)

For architecture-impacting changes, capture:

1. **Problem pressure:** what is failing (churn, coupling, UX friction).
2. **Boundary decision:** what layer owns the responsibility.
3. **Migration strategy:** shim/slice plan and rollback point.
4. **Invariants protected:** UX + data + lifecycle contracts.
5. **Validation:** CI/tasks and targeted tests run.

Short decisions documented consistently are better than long undocumented
refactors.

## 12) Immediate Recommended Sequence

1. Wire existing `builderService` into controller and remove duplication.
2. Introduce `ports.ts` contracts and wire existing adapters.
3. Extract `trafficService` from controller orchestration.
4. Add focused service + layout contract tests with fake ports/fixtures.

This sequence maximizes decoupling while keeping current UX stable.
