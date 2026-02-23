import { loadData, loadJson } from "./dataLoader.ts";
import {
  applyFilter,
  applySort,
  paginate,
  type SortDir,
  type SortKey,
} from "./search.ts";
import { buildAdjacency, typeColor } from "./graphLogic.ts";
import { createGraph } from "./graph.ts";
import {
  createFlowTrafficConnector,
  createGeneratedTrafficConnector,
  createRealTrafficConnector,
  createStaticTrafficConnector,
  createTimelineTrafficConnector,
} from "./trafficConnector.ts";
import { TRAFFIC_VIZ_OPTIONS } from "./trafficFlowVisualization/registry.ts";

type Device = {
  id: string;
  name: string;
  type: string;
  brand: string;
  model: string;
  ports: unknown[];
  deviceTypeSlug?: string;
  [k: string]: unknown;
};

type ConnectionEnd = { deviceId: string; portId?: string };
type Connection = {
  id: string;
  from: ConnectionEnd;
  to: ConnectionEnd;
  [k: string]: unknown;
};

type TrafficUpdate = {
  connectionId: string;
  status?: string;
  rateMbps?: number;
  utilization?: number;
  [k: string]: unknown;
};

type Adjacency = Record<
  string,
  Array<{ neighbor: string; connectionId: string }>
>;

type State = {
  filter: string;
  sortKey: SortKey;
  sortDir: SortDir;
  selected: Set<string>;
  page: number;
  pageSize: number;
  devices: Device[];
  connections: Connection[];
  traffic: TrafficUpdate[];
};

const mustGetById = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing required element #${id}`);
  return el as T;
};

const asRecord = (v: unknown): Record<string, unknown> | null => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
};

const isTrafficUpdate = (v: unknown): v is TrafficUpdate => {
  const r = asRecord(v);
  return Boolean(r && typeof r.connectionId === "string" && r.connectionId);
};

const state: State = {
  filter: "",
  sortKey: "name",
  sortDir: "asc",
  selected: new Set<string>(),
  page: 1,
  pageSize: 6,
  devices: [],
  connections: [],
  traffic: [],
};

const statusEl = mustGetById<HTMLElement>("status");
const networkSelect = mustGetById<HTMLSelectElement>("networkSelect");
const trafficVizSelect = mustGetById<HTMLSelectElement>("trafficVizSelect");
const layoutSelect = mustGetById<HTMLSelectElement>("layoutSelect");
const searchInput = mustGetById<HTMLInputElement>("searchInput");
const searchShell = mustGetById<HTMLElement>("searchShell");
const searchResults = mustGetById<HTMLElement>("searchResults");
const searchTbody = (() => {
  const tbody = searchResults.querySelector("tbody");
  if (!tbody) throw new Error("Missing <tbody> inside #searchResults");
  return tbody as HTMLTableSectionElement;
})();
const pageInfo = mustGetById<HTMLElement>("pageInfo");
const selectedDevicesEl = mustGetById<HTMLElement>("selectedDevices");
const selectedOverlay = document.getElementById("selectedOverlay");

const DEFAULT_NETWORK_ID = "small-office";

let adjacency: Adjacency = {};
let graph: ReturnType<typeof createGraph> | null = null;
let hasWiredEvents = false;
let stopTraffic = () => {};
const trafficByConn = new Map<string, TrafficUpdate>();
let trafficVizKind = "classic";
let layoutKind = "force";

const getFilteredDevices = () =>
  applySort(
    applyFilter(state.devices, state.filter),
    state.sortKey,
    state.sortDir,
  );

