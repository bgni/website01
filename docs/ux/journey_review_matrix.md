# Journey Review Matrix

Purpose: provide a reusable, structured UX review matrix for PRs that affect
user behavior.

This matrix complements benchmark scoring by showing whether each key journey is
improving, regressing, or unchanged.

## Status Scale

- `Pass`: journey objective is supported with no major blockers.
- `Partial`: usable but friction/risk remains significant.
- `Fail`: objective is not reliably achievable.
- `Not tested`: not evaluated in this change.

## How to Use in PRs

1. Copy the template table below into PR notes.
2. Mark affected journeys only (others can stay `Not tested`).
3. Add concrete evidence (manual run notes, tests, or code references).
4. If any journey regresses to `Fail`, treat as blocked unless explicitly
   accepted tradeoff.

## PR Matrix Template

| Journey ID | Objective                                 | Complexity | Status | Evidence | Notes |
| ---------- | ----------------------------------------- | ---------- | ------ | -------- | ----- |
| A          | Evaluate app value quickly                | L1         |        |          |       |
| B          | Build first simple model                  | L1         |        |          |       |
| C          | Understand next action with low ambiguity | L1         |        |          |       |
| D          | Iterate and recover safely                | L2         |        |          |       |
| E          | Import existing work and repair           | L2         |        |          |       |
| F          | Analyze dependencies and impact           | L2         |        |          |       |
| G          | Organize larger topologies                | L2         |        |          |       |
| H          | Continue working during system issues     | L3         |        |          |       |
| I          | Compare alternatives with low rework      | L3         |        |          |       |
| J          | Persist/share for handoff                 | L3         |        |          |       |

## Baseline Snapshot (2026-02-26)

Source: `docs/ux/user_journeys_current_state.md` and
`docs/ux/ux_review_baseline.md`.

| Journey ID | Objective                                 | Complexity | Baseline status | Notes                                                           |
| ---------- | ----------------------------------------- | ---------- | --------------- | --------------------------------------------------------------- |
| A          | Evaluate app value quickly                | L1         | Partial         | Good first impression, but edge-path trust drops.               |
| B          | Build first simple model                  | L1         | Partial         | Core flow works; responsiveness concerns remain.                |
| C          | Understand next action with low ambiguity | L1         | Partial         | Control/status clarity is good; selection contract incomplete.  |
| D          | Iterate and recover safely                | L2         | Partial         | Undo/redo works; ownership split + remount path create risk.    |
| E          | Import existing work and repair           | L2         | Partial         | Import/validation exists; repair guidance can improve.          |
| F          | Analyze dependencies and impact           | L2         | Partial         | Highlighting exists; selection consistency limits confidence.   |
| G          | Organize larger topologies                | L2         | Partial         | Grouping primitives exist; large-map ergonomics still limited.  |
| H          | Continue working during system issues     | L3         | Fail            | Traffic startup failure can clear graph during load.            |
| I          | Compare alternatives with low rework      | L3         | Partial         | Possible via manual export/import; no first-class compare flow. |
| J          | Persist/share for handoff                 | L3         | Pass            | Durable local save and JSON portability are in place.           |

## Current Snapshot (v1.1, 2026-02-26)

Source: `docs/ux/journey_benchmark_card_v1_1.md`.

| Journey ID | Objective                                 | Complexity | Current status | Notes                                                   |
| ---------- | ----------------------------------------- | ---------- | -------------- | ------------------------------------------------------- |
| A          | Evaluate app value quickly                | L1         | Partial        | Unchanged vs baseline.                                  |
| B          | Build first simple model                  | L1         | Partial        | Unchanged vs baseline.                                  |
| C          | Understand next action with low ambiguity | L1         | Partial        | Unchanged vs baseline.                                  |
| D          | Iterate and recover safely                | L2         | Partial        | Unchanged vs baseline.                                  |
| E          | Import existing work and repair           | L2         | Partial        | Unchanged vs baseline.                                  |
| F          | Analyze dependencies and impact           | L2         | Partial        | Unchanged vs baseline.                                  |
| G          | Organize larger topologies                | L2         | Partial        | Unchanged vs baseline.                                  |
| H          | Continue working during system issues     | L3         | Partial        | Improved from `Fail` after traffic-load decoupling fix. |
| I          | Compare alternatives with low rework      | L3         | Partial        | Unchanged vs baseline.                                  |
| J          | Persist/share for handoff                 | L3         | Pass           | Unchanged vs baseline.                                  |

## Relationship to Other UX Docs

- Latest quick status card: `docs/ux/journey_benchmark_card_v1_1.md`
- Current quick status card: `docs/ux/journey_benchmark_card_v1.md`
- Story source: `docs/ux/job_stories.md`
- Journey analysis: `docs/ux/user_journeys_current_state.md`
- Review benchmark: `docs/ux-review-benchmark.md`
- PR section template: `docs/ux/ux_review_template.md`
