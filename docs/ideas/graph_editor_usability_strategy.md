# Graph/Diagram Editor Usability Strategy

## Why Graph Editors Are Hard

Graph editors fail when they optimize for data structure correctness but ignore
human spatial reasoning. Users are not editing adjacency lists; they are editing
mental models.

The strategy must balance five systems at once:

1. Interaction system (click/drag/select/connect grammar).
2. Graph semantics (valid topology constraints).
3. Spatial system (layout, camera, object permanence).
4. History system (undo/redo and recoverability).
5. Feedback system (what changed, why, and what to do next).

If one system is weak, the entire editor feels unreliable.

## Evidence-Informed Design Foundations

These principles are repeatedly validated in HCI work and production-grade
diagram tools:

- Direct manipulation beats command-heavy flows for topology sketching.
- Recognition beats recall: users should see possible actions and constraints,
  not remember hidden rules.
- Progressive disclosure: quick defaults first, detail later.
- Forgiving interfaces: reversible actions and graceful failure paths.
- Latency expectations matter:
  - under ~100 ms feels immediate,
  - around 1 s breaks flow,
  - above 10 s requires explicit progress handling.
- Spatial stability is a primary trust signal in node-link interfaces.

## High-Value Anti-Pattern Library

| Anti-pattern           | Typical symptom                                 | Root cause                              | Corrective strategy                                                              |
| ---------------------- | ----------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------- |
| Mode errors            | “Why did that click connect instead of select?” | Hidden or sticky modes                  | Make tools explicit, prefer transient/quasi-modes, show active mode persistently |
| Spatial thrash         | Nodes jump after small edits                    | Global recompute tied to local mutation | Separate edit mutation from layout recompute; use local relaxation only          |
| Undo distrust          | Undo doesn’t match user expectation             | Mixed ownership, non-atomic actions     | Single history owner and clear transaction boundaries                            |
| Invisible constraints  | “It won’t connect but I don’t know why”         | Validation happens late or silently     | Real-time affordances + explicit failure reasons + suggested fix                 |
| Precision tax          | Too many manual port/type steps                 | Defaults not intent-aware               | Auto-connect and auto-placement with post-action refinement                      |
| Interaction collisions | Pan/select/drag interfere                       | Undefined gesture arbitration           | Explicit pointer grammar and hit-target hierarchy                                |
| Performance cliffs     | Editor feels sticky above moderate graph size   | Full redraw/remount on common actions   | Incremental graph updates + bounded recomputation + instrumentation              |

## Canonical Interaction Architecture

## 1. Interaction Grammar

Define one explicit grammar and enforce it consistently:

- `Click node`: select/toggle.
- `Drag node`: move node.
- `Drag empty canvas`: pan.
- `Drag marquee`: replace or add selection (modifier key).
- `Connect action`: from selection or explicit start/end handles.

Rules:

- No gesture should have ambiguous semantics in the same context.
- Modifier keys should augment, not redefine, base behavior.
- Keyboard shortcuts must be disabled while typing in inputs.

## 2. Constraint Model

Model constraints in three tiers:

- Hard constraints: impossible states (invalid references, duplicate IDs).
- Soft constraints: discouraged states (suboptimal port pairing).
- Advisory constraints: guidance only (layout/readability hints).

UX behavior:

- Hard constraints: prevent action + explain why.
- Soft constraints: allow with warning and one-click repair.
- Advisory: annotate, do not block.

## 3. Spatial Model

Treat layout as assistive, not authoritative, during editing:

- Preserve authored positions by default.
- Use local, bounded layout assistance near edited nodes.
- Never reset camera on local edits.
- Keep fit/recenter as explicit user actions.

## 4. History Model

Use transactional undo/redo:

- Each user intent maps to one history entry.
- Compound operations (add + auto-connect) are one transaction.
- Internal side effects should not create extra undo steps.
- Undo labels should reflect intent (“connect devices”, not “setTopology”).

