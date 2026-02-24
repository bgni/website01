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

// Domain-boundary heuristic: infer a coarse device kind from the free-form
// `type`/`role` string in fixtures.
export const inferDeviceKindFromType = (type: string): DeviceKind => {
  const t = norm(type);

  // Keep access points distinct from access-layer switches.
  if (t.includes("access point") || t === "ap" || t.includes("wifi")) {
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

  if (t.includes("server")) {
    return DEVICE_KIND_SERVER;
  }

  return DEVICE_KIND_UNKNOWN;
};
