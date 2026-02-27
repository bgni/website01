# UX Review Benchmark (Continuous Quality Gate)

## Intent

Use this benchmark as the UX equivalent of automated tests for any change that
can affect user behavior.

This is not a one-time checklist and not a ticket-closure proxy. It is a
continuous quality control loop.

## Scope: When This Is Required

Run a structured UX review when a change affects any of:

- selection, add/connect/delete, undo/redo flows,
- layout/camera/position continuity,
- control/shortcut behavior,
- interaction feedback and error handling,
- edit-loop performance or responsiveness.
- add-device picker discoverability and search behavior.
- first-interaction and first-value experience.

## North-Star UX Goal

Enable users to build and modify network maps with confidence and momentum:

- predictable interactions,
- low correction cost,
- stable spatial context,
- fast and recoverable workflows.

## Structured Review Format (Required)

Every UX-impacting PR must include a short "UX impact" section containing:

1. User intent affected.
   - Example: "extend topology from selected node quickly."

2. Interaction contract before/after.
   - What changed in behavior, not implementation details.

3. Risk assessment.
   - What could confuse users, regress muscle memory, or increase correction
     work.

4. Benchmark scorecard.
   - Score each dimension 1-5 and justify briefly.

5. Scenario results.
   - Run required scenarios and note pass/fail + observations.

6. First-interaction frame scan (for entry/picker/connect changes).
   - Capture what users are seeing, thinking, and feeling frame by frame.
   - Use `docs/ux/gap_discovery_strategy.md`.

## Benchmark Dimensions

Score each 1 (poor) to 5 (excellent):

1. Predictability.
   - Does the system do what users expect from the same input?

2. Interaction consistency.
   - Are gesture/keyboard semantics stable across contexts?

3. Spatial stability.
   - Do local edits preserve camera and object permanence?

4. Recoverability.
   - Can users undo mistakes quickly and reliably?

5. Feedback clarity.
   - Are success/failure states explicit and actionable?

6. Flow efficiency.
   - Are common tasks low-friction with minimal unnecessary steps?

7. Responsiveness.
   - Does the edit loop feel immediate under typical workloads?

## Required Scenarios

Run these for UX-impacting changes:

1. Create 5-device, 4-link topology from scratch.
2. Extend from selected node (add + connect flow).
3. Undo/redo after mistaken delete.
4. Failed connect path with repair guidance.
5. Continue editing when optional traffic source fails.
6. Add first switch via generic intent ("normal switch", no prior model recall).
7. Add first switch via specific intent (known model lookup).

## Gate Policy

Changes should not merge if either is true:

- Any required scenario fails without accepted rationale.
- Any benchmark dimension drops materially vs baseline without accepted
  tradeoff.

Accepted tradeoffs must include:

- explicit user-value rationale,
- mitigation plan,
- and follow-up review checkpoint.

## Progress Model (How We Improve Over Time)

Do not treat UX as "fixed."

Track trend, not closure:

- benchmark scores over time,
- scenario pass consistency,
- observed correction patterns,
- latency trends in edit actions.

A release is healthy when the trend is stable or improving, not when a finite
set of tickets is empty.

## Gap Discovery Pass (Required For Entry/Picker/Connect Work)

Before merge, run the frame-by-frame gap discovery loop in
`docs/ux/gap_discovery_strategy.md`:

1. Analyze the first likely interaction frame by frame.
2. Score frame risks and identify `P0`/`P1` gaps.
3. Map each high-risk gap to requirement, scenario, and metric.
4. Re-run the same frames after change and compare.

## Relationship to Existing Docs

- User intent contract: `docs/ux/user_intent_and_experience_contract.md`
- Quick sanity pass: `docs/ux/sanity_checklist.md`
- PR notes template: `docs/ux/ux_review_template.md`
- First-switch UX test: `docs/ux/tests/first_switch_discoverability_test.md`
- Journey coverage matrix: `docs/ux/journey_review_matrix.md`
- Latest benchmark card: `docs/ux/journey_benchmark_card_v1_1.md`
- Current benchmark card: `docs/ux/journey_benchmark_card_v1.md`
- Baseline snapshot: `docs/ux/ux_review_baseline.md`
- Gap discovery strategy: `docs/ux/gap_discovery_strategy.md`
- Strategy source: `docs/ideas/graph_editor_usability_strategy.md`
- Execution plan: `docs/network-map-editing-plan.md`
- Workflow guardrails: `docs/AGENT_INSTRUCTIONS.md`
