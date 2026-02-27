# User Intent and Experience Contract

## Purpose

Define the user intent, expected mental state, and non-negotiable experience
commitments for the network map editor.

This is the reference point for UX-impacting changes before implementation and
during review.

## Primary User and Context

- Primary user: network engineer/operator sketching, editing, or validating
  topology under time pressure.
- Typical context: partial information, active troubleshooting, or fast design
  iteration.
- User mental model: they are editing a spatial representation of network
  reality, not managing raw graph primitives.

## User Intent at App Open

Users usually open the app to do one of these jobs:

1. Continue and refine an existing topology quickly.
2. Add/modify devices and links without losing orientation.
3. Understand impact and dependencies (selection, path, state cues).
4. Recover from mistakes safely while exploring alternatives.
5. Share/export a useful topology state after edits.

## Expected Experience

When the app works well, users should feel:

- Oriented: they immediately understand where they are and what is selected.
- In control: actions do what they expect in the current context.
- Safe to experiment: mistakes are easy to undo and recover from.
- Fast and focused: common edit loops have low friction and low delay.

## Experience Commitments (Contract)

For UX-impacting changes, protect these commitments:

1. Predictable interaction semantics.
   - The same gesture/shortcut should mean the same thing in the same context.

2. Stable spatial context.
   - Local edits should not cause unrelated layout/camera jumps.

3. Intent-first editing.
   - Common intents (add from selection, connect selected) should require
     minimal steps.

4. Explicit feedback and recovery.
   - No silent failures. Failures explain why and suggest next action.
   - Undo/redo reflects user intent, not internal implementation details.

5. Responsive edit loop.
   - Add/connect/delete/undo should feel immediate in normal usage.

6. First-device discoverability (switch baseline).
   - Users should immediately see they can add a "normal switch" without knowing
     catalog internals.
   - Users with a specific switch in mind should be able to find it quickly.
   - The picker should prioritize recognizable brand/model options and avoid
     forcing recall of obscure part numbers as the primary path.

## Annoyance and Confusion Triggers

Treat these as high-risk regressions:

- Unexpected mode switches or ambiguous click/drag behavior.
- Viewport resets or node jumps after small local edits.
- Connect/add failures without clear reason and recovery guidance.
- Undo/redo that does not match what the user thinks they just did.
- Repetitive manual steps for frequent actions.
- Noticeable lag or stutter in core edit actions.
- Device picker appears as a long, unfamiliar catalog where useful switch
  options are not immediately visible.
- Users must guess exact search strings to discover there are any relevant
  switch choices.

## How to Use This Contract

Before coding:

1. Name the user intent being changed.
2. Name which contract commitments are at risk.

Before merge:

1. Run `docs/ux/sanity_checklist.md`.
2. Run structured review per `docs/ux-review-benchmark.md`.
3. Record findings using `docs/ux/ux_review_template.md`.

## Related Documents

- `docs/persona.md`
- `docs/ideas/network_builder_user_journey.md`
- `docs/ideas/graph_editor_usability_strategy.md`
- `docs/ux-review-benchmark.md`
