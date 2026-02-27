export const DEVICE_KIND_UNKNOWN = 0 as const;
export const DEVICE_KIND_ACCESS_POINT = 1 as const;
export const DEVICE_KIND_SWITCH = 2 as const;
export const DEVICE_KIND_ROUTER = 3 as const;
export const DEVICE_KIND_SERVER = 4 as const;

export type DeviceKind =
  | typeof DEVICE_KIND_UNKNOWN
  | typeof DEVICE_KIND_ACCESS_POINT
  | typeof DEVICE_KIND_SWITCH
  | typeof DEVICE_KIND_ROUTER
  | typeof DEVICE_KIND_SERVER;

const norm = (s: string): string => s.trim().toLowerCase();

const hasAccessPointToken = (text: string): boolean => {
  if (
    text.includes("access point") ||
    text.includes("wireless access point") ||
    text.includes("wireless ap") ||
    text.includes("wifi")
  ) {
    return true;
  }
  // Match stand-alone `ap`/`wap` tokens in slugs or role labels such as:
  // `ap/u6-lr`, `role=ap`, `wap-1`.
  return /(^|[^a-z0-9])(ap|wap)([^a-z0-9]|$)/.test(text);
};

// Domain-boundary heuristic: infer a coarse device kind from the free-form
// `type`/`role` string in fixtures.
export const inferDeviceKindFromType = (type: string): DeviceKind => {
  const t = norm(type);

  // Keep access points distinct from access-layer switches.
  if (hasAccessPointToken(t)) {
    return DEVICE_KIND_ACCESS_POINT;
  }

  if (
    t.includes("switch") ||
    t === "core" ||
    t === "access" ||
    t.includes("distribution") ||
    t.includes("aggregation") ||
    t === "agg"
  ) {
    return DEVICE_KIND_SWITCH;
  }

  if (t.includes("router") || t.includes("customer edge")) {
    return DEVICE_KIND_ROUTER;
  }

  if (
    t.includes("server") ||
    t.includes("load balancer") ||
    t.includes("load-balancer") ||
    t === "lb"
  ) {
    return DEVICE_KIND_SERVER;
  }

  return DEVICE_KIND_UNKNOWN;
};
