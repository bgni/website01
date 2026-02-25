# Network Builder Workflow (MVP)

## Goals

- Let users create and edit a topology directly in the browser.
- Persist work in browser storage first (no backend dependency).
- Support import/export of full topology as JSON.
- Keep first-time graph creation fast with minimal clicks.

## Guiding UX Principles

- Start from a blank but usable canvas.
- Default to smart actions (especially auto-connect).
- Never block expert users from editing details later.
- Make recovery obvious (autosave + explicit export).

## Data Model Scope (MVP)

- `devices[]`: id, name, type, optional deviceTypeSlug, optional metadata.
- `connections[]`: id, from { deviceId, interfaceId }, to { deviceId,
  interfaceId }.
- Optional `traffic*` is out of scope for first builder MVP (can be added
  later).

## Suggested User Workflow

## 1) Enter Builder Mode

- User clicks `Create/Edit` in top controls.
- App opens a builder side panel and switches network source to
  `Custom (local)`.
- If no draft exists, initialize an empty topology scaffold.

## 2) Add First Device (Fast Path)

- Primary action: `+ Add device`.
- Device picker shows:
  - **Recent** (last added device types in this browser).
  - **Frequent** (most-added device types in this browser).
  - Searchable full list.
- On select, add node to canvas center (or next free slot), with sensible
  default name.

## 3) Add More Devices

- Reuse the same quick picker; default to last used category.
- Allow click-to-place (or auto-place in current layout lane).
- Name field can be edited inline after creation.

## 4) Connect Devices (Default Easy Behavior)

- User selects device A then device B and clicks `Connect` (or drag-connect
  gesture later).
- System finds **first usable port pair** automatically:
  - Port is usable if not management-only and not already connected.
  - Prefer matching interface classes/speeds when available.
  - If no compatible pair, fallback to first free non-management ports.
- Create connection immediately.
- Show lightweight toast: `Connected A:portX → B:portY` with optional `Edit`
  action.

## 5) Edit Connection/Device (Optional Detail)

- Device card actions: rename, change type, remove.
- Connection actions: swap ports, delete.
- Any change triggers autosave to browser storage.

## 6) Save, Export, Import

- Autosave continuously to Local Storage key (versioned).
- `Export JSON` downloads complete topology (`devices`, `connections`,
  metadata/version).
- `Import JSON` validates shape and replaces or merges draft (user chooses).
- On import errors, show actionable validation message with line/path context
  where possible.

## Local Storage Strategy

- Key: `website01.builder.topology.v1`.
- Keep:
  - `draftTopology`
  - `recentDeviceTypes[]` (bounded list, e.g. 8)
  - `frequentDeviceTypes{slug:count}`
  - `updatedAt`
- Add schema version for safe migration.

## Validation Rules (MVP)

- Device IDs unique.
- Connection IDs unique.
- Connection endpoints must reference existing devices.
- Port cannot be used by more than one connection unless explicitly allowed
  later.

## Minimal UI Surface (Phase 1)

- Top controls:
  - `Create/Edit` toggle
  - `Add device`
  - `Connect`
  - `Export JSON`
  - `Import JSON`
- Side panel:
  - recent/frequent quick picks
  - search device type
  - selected node/edge details

## Phased Rollout

- **Phase 1 (MVP)**: local draft, quick-add, auto-connect, import/export.
- **Phase 2**: drag-connect gesture, undo/redo, merge import.
- **Phase 3**: multiple named drafts, shareable links/backend sync.

## Acceptance Criteria (MVP)

- New user can create a 5-device, 4-link topology in under 1 minute.
- Reload restores draft from browser storage.
- Exported JSON can be imported back with identical topology.
- Connecting two devices requires no manual port selection by default.
