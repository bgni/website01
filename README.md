# website01

Network topology visualization (D3) with search, multi-select + shortest-path
highlighting, and traffic-aware link styling.

## Run

- `deno task dev`
- Open http://localhost:8000/

## Test

- `deno task test`
- `deno task validate`

## PR formatting checklist

- Run `deno fmt <changed-files>` right after edits.
- Before opening/finalizing PR, run `deno task fmt`.
- For docs-only changes, run `deno task docs:check`.

## Render SVGs (for docs/verification)

- `deno task render:svgs` (outputs to `docs/rendered/<layout>/`)
- Optional: `deno task render:svgs -- --layouts tiered,force`

## Data model

- Networks live under `data/networks/<networkId>/` and are listed in
  `data/networks/index.json`.
- Devices are defined in `devices.json` as objects like:
  - `id`, `name`, `role` (used by the Layered layout to place tiers)
  - Optional: `site` (preferred for Layered grouping/order), `room_id`,
    `rack_id`, `type_slug`, `description`
- Links are defined in `connections.json` with stable `id`s; traffic generator
  fixtures reference link IDs via `connectionId`.

## Docs

- Docs index (start here): [docs/README.md](docs/README.md)
- Agent docs hub: [docs/agent/README.md](docs/agent/README.md)
- Maintainers (historical review):
  [docs/archive/reviews/review-05-maintainer-baseline.md](docs/archive/reviews/review-05-maintainer-baseline.md)
- AI agents: [docs/ai-agent-playbook.md](docs/ai-agent-playbook.md)
- Architecture lessons:
  [docs/ideas/advanced-agent-lessons.md](docs/ideas/advanced-agent-lessons.md)
- Restructuring plan:
  [docs/ideas/restructuring-plan.md](docs/ideas/restructuring-plan.md)
- NetBox data loading (Deno):
  [docs/data/netbox-catalog-loading.md](docs/data/netbox-catalog-loading.md)
- Product/user context: [docs/persona.md](docs/persona.md)
- Scenario reference (campus):
  [docs/scenarios/campus-network.md](docs/scenarios/campus-network.md)
- Design sketches: [docs/ideas/design_ideas.md](docs/ideas/design_ideas.md)
- Security notes (archived):
  [docs/archive/security-notes.md](docs/archive/security-notes.md)
- Development retrospective: [docs/retrospective.md](docs/retrospective.md)
