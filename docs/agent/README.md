# Agent Docs Hub

This is the fastest path for coding agents to get aligned before making changes.

## Read Order (Agent)

1. `docs/AGENT_INSTRUCTIONS.md` (hard constraints + boundaries)
2. `docs/ideas/advanced-agent-lessons.md` (architecture heuristics)
3. `docs/ideas/restructuring-plan.md` (current execution roadmap)
4. `docs/persona.md` (user value and UX intent)
5. `docs/data/netbox-catalog-loading.md` (if device-type enrichment is touched)
6. `docs/scenarios/*` (only if change touches specific network shapes)

## What Docs Should Exist (Minimum Set)

For this repo, these docs are the high-value minimum for safe autonomous work:

- **Operating constraints** (`AGENT_INSTRUCTIONS.md`)
  - Environment, quality gates, non-negotiables.
- **Execution workflow** (`ai-agent-playbook.md`)
  - Default validation loop and change discipline.
- **Architecture intent** (`ideas/advanced-agent-lessons.md`)
  - Boundary ownership and anti-patterns.
- **Active migration plan** (`ideas/restructuring-plan.md`)
  - Workstreams and sequencing.
- **User intent** (`persona.md`)
  - Who we are optimizing for and why.
- **Data pipeline references** (`data/netbox-catalog-loading.md`)
  - Build-time vs runtime loading model and tooling assumptions.
- **Scenario references** (`scenarios/*.md`)
  - Domain examples and topology mental models.
- **Historical rationale** (`archive/reviews/review-*.md`)
  - Decision chronology and legacy context.

If a new doc does not clearly fit one of these categories, prefer updating an
existing doc instead of adding another file.

## Freshness Protocol

When a change materially affects UX, architecture, or workflows:

- Update at least one of:
  - `ideas/advanced-agent-lessons.md`
  - `ideas/restructuring-plan.md`
  - `persona.md`
- Add a “Last reviewed” date only when content meaning changes.
- Keep historical reviews archived; do not treat them as current direction.

## Decision Priority (Conflict Resolution)

When docs conflict, prefer this order:

1. `AGENT_INSTRUCTIONS.md`
2. `ideas/restructuring-plan.md`
3. `ideas/advanced-agent-lessons.md`
4. `ai-agent-playbook.md`
5. archived reviews
