# Agent Instructions — website01

This repo is a Deno + TypeScript static site (GitHub Pages) that visualizes
network topologies with D3: search, multi-select, shortest-path highlights, and
traffic styling.

## Non-negotiables (hard constraints)

- Target OS: Linux (CI runs ubuntu-latest).
- Tooling/runtime: Deno (CI pins v2.6.10).
- GitHub Pages must serve a working app as **static output** (no runtime
  TypeScript transpile on Pages).
- Do not merge changes that break: `deno task ci`.
- Direction: tighten TypeScript (reduce `any`/untyped `Record`, add explicit
  boundary types).

## Repo map (what is where)

- Dev server: `main.ts` (Deno.serve + static assets + TS transpile cache for
  local DX).
- Browser entry: `index.html` → `scripts/main.ts` (UI + state + wiring).
- Data loading: `scripts/dataLoader.ts`
- Graph render: `scripts/graph.ts`
- Graph algorithms: `scripts/graphLogic.ts`
- Layouts: `scripts/layouts/*` (force + tiered/layered)
- Traffic inputs: `scripts/trafficConnector.ts`
- Traffic visualization strategies: `scripts/trafficFlowVisualization/*`
- Static build: `tools/build_pages.ts` → outputs `dist/`
- Data fixtures: `data/networks/**`
- CI: `.github/workflows/ci.yml`
- Pages deploy: `.github/workflows/static.yml`

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

- Move shared types to `scripts/types.ts`.
- Move shared algorithms to `scripts/lib/*` (no DOM).
- Then reduce duplication and simplify callsites.

## Common anti-patterns (avoid)

- “TypeScript by assertion”: `as SomeType` without runtime proof at boundaries.
- Path traversal “string checks” for file serving. Use canonicalization +
  allowlisting.
- Duplicate graph traversal implementations in multiple modules.
