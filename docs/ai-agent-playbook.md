# AI Agent Playbook (Repo-specific, v2)

This playbook is written for an AI coding agent (or a human using an agent)
working in this repo.

It optimizes for:

- Behavior stability
- Architectural convergence (less duplication, clearer boundaries)
- CI-green incrementalism
- Strict TypeScript direction

Documentation index: `docs/README.md`. Agent docs hub: `docs/agent/README.md`.
Architecture heuristics: `docs/ideas/advanced-agent-lessons.md`.

---

# Non-negotiables

- **Target OS:** Linux only.
- **Runtime/tooling:** Deno (CI pins `v2.6.10`).
- **Quality gates:** do not merge changes that break `deno task ci`.
- **TypeScript direction:** reduce implicit `any`; prefer explicit boundary
  types + guards.
- **GitHub Pages:** must host a working app as static output (`dist/`).

Never bypass CI. Never rely on the Deno dev server (`main.ts`) for production
behavior.

---

# Core Architectural Intent

The long-term direction of the repo is:

- Clear boundaries between:

  - Composition root
  - Orchestration (controller)
  - Application services
  - Domain
  - Infrastructure (graph/layout/traffic)
- Deterministic rendering
- Strict typing at module boundaries
- No duplicated logic across layers

If a service exists, the controller should delegate to it. If logic exists in
two places, consolidation is preferred over caution.

---

# Refactor Policy (Critical)

The previous bias toward “smallest change possible” can cause architectural
stagnation. This repo allows large mechanical diffs when behavior is preserved.

## SAFE changes (allowed even if large diff)

The following are considered safe if behavior remains identical and CI passes:

- Moving logic between modules.
- Introducing thin ports/adapters over existing modules.
- Routing controller logic through existing services.
- Deleting duplicate legacy implementations after adoption.
- Consolidating undo/history/builder logic into dedicated services.
- Renaming or restructuring files to reduce architectural confusion.

Adoption PRs (wire → delete old path) are encouraged.

If a service already exists but the controller duplicates its behavior, the next
PR should route through the service and delete the duplicate path.

## RISKY changes (require explicit intent)

These are not allowed unless explicitly requested:

- Layout algorithm changes (tiering, determinism, force behavior).
- Shortest path semantics changes.
- UX behavior changes (selection semantics, search logic, keyboard behavior).
- Fixture schema breaking changes.
- Combining refactor + feature work in the same PR.

Refactors must not change behavior.

---

# Default Workflow Loop

Every change must follow this loop:

1. Identify the boundary touched:

   - fixtures (`data/**`)
   - browser entry/wiring (`scripts/main.ts`, `bootstrap.ts`)
   - orchestration (`controller.ts`)
   - application services (`*Service.ts`)
   - domain parsing/types (`scripts/domain/**`)
   - graph/layout (`scripts/graph/**`, `scripts/layouts/**`)
   - traffic (`scripts/traffic/**`)
   - build (`tools/**`, workflows)

2. Make the smallest change that:

   - reduces duplication, or
   - improves typing, or
   - clarifies boundaries.

3. Run:

   - `deno task fmt`
   - `deno task lint`
   - `deno task check`
   - `deno task test`

4. If fixtures/layout changed:

   - `deno task validate`
   - `deno task render:svgs` (review diffs)

5. If wiring/build changed:

   - `deno task build:pages`
   - Serve `dist/` statically and verify `dist/index.html` works.

Do not proceed while any step fails.

---

# Project Map (Mental Model)

## Composition Root

- `scripts/main.ts`
- `scripts/app/bootstrap.ts`

Resolves DOM, environment, and concrete implementations.

## Orchestration

- `scripts/app/controller.ts`

Controller coordinates lifecycle and observers. Controller should not implement
business logic.

Target state: controller is thin.

## Application Services

- `scripts/app/*Service.ts`

Builder, history, traffic orchestration, etc.

Services contain use-case logic and must not query DOM by selector.

## Domain

- `scripts/domain/*`

