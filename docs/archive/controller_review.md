You’re correct — my earlier interface sketch assumed the older “controller-first” builder logic. The current repo state is different: **`builderService.ts` already exists and is fairly complete**, and it expects controller-shaped dependencies. ([GitHub][1])

### What’s current right now (as of `master`)

* `scripts/app/builderService.ts` defines `BuilderServiceDeps` and a `createBuilderService(...)` factory. It already contains most of the builder logic (device add/connect/type change/import/export etc.). ([GitHub][1])
* `scripts/app/historyService.ts` exists as `createCustomHistoryService` with undo/redo stacks. ([GitHub][2])
* `scripts/app/controller.ts` still contains its **own** `customUndoStack/customRedoStack`, `pushCustomUndoSnapshot`, etc., and also still contains the legacy builder handlers (at least `addCustomDeviceInternal` is still there). ([GitHub][3])
* Your `docs/ideas/restructuring-plan.md` in the repo already matches the tightened “convergence-first” version. ([GitHub][4])

So yes: the repo is already *past* the stage where we invent a new builder-service interface; the right move is to **finish adoption and delete duplication**.

---

## Updated “interface sketch” based on the *actual* current `builderService.ts`

### 1) The builder service contract you already have

This is the existing dependency surface (summarized from the current file), and it’s the right baseline for PR-A: ([GitHub][1])

```ts
type BuilderServiceDeps = {
  getState: () => State;
  dispatch: Dispatch;
  customNetworkId: string;

  // ⚠ currently mutable object
  builderStats: BuilderStatsState;

  // controller utilities
  nextUniqueId: (prefix: string, existing: Set<string>) => string;
  getNodePositions: () => Map<string, { x: number; y: number }>;
  getViewportCenter: () => { x: number; y: number } | null;

  // controller orchestration seam (applies state + remount + persist)
  refreshCustomGraph: (
    devices: NetworkDevice[],
    connections: Connection[],
    options?: { selectedIds?: string[] },
  ) => void;

  // ⚠ currently controller-owned undo
  pushCustomUndoSnapshot: (label: string) => void;
  clearCustomUndo: () => void;

  // controller entrypoint
  ensureBuilderMode: () => Promise<void>;
  formatStatusError: (err: unknown) => string;
};
```

### 2) What should change next (small, high-leverage adjustments)

Right now `builderService` still depends on controller-owned undo functions, even though you already have `createCustomHistoryService()`. ([GitHub][1])

Replace these two deps:

* `pushCustomUndoSnapshot`
* `clearCustomUndo`

…with a **history port** that is literally your existing history service:

```ts
import type { CustomHistoryService, CustomHistorySnapshot } from "./historyService.ts";

type BuilderServiceDeps = {
  // ...
  history: CustomHistoryService;

  makeHistorySnapshot: (label: string) => CustomHistorySnapshot;
  // ...
};
```

Then the builder service calls:

* `deps.history.pushUndo(deps.makeHistorySnapshot("add device"))`
* and controller uses `history.undo()/redo()` for undo/redo commands.

This single change lets you **delete controller’s internal undo stacks** entirely. ([GitHub][3])

### 3) Fix the “mutable builderStats object” seam (optional but worthwhile)

`builderService.ts` currently mutates `deps.builderStats.recentDeviceTypeSlugs = ...`. ([GitHub][1])
That makes ownership fuzzy (service mutating controller-owned state).

Minimal clean seam:

```ts
type BuilderStatsPort = {
  get(): BuilderStatsState;
  set(next: BuilderStatsState): void;
};
```

So the service does:

* `const stats = deps.builderStats.get()`
* compute new stats
* `deps.builderStats.set(nextStats)`

This will make later `ports.ts` work cleaner.

---

## Concrete PR-A wiring plan based on current files

1. In `controller.ts`:

* Instantiate `const history = createCustomHistoryService()` (from `historyService.ts`). ([GitHub][2])
* Implement `makeHistorySnapshot(label)` by cloning current devices/connections (you already have clone helpers in controller today). ([GitHub][3])
* Create `const builder = createBuilderService({...})` using:

  * existing `getState/dispatch`
  * existing `nextUniqueId`
  * `getNodePositions` + `getViewportCenter` from graph (already present patterns in controller) ([GitHub][3])
  * existing `refreshCustomGraph`
  * new `history` + `makeHistorySnapshot`

2. Replace controller’s builder methods with pass-through calls:

* `addCustomDevice` → `builder.addCustomDevice(...)`, etc. ([GitHub][3])

3. Implement controller undo/redo using `history.undo/redo()`:

* On undo:

  * `const prev = history.undo()` (or `undo(current)` if you refactor history API)
  * `refreshCustomGraph(prev.devices, prev.connections, { selectedIds: ... })`
* Delete controller’s `customUndoStack/customRedoStack` and helpers. ([GitHub][3])

4. Delete duplicated builder implementation from controller (e.g., `addCustomDeviceInternal` and friends) once the delegation paths are in place. ([GitHub][3])

---

## One important observation

Your `builderService.ts` imports `Dispatch, State` from `./types.ts`. ([GitHub][1])
But `controller.ts` imports `Dispatch, Store, State` from `./state.ts`. ([GitHub][3])

That suggests the repo has (or recently had) a type split/rename (`state.ts` vs `types.ts`). Before you wire anything, normalize that so builder + controller agree on the same `State/Dispatch` types (otherwise you’ll end up adding casts).

---

If you want, I can now write the *exact* revised `BuilderServiceDeps` type (based on the above), plus the minimal controller glue functions (`makeHistorySnapshot`, `applyUndoSnapshot`) that allow you to delete the legacy undo stacks cleanly, without touching behavior.

[1]: https://raw.githubusercontent.com/bgni/website01/master/scripts/app/builderService.ts "raw.githubusercontent.com"
[2]: https://raw.githubusercontent.com/bgni/website01/master/scripts/app/historyService.ts "raw.githubusercontent.com"
[3]: https://raw.githubusercontent.com/bgni/website01/master/scripts/app/controller.ts "raw.githubusercontent.com"
[4]: https://raw.githubusercontent.com/bgni/website01/master/docs/ideas/restructuring-plan.md "raw.githubusercontent.com"




