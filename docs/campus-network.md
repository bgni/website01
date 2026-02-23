# Campus network structure (typical)

This repo includes a `campus` fixture labeled “3-tier redundancy”. A real-world
campus network is usually organized around:

- **Edge** (Internet/WAN handoff + firewall/edge routing)
- **Campus core** (high-speed, resilient backbone)
- **Building distribution** (IDF/MDF aggregation per building or zone)
- **Access** (edge switches feeding APs/phones/endpoints)

The key idea: _buildings are “spokes” off a resilient core_, and access devices
don’t cross-connect between buildings.

## High-level physical structure

```mermaid
flowchart TB
  inet([Internet / WAN])
  fw[Firewall / Edge router]

  subgraph core[Campus core]
    c1[Core 1]
    c2[Core 2]
    c1 --- c2
  end

  subgraph a[Building A (IDF)]
    ad1[Dist/Agg 1]
    ad2[Dist/Agg 2]
    ad1 --- ad2
    aa1[Access 1]
    aa2[Access 2]
    ad1 --> aa1
    ad2 --> aa2
    apA[(APs / users)]
    aa1 --> apA
    aa2 --> apA
  end

  subgraph b[Building B (IDF)]
    bd1[Dist/Agg 1]
    bd2[Dist/Agg 2]
    bd1 --- bd2
    ba1[Access 1]
    ba2[Access 2]
    bd1 --> ba1
    bd2 --> ba2
    apB[(APs / users)]
    ba1 --> apB
    ba2 --> apB
  end

  subgraph svc[Campus services]
    dns[(DNS/DHCP)]
    idp[(IdP / Auth)]
  end

  inet --> fw
  fw --> c1
  fw --> c2

  %% Each building dual-homes into the core (often to both core switches)
  c1 --> ad1
  c2 --> ad2

  c1 --> bd1
  c2 --> bd2

  %% Services usually sit in a datacenter/MDF and connect to the core
  c1 --> dns
  c2 --> idp
```

## Redundancy patterns (what’s common)

- **Core** is typically a redundant pair (or more) with high-speed links.
- **Building distribution** is often a pair (stack/MLAG/vPC depending on
  vendor).
- **Access switches** are usually single-homed to the building distribution
  layer for simplicity.
  - Some designs dual-home access, but it adds complexity (STP/MLAG edge cases)
    and can be noisy on diagrams.

## L2/L3 design (common approaches)

Two common patterns:

1. **L3 to the access** (modern, scalable)

- Access switches have routed uplinks, VLANs terminate closer to access.
- The campus core routes between segments.

2. **L2 at the edge, L3 at distribution/core** (traditional)

- VLANs extend to the access; STP/MLAG handles loops.
- Distribution/core provides SVIs and routing.

## Typical traffic flows

- **User → Internet**: access → building distribution → campus core →
  firewall/edge → Internet
- **User → campus service (DNS/IdP)**: access → distribution → core → service
- **Inter-building**: building distribution/core handles routing; traffic does
  _not_ hairpin through access.

## Mapping to this repo’s `campus` fixture

In the fixture:

- `Campus Internet` → `Campus Firewall` → `Campus Core 1/2`
- Each building has `Agg 1/2` in its IDF and `Access 1/2` feeding APs
- Campus services (`DNS/DHCP`, `IdP`) attach to the core

This matches the “core + per-building distribution + access” mental model that’s
common for campus networks.
