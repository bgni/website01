# User Journeys Mapped to Current App State

Purpose: map real user journeys to the app as it exists today, including likely
behavior, friction points, and confidence risks.

Use with:

- `docs/ux/job_stories.md`
- `docs/ux/user_intent_and_experience_contract.md`
- `docs/ux/ux_review_baseline.md`

## Journey Complexity Map

- `L1` Getting started:
  - Journey A, Journey B, Journey C
- `L2` Productive iteration:
  - Journey D, Journey E, Journey F, Journey G
- `L3` Operational reliability:
  - Journey H, Journey I, Journey J

## Journey A (`L1`): Evaluate if the app is worth the effort

### User intent and state of mind

- "I want to know what end result I can get and whether this tool will reduce my
  documentation/troubleshooting effort."
- Confidence is low; user is deciding whether to commit time.

### What the user is looking for

- A fast path to an understandable network view.
- Evidence that editing is not fragile or overly complex.
- A clear indication of available workflows (view, edit, recover, export).

### What the user is currently faced with

- Existing network views can be loaded quickly.
- `Create/Edit` mode is available and discoverable in controls.
- Builder controls (Add, Undo, Redo, Connect, Delete Connection, Import/Export)
  are visible once in custom mode.

### Likely user behavior

1. Inspect a built-in network.
2. Switch to `Create/Edit`.
3. Try adding/connecting a few devices.
4. Judge whether the effort-to-result ratio feels acceptable.

### Current-state friction and risk

- If optional traffic source fails during load, graph visibility can be lost
  (high confidence break).
- Drag-select expectations may not match actual selection behavior.

### Current-state assessment

- Partial support.
- The app shows value quickly, but trust can drop in edge/error paths.

## Journey B (`L1`): Build a first simple model

### User intent and state of mind

- "I want to create a simple model fast to verify this is usable for my real
  network."
- User is willing to try, but has low tolerance for setup friction.

### What the user is looking for

- Add device near current focus.
- Fast connect between likely endpoints.
- Immediate feedback on success/failure.

### What the user is currently faced with

- Add flow supports smart naming and position logic.
- Add-from-selection can auto-connect with compatibility fallback.
- Connect/delete are one-click for two selected nodes.
- Status text explains common failure states.

### Likely user behavior

1. Add first device.
2. Select it and add another to extend.
3. Use connect/delete for quick correction.
4. Repeat until the model shape is useful.

### Current-state friction and risk

- Full graph remount per edit can reduce smoothness at moderate graph size.
- Selection operations beyond simple click patterns can feel inconsistent.

### Current-state assessment

- Strong support for core flow.
- Responsiveness and interaction consistency remain key constraints.

## Journey C (`L1`): Understand next actions with low ambiguity

### User intent and state of mind

- "I am new and I need obvious next steps after each action."
- User confidence depends on feedforward and immediate feedback.

### What the user is looking for

- Clear action buttons and enabled/disabled affordances.
- Explicit messages for both success and failure states.
- Low ambiguity between select/pan/connect flows.

### What the user is currently faced with

- Builder controls and state-dependent enable/disable behavior are present.
- Status text reflects many action outcomes.
- Some selection gesture expectations remain inconsistent.

### Likely user behavior

1. Try add/connect/delete quickly.
2. Read status text when an action fails.
3. Adjust and retry.

### Current-state friction and risk

- Marquee-selection contract is not fully wired end-to-end.
- Hidden confidence loss if a visible gesture appears to "do nothing."

### Current-state assessment

- Partial support.
- Control/status visibility is strong; interaction contract needs completion.

## Journey D (`L2`): Iterate, refine, and recover from mistakes

### User intent and state of mind

- "Now that I have a draft, I want to refine aggressively without fear."
- User expects fast correction and stable spatial context.

### What the user is looking for

- Reliable undo/redo and clear action feedback.
- Stable viewport and local object permanence.
- Low-cost edits for rename/type/change/delete operations.

### What the user is currently faced with

- Undo/redo is available via toolbar and keyboard shortcuts.
- Edit actions produce explicit status messages.
- Position + viewport snapshots are preserved across custom refresh.

### Likely user behavior

1. Make several edits in sequence.
2. Undo when needed.
3. Redo selectively.
4. Continue exploring alternatives.

### Current-state friction and risk

- Undo/redo logic ownership spans service + controller, increasing regression
  risk for future changes.
- Full remount edit path can interrupt perceived continuity.

### Current-state assessment

- Good recoverability baseline.
- Architecture and performance constraints can erode trust as complexity grows.

## Journey E (`L2`): Import existing work and repair it

### User intent and state of mind

- "I already have topology data; I need to get it into the editor without losing
  momentum."
- User expects validation to guide correction, not block progress opaquely.

### What the user is looking for

- Clear import affordance.
- Explicit validation errors when data shape is wrong.
- Successful import into an immediately editable state.

### What the user is currently faced with

- Import exists in builder controls.
- Import path validates and reports errors via status text.
- Successful import resets history and refreshes custom graph.

### Likely user behavior

1. Export from another source.
2. Import JSON.
3. Fix format issues if needed and retry.

### Current-state friction and risk

- Validation feedback is concise but not yet rich repair guidance.

### Current-state assessment

- Good baseline support.
- Can be improved with better guided repair workflows.

