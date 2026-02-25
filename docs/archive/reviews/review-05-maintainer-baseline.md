# Codebase Review (Maintainers)

This document is a maintainer-focused evaluation of the repo as it exists today:
architecture, risks, and a prioritized set of improvements.

Assumptions (based on current direction):

- Linux is the only supported dev/CI target.
- Deno is the runtime + tooling (CI currently pins `v2.6.10`).
- TypeScript should trend toward _strict_ (make `deno check` meaningful).
- GitHub Pages should host a working app.

## Executive summary

What’s already good:

- Clear data-driven approach: `data/networks/<id>/*.json` fixtures are easy to
  inspect and extend.
- Deno-first workflow: tasks exist for dev, lint, typecheck, tests, fixture
  validation, and coverage.
- The visualization feature set is coherent (search, selection, shortest-path
  highlight, traffic styling).

Highest-impact gaps:

1. **GitHub Pages deploy is not a real “build”**: it uploads the repo as-is.
   This conflicts with “write TS, ship JS”.
2. **Type debt is concentrated in graph + loader**: `deno task check` must
   become a reliable gate.
3. **Reproducibility is weakened by `--no-lock`**: CI/dev results can drift over
   time.
4. **Security hardening is minimal** (CDN dependency, DOM injection surface, no
   CSP/SRI).

## Architecture map

### Runtime (browser)

- Entry: `index.html` loads D3 from a CDN and loads a module entrypoint under
  `scripts/`.
- Browser logic: `scripts/main.ts` coordinates loading, search, selection, and
  graph updates.
- Rendering: `scripts/graph.ts` and `scripts/graphLogic.ts` implement drawing
  and graph computations.
- Traffic: `scripts/trafficConnector.ts` fetches/simulates updates;
  `scripts/trafficFlowVisualization/*` styles links.

### Runtime (dev server)

- `main.ts` runs `Deno.serve(...)` and serves static assets.
- Current dev flow supports TypeScript modules via server-side transpile/caching
  (good for DX, but not the same as “production build”).

### Build-time / tooling scripts

- Fixture validation: `scripts/validateFixtures.ts`.
- Doc rendering: `scripts/renderNetworkSvgs.ts` produces deterministic SVGs.
- NetBox catalog generation: `scripts/buildNetboxCatalog.ts` parses YAML (see
  Security notes).

## Repo tour (what matters most)

- `deno.json`: tasks + import map.
- `data/`: canonical fixtures, treated as source-of-truth.
- `scripts/`: browser modules and build/validation utilities.
- `.github/workflows/ci.yml`: fmt/lint/check/test/coverage gates.
- `.github/workflows/static.yml`: Pages deploy (currently “upload everything”).

## Key issues and recommendations

### 1) Pages deploy: ship JS, not TS

**Problem**

GitHub Pages is a static host. It won’t run a Deno server, so it can’t transpile
`.ts` on request. Uploading the repo “as-is” means Pages will likely serve
TypeScript to browsers, which is not a supported web standard.

**Recommendation (Now)**

- Add a build step that outputs a `dist/` folder containing:
  - `index.html`
  - `styles.css`
  - `scripts/*.js` (compiled from `scripts/*.ts`)
  - `data/**` needed by the client
- Update the Pages workflow to upload `dist/` instead of `.`.

**Notes**

- Keep the dev server transpilation if it improves local DX, but treat it as
  dev-only.
- You don’t need a bundler to start: “compile per-module to `.js` preserving ESM
  imports” is enough.

### 2) Make `deno check` the “truth”

**Problem**

Right now, typecheck failures can be widespread and noisy, which weakens CI as a
signal.

**Recommendation (Now → Next)**

- Concentrate on typing boundaries that feed most of the code:
  - loader outputs (`loadJson`, `loadData`)
  - core domain types (`Device`, `Connection`, `TrafficUpdate`)
  - graph model (`NodeDatum`, `LinkDatum`)

Concretely:

- Make `scripts/dataLoader.ts` fully typed (function params and return types).
- Remove implicit-any in `scripts/graphLogic.ts` adjacency/path helpers.
- Align visualization types between `scripts/graph.ts` and
  `scripts/trafficFlowVisualization/types.ts`.

### 3) Improve dependency reproducibility (stop defaulting to `--no-lock`)

**Problem**

Most tasks use `--no-lock`, which disables Deno’s lockfile usage. This makes
“same commit” not necessarily “same dependency graph”.

**Recommendation (Next)**

- Introduce a `deno.lock` and remove `--no-lock` from CI tasks.
- If you want optional lockless local iteration, keep it as a separate task
  (e.g. `dev:nolock`).

### 4) Security posture: reduce browser attack surface

Current notes already acknowledge build-time YAML parsing risk in
`docs/archive/security-notes.md`.

Additional browser-side recommendations:

- Avoid `innerHTML` for any content derived from fixtures or user input; prefer
  `textContent` and DOM node construction.
- If using CDN scripts:
  - Pin versions.
  - Add Subresource Integrity (SRI) to `index.html`.
  - Consider a basic Content Security Policy (CSP) when hosting on Pages.

Threat model note: today the fixtures are committed and “trusted”, but the
easiest future foot-gun is turning fixtures into remotely fetched content.

### 5) Data integrity: put validation on the critical path

**Problem**

`deno task validate` exists but isn’t part of `deno task ci`.

**Recommendation (Now)**

- Add `deno task validate` to the `ci` task to prevent broken fixtures from
  shipping.
- If it becomes too strict/noisy, split it into `validate:strict` and
  `validate:warn` modes.

### 6) Keep docs outputs deterministic and reviewable

The SVG rendering approach (deterministic layouts + stable sorting) is a strong
idea.

Recommendation:

- Treat `docs/rendered/` as generated output:
  - Either commit it intentionally (to review diffs in PRs), or
  - Don’t commit it and generate it in CI/artifacts.

Pick one and document it (see “AI agent playbook”).

## Suggested “Now / Next / Later” plan

**Now (1–2 PRs)**

- Add a Pages build step producing `dist/` and deploy that.
- Make `deno task check` pass (focus on loader + graph + core types first).
- Add `deno task validate` into `deno task ci`.

**Next (a week of incremental cleanup)**

- Introduce `deno.lock`; remove `--no-lock` from CI.
- Reduce global `any` in browser typing shims; prefer narrow, typed wrappers.
- Consolidate domain types into a single `scripts/types.ts` (or similar) to
  reduce duplication.

**Later (optional hardening)**

- Replace build-time YAML parsing (already in `docs/archive/security-notes.md`).
- Add CSP/SRI for CDN dependencies, or vendor D3 locally.
- Consider packaging generated assets (catalog JSON, rendered SVGs) as release
  artifacts.

## Definition of done for maintainers

For a typical change (feature, refactor, or fixture update), “done” should mean:

- `deno task ci` passes locally and in CI.
- If fixtures changed: `deno task validate` passes.
- If rendering/layout changed: `deno task render:svgs` output is stable (diffs
  are explainable).
- GitHub Pages is still deployable and runs without a server.
