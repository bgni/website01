# AI Agent Playbook (Repo-specific)

This playbook is written for an AI coding agent (or a human using an agent)
working in this repo. It focuses on safe defaults, validation loops, and
repo-specific gotchas.

Documentation index: `docs/README.md`. Agent docs hub: `docs/agent/README.md`.

For architecture-level decision heuristics and anti-regression guidance, see
`docs/ideas/advanced-agent-lessons.md`.

## Non-negotiables

- **Target OS:** Linux only.
- **Runtime/tooling:** Deno (CI pins `v2.6.10`).
- **Quality gates:** do not merge changes that break `deno task ci`.
- **TypeScript direction:** keep moving toward strict typing; avoid adding new
  `any` unless there is a clear, documented reason.
- **GitHub Pages:** must host a working app (static output).

## Quickstart loop (the default workflow)

1. Understand the change:
   - Find the entrypoint(s): `index.html`, `scripts/main.ts`, `main.ts`.
   - Identify data dependencies under `data/`.
2. Make the smallest possible code change.
3. Run the tight validation loop locally:
   - `deno task fmt`
   - `deno task lint`
   - `deno task check`
   - `deno task test`
4. If fixtures/layouts changed:
   - `deno task validate`
   - `deno task render:svgs`

If any step fails, fix it before moving on.

## Project map (what to touch)

### Browser app

- Controller / state / DOM wiring: `scripts/main.ts`
- Data loading: `scripts/dataLoader.ts`
- Rendering: `scripts/graph.ts`
- Graph computations: `scripts/graphLogic.ts`
- Search helpers: `scripts/search.ts`
- Traffic sources: `scripts/trafficConnector.ts`
- Traffic styling: `scripts/trafficFlowVisualization/*`

### Server / dev workflow

- Dev server: `main.ts` (Deno serve + static file handling)
- Build scripts live in `scripts/`.

### Data fixtures

- Networks: `data/networks/<networkId>/devices.json`, `connections.json`, and
  traffic fixtures.
- Index: `data/networks/index.json`

## Safety and security rules (browser)

These are “don’t regress” rules.

- Prefer `textContent` over `innerHTML` for any string that originates from:
  - user input (search box)
  - fixtures (`data/**`)
  - URL params
- If you must use `innerHTML`, only do so with constant strings or with a
  sanitization story.
- Any time you add a new external script (CDN): pin it and consider SRI.

See `docs/data/netbox-catalog-loading.md` for build/runtime NetBox catalog
loading notes.

## TypeScript rules (strict direction)

### General

- Avoid implicit `any` parameters.
- Prefer narrow types at module boundaries:
  - `loadJson<T>(...)` rather than returning `any`
  - explicit return types for exported functions

### Domain types

This repo naturally revolves around a few core shapes:

- `Device` (id, name, role/type, optional NetBox enrichment fields)
- `Connection` (id + from/to ends)
- `TrafficUpdate` (connectionId + status/throughput/utilization)

When adding new fields:

- Keep JSON fixtures backwards compatible where possible.
- Centralize shared types instead of copy/pasting across many modules.

### D3 typing

D3 is loaded via a CDN script tag, so a global `d3` exists at runtime.

- Keep the “D3 global” typing shim small and explicit.
- Prefer typed wrappers instead of spreading `any` widely.

## Data fixtures: rules and validation

When editing or adding fixtures under `data/networks/**`:

- Device IDs and connection IDs must be stable strings.
- Connections must reference existing device IDs.
- Traffic fixtures must reference existing connection IDs.

Always run:

- `deno task validate`

If you changed the Layered/tiered layout behavior or device roles/sites:

- `deno task render:svgs` and review diffs in `docs/rendered/`.

## GitHub Pages expectations

Pages is static hosting.

Agent rule:

- Do not rely on `main.ts` (the Deno server) for production behavior.
- Any production deployment must be output files that a static web server can
  host.

If you are asked to “make Pages work”, your default approach should be:

1. Build TypeScript browser modules to JavaScript into `dist/`.
2. Copy required static assets into `dist/`.
3. Update `.github/workflows/static.yml` to upload `dist/`.

## PR hygiene (what to include / exclude)

- Keep PRs focused: 1 change theme per PR (typing cleanup _or_ Pages build _or_
  fixture changes).
- Avoid formatting or renaming unrelated files.
- Generated outputs (`docs/rendered/**`) should be handled consistently:
  - If the repo commits them, include the regenerated diffs.
  - If the repo doesn’t commit them, don’t add them “incidentally”.

## Debugging playbook

### `deno task check` fails

- Start at the first error and fix types at boundaries.
- Common hotspots:
  - `scripts/dataLoader.ts` (implicit any / unknown JSON)
  - `scripts/graphLogic.ts` (untyped adjacency/path structures)
  - `scripts/graph.ts` (D3 selections + link/node datum types)

### Browser loads but UI breaks

- Confirm `index.html` imports a JavaScript module when deployed.
- Use DevTools console to check:
  - network requests to `data/**`
  - module load failures / MIME types

### Fixture changes cause weird layout

- Run `deno task validate`.
- Regenerate SVGs and compare:
  - `deno task render:svgs`

## Definition of done (agent)

Before you stop:

- `deno task ci` passes.
- Any changed fixtures pass `deno task validate`.
- Pages deploy story is unchanged or improved.
- The change is minimal and aligned with strict TS direction.
