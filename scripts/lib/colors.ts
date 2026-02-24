export const typeColor = (type = "") => {
  const t = type.toLowerCase();
  // Keep access points distinct from access-layer switches.
  if (t.includes("access point") || t === "ap" || t.includes("wifi")) {
    return "#c084fc";
  }

  if (
    t.includes("switch") ||
    t === "core" ||
    t === "access" ||
    t.includes("distribution") ||
    t.includes("aggregation") ||
    t === "agg"
  ) return "#22d3ee";

  if (t.includes("router") || t.includes("customer edge")) return "#34d399";
  if (t.includes("server")) return "#fbbf24";
  return "#c084fc";
};
