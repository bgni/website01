# Code Review — website01 (February 2026)

## Summary

The app is a Deno + TypeScript static site that visualizes network topologies
with D3. It supports network browsing, a custom builder mode (device
add/connect/delete/rename/type-change/undo/redo), traffic visualization with
multiple connector types (flow, generated, static, real-time polling, timeline),
and topology import/export.

**Overall quality: solid.** The project has clear architectural direction, a
working CI pipeline, good separation of domain/app/infrastructure layers, and
meaningful test coverage concentrated on the areas that matter most (builder
logic, traffic service, and domain utilities). There are no major structural
defects, but several areas can be tightened for long-term maintainability.

---

## Architecture Assessment

### What's Working Well

1. **Service extraction is substantially complete.** `builderService.ts` (670
   lines) and `trafficService.ts` (164 lines) own their respective domains.
   Controller builder methods are now thin pass-throughs to the service.

2. **Port contracts are defined and adopted.** `ports.ts` declares
   `BuilderGraphPort`, `BuilderHistoryPort`, `BuilderIdentityPort`,
   `BuilderModePort`, `TrafficLoadPort`, `TrafficGraphPort`, and
   `TrafficConnectorPort`. Both services compose these via intersection types
   rather than duplicating inline signatures.

3. **History service is clean.** `historyService.ts` (75 lines) is a focused
   undo/redo stack with bounded snapshots. Builder routes through it correctly
   via the port contract.

4. **State management is simple and correct.** `store.ts` (22 lines) is a
   minimal pub/sub store with an immutable reducer (`reducers.ts`, 106 lines).
   Actions are a discriminated union. No middleware complexity.

5. **Domain layer validates at boundaries.** `fixtures.ts` parses unknown JSON
   into typed structures with error context. `topology.ts` normalizes legacy
   interface IDs and cross-validates device/connection references. The
   `FixtureValidationError` type is used consistently.

6. **Tests cover the extracted services well.** 36 tests pass (0 failures).
   `builderService_test.ts` (531 lines) has 14 tests covering add/connect/
   delete/rename/type-change/container/import/export with a stateful harness.
   `trafficService_test.ts` (220 lines) covers merge/error/restart/source-
   override behavior.

7. **DI seams are usable.** Controller accepts `ControllerDeps` for
   `loadData`, `loadJson`, `fetch`, `storage`. Services accept their deps as
   typed objects. This makes testing possible without DOM.

### What Needs Attention

#### 1. Controller is still large and owns too much orchestration (P1)

`controller.ts` is 588 lines. After builder delegation, it still directly
owns:

- **Network lifecycle** (`loadNetwork`, `mountGraph`, `destroyGraph`,
  `refreshCustomGraph`, `persistCustomTopology`): ~100 lines of
  mount/teardown/position-preservation logic.
- **Undo/redo orchestration** (`undoLastCustomEdit`, `redoLastCustomEdit`):
  ~50 lines that clone state, call `customHistory.undo/redo()`, and call
  `refreshCustomGraph`. This logic is split between controller (which owns
  the redo-push and the refresh) and builderService (which pushes undo
  snapshots). This is a subtle split-brain risk.
- **Graph snapshot helpers** (`getCustomGraphSnapshot`,
  `preserveDevicePositions`, `withPosition`, `cloneDevices`,
  `cloneConnections`): utility functions that belong closer to their consumers.

**Recommendation:** Extract a `networkLifecycleService` (or fold lifecycle into
an existing service) that owns mount/destroy/refresh. Undo/redo orchestration
should live in one place — either fully in `builderService` or in a dedicated
`historyController` — not split across two modules.

#### 2. Bootstrap is 497 lines of inline wiring (P2)

`bootstrap.ts` contains:

- UI settings persistence (load/save).
- DOM element resolution (14+ `mustGetById` calls).
- Device type grouping/sorting logic for the builder dropdown (~80 lines).
- Keyboard shortcut handling.
- Network index loading and default resolution.

The device-type grouping logic (recent/popular/search) is pure data
transformation that should be a tested utility, not inline in bootstrap.

**Recommendation:** Extract device-type grouping into a pure function in
`customTopology.ts` or a new `builderCatalog.ts`. Move keyboard shortcut wiring
to a small dedicated module. Keep bootstrap focused on composition-root concerns
(wire deps, call `start`).

#### 3. Undo/redo ownership is split (P1)

| Concern | Owner |
| --- | --- |
| Push undo snapshot | `builderService` (via `deps.history.pushUndo`) |
| Push redo snapshot | `controller` (in `undoLastCustomEdit`) |
| Call `history.undo()` | `controller` |
| Call `history.redo()` | `controller` |
| Clear stacks | `controller` (in `loadNetwork`) |
| Clear stacks (import) | `builderService` (via `deps.history.clear()`) |

This means undo/redo behavior cannot be tested without the controller. The
service pushes snapshots but doesn't own the restore. The controller owns
restore but not the push.

**Recommendation:** Have `builderService` own a `performUndo()` /
`performRedo()` method that takes a callback for `refreshCustomGraph`. Or
extract a `UndoRedoController` that composes history + refresh in one place.

#### 4. `builderStats` is a mutable shared reference (P2)

`builderStats` is created in `controller.ts` as a plain object, passed by
reference to `builderService`, and mutated in both places:

- Controller writes `builderStats.recentDeviceTypeSlugs = ...` during
  `loadNetwork`.
- Service writes the same fields inside `addCustomDeviceInternal`.
- Bootstrap reads via `controller.getBuilderDeviceStats()`.

This works but makes ownership unclear and prevents future encapsulation.

