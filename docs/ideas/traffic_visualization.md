# Traffic visualization ideas

Context: The current graph encodes traffic primarily via link color (status/utilization buckets) and link width (rateMbps). The goal is to make traffic feel more “alive” and easier to read at a glance without overwhelming the topology.

## A. Motion-based encodings (makes change obvious)

### 1) Moving dashes (rate = speed)
**Concept**: Keep the link stroke a constant width (or modest width), and render traffic as a dashed overlay that “flows” along the cable.
- **Status**: down = static dashed red (or broken segments)
- **Utilization**: dash opacity or dash density
- **Rate**: dash animation speed (stroke-dashoffset)

**Implementation sketch (D3/SVG)**
- Draw two lines per link:
  - Base cable line: muted solid stroke.
  - Traffic overlay line: bright stroke, dashed.
- Update per tick:
  - `dashLength = f(utilization)`
  - `speed = f(rateMbps)`
  - Animate by incrementing `stroke-dashoffset` on a timer (requestAnimationFrame) using each link’s speed.

**Pros**: Intuitive “flow”, makes changes visible even when color/width differences are subtle.
**Cons**: Animation can be distracting on dense graphs; needs performance care.

### 2) Particle “packets” (rate = particle count, speed)
**Concept**: Emit small dots/triangles that travel along the link.
- **Rate**: particles per second (and/or speed)
- **Utilization**: particle brightness or size
- **Status**: down = no particles; degraded = intermittent particles

**Implementation sketch**
- For each link, maintain a small particle pool.
- On each animation frame: advance particles along the link vector and recycle.
- Limit particles globally (cap total) for performance.

**Pros**: Very readable; direction can be shown.
**Cons**: More code; can look busy if uncapped.

### 3) Traveling “pulse” (utilization spikes)
**Concept**: Instead of continuous motion, show occasional pulses that travel when utilization crosses thresholds.
- **Utilization**: pulse frequency and glow strength
- **Rate**: pulse length or speed

**Pros**: Less distracting than constant motion.
**Cons**: Not as good for steady high-load links.

## B. Clarity-based encodings (reduces ambiguity)

### 4) Two-channel link: outer = capacity, inner = current rate
**Concept**: Represent each link as a “tube”.
- Outer stroke width: link capacity (if available later)
- Inner stroke width: current rate
- Color: status/utilization

**Implementation sketch**
- Draw two strokes: thick dark “capacity” + thinner colored “current”.

**Pros**: Separates “how big the pipe is” from “how busy it is”.
**Cons**: Requires capacity metadata to fully land (but can start with uniform outer width).

### 5) Color = status, width = utilization (not rate)
**Concept**: Humans estimate relative thickness better when it maps to a 0..1 fraction.
- Width: utilization (0..1)
- Color: status (up/warn/down)
- Optional label/tooltip shows rateMbps

**Pros**: Less jittery; utilization is naturally bounded.
**Cons**: Loses absolute throughput feeling.

### 6) Quantized styling (avoid “noisy” jitter)
**Concept**: Snap rates/utilization to buckets to reduce flicker.
- Example buckets: rate {0, 10, 50, 200, 1000, 10000}
- utilization {0–0.2, 0.2–0.5, 0.5–0.8, 0.8–1.0}

**Pros**: Stabilizes the map; easier comparisons.
**Cons**: Less precise.

## C. Direction & asymmetry (when you have A→B flows)

### 7) Directional arrows (rate = arrow density)
**Concept**: Use repeating arrow markers along the link.
- Direction: arrow direction
- Rate: arrow spacing / movement speed

**Implementation sketch**
- Use an SVG `marker` or repeated path pattern.
- Animate pattern transform or dash offset.

**Pros**: Great for showing direction.
**Cons**: Requires direction data (today we treat traffic per connection as scalar).

### 8) Split link (half-stroke each direction)
**Concept**: Render two parallel strokes for uplink/downlink.

**Pros**: Very informative.
**Cons**: More space; requires directional metrics.

## D. Information layering (keep topology first)

### 9) Show traffic only on “focus”
**Concept**: On selection (or filter), show strong traffic visuals only for highlighted paths; keep background links subdued.

**Pros**: Prevents clutter; aligns with existing shortest-path highlight UX.
**Cons**: Less “global NOC view” feel.

### 10) Tiny inline label at midpoint (only when large)
**Concept**: Display `rateMbps` label only for links above a threshold.

**Pros**: Quick numeric read.
**Cons**: Text overlap in dense graphs.

## E. Recommended combinations (practical next steps)

### Option 1 (minimal code, big win)
- Keep current color mapping.
- Change width mapping to utilization (bounded).
- Add moving dashed overlay for rate (speed).

### Option 2 (most “alive”)
- Base cable line muted.
- Particles for high-rate links only (rate threshold).
- Down links dashed red.

### Option 3 (stability-first)
- Quantize utilization + rate.
- No animation.
- Emphasize high utilization with glow/pulse.

## Notes for our current code
- Our current `graph.updateTraffic()` stores traffic by `connectionId`, and `update()` re-styles links. Any animated approach should:
  - avoid re-creating DOM elements each tick,
  - use a single RAF loop and read per-link “speed” from a cached map.
- We currently don’t model direction; any “flow direction” should either be omitted or faked (e.g., arbitrary direction) until we add real directional metrics.
