import { loadData, loadJson } from './dataLoader.js';
import { applyFilter, applySort, paginate } from './search.js';
import { buildAdjacency, typeColor } from './graphLogic.js';
import { createGraph } from './graph.js';
import {
  createGeneratedTrafficConnector,
  createRealTrafficConnector,
  createStaticTrafficConnector,
  createTimelineTrafficConnector,
} from './trafficConnector.js';
import { TRAFFIC_VIZ_OPTIONS } from './trafficFlowVisualization/registry.js';

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
const networkSelect = document.getElementById('networkSelect');
const trafficVizSelect = document.getElementById('trafficVizSelect');
const searchInput = document.getElementById('searchInput');
const searchShell = document.getElementById('searchShell');
const searchResults = document.getElementById('searchResults');
const searchTbody = searchResults.querySelector('tbody');
const pageInfo = document.getElementById('pageInfo');
const selectedDevicesEl = document.getElementById('selectedDevices');
const selectedOverlay = document.getElementById('selectedOverlay');

const DEFAULT_NETWORK_ID = 'small-office';

let adjacency;
let graph;
let hasWiredEvents = false;
let stopTraffic = () => {};
const trafficByConn = new Map();
let trafficVizKind = 'classic';

const getFilteredDevices = () => applySort(applyFilter(state.devices, state.filter), state.sortKey, state.sortDir);