**Recommendation:** Introduce a `BuilderStatsPort` with `get()/set()` methods.

#### 5. Test coverage has gaps in critical paths (P2)

**Covered:** builder commands, traffic service, custom builder utils, device
catalog.

**Not covered:**
- `controller.ts` — `loadNetwork`, undo/redo, graph mount/destroy, traffic
  source switching. Only a controller-level test file with 0 tests
  (`controller_test.ts` exists with minimal coverage).
- `historyService.ts` — no dedicated test file. Undo/redo stack behavior is
  only implicitly tested through builder service tests.
- `reducers.ts` — no tests for state transitions.
- `customTopology.ts` — no tests for `loadCustomTopology`, `saveCustomTopology`,
  `parseImportPayload`, `trackRecentDeviceType`.
- `bootstrap.ts` — no tests (acceptable for composition root, but the inline
  logic should be extracted and tested).

**Recommendation:** Add tests for `historyService` (simple, high-value),
`reducers` (state transitions), and `customTopology` (parse/persist). Consider
a lightweight controller integration test for `loadNetwork` + undo/redo.

#### 6. Some type seams could be tighter (P3)

- `NetworkDevice` has `[k: string]: unknown` (index signature). This is
  intentional for extensibility but means any property access is unguarded.
  Consider narrowing known optional properties (e.g., `x`, `y`, `width`,
  `height`, `isContainer`, `containerId`) to explicit optional fields and
  keeping the index signature only for truly unknown extensions.
- `State.trafficSourceKind`, `trafficVizKind`, `layoutKind` are all typed as
  `string`. These could be string literal unions (matching registry constants)
  to catch invalid values at compile time.
- The `Controller` return type re-declares every builder method signature
  rather than intersecting with `BuilderService`. This creates a maintenance
  coupling.

---

## Code Quality Metrics

| Metric | Value |
| --- | --- |
| Source files (non-test) | 67 |
| Test files | 4 |
| Total tests | 36 |
| Tests passing | 36 (100%) |
| App layer (`scripts/app/`) | 2,721 lines |
| Test code | 1,103 lines |
| Test-to-code ratio (app) | 0.41 |
| Largest file | `builderService.ts` (670 lines) |
| Second largest | `controller.ts` (588 lines) |
| Infrastructure | ~5,700 lines |
| Coverage threshold | 39% line / 59% branch |

---

## File-by-File Notes

### Good

- **`historyService.ts`** — Clean, focused, bounded. No dependencies beyond
  domain types. Could use its own unit tests.
- **`trafficService.ts`** — Well-factored. Clean port composition. All
  behavior tested.
- **`reducers.ts`** — Pure, predictable. Each action case is 2-8 lines.
- **`selectors.ts`** — Pure functions, no side effects. Good use of
  composition (`applyFilter → applySort → paginate`).
- **`customBuilderUtils.ts`** — Pure utility functions with thorough tests
  (11 test cases covering edge cases).
- **`store.ts`** — 22 lines, does exactly one thing.
- **`ports.ts`** — Minimal, correctly typed, no implementation logic.

### Needs Work

- **`controller.ts`** — Still the largest concentration of orchestration.
  Pass-through methods are boilerplate. Undo/redo split is the main risk.
- **`bootstrap.ts`** — Too much inline logic. Device-type grouping and
  keyboard shortcuts should be elsewhere.
- **`builderService.ts`** — Functionally correct and well-tested but at 670
  lines it's the largest single file. The `addCustomDeviceInternal` method
  alone is ~70 lines. Consider whether container logic could be a separate
  concern.

### Neutral

- **`customTopology.ts`** — Solid parsing and persistence. Untested but the
  validation delegates to tested domain functions.
- **`graph/graph.ts`** — Clean API surface. Couples to D3 and renderer
  internals (expected for infrastructure).

---

## Risks

1. **Undo/redo split-brain** — If a future change pushes snapshots differently
   in builder vs. controller, the undo stack will silently corrupt. This is the
   highest-risk architectural issue.

2. **No controller-level tests** — The most complex orchestration code (network
   loading, error handling, graph mount/destroy lifecycle) has no test coverage.
   Regressions in this area will only surface manually.

3. **Mutable shared state (`builderStats`)** — Two modules mutating the same
   object without a clear ownership contract is a source of subtle bugs.

4. **Bootstrap inline logic** — The device-type grouping logic is ~80 lines of
   array manipulation that is untested and would break silently.

---

## Positive Trends

- Service extraction is nearly complete (builder, traffic, history).
- Port contracts are defined and actively used.
- Test coverage is focused on high-value behavioral assertions.
- State management is simple and correct.
- CI pipeline enforces formatting, linting, type-checking, test + coverage
  thresholds, and fixture validation.
- No `innerHTML` usage with user/fixture data found.
- D3 access is centralized through `getD3()`.

---

## Recommended Next Steps (Priority Order)

1. **Unify undo/redo ownership** — Either builder service owns the full
   undo/redo cycle, or extract a focused undo orchestrator. Eliminate the split.
2. **Add historyService and reducer tests** — High value, low effort.
3. **Extract bootstrap inline logic** — Device-type grouping as a pure tested
   function. Keyboard shortcuts as a separate module.
4. **Introduce `BuilderStatsPort`** — Replace mutable shared object with
   explicit get/set contract.
5. **Narrow `State` string fields** — Use literal unions for `layoutKind`,
   `trafficVizKind`, `trafficSourceKind`.
6. **Consider controller-level integration tests** — Even lightweight tests
   for `loadNetwork` / error paths would catch regressions.
