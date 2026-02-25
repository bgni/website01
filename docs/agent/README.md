Here is a **clean, tightened v2 replacement** for `docs/agent/README.md`.

It keeps your structure but strengthens architectural convergence and removes
ambiguity about refactor intent.

You can replace the file entirely.

---

# Agent Docs Hub

This is the fastest path for coding agents to align with repo intent before
making changes.

This repo prioritizes:

- Behavior stability
- Architectural convergence
- Deterministic rendering
- Strict TypeScript boundaries
- CI-green incremental delivery

---

# Read Order (Agent)

1. `docs/AGENT_INSTRUCTIONS.md` Hard constraints, architecture boundaries,
   refactor contract.

2. `docs/ideas/restructuring-plan.md` Active execution roadmap and consolidation
   targets.

3. `docs/ideas/advanced-agent-lessons.md` Architecture heuristics and
   anti-pattern guidance.

4. `docs/persona.md` User value and UX intent.

5. `docs/data/netbox-catalog-loading.md` Only if touching device-type enrichment
   or catalog loading.

6. `docs/scenarios/*` Only if touching specific network shapes or topology
   semantics.

---

# How to Think Before Coding

Before making changes, determine:

- Which boundary is being modified?

  - Domain
  - Application service
  - Controller (orchestration)
  - Infrastructure (graph/layout/traffic)
  - Build system
- Is there duplication that should be consolidated?
- Is a service already present that should own this behavior?
- Is this a behavior change or a mechanical refactor?

If logic exists in two places, consolidation is preferred over caution.

Extraction without adoption is incomplete work.

---

# Required Doc Categories (Minimum Viable Set)

These categories define the documentation contract for safe autonomous work:

### 1. Operating Constraints

`AGENT_INSTRUCTIONS.md` Environment, CI gates, determinism, refactor policy.

### 2. Execution Workflow

`ai-agent-playbook.md` Validation loop, change discipline, typing direction.

### 3. Architecture Intent

`ideas/advanced-agent-lessons.md` Layer ownership, anti-patterns, consolidation
philosophy.

### 4. Active Migration Plan

`ideas/restructuring-plan.md` Current workstreams and sequencing. If this
exists, it should be followed before inventing new structure.

### 5. User Intent

`persona.md` Who the tool is for and what problems it solves.

### 6. Data Pipeline References

`data/netbox-catalog-loading.md` Build-time vs runtime loading model.

### 7. Scenario References

`scenarios/*.md` Topology mental models and domain examples.

### 8. Historical Context

`archive/reviews/review-*.md` Past decisions and rationale. Not current
direction.

If a new document does not clearly fit one of these categories, update an
existing document instead.

Documentation sprawl reduces agent reliability.

---

# Freshness Protocol

When a change materially affects:

- Architecture boundaries
- UX behavior
- Layout semantics
- Data model assumptions
- Build pipeline behavior

Then update at least one of:

- `ideas/restructuring-plan.md`
- `ideas/advanced-agent-lessons.md`
- `persona.md`

Do not update archived reviews to reflect new direction.

Only add “Last reviewed” dates when meaning changes.

---

# Decision Priority (Conflict Resolution)

When documentation conflicts, follow this precedence:

1. `AGENT_INSTRUCTIONS.md`
2. `ideas/restructuring-plan.md`
3. `ideas/advanced-agent-lessons.md`
4. `ai-agent-playbook.md`
5. archived reviews

If a conflict cannot be resolved via this ordering:

- Prefer behavior stability.
- Prefer stricter typing.
- Prefer clearer boundaries.
- Avoid introducing new patterns unless explicitly directed.

---

# Architectural Convergence Rule

If:

- A service exists, and
- The controller duplicates its behavior,

Then:

- Route calls through the service.
- Delete the duplicate path.
- Keep behavior identical.
- Ensure CI passes.

This rule takes precedence over “smallest diff” conservatism.

---

# Anti-Stagnation Reminder

The repo favors:

- Mechanical refactors over rewrites.
- Adoption + deletion over extraction-only.
- Clear ownership over layered ambiguity.

Timidity causes architectural drift. Rewrites cause instability.

Convergence via disciplined refactor is the intended path.
