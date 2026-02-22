# Development retrospective

This document summarizes the development process for this repo’s evolution from a simple topology demo into a modular, multi-network, traffic-aware visualization with optional NetBox device-type enrichment.

## Goals (what we were trying to achieve)
- A topology-first visualization (D3 force layout) that stays usable as the dataset grows.
- Operator-friendly workflows: quick search, multi-select, and shortest-path highlighting to understand blast radius.
- Traffic-aware link styling and “connectors” so we can evolve from static fixtures → generated → timeline → real telemetry without reworking the UI.
- A maintainable data model: multiple fixtures, a network switcher, and device instance data kept minimal.

## Major decisions and why we made them

### 1) Multiple network fixtures under `data/networks/<id>/...`
**Decision:** Move from a single hard-coded dataset to a registry (`data/networks/index.json`) and multiple per-network folders.

**Why:**
- Makes demos, tests, and iteration faster (swap scenarios without code edits).
- Avoids a “one giant JSON” anti-pattern as datasets grow.
- Enables comparing different topologies (office vs campus vs datacenter) with the same UI.

**Trade-off:** Slightly more structure to learn; requires consistent path logic in loaders.

### 2) Network switcher driven by an index file
**Decision:** Populate the network selector from `data/networks/index.json`.

**Why:**
- Keeps the UI generic: adding a network is data-only.
- Provides a single “default network” source of truth.

**Trade-off:** Loader/UI must handle missing networks gracefully.

### 3) NetBox enrichment as build-time JSON → runtime merge
**Decision:** Keep `devices.json` instances minimal and optionally enrich them at runtime via a generated JSON index (`data/netbox-device-types.json`) rather than parsing YAML in the browser.

**Why:**
- Browser YAML parsing adds weight and complexity; JSON is predictable and fast.
- Avoids shipping a YAML parser to the runtime.
- Preserves a clean separation:
  - device *instances* (IDs, names, roles, positions)
  - device *types* (ports, physical metadata)

**Trade-off:** Requires a build step to generate the JSON index when the NetBox library changes.

### 4) Strict `type_slug` / `deviceTypeSlug` format (`Manufacturer/ModelFileBase`)
**Decision:** Enforce a strict slug naming convention.

**Why:**
- Makes mapping deterministic and cacheable.
- Reduces ambiguity and “best guess” behavior.

**Trade-off:** Requires consistent authoring of fixture data; incorrect slugs should fail loudly.

### 5) Traffic connectors + multiple visualization modes
**Decision:** Implement a connector abstraction (static, generated, timeline, real/polling) and separate visualization strategies (classic, utilization-width, flow-dashes).

**Why:**
- Keeps the graph rendering stable while allowing telemetry sources to evolve.
- Makes performance and UX tuning easier (swap viz logic without rewriting connectors).

**Trade-off:** More moving parts; needs clear conventions for per-network config files.

### 6) Deno for dev/test tooling
**Decision:** Standardize on Deno tasks/tests for the repo.

**Why:**
- Single toolchain for scripts + tests.
- Simple task runner (`deno.json`) and fast iteration.

**Trade-off:** Some contributors are more familiar with Node; browser-module testing needs deliberate setup.

### 7) Hygiene decisions (what we removed/ignored)
- Ignored `catalog/` as unused prototype material.
- Ignored `.vscode/` to avoid committing machine-specific editor config.
- Removed legacy top-level fixture files (`data/*.json`) once the `data/networks/` structure was stable.
- Moved “ideas” docs into `docs/ideas/` to keep conceptual sketches together.

## What worked well

### Incremental iteration with real artifacts
- Adding multiple fixtures early exposed assumptions in layout, selection, and styling.
- The network switcher made validation fast: we could verify behavior across scenarios.

### Separation of concerns
- Connectors vs visualization modes reduced coupling.
- Instance vs type enrichment kept fixtures readable and reduced duplication.

### Commit hygiene (when we used it)
- Splitting work into logical commits made review and rollback safer.
- Keeping “generated/build artifacts vs runtime” boundaries clear prevented accidental bloat.

### Tests were fast and ran often
- Deno tests were quick, which encouraged running them repeatedly.

## What didn’t work as well

### A key runtime module wasn’t covered by tests
- `scripts/dataLoader.js` briefly became corrupted while refactoring; tests still passed because they didn’t import that file.

**Lesson:** “Green tests” can still miss runtime breakage if coverage doesn’t reflect production entrypoints.

### Path/fixture refactors are easy to get subtly wrong
- Removing the old `data/*.json` fixtures required chasing down leftover references across loaders and UI.

**Lesson:** Centralize path construction and add a small smoke test that loads a network end-to-end.

### Tooling drift during migration
- Old Node/Jest artifacts lingered for a while, which made the workspace feel inconsistent.

**Lesson:** When migrating tooling, aim to remove/disable the old path in the same PR (or explicitly document the transition).

## Lessons learned (actionable)

### Add a minimal browser-entry “smoke test”
- A Deno test that imports the same modules the browser uses and validates that the default network loads without throwing.
- Even a simple test that checks `loadData({ basePath })` returns arrays would have caught the loader corruption.

### Add lightweight static checks
- A formatter/linter step (even optional) would reduce accidental syntax issues in browser JS.
- Consider a pre-commit hook that runs `deno task test`.

### Keep “single source of truth” for paths
- Prefer a shared helper like `getNetworkBasePath(networkId)` used everywhere.
- Avoid any remaining “if legacy path then …” branches once migration is complete.

### Make build vs runtime boundaries explicit
- Generated artifacts (`data/netbox-device-types.json`) should be clearly described in docs.
- When the submodule updates, the build step should be obvious and repeatable.

## How we could move faster next time (what you can do)

### Provide crisp acceptance criteria and priority
Examples that help a lot:
- “Must-have vs nice-to-have” list (especially for UX).
- One default scenario to optimize for (e.g., small-office first) plus one stress-case (e.g., datacenter).

### Share constraints early
- Preferred toolchain (Deno only vs mixed) and whether Node is allowed.
- Whether external CDN use (D3 from jsDelivr) is acceptable long-term.

### Supply representative fixture samples sooner
- A couple of realistic topologies with known quirks (loops, redundant links, down links).
- A small but realistic traffic timeline that includes outages and bursts.

### Faster feedback loops on UX
- Quick screenshots or “this feels wrong/right” notes after trying the UI.
- Calling out what matters most (e.g., selection behavior, search ergonomics, link styling semantics).

### Decide commit strategy up front
- If you want “reviewable slices,” say so early; it changes how we group changes and tests.

## Open follow-ups (optional)
- Add a smoke test that loads `data/networks/index.json` and the default network’s `devices.json`/`connections.json`.
- Expand README to describe `deno task dev`, the network registry, and NetBox build step.
