export type SortKey = "name" | "brand" | "model" | "type" | "ports";
export type SortDir = "asc" | "desc";

export type SearchableDevice = {
  name: string;
  brand: string;
  model: string;
  type: string;
  ports?: unknown[];
};

type Sorter<T> = (a: T, b: T) => number;

const sorters: Record<SortKey, Sorter<SearchableDevice>> = {
  name: (a, b) => a.name.localeCompare(b.name),
  brand: (a, b) => a.brand.localeCompare(b.brand),
  model: (a, b) => a.model.localeCompare(b.model),
  type: (a, b) => a.type.localeCompare(b.type),
  ports: (a, b) => (a.ports?.length ?? 0) - (b.ports?.length ?? 0),
};

export const applyFilter = <T extends SearchableDevice>(
  list: T[],
  query: string,
): T[] => {
  if (!query.trim()) return list;
  const q = query.toLowerCase();
  return list.filter((d) =>
    d.name.toLowerCase().includes(q) ||
    d.brand.toLowerCase().includes(q) ||
    d.model.toLowerCase().includes(q) ||
    d.type.toLowerCase().includes(q)
  );
};

export const applySort = <T extends SearchableDevice>(
  list: T[],
  key: SortKey = "name",
  dir: SortDir = "asc",
): T[] => {
  const sorter: Sorter<T> = (sorters[key] as Sorter<T>) || (sorters.name as Sorter<T>);
  const sorted = [...list].sort(sorter);
  return dir === "desc" ? sorted.reverse() : sorted;
};

export const paginate = <T>(list: T[], page: number, pageSize: number): T[] => {
  const start = (page - 1) * pageSize;
  return list.slice(start, start + pageSize);
};
