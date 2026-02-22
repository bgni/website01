import { buildAdjacency, collectHighlights, findShortestPath } from '../scripts/graphLogic.js';

const connections = [
  { id: 'a-b', from: { deviceId: 'a' }, to: { deviceId: 'b' } },
  { id: 'b-c', from: { deviceId: 'b' }, to: { deviceId: 'c' } },
  { id: 'c-d', from: { deviceId: 'c' }, to: { deviceId: 'd' } },
  { id: 'b-d', from: { deviceId: 'b' }, to: { deviceId: 'd' } },
];

describe('graph logic', () => {
  const adjacency = buildAdjacency(connections);

  test('finds shortest path', () => {
    const path = findShortestPath(adjacency, 'a', 'd');
    expect(path.nodes).toEqual(['a', 'b', 'd']);
    expect(path.links).toEqual(['a-b', 'b-d']);
  });

  test('collects highlights for multi-select', () => {
    const { nodes, links } = collectHighlights(adjacency, new Set(['a', 'd']));
    expect(nodes.has('b')).toBe(true);
    expect(links.has('b-d')).toBe(true);
  });

  test('collects neighbors for single select', () => {
    const { nodes, links } = collectHighlights(adjacency, new Set(['b']));
    expect(nodes.has('a')).toBe(true);
    expect(nodes.has('c')).toBe(true);
    expect(links.has('a-b')).toBe(true);
  });
});
