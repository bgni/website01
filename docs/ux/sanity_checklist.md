# UX Sanity Checklist (Pre-merge)

Use this checklist for any change that affects user behavior in map editing.

Pass this checklist before scoring the full benchmark.

## 1) Intent Fit

- [ ] The affected user intent is explicitly stated.
- [ ] The change makes the common path easier or safer, not just different.
- [ ] The change does not shift cognitive load to the user without clear value.

## 2) Interaction Clarity

- [ ] Click/drag/select/connect semantics are unambiguous in context.
- [ ] Shortcuts are consistent and disabled while typing in inputs.
- [ ] Control labels/status messages match actual behavior.

## 3) Spatial Stability

- [ ] Local edits preserve viewport and nearby object permanence.
- [ ] Added items appear near user focus (selected node or viewport center).
- [ ] No unnecessary global layout or camera resets.

## 4) Error and Recovery Quality

- [ ] Failure states are visible, specific, and actionable.
- [ ] Undo/redo restores expected pre-action state.
- [ ] Compound operations map to one understandable history step.

## 5) Flow Efficiency

- [ ] Frequent tasks (add/connect/delete/refine) require minimal steps.
- [ ] Defaults align with likely user intent.
- [ ] No obvious precision tax for common operations.
- [ ] First-switch discoverability passes: users can see and add a "normal
      switch" without search recall.
- [ ] Specific-switch discoverability passes: users can quickly find/add known
      models via search.

## 6) Responsiveness

- [ ] Core edit actions feel immediate in normal scenarios.
- [ ] No avoidable full remount/rebuild on routine local edits.
- [ ] Any latency tradeoff is documented with mitigation.

## Stop-Ship Conditions

Do not merge UX-impacting changes if any item below is true:

- Required scenarios fail in `docs/ux-review-benchmark.md`.
- A major confusion trigger from the contract is introduced.
- Recoverability regresses (undo/redo mismatch or silent failure path).
- Spatial stability regresses without explicit accepted tradeoff.

## Required Follow-up Artifacts

- Benchmark scorecard and scenario outcomes: `docs/ux-review-benchmark.md`
- PR-ready structured notes: `docs/ux/ux_review_template.md`
- Journey coverage status: `docs/ux/journey_review_matrix.md`
- First-switch UX test notes:
  `docs/ux/tests/first_switch_discoverability_test.md`
