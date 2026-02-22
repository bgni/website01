# Target users & problems

**Primary user:** Network operations engineers/analysts in small-to-medium environments (1–50 network devices, up to a few hundred endpoints) who balance uptime, troubleshooting, and change validation without a full NMS stack.

## Daily needs
- Maintain situational awareness: see topology, role, and health at a glance.
- Spot anomalies quickly: down links/devices, asymmetric routing, or noisy segments.
- Triage incidents: identify blast radius, impacted services, and likely root causes.
- Validate changes: confirm traffic shifts after maintenance or failover tests.
- Communicate state: export/share views for tickets, handoffs, or postmortems.

## Common pain points
- Fragmented tools: CLI + ad-hoc diagrams + logs; no single, live view.
- Hidden dependencies: lateral/indirect paths aren’t obvious, slowing RCA.
- Alert overload: hard to distinguish “loud but okay” from truly broken paths.
- Mobile/on-call use: limited screen space makes navigation slow.

## How this app helps
- **Topology-first view** with live link state/traffic to surface hot or broken paths.
- **Multi-select shortest-path highlighting** to reveal dependencies and blast radius.
- **Search + selection drawer** to jump to nodes and inspect details without a full table.
- **Traffic-aware styling** (rate-proportional widths, distinct down-state) for quick glances.
- **Modular data sources** (JSON now, APIs next) to evolve toward live telemetry without reworking UI.

## Next UX priorities
- Make selection drawer (Idea A) the default detail surface; add chip row (Idea D) on mobile to save space.
- Add quick actions: fit-to-view, zoom presets, clear selection, and an Alerts widget (Idea C).
- Surface per-link mini-metrics (loss, utilization, errors) and timestamps to speed RCA.
- Improve mobile layout: responsive graph height, collapsible drawer, and large tap targets for search/dropdown.
