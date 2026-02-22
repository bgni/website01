import { applyFilter, applySort, paginate } from '../scripts/search.js';

const devices = [
  { id: '1', name: 'Alpha', brand: 'Cisco', model: 'A', type: 'router', ports: [1, 2] },
  { id: '2', name: 'Beta', brand: 'Juniper', model: 'B', type: 'switch', ports: [1] },
  { id: '3', name: 'Gamma', brand: 'Arista', model: 'C', type: 'server', ports: [1, 2, 3] },
];

describe('search utilities', () => {
  test('filters by query', () => {
    const res = applyFilter(devices, 'jun');
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('2');
  });

  test('sorts by ports desc', () => {
    const sorted = applySort(devices, 'ports', 'desc');
    expect(sorted[0].id).toBe('3');
  });

  test('paginates list', () => {
    const page = paginate(devices, 2, 2);
    expect(page).toHaveLength(1);
    expect(page[0].id).toBe('3');
  });
});
