import type { Adjacency } from "./adjacency.ts";
import { findShortestPath } from "./path.ts";

export const collectHighlights = (
  adjacency: Adjacency,
  selectedSet: Set<string>,
) => {
  const nodes = new Set<string>(selectedSet);
  const links = new Set<string>();
  const ids = Array.from(selectedSet);
  if (ids.length === 1) {
    const [single] = ids;
    (adjacency[single] || []).forEach(({ neighbor, connectionId }) => {
      nodes.add(neighbor);
      links.add(connectionId);
    });
  }
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const path = findShortestPath(adjacency, ids[i], ids[j]);
      if (path) {
        path.nodes.forEach((n) => nodes.add(n));
        path.links.forEach((l) => links.add(l));
      }
    }
  }
  return { nodes, links };
};
