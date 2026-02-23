# website01

Network topology visualization (D3) with search, multi-select + shortest-path
highlighting, and traffic-aware link styling.

## Run

- `deno task dev`
- Open http://localhost:8000/

## Test

- `deno task test`
- `deno task validate`

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

- Maintainers: [docs/codebase-review.md](docs/codebase-review.md)
- AI agents: [docs/ai-agent-playbook.md](docs/ai-agent-playbook.md)
- Product/user context: [docs/persona.md](docs/persona.md)
- Design sketches: [docs/ideas/design_ideas.md](docs/ideas/design_ideas.md)
- Security notes: [docs/security.md](docs/security.md)
- Development retrospective: [docs/retrospective.md](docs/retrospective.md)
