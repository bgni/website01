# Journey Benchmark Card v1

- Snapshot date: 2026-02-26
- Scope: current app baseline (no new behavior changes in this card)
- Source evidence:
  - `docs/ux/ux_review_baseline.md`
  - `docs/ux/user_journeys_current_state.md`
  - `docs/ux/journey_review_matrix.md`

## Overall Gate

- Status: `Blocked`
- Reason: one `L3` critical journey remains `Fail` (Journey H).

## Coverage Summary

- `Pass`: 1 / 10
- `Partial`: 8 / 10
- `Fail`: 1 / 10

## Journey Status (v1)

| Journey ID | Objective                                 | Complexity | v1 Status | Confidence |
| ---------- | ----------------------------------------- | ---------- | --------- | ---------- |
| A          | Evaluate app value quickly                | L1         | Partial   | Medium     |
| B          | Build first simple model                  | L1         | Partial   | Medium     |
| C          | Understand next action with low ambiguity | L1         | Partial   | Medium     |
| D          | Iterate and recover safely                | L2         | Partial   | Medium     |
| E          | Import existing work and repair           | L2         | Partial   | Medium     |
| F          | Analyze dependencies and impact           | L2         | Partial   | Medium     |
| G          | Organize larger topologies                | L2         | Partial   | Medium     |
| H          | Continue working during system issues     | L3         | Fail      | High       |
| I          | Compare alternatives with low rework      | L3         | Partial   | Medium     |
| J          | Persist/share for handoff                 | L3         | Pass      | High       |

## Top Blockers to Reach v2

1. Fix Journey H fail:
   - Decouple optional traffic startup failures from topology visibility.
2. Improve predictability:
   - Complete marquee/selection replacement wiring.
3. Improve responsiveness:
   - Replace remount-heavy custom edit path with incremental updates.

## v2 Exit Criteria

- Journey H moves from `Fail` to at least `Partial`.
- No journey regresses vs v1.
- At least two `L1/L2` journeys improve from `Partial` to `Pass`.
- Re-run benchmark + matrix with evidence in PR notes.

## Next Review Trigger

- Immediately after shipping fixes for the three `P1` baseline items.
