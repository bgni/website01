export const typeColor = (type = '') => {
  const t = type.toLowerCase();
  if (t.includes('switch')) return '#22d3ee';
  if (t.includes('router')) return '#34d399';
  if (t.includes('server')) return '#fbbf24';
  return '#c084fc';
};

export const buildAdjacency = (connections) => {
  const adjacency = {};
  connections.forEach((c) => {
    adjacency[c.from.deviceId] = adjacency[c.from.deviceId] || [];
    adjacency[c.to.deviceId] = adjacency[c.to.deviceId] || [];
    adjacency[c.from.deviceId].push({ neighbor: c.to.deviceId, connectionId: c.id });
    adjacency[c.to.deviceId].push({ neighbor: c.from.deviceId, connectionId: c.id });
  });
  return adjacency;
};

export const findShortestPath = (adjacency, start, goal) => {
  if (start === goal) return { nodes: [start], links: [] };
  const queue = [{ node: start, nodes: [start], links: [] }];
  const visited = new Set([start]);
  while (queue.length) {
    const current = queue.shift();
    if (current.node === goal) return current;
    (adjacency[current.node] || []).forEach(({ neighbor, connectionId }) => {
      if (visited.has(neighbor)) return;
      visited.add(neighbor);
      queue.push({ node: neighbor, nodes: [...current.nodes, neighbor], links: [...current.links, connectionId] });
    });
  }
  return null;
};

export const collectHighlights = (adjacency, selectedSet) => {
  const nodes = new Set(selectedSet);
  const links = new Set();
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
