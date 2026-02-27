# UX Gap Discovery Strategy

Purpose: identify and close high-impact UX gaps before they reach users,
especially in first-use and core edit flows.

This is the method for finding "unknown unknowns" in interaction quality.

## What This Solves

Past strategy work was strong on edit-loop quality but missed an early,
adoption-critical interaction. The fix is not "more tickets." The fix is a
repeatable discovery method that inspects user experience frame by frame.

## When To Run This

Run this process for any change that can alter:

- first-use or first-value flow,
- add-device picker/search/catalog ranking,
- add/connect/delete and selection semantics,
- feedback/recovery behavior,
- keyboard and accessibility behavior for core actions.

## Gap Discovery Loop (Required)

1. Pick one journey slice.
   - Start with the first likely interaction in the affected journey.
2. Break it into frames.
   - A frame is one user-visible UI state before the next meaningful action.
3. For each frame, capture:
   - what the user is seeing,
   - what the user is thinking,
   - what the user is feeling,
   - what action they are likely to take next.
4. Score risk on each frame.
   - Severity (1-5): impact if this frame fails.
   - Likelihood (1-5): chance of failure/confusion.
   - Detectability (1-5): how likely this failure escapes normal testing.
   - Risk score = `Severity x Likelihood x Detectability`.
5. Map each risk to a control.
   - requirement,
   - acceptance scenario,
   - metric,
   - owner.
6. Run scenario checks and collect evidence.
   - Use `docs/ux/tests/first_switch_discoverability_test.md` and
     `docs/ux-review-benchmark.md`.
7. Re-run the same frame sequence after changes.
   - No closure without before/after evidence.

## Risk Prioritization Thresholds

- `50+` (`P0`): stop-ship for affected changes.
- `30-49` (`P1`): must have mitigation in same milestone.
- `15-29` (`P2`): track with explicit owner/date.
- `<15` (`P3`): monitor.

## Risk Area Register

| Risk area                             | Failure signature                                     | Why it matters                          | Typical controls                                                       |
| ------------------------------------- | ----------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------- |
| Entry clarity and first value         | User cannot tell how to start editing quickly         | Abandonment risk in first minute        | Immediate edit entry affordance, visible example outcomes              |
| Picker discoverability                | First add shows overwhelming irrelevant list          | User assumes app lacks useful devices   | Curated default ranking, recognizable labels, category shortcuts       |
| Known-model retrieval                 | Specific model search returns noisy/ambiguous results | Trust loss for expert users             | Query relevance tuning, exact-match boost, unambiguous labels          |
| Connect flow semantics                | User cannot predict connect outcome                   | Core graph-edit confidence collapses    | Explicit connect affordances, duplicate-link policy, clear constraints |
| Constraint explanation                | Action fails without reason or repair path            | User repeats errors and churns          | Actionable failure copy, one-click repair suggestions                  |
| Selection model consistency           | Click/drag/marquee outcomes vary by context           | Muscle memory breaks                    | Stable selection grammar, state indicators                             |
| Spatial stability                     | Edits cause unexpected jumps/resets                   | User loses orientation                  | Preserve camera/positions, bounded layout changes                      |
| Recoverability                        | Undo/redo does not match intent                       | Users avoid experimentation             | Transactional history, intent-level undo labels                        |
| Performance and latency               | Core actions feel sticky or delayed                   | Flow interruption and frustration       | Incremental updates, latency budgets, instrumentation                  |
| Resilience to subsystem failures      | Optional subsystem issue blocks editing               | Reliability trust drops sharply         | Graceful degradation and non-blocking error handling                   |
| Accessibility and keyboard parity     | Core tasks require pointer-only precision             | Excludes workflows and increases effort | Keyboard path coverage, focus order, visible focus states              |
| Information architecture and language | Labels use internal taxonomy not user language        | Recognition over recall fails           | User-facing naming model and progressive disclosure                    |

## Frame-By-Frame Analysis: First Likely Interaction

Target journey slice: "Add first switch."

