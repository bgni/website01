# UX Strategy Gap Review

- Review date: 2026-02-26
- Reviewer: GPT-5 Codex
- Scope: strategy quality and coverage, not code implementation details
- Evidence:
  - `docs/ideas/graph_editor_usability_strategy.md`
  - `docs/ideas/network_builder_user_journey.md`
  - `docs/ideas/network_builder_workflow.md`
  - `docs/persona.md`
  - `docs/ux/user_intent_and_experience_contract.md`
  - `docs/ux-review-benchmark.md`

## Findings (Ordered by Severity)

1. `P0` Historical omission of first-significant interaction (first switch
   discoverability) indicates strategy coverage failure at the journey entry
   point.
   - Why this is severe:
     - If first interaction fails, users may never reach the rest of the edit
       loop.
   - Evidence of original bias:
     - Strategy concentrated on in-canvas edit mechanics and lifecycle
       reliability (`interaction`, `history`, `spatial`, `feedback`) without an
       explicit first-object discovery requirement in earlier iterations.
     - Discoverability work was framed later in fluency phase:
       `docs/ideas/graph_editor_usability_strategy.md:194`.
     - Persona and workflow already required low-friction first creation:
       `docs/persona.md:22`, `docs/ideas/network_builder_workflow.md:8`,
       `docs/ideas/network_builder_workflow.md:34`.
   - Root cause:
     - Strategy synthesis over-weighted mid-loop correctness and under-weighted
       pre-loop adoption friction.
     - No mandatory completeness check was enforcing "first-value" and
       "first-object" journey coverage.
   - Current status:
     - Partially corrected by new guardrail and scenarios:
       `docs/ideas/graph_editor_usability_strategy.md:113`,
       `docs/ideas/graph_editor_usability_strategy.md:138`.

2. `P1` Connecting-network-devices strategy is still under-specified for common
   real-world ambiguity and correction patterns.
   - Why this matters:
     - Connect flows are core to graph editing confidence and speed.
   - Coverage today:
     - Connect intent exists at grammar level:
       `docs/ideas/graph_editor_usability_strategy.md:57`.
     - Constraint tiers exist, but connect-specific policy is abstract:
       `docs/ideas/graph_editor_usability_strategy.md:67`.
   - Remaining gaps:
     - No explicit strategy for duplicate links between same device pair.
     - No explicit strategy for port exhaustion beyond generic "failed connect."
     - No explicit strategy for quick repair affordances after failed connect
       (for example, suggested alternative device/port).
     - No explicit "connect then recover" scenario with multiple consecutive
       mistakes (compound correction behavior).

3. `P1` First-switch discoverability now exists as scenario coverage, but lacks
   dedicated quantitative metrics in the strategy metrics set.
   - Evidence:
     - Scenarios added: `docs/ideas/graph_editor_usability_strategy.md:138`.
     - Metrics list still has no dedicated first-switch discovery metric:
       `docs/ideas/graph_editor_usability_strategy.md:145`.
   - Risk:
     - Pass/fail can become subjective without trendable measurements.

4. `P1` Strategy phase sequencing still implies discoverability is a later
   fluency item, conflicting with adoption-critical reality.
   - Evidence:
     - Picker discoverability currently placed in Phase 3:
       `docs/ideas/graph_editor_usability_strategy.md:194`.
   - Risk:
     - Teams may deprioritize entry-friction fixes behind later-stage polish.

5. `P2` Strategy lacks explicit accessibility and keyboard-only acceptance
   scenarios for builder-critical tasks.
   - Evidence:
     - Keyboard rule exists only as a guard against conflicts:
       `docs/ideas/graph_editor_usability_strategy.md:63`.
     - No acceptance scenarios for keyboard-only add/connect/search/undo.
   - Risk:
     - Interaction quality can regress for non-pointer workflows without
       detection.

6. `P2` Strategy does not explicitly define a doc-consistency contract between
   persona/workflow/journey docs and strategy scenarios.
   - Evidence:
     - Related docs are listed:
       `docs/ideas/graph_editor_usability_strategy.md:220`.
     - No required crosswalk process is defined.
   - Risk:
     - Important needs can exist in supporting docs without entering the
       benchmark gate in time.

## Why the First-Interaction Gap Happened

This was not one missing bullet. It was a strategy-shape problem:

1. Entry vs loop imbalance:
   - The strategy was strong on "once user is editing" quality, weaker on "can
     user start editing with confidence immediately."

2. Principle-to-scenario translation lag:
   - "Recognition over recall" was present as principle
     (`docs/ideas/graph_editor_usability_strategy.md:25`), but was not converted
     into a required first-device scenario early enough.

3. Phase placement bias:
   - Discoverability was treated as fluency optimization (Phase 3) rather than
     adoption-critical requirement.

4. Missing completeness gate:
   - Until recently, there was no explicit guardrail requiring coverage of
     first-value and first-object journeys in strategy revisions.

## Additional High-Value Gaps to Close Next

1. Connect-flow requirements:
   - Add explicit requirements for:
     - duplicate-connection handling,
     - no-compatible-port repair path,
     - consecutive connect/delete/connect recoverability.

2. Discoverability metrics:
   - Add at least:
     - Time to first switch added (generic intent).
     - Time to specific switch added (known model intent).
     - Picker abandonment rate before first add.
     - Search-to-add success rate for known model queries.

3. Phase realignment:
   - Move picker discoverability and first-object retrieval into Trust/Phase 1
     exit criteria.

4. Accessibility coverage:
   - Add acceptance scenarios for keyboard-only:
     - enter builder,
     - choose/add device,
     - connect selected,
     - undo/redo.

5. Strategy consistency check:
   - Add a required crosswalk table:
     - `persona/workflow/journey need` -> `strategy requirement` ->
       `acceptance scenario` -> `metric`.

## Recommended Immediate Actions

1. Update strategy metrics section with first-switch and search-to-add metrics.
2. Update Phase 1 done criteria to include first-switch discoverability pass.
3. Add three connect-specific acceptance scenarios (duplicate, exhaustion,
   repair).
4. Add keyboard-only acceptance scenario set for builder essentials.
5. Add a crosswalk checklist section in strategy to prevent doc-to-gate drift.

## Bottom Line

Your concern is valid. The issue was not "no strategy"; it was "incomplete
strategy coverage at the journey entry point."

The new guardrails are a strong correction, but the strategy is still missing
critical depth in connection-flow specificity, discoverability metrics, and
accessibility acceptance coverage.
