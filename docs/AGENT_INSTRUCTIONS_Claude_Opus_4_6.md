# Agent Instructions — website01 (v3)

This repo is a Deno + TypeScript static site (GitHub Pages) that visualizes
network topologies with D3: search, multi-select, shortest-path highlights,
traffic styling, and a custom network builder with undo/redo.

Documentation index: `docs/README.md` Architecture heuristics:
`docs/ideas/advanced-agent-lessons.md` Code review (Feb 2026):
`docs/code-review-2026-02_Claude_Opus_4_6.md`

---

# Non-negotiables (hard constraints)

- Target OS: Linux (CI runs ubuntu-latest).
- Tooling/runtime: Deno (CI pins v2.6.10).
- GitHub Pages must serve a working app as **static output** (no runtime
  TypeScript transpile on Pages).
- Do not merge changes that break: `deno task ci`.
- Direction: tighten TypeScript (reduce `any`, remove untyped `Record`, add
  explicit boundary types).
- Direction: keep boundaries explicit (DI for DOM + IO via port contracts).
- Refactors must preserve behavior unless explicitly stated otherwise.

Behavior stability is mandatory. Architectural convergence is expected.

---

# Architectural Intent (Important)

The target structure is:

- **Composition root**

  - `scripts/main.ts`
  - `scripts/app/bootstrap.ts` — DOM resolution, dependency wiring, start.
    Inline logic (device-type grouping, keyboard shortcuts) should be extracted
    to tested modules over time.
- **Orchestration**

  - `scripts/app/controller.ts` (thin, lifecycle only)
- **Application services**

  - `scripts/app/builderService.ts` — builder commands. Deps via port contracts.
  - `scripts/app/trafficService.ts` — traffic connector lifecycle. Deps via port
    contracts.
  - `scripts/app/historyService.ts` — undo/redo snapshot stacks.
- **Port contracts**

  - `scripts/app/ports.ts` — shared DI boundary types consumed by services. All
    new service dependencies should be expressed as port types here.
- **State management**

  - `scripts/app/store.ts`, `actions.ts`, `reducers.ts`, `selectors.ts`,
    `types.ts`
- **Domain**

  - `scripts/domain/types.ts` — core types (`NetworkDevice`, `Connection`,
    `TrafficUpdate`, `DeviceType`).
  - `scripts/domain/fixtures.ts` — parse unknown JSON → typed with validation.
  - `scripts/domain/topology.ts` — normalize legacy data, cross-validate refs.
- **Infrastructure**

  - `scripts/graph/**` — D3 graph rendering.
  - `scripts/layouts/**` — force + tiered layout algorithms.
  - `scripts/traffic/**` — traffic connectors.
  - `scripts/trafficFlowVisualization/**` — visual strategies.
  - `scripts/lib/d3.ts` — centralized D3 access (`getD3()`).
- **Utilities**

  - `scripts/app/customBuilderUtils.ts` — pure builder helpers.
  - `scripts/app/customTopology.ts` — localStorage persistence, import/export.

Controller should orchestrate. Services should implement behavior. Domain should
validate boundaries. Infrastructure should render or perform side effects.

If logic exists in two places, consolidation is preferred over caution.

---

# Port Contract Pattern (Current Standard)

Services declare their dependencies as intersection types composing port
contracts from `ports.ts`:

```ts
// In ports.ts
export type BuilderGraphPort = { getGraphInstance: () => ...; refreshCustomGraph: () => void };
export type BuilderHistoryPort = { pushUndo: (s: Snapshot) => void; clear: () => void };

// In builderService.ts
type BuilderServiceDeps = { getState: ...; dispatch: ... } & BuilderGraphPort & BuilderHistoryPort;
```

**Rules:**

- New service deps must be expressed as named port types in `ports.ts`.
- Services must not import concrete implementations; they consume port
  contracts.
- Port types should be narrow (one concern each, ~2-5 methods max). Prefer many
  small ports over few wide ones.
- When adding a method that a service needs from the controller or
  infrastructure, add it to an existing port or create a new port — do not pass
  it as an ad-hoc function parameter.
- The controller (or bootstrap) satisfies port contracts when constructing
  services.

---

# Known Architectural Debt (Active Issues)

These are documented in `docs/code-review-2026-02_Claude_Opus_4_6.md` and should
be addressed in priority order:

1. **Undo/redo ownership is split** (P1) — `builderService` pushes undo
   snapshots via `deps.history.pushUndo()`, but `controller` owns
   `undoLastCustomEdit()` / `redoLastCustomEdit()` (calls `history.undo()`,
   pushes redo, calls `refreshCustomGraph`). This split makes undo/redo
   untestable without the controller and risks divergence.

   **Target:** Unify in one place. Either `builderService` owns `performUndo()`
   / `performRedo()` with a refresh callback, or extract a dedicated
   `UndoRedoController`.

