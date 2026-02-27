# Network Map Editing Plan

## Goal

Make network map editing reliable, fast, and enjoyable for repeated real-world
use.

## North-Star Outcomes

- Editing never corrupts topology state.
- Undo/redo is predictable and trustworthy.
- Network map remains visible/usable even when traffic source fails.
- Frequent edit actions feel immediate and smooth.
- Common tasks require fewer clicks and less mode confusion.

## Phase 1: Reliability Foundation (P0)

1. Unify undo/redo ownership.
   - Move snapshot push + restore into one owner module.
   - Add unit tests for history transitions and integration tests for undo/redo
     from controller entrypoints.

2. Decouple topology load from traffic startup failures.
   - Keep graph mounted when traffic connector start fails.
   - Show explicit degraded-mode status (topology loaded, traffic unavailable).

3. Encapsulate mutable builder shared state.
   - Replace direct shared `builderStats` object mutation with explicit port
     accessors.

Exit criteria:

- Undo/redo behavior is tested and deterministic.
- Loading a broken traffic source still shows the topology.

## Phase 2: Editing Performance and Continuity (P0/P1)

1. Reduce full remounts on edit operations.
   - Introduce incremental graph update methods for add/remove/update
     device/connection flows.
   - Keep viewport and selection continuity by default.

2. Add performance guardrails.
   - Record baseline times for add/connect/delete/undo on small and medium
     topologies.
   - Regressions above threshold fail review.

Exit criteria:

- Repeated edits no longer trigger unnecessary full graph teardown/rebuild.
- Edit interactions remain smooth under realistic topology sizes.

## Phase 3: Interaction Ergonomics (P1)

1. Extract and improve device-type picker logic.
   - Move grouping/ranking/search logic out of `bootstrap.ts` into pure tested
     module.
   - Improve ranking with “recent + frequent + search relevance.”

2. Improve direct editing workflows.
   - Add clearer connect/delete affordances for selected nodes.
   - Add quick duplicate and quick-add-at-cursor flows.
   - Ensure keyboard shortcuts are consistent and discoverable.

3. Reduce mode confusion.
   - Clarify create/edit mode state in UI and action availability.
   - Prevent invalid action attempts with explicit feedback.

Exit criteria:

- Core editing tasks are faster and require fewer error-prone steps.
- Users can discover and use shortcuts confidently.

## Phase 4: Delight and Confidence (P2)

1. UX polish.
   - Add subtle motion/feedback for successful edit actions.
   - Improve status messaging (what happened, what to do next).

2. Scenario-level validation.
   - Define editing acceptance scenarios (build from scratch, refactor an
     existing map, recover from mistakes).
   - Add repeatable manual + automated checks for those scenarios.

Exit criteria:

- Editing experience feels intentional and pleasant, not just functional.
- Scenario checklist passes consistently before release.

## Immediate Next PR Sequence

1. Undo/redo ownership consolidation + tests.
2. Load-network resilience to traffic failure.
3. `builderStats` port encapsulation.
4. Extract bootstrap device-type grouping to tested module.
5. Incremental graph update API for custom edits.
