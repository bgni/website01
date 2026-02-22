import { loadData, pollTraffic } from './dataLoader.js';
import { applyFilter, applySort, paginate } from './search.js';
import { buildAdjacency } from './graphLogic.js';
import { createGraph } from './graph.js';

const state = {
  filter: '',
  sortKey: 'name',
  sortDir: 'asc',
  selected: new Set(),
  page: 1,
  pageSize: 6,
  devices: [],
  connections: [],
  traffic: [],
};

const tableBody = document.querySelector('#deviceTable tbody');
const statusEl = document.getElementById('status');
const trafficStatusEl = document.getElementById('trafficStatus');
const selectAllBox = document.getElementById('selectAll');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const searchTbody = searchResults.querySelector('tbody');
const pageInfo = document.getElementById('pageInfo');

let adjacency;
let graph;
let stopPoll = () => {};

const setTrafficStatus = (text) => {
  trafficStatusEl.textContent = text;
};

const getFilteredDevices = () => applySort(applyFilter(state.devices, state.filter), state.sortKey, state.sortDir);

const renderTable = () => {
  const filtered = getFilteredDevices();
  tableBody.innerHTML = '';
  filtered.forEach((d) => {
    const row = document.createElement('tr');
    row.dataset.id = d.id;
    const checked = state.selected.has(d.id);
    row.innerHTML = `
      <td><input type="checkbox" data-id="${d.id}" ${checked ? 'checked' : ''} aria-label="Select ${d.name}" /></td>
      <td>${d.name}</td>
      <td>${d.brand}</td>
      <td>${d.model}</td>
      <td><span class="tag">${d.type}</span></td>
      <td>${d.ports.length}</td>`;
    row.addEventListener('click', (e) => {
      if (e.target.tagName.toLowerCase() === 'input') return;
      toggleSelect(d.id);
    });
    tableBody.appendChild(row);
  });
  statusEl.textContent = `${state.selected.size} selected | ${filtered.length} shown | ${state.devices.length} total.`;
  selectAllBox.checked = filtered.length > 0 && filtered.every((d) => state.selected.has(d.id));
  if (graph) graph.update({ filteredIds: new Set(filtered.map((d) => d.id)), selected: state.selected });
};

const renderSearchDropdown = () => {
  const results = getFilteredDevices();
  const totalPages = Math.max(1, Math.ceil(results.length / state.pageSize));
  state.page = Math.min(state.page, totalPages);
  const pageItems = paginate(results, state.page, state.pageSize);
  searchTbody.innerHTML = '';
  pageItems.forEach((d) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${d.name}</td>
      <td>${d.brand}</td>
      <td>${d.model}</td>
      <td><span class="badge">${d.type}</span></td>`;
    tr.addEventListener('click', () => {
      toggleSelect(d.id, true);
      searchResults.classList.remove('visible');
    });
    searchTbody.appendChild(tr);
  });
  pageInfo.textContent = `Page ${state.page} / ${totalPages}`;
  document.getElementById('prevPage').disabled = state.page === 1;
  document.getElementById('nextPage').disabled = state.page === totalPages;
  searchResults.classList.toggle('visible', results.length > 0 && state.filter.trim().length > 0);
};

const toggleSelect = (id, focusTable = false) => {
  if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
  if (focusTable) {
    const row = tableBody.querySelector(`tr[data-id="${id}"]`);
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  renderTable();
};

const wireEvents = () => {
  document.getElementById('deviceTable').addEventListener('change', (e) => {
    const id = e.target.getAttribute('data-id');
    if (!id) return;
    if (e.target.checked) state.selected.add(id); else state.selected.delete(id);
    renderTable();
  });

  document.querySelectorAll('thead th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.getAttribute('data-sort');
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortKey = key;
        state.sortDir = 'asc';
      }
      renderTable();
    });
  });

  document.getElementById('clearSelection').addEventListener('click', () => {
    state.selected.clear();
    renderTable();
  });

  document.getElementById('selectAll').addEventListener('change', () => {
    const filtered = getFilteredDevices();
    filtered.forEach((d) => {
      if (selectAllBox.checked) state.selected.add(d.id); else state.selected.delete(d.id);
    });
    renderTable();
  });

  searchInput.addEventListener('input', (e) => {
    state.filter = e.target.value;
    state.page = 1;
    renderSearchDropdown();
    renderTable();
  });

  searchInput.addEventListener('focus', () => renderSearchDropdown());
  document.getElementById('clearSearch').addEventListener('click', () => {
    state.filter = '';
    state.page = 1;
    searchInput.value = '';
    searchResults.classList.remove('visible');
    renderTable();
  });
  document.getElementById('prevPage').addEventListener('click', () => {
    if (state.page > 1) {
      state.page -= 1;
      renderSearchDropdown();
    }
  });
  document.getElementById('nextPage').addEventListener('click', () => {
    state.page += 1;
    renderSearchDropdown();
  });

  document.addEventListener('click', (e) => {
    if (!searchResults.contains(e.target) && !searchInput.contains(e.target)) {
      searchResults.classList.remove('visible');
    }
  });
};

const attachTraffic = (traffic) => {
  state.traffic = traffic;
  if (graph) graph.updateTraffic(traffic);
  setTrafficStatus(`Traffic updated ${new Date().toLocaleTimeString()}`);
  renderTable();
};

async function init() {
  const { devices, connections, traffic } = await loadData();
  state.devices = devices;
  state.connections = connections;
  adjacency = buildAdjacency(connections);
  graph = createGraph({
    devices,
    connections,
    adjacency,
    onNodeSelect: (id) => toggleSelect(id),
  });
  attachTraffic(traffic);
  stopPoll = pollTraffic({ intervalMs: 5000, onUpdate: attachTraffic });
  wireEvents();
  renderTable();
  renderSearchDropdown();
}

init().catch((err) => {
  console.error(err);
  statusEl.textContent = 'Failed to load data';
});

window.addEventListener('beforeunload', () => stopPoll());