2. **`builderStats` is a mutable shared reference** (P2) — Both controller and
   builderService mutate the same plain object. Replace with a
   `BuilderStatsPort` with `get()/set()` methods.

3. **Bootstrap inline logic** (P2) — Device-type grouping (~80 lines of array
   manipulation), keyboard shortcuts, and UI settings persistence are inline in
   `bootstrap.ts`. Extract to tested modules.

4. **Test coverage gaps** (P2) — No tests for: `controller.ts` (loadNetwork,
   undo/redo, mount/destroy), `historyService.ts`, `reducers.ts`,
   `customTopology.ts`, `selectors.ts`. Adding `historyService` and `reducers`
   tests is high-value and low-effort.

5. **`State` string fields** (P3) — `trafficSourceKind`, `trafficVizKind`,
   `layoutKind` are typed as `string`. Should be literal unions matching
   registry keys.

When working on any of these, check the review doc for detailed context.

---

# Refactor Policy (Critical Clarification)

This repo allows **large mechanical diffs** when behavior is unchanged.

## SAFE changes (even if large diff)

The following are safe if CI passes and behavior is preserved:

- Moving logic between modules.
- Introducing thin ports/adapters over existing implementations.
- Routing controller logic through an existing service.
- Deleting duplicate legacy implementations after adoption.
- Consolidating undo/history/builder logic into services.
- Splitting large files to reduce responsibility overlap.
- Renaming or reorganizing files for clarity.
- Adding port types to `ports.ts` and adopting them in services.

Extraction without adoption is incomplete work.

If a service exists but controller duplicates its behavior, the next PR should
wire through the service and delete the duplicate path.

## RISKY changes (require explicit intent)

These must not be done unless explicitly requested:

- Layout algorithm changes (tiering, determinism, force tuning).
- Shortest-path semantics changes.
- UX behavior changes (selection, search logic, keyboard behavior).
- Breaking fixture schema changes.
- Combining refactor + feature change in one PR.

Refactors must not change behavior.

---

# Repo Map (What Is Where)

## Dev server

- `main.ts` (Deno.serve + static assets + TS transpile cache for local DX)

## Browser entry

- `index.html` → `scripts/main.ts`

## App wiring / orchestration

- `scripts/app/bootstrap.ts` — composition root, DOM wiring
- `scripts/app/controller.ts` — lifecycle orchestration

## Application services

- `scripts/app/builderService.ts` — builder commands (well-tested)
- `scripts/app/trafficService.ts` — traffic connector lifecycle
- `scripts/app/historyService.ts` — undo/redo stacks

## Port contracts

- `scripts/app/ports.ts` — shared DI boundary types

## State management

- `scripts/app/store.ts`, `actions.ts`, `reducers.ts`, `selectors.ts`,
  `types.ts`

## Domain (typed boundaries + fixture parsing)

- `scripts/domain/types.ts` — core types
- `scripts/domain/fixtures.ts` — JSON → typed with validation
- `scripts/domain/topology.ts` — normalization, cross-validation

## Data loading shim (legacy import path)

- `scripts/dataLoader.ts`

## Graph

- API: `scripts/graph/graph.ts`
- Renderer: `scripts/graph/renderer.ts`
- Legacy shim: `scripts/graph.ts`
- Algorithms: `scripts/graphLogic.ts`

## Layouts

- `scripts/layouts/*` (force + tiered/layered)

## Traffic

- `scripts/traffic/*`
- Legacy shim: `scripts/trafficConnector.ts`
- Visualization strategies: `scripts/trafficFlowVisualization/*`

## D3 access

- `scripts/lib/d3.ts` (use `getD3()`, avoid implicit globals)

## Static build

- `tools/build_pages.ts` → outputs `dist/`

## Data fixtures

- `data/networks/**`

## Tests

- `scripts/app/builderService_test.ts` — 14 tests, builder commands
- `scripts/app/customBuilderUtils_test.ts` — 11 tests, pure utils
- `scripts/app/trafficService_test.ts` — 5 tests, traffic service
- `deviceCatalog_test.ts` — 6 tests, device catalog

---

# Default Workflow Loop (Mandatory)

1. Identify the boundary touched:

   - fixtures (`data/**`)
   - wiring (`scripts/main.ts`, `bootstrap.ts`)
   - orchestration (`controller.ts`)
   - services + ports
   - domain parsing/types
   - graph/layout
   - traffic
   - build

2. Make the smallest change that:

   - reduces duplication, or
   - clarifies boundaries, or
   - improves typing, or
   - adds missing test coverage.

3. Run locally:

   - `deno task fmt`
   - `deno task lint`
   - `deno task check`
   - `deno task test`

4. If fixtures/layout changed:

   - `deno task validate`
   - `deno task render:svgs`

