# NetBox Catalog Loading (Deno)

Last reviewed: 2026-02-25

This project uses **Deno** for both runtime tooling and build-time data
generation.

## Purpose

The app enriches fixtures with NetBox device-type metadata (ports, model,
thumbnail paths) using a generated JSON catalog.

## Source of truth

- Upstream vendor library: `vendor/netbox-devicetype-library/`
- Generated catalog used by app runtime: `data/netbox-device-types.json`

## Build-time flow (Deno)

1. Parse NetBox YAML files from `vendor/netbox-devicetype-library/device-types`.
2. Normalize records into the app’s catalog schema.
3. Write output to `data/netbox-device-types.json`.

Primary command:

- `deno task build:netbox`

The build task is Deno-based and runs:

- `tools/build_netbox_catalog.ts`

## Runtime flow (browser app)

- Runtime does **not** parse YAML.
- Browser code reads the generated JSON catalog
  (`data/netbox-device-types.json`) and merges/enriches fixture devices by
  `deviceTypeSlug`.

This keeps runtime lean and avoids shipping YAML parsing to the browser.

## Validation and safety

- Fixture validation (`deno task validate`) enforces topology-level consistency.
- Type-check and tests run with Deno tasks (`deno task check`,
  `deno task
  test`).
- Historical notes about YAML parsing risk are archived in
  `docs/archive/security-notes.md`.

## When to update this doc

Update this file when any of these change:

- build script location or command,
- catalog schema or output path,
- runtime enrichment mechanism,
- Deno task names for catalog generation/validation.
