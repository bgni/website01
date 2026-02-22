const sorters = {
  name: (a, b) => a.name.localeCompare(b.name),
  brand: (a, b) => a.brand.localeCompare(b.brand),
  model: (a, b) => a.model.localeCompare(b.model),
  type: (a, b) => a.type.localeCompare(b.type),
  ports: (a, b) => a.ports.length - b.ports.length,
};

export const applyFilter = (list, query) => {
  if (!query.trim()) return list;
  const q = query.toLowerCase();
  return list.filter((d) =>
    d.name.toLowerCase().includes(q) ||
    d.brand.toLowerCase().includes(q) ||
    d.model.toLowerCase().includes(q) ||
    d.type.toLowerCase().includes(q)
  );
};

export const applySort = (list, key = 'name', dir = 'asc') => {
  const sorter = sorters[key] || sorters.name;
  const sorted = [...list].sort(sorter);
  return dir === 'desc' ? sorted.reverse() : sorted;
};

export const paginate = (list, page, pageSize) => {
  const start = (page - 1) * pageSize;
  return list.slice(start, start + pageSize);
};
