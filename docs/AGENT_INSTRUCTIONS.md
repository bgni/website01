# Agent Instructions — website01

This repo is a Deno + TypeScript static site (GitHub Pages) that visualizes
network topologies with D3: search, multi-select, shortest-path highlights, and
traffic styling.

Documentation index: `docs/README.md`. Agent docs hub: `docs/agent/README.md`.

For advanced architecture and delivery heuristics distilled from recent work,
see `docs/ideas/advanced-agent-lessons.md`.

## Non-negotiables (hard constraints)

- Target OS: Linux (CI runs ubuntu-latest).
- Tooling/runtime: Deno (CI pins v2.6.10).
- GitHub Pages must serve a working app as **static output** (no runtime
  TypeScript transpile on Pages).
- Do not merge changes that break: `deno task ci`.
- Direction: tighten TypeScript (reduce `any`/untyped `Record`, add explicit
  boundary types).
- Direction: keep boundaries explicit (DI for DOM + IO) and refactors mechanical
  (shims, minimal behavior change, CI stays green).

## Repo map (what is where)

- Dev server: `main.ts` (Deno.serve + static assets + TS transpile cache for
  local DX).
- Browser entry: `index.html` → `scripts/main.ts` (UI + state + wiring).
- App wiring/orchestration: `scripts/app/bootstrap.ts`,
  `scripts/app/controller.ts`
- Domain (typed boundaries + fixture parsing): `scripts/domain/*`
  - Load network: `scripts/domain/loadNetwork.ts`
  - Errors + runtime guards: `scripts/domain/errors.ts`
  - Core types: `scripts/domain/types.ts`
- Data loading shim (legacy import path): `scripts/dataLoader.ts`
- Graph API: `scripts/graph/graph.ts`
- Graph rendering: `scripts/graph/renderer.ts`
- Graph shim (legacy import path): `scripts/graph.ts`
- Graph algorithms: `scripts/graphLogic.ts`
- Layouts: `scripts/layouts/*` (force + tiered/layered)
- Traffic connectors + registry: `scripts/traffic/*`
- Traffic shim (legacy import path): `scripts/trafficConnector.ts`
- Traffic visualization strategies: `scripts/trafficFlowVisualization/*`
- D3 access (browser global wrapper): `scripts/lib/d3.ts`
- Static build: `tools/build_pages.ts` → outputs `dist/`
- Data fixtures: `data/networks/**`
- CI: `.github/workflows/ci.yml`
- Pages deploy: `.github/workflows/static.yml`

## Recent lessons (REVIEW5 direction)

- Prefer mechanical refactors over rewrites:
  - Move code in small steps, keep behavior stable.
  - Add shims to preserve import paths, then update call sites gradually.
- Make dependencies explicit:
  - No DOM querying in “logic” layers. Resolve DOM once in bootstrap, then
    inject.
  - Inject IO boundaries into controllers (loaders/fetch), with sensible
    defaults.
- Centralize global/browser dependencies:
  - D3 is loaded as a browser global; use `getD3()` from `scripts/lib/d3.ts`.
  - Avoid “implicit global” usage (`d3.*` without an explicit import).
- Responsive sizing:
  - Use `ResizeObserver` in the controller layer and call `graph.resize(...)`.
  - Renderer must not assume a hard-coded `#graph` selector.
- Keep commit history reviewable:
  - Split commits by subsystem (domain / traffic / graph / docs).
  - Prefer “shim first” commits (no behavior changes) where possible.

## Default workflow loop (do this every change)

1. Identify the “boundary” touched:
   - fixtures (`data/**`)
   - UI state/wiring (`scripts/main.ts`)
   - layout/render (`scripts/graph.ts`, `scripts/layouts/*`)
   - algorithms (`scripts/graphLogic.ts`)
   - traffic (`scripts/trafficConnector.ts`, `trafficFlowVisualization/*`)
   - build (`scripts/buildPages.ts`, workflows)

2. Make the smallest change that moves the needle.

3. Run the tight loop locally:
   - `deno task fmt`
   - `deno task lint`
   - `deno task check`
   - `deno task test`

4. If fixtures/layouts changed:
   - `deno task validate`
   - `deno task render:svgs`

5. Sanity-check the production artifact:
   - `deno task build:pages`
   - open `dist/index.html` via a static server (or reuse `main.ts` but point at
     `dist/`).

## Coding rules (guardrails)

### TypeScript rules (reduce bug risk)

- No new implicit `any`. Always type function parameters and exported return
  values.
- Prefer narrow _boundary types_ + runtime guards:
  - Loader outputs (`loadJson`, `loadData`) should not return `unknown` if the
    consumer expects a shape.
  - Define `Device`, `Connection`, `TrafficUpdate` in ONE place and import them.
- Prefer `Set<string>` / `Map<string, T>` over untyped `Set` / `Map`.

### DOM / security rules (browser)

- Do not use `innerHTML` for anything derived from:
  - fixtures (`data/**`)
  - user input (search)
  - URL params
- Prefer `textContent`, `setAttribute`, `document.createElement`, and DOM
  fragment assembly.
- If a CDN script is used, pin versions and add SRI; ideally vendor to
  `dist/vendor/`.

### Data fixture rules

- Device IDs and connection IDs must be stable strings.
- Connections must reference existing device IDs.
- Traffic updates must reference existing connection IDs.
- If adding new optional fields to fixtures, keep backwards compatibility.

### Determinism (important for reviewability)

- Layout algorithms must be deterministic given the same inputs (especially
  tiered layout).
- SVG renderer outputs must be stable across runs (or document why it changed).

## “Definition of Done” checklist for any PR

- `deno task ci` passes.
- `deno task build:pages` produces a working `dist/` and the Pages workflow
  uploads `dist/`.
- If fixtures changed: `deno task validate` passes.
- If layout/render changed: `deno task render:svgs` output diffs are
  explainable.
- No new `innerHTML` fed by fixture/user strings.
- No new broad permissions in tasks/workflows unless justified.

## Common patterns to follow

### Boundary typing pattern

- Parse/validate at boundary → carry typed objects inward.
- Example: `loadJson<T>(path, guard)` where `guard(v): v is T` and throw with
  actionable error.

### “Small safe refactor” pattern

- Move shared types to `scripts/domain/types.ts` (or the closest domain module).
- Move shared algorithms to `scripts/lib/*` (no DOM).
- Then reduce duplication and simplify callsites.

### “Explicit boundary” pattern

- Bootstrap resolves concrete environment details (DOM elements, URLs, storage).
- Controller coordinates behavior and lifecycle (observers, teardown), but
  should not reach out to the DOM by selector.
- Domain modules parse + validate fixtures into typed objects.
- Graph modules render into an injected SVG and expose a small API.

## Common anti-patterns (avoid)

- “TypeScript by assertion”: `as SomeType` without runtime proof at boundaries.
- Path traversal “string checks” for file serving. Use canonicalization +
  allowlisting.
- Duplicate graph traversal implementations in multiple modules.
