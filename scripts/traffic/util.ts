export const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

export const isObject = (v: unknown): v is Record<string, unknown> =>
  v != null && typeof v === "object" && !Array.isArray(v);

export const asArray = <T>(
  v: unknown,
): T[] => (Array.isArray(v) ? (v as T[]) : []);
