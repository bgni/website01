# Codebase Review — website01

This is a maintainer-focused review: current state, risks, and a prioritized
improvement plan with concrete examples.

## Current state (snapshot)

### What’s already strong

- Clear feature scope: topology + selection + shortest-path highlight + traffic
  styling.
- Static build exists and Pages deploy uploads `dist/` (correct direction).
- Layered/tiered layout exists and is deterministic-minded (role → tier
  mapping + overlap resolution).
- Repo includes security notes and an explicit desire to avoid YAML parsing at
  runtime.

### Where quality/risk issues concentrate

1. **Typing debt at module boundaries**:
   - `scripts/main.ts` defines ad-hoc `Device/Connection/...` shapes and carries
     a lot of `unknown` and untyped `Set/Map`.
   - `scripts/dataLoader.ts` returns `unknown` and later callers assume
     structure.
2. **DOM injection surfaces**:
   - `scripts/main.ts` uses `innerHTML` for cards and rows (even if fixtures are
     “trusted”, this is a future foot-gun).
3. **Reproducibility**:
   - Many tasks use `--no-lock`, so “same commit” can yield different dependency
     graphs over time.
4. **Dev server hardening**:
   - `main.ts` serves arbitrary filesystem paths with only superficial traversal
     checks.

The repo is already coherent, but it’s in the zone where **a few structural
changes will pay off massively** (types + boundary validation + DOM safety +
reproducible builds).

---

## High-impact recommendations (Now / Next / Later)

### NOW (1–3 PRs): make the repo harder to break

#### 1) Centralize domain types and tighten boundaries

**Problem**

- Multiple copies of `Device`, `Connection`, `TrafficUpdate` exist (or are
  inferred), and boundaries return `unknown`.

**Concrete changes**

- Add: `scripts/types.ts`
  - `export type Device = { id: string; name: string; role?: string; type?: string; brand?: string; model?: string; ports?: DevicePort[]; deviceTypeSlug?: string; site?: string; room_id?: string; ... }`
  - `export type Connection = { id: string; from: { deviceId: string; portId?: string }; to: { deviceId: string; portId?: string }; connectionType?: string }`
  - `export type TrafficUpdate = { connectionId: string; status?: "up" | "down"; rateMbps?: number; utilization?: number }`
- Update `scripts/main.ts`, `scripts/graph.ts`, `scripts/trafficConnector.ts` to
  import these types.
- Convert untyped collections:
  - `selected: Set<string>`
  - `trafficByConn: Map<string, TrafficUpdate>`

**Boundary validation**

- Change `loadJson()` to accept an optional validator:
  - `loadJson<T>(path: string, guard?: (v: unknown) => v is T): Promise<T>`
- In `loadData()`, validate fixtures:
  - devices array, connections array, traffic shape (array or timeline object).

Payoff: `deno task check` becomes meaningful and you stop shipping silent shape
drift.

#### 2) Remove `innerHTML` usage for fixture/user-derived strings

**Problem**

- `scripts/main.ts` builds HTML strings via template literals and assigns
  `innerHTML`.

**Concrete change pattern**

- Replace card construction with DOM assembly:
  - `const card = document.createElement("div")`
  - `title.textContent = d.name`
  - For the “thumb image”: create `img`, set `src`, handle error, etc.
- Replace search row templating similarly (`<tr>` + `<td>` elements with
  `textContent`).

Payoff: reduces XSS risk and makes the UI code easier to refactor safely.

#### 3) Put fixture validation on the critical path

**Problem**

- Validation exists (`deno task validate`) but should be treated as “must pass
  before shipping”.
- If it’s not already in `ci`, add it (or split strict vs warn modes).

**Concrete changes**

- Update `deno.json` `ci` task to include `validate` (or ensure it is included).
- Make validator errors actionable: include the exact JSON path and offending
  id.

Payoff: prevents broken demo data and makes fixture evolution safe.

#### 4) Dev server: prevent accidental file leakage

**Problem**

- `main.ts` serves `Deno.readFile(path)` for whatever `safePathFromUrl()`
  returns, with minimal checks.

**Concrete changes**

- Set an explicit web root (e.g. repo root, or `.` but with allowlist
  directories).
- Canonicalize and enforce containment:
  - `const abs = resolve(root, rel)`
  - `if (!abs.startsWith(root + sep)) 400`
- Deny hidden files and deny `.git`, `.github`, `deno.json`, etc. unless
  explicitly allowed.