Parsing, runtime guards, types, and errors.

JSON must be validated at boundaries before being trusted.

## Infrastructure

- `scripts/graph/**`
- `scripts/layouts/**`
- `scripts/traffic/**`
- `scripts/trafficFlowVisualization/**`

Graph rendering and layout must be deterministic.

---

# Architectural Rules

## No Duplicate Logic

If logic exists in both:

- controller and service
- graph and controller
- two different modules

The next PR should consolidate and delete the duplicate path.

Extraction without adoption is incomplete work.

---

## Ports and Adapters (Preferred Pattern)

When decoupling orchestration from infrastructure:

- Introduce a minimal interface (port).
- Wrap existing implementation in an adapter.
- Route through the port.
- Delete direct imports from controller.

Do not over-engineer ports. Define only the methods needed today.

---

# TypeScript Rules (Strict Direction)

## General

- No new implicit `any`.
- All exported functions must declare return types.
- Avoid `as SomeType` unless preceded by runtime validation.
- Prefer `Map<string, T>` / `Set<string>` over untyped collections.

## JSON Loading

Always:

1. Load as `unknown`
2. Validate via runtime guard
3. Convert to typed domain object
4. Throw typed error if invalid

Never trust fixture shape implicitly.

## Domain Types

Core shapes:

- `Device`
- `Connection`
- `TrafficUpdate`

When adding fields:

- Keep fixtures backwards compatible.
- Centralize shared types in one place.
- Do not duplicate type definitions across modules.

---

# Browser Safety Rules

Never use `innerHTML` with:

- Fixture strings (`data/**`)
- User input (search)
- URL params

Use:

- `textContent`
- DOM creation APIs
- Attribute setters

CDN scripts must be pinned and ideally versioned with SRI.

---

# Determinism Requirements

- Tiered/layered layout must be deterministic.
- SVG outputs should be stable across runs.
- If determinism changes, treat as risky and document.

---

# Data Fixture Rules

When editing under `data/networks/**`:

- Device IDs must be stable strings.
- Connections must reference valid device IDs.
- Traffic updates must reference valid connection IDs.

Always run:

- `deno task validate`

If layout-affecting fields changed:

- `deno task render:svgs`
- Review `docs/rendered/` diffs.

---

# GitHub Pages Rules

Pages is static hosting.

Production must:

- Build to `dist/`
- Contain transpiled browser JS
- Not depend on `main.ts` server behavior

If Pages breaks, default solution:

1. Build TS modules to JS in `dist/`
2. Copy required assets
3. Ensure workflow uploads `dist/`

---

# PR Hygiene

- One theme per PR (refactor OR typing OR fixture OR build).
- Avoid unrelated renames or formatting.
- Large mechanical diffs are acceptable if behavior-preserving.
- Do not mix refactor and feature change.

If consolidating duplicate logic:

- Delete old path in same PR.
- Ensure CI passes.
- Smoke-test build output.

---

# Debugging Playbook

## `deno task check` fails

Fix the first type error.

Common hotspots:

- `scripts/dataLoader.ts`
- `scripts/graphLogic.ts`
- D3 selection typing in `scripts/graph.ts`

Do not silence errors with `any`.

---

## Browser loads but UI breaks

Check:

- `index.html` imports correct module
- `dist/` contains transpiled JS
- DevTools console for module load errors
- Network requests to `data/**`

If wiring changed, rebuild `dist/`.

---

## Layout behaves strangely

- Run `deno task validate`
- Regenerate SVGs
- Inspect diffs
- Verify deterministic ordering assumptions

---

# Definition of Done (Agent)

Before stopping:

- `deno task ci` passes.
- `deno task build:pages` produces a working `dist/`.
- Fixture changes pass `deno task validate`.
- Layout changes have reviewed SVG diffs.
- No unsafe DOM patterns introduced.
- Duplication has not increased.
- Architectural direction improved or preserved.

---

This playbook prioritizes convergence over timidity.

Behavior must remain stable. Architecture must steadily improve.
