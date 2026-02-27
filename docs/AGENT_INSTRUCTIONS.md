# Agent Instructions — website01

This repo is a Deno + TypeScript static site (GitHub Pages) for network topology
visualization and editing with D3.

## Mission

Generate behavior-preserving, test-backed changes that improve:

- architectural convergence (thin controller, service-owned behavior),
- runtime correctness and resilience,
- and especially map editing quality (fast, predictable, enjoyable), measured
  through continuous UX benchmark progression.

## Non-Negotiables

- Target OS: Linux (CI runs ubuntu-latest).
- Runtime/tooling: Deno (CI-pinned).
- GitHub Pages must work from static output (`dist/`).
- Do not merge changes that break `deno task ci`.
- Refactors must preserve behavior unless explicitly requested.

## Product Quality Bar (Editing UX)

When changing builder/editing behavior, optimize for:

- Predictability: selection, connect/delete, and undo/redo should behave
  consistently.
- Continuity: preserve viewport and node positions across edit operations.
- Responsiveness: edits should feel immediate; avoid avoidable full remounts.
- Recoverability: failed actions produce clear status feedback and never corrupt
  topology state.
- Learnability: shortcuts and controls should be discoverable and coherent.

Use `docs/ux-review-benchmark.md` as the required evaluation frame for
UX-impacting changes. Anchor UX reasoning first in
`docs/ux/user_intent_and_experience_contract.md`.

## Architectural Intent

- Composition root: `scripts/main.ts`, `scripts/app/bootstrap.ts`
- Orchestration: `scripts/app/controller.ts` (thin lifecycle coordination)
- Application services: `scripts/app/*Service.ts`
- Domain: `scripts/domain/*` (parse/validate/normalize boundary data)
- Infrastructure: `scripts/graph/**`, `scripts/layouts/**`, `scripts/traffic/**`

Controller orchestrates. Services own behavior. Domain validates boundaries.
Infrastructure renders and performs external side effects.

## Active Architectural Priorities

1. Unify undo/redo ownership in one module.
2. Reduce controller/bootstrap orchestration weight.
3. Extract and test inline bootstrap logic (device-type grouping, shortcuts).
4. Strengthen type seams (`layoutKind`, `trafficSourceKind`, `trafficVizKind`
   unions).
5. Expand tests around orchestration/lifecycle paths.

## Ports and Dependency Rules

- Service dependencies must be expressed as named ports in
  `scripts/app/ports.ts`.
- Prefer many small ports (single concern) over broad interfaces.
- Services consume ports; they do not import concrete infra implementations.
- Avoid mutable shared object references across modules; use explicit port
  methods for read/write ownership.

## Refactor Policy

Safe when behavior is unchanged and CI passes:

- moving logic across modules,
- introducing ports/adapters,
- routing controller code through services,
- deleting duplicate legacy paths after adoption.

Risky (explicit request required):

- layout algorithm behavior changes,
- shortest-path semantics changes,
- selection/search/keyboard UX semantics changes,
- fixture schema breaking changes.

## Workflow (Mandatory)

1. Identify the boundary touched.
2. Make the smallest change that reduces duplication, clarifies boundaries,
   improves typing, or closes a test gap.
3. Run:
   - `deno task fmt`
   - `deno task lint`
   - `deno task check`
   - `deno task test`
4. If fixtures/layout changed:
   - `deno task validate`
   - `deno task render:svgs`
5. If wiring/build changed:
   - `deno task build:pages`
6. If UX behavior is affected:
   - Check user intent + risk against
     `docs/ux/user_intent_and_experience_contract.md`.
   - Run `docs/ux/sanity_checklist.md`.
   - Run structured UX review per `docs/ux-review-benchmark.md`.
   - Run `docs/ux/tests/first_switch_discoverability_test.md`.
   - Update journey coverage using `docs/ux/journey_review_matrix.md`.
   - Record benchmark scorecard + scenario results in PR notes using
     `docs/ux/ux_review_template.md`.

## TypeScript and Data Rules

- No new implicit `any`.
- Exported functions declare explicit return types.
- Parse JSON as `unknown`, then validate.
- Prefer narrow runtime-validated types at boundaries.
- Use literal unions for finite mode/kind fields.

## DOM and Security Rules

- Do not use `innerHTML` for fixture/user/url-derived content.
- Prefer DOM construction + `textContent`.
- Keep third-party CDN scripts pinned.

## Testing Rules

- New/extracted service logic requires tests.
- Prioritize tests for:
  - `controller.ts` lifecycle/error flows,
  - `historyService.ts`,
  - `reducers.ts`,
  - `customTopology.ts`.
- Prefer fake ports/mocks for service tests (no DOM dependency).

## UX Review Gate

- UX-impacting changes require structured UX review, just like code changes
  require tests.
- Do not treat UX as "fixed by closing tickets." Evaluate against benchmark
  trend and scenario outcomes.
- Use `docs/ux/sanity_checklist.md` as a pre-benchmark gate.
- First-switch discoverability is required; do not rely on catalog recall.
- Track journey coverage with `docs/ux/journey_review_matrix.md`.
- Required scenarios and dimensions are defined in
  `docs/ux-review-benchmark.md`.

## Definition of Done

- Required tasks pass.
- Behavior is preserved unless explicitly changed.
- Duplicate ownership/logic for touched paths is reduced.
- New behavior/logic is covered by tests.
- UX-impacting behavior changes include benchmark scorecard + scenario review.
- Architecture direction is improved or preserved.
