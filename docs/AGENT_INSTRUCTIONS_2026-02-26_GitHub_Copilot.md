# Agent Instructions — website01 (2026-02-26, GitHub Copilot)

- Target OS: Linux (CI runs Ubuntu, Deno v2.6.10).
- Keep boundaries explicit: DI via port contracts for DOM/IO.
- Controller should orchestrate; services implement behavior; domain validates boundaries; infrastructure renders.
- Port contracts: All service dependencies must be expressed as named port types in `ports.ts`. Prefer many small ports.
- Unify undo/redo ownership: All snapshot creation/restoration must be owned by one module.
- Shared state (e.g., builderStats): Encapsulate behind a port with explicit get/set methods.
- Extract inline logic from bootstrap (device-type grouping, keyboard shortcuts) to tested modules.
- Add tests for controller, historyService, reducers, customTopology, selectors.
- Use string literal unions for kind fields (not bare string).
- No new implicit any; exported functions must declare return types.
- JSON must be parsed as unknown and validated before use.
- No innerHTML for fixture/user-derived strings.
- CI must pass: lint, check, test, validate, build:pages.
- Definition of Done: New/modified services have tests; port contracts used for service deps; architecture improved or preserved.