const renderSelected = () => {
  selectedDevicesEl.innerHTML = "";
  const selectedList = state.devices.filter((d) => state.selected.has(d.id));

  if (selectedOverlay) {
    selectedOverlay.classList.toggle("is-hidden", selectedList.length === 0);
  }

  if (!selectedList.length) {
    const empty = document.createElement("span");
    empty.className = "status";
    empty.textContent = "No devices selected";
    selectedDevicesEl.appendChild(empty);
  } else {
    selectedList.forEach((d) => {
      const card = document.createElement("div");
      card.className = "selected-card";

      // Best-effort NetBox elevation image guess from strict type slug (Manufacturer/ModelFileBase).
      const slug = d.deviceTypeSlug;
      let thumbHtml = "";
      if (typeof slug === "string" && slug.includes("/")) {
        const [mfg, modelFileBase] = slug.split("/");
        const fileBase = `${String(mfg).toLowerCase()}-${
          String(modelFileBase).toLowerCase()
        }`
          .replace(/[^a-z0-9\-]+/g, "-")
          .replace(/\-+/g, "-")
          .replace(/(^-|-$)/g, "");
        const png =
          `vendor/netbox-devicetype-library/elevation-images/${mfg}/${fileBase}.front.png`;
        const jpg =
          `vendor/netbox-devicetype-library/elevation-images/${mfg}/${fileBase}.front.jpg`;
        thumbHtml =
          `<img class="thumb" alt="" src="${png}" data-fallback="${jpg}" loading="lazy" />`;
      }

      card.innerHTML = `
        ${thumbHtml || `<div class="thumb" aria-hidden="true"></div>`}
        <div class="content">
          <div class="title">
            <span style="width:10px; height:10px; border-radius:50%; background:${
        typeColor(d.type)
      }; display:inline-block;"></span>
            ${d.name}
          </div>
          <div class="meta">${d.brand} • ${d.model}</div>
          <div class="type-pill">${d.type}</div>
        </div>
        <button class="remove" title="Remove" aria-label="Remove" data-id="${d.id}" type="button">×</button>
      `;

      const img = card.querySelector<HTMLImageElement>("img.thumb");
      if (img) {
        img.addEventListener("error", () => {
          const fallback = img.getAttribute("data-fallback");
          if (fallback && img.src && !img.src.endsWith(".jpg")) {
            img.src = fallback;
            return;
          }
          img.remove();
          // Keep layout stable if image missing.
          const placeholder = document.createElement("div");
          placeholder.className = "thumb";
          placeholder.setAttribute("aria-hidden", "true");
          card.prepend(placeholder);
        }, { once: true });
      }

      const removeBtn = card.querySelector<HTMLButtonElement>(".remove");
      if (removeBtn) {
        removeBtn.addEventListener("click", () => toggleSelect(d.id));
      }
      selectedDevicesEl.appendChild(card);
    });
  }
  statusEl.textContent =
    `${state.selected.size} selected | ${state.devices.length} total.`;
};

const renderSearchDropdown = () => {
  const results = getFilteredDevices();
  const totalPages = Math.max(1, Math.ceil(results.length / state.pageSize));
  state.page = Math.min(state.page, totalPages);
  const pageItems = paginate(results, state.page, state.pageSize);
  searchTbody.innerHTML = "";
  pageItems.forEach((d: Device) => {
    const tr = document.createElement("tr");
    tr.classList.toggle("is-selected", state.selected.has(d.id));
    tr.innerHTML = `
      <td>${state.selected.has(d.id) ? "✓ " : ""}${d.name}</td>
      <td>${d.brand}</td>
      <td>${d.model}</td>
      <td><span class="badge">${d.type}</span></td>`;
    tr.addEventListener("click", () => {
      toggleSelect(d.id, true);
      searchResults.classList.remove("visible");
    });
    searchTbody.appendChild(tr);
  });
  pageInfo.textContent = `Page ${state.page} / ${totalPages}`;
  mustGetById<HTMLButtonElement>("prevPage").disabled = state.page === 1;
  mustGetById<HTMLButtonElement>("nextPage").disabled =
    state.page === totalPages;
  searchResults.classList.toggle(
    "visible",
    results.length > 0 && state.filter.trim().length > 0,
  );
};

const toggleSelect = (id: string, forceOn?: boolean) => {
  if (forceOn) {
    state.selected.add(id);
  } else if (state.selected.has(id)) {
    state.selected.delete(id);
  } else {
    state.selected.add(id);
  }
  renderSelected();
  renderSearchDropdown();
  if (graph) {
    graph.update({
      filteredIds: new Set(getFilteredDevices().map((d) => d.id)),
      selected: state.selected,
    });
  }
};

const wireEvents = () => {
  if (hasWiredEvents) return;
  hasWiredEvents = true;

  mustGetById<HTMLButtonElement>("clearSelection").addEventListener(
    "click",
    () => {
      state.selected.clear();
      renderSelected();
      renderSearchDropdown();
      if (graph) {
        graph.update({
          filteredIds: new Set(getFilteredDevices().map((d) => d.id)),
          selected: state.selected,
        });
      }
    },
  );

  searchInput.addEventListener("input", (e: Event) => {
    const target = e.target;
    if (target instanceof HTMLInputElement) state.filter = target.value;
    state.page = 1;
    renderSearchDropdown();
  });

  searchInput.addEventListener("focus", () => renderSearchDropdown());
  mustGetById<HTMLButtonElement>("clearSearch").addEventListener(
    "click",
    () => {
      state.filter = "";
      state.page = 1;
      searchInput.value = "";
      searchResults.classList.remove("visible");
      renderSearchDropdown();
      renderSelected();
    },
  );
  mustGetById<HTMLButtonElement>("prevPage").addEventListener("click", () => {
    if (state.page > 1) {
      state.page -= 1;
      renderSearchDropdown();
    }
  });
  mustGetById<HTMLButtonElement>("nextPage").addEventListener("click", () => {
    state.page += 1;
    renderSearchDropdown();
  });

  document.addEventListener("click", (e: MouseEvent) => {
    if (!(e.target instanceof Node)) return;
    const insideShell = searchShell.contains(e.target);
    if (!searchResults.contains(e.target) && !insideShell) {
      searchResults.classList.remove("visible");
    }
  });
};

