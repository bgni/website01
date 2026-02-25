Here’s a **target repo structure** that cleanly separates: **tooling vs
runtime**, **domain vs UI vs rendering**, and **algorithms vs
integrations**—without turning it into an enterprise monolith.

I’m going to present it as:

1. A **tree** with short “what lives here” notes
2. **Motivations + boundaries** (rules you can enforce)
3. **Examples** of what code moves where (from your current files)

---

## Target structure (tree)

```
website01/
├── README.md
├── deno.json
├── deno.lock
├── main.ts                         # Deno dev server (local only)
├── index.html                       # Browser entry point (dev)
├── styles.css
├── data/
│   └── networks/
│       └── ...                      # JSON fixtures
├── scripts/                         # Browser/runtime code only
│   ├── app/
│   │   ├── bootstrap.ts             # Creates the app, wires deps once
│   │   ├── controller.ts            # Orchestrates side effects (load/start/stop/update)
│   │   ├── store.ts                 # Store implementation (dispatch/subscribe)
│   │   ├── state.ts                 # State shape (pure), initialState()
│   │   ├── actions.ts               # Action union + action creators
│   │   ├── reducers.ts              # reduce(state, action) -> state (pure)
│   │   └── selectors.ts             # Derived queries: filteredDevices(), selectedConnections(), etc.
│   │
│   ├── domain/
│   │   ├── types.ts                 # Device/Connection/TrafficUpdate + ids + enums
│   │   ├── fixtureSchema.ts         # Runtime guards/validators, normalization
│   │   ├── fixtureLoader.ts         # Fetch/read JSON + validate -> typed domain objects
│   │   ├── graphModel.ts            # Build adjacency/indexes from domain objects
│   │   └── errors.ts                # Typed errors: FixtureError, ValidationError, etc.
│   │
│   ├── ui/
│   │   ├── root.ts                  # Root layout, mounts panels, owns DOM nodes
│   │   ├── controls/
│   │   │   ├── layoutPicker.ts       # Dropdown binding -> dispatch(Action)
│   │   │   ├── trafficToggle.ts      # Start/stop traffic
│   │   │   └── statusBar.ts
│   │   ├── panels/
│   │   │   ├── searchPanel.ts        # Search UI + results list/table
│   │   │   ├── selectedPanel.ts      # Selected devices/cards
│   │   │   └── detailsPanel.ts       # Optional: device details, ports, etc.
│   │   ├── dom/
│   │   │   ├── el.ts                 # Small DOM helpers (createEl, mount, clear, etc.)
│   │   │   └── safeText.ts           # textContent-only helpers, no innerHTML
│   │   └── styles/
│   │       └── classes.ts            # Central CSS class names (optional)
│   │
│   ├── graph/                        # Visualization engine (browser)
│   │   ├── graph.ts                  # Facade: createGraph(...) -> {update, destroy, ...}
│   │   ├── renderer.ts               # D3/SVG rendering core (no app state knowledge)
│   │   ├── interaction.ts            # click/drag/zoom handlers -> callbacks
│   │   ├── styling.ts                # Map domain -> styles (selected, path, traffic status)
│   │   ├── layout/
│   │   │   ├── registry.ts           # Map<string, LayoutFn> for graph module only
│   │   │   ├── tiered.ts
│   │   │   └── force.ts
│   │   ├── traffic/
│   │   │   ├── adapter.ts            # Integrates connector + visualization plugins
│   │   │   ├── connector.ts          # Fetch/poll/stream traffic updates
│   │   │   ├── types.ts              # Traffic payload internal types (if needed)
│   │   │   └── visualization/
│   │   │       ├── registry.ts
│   │   │       ├── NONE.ts
│   │   │       └── D3Links.ts
│   │   └── viewModel.ts              # Domain -> render nodes/links mapping
│   │
│   ├── lib/                          # Pure utilities (no DOM, no D3)
│   │   ├── collections.ts            # groupBy, uniqBy, stableSort
│   │   ├── graphAlgorithms.ts        # shortestPath, bfs, connectedComponents
│   │   ├── ids.ts                    # id helpers, stable key generation
│   │   └── assert.ts                 # invariant(), unreachable(), etc.
│   │
│   └── entry.ts                      # Browser entry point (imports bootstrap)
│
├── tools/                            # Deno tooling (not shipped to browser)
│   ├── build_pages.ts                # Produce dist/ (replaces scripts/buildPages.ts)
│   ├── validate_fixtures.ts          # Validate JSON fixtures for CI
│   ├── render_svgs.ts                # Generate reference renders (optional)
│   └── deps.ts                       # Tooling-only deps/version pins (optional)
│
├── dist/                             # Generated output (gitignored or built in CI)
└── .github/
    └── workflows/
        ├── ci.yml
        └── static.yml
```

