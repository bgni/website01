# Job Stories for Graph Editor UX

Purpose: capture user intent and mental state in first-person form, so UX and
engineering decisions stay anchored to real user goals.

## Complexity Ladder

- `L1` Getting started: "Can I do something useful quickly?"
- `L2` Productive iteration: "Can I refine/diagnose without friction?"
- `L3` Operational reliability: "Can I trust this in real workflows?"

## L1 Stories (Getting Started)

## Story 1 (`L1`): "Is this worth using?"

When I open this app for the first time, I want to quickly see what a finished
network model can look like and whether interaction feels trustworthy, so I can
decide if investing effort here is worth it.

Success signal:

- I can visualize a realistic result quickly and feel that creating one myself
  will be straightforward.

## Story 2 (`L1`): "Create my first useful topology fast"

When I decide to try modeling my network, I want to create a simple but valid
topology quickly (devices + links), so I can build confidence before investing
in full fidelity.

Success signal:

- I can build a 5-device, 4-link topology in minutes without confusion.

## Story 3 (`L1`): "Understand what my next action should be"

When I am building my first map, I want controls and feedback to make the next
step obvious, so I don't stall or guess what to do.

Success signal:

- I can tell what happened and what to do next after each action.

## L2 Stories (Productive Iteration)

## Story 4 (`L2`): "Extend from where I am focused"

When I select a device and continue modeling, I want add/extend behavior to
start from that context, so I can grow the map without re-positioning manually.

Success signal:

- Add-from-selection usually produces an immediately useful local extension.

## Story 5 (`L2`): "Refine and recover safely"

When I already have a draft, I want to rename/change/delete/reconnect and undo
mistakes quickly, so I can explore alternatives without fear.

Success signal:

- I can iterate aggressively and recover instantly without losing confidence.

## Story 6 (`L2`): "Import existing work and repair it"

When I bring in topology data from elsewhere, I want validation and clear repair
guidance, so I can recover from format issues without starting over.

Success signal:

- Import failures are actionable and successful import leaves me in an editable
  state.

## Story 7 (`L2`): "Analyze dependencies and impact"

When I am troubleshooting or planning changes, I want to select devices and see
their connecting paths clearly, so I can reason about blast radius quickly.

Success signal:

- Selection/path highlighting helps me answer impact questions faster than
  static diagrams.

## Story 8 (`L2`): "Organize larger maps into understandable sections"

When my topology gets larger, I want grouping/structure tools, so the diagram
stays readable and manageable.

Success signal:

- I can cluster related devices and still edit core connectivity efficiently.

## L3 Stories (Operational Reliability)

## Story 9 (`L3`): "Keep working through imperfect systems"

When telemetry or optional data inputs are unreliable, I want to keep editing
topology instead of losing context, so operational issues do not block design or
documentation work.

Success signal:

- Optional subsystem failures degrade gracefully without blocking core editing.

## Story 10 (`L3`): "Compare alternatives without losing progress"

When I evaluate multiple design options, I want low-friction ways to branch and
compare alternatives, so decision-making is fast and traceable.

Success signal:

- I can produce and compare alternatives without repeating large manual steps.

## Story 11 (`L3`): "Hand off a durable, understandable artifact"

When I finish a useful draft, I want to preserve and share it easily, so I can
support handoff, review, and ongoing maintenance.

Success signal:

- My topology is durable, portable, and legible enough for team use.

## How to use this document

- Use one or more stories as explicit user intent in UX-impacting PRs.
- Pair with `docs/ux/user_journeys_current_state.md` to assess current support
  and risk by story.
- Track journey coverage in `docs/ux/journey_review_matrix.md`.
- Revisit stories when persona/workflow priorities change.
