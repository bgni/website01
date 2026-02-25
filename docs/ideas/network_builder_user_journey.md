# Create/Edit Builder — Detailed User Journey

## Purpose

This document describes the **intended user journey** for the custom topology
builder, with emphasis on intuitive behavior when adding devices, connecting
them, and staying oriented in force layout.

---

## Primary Persona

- A network engineer exploring topology ideas quickly.
- They want to sketch and iterate with minimal friction.
- They do not want to think about internals like port IDs until later.

---

## UX Principles for Builder Interactions

1. **Respect user focus**
   - New elements should appear near where the user is looking.
   - Existing elements should not jump unexpectedly after a small action.

2. **Make likely intent the default**
   - If a device is selected and user clicks Add, assume they are extending from
     that device.

3. **Use progressive detail**
   - Start with smart defaults (auto-connect, auto-placement).
   - Allow manual refinement afterward (rename, delete, reconnect).

4. **Keep action feedback immediate**
   - Every action gives a clear status message.
   - Undo/Redo always available in custom mode.

---

## End-to-End Journey

## 1) Enter Create/Edit Mode

### User goal

Start building from scratch or continue a saved draft.

### User action

Click `Create/Edit` in the top bar.

### System response

- Switches to `Custom (local)` topology.
- Loads locally saved draft if present.
- Shows builder controls: Add, Undo, Redo, Connect, Delete Connection,
  Import/Export.
- Keeps graph interactive with current layout mode.

### UX expectation

“I can start editing immediately; my previous work is still here.”

---

## 2) Add First Device (Nothing Selected)

### User goal

Place first device without micromanaging position.

### User action

Choose a type from quick picker and click `Add Device`.

### System response

- Adds new device near the current viewport center.
- Uses smart default naming: `<model> <count>`.
- Selects the newly added device for next action.

### UX expectation

“The device appears where I’m currently looking, not far away.”

---

## 3) Extend from Existing Device (One Device Selected)

### User goal

Grow the graph from a chosen device.

### User action

Select one device, choose type, click `Add Device`.

### System response

- Adds new device near selected device (small radial offset).
- Attempts immediate auto-connect to selected device using first compatible free
  ports.
- Prioritizes matching interface type when possible.
- Falls back to first usable free ports if no exact type match.
- If no compatible free ports exist, device is still added and user gets clear
  message.

### UX expectation

“Add means add-and-extend from what I selected.”

---

## 4) Keep Orientation in Force Layout During Edits

### User goal

Avoid losing context after each add/edit action.

### User action

Perform builder actions while in force layout (add, rename, connect, delete).

### System response

- Preserves existing node positions between edits.
- Preserves pan/zoom viewport between edits.
- Uses lower reheat when positions already exist, reducing mass movement.
- Keeps newly added node near the user’s current focus.

### UX expectation

“The canvas stays mostly where I left it; only the intended local area changes.”

---

## 5) Refine Selection and Connectivity

### User goal

Iterate topology quickly without modal-heavy flows.

### User actions

- Select two devices and click `Connect`.
- Select two devices and click `Delete Connection`.
- Rename or delete from selected panel.

### System response

- Connection uses auto-selected free linkable ports.
- Delete connection removes links between selected pair.
- Rename/Delete update immediately and autosave.

### UX expectation

“Frequent actions are one-click and reversible.”

---

## 6) Recover from Mistakes

### User goal

Reverse mistakes instantly.

### User action

Use toolbar `Undo`/`Redo` or keyboard shortcuts.

### System response

- Undo/Redo applies to custom edit history stack.
- Buttons enable/disable based on availability.
- Shortcuts in custom mode:
  - `Ctrl/Cmd + Z` → Undo
  - `Ctrl/Cmd + Shift + Z` → Redo
  - `Ctrl/Cmd + Y` → Redo
- Shortcuts are ignored while typing in input fields.

### UX expectation

“I can experiment safely without fear of breaking the topology.”

---

## 7) Persist and Share

### User goal

Keep draft and move work across sessions.

### User action

Continue editing, optionally export/import JSON.

### System response

- Autosaves topology + recents/frequents to local storage.
- Export produces portable JSON.
- Import validates and loads topology with clear errors on invalid structure.

### UX expectation

“My work is durable, portable, and recoverable.”

---

## Journey Quality Checks (Heuristics)

A build interaction should feel good if:

- The user rarely has to hunt for newly added nodes.
- The viewport does not unexpectedly reset on small edits.
- Add-from-selection usually creates an immediate useful connection.
- Status messages explain success/fallback states in plain language.
- Undo/Redo restores both topology and user confidence.

---

## Known Tradeoffs

- Force layout still allows some settling movement by design.
- Auto-connect can fail when ports are exhausted or incompatible; this is
  surfaced explicitly rather than silently skipped.
- Full placement customization (drag-to-place-on-add) can be considered later if
  needed.

---

## Future Improvements (Post-MVP)

- Optional toggle: `Add Device auto-connect when one is selected`.
- “Place mode” for click-on-canvas placement.
- Micro-animation to draw attention to newly added node.
- Lightweight guide ring around selected device for placement context.
- Toast actions for quick “Undo” per operation.
