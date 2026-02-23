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

type ConnectionEnd = { deviceId: string };
type Connection = { id: string; from: ConnectionEnd; to: ConnectionEnd };

export type AdjacencyEntry = { neighbor: string; connectionId: string };
export type Adjacency = Record<string, AdjacencyEntry[]>;

export const buildAdjacency = (connections: Connection[]): Adjacency => {
  const adjacency: Adjacency = {};
  connections.forEach((c) => {
    adjacency[c.from.deviceId] = adjacency[c.from.deviceId] || [];
    adjacency[c.to.deviceId] = adjacency[c.to.deviceId] || [];
    adjacency[c.from.deviceId].push({
      neighbor: c.to.deviceId,
      connectionId: c.id,
    });
    adjacency[c.to.deviceId].push({
      neighbor: c.from.deviceId,
      connectionId: c.id,
    });
  });
  return adjacency;
};

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