const attachTraffic = (trafficUpdates: unknown) => {
  // Accept either an array of updates OR a timeline object `{ initial, updates }`.
  if (
    trafficUpdates && !Array.isArray(trafficUpdates) &&
    Array.isArray((trafficUpdates as { initial?: unknown }).initial)
  ) {
    attachTraffic((trafficUpdates as { initial?: unknown }).initial);
    return;
  }

  const updates = Array.isArray(trafficUpdates)
    ? trafficUpdates.filter(isTrafficUpdate)
    : [];
  updates.forEach((t) => {
    const prev = trafficByConn.get(t.connectionId) || {
      connectionId: t.connectionId,
    };
    trafficByConn.set(t.connectionId, { ...prev, ...t });
  });
  state.traffic = Array.from(trafficByConn.values());
  if (graph) graph.updateTraffic(updates);

  // Force re-style of links based on latest traffic.
  if (graph) {
    graph.update({
      filteredIds: new Set(getFilteredDevices().map((d) => d.id)),
      selected: state.selected,
    });
  }
};

const resetTrafficState = () => {
  trafficByConn.clear();
  state.traffic = [];
};

const loadJsonOptional = async (path: string): Promise<unknown | null> => {
  const res = await fetch(path);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return await res.json();
};

const startTrafficConnector = async (
  { basePath, trafficPath }: { basePath: string; trafficPath: string },
): Promise<() => void> => {
  // Optional connector config per network.
  const connectorPath = `${basePath}/traffic.connector.json`;
  const connector = await loadJsonOptional(connectorPath);

  const connectorRec = asRecord(connector);
  const kind = typeof connectorRec?.kind === "string"
    ? connectorRec.kind
    : null;

  if (kind === "flow") {
    const configPath = typeof connectorRec?.configPath === "string"
      ? connectorRec.configPath
      : "traffic.flow.json";
    const full = `${basePath}/${configPath}`;
    const config = await loadJson(full);

    const connections = await loadJson(`${basePath}/connections.json`);
    const connectionTypes = await loadJson("data/connectionTypes.json");

    const flow = createFlowTrafficConnector({
      config,
      connections,
      connectionTypes,
    });
    return flow.start(attachTraffic);
  }

  if (kind === "generated") {
    const configPath = typeof connectorRec?.configPath === "string"
      ? connectorRec.configPath
      : "traffic.generator.json";
    const full = `${basePath}/${configPath}`;
    const config = await loadJson(full);
    const gen = createGeneratedTrafficConnector({ config });
    return gen.start(attachTraffic);
  }

  if (kind === "static") {
    const source = await loadJson(trafficPath);
    const sourceRec = asRecord(source);
    if (sourceRec && Array.isArray(sourceRec.initial)) {
      const tl = createTimelineTrafficConnector({
        timeline: sourceRec,
        tickMs: typeof connectorRec?.tickMs === "number"
          ? connectorRec.tickMs
          : 250,
        loop: Boolean(connectorRec?.loop),
      });
      return tl.start(attachTraffic);
    }
    const st = createStaticTrafficConnector({ source });
    return st.start(attachTraffic);
  }

  if (kind === "real") {
    const url = typeof connectorRec?.url === "string"
      ? connectorRec.url
      : trafficPath;
    const real = createRealTrafficConnector({
      url,
      intervalMs: typeof connectorRec?.intervalMs === "number"
        ? connectorRec.intervalMs
        : 5000,
    });
    return real.start(attachTraffic);
  }

  // Default behavior: if traffic.json is a timeline, play it; otherwise poll it.
  const source = await loadJson(trafficPath);
  const sourceRec = asRecord(source);
  if (sourceRec && Array.isArray(sourceRec.initial)) {
    const tl = createTimelineTrafficConnector({ timeline: sourceRec });
    return tl.start(attachTraffic);
  }
  const real = createRealTrafficConnector({
    url: trafficPath,
    intervalMs: 5000,
  });
  return real.start(attachTraffic);
};

