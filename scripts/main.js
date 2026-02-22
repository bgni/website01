import { loadData, pollTraffic } from './dataLoader.js';
import { applyFilter, applySort, paginate } from './search.js';
import { buildAdjacency, typeColor } from './graphLogic.js';
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

const statusEl = document.getElementById('status');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const searchTbody = searchResults.querySelector('tbody');
const pageInfo = document.getElementById('pageInfo');
const selectedDevicesEl = document.getElementById('selectedDevices');

let adjacency;
let graph;
let stopPoll = () => {};

const getFilteredDevices = () => applySort(applyFilter(state.devices, state.filter), state.sortKey, state.sortDir);

const renderSelected = () => {
  selectedDevicesEl.innerHTML = '';
  const selectedList = state.devices.filter((d) => state.selected.has(d.id));
  if (!selectedList.length) {
    const empty = document.createElement('span');
    empty.className = 'status';
    empty.textContent = 'No devices selected';
    selectedDevicesEl.appendChild(empty);
  } else {
    selectedList.forEach((d) => {
      const card = document.createElement('div');
      card.className = 'selected-card';
      card.innerHTML = `
        <div class="title">
          <span style="width:10px; height:10px; border-radius:50%; background:${typeColor(d.type)}; display:inline-block;"></span>
          ${d.name}
        </div>
        <div class="meta">${d.brand} • ${d.model}</div>
        <div class="type-pill">${d.type}</div>
        <button class="remove" data-id="${d.id}">Remove</button>
      `;
      card.querySelector('.remove').addEventListener('click', () => toggleSelect(d.id));
      selectedDevicesEl.appendChild(card);
    });
  }
  statusEl.textContent = `${state.selected.size} selected | ${state.devices.length} total.`;
};

const renderSearchDropdown = () => {
  const results = getFilteredDevices();
  const totalPages = Math.max(1, Math.ceil(results.length / state.pageSize));
  state.page = Math.min(state.page, totalPages);
  const pageItems = paginate(results, state.page, state.pageSize);
  searchTbody.innerHTML = '';
  pageItems.forEach((d) => {
    const tr = document.createElement('tr');
    tr.classList.toggle('is-selected', state.selected.has(d.id));
    tr.innerHTML = `
      <td>${state.selected.has(d.id) ? '✓ ' : ''}${d.name}</td>
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
  renderSelected();
  renderSearchDropdown();
  if (graph) graph.update({ filteredIds: new Set(getFilteredDevices().map((d) => d.id)), selected: state.selected });
};

const wireEvents = () => {
  document.getElementById('clearSelection').addEventListener('click', () => {
    state.selected.clear();
    renderSelected();
    renderSearchDropdown();
    if (graph) graph.update({ filteredIds: new Set(getFilteredDevices().map((d) => d.id)), selected: state.selected });
  });

  searchInput.addEventListener('input', (e) => {
    state.filter = e.target.value;
    state.page = 1;
    renderSearchDropdown();
  });

  searchInput.addEventListener('focus', () => renderSearchDropdown());
  document.getElementById('clearSearch').addEventListener('click', () => {
    state.filter = '';
    state.page = 1;
    searchInput.value = '';
    searchResults.classList.remove('visible');
    renderSelected();
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
  renderSelected();
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
  renderSelected();
  renderSearchDropdown();
}

init().catch((err) => {
  console.error(err);
  statusEl.textContent = 'Failed to load data';
});

window.addEventListener('beforeunload', () => stopPoll());
