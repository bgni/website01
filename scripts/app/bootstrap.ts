import { TRAFFIC_VIZ_OPTIONS } from "../trafficFlowVisualization/registry.ts";
import { TRAFFIC_CONNECTOR_OPTIONS } from "../traffic/registry.ts";
import { LAYOUTS } from "../layouts/registry.ts";
import { createController } from "./controller.ts";
import { createStore, type State } from "./state.ts";
import { createControls } from "../ui/controls.ts";
import { createSearchPanel } from "../ui/searchPanel.ts";
import { createSelectedPanel } from "../ui/selectedPanel.ts";
import type { SortDir, SortKey } from "../search.ts";
import { loadData, loadJson } from "../dataLoader.ts";

type PersistedUiSettingsV1 = {
  v: 1;
  networkId?: string;
  filter?: string;
  sortKey?: SortKey;
  sortDir?: SortDir;
  pageSize?: number;
  trafficVizKind?: string;
  trafficSourceKind?: string;
  layoutKind?: string;
};

const UI_SETTINGS_STORAGE_KEY = "website01.uiSettings.v1";

const getLocalStorage = (doc: Document): Storage | undefined => {
  try {
    return doc.defaultView?.localStorage;
  } catch {
    return undefined;
  }
};

const safeParseJsonObject = (text: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

const isSortKey = (v: unknown): v is SortKey =>
  v === "name" || v === "brand" || v === "model" || v === "type" ||
  v === "ports";

const isSortDir = (v: unknown): v is SortDir => v === "asc" || v === "desc";

const isPositiveInt = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v > 0;

const loadPersistedUiSettings = (
  doc: Document,
): { settings: Partial<State>; hasNetworkId: boolean } => {
  const storage = getLocalStorage(doc);
  if (!storage) return { settings: {}, hasNetworkId: false };

  const raw = storage.getItem(UI_SETTINGS_STORAGE_KEY);
  if (!raw) return { settings: {}, hasNetworkId: false };

  const obj = safeParseJsonObject(raw);
  if (!obj) return { settings: {}, hasNetworkId: false };
  if (obj.v !== 1) return { settings: {}, hasNetworkId: false };

  const settings: Partial<State> = {};
  let hasNetworkId = false;

  if (isNonEmptyString(obj.networkId)) {
    settings.networkId = obj.networkId;
    hasNetworkId = true;
  }
  if (typeof obj.filter === "string") settings.filter = obj.filter;
  if (isSortKey(obj.sortKey)) settings.sortKey = obj.sortKey;
  if (isSortDir(obj.sortDir)) settings.sortDir = obj.sortDir;

  if (isPositiveInt(obj.pageSize)) {
    settings.pageSize = Math.max(1, Math.min(50, obj.pageSize));
  }

  if (typeof obj.trafficVizKind === "string") {
    const allowed = new Set(TRAFFIC_VIZ_OPTIONS.map((o) => o.id));
    if (allowed.has(obj.trafficVizKind)) {
      settings.trafficVizKind = obj.trafficVizKind;
    }
  }
  if (typeof obj.trafficSourceKind === "string") {
    const allowed = new Set(TRAFFIC_CONNECTOR_OPTIONS.map((o) => o.id));
    if (allowed.has(obj.trafficSourceKind)) {
      settings.trafficSourceKind = obj.trafficSourceKind;
    }
  }
  if (typeof obj.layoutKind === "string") {
    const allowed = new Set(LAYOUTS.map((o) => o.id));
    if (allowed.has(obj.layoutKind)) settings.layoutKind = obj.layoutKind;
  }

  return { settings, hasNetworkId };
};

const persistUiSettings = (storage: Storage | undefined, state: State) => {
  if (!storage) return;
  const data: PersistedUiSettingsV1 = {
    v: 1,
    networkId: state.networkId,
    filter: state.filter,
    sortKey: state.sortKey,
    sortDir: state.sortDir,
    pageSize: state.pageSize,
    trafficVizKind: state.trafficVizKind,
    trafficSourceKind: state.trafficSourceKind,
    layoutKind: state.layoutKind,
  };
  try {
    storage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage errors (private mode, quota, etc.)
  }
};

const mustGetById = <T extends Element>(doc: Document, id: string): T => {
  const el = doc.getElementById(id);
  if (!el) throw new Error(`Missing required element #${id}`);
  return el as unknown as T;
};

export function bootstrap(doc: Document) {
  const storage = getLocalStorage(doc);
  const { settings: persistedSettings, hasNetworkId: hasPersistedNetworkId } =
    loadPersistedUiSettings(doc);

  const graphSvg = mustGetById<SVGSVGElement>(doc, "graph");

  const initialState: State = {
    networkId: "small-office",
    statusText: "",
    filter: "",
    sortKey: "name",
    sortDir: "asc",
    selected: new Set<string>(),
    page: 1,
    pageSize: 6,
    devices: [],
    connections: [],
    traffic: [],
    deviceTypes: {},
    trafficSourceKind: "default",
    trafficVizKind: "classic",
    layoutKind: "force",
    ...persistedSettings,
  };

  const store = createStore(initialState);
  const controller = createController({
    store,
    dispatch: store.dispatch,
    graphSvg,
    deps: {
      loadData,
      loadJson,
      storage,
    },
  });

  const statusEl = mustGetById<HTMLElement>(doc, "status");
  const networkSelect = mustGetById<HTMLSelectElement>(doc, "networkSelect");
  const trafficSourceSelect = mustGetById<HTMLSelectElement>(
    doc,
    "trafficSourceSelect",
  );
  const trafficVizSelect = mustGetById<HTMLSelectElement>(
    doc,
    "trafficVizSelect",
  );
  const layoutSelect = mustGetById<HTMLSelectElement>(doc, "layoutSelect");
  const addDeviceName = mustGetById<HTMLInputElement>(doc, "addDeviceName");
  const addDeviceType = mustGetById<HTMLInputElement>(doc, "addDeviceType");
  const addDeviceBtn = mustGetById<HTMLButtonElement>(doc, "addDeviceBtn");
  const connectFromSelect = mustGetById<HTMLSelectElement>(
    doc,
    "connectFromSelect",
  );
  const connectToSelect = mustGetById<HTMLSelectElement>(doc, "connectToSelect");
  const connectDevicesBtn = mustGetById<HTMLButtonElement>(doc, "connectDevicesBtn");

  const searchInput = mustGetById<HTMLInputElement>(doc, "searchInput");
  const searchShell = mustGetById<HTMLElement>(doc, "searchShell");
  const searchResults = mustGetById<HTMLElement>(doc, "searchResults");
  const tbody = searchResults.querySelector("tbody");
  if (!tbody) throw new Error("Missing <tbody> inside #searchResults");
  const searchTbody = tbody as HTMLTableSectionElement;
  const pageInfo = mustGetById<HTMLElement>(doc, "pageInfo");

  const selectedDevicesEl = mustGetById<HTMLElement>(doc, "selectedDevices");
  const selectedOverlay = doc.getElementById("selectedOverlay");

  const controls = createControls({
    statusEl,
    networkSelect,
    trafficSourceSelect,
    trafficVizSelect,
    layoutSelect,
    clearSelectionBtn: mustGetById<HTMLButtonElement>(doc, "clearSelection"),
    onNetworkSelected: (id) => controller.loadNetwork(id),
    onTrafficSourceChanged: (kind) => controller.setTrafficSourceKind(kind),
    onLayoutChanged: (kind) => controller.setLayoutKind(kind),
    onTrafficVizChanged: (kind) => controller.setTrafficVizKind(kind),
    onClearSelection: () => controller.clearSelection(),
  });
  controls.setTrafficVizOptions(TRAFFIC_VIZ_OPTIONS);
  controls.setTrafficSourceOptions(TRAFFIC_CONNECTOR_OPTIONS);

  const searchPanel = createSearchPanel({
    searchInput,
    searchShell,
    searchResults,
    searchTbody,
    pageInfo,
    prevPageBtn: mustGetById<HTMLButtonElement>(doc, "prevPage"),
    nextPageBtn: mustGetById<HTMLButtonElement>(doc, "nextPage"),
    clearSearchBtn: mustGetById<HTMLButtonElement>(doc, "clearSearch"),
    dispatch: store.dispatch,
    getState: store.getState,
  });

  const selectedPanel = createSelectedPanel({
    selectedDevicesEl,
    selectedOverlay,
    dispatch: store.dispatch,
  });

  const renderAll = () => {
    const state = store.getState();
    controls.render(state);
    searchPanel.render(state);
    selectedPanel.render(state);

    const setDeviceOptions = (
      select: HTMLSelectElement,
      selectedValue: string,
    ) => {
      while (select.firstChild) select.removeChild(select.firstChild);
      state.devices.forEach((device) => {
        const opt = doc.createElement("option");
        opt.value = device.id;
        opt.textContent = device.name;
        if (device.id === selectedValue) opt.selected = true;
        select.appendChild(opt);
      });
    };

    setDeviceOptions(
      connectFromSelect,
      state.devices.some((d) => d.id === connectFromSelect.value)
        ? connectFromSelect.value
        : "",
    );
    setDeviceOptions(
      connectToSelect,
      state.devices.some((d) => d.id === connectToSelect.value)
        ? connectToSelect.value
        : "",
    );
  };

  addDeviceBtn.addEventListener("click", () => {
    controller.addDevice(addDeviceName.value, addDeviceType.value);
    addDeviceName.value = "";
  });

  connectDevicesBtn.addEventListener("click", () => {
    controller.connectDevices(connectFromSelect.value, connectToSelect.value);
  });

  // Initial paint and subsequent updates.
  renderAll();
  store.subscribe(() => renderAll());
  store.subscribe((state) => persistUiSettings(storage, state));

  return {
    start: async () => {
      // Networks list for the selector.
      let desiredNetworkId = store.getState().networkId;
      let shouldPreferPersistedNetwork = hasPersistedNetworkId;
      try {
        const index = await (await fetch("data/networks/index.json")).json();
        const networks = Array.isArray(index?.networks)
          ? index.networks.map((n: unknown) => {
            const rec = (n && typeof n === "object")
              ? (n as Record<string, unknown>)
              : {};
            return {
              id: String(rec.id || "").trim(),
              name: typeof rec.name === "string" ? rec.name : undefined,
            };
          }).filter((n: { id: string }) => Boolean(n.id))
          : [];
        const defaultId = typeof index?.defaultId === "string"
          ? index.defaultId
          : undefined;
        controls.setNetworkOptions(networks);

        if (
          desiredNetworkId &&
          !networks.some((n: { id: string }) => n.id === desiredNetworkId)
        ) {
          // Persisted value is no longer valid; allow fallback to default.
          shouldPreferPersistedNetwork = false;
        }

        if (!shouldPreferPersistedNetwork) {
          if (
            defaultId &&
            networks.some((n: { id: string }) => n.id === defaultId)
          ) {
            desiredNetworkId = defaultId;
          } else if (networks.length > 0) {
            desiredNetworkId = networks[0].id;
          }
        }
      } catch (err) {
        console.warn("Failed to load networks index.", err);
      }

      await controller.loadNetwork(desiredNetworkId);
    },
  };
}
