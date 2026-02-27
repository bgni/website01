# UX Test: First Switch Discoverability

Purpose: ensure users can add their first switch without catalog expertise and
can also find a specific switch quickly.

Run cadence:

- Required for every UX-impacting change.
- Required for any change touching builder picker/search/catalog ranking.

## Fast Semantic Gate (No Browser Required)

Run this on every picker/search tweak for fast feedback:

- `deno test --no-lock --allow-read scripts/app/builderPickerOptions_test.ts`

This validates discoverability semantics (labels, grouping, known-model lookup)
without waiting for full browser rendering checks.

For visual stage artifacts from fixture-driven states, run:

- `deno task ux:capture:journey`

## Test A: "I just want a normal switch"

### User intent

- Add a basic modern, recognizable switch (for example ~48 x 1GbE access switch)
  without knowing exact model IDs beforehand.

### Steps

1. Open app, enter `Create/Edit`.
2. Open add-device picker without typing in search.
3. Inspect visible switch options.
4. Add one switch that looks like a normal modern access switch.

### Pass criteria

- User can immediately see recognizable switch choices.
- User does not need to type a search string to discover viable options.
- Option labels are legible brand/model choices, not primarily obscure part
  numbers.
- Added device appears and can be used in the normal add/connect flow.

## Test B: "I know the exact switch I want"

### User intent

- Find and add a specific switch model quickly (for example `C9300-48T`,
  `USW-48`, `N1548`).

### Steps

1. In `Create/Edit`, focus add-device search.
2. Enter specific model query.
3. Select the intended option.
4. Add the device.

### Pass criteria

- Search returns the intended model quickly and unambiguously.
- User can select and add the correct switch in one short interaction loop.
- No need to scroll long unrelated lists after query is entered.

## Fail signals (Stop-ship for affected changes)

- Picker initially looks like an overwhelming irrelevant list.
- User must know obscure catalog strings to find any useful switch.
- Generic "normal switch" intent is not satisfied from immediately visible
  options.
- Specific known-model search is noisy, ambiguous, or hard to complete.

## Evidence to record in PR

- Brief observation notes for Test A and Test B.
- If failed, include mitigation plan and follow-up checkpoint.
