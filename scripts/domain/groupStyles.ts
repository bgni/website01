export type GroupLayoutKind =
  | "free"
  | "grid"
  | "rows"
  | "columns"
  | "dot"
  | "layered"
  | "force";

export type GroupBackgroundColorId =
  | "slate"
  | "gray"
  | "zinc"
  | "blue"
  | "cyan"
  | "teal"
  | "emerald"
  | "green"
  | "lime"
  | "yellow"
  | "indigo"
  | "amber"
  | "orange"
  | "red"
  | "rose"
  | "pink"
  | "violet"
  | "stone";

export const DEFAULT_GROUP_LAYOUT: GroupLayoutKind = "free";
export const DEFAULT_GROUP_BACKGROUND_COLOR: GroupBackgroundColorId = "slate";

export const GROUP_LAYOUT_OPTIONS: Array<
  { id: GroupLayoutKind; label: string }
> = [
  { id: "free", label: "Free" },
  { id: "grid", label: "Grid" },
  { id: "rows", label: "Rows" },
  { id: "columns", label: "Columns" },
  { id: "dot", label: "DOT" },
  { id: "layered", label: "Layered" },
  { id: "force", label: "Force" },
];

export const GROUP_BACKGROUND_COLOR_OPTIONS: Array<
  { id: GroupBackgroundColorId; label: string; hex: string }
> = [
  { id: "slate", label: "Slate", hex: "#334155" },
  { id: "gray", label: "Gray", hex: "#4b5563" },
  { id: "zinc", label: "Zinc", hex: "#52525b" },
  { id: "stone", label: "Stone", hex: "#57534e" },
  { id: "blue", label: "Blue", hex: "#1d4ed8" },
  { id: "indigo", label: "Indigo", hex: "#4338ca" },
  { id: "violet", label: "Violet", hex: "#7c3aed" },
  { id: "pink", label: "Pink", hex: "#be185d" },
  { id: "rose", label: "Rose", hex: "#be123c" },
  { id: "red", label: "Red", hex: "#b91c1c" },
  { id: "orange", label: "Orange", hex: "#c2410c" },
  { id: "amber", label: "Amber", hex: "#b45309" },
  { id: "yellow", label: "Yellow", hex: "#a16207" },
  { id: "lime", label: "Lime", hex: "#4d7c0f" },
  { id: "green", label: "Green", hex: "#166534" },
  { id: "emerald", label: "Emerald", hex: "#047857" },
  { id: "teal", label: "Teal", hex: "#0f766e" },
  { id: "cyan", label: "Cyan", hex: "#0e7490" },
];

const GROUP_LAYOUT_SET = new Set<string>(
  GROUP_LAYOUT_OPTIONS.map((option) => option.id),
);

const GROUP_BACKGROUND_COLOR_SET = new Set<string>(
  GROUP_BACKGROUND_COLOR_OPTIONS.map((option) => option.id),
);

const GROUP_BACKGROUND_COLOR_HEX = new Map<string, string>(
  GROUP_BACKGROUND_COLOR_OPTIONS.map((option) => [option.id, option.hex]),
);

export const normalizeGroupLayout = (value: unknown): GroupLayoutKind => {
  const normalized = typeof value === "string"
    ? value.trim().toLowerCase()
    : "";
  if (GROUP_LAYOUT_SET.has(normalized)) return normalized as GroupLayoutKind;
  return DEFAULT_GROUP_LAYOUT;
};

export const normalizeGroupBackgroundColor = (
  value: unknown,
): GroupBackgroundColorId => {
  const normalized = typeof value === "string"
    ? value.trim().toLowerCase()
    : "";
  if (GROUP_BACKGROUND_COLOR_SET.has(normalized)) {
    return normalized as GroupBackgroundColorId;
  }
  return DEFAULT_GROUP_BACKGROUND_COLOR;
};

export const resolveGroupBackgroundHex = (value: unknown): string => {
  const normalized = normalizeGroupBackgroundColor(value);
  return GROUP_BACKGROUND_COLOR_HEX.get(normalized) ??
    GROUP_BACKGROUND_COLOR_HEX.get(DEFAULT_GROUP_BACKGROUND_COLOR) ??
    "#334155";
};
