# Docs Index

This index is the canonical entry point for repository documentation.

## Start Here (Active)

- Agent docs hub: `agent/README.md`
- Agent operating constraints: `AGENT_INSTRUCTIONS.md`
- Agent workflow and guardrails: `ai-agent-playbook.md`
- Advanced architecture lessons: `ideas/advanced-agent-lessons.md`
- Execution roadmap: `ideas/restructuring-plan.md`
- Architecture target map: `ideas/architecture_hexagonal_target_map.md`

If you are making architecture or refactor decisions, start with:

1. `AGENT_INSTRUCTIONS.md`
2. `ideas/advanced-agent-lessons.md`
3. `ideas/restructuring-plan.md`
4. `agent/README.md`

## User & Workflow Context

- Personas and user framing: `persona.md`
- Builder workflow: `ideas/network_builder_workflow.md`
- Builder user journey: `ideas/network_builder_user_journey.md`
- Visual design notes: `ideas/design_ideas.md`
- Traffic visualization ideas: `ideas/traffic_visualization.md`

## Data & Build Pipeline

- NetBox catalog loading (Deno): `data/netbox-catalog-loading.md`

## Topology Scenario Reference

- Network scenario docs:
  - `scenarios/campus-network.md`
  - `scenarios/leaf-spine-datacenter.md`

## Historical Reviews (Reference)

These docs capture useful snapshots and migration context, but they are not the
current source of architecture direction:

- `archive/reviews/review-00-initial-codebase-audit.md`
- `archive/reviews/review-01-structure-plan.md`
- `archive/reviews/review-02-target-architecture-tree.md`
- `archive/reviews/review-03-maintainability-followup.md`
- `archive/reviews/review-04-post-refactor-status.md`
- `archive/reviews/review-05-maintainer-baseline.md`
- `archive/security-notes.md`

Use historical reviews for rationale and chronology; use the active docs above
for current decisions.

## Docs Quality Gates

- Documentation formatting is enforced by Deno via `deno task fmt`.
- CI runs `deno task fmt`, which includes Markdown in the repository (excluding
  generated outputs under `docs/rendered/`).
- Preferred workflow for docs edits: run `deno fmt <changed-docs>` before
  opening a PR.

## Generated / Verification Output

- Rendered layout snapshots: `rendered/`