---

## Boundary rules (what belongs where)

### 1) `tools/**` vs `scripts/**`

**Rule:** If it runs in CI/build time or reads/writes the filesystem →
`tools/**`. If it runs in the browser → `scripts/**`.

**Motivation:** You complained about `buildPages.ts` and `graph.ts` “mixing two
different things”. That’s exactly this: build tooling shouldn’t live beside
runtime modules because it breaks the mental model of what `scripts/` means.

**Example move:**

- `scripts/buildPages.ts` → `tools/build_pages.ts` (and update `deno.json` tasks
  accordingly) This is a pure readability win. No behavior changes.

---

### 2) Domain is not UI, and UI is not rendering

You currently have domain types (`Device`, `State`) in `scripts/main.ts`.
([raw](https://raw.githubusercontent.com/bgni/website01/master/scripts/main.ts))

**Rule:** Domain types and invariants live in `scripts/domain/**`. UI components
live in `scripts/ui/**`. Rendering engine lives in `scripts/graph/**`.

**Motivation:** It prevents “fat main.ts”. It also makes it clear what can be
tested without a DOM.

**Concrete:**

- `scripts/domain/types.ts`: Device/Connection/TrafficUpdate
- `scripts/app/state.ts`: State shape (selection, filters, chosen layout, etc.)
- `scripts/ui/panels/searchPanel.ts`: DOM creation & event handlers, but no
  direct graph calls
- `scripts/graph/renderer.ts`: D3 code, but no app-specific filtering/search
  logic

---

### 3) “Pure” code must be importable everywhere

**Rule:** Anything algorithmic or reusable that doesn’t need DOM/D3 belongs in
`scripts/lib/**`.

**Motivation:** Your shortest-path and adjacency-building logic becomes testable
and reusable. If it’s in `graph.ts` or `main.ts`, it gets dragged into UI and
side-effect concerns.

**Examples:**

- `shortestPath()`, `buildAdjacency()`, `stableSort()` →
  `scripts/lib/graphAlgorithms.ts` / `scripts/lib/collections.ts`
- These modules should have no dependency on D3 or DOM.

---

### 4) `scripts/app/**` is the only place with “orchestration”

**Rule:** Only the `controller` (or app layer) is allowed to:

- load fixtures
- start/stop traffic polling
- create graph instance
- subscribe to store changes and trigger graph updates

Everything else is a leaf module.

**Motivation:** Stops “random modules mutate state / call graph.update” bugs.
Keeps side-effects centralized.

**Example:**

- `controller.ts` does:

```ts
store.subscribe((state) => {
  graph.update(viewModelFromState(state));
});

dispatch({ type: "LOAD_NETWORK_REQUEST", ...});
```

The UI dispatches actions; it does not imperatively “do things”.

---

## What each “major” file contains (content guide)

### `scripts/domain/types.ts`

- Only types + small type helpers.
- No D3, no DOM, no fetch.

```ts
export type DeviceId = string;
export type ConnectionId = string;

export interface Device { id: DeviceId; name: string; role?: string; ... }
export interface Connection { id: ConnectionId; from: {deviceId: DeviceId}; to: {deviceId: DeviceId}; ... }
export interface NetworkFixture { devices: Device[]; connections: Connection[]; ... }
```

### `scripts/domain/fixtureLoader.ts`

- `fetch()` the JSON and validate using guards.

```ts
export async function loadNetworkFixture(url: string): Promise<NetworkFixture> {
  const raw = await (await fetch(url)).json();
  return parseNetworkFixture(raw); // throws ValidationError
}
```

### `scripts/app/state.ts`

- `State` shape and `initialState()`.
- Must be pure.

```ts
export interface State {
  network?: NetworkFixture;
  selectedDeviceIds: Set<string>;
  filter: { query: string; role?: string; };
  layout: { id: string; options: ... };
  traffic: { enabled: boolean; mode: string; lastUpdate?: number; };
}
```

### `scripts/app/reducers.ts`

- `reduce(state, action)` only.
- No DOM, no D3, no network calls.

### `scripts/app/controller.ts`

- The orchestrator: load fixture → dispatch result; create graph; manage traffic
  lifecycle.

Typical responsibilities:

- `onInit()`: load default network index / list
- `onNetworkSelected()`: load network fixture; build model indexes; dispatch
- `onTrafficToggle()`: start/stop connector; dispatch updates
- `onStateChanged()`: update graph

### `scripts/graph/graph.ts` (facade)

- Exposes a stable API to the app layer:

```ts
export function createGraph(
  mountEl: HTMLElement,
  callbacks: Callbacks,
): GraphHandle;

export interface GraphHandle {
  update(vm: GraphViewModel): void;
  destroy(): void;
}
```

### `scripts/graph/renderer.ts`

- Pure rendering: given nodes/links and styling callbacks, draw/update D3
  selections.

### `scripts/graph/viewModel.ts`

- Converts `NetworkFixture + selection + computed path highlights + traffic` →
  `GraphViewModel` (render friendly types).

This is where you ensure the renderer doesn’t need to know your domain details.

---

## Why this structure works for your repo specifically

Because you already have plugin-ish boundaries:

- Layout registry (`scripts/layouts/registry.ts`)
  ([raw](https://raw.githubusercontent.com/bgni/website01/master/scripts/layouts/registry.ts))
- Traffic visualization registry (`scripts/trafficFlowVisualization/*`)
  ([raw](https://raw.githubusercontent.com/bgni/website01/master/scripts/trafficFlowVisualization/registry.ts))

The target structure simply makes those boundaries explicit and prevents
“main.ts becomes the god object”.

---

## Concrete mapping from today → target (example moves)

- `scripts/buildPages.ts` → `tools/build_pages.ts`
  ([raw](https://raw.githubusercontent.com/bgni/website01/master/scripts/buildPages.ts))
- `scripts/main.ts` (browser) gets split into:

  - `scripts/entry.ts` (tiny)
  - `scripts/app/bootstrap.ts`
  - `scripts/app/controller.ts`
  - `scripts/app/state.ts` (+ reducers/actions/selectors)
  - `scripts/ui/*` (render panels)
- `scripts/graph.ts` becomes:

  - `scripts/graph/graph.ts` (public)
  - `scripts/graph/renderer.ts` (D3 core)
  - `scripts/graph/layout/*` (moved from `scripts/layouts/*` if you want
    graph-local)
  - `scripts/graph/traffic/*` (moved from connector/viz paths)
  - `scripts/graph/viewModel.ts`

(You can keep your current `scripts/layouts/*` and
`scripts/trafficFlowVisualization/*` paths and just wrap them via adapters if
you prefer minimal churn.)

---

## One enforcement mechanism (prevents regressions)

Adopt these import rules:

- `scripts/ui/**` may import from:

  - `scripts/app/*` (dispatch types only)
  - `scripts/domain/*` (types only)
  - `scripts/lib/*`
- `scripts/graph/**` may import from:

  - `scripts/domain/*`
  - `scripts/lib/*`
  - D3
- `scripts/domain/**` may import only from `scripts/lib/**`
- `scripts/lib/**` imports nothing repo-local (pure)

This prevents “UI quietly imports renderer and mutates it directly”.