const renderSelected = () => {
  selectedDevicesEl.innerHTML = '';
  const selectedList = state.devices.filter((d) => state.selected.has(d.id));

  if (selectedOverlay) {
    selectedOverlay.classList.toggle('is-hidden', selectedList.length === 0);
  }

  if (!selectedList.length) {
    const empty = document.createElement('span');
    empty.className = 'status';
    empty.textContent = 'No devices selected';
    selectedDevicesEl.appendChild(empty);
  } else {
    selectedList.forEach((d) => {
      const card = document.createElement('div');
      card.className = 'selected-card';

      // Best-effort NetBox elevation image guess from strict type slug (Manufacturer/ModelFileBase).
      const slug = d.deviceTypeSlug;
      let thumbHtml = '';
      if (typeof slug === 'string' && slug.includes('/')) {
        const [mfg, modelFileBase] = slug.split('/');
        const fileBase = `${String(mfg).toLowerCase()}-${String(modelFileBase).toLowerCase()}`
          .replace(/[^a-z0-9\-]+/g, '-')
          .replace(/\-+/g, '-')
          .replace(/(^-|-$)/g, '');
        const png = `vendor/netbox-devicetype-library/elevation-images/${mfg}/${fileBase}.front.png`;
        const jpg = `vendor/netbox-devicetype-library/elevation-images/${mfg}/${fileBase}.front.jpg`;
        thumbHtml = `<img class="thumb" alt="" src="${png}" data-fallback="${jpg}" loading="lazy" />`;
      }

      card.innerHTML = `
        ${thumbHtml || `<div class="thumb" aria-hidden="true"></div>`}
        <div class="content">
          <div class="title">
            <span style="width:10px; height:10px; border-radius:50%; background:${typeColor(d.type)}; display:inline-block;"></span>
            ${d.name}
          </div>
          <div class="meta">${d.brand} • ${d.model}</div>
          <div class="type-pill">${d.type}</div>
        </div>
        <button class="remove" title="Remove" aria-label="Remove" data-id="${d.id}" type="button">×</button>
      `;

      const img = card.querySelector('img.thumb');
      if (img) {
        img.addEventListener('error', () => {
          const fallback = img.getAttribute('data-fallback');
          if (fallback && img.src && !img.src.endsWith('.jpg')) {
            img.src = fallback;
            return;
          }
          img.remove();
          // Keep layout stable if image missing.
          const placeholder = document.createElement('div');
          placeholder.className = 'thumb';
          placeholder.setAttribute('aria-hidden', 'true');
          card.prepend(placeholder);
        }, { once: true });
      }

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

const toggleSelect = (id) => {
  if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
  renderSelected();
  renderSearchDropdown();
  if (graph) graph.update({ filteredIds: new Set(getFilteredDevices().map((d) => d.id)), selected: state.selected });
};

const wireEvents = () => {
  if (hasWiredEvents) return;
  hasWiredEvents = true;

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
    renderSearchDropdown();
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
    const insideShell = searchShell ? searchShell.contains(e.target) : searchInput.contains(e.target);
    if (!searchResults.contains(e.target) && !insideShell) {
      searchResults.classList.remove('visible');
    }
  });
};

const attachTraffic = (trafficUpdates) => {
  // Accept either an array of updates OR a timeline object `{ initial, updates }`.
  if (trafficUpdates && !Array.isArray(trafficUpdates) && Array.isArray(trafficUpdates.initial)) {
    attachTraffic(trafficUpdates.initial);
    return;
  }

  const updates = Array.isArray(trafficUpdates) ? trafficUpdates : [];
  updates.forEach((t) => {
    if (!t || !t.connectionId) return;
    const prev = trafficByConn.get(t.connectionId) || {};
    trafficByConn.set(t.connectionId, { ...prev, ...t });
  });
  state.traffic = Array.from(trafficByConn.values());
  if (graph) graph.updateTraffic(updates);

  // Force re-style of links based on latest traffic.
  if (graph) graph.update({
    filteredIds: new Set(getFilteredDevices().map((d) => d.id)),
    selected: state.selected,
  });
};

const resetTrafficState = () => {
  trafficByConn.clear();
  state.traffic = [];
};

const loadJsonOptional = async (path) => {
  const res = await fetch(path);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
};

const startTrafficConnector = async ({ basePath, trafficPath }) => {
  // Optional connector config per network.
  const connectorPath = `${basePath}/traffic.connector.json`;
  const connector = await loadJsonOptional(connectorPath);

  const kind = connector?.kind;

  if (kind === 'generated') {
    const configPath = connector?.configPath || 'traffic.generator.json';
    const full = `${basePath}/${configPath}`;
    const config = await loadJson(full);
    const gen = createGeneratedTrafficConnector({ config });
    return gen.start(attachTraffic);
  }

  if (kind === 'static') {
    const source = await loadJson(trafficPath);
    if (source && !Array.isArray(source) && Array.isArray(source.initial)) {
      const tl = createTimelineTrafficConnector({ timeline: source, tickMs: connector?.tickMs || 250, loop: Boolean(connector?.loop) });
      return tl.start(attachTraffic);
    }
    const st = createStaticTrafficConnector({ source });
    return st.start(attachTraffic);
  }

  if (kind === 'real') {
    const url = connector?.url || trafficPath;
    const real = createRealTrafficConnector({ url, intervalMs: connector?.intervalMs || 5000 });
    return real.start(attachTraffic);
  }

  // Default behavior: if traffic.json is a timeline, play it; otherwise poll it.
  const source = await loadJson(trafficPath);
  if (source && !Array.isArray(source) && Array.isArray(source.initial)) {
    const tl = createTimelineTrafficConnector({ timeline: source });
    return tl.start(attachTraffic);
  }
  const real = createRealTrafficConnector({ url: trafficPath, intervalMs: 5000 });
  return real.start(attachTraffic);
};

const resetUiStateForNetwork = () => {
  state.filter = '';
  state.page = 1;
  state.selected.clear();
  searchInput.value = '';
  searchResults.classList.remove('visible');
};

const getNetworkBasePath = (networkId) => {
  return `data/networks/${networkId || DEFAULT_NETWORK_ID}`;
};

async function initNetwork(networkId) {
  stopTraffic?.();
  stopTraffic = () => {};
  if (graph?.destroy) graph.destroy();

  resetUiStateForNetwork();
  resetTrafficState();

  const basePath = getNetworkBasePath(networkId);
  const trafficPath = `${basePath}/traffic.json`;

  const { devices, connections } = await loadData({ basePath, includeTraffic: false });
  state.devices = devices;
  state.connections = connections;
  adjacency = buildAdjacency(connections);

  graph = createGraph({
    devices,
    connections,
    adjacency,
    onNodeSelect: (id) => toggleSelect(id),
  });

  if (graph?.setTrafficVisualization) graph.setTrafficVisualization(trafficVizKind);

  stopTraffic = await startTrafficConnector({ basePath, trafficPath });
  renderSelected();
  renderSearchDropdown();
}

function initTrafficVizSelect() {
  if (!trafficVizSelect) return;
  trafficVizSelect.innerHTML = TRAFFIC_VIZ_OPTIONS
    .map((o) => `<option value="${o.id}">${o.name}</option>`)
    .join('');
  trafficVizSelect.value = trafficVizKind;
  trafficVizSelect.addEventListener('change', () => {
    trafficVizKind = trafficVizSelect.value;
    if (graph?.setTrafficVisualization) {
      graph.setTrafficVisualization(trafficVizKind);
      graph.update({ filteredIds: new Set(getFilteredDevices().map((d) => d.id)), selected: state.selected });
    }
  });
}

async function initNetworkSelect() {
  if (!networkSelect) return;

  try {
    const index = await loadJson('data/networks/index.json');
    const networks = Array.isArray(index?.networks) ? index.networks : [];

    if (!networks.length) {
      networkSelect.innerHTML = '<option value="">Default</option>';
      networkSelect.value = '';
      networkSelect.disabled = true;
      return;
    }

    networkSelect.innerHTML = networks
      .map((n) => `<option value="${n.id}">${n.name || n.id}</option>`)
      .join('');

    const defaultId = index?.defaultId || networks[0].id;
    networkSelect.value = defaultId;

    networkSelect.addEventListener('change', async () => {
      const nextId = networkSelect.value;
      try {
        await initNetwork(nextId);
      } catch (err) {
        console.error(err);
        statusEl.textContent = 'Failed to load selected network';
      }
    });
  } catch (err) {
    // If multi-network index isn't present, fall back to the bundled small-office fixture.
    console.warn('Network index not found; falling back to small-office fixture.', err);
    networkSelect.innerHTML = `<option value="${DEFAULT_NETWORK_ID}">Small Office</option>`;
    networkSelect.value = DEFAULT_NETWORK_ID;
    networkSelect.disabled = true;
  }
}

async function init() {
  wireEvents();

  initTrafficVizSelect();

  await initNetworkSelect();
  const initialNetworkId = networkSelect ? (networkSelect.value || DEFAULT_NETWORK_ID) : DEFAULT_NETWORK_ID;
  await initNetwork(initialNetworkId);
}

init().catch((err) => {
  console.error(err);
  statusEl.textContent = 'Failed to load data';
});

globalThis.addEventListener('beforeunload', () => stopTraffic());
