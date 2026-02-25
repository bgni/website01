# Security notes (Archived)

This document is archived. For current NetBox build/runtime loading behavior,
see `docs/data/netbox-catalog-loading.md`.

## Current posture

- Runtime (browser): uses only JSON (`data/netbox-device-types.json`) and does
  **not** parse YAML.
- Build-time: `scripts/buildNetboxCatalog.ts` parses NetBox YAML via Deno std
  (`@std/yaml`).

## TODOs

### Replace YAML parsing ASAP

- **Issue:** YAML parsing happens in JavaScript/TypeScript (Deno std). While the
  Deno stdlib is reputable, YAML parsing has historically been a source of
  security and correctness issues across ecosystems.
- **Goal:** Replace the YAML parsing step with a **non-JS converter**
  (preferably a small Rust binary) that converts NetBox YAML → our JSON index.
- **Desired properties:** pinned version, reproducible build, no network at
  build time, minimal dependencies.

## Tests

- Deno is the only supported test runner (`deno task test`).
- Jest/Node-based tests are intentionally not used.
