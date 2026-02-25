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
