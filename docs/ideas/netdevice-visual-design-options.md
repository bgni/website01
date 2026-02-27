# Netdevice Visual Design Options

Goal: replace generic round dots with visuals that communicate device role,
model confidence, and port capability faster.

## Option A: NetBox Thumbnail Card Marker

- Shape: rounded square marker (40-56px) with NetBox `thumbPng/thumbJpg` image.
- Overlay badges: top-left kind badge (`SW`, `RTR`, `SRV`), bottom-right
  port-speed badge (`10G`, `25G x4`).
- Fallback: semantic icon when thumbnail is missing.
- Best for: realistic hardware recognition and demos.

## Option B: Semantic Glyph + Port Ring

- Shape: icon-driven marker (switch/router/server glyph) with a segmented ring
  around it.
- Ring segments map to available interface classes (for example `1G`, `10G`,
  `25G`).
- Hover/selection expands a compact port legend inline.
- Best for: high-density maps where image thumbnails are too noisy.

## Option C: Device Chip (Mini Card)

- Shape: horizontal chip with icon + short model + one-line port summary.
- Example summary: `24x1G, 4x10G`.
- Selection expands chip into advanced details in the right panel.
- Best for: operators who care more about capabilities than physical appearance.

## Option D: Hybrid Adaptive Marker

- Zoomed out: semantic glyph marker (clean and readable).
- Zoomed in: auto-upgrade to thumbnail card marker with badges.
- Keeps map legible at scale but detailed when inspecting.
- Best for: large topologies with mixed workflows.

## Recommended Direction

1. Start with Option D (hybrid) because it balances scale and detail.
2. Use NetBox thumbnails only at medium/high zoom or when selected.
3. Keep port info as typed summaries (`count x type`) rather than raw totals.
4. Keep all markers same visual footprint to avoid layout jitter.

## Notes for Implementation

- Use existing `thumbPng/thumbJpg` from device type data when available.
- Cache image loads and fall back to semantic icon immediately on error.
- Keep contrast high enough to preserve traffic overlays and selection halos.