5. If wiring/build changed:

   - `deno task build:pages`
   - Open `dist/index.html` via static server.

Do not proceed if any step fails.

---

# Coding Rules (Guardrails)

## TypeScript Rules

- No new implicit `any`.
- Exported functions must declare return types.
- Avoid `as SomeType` unless preceded by runtime validation.
- Prefer narrow boundary types + runtime guards.
- Prefer `Set<string>` / `Map<string, T>` over untyped collections.
- Define `Device`, `Connection`, `TrafficUpdate` in one place
  (`scripts/domain/types.ts`) and import them.
- Use string literal unions for kind/mode fields (not bare `string`).

JSON must be parsed as `unknown` and validated before use.

## Service & Port Rules

- Service dependencies must be typed as intersection of port contracts from
  `ports.ts`.
- Do not add ad-hoc function parameters to services; define a port type.
- Port types are narrow (one concern each, ~2-5 methods max).
- Services must not import concrete implementations. They receive deps at
  construction time.
- Do not duplicate service logic in the controller. If the controller needs
  behavior, delegate to a service.
- Mutable shared state (like `builderStats`) should be behind a port with
  explicit `get()/set()` methods, not passed as a raw object reference.

## Undo/Redo Rules

- Snapshot creation and restoration must be owned by the same module.
- Do not split push-undo and perform-undo across different modules.
- History stacks are bounded (currently max 20 snapshots).
- All undo/redo paths must be testable without DOM or graph dependencies.

---

## DOM / Security Rules

- Do not use `innerHTML` for anything derived from:

  - fixtures (`data/**`)
  - user input
  - URL params
- Prefer `textContent`, `setAttribute`, DOM assembly.
- CDN scripts must be pinned and ideally use SRI.
- Renderer must not assume hard-coded selectors.
- Bootstrap resolves DOM elements and passes them to renderers/controllers.

---

## Determinism (Reviewability Requirement)

- Layout algorithms must be deterministic given same inputs.
- Tiered layout especially must not depend on object iteration order.
- SVG outputs must be stable across runs (or diffs must be explainable).

Determinism changes count as risky.

---

## Data Fixture Rules

- Device IDs must be stable strings.
- Connections must reference existing device IDs.
- Traffic updates must reference existing connection IDs.
- Backwards compatibility required for optional fields.

Always run:

- `deno task validate`

---

# Testing Rules

## When to add tests

- **Always** when creating a new service or utility module.
- **Always** when extracting logic from controller or bootstrap.
- **Strongly preferred** when modifying existing service behavior.

## Test structure

- Test files live adjacent to their source: `scripts/app/fooService_test.ts`
  tests `scripts/app/fooService.ts`.
- Use Deno's built-in test runner (`Deno.test`).
- Use `@std/assert` for assertions.
- Create minimal stub/mock deps that satisfy port contracts rather than
  importing real implementations.
- Tests should be behavioral ("when I do X, Y happens"), not structural.

## Coverage

- CI enforces coverage thresholds (currently 39% line / 59% branch).
- When adding tests, prefer covering untested critical paths (controller
  loadNetwork, undo/redo, historyService, reducers) over increasing coverage on
  already-tested modules.

---

# Consolidation Rule (Anti-Stagnation)

Avoid "extract-only" PRs.

If:

- a service exists, and
- controller still contains equivalent logic,

Then:

- Route through the service.
- Delete duplicate logic in same PR.
- Keep behavior identical.
- Ensure CI passes.

Architectural convergence is a goal.

---

# Commit Strategy

- Split commits by subsystem (domain / traffic / graph / docs).
- Prefer "shim first" commits.
- Adoption commits may be large but must be behavior-preserving.
- Do not mix refactor and feature change.

---

# Definition of Done (PR)

- `deno task ci` passes.
- `deno task build:pages` produces working `dist/`.
- If fixtures changed: `deno task validate` passes.
- If layout/render changed: `deno task render:svgs` diffs are explainable.
- No new unsafe DOM usage.
- Duplication reduced or unchanged.
- Architecture direction improved or preserved.
- New/modified services have tests.
- Port contracts are used for service deps (no ad-hoc injection).

---

# Common Anti-Patterns (Avoid)

- Type assertions without runtime validation.
- Duplicate graph traversal logic across modules.
- Controller implementing business logic.
- Leaving both "old path" and "new path" active after extraction.
- Behavioral changes hidden inside refactors.
- Mutable shared objects passed between modules without a port contract.
- Split ownership of related operations (e.g., push-undo in service A,
  perform-undo in module B).
- Inline business logic in `bootstrap.ts`.
- Adding bare `string` types for fields that have a known finite set of values.
- Creating services without corresponding test files.

---

This file defines guardrails. It does not encourage timidity.

Behavior must remain stable. Architecture must steadily improve.