### Shared Entry Frames

| Frame                | User sees                                         | User thinks                     | User feels             | Likely next action    | Primary risk area             |
| -------------------- | ------------------------------------------------- | ------------------------------- | ---------------------- | --------------------- | ----------------------------- |
| 1. Open app          | Network view and top-level controls               | "Can this help me quickly?"     | Cautious               | Scan UI for edit path | Entry clarity and first value |
| 2. Find editing mode | `Create/Edit` control                             | "How do I start building?"      | Slightly uncertain     | Enter edit mode       | Entry clarity and first value |
| 3. Edit mode active  | Builder controls (`Add`, `Connect`, `Undo`, etc.) | "I need to add my first device" | Hopeful but evaluating | Click `Add`           | Interaction clarity           |
| 4. Add picker opens  | Device list and search UI                         | "Do I recognize what I need?"   | Decision pressure      | Scan visible options  | Picker discoverability        |

### Branch A: User Knows Exact Switch

| Frame                      | User sees                                     | User thinks                       | User feels            | Likely next action        | Primary risk area                     |
| -------------------------- | --------------------------------------------- | --------------------------------- | --------------------- | ------------------------- | ------------------------------------- |
| 5A. Search by model        | Search field and ranked results               | "Did it find my exact model?"     | Focused               | Enter model query         | Known-model retrieval                 |
| 6A. Evaluate result labels | Brand/model strings, maybe technical variants | "Is this the right SKU/model?"    | Careful               | Select one option         | Information architecture and language |
| 7A. Add selected device    | Node appears in graph                         | "Was it added where I expected?"  | Confirming            | Verify placement and name | Spatial stability                     |
| 8A. Continue workflow      | New node selected with next actions visible   | "Can I connect this immediately?" | Increasing confidence | Add/connect next device   | Connect flow semantics                |

### Branch B: User Wants "A Normal Switch"

| Frame                    | User sees                                | User thinks                             | User feels                  | Likely next action          | Primary risk area                     |
| ------------------------ | ---------------------------------------- | --------------------------------------- | --------------------------- | --------------------------- | ------------------------------------- |
| 5B. Scan without search  | Default list ordering and labels         | "Can I pick a normal switch right now?" | Impatient if list is opaque | Choose from visible options | Picker discoverability                |
| 6B. Assess practical fit | Recognizable brand + useful port context | "Will this match my real setup?"        | Pragmatic                   | Compare 1-3 options         | Information architecture and language |
| 7B. Pick one quickly     | Clear selection affordance               | "This looks good enough to start"       | Relief                      | Add the device              | Flow efficiency                       |
| 8B. Confirm utility      | Added node is usable and connectable     | "This app can model my network"         | Confidence or drop-off      | Continue building or exit   | First value and connect semantics     |

## Current-State Risk Hotspots (From Existing UX Baseline)

Use this as an initial priority map until fresh frame-run evidence is collected:

1. Frame 4 (`Add picker opens`) and 5B (`Scan without search`):
   - Highest abandonment risk if default list is not immediately recognizable.
2. Frame 6A (`Evaluate result labels`):
   - Mis-selection risk if known-model labels are ambiguous or overly technical.
3. Frame 7A/7B (`Add selected device` / `Pick one quickly`):
   - Confidence loss risk if placement/selection feedback feels unstable.
4. Frame 8A/8B (`Continue workflow` / `Confirm utility`):
   - Core trust risk if connect guidance and repair paths are unclear.

## What To Record In Review Artifacts

For each high-risk frame:

1. Risk score and rationale.
2. Observed evidence (manual run notes, screenshots, or test output).
3. Required mitigation mapped to:
   - strategy requirement,
   - acceptance scenario,
   - metric.
4. Follow-up owner and checkpoint.

## Definition Of Success

This process is working when:

- first-interaction risks are caught before merge,
- risk scores trend down across milestones,
- first-switch discoverability and connect confidence improve in benchmark runs,
- new UX regressions are found by the frame scan, not by end users.
