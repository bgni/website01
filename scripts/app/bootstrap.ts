import { TRAFFIC_VIZ_OPTIONS } from "../trafficFlowVisualization/registry.ts";
import { TRAFFIC_CONNECTOR_OPTIONS } from "../traffic/registry.ts";
import { LAYOUTS } from "../layouts/registry.ts";
import { CUSTOM_NETWORK_ID } from "./customTopology.ts";
import { createController } from "./controller.ts";
import { createStore, type State } from "./state.ts";
import { createControls } from "../ui/controls.ts";
import { createSearchPanel } from "../ui/searchPanel.ts";
import { createSelectedPanel } from "../ui/selectedPanel.ts";
import type { SortDir, SortKey } from "../search.ts";
import { loadData, loadJson } from "../dataLoader.ts";
import {
  DEVICE_KIND_ROUTER,
  DEVICE_KIND_SERVER,
  DEVICE_KIND_SWITCH,
  DEVICE_KIND_UNKNOWN,
  inferDeviceKindFromType,
} from "../domain/deviceKind.ts";

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

const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLInputElement) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;
  if ((target as HTMLElement).isContentEditable) return true;
  return Boolean(target.closest("input, textarea, select, [contenteditable]"));
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

  const searchInput = mustGetById<HTMLInputElement>(doc, "searchInput");
  const searchShell = mustGetById<HTMLElement>(doc, "searchShell");
  const searchResults = mustGetById<HTMLElement>(doc, "searchResults");
  const tbody = searchResults.querySelector("tbody");
  if (!tbody) throw new Error("Missing <tbody> inside #searchResults");
  const searchTbody = tbody as HTMLTableSectionElement;
  const pageInfo = mustGetById<HTMLElement>(doc, "pageInfo");

  const selectedDevicesEl = mustGetById<HTMLElement>(doc, "selectedDevices");
  const selectedOverlay = doc.getElementById("selectedOverlay");
  let builderTypeSearchQuery = "";

  const controls = createControls({
    statusEl,
    networkSelect,
    trafficSourceSelect,
    trafficVizSelect,
    layoutSelect,
    createEditBtn: mustGetById<HTMLButtonElement>(doc, "createEdit"),
    addDeviceTypeSearchInput: mustGetById<HTMLInputElement>(
      doc,
      "addDeviceTypeSearch",
    ),
    addDeviceTypeSelect: mustGetById<HTMLSelectElement>(doc, "addDeviceType"),
    addDeviceBtn: mustGetById<HTMLButtonElement>(doc, "addDevice"),
    undoBtn: mustGetById<HTMLButtonElement>(doc, "undoCustom"),
    redoBtn: mustGetById<HTMLButtonElement>(doc, "redoCustom"),
    connectBtn: mustGetById<HTMLButtonElement>(doc, "connectSelected"),
    deleteConnectionBtn: mustGetById<HTMLButtonElement>(
      doc,
      "deleteConnection",
    ),
    exportBtn: mustGetById<HTMLButtonElement>(doc, "exportTopology"),
    importBtn: mustGetById<HTMLButtonElement>(doc, "importTopology"),
    importInput: mustGetById<HTMLInputElement>(doc, "importTopologyInput"),
    clearSelectionBtn: mustGetById<HTMLButtonElement>(doc, "clearSelection"),
    onNetworkSelected: (id) => controller.loadNetwork(id),
    onTrafficSourceChanged: (kind) => controller.setTrafficSourceKind(kind),
    onLayoutChanged: (kind) => controller.setLayoutKind(kind),
    onTrafficVizChanged: (kind) => controller.setTrafficVizKind(kind),
    onEnterBuilderMode: () => controller.enterBuilderMode(),
    onBuilderTypeSearchChanged: (query) => {
      builderTypeSearchQuery = query.trim();
      renderAll();
    },
    onAddDevice: (slug) => controller.addCustomDevice(slug),
    onUndo: () => controller.undoLastCustomEdit(),
    onRedo: () => controller.redoLastCustomEdit(),
    onConnectSelected: () => controller.connectSelectedDevices(),
    onDeleteSelectedConnection: () => controller.deleteSelectedConnection(),
    onExportTopology: () => {
      const blob = new Blob([controller.exportTopologyJson()], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = doc.createElement("a");
      anchor.href = url;
      anchor.download = "topology.json";
      doc.body.appendChild(anchor);
      anchor.click();
      doc.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    },
    onImportTopology: async (text) => {
      await controller.importCustomTopologyJson(text);
    },
    onClearSelection: () => controller.clearSelection(),
  });
  controls.setTrafficVizOptions(TRAFFIC_VIZ_OPTIONS);
  controls.setTrafficSourceOptions(TRAFFIC_CONNECTOR_OPTIONS);
  controls.setNetworkOptions([{
    id: CUSTOM_NETWORK_ID,
    name: "Custom (local)",
  }]);

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
    onRenameDevice: (deviceId, name) =>
      controller.renameCustomDevice(deviceId, name),
    onChangeDeviceType: (deviceId, slug) =>
      controller.changeCustomDeviceType(deviceId, slug),
    onUpdateDeviceProperties: (deviceId, propertiesJson) =>
      controller.updateCustomDeviceProperties(deviceId, propertiesJson),
    onDeleteDevice: (deviceId) => controller.deleteCustomDevice(deviceId),
  });

  const renderAll = () => {
    const state = store.getState();

    const allDeviceTypeSlugs = Object.keys(state.deviceTypes).sort((a, b) => {
      const left = state.deviceTypes[a];
      const right = state.deviceTypes[b];
      const leftLabel = `${left?.brand ?? ""} ${left?.model ?? a}`.trim();
      const rightLabel = `${right?.brand ?? ""} ${right?.model ?? b}`.trim();
      return leftLabel.localeCompare(rightLabel);
    });
    const stats = controller.getBuilderDeviceStats();
    const recentSet = new Set(
      stats.recentDeviceTypeSlugs.filter((slug) => state.deviceTypes[slug]),
    );
    const kindOrder = [
      DEVICE_KIND_SWITCH,
      DEVICE_KIND_ROUTER,
      DEVICE_KIND_SERVER,
      DEVICE_KIND_UNKNOWN,
    ] as const;
    const kindLabelById = new Map<number, string>([
      [DEVICE_KIND_SWITCH, "Switches"],
      [DEVICE_KIND_ROUTER, "Routers"],
      [DEVICE_KIND_SERVER, "Servers"],
      [DEVICE_KIND_UNKNOWN, "Other"],
    ]);
    const rankByFrequentSlug = new Map(
      stats.frequentDeviceTypeSlugs.map((slug, index) => [slug, index]),
    );
    const labelBySlug = new Map(
      allDeviceTypeSlugs.map((slug) => [
        slug,
        `${state.deviceTypes[slug].brand} ${state.deviceTypes[slug].model}`,
      ]),
    );

    const normalizedQuery = builderTypeSearchQuery.toLowerCase();

    const compareSlugs = (left: string, right: string) => {
      const leftRank = rankByFrequentSlug.get(left) ?? Number.POSITIVE_INFINITY;
      const rightRank = rankByFrequentSlug.get(right) ??
        Number.POSITIVE_INFINITY;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return (labelBySlug.get(left) ?? left).localeCompare(
        labelBySlug.get(right) ?? right,
      );
    };

    const kindBySlug = new Map<string, number>(
      allDeviceTypeSlugs.map((slug) => {
        const deviceType = state.deviceTypes[slug];
        const typeText = `${slug} ${deviceType.model}`;
        return [slug, inferDeviceKindFromType(typeText)] as const;
      }),
    );

    const popularByKind = new Map<number, string[]>();
    kindOrder.forEach((kind) => {
      const slugs = allDeviceTypeSlugs
        .filter((slug) => kindBySlug.get(slug) === kind && !recentSet.has(slug))
        .sort(compareSlugs)
        .slice(0, 10);
      popularByKind.set(kind, slugs);
    });

    const popularSet = new Set<string>(
      Array.from(popularByKind.values()).flat(),
    );

    const searchMatches = normalizedQuery
      ? allDeviceTypeSlugs
        .filter((slug) => !recentSet.has(slug) && !popularSet.has(slug))
        .filter((slug) => {
          const dt = state.deviceTypes[slug];
          const haystack = `${slug} ${dt.brand} ${dt.model}`.toLowerCase();
          return haystack.includes(normalizedQuery);
        })
        .sort(compareSlugs)
      : [];

    controls.setBuilderDeviceTypeOptions([
      ...Array.from(recentSet).map((slug) => ({
        slug,
        label: labelBySlug.get(slug) ?? slug,
        groupId: "recent",
        groupLabel: "Recent",
      })),
      ...kindOrder.flatMap((kind) =>
        (popularByKind.get(kind) ?? []).map((slug) => ({
          slug,
          label: labelBySlug.get(slug) ?? slug,
          groupId: `popular-${kind}`,
          groupLabel: `Popular ${kindLabelById.get(kind) ?? "Other"} (Top 10)`,
        }))
      ),
      ...searchMatches.map((slug) => ({
        slug,
        label: labelBySlug.get(slug) ?? slug,
        groupId: "search",
        groupLabel: "Search results",
      })),
    ]);
    controls.setBuilderUndoEnabled(controller.canUndoCustomEdit());
    controls.setBuilderRedoEnabled(controller.canRedoCustomEdit());

    controls.render(state);
    searchPanel.render(state);
    selectedPanel.render(state);
  };

  // Initial paint and subsequent updates.
  renderAll();
  store.subscribe(() => renderAll());
  store.subscribe((state) => persistUiSettings(storage, state));

  doc.addEventListener("keydown", (event: KeyboardEvent) => {
    if (isTypingTarget(event.target)) return;

    const key = event.key.toLowerCase();
    const hasAccel = event.metaKey || event.ctrlKey;
    const isCustomMode = store.getState().networkId === CUSTOM_NETWORK_ID;

    if (!hasAccel || event.altKey || !isCustomMode) return;

    const isUndoShortcut = key === "z" && !event.shiftKey;
    const isRedoShortcut = key === "z" && event.shiftKey;
    const isRedoAliasShortcut = key === "y" && !event.shiftKey;

    if (isUndoShortcut) {
      event.preventDefault();
      controller.undoLastCustomEdit();
      return;
    }

    if (isRedoShortcut) {
      event.preventDefault();
      controller.redoLastCustomEdit();
      return;
    }

    if (isRedoAliasShortcut) {
      event.preventDefault();
      controller.redoLastCustomEdit();
    }
  });

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
        controls.setNetworkOptions([
          ...networks,
          { id: CUSTOM_NETWORK_ID, name: "Custom (local)" },
        ]);

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
