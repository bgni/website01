# UX Review Baseline

- Last reviewed: 2026-02-26
- Reviewer: GPT-5 Codex
- Evidence scope: code inspection + existing unit tests (`deno task test`)

## Findings (Ordered by Severity)

1. `P1` Traffic startup failures can blank the graph during network load.
   - `loadNetwork()` mounts the graph, then awaits traffic startup in the same
     `try` block (`scripts/app/controller.ts:387`,
     `scripts/app/controller.ts:389`).
   - Any traffic startup error drops into catch and destroys graph state
     (`scripts/app/controller.ts:392`, `scripts/app/controller.ts:394`).
   - UX impact: violates "continue editing/working when optional traffic fails."

2. `P1` Marquee selection is implemented in renderer but not wired to app state.
   - Renderer computes selected ids and calls optional callback
     (`scripts/graph/renderer.ts:268`, `scripts/graph/renderer.ts:277`).
   - Controller `createGraph(...)` does not pass `onSelectionReplaced`
     (`scripts/app/controller.ts:273`-`scripts/app/controller.ts:280`).
   - UX impact: drag-select interaction can appear but not produce selection
     updates, causing confusion and predictability regressions.

3. `P1` Every custom edit still uses full graph teardown/remount.
   - `refreshCustomGraph()` dispatches topology, destroys graph, mounts again
     (`scripts/app/controller.ts:308`, `scripts/app/controller.ts:314`,
     `scripts/app/controller.ts:315`).
   - UX impact: avoidable jank risk and weaker edit-loop responsiveness at
     moderate graph size.

4. `P2` Undo/redo ownership is split across layers.
   - Snapshot creation/push is initiated in builder service
     (`scripts/app/builderService.ts:77`-`scripts/app/builderService.ts:79`).
   - Undo/redo stack transitions and apply logic live in controller
     (`scripts/app/controller.ts:477`-`scripts/app/controller.ts:533`).
   - UX impact: higher regression risk for recoverability semantics over time.

5. `P2` UX-critical orchestration coverage is thin.
   - Current tests focus on builder utilities/service and traffic service:
     `scripts/app/builderService_test.ts`,
     `scripts/app/customBuilderUtils_test.ts`,
     `scripts/app/trafficService_test.ts`.
   - No controller-level tests currently guard lifecycle/error paths in
     `scripts/app/controller.ts`.
   - UX impact: interaction/lifecycle regressions likely to be detected late.

## UX Impact Summary

- User intent affected:
  - Extend and refine topology quickly without losing context.
  - Keep working when telemetry/traffic subsystems are degraded.
- Why this review exists:
  - Establish a benchmark baseline before iterative UX improvements.
- Contract commitments at risk:
  - [x] Predictability
  - [x] Spatial stability
  - [x] Intent-first flow
  - [x] Feedback/recovery
  - [x] Responsiveness

## Interaction Contract (Before/After)

- Before:
  - No changes in this review (baseline snapshot).
- After:
  - No behavior change (assessment only).
- Behavior change category:
  - [x] No semantic change (refactor only)
  - [ ] Minor semantic change
  - [ ] Major semantic change (explicit approval required)

## Risk Assessment

- Potential confusion risks:
  - Drag-select affordance may not produce expected selection outcome.
  - Graph can disappear on traffic startup failure during load.
- Muscle-memory risks:
  - Any future fix to marquee/pan arbitration must preserve existing pan/zoom
    expectations.
- Regression risks:
  - Full remount edit path can introduce subtle state/viewport regressions under
    frequent edits.
- Mitigations already present:
  - Viewport/position preservation snapshot is implemented for custom refresh
    (`scripts/app/controller.ts:302`-`scripts/app/controller.ts:306`,
    `scripts/app/controller.ts:315`).
  - Builder flows provide explicit status text on failed actions
    (`scripts/app/builderService.ts:317`-`scripts/app/builderService.ts:349`).

## Benchmark Scorecard (1-5)

| Dimension               | Score | Notes                                                                                     |
| ----------------------- | ----- | ----------------------------------------------------------------------------------------- |
| Predictability          | 2     | Marquee-selection path not wired; traffic failure can blank graph on load.                |
| Interaction consistency | 3     | Core click/select/connect flows are stable, but multi-select drag contract is incomplete. |
| Spatial stability       | 3     | Position/viewport preservation exists, but remount-per-edit raises movement/jank risk.    |
| Recoverability          | 3     | Undo/redo is available and labeled, but ownership split increases long-term fragility.    |
| Feedback clarity        | 4     | Status messaging is explicit for most add/connect/delete error paths.                     |
| Flow efficiency         | 3     | Auto-connect and smart add help, but extra correction work remains in some paths.         |
| Responsiveness          | 2     | Full destroy/mount on custom edits is a known performance cliff risk.                     |

## Required Scenario Results

| Scenario                                     | Pass/Fail | Notes                                                                                                                                                                                  |
| -------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create 5-device, 4-link topology             | Pass      | Supported by builder service paths/tests; not yet validated by controller/UI integration test.                                                                                         |
| Extend from selected node (add + connect)    | Pass      | Implemented in add flow with auto-connect + fallback messaging (`scripts/app/builderService.ts:164`-`scripts/app/builderService.ts:203`).                                              |
| Undo/redo after mistaken delete              | Pass      | Implemented and discoverable via toolbar + shortcuts (`scripts/app/controller.ts:477`-`scripts/app/controller.ts:533`, `scripts/app/bootstrap.ts:423`-`scripts/app/bootstrap.ts:442`). |
| Failed connect path with repair guidance     | Pass      | Clear error status text on incompatible/no-port flows (`scripts/app/builderService.ts:345`-`scripts/app/builderService.ts:349`).                                                       |
| Continue editing when optional traffic fails | Fail      | Network load catch path tears down graph on traffic startup error (`scripts/app/controller.ts:389`-`scripts/app/controller.ts:395`).                                                   |

## Tradeoffs and Follow-up

- Accepted tradeoffs:
  - None for the `P1` issues above.
- User-value rationale:
  - Confidence and continuity in editing must take precedence over optional
    telemetry startup.
- Mitigation plan:
  - Decouple traffic startup failure from topology mount lifecycle.
  - Wire `onSelectionReplaced` into store updates with explicit selection
    semantics.
  - Replace remount-heavy edit refresh path with incremental graph updates.
- Follow-up review checkpoint/date:
  - After implementing the three mitigations above.

## Final Gate Decision

- [ ] Ready to merge
- [x] Blocked pending UX fixes