const resetUiStateForNetwork = () => {
  state.filter = "";
  state.page = 1;
  state.selected.clear();
  searchInput.value = "";
  searchResults.classList.remove("visible");
};

const getNetworkBasePath = (networkId: string) => {
  return `data/networks/${networkId || DEFAULT_NETWORK_ID}`;
};

async function initNetwork(networkId: string) {
  stopTraffic?.();
  stopTraffic = () => {};
  if (graph?.destroy) graph.destroy();

  resetUiStateForNetwork();
  resetTrafficState();

  const basePath = getNetworkBasePath(networkId);
  const trafficPath = `${basePath}/traffic.json`;

  const { devices, connections } = await loadData({
    basePath,
    includeTraffic: false,
  });
  state.devices = Array.isArray(devices) ? devices as Device[] : [];
  state.connections = Array.isArray(connections)
    ? connections as Connection[]
    : [];
  adjacency = buildAdjacency(state.connections) as Adjacency;

  graph = createGraph({
    devices: state.devices,
    connections: state.connections,
    adjacency,
    onNodeSelect: (id: string) => toggleSelect(id),
  });

  if (graph?.setTrafficVisualization) {
    graph.setTrafficVisualization(trafficVizKind);
  }
  if (graph?.setLayout) graph.setLayout(layoutKind);

  stopTraffic = await startTrafficConnector({ basePath, trafficPath });
  renderSelected();
  renderSearchDropdown();
}

function initLayoutSelect() {
  if (!layoutSelect) return;
  layoutSelect.value = layoutKind;
  layoutSelect.addEventListener("change", () => {
    layoutKind = layoutSelect.value;
    if (graph?.setLayout) graph.setLayout(layoutKind);
  });
}

function initTrafficVizSelect() {
  if (!trafficVizSelect) return;
  trafficVizSelect.innerHTML = TRAFFIC_VIZ_OPTIONS
    .map((o) => `<option value="${o.id}">${o.name}</option>`)
    .join("");
  trafficVizSelect.value = trafficVizKind;
  trafficVizSelect.addEventListener("change", () => {
    trafficVizKind = trafficVizSelect.value;
    if (graph?.setTrafficVisualization) {
      graph.setTrafficVisualization(trafficVizKind);
      graph.update({
        filteredIds: new Set(getFilteredDevices().map((d) => d.id)),
        selected: state.selected,
      });
    }
  });
}

async function initNetworkSelect() {
  if (!networkSelect) return;

  try {
    const index = await loadJson("data/networks/index.json");
    const indexRec = asRecord(index);
    const networks = Array.isArray(indexRec?.networks)
      ? (indexRec.networks as Array<Record<string, unknown>>)
      : [];

    if (!networks.length) {
      networkSelect.innerHTML = '<option value="">Default</option>';
      networkSelect.value = "";
      networkSelect.disabled = true;
      return;
    }

    networkSelect.innerHTML = networks
      .map((n) => {
        const id = String(n?.id || "");
        const name = String(n?.name || id || "");
        return `<option value="${id}">${name}</option>`;
      })
      .join("");

    const defaultId = typeof indexRec?.defaultId === "string"
      ? indexRec.defaultId
      : String(networks[0]?.id || "");
    networkSelect.value = defaultId;

    networkSelect.addEventListener("change", async () => {
      const nextId = networkSelect.value;
      try {
        await initNetwork(nextId);
      } catch (err) {
        console.error(err);
        statusEl.textContent = "Failed to load selected network";
      }
    });
  } catch (err) {
    // If multi-network index isn't present, fall back to the bundled small-office fixture.
    console.warn(
      "Network index not found; falling back to small-office fixture.",
      err,
    );
    networkSelect.innerHTML =
      `<option value="${DEFAULT_NETWORK_ID}">Small Office</option>`;
    networkSelect.value = DEFAULT_NETWORK_ID;
    networkSelect.disabled = true;
  }
}

async function init() {
  wireEvents();

  initTrafficVizSelect();
  initLayoutSelect();

  await initNetworkSelect();
  const initialNetworkId = networkSelect
    ? (networkSelect.value || DEFAULT_NETWORK_ID)
    : DEFAULT_NETWORK_ID;
  await initNetwork(initialNetworkId);
}

init().catch((err) => {
  console.error(err);
  statusEl.textContent = "Failed to load data";
});

globalThis.addEventListener("beforeunload", () => stopTraffic());