## 5. Feedback Model

Every action should produce:

- feedforward: preview before commit where useful,
- immediate outcome: what changed,
- recovery hint: how to undo/fix.

Status text should answer:

1. What happened?
2. Why did it happen?
3. What can I do next?

## Usability Quality System

## Requirement Completeness Guardrail

A UX strategy is incomplete if it only optimizes edit-loop mechanics but misses
first-success discoverability.

Every strategy revision must explicitly cover all of these journey classes:

1. First-value evaluation ("Is this worth my time?").
2. First-object creation without catalog expertise.
3. Specific-object retrieval when model is known.
4. Iteration and recoverability under normal editing.
5. Resilience under optional subsystem failure.
6. Persistence/handoff continuity.

If any class has no explicit requirement and no matching acceptance scenario,
the strategy is considered incomplete.

## Acceptance Scenarios (Must Pass)

1. Create 5-device, 4-link topology from scratch.
2. Extend existing graph from focused selection.
3. Recover from mistaken delete via undo/redo.
4. Resolve a failed connect with guidance.
5. Continue editing while optional traffic subsystem fails.
6. Import invalid JSON and recover without state corruption.
7. Add first switch via generic intent ("normal switch", no prior model recall).
8. Add first switch via specific intent (known model lookup).

## Metrics That Matter

Track these continuously:

- Time to first valid topology (TTFT).
- Time to add-and-connect one device from selection.
- Undo mismatch rate (user immediately redoes opposite action).
- Correction rate (delete/move/reconnect within 5 seconds of action).
- Edit latency p95 (add/connect/delete/undo).
- Full remount count during edit session.
- Task completion rate in scripted usability runs.

## Engineering Gates

- No edit path without tests (unit/service/integration as appropriate).
- No UX semantic change without interaction notes in PR.
- No new full-remount dependency in core edit loop without justification.
- No silent constraint failures.

## Repository Mapping (Where to Enforce This)

- Interaction and lifecycle orchestration: `scripts/app/controller.ts`
- Edit intent and transactions: `scripts/app/builderService.ts`
- History semantics: `scripts/app/historyService.ts`
- Picker/search ergonomics: `scripts/app/bootstrap.ts` + extracted modules
- Graph update path and remount behavior: `scripts/graph/graph.ts` +
  `scripts/graph/renderer.ts`

## Delivery Strategy

## Phase 1: Trust First

- Unify undo/redo ownership and transaction model.
- Decouple topology load from traffic startup failures.
- Add missing orchestration tests (history/reducer/controller paths).

Done when:

- Undo behavior is predictable and test-backed.
- Topology never disappears because traffic failed.

## Phase 2: Remove Friction

- Replace rebuild-heavy edit flows with incremental updates.
- Preserve camera, selection, and local positions in edit loop.
- Instrument and enforce edit latency budgets.

Done when:

- Edit loops remain stable and fast under typical topologies.

## Phase 3: Improve Fluency

- Refactor device-type picker ranking and discoverability.
- Standardize connect/delete/add feedback and shortcut behavior.
- Add explicit affordances for failed-connect repair.

Done when:

- Common tasks need fewer interactions and fewer corrective actions.

## Phase 4: Polish and Confidence

- Add purposeful motion cues (not decorative animation).
- Improve microcopy for status and errors.
- Run scenario-based usability checks each milestone.

Done when:

- Users report confidence and momentum, not hesitation.

## Cadence

- Weekly: review metrics and anti-pattern incidents.
- Per milestone: run full acceptance scenario script.
- Per UX-affecting PR: include an “interaction impact” section with risk notes.

## Related Docs

- `docs/persona.md`
- `docs/ideas/network_builder_workflow.md`
- `docs/ideas/network_builder_user_journey.md`
- `docs/network-map-editing-plan.md`
- `docs/ux/gap_discovery_strategy.md`
