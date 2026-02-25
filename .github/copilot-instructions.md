# Copilot Agent Instructions (website01)

See `docs/AGENT_INSTRUCTIONS.md` for the full, detailed workflow and guardrails.

Key constraints to keep in mind:

- Must keep `deno task ci` green (CI runs Ubuntu, Deno v2.6.10).
- Prefer mechanical refactors with shims; avoid behavior changes bundled with
  moves.
- Keep boundaries explicit:
  - Bootstrap resolves DOM and injects elements (no hard-coded selectors in
    renderers).
  - Controller owns lifecycles (e.g., `ResizeObserver`) and injects IO deps.
- D3 is a browser global; use `getD3()` from `scripts/lib/d3.ts` (no implicit
  global `d3`).
- No `innerHTML` for fixture- or user-derived strings.