- Consider serving only from
  `{ index.html, styles.css, scripts/**, data/**, vendor/** }`.

Payoff: reduces risk of leaking secrets locally and makes the server logic
correct-by-construction.

---

### NEXT (incremental cleanup): reproducibility + dedup + tests

#### 5) Stop defaulting to `--no-lock`

**Problem**

- The repo heavily uses `--no-lock`, weakening reproducibility.

**Concrete changes**

- Introduce `deno.lock` and remove `--no-lock` from:
  - `check`, `test`, `test:cov`, `coverage:check`, `build:*`, etc.
- Keep an optional dev convenience task:
  - `dev:nolock` if you want.

Payoff: deterministic CI and fewer “works on my machine” dependency issues.

#### 6) Remove duplicated graph traversal logic

**Problem**

- There’s traversal/shortest-path logic in `scripts/graphLogic.ts` and
  adjacency/path logic inside `scripts/trafficConnector.ts` (for flow behavior).

**Concrete changes**

- Create `scripts/lib/graph.ts`:
  - `buildAdjacency(connections)`
  - `findShortestPathNodes/Links(...)`
- Reuse from both modules.

Payoff: fewer subtle algorithm differences and fewer future bugs.

#### 7) Add tests where bugs are expensive

Current tests exist but coverage is likely concentrated.

Add:

- `graphLogic_test.ts`:
  - shortest path correctness
  - highlight set correctness (single selection vs multi)
- `tieredLayout_test.ts`:
  - determinism (same input → same positions)
  - tier inference rules (switch degree thresholds)
- `dataLoader_test.ts`:
  - type_slug → deviceTypeSlug mapping
  - fixture validation failures are readable

Payoff: safe refactors and confidence when adding new fixture fields.

---

### LATER (optional hardening / polish)

#### 8) CDN hardening and CSP

- If D3 is loaded from CDN:
  - pin version + add SRI
  - consider vendoring into `dist/vendor/`
- Add a basic CSP suitable for GitHub Pages static hosting.

#### 9) Replace build-time YAML parsing (already noted)

- Replace the YAML → JSON index generation with a non-JS converter (a small Rust
  binary is reasonable).
- Make the build hermetic (no network, pinned versions).

---

## Specific callouts and suggested refactors (examples)

### A) `scripts/main.ts` is doing too much

Symptoms:

- UI state, DOM manipulation, data loading, connector wiring, graph
  orchestration all in one file.

Refactor direction:

- `ui/selectedPanel.ts` (render selected list)
- `ui/searchDropdown.ts` (filter + paginate + table rows)
- `app/state.ts` (State type + reducer-like updates)
- Keep `main.ts` as composition glue.

This reduces cognitive load and makes targeted unit tests possible.

### B) Loader boundary: `loadData()` should be typed

Current behavior: returns
`{ devices: unknown, connections: unknown, traffic: unknown | undefined }`.

Refactor direction:

- Return `LoadDataResult<Device, Connection, TrafficPayload>` or just a typed
  `{ devices: Device[]; connections: Connection[]; traffic?: TrafficPayload }`
  after validation.

### C) `scripts/buildPages.ts` import rewriting is fragile

It currently does a regex `.ts` → `.js` for relative imports.

Hardening ideas:

- Add a test fixture under `scripts/` that includes tricky import cases.
- Fail the build if any `.ts` import remains in output.

---

## Practical “Do this first” PR plan

PR 1 (safety + correctness)

- Add `scripts/types.ts`
- Update all main modules to import shared types
- Replace untyped `Set/Map` with generics
- Replace `innerHTML` for fixture/user strings with DOM construction

PR 2 (reproducibility)

- Add `deno.lock`
- Remove `--no-lock` from CI tasks
- Ensure `ci` includes fixture validation

PR 3 (dev server hardening + dedup)

- Harden `main.ts` file serving with canonicalization + allowlist
- Deduplicate adjacency/path helpers into `scripts/lib/graph.ts`
- Add 3–5 unit tests for algorithms + tiered layout determinism

---

## Acceptance criteria for maintainers

A change is “done” when:

- `deno task ci` passes locally and in CI.
- `deno task build:pages` produces a working `dist/`.
- If fixtures change: validation passes and errors (if any) are actionable.
- If render/layout changes: SVG diffs are explainable.
- No new `innerHTML` fed by fixture/user strings.
- No new broad permissions in tasks/workflows without justification.
