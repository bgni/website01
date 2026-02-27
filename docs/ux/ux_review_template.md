# UX Review Template (PR Section)

Use this template in PR notes for UX-impacting changes.

## UX Impact Summary

- User intent affected:
- Why this change exists:
- Contract commitments at risk:
  - [ ] Predictability
  - [ ] Spatial stability
  - [ ] Intent-first flow
  - [ ] Feedback/recovery
  - [ ] Responsiveness

## Interaction Contract (Before/After)

- Before:
- After:
- Behavior change category:
  - [ ] No semantic change (refactor only)
  - [ ] Minor semantic change
  - [ ] Major semantic change (explicit approval required)

## Risk Assessment

- Potential confusion risks:
- Muscle-memory risks:
- Regression risks:
- Mitigations implemented:

## First-Interaction Frame Scan (Required for Entry/Picker/Connect Changes)

Use: `docs/ux/gap_discovery_strategy.md`

| Frame    | User sees | User thinks | User feels | Risk score (SxLxD) | Notes |
| -------- | --------- | ----------- | ---------- | ------------------ | ----- |
| 1        |           |             |            |                    |       |
| 2        |           |             |            |                    |       |
| 3        |           |             |            |                    |       |
| 4        |           |             |            |                    |       |
| 5A or 5B |           |             |            |                    |       |
| 6A or 6B |           |             |            |                    |       |
| 7A or 7B |           |             |            |                    |       |
| 8A or 8B |           |             |            |                    |       |

## Benchmark Scorecard (1-5)

| Dimension               | Score | Notes |
| ----------------------- | ----- | ----- |
| Predictability          |       |       |
| Interaction consistency |       |       |
| Spatial stability       |       |       |
| Recoverability          |       |       |
| Feedback clarity        |       |       |
| Flow efficiency         |       |       |
| Responsiveness          |       |       |

## Required Scenario Results

| Scenario                                     | Pass/Fail | Notes |
| -------------------------------------------- | --------- | ----- |
| Create 5-device, 4-link topology             |           |       |
| Extend from selected node (add + connect)    |           |       |
| Undo/redo after mistaken delete              |           |       |
| Failed connect path with repair guidance     |           |       |
| Continue editing when optional traffic fails |           |       |
| Add first switch: generic intent             |           |       |
| Add first switch: specific model intent      |           |       |

## Journey Coverage Matrix

Use: `docs/ux/journey_review_matrix.md`

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

## Tradeoffs and Follow-up

- Accepted tradeoffs:
- User-value rationale:
- Mitigation plan:
- Follow-up review checkpoint/date:

## Final Gate Decision

- [ ] Ready to merge
- [ ] Blocked pending UX fixes