## Journey F (`L2`): Analyze dependencies and impact

### User intent and state of mind

- "I need to understand what is connected to what before I make or approve
  changes."
- User needs confidence in dependency reasoning, not just visual layout.

### What the user is looking for

- Selection and highlight behavior that reveals relevant paths.
- Fast transition between overview and focused dependency view.
- Reliable visual distinction between selected, related, and unrelated nodes.

### What the user is currently faced with

- Graph update logic includes highlight computation from selected nodes.
- Multi-selection contributes to highlighted path/neighbor context.
- Selection gesture coverage has gaps in advanced interactions.

### Likely user behavior

1. Select one or more suspicious nodes.
2. Inspect highlighted relationships.
3. Change selection repeatedly while reasoning about impact.

### Current-state friction and risk

- If selection behavior is inconsistent, dependency analysis confidence drops.

### Current-state assessment

- Functional baseline exists.
- Interaction consistency is the key limiter.

## Journey G (`L2`): Organize larger topologies into readable groups

### User intent and state of mind

- "My map is getting large; I need structure so it stays understandable."
- User is balancing readability with edit speed.

### What the user is looking for

- Grouping/container mechanics.
- Easy assign/unassign of devices.
- Minimal disruption to existing connectivity workflows.

### What the user is currently faced with

- Container creation and assignment flows are available in custom editing.
- Grouping operations are reversible through existing history behavior.
- Broader layout assistance for large grouped diagrams remains limited.

### Likely user behavior

1. Create a few containers.
2. Assign related devices.
3. Continue editing connections around groups.

### Current-state friction and risk

- Large-map readability still depends heavily on manual organization.
- Remount-heavy edit loop becomes more noticeable as graph size grows.

### Current-state assessment

- Moderate support.
- Good primitives; scaling ergonomics still maturing.

## Journey H (`L3`): Continue working when systems are imperfect

### User intent and state of mind

- "I need to keep working even when telemetry is broken."
- User is under pressure and expects graceful degradation.

### What the user is looking for

- Core topology editing remains available.
- Failures are visible but non-blocking.
- No catastrophic context loss from optional subsystem issues.

### What the user is currently faced with

- Traffic service emits failure status text for restart failures.
- During network load, traffic startup failure can still clear graph state.

### Likely user behavior

1. Load/open network.
2. Hit a source/startup issue.
3. Retry or switch context after losing trust in current session.

### Current-state friction and risk

- High: confidence collapse if topology disappears when optional traffic fails.

### Current-state assessment

- Does not yet meet target resilience expectation.
- This is a priority gap for "enjoyable and reliable" editing.

## Journey I (`L3`): Compare alternatives with low rework

### User intent and state of mind

- "I need to evaluate multiple designs without repeating all manual work."
- User is optimizing decision quality and speed.

### What the user is looking for

- Easy way to branch/duplicate a topology state.
- Fast compare loop between variants.
- Strong recoverability while exploring alternatives.

### What the user is currently faced with

- Undo/redo supports local experimentation in one timeline.
- Import/export enables manual variant management.
- No explicit built-in branching/compare workflow yet.

### Likely user behavior

1. Build base draft.
2. Export/save checkpoint manually.
3. Modify topology and compare mentally or via exported versions.

### Current-state friction and risk

- Variant comparison is possible but operationally heavy.
- Repetitive manual steps can discourage deeper exploration.

### Current-state assessment

- Partial support.
- Needs first-class comparison workflow to excel.

## Journey J (`L3`): Persist, share, and re-open work for handoff

### User intent and state of mind

- "If I invest effort, I need that work to persist and be reusable."
- User is evaluating long-term utility and team handoff value.

### What the user is looking for

- Autosave durability.
- Safe import/export.
- A result that remains understandable on re-open and by others.

### What the user is currently faced with

- Custom topology and picker recents/frequents are saved locally.
- Export/import JSON is available with validation and status feedback.

### Likely user behavior

1. Build draft.
2. Export for backup/share.
3. Re-open and continue from saved state.

### Current-state friction and risk

- No major blocker in core persistence loop.
- Collaboration readability depends on upstream interaction/organization
  quality.

### Current-state assessment

- Solid foundation for portability and continuity.
- Benefits increase as core interaction trust issues are resolved.

## Consolidated Current-State View

## What is working well

- Core add/connect/delete/rename flows in custom mode.
- Clear status feedback for many user actions.
- Undo/redo discoverability and shortcut behavior.
- Local persistence and import/export capabilities.

## What is most likely to annoy or confuse users now

- Topology loss on optional traffic startup failure in load path.
- Drag/marquee selection expectations vs actual state behavior.
- Perceived sluggishness/jank from remount-heavy edit loop.

## What users are likely to do next if friction is unresolved

- Revert to existing diagramming tools for reliability.
- Use app only for quick sketches, not sustained modeling.
- Avoid deeper iteration due to trust concerns.
- Use manual export/import workarounds instead of staying in one productive
  flow.

## Immediate UX priorities implied by these journeys

1. Make optional traffic failures non-destructive to topology visibility.
2. Complete selection interaction contract (including marquee replacement).
3. Move custom editing from remount-heavy refresh to incremental updates.
4. Improve variant/compare workflows for complex design exploration.
