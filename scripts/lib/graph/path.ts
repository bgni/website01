import type { Adjacency } from "./adjacency.ts";

type PathState = { node: string; nodes: string[]; links: string[] };

export const findShortestPath = (
  adjacency: Adjacency,
  start: string,
  goal: string,
): PathState | null => {
  if (start === goal) return { node: start, nodes: [start], links: [] };
  const queue: PathState[] = [{ node: start, nodes: [start], links: [] }];
  const visited = new Set<string>([start]);
  while (queue.length) {
    const current = queue.shift();
    if (!current) break;
    if (current.node === goal) return current;
    (adjacency[current.node] || []).forEach(({ neighbor, connectionId }) => {
      if (visited.has(neighbor)) return;
      visited.add(neighbor);
      queue.push({
        node: neighbor,
        nodes: [...current.nodes, neighbor],
        links: [...current.links, connectionId],
      });
    });
  }
  return null;
};
