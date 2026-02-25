# Agent Instructions — website01 (v2)

This repo is a Deno + TypeScript static site (GitHub Pages) that visualizes
network topologies with D3: search, multi-select, shortest-path highlights, and
traffic styling.

Documentation index: `docs/README.md` Agent docs hub: `docs/agent/README.md`
Architecture heuristics: `docs/ideas/advanced-agent-lessons.md`

---

# Non-negotiables (hard constraints)

- Target OS: Linux (CI runs ubuntu-latest).
- Tooling/runtime: Deno (CI pins v2.6.10).
- GitHub Pages must serve a working app as **static output** (no runtime
  TypeScript transpile on Pages).
- Do not merge changes that break: `deno task ci`.
- Direction: tighten TypeScript (reduce `any`, remove untyped `Record`, add
  explicit boundary types).
- Direction: keep boundaries explicit (DI for DOM + IO).
- Refactors must preserve behavior unless explicitly stated otherwise.

Behavior stability is mandatory. Architectural convergence is expected.

---

# Architectural Intent (Important)

The target structure is:

- **Composition root**

  - `scripts/main.ts`
  - `scripts/app/bootstrap.ts`
- **Orchestration**

  - `scripts/app/controller.ts` (thin, lifecycle only)
- **Application services**

  - `scripts/app/*Service.ts`
- **Domain**

  - `scripts/domain/*`
- **Infrastructure**

  - `scripts/graph/**`
  - `scripts/layouts/**`
  - `scripts/traffic/**`

Controller should orchestrate. Services should implement behavior. Domain should
validate boundaries. Infrastructure should render or perform side effects.

If logic exists in two places, consolidation is preferred over caution.

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

- `scripts/app/bootstrap.ts`
- `scripts/app/controller.ts`

## Application services

- `scripts/app/*Service.ts`

## Domain (typed boundaries + fixture parsing)

- `scripts/domain/loadNetwork.ts`
- `scripts/domain/errors.ts`
- `scripts/domain/types.ts`

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

---

# Default Workflow Loop (Mandatory)

1. Identify the boundary touched:

   - fixtures (`data/**`)
   - wiring (`scripts/main.ts`, `bootstrap.ts`)
   - orchestration (`controller.ts`)
   - services
   - domain parsing/types
   - graph/layout
   - traffic
   - build

2. Make the smallest change that:

   - reduces duplication, or
   - clarifies boundaries, or
   - improves typing.

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
- Define `Device`, `Connection`, `TrafficUpdate` in one place and import them.

JSON must be parsed as `unknown` and validated before use.

---

## DOM / Security Rules

- Do not use `innerHTML` for anything derived from:

  - fixtures (`data/**`)
  - user input
  - URL params
- Prefer `textContent`, `setAttribute`, DOM assembly.
- CDN scripts must be pinned and ideally use SRI.
- Renderer must not assume hard-coded selectors.

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

# Consolidation Rule (Anti-Stagnation)

Avoid “extract-only” PRs.

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
- Prefer “shim first” commits.
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

---

# Common Anti-Patterns (Avoid)

- Type assertions without runtime validation.
- Duplicate graph traversal logic across modules.
- Controller implementing business logic.
- Leaving both “old path” and “new path” active after extraction.
- Behavioral changes hidden inside refactors.

---

This file defines guardrails. It does not encourage timidity.

Behavior must remain stable. Architecture must steadily improve.
