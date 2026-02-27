# Code Review — website01 (2026-02-26, GPT-5 Codex)

## Findings (highest severity first)

1. `P1` Non-deterministic CI/build inputs (`--no-lock` + range imports)
   - Evidence: `deno.json:3-17` runs core tasks with `--no-lock`; imports
     include ranges like `@std/fs@^1.0.10` and `@std/path@^1.0.8`
     (`deno.json:22-24`).
   - Impact: reproducibility and supply-chain stability are weaker than they
     need to be; CI can change behavior without repo changes.
   - Recommendation: enforce lockfile in CI/build/test flows and pin dependency
     versions tightly.

2. `P1` Network load is coupled to traffic startup; telemetry failure can blank
   the graph
   - Evidence: `controller.loadNetwork()` mounts graph, then awaits traffic
     start (`scripts/app/controller.ts:387-391`), and on any error tears down
     graph (`scripts/app/controller.ts:393-395`).
   - Supporting path: default connector path loads traffic via
     `loadJson(trafficPath)` (`scripts/traffic/registry.ts:123-125`), where
     `loadJson` throws on non-OK (`scripts/domain/loadNetwork.ts:6-9`).
   - Impact: traffic source/config failure can prevent topology viewing.
   - Recommendation: treat traffic startup failure as non-fatal for topology
     load; keep graph mounted and surface degraded-mode status.

3. `P1` Undo/redo ownership is still split across modules
   - Evidence: builder operations push undo snapshots
     (`scripts/app/builderService.ts:77-79`,
     `scripts/app/builderService.ts:158`), while undo/redo execution and redo
     push live in controller (`scripts/app/controller.ts:477-533`).
   - Impact: behavior is harder to reason about and harder to test without
     controller-level integration tests.
   - Recommendation: move full undo/redo cycle into one owner (builder/history
     service) and keep controller as delegator.

4. `P2` Critical orchestration remains lightly tested
   - Evidence: only three app test files exist
     (`scripts/app/builderService_test.ts`,
     `scripts/app/customBuilderUtils_test.ts`,
     `scripts/app/trafficService_test.ts`); no tests for
     controller/bootstrap/history/reducers/selectors/customTopology
     orchestration paths.
   - Coverage state from current run: 43.9% line / 61.9% branch (passes
     thresholds, but leaves major orchestration surfaces untested).
   - Impact: regressions in lifecycle/wiring paths are likely to escape unit
     tests.
   - Recommendation: add targeted tests for `historyService`, `reducers`,
     `customTopology`, then controller integration tests (`loadNetwork`,
     undo/redo, failure paths).

5. `P2` Type boundaries are still loose in core app state
   - Evidence: kind fields are unbounded strings (`scripts/app/types.ts:23-25`),
     and domain entities keep broad index signatures
     (`scripts/domain/types.ts:10`, `scripts/domain/types.ts:49`,
     `scripts/domain/types.ts:62`, `scripts/domain/types.ts:70`).
   - Impact: invalid values can flow through compile-time checks; review burden
     stays high.
   - Recommendation: move `layoutKind` / `trafficSourceKind` / `trafficVizKind`
     to literal unions derived from registries, then tighten domain optional
     fields incrementally.

6. `P3` Documentation drift is now a practical maintenance risk
   - Evidence: `docs/archive/controller_review.md:7` describes controller-owned
     undo stacks that no longer exist in current code.
   - Impact: stale architecture claims can misdirect future AI/maintainer
     changes.
   - Recommendation: mark stale docs as superseded or archive with explicit
     "historical snapshot" headers.

## Current Quality Snapshot

- `deno task lint`: pass
- `deno task check`: pass
- `deno task test`: pass (36/36)
- `deno task test:cov && deno task coverage:check`: pass (43.9% line, 61.9%
  branch)
- `deno task validate`: pass (6 networks)
- `deno task build:pages`: pass
- `deno task ci`: fails in current workspace due markdown formatting in docs
  files

## Direction Assessment

The app is heading in the right direction: service extraction, port-based seams,
deterministic layout work, and fixture validation are all real progress. The
main risk is not architecture intent; it is convergence speed on remaining
orchestration debt (controller/bootstrap centralization, split undo ownership,
and test gaps in lifecycle paths).
