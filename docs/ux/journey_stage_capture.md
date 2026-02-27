# Journey Stage Capture (JSDOM)

Purpose: generate fast, deterministic visual artifacts for key user journey
stages without booting the full app runtime.

This capture flow uses `jsdom` to render UI control states from fixture data,
then optionally rasterizes screenshots with headless Chromium.

## Why This Exists

- Fast feedback on UX semantics (labels, ordering, obvious next action).
- Repeatable outputs for review diffs.
- Complements, but does not replace, full browser end-to-end checks.

## Generate Stage Artifacts

- HTML only:
  - `deno run --no-lock --allow-read --allow-write tools/capture_journey_stages.ts`
- HTML + PNG screenshots:
  - `deno task ux:capture:journey`

Outputs:

- `docs/ux/captures/journey-stages/*.html`
- `docs/ux/captures/journey-stages/*.png`

## Current Stages

- `01-open-app`
- `02-enter-create-edit`
- `03-picker-generic-switch`
- `04-picker-known-model`
- `05-after-add-switch`

## Notes

- The picker list is intentionally shown in expanded list mode for visibility in
  capture artifacts.
- These captures focus on "what users can recognize and decide," not
  pixel-perfect rendering parity.
