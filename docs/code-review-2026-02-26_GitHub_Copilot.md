# Code Review — website01 (2026-02-26, GitHub Copilot)

## Summary

The app is a Deno + TypeScript static site for network visualization and builder workflows. The architecture is converging toward clear separation: controller (thin orchestration), services (builder, traffic, history), domain (validation), and infrastructure (graph/layout/traffic rendering). Port contracts are actively used for DI. CI is green, and test coverage is focused on high-value logic.

## Strengths

- Service extraction is nearly complete; controller is mostly orchestration.
- Port contracts are defined and adopted for builder and traffic services.
- History service is clean and bounded.
- State management is simple and correct.
- Domain layer validates boundaries.
- Tests cover builder, traffic, and utility logic.
- DI seams are usable and testable.

## Issues

1. **Undo/redo split-brain:** Undo snapshot push is in builderService, but restore is in controller. This makes undo/redo untestable without controller and risks divergence.
2. **Mutable shared state:** `builderStats` is mutated by both controller and builderService. Should be encapsulated behind a port.
3. **Bootstrap inline logic:** Device-type grouping and keyboard shortcuts are inline and untested.
4. **Test coverage gaps:** No tests for controller, historyService, reducers, customTopology, selectors.
5. **String fields:** `trafficSourceKind`, `trafficVizKind`, `layoutKind` are bare strings; should be literal unions.

## Recommendations

- Unify undo/redo ownership in one module.
- Encapsulate shared state behind ports.
- Extract and test bootstrap logic.
- Add tests for controller, historyService, reducers, customTopology.
- Use literal unions for kind fields.
