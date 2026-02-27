# Journey Benchmark Card v1.1

- Snapshot date: 2026-02-26
- Scope: post-fix snapshot after decoupling optional traffic startup failure
  from topology load teardown.
- Change evidence:
  - `scripts/app/controller.ts:389`-`scripts/app/controller.ts:393`
  - Validation run: `deno task test`, `deno task lint`, `deno task check`

## Delta vs v1

- Journey H moved from `Fail` -> `Partial`.
- Critical failure count moved from `1` -> `0`.
- Remaining gaps are `Partial` quality issues, not hard blockers.

## Overall Gate

- Status: `Provisional Open`
- Reason: no journey is currently rated `Fail`, but several journeys remain
  `Partial` and still require follow-up.

## Coverage Summary

- `Pass`: 1 / 10
- `Partial`: 9 / 10
- `Fail`: 0 / 10

## Journey Status (v1.1)

| Journey ID | Objective                                 | Complexity | v1 Status | v1.1 Status | Confidence |
| ---------- | ----------------------------------------- | ---------- | --------- | ----------- | ---------- |
| A          | Evaluate app value quickly                | L1         | Partial   | Partial     | Medium     |
| B          | Build first simple model                  | L1         | Partial   | Partial     | Medium     |
| C          | Understand next action with low ambiguity | L1         | Partial   | Partial     | Medium     |
| D          | Iterate and recover safely                | L2         | Partial   | Partial     | Medium     |
| E          | Import existing work and repair           | L2         | Partial   | Partial     | Medium     |
| F          | Analyze dependencies and impact           | L2         | Partial   | Partial     | Medium     |
| G          | Organize larger topologies                | L2         | Partial   | Partial     | Medium     |
| H          | Continue working during system issues     | L3         | Fail      | Partial     | Medium     |
| I          | Compare alternatives with low rework      | L3         | Partial   | Partial     | Medium     |
| J          | Persist/share for handoff                 | L3         | Pass      | Pass        | High       |

## What Improved

1. Journey H resilience:
   - Load path now uses `restartCurrentSource(...)`, which handles traffic
     startup failures without throwing through `loadNetwork(...)`.
   - Expected UX effect: optional traffic failure should no longer blank a
     successfully loaded topology.

## Remaining Top Blockers for v1.2

1. Complete selection interaction contract:
   - Wire marquee selection replacement path end-to-end.
2. Improve edit-loop responsiveness:
   - Replace remount-heavy custom refresh path with incremental updates.
3. Reduce recoverability risk:
   - Consolidate undo/redo ownership and add controller-level lifecycle tests.

## Notes on Confidence

- Journey H confidence is `Medium` (code-level evidence + full test suite
  green).
- A dedicated controller-level integration test for this exact failure mode is
  still missing.
