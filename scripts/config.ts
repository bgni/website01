export const GRAPH_DEFAULTS = {
  width: 1200,
  height: 720,

  zoom: {
    minScale: 0.5,
    maxScale: 3,
  },

  transitionMs: 220,

  link: {
    defaultWidth: 1.4,
    defaultOpacity: 0.6,
    fanoutPx: 2.4,
    force: {
      distance: 130,
      strength: 0.6,
    },
  },

  layout: {
    tieredMaxHorizontalSpan: 1240,
  },

  simulation: {
    chargeStrength: -260,
    collideRadius: 26,
  },

  node: {
    radius: 12,
    strokeWidth: 2,
    boundsPadding: 20,
  },

  halo: {
    radius: {
      default: 16,
      selected: 18,
    },
    strokeWidth: {
      default: 2,
      selected: 2.5,
    },
    opacity: {
      selected: 0.95,
      highlighted: 0.55,
      none: 0,
    },
  },

  label: {
    fontSize: 11,
    dy: 0,
    yOffset: 24,
    edgeThreshold: 92,
    edgeOffset: 16,
  },

  guides: {
    strokeWidth: 1,
    strokeOpacity: 0.75,
  },

  filters: {
    selectedDim: "brightness(0.65) saturate(0.4)",
    filteredDim: "brightness(0.78) saturate(0.55)",
  },
} as const;

export const GRAPH_COLORS = {
  // Baseline graph palette.
  linkStroke: "#334155",
  nodeStroke: "#0b1220",
  label: "#e2e8f0",
  highlight: "#e2e8f0",
  halo: {
    default: "#e2e8f0",
    highlighted: "#94a3b8",
  },
  guide: "#1f2937",

  // Traffic visualization palette.
  trafficNeutral: "#64748b",
  trafficOverlayFallback: "#38bdf8",
} as const;

export const TRAFFIC_STYLE = {
  downStatus: "down",
  downColor: "#f87171",

  dash: {
    none: "0",
    down: "6 4",
    up: "10 8",
  },

  highlightMinWidth: 3,

  // Utilization-based hue shift (used by the default trafficColor helper).
  utilColor: {
    hotThreshold: 0.9,
    baseHue: 215,
    hotHue: 35,
    saturationBase: 18,
    saturationScale: 32,
    lightnessBase: 26,
    lightnessScale: 46,
  },

  // Rate-based width scaling (Mbps).
  rateWidth: {
    minWidth: 0.7,
    maxWidth: 14,
    maxRateMbps: 10000,
    tinyRateMbps: 0.008,
  },

  // Utilization-based width scaling (0..1).
  utilWidth: {
    minWidth: 1.2,
    maxWidth: 8,
  },
} as const;
