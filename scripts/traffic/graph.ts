import { asArray } from "./util.ts";

type ConnectionLike = {
  id?: unknown;
  from?: { deviceId?: unknown };
  to?: { deviceId?: unknown };
  connectionType?: unknown;
  connection_type?: unknown;
};

type AdjacencyEdge = { neighborId: string; connectionId: string };

export const buildUndirectedAdjacency = (connections: unknown) => {
  const adj = new Map<string, AdjacencyEdge[]>();
  const add = (fromId: string, toId: string, connectionId: string) => {
    if (!fromId || !toId || !connectionId) return;
    if (!adj.has(fromId)) adj.set(fromId, []);
    adj.get(fromId)!.push({ neighborId: toId, connectionId });
  };

  asArray<ConnectionLike>(connections).forEach((c) => {
    const connectionId = String(c?.id || "").trim();
    const a = String(c?.from?.deviceId || "").trim();
    const b = String(c?.to?.deviceId || "").trim();
    if (!connectionId || !a || !b) return;
    add(a, b, connectionId);
    add(b, a, connectionId);
  });

  // Deterministic traversal order.
  for (const [deviceId, list] of adj.entries()) {
    list.sort((x: AdjacencyEdge, y: AdjacencyEdge) => {
      const n = String(x.neighborId).localeCompare(String(y.neighborId));
      if (n !== 0) return n;
      return String(x.connectionId).localeCompare(String(y.connectionId));
    });
    adj.set(deviceId, list);
  }

  return adj;
};

export const findShortestPathConnectionIds = (
  {
    adjacency,
    fromDeviceId,
    toDeviceId,
  }: {
    adjacency: Map<string, AdjacencyEdge[]>;
    fromDeviceId: string;
    toDeviceId: string;
  },
) => {
  if (!fromDeviceId || !toDeviceId) return null;
  if (fromDeviceId === toDeviceId) return [];

  const visited = new Set([fromDeviceId]);
  const prev = new Map<
    string,
    { prevDeviceId: string; viaConnectionId: string }
  >(); // deviceId -> { prevDeviceId, viaConnectionId }
  const queue = [fromDeviceId];

  while (queue.length) {
    const cur = queue.shift();
    if (!cur) break;
    if (cur === toDeviceId) break;

    const neighbors = adjacency.get(cur) || [];
    for (const edge of neighbors) {
      const next = edge.neighborId;
      if (visited.has(next)) continue;
      visited.add(next);
      prev.set(next, { prevDeviceId: cur, viaConnectionId: edge.connectionId });
      queue.push(next);
    }
  }

  if (!visited.has(toDeviceId)) return null;

  const path: string[] = [];
  let cur = toDeviceId;
  while (cur !== fromDeviceId) {
    const p = prev.get(cur);
    if (!p) return null;
    path.push(p.viaConnectionId);
    cur = p.prevDeviceId;
  }

  path.reverse();
  return path;
};
