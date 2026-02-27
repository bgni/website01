# Code Review — website01

## Summary

The app has strong architectural momentum: service extraction is real, domain
validation is solid, and the CI/test pipeline catches many regressions. Code
quality is generally good, but editing-specific reliability and UX still depend
on a few overloaded orchestration paths.

## Strengths

- Clear app/domain/infrastructure separation is in place.
- Builder and traffic services are extracted and tested.
- Domain parsing/validation catches fixture and topology boundary issues.
- D3 access and graph infrastructure are centralized.
- Static build path (`build:pages`) is established and working.

## Major Issues (Ordered by Impact)

1. `P1` Undo/redo ownership is split.
   - Snapshot push is in `builderService`; undo/redo execution is in
     `controller`.
   - Risk: harder reasoning, harder testing, higher regression chance.

2. `P1` Network loading is too tightly coupled to traffic startup.
   - Traffic startup failures can cause graph teardown during `loadNetwork`.
   - Risk: users lose topology visibility because telemetry fails.

3. `P1` Custom edit operations currently trigger full graph rebuild paths.
   - `refreshCustomGraph` dispatches topology, destroys graph, remounts graph.
   - Risk: performance/jank under frequent edits; weaker editing feel.

4. `P2` `bootstrap.ts` still contains significant inline behavior logic.
   - Device-type grouping and shortcut wiring are inline and mostly untested.
   - Risk: fragile UX behavior and high maintenance cost.

5. `P2` Orchestration test coverage is thin.
   - Service tests exist, but controller/history/reducer/customTopology
     orchestration gaps remain.
   - Risk: lifecycle regressions surface late.

6. `P2` State and domain typing still has loose seams.
   - Mode/kind fields are bare strings; domain entities remain broadly open.
   - Risk: invalid values pass compile-time checks and require manual review.

7. `P3` Documentation drift exists in historical review docs.
   - Some archived notes describe now-removed architecture states.
   - Risk: future changes guided by stale assumptions.

## Direction Assessment

The project is heading in the right direction technically. To reach “works well
and enjoyable to use” editing quality, next work should prioritize
editing-lifecycle reliability and interaction responsiveness before adding new
features.

## Recommended Focus Areas

1. Unify edit history ownership (undo/redo) and add focused tests.
2. Make network load resilient to traffic-source failures.
3. Reduce rebuild-heavy edit paths with more incremental graph updates.
4. Extract bootstrap inline logic into tested pure modules.
5. Tighten mode/type unions and add orchestration tests.
