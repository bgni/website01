# Agent Instructions — website01 (2026-02-26, GPT-5 Codex)

## Mission

Generate behavior-preserving, test-backed changes that move this codebase toward
its intended architecture: thin controller, service-owned behavior, explicit
ports, and validated domain boundaries.

## Non-Negotiables

- Do not ship changes that break `deno task ci`.
- Keep topology usable even if traffic source/config fails.
- Keep behavior stable unless the task explicitly requests behavior changes.
- Prefer deterministic behavior and deterministic outputs.

## Mandatory Workflow

1. Read the touched boundary modules first (`bootstrap`, `controller`,
   service(s), domain parser/validator, graph/layout, traffic connector).
2. Validate assumptions with commands before writing conclusions.
3. Make the smallest behavior-preserving change that removes duplication or
   tightens boundaries.
4. Run relevant tasks before finalizing:
   - `deno task lint`
   - `deno task check`
   - `deno task test`
   - `deno task validate` when fixtures/domain touched
   - `deno task build:pages` when build/wiring touched

## Architecture Rules

- Controller is orchestration only; business behavior belongs in services.
- Ownership rule: coupled operations must have one owner.
  - Example: undo snapshot creation + undo/redo restoration must be in the same
    module.
- New service dependencies must be defined in `scripts/app/ports.ts` as named
  port types.
- `bootstrap.ts` is composition root only. Extract inline data logic and
  keyboard logic into testable modules.

## Testing Rules

- Any new service or extracted logic must ship with tests.
- Prioritize adding tests where risk is highest:
  - `controller.ts` load/lifecycle/failure paths
  - `historyService.ts`
  - `reducers.ts`
  - `customTopology.ts`
- When possible, test via fake ports (no DOM dependency).

## Type and Data Rules

- No new implicit `any`.
- Exported functions declare explicit return types.
- Parse JSON as `unknown`, then validate.
- Replace bare string mode fields with literal unions (`layoutKind`,
  `trafficSourceKind`, `trafficVizKind`).
- Avoid broad untyped shared state objects; wrap mutable shared state behind
  explicit port methods.

## Documentation Hygiene

- For review docs, list findings first, ordered by severity, with concrete
  file:line references.
- Do not restate old architecture claims without verifying current code.
- When adding/updating docs, run `deno fmt` on the changed markdown files.
- If CI fails, report exact failing command and files.

## Definition of Done

- Required tasks pass for the touched scope.
- No duplicate ownership remains for the changed behavior.
- Tests cover the new/changed logic path.
- Architectural direction is improved or at minimum preserved.
