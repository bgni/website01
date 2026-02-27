type Rec = Record<string, unknown>;

const toStr = (v: unknown): string => (v == null ? "" : String(v));

const norm = (v: unknown): string => toStr(v).trim().toLowerCase();

// Stable, fast, non-cryptographic hash for deterministic ordering/grouping.
// This is intentionally simple; it only needs to be stable across runs.
const hash32 = (s: string): number => {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return h >>> 0;
};

// Tier order is encoded as numeric indices so downstream layout code can avoid
// string parsing and string comparisons.
//
// 0 internet
// 1 edge
// 2 core
// 3 agg
// 4 access
// 5 service
// 6 endpoint
// 7 unknown
export const TIERED_TIER_UNKNOWN_INDEX = 7;
export const TIERED_TIER_SWITCH_SENTINEL = -1;

const tierIndexForRole = (role: unknown): number => {
  const r = norm(role);

  if (r === "internet" || r === "isp") return 0;
  if (r.includes("access point") || r === "ap" || r.includes("wifi")) return 6;
  if (r.includes("customer edge") || r === "ce") return 6;
  if (r.includes("firewall")) return 1;
  if (r.includes("router") || r.includes("wan") || r.includes("edge")) return 1;

  if (r === "core") return 2;
  if (
    r.includes("distribution") || r.includes("dist") || r.includes("agg") ||
    r.includes("aggregation")
  ) return 3;
  if (r.includes("access")) return 4;

  if (
    r.includes("server") || r.includes("service") || r.includes("dns") ||
    r.includes("idp")
  ) return 5;
  if (
    r.includes("load balancer") || r === "lb" || r.includes("load-balancer")
  ) {
    return 5;
  }

  if (
    r.includes("endpoint") || r.includes("client") ||
    r.includes("workstation") || r.includes("printer")
  ) return 6;
  if (r.includes("iot")) return 6;

  // A generic "switch" needs inference based on topology.
  if (r.includes("switch")) return TIERED_TIER_SWITCH_SENTINEL;

  return TIERED_TIER_UNKNOWN_INDEX;
};

const inferSiteKeyFromFields = (
  { site, room_id, name }: {
    site?: unknown;
    room_id?: unknown;
    name?: unknown;
  },
): string => {
  const explicit = norm(site);
  if (explicit) return explicit;

  const room = norm(room_id);
  if (room) return room;

  const raw = toStr(name).trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();

  if (lower.startsWith("hq ")) return "hq";
  if (lower === "hq") return "hq";

  const branch = lower.match(/^branch\s*[-_]?\s*(\d+)\b/);
  if (branch?.[1]) return `branch-${branch[1]}`;

  if (lower.startsWith("campus ")) return "campus";
  if (lower === "campus") return "campus";

  const bldg = lower.match(/^bldg\s*[-_]?\s*([a-z0-9]+)\b/);
  if (bldg?.[1]) return `bldg-${bldg[1]}`;

  return "";
};

export type TieredLayoutHints = {
  // Numeric tier hint (see tier index map above). Can be -1 for "switch".
  layoutTierIndexHint: number;
  // Numeric grouping/sorting key derived from site/room/name.
  layoutSiteRank: number;
  // Numeric stable key derived from id/name.
  layoutStableKey: number;
};

export const computeTieredLayoutHints = (rec: Rec): TieredLayoutHints => {
  const id = toStr(rec.id).trim();
  const name = toStr(rec.name).trim();
  const role = (rec as { role?: unknown }).role;
  const site = (rec as { site?: unknown }).site;
  const room_id = (rec as { room_id?: unknown }).room_id;

  const layoutTierIndexHint = tierIndexForRole(role);
  const siteKey = inferSiteKeyFromFields({ site, room_id, name });
  const layoutSiteRank = hash32(siteKey);
  const layoutStableKey = hash32(`${id}\n${name}`);

  return { layoutTierIndexHint, layoutSiteRank, layoutStableKey };
};
