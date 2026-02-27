import { TRAFFIC_VIZ_OPTIONS } from "../trafficFlowVisualization/registry.ts";
import { TRAFFIC_CONNECTOR_OPTIONS } from "../traffic/registry.ts";
import { LAYOUTS } from "../layouts/registry.ts";
import { CUSTOM_NETWORK_ID } from "./customTopology.ts";
import { createController } from "./controller.ts";
import { createStore, type State } from "./state.ts";
import { BUILDER_DEVICE_DRAG_MIME, createControls } from "../ui/controls.ts";
import { createSearchPanel } from "../ui/searchPanel.ts";
import { createSelectedPanel } from "../ui/selectedPanel.ts";
import type { SortDir, SortKey } from "../search.ts";
import { loadData, loadJson } from "../dataLoader.ts";
import {
  buildBuilderPickerModel,
  BUILDER_GROUP_SLUG,
} from "./builderPickerOptions.ts";
import { GRAPH_DEFAULTS } from "../config.ts";

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
  flowSpeedMultiplier?: number;
  edgeOpacity?: number;
  labelTextSize?: number;
  labelMargin?: number;
};

const UI_SETTINGS_STORAGE_KEY = "website01.uiSettings.v1";
const PANEL_WIDTHS_STORAGE_KEY = "website01.panelWidths.v1";
const FLOW_SPEED_MIN = 0.1;
const FLOW_SPEED_MAX = 64;
const EDGE_OPACITY_MIN = 0.1;
const EDGE_OPACITY_MAX = 1;
const LABEL_TEXT_SIZE_MIN = 9;
const LABEL_TEXT_SIZE_MAX = 24;
const LABEL_MARGIN_MIN = 8;
const LABEL_MARGIN_MAX = 52;
const LEGACY_LABEL_TEXT_SIZE_DEFAULT = 11;
const LEGACY_LABEL_MARGIN_DEFAULT = 24;

type DisplaySettingsState = {
  edgeOpacity: number;
  labelTextSize: number;
  labelMargin: number;
};

type PersistedPanelWidthsV1 = {
  v: 1;
  left?: number;
  right?: number;
};

const getDefaultLabelMargin = (labelTextSize: number): number =>
  Math.max(
    LABEL_MARGIN_MIN,
    Math.min(LABEL_MARGIN_MAX, Math.round(labelTextSize * 3)),
  );

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

const isPositiveFinite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

const loadPersistedUiSettings = (
  doc: Document,
): {
  settings: Partial<State>;
  hasNetworkId: boolean;
  flowSpeedMultiplier?: number;
  displaySettings?: Partial<DisplaySettingsState>;
} => {
  const storage = getLocalStorage(doc);
  if (!storage) return { settings: {}, hasNetworkId: false };

  const raw = storage.getItem(UI_SETTINGS_STORAGE_KEY);
  if (!raw) return { settings: {}, hasNetworkId: false };

  const obj = safeParseJsonObject(raw);
  if (!obj) return { settings: {}, hasNetworkId: false };
  if (obj.v !== 1) return { settings: {}, hasNetworkId: false };

  const settings: Partial<State> = {};
  let hasNetworkId = false;
  let flowSpeedMultiplier: number | undefined;
  const displaySettings: Partial<DisplaySettingsState> = {};

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
  if (isPositiveFinite(obj.flowSpeedMultiplier)) {
    flowSpeedMultiplier = Math.max(
      FLOW_SPEED_MIN,
      Math.min(FLOW_SPEED_MAX, obj.flowSpeedMultiplier),
    );
  }
  if (isPositiveFinite(obj.edgeOpacity)) {
    displaySettings.edgeOpacity = Math.max(
      EDGE_OPACITY_MIN,
      Math.min(EDGE_OPACITY_MAX, obj.edgeOpacity),
    );
  }
  if (isPositiveFinite(obj.labelTextSize)) {
    displaySettings.labelTextSize = Math.max(
      LABEL_TEXT_SIZE_MIN,
      Math.min(LABEL_TEXT_SIZE_MAX, obj.labelTextSize),
    );
  }
  if (isPositiveFinite(obj.labelMargin)) {
    displaySettings.labelMargin = Math.max(
      LABEL_MARGIN_MIN,
      Math.min(LABEL_MARGIN_MAX, obj.labelMargin),
    );
  }
  if (
    displaySettings.labelTextSize === LEGACY_LABEL_TEXT_SIZE_DEFAULT &&
    displaySettings.labelMargin === LEGACY_LABEL_MARGIN_DEFAULT
  ) {
    delete displaySettings.labelTextSize;
    delete displaySettings.labelMargin;
  }

  return {
    settings,
    hasNetworkId,
    flowSpeedMultiplier,
    displaySettings,
  };
};

const persistUiSettings = (
  storage: Storage | undefined,
  state: State,
  flowSpeedMultiplier: number,
  displaySettings: DisplaySettingsState,
) => {
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
    flowSpeedMultiplier,
    edgeOpacity: displaySettings.edgeOpacity,
    labelTextSize: displaySettings.labelTextSize,
    labelMargin: displaySettings.labelMargin,
  };
  try {
    storage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage errors (private mode, quota, etc.)
  }
};

const clampPanelWidth = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const loadPersistedPanelWidths = (
  storage: Storage | undefined,
): { left?: number; right?: number } => {
  if (!storage) return {};
  const raw = storage.getItem(PANEL_WIDTHS_STORAGE_KEY);
  if (!raw) return {};
  const parsed = safeParseJsonObject(raw);
  if (!parsed || parsed.v !== 1) return {};
  const out: { left?: number; right?: number } = {};
  if (isPositiveInt(parsed.left)) out.left = parsed.left;
  if (isPositiveInt(parsed.right)) out.right = parsed.right;
  return out;
};

const persistPanelWidths = (
  storage: Storage | undefined,
  widths: { left?: number; right?: number },
) => {
  if (!storage) return;
  const payload: PersistedPanelWidthsV1 = {
    v: 1,
    ...(typeof widths.left === "number" ? { left: widths.left } : {}),
    ...(typeof widths.right === "number" ? { right: widths.right } : {}),
  };
  try {
    storage.setItem(PANEL_WIDTHS_STORAGE_KEY, JSON.stringify(payload));
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
  const {
    settings: persistedSettings,
    hasNetworkId: hasPersistedNetworkId,
    flowSpeedMultiplier: persistedFlowSpeedMultiplier,
    displaySettings: persistedDisplaySettings,
  } = loadPersistedUiSettings(doc);

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
  const flowSpeedMultiplierInput = mustGetById<HTMLInputElement>(
    doc,
    "flowSpeedMultiplier",
  );
  const flowSpeedMultiplierValue = mustGetById<HTMLOutputElement>(
    doc,
    "flowSpeedMultiplierValue",
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
  const modeBadgeEl = mustGetById<HTMLElement>(doc, "modeBadge");
  const builderWorkflowSelect = mustGetById<HTMLSelectElement>(
    doc,
    "builderWorkflow",
  );
  const createEditBtn = mustGetById<HTMLButtonElement>(doc, "createEdit");
  const builderPanelToggleBtn = mustGetById<HTMLButtonElement>(
    doc,
    "builderPanelToggle",
  );
  const builderPanelCollapseBtn = mustGetById<HTMLButtonElement>(
    doc,
    "builderPanelCollapse",
  );
  const selectedPanelToggleBtn = mustGetById<HTMLButtonElement>(
    doc,
    "selectedPanelToggle",
  );
  const selectedPanelCollapseBtn = mustGetById<HTMLButtonElement>(
    doc,
    "selectedPanelCollapse",
  );
  const displaySettingsToggleBtn = mustGetById<HTMLButtonElement>(
    doc,
    "displaySettingsToggle",
  );
  const displaySettingsPanel = mustGetById<HTMLElement>(
    doc,
    "displaySettingsPanel",
  );
  const displaySettingsCloseBtn = mustGetById<HTMLButtonElement>(
    doc,
    "displaySettingsClose",
  );
  const edgeOpacityInput = mustGetById<HTMLInputElement>(doc, "edgeOpacity");
  const edgeOpacityValue = mustGetById<HTMLOutputElement>(
    doc,
    "edgeOpacityValue",
  );
  const labelTextSizeInput = mustGetById<HTMLInputElement>(
    doc,
    "labelTextSize",
  );
  const labelTextSizeValue = mustGetById<HTMLOutputElement>(
    doc,
    "labelTextSizeValue",
  );
  const labelMarginInput = mustGetById<HTMLInputElement>(doc, "labelMargin");
  const labelMarginValue = mustGetById<HTMLOutputElement>(
    doc,
    "labelMarginValue",
  );
  const builderOverlayEl = mustGetById<HTMLElement>(doc, "builderOverlay");
  const builderResizeHandle = mustGetById<HTMLElement>(
    doc,
    "builderResizeHandle",
  );
  const selectedOverlayEl = mustGetById<HTMLElement>(doc, "selectedOverlay");
  const selectedResizeHandle = mustGetById<HTMLElement>(
    doc,
    "selectedResizeHandle",
  );
  let builderTypeSearchQuery = "";
  let flowSpeedMultiplier = persistedFlowSpeedMultiplier ?? 1;
  let displaySettingsOpen = false;
  let pendingBuilderModePromise: Promise<boolean> | null = null;
  let builderPanelOpen = !(
    doc.defaultView?.matchMedia("(max-width: 800px)").matches ?? false
  );
  let selectedPanelOpen = false;
  let lastSelectedCount = 0;
  const displaySettings: DisplaySettingsState = {
    edgeOpacity: persistedDisplaySettings?.edgeOpacity ?? 1,
    labelTextSize: persistedDisplaySettings?.labelTextSize ??
      GRAPH_DEFAULTS.label.fontSize,
    labelMargin: persistedDisplaySettings?.labelMargin ??
      getDefaultLabelMargin(
        persistedDisplaySettings?.labelTextSize ??
          GRAPH_DEFAULTS.label.fontSize,
      ),
  };

  const restoreSelection = (ids: string[]) => {
    const wantedIds = ids.filter((id) => id.trim().length > 0);
    const state = store.getState();
    const existingIds = new Set(state.devices.map((device) => device.id));
    const keepIds = wantedIds.filter((id) => existingIds.has(id));
    controller.dispatch({ type: "clearSelection" });
    keepIds.forEach((id) => {
      controller.dispatch({ type: "toggleSelect", id, forceOn: true });
    });
  };

  const getSourceNetworkForEditing = (): string => {
    const state = store.getState();
    if (state.networkId === CUSTOM_NETWORK_ID) {
      return networkSelect.value || "small-office";
    }
    return state.networkId || networkSelect.value || "small-office";
  };

  const ensureBuilderModeForEditing = async (
    options?: { preserveSelectionIds?: string[] },
  ): Promise<boolean> => {
    if (store.getState().networkId === CUSTOM_NETWORK_ID) {
      if (options?.preserveSelectionIds?.length) {
        restoreSelection(options.preserveSelectionIds);
      }
      return true;
    }
    if (pendingBuilderModePromise) {
      const opened = await pendingBuilderModePromise;
      if (opened && options?.preserveSelectionIds?.length) {
        restoreSelection(options.preserveSelectionIds);
      }
      return opened;
    }

    pendingBuilderModePromise = (async () => {
      const sourceNetworkId = getSourceNetworkForEditing();
      await controller.startBuilderFromNetwork(sourceNetworkId);
      return store.getState().networkId === CUSTOM_NETWORK_ID;
    })();

    try {
      const opened = await pendingBuilderModePromise;
      if (opened && options?.preserveSelectionIds?.length) {
        restoreSelection(options.preserveSelectionIds);
      }
      return opened;
    } finally {
      pendingBuilderModePromise = null;
    }
  };

  void controller.setFlowSpeedMultiplier(flowSpeedMultiplier);
  controller.setDisplaySettings(displaySettings);

  const controls = createControls({
    statusEl,
    networkSelect,
    modeBadgeEl,
    trafficSourceSelect,
    trafficVizSelect,
    layoutSelect,
    builderWorkflowSelect,
    createEditBtn,
    builderOverlay: builderOverlayEl,
    builderPalette: mustGetById<HTMLElement>(doc, "builderPalette"),
    builderShortlistPanel: mustGetById<HTMLElement>(doc, "builderShortlist"),
    addDeviceTypeSearchInput: mustGetById<HTMLInputElement>(
      doc,
      "addDeviceTypeSearch",
    ),
    builderFilterToggleBtn: mustGetById<HTMLButtonElement>(
      doc,
      "builderFilterToggle",
    ),
    builderFilterPanel: mustGetById<HTMLElement>(doc, "builderFilterPanel"),
    builderFilterCloseBtn: mustGetById<HTMLButtonElement>(
      doc,
      "builderFilterClose",
    ),
    addDeviceTypeSelect: mustGetById<HTMLSelectElement>(doc, "addDeviceType"),
    addPortTypeFilterSelect: mustGetById<HTMLSelectElement>(
      doc,
      "addPortTypeFilter",
    ),
    addDeviceBtn: mustGetById<HTMLButtonElement>(doc, "addDevice"),
    groupSelectedBtn: mustGetById<HTMLButtonElement>(doc, "groupSelected"),
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
    onOpenBuilderMode: async (workflow, sourceNetworkId) => {
      if (workflow === "new") {
        await controller.startBuilderFromBlank();
        return;
      }
      if (workflow === "resume") {
        await controller.enterBuilderMode();
        return;
      }
      await controller.startBuilderFromNetwork(sourceNetworkId);
    },
    onExitBuilderMode: (sourceNetworkId) =>
      controller.loadNetwork(sourceNetworkId),
    onBuilderTypeSearchChanged: (query) => {
      builderTypeSearchQuery = query.trim();
      renderAll();
    },
    onSetShortlistModel: (kindId, slug) => {
      controller.setBuilderShortlistDevice(kindId, slug);
      renderAll();
    },
    onAddDevice: (slug) => {
      void (async () => {
        const isBuilderReady = await ensureBuilderModeForEditing();
        if (!isBuilderReady) return;
        if (slug === BUILDER_GROUP_SLUG) {
          controller.addCustomContainerAt(controller.getGraphViewportCenter());
          return;
        }
        controller.addCustomDevice(slug);
      })();
    },
    onGroupSelected: () => {
      void (async () => {
        const selectedIds = Array.from(store.getState().selected);
        const isBuilderReady = await ensureBuilderModeForEditing({
          preserveSelectionIds: selectedIds,
        });
        if (!isBuilderReady) return;
        controller.groupSelectedDevices();
      })();
    },
    onUndo: () => controller.undoLastCustomEdit(),
    onRedo: () => controller.redoLastCustomEdit(),
    onConnectSelected: () => {
      void (async () => {
        const selectedIds = Array.from(store.getState().selected);
        const isBuilderReady = await ensureBuilderModeForEditing({
          preserveSelectionIds: selectedIds,
        });
        if (!isBuilderReady) return;
        controller.connectSelectedDevices();
      })();
    },
    onDeleteSelectedConnection: () => {
      void (async () => {
        const selectedIds = Array.from(store.getState().selected);
        const isBuilderReady = await ensureBuilderModeForEditing({
          preserveSelectionIds: selectedIds,
        });
        if (!isBuilderReady) return;
        controller.deleteSelectedConnection();
      })();
    },
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
    id: initialState.networkId,
    name: initialState.networkId,
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

  const panelWidths = loadPersistedPanelWidths(storage);
  if (typeof panelWidths.left === "number") {
    const leftWidth = clampPanelWidth(panelWidths.left, 220, 560);
    builderOverlayEl.style.width = `${leftWidth}px`;
    panelWidths.left = leftWidth;
  }
  if (typeof panelWidths.right === "number") {
    const rightWidth = clampPanelWidth(panelWidths.right, 240, 620);
    selectedOverlayEl.style.width = `${rightWidth}px`;
    panelWidths.right = rightWidth;
  }

  const setOverlayOpen = (
    overlay: HTMLElement,
    button: HTMLButtonElement,
    isOpen: boolean,
  ) => {
    overlay.classList.toggle("is-hidden", !isOpen);
    overlay.setAttribute("aria-hidden", (!isOpen).toString());
    button.classList.toggle("is-active", isOpen);
    button.setAttribute("aria-pressed", isOpen.toString());
  };

  const setBuilderPanelOpen = (isOpen: boolean) => {
    builderPanelOpen = isOpen;
    setOverlayOpen(builderOverlayEl, builderPanelToggleBtn, isOpen);
  };

  const setSelectedPanelOpen = (isOpen: boolean) => {
    selectedPanelOpen = isOpen;
    setOverlayOpen(selectedOverlayEl, selectedPanelToggleBtn, isOpen);
  };

  const wireOverlayResizer = (
    {
      overlay,
      handle,
      key,
      direction,
      minWidth,
      maxWidth,
    }: {
      overlay: HTMLElement;
      handle: HTMLElement;
      key: "left" | "right";
      direction: "expand-right" | "expand-left";
      minWidth: number;
      maxWidth: number;
    },
  ) => {
    const startDrag = (
      startX: number,
      setupGlobalEvents: (
        onMove: (clientX: number) => void,
        onStop: () => void,
      ) => void,
    ) => {
      const win = doc.defaultView;
      if (!win) return;
      if (win.matchMedia("(max-width: 800px)").matches) return;

      const startWidth = overlay.getBoundingClientRect().width;
      const directionFactor = direction === "expand-right" ? 1 : -1;
      handle.classList.add("is-active");

      const onMove = (clientX: number) => {
        const delta = clientX - startX;
        const viewportMax = Math.floor(win.innerWidth * 0.55);
        const clamped = clampPanelWidth(
          Math.round(startWidth + delta * directionFactor),
          minWidth,
          Math.min(maxWidth, viewportMax),
        );
        overlay.style.width = `${clamped}px`;
        panelWidths[key] = clamped;
      };

      const onStop = () => {
        handle.classList.remove("is-active");
        persistPanelWidths(storage, panelWidths);
      };

      setupGlobalEvents(onMove, onStop);
    };

    handle.addEventListener("pointerdown", (event: PointerEvent) => {
      event.preventDefault();
      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
        // Ignore pointer-capture failures on older environments.
      }
      const win = doc.defaultView;
      if (!win) return;
      startDrag(event.clientX, (onMove, onStop) => {
        const move = (moveEvent: PointerEvent) => onMove(moveEvent.clientX);
        const stop = () => {
          win.removeEventListener("pointermove", move);
          win.removeEventListener("pointerup", stop);
          win.removeEventListener("pointercancel", stop);
          onStop();
        };
        win.addEventListener("pointermove", move);
        win.addEventListener("pointerup", stop, { once: true });
        win.addEventListener("pointercancel", stop, { once: true });
      });
    });

    handle.addEventListener("mousedown", (event: MouseEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const win = doc.defaultView;
      if (!win) return;
      startDrag(event.clientX, (onMove, onStop) => {
        const move = (moveEvent: MouseEvent) => onMove(moveEvent.clientX);
        const stop = () => {
          win.removeEventListener("mousemove", move);
          win.removeEventListener("mouseup", stop);
          onStop();
        };
        win.addEventListener("mousemove", move);
        win.addEventListener("mouseup", stop, { once: true });
      });
    });

    handle.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const win = doc.defaultView;
      if (!win) return;
      const currentWidth = overlay.getBoundingClientRect().width;
      const delta = event.key === "ArrowRight" ? 20 : -20;
      const directionFactor = direction === "expand-right" ? 1 : -1;
      const viewportMax = Math.floor(win.innerWidth * 0.55);
      const clamped = clampPanelWidth(
        Math.round(currentWidth + delta * directionFactor),
        minWidth,
        Math.min(maxWidth, viewportMax),
      );
      overlay.style.width = `${clamped}px`;
      panelWidths[key] = clamped;
      persistPanelWidths(storage, panelWidths);
    });
  };

  wireOverlayResizer({
    overlay: builderOverlayEl,
    handle: builderResizeHandle,
    key: "left",
    direction: "expand-right",
    minWidth: 220,
    maxWidth: 560,
  });
  wireOverlayResizer({
    overlay: selectedOverlayEl,
    handle: selectedResizeHandle,
    key: "right",
    direction: "expand-left",
    minWidth: 240,
    maxWidth: 620,
  });

  const renderFlowSpeedMultiplier = () => {
    flowSpeedMultiplierInput.value = String(flowSpeedMultiplier);
    flowSpeedMultiplierValue.value = `${flowSpeedMultiplier.toFixed(2)}x`;
    flowSpeedMultiplierValue.textContent = `${flowSpeedMultiplier.toFixed(2)}x`;
  };

  const renderDisplaySettings = () => {
    edgeOpacityInput.value = displaySettings.edgeOpacity.toFixed(2);
    edgeOpacityValue.value = `${
      Math.round(displaySettings.edgeOpacity * 100)
    }%`;
    edgeOpacityValue.textContent = `${
      Math.round(displaySettings.edgeOpacity * 100)
    }%`;
    labelTextSizeInput.value = String(displaySettings.labelTextSize);
    labelTextSizeValue.value = `${displaySettings.labelTextSize}px`;
    labelTextSizeValue.textContent = `${displaySettings.labelTextSize}px`;
    labelMarginInput.value = String(displaySettings.labelMargin);
    labelMarginValue.value = `${displaySettings.labelMargin}px`;
    labelMarginValue.textContent = `${displaySettings.labelMargin}px`;
  };

  const persistCurrentUiSettings = () => {
    persistUiSettings(
      storage,
      store.getState(),
      flowSpeedMultiplier,
      displaySettings,
    );
  };

  const setDisplaySettingsOpen = (isOpen: boolean) => {
    displaySettingsOpen = isOpen;
    displaySettingsPanel.classList.toggle("is-hidden", !isOpen);
    displaySettingsPanel.setAttribute("aria-hidden", (!isOpen).toString());
    displaySettingsToggleBtn.classList.toggle("is-active", isOpen);
    displaySettingsToggleBtn.setAttribute("aria-pressed", isOpen.toString());
  };

  let flowSpeedApplyTimer: number | null = null;
  setBuilderPanelOpen(builderPanelOpen);
  setSelectedPanelOpen(selectedPanelOpen);
  setDisplaySettingsOpen(false);
  builderPanelToggleBtn.addEventListener("click", () => {
    setBuilderPanelOpen(!builderPanelOpen);
  });
  builderPanelCollapseBtn.addEventListener("click", () => {
    setBuilderPanelOpen(false);
  });
  selectedPanelToggleBtn.addEventListener("click", () => {
    setSelectedPanelOpen(!selectedPanelOpen);
  });
  selectedPanelCollapseBtn.addEventListener("click", () => {
    setSelectedPanelOpen(false);
  });
  displaySettingsToggleBtn.addEventListener("click", () => {
    setDisplaySettingsOpen(!displaySettingsOpen);
  });
  displaySettingsCloseBtn.addEventListener("click", () => {
    setDisplaySettingsOpen(false);
  });
  renderFlowSpeedMultiplier();
  renderDisplaySettings();
  flowSpeedMultiplierInput.addEventListener("input", () => {
    const raw = Number(flowSpeedMultiplierInput.value);
    if (!Number.isFinite(raw) || raw <= 0) return;
    flowSpeedMultiplier = Math.max(
      FLOW_SPEED_MIN,
      Math.min(FLOW_SPEED_MAX, raw),
    );
    renderFlowSpeedMultiplier();
    persistCurrentUiSettings();
    const win = doc.defaultView;
    if (flowSpeedApplyTimer && win) {
      win.clearTimeout(flowSpeedApplyTimer);
    }
    flowSpeedApplyTimer = win
      ? win.setTimeout(() => {
        flowSpeedApplyTimer = null;
        void controller.setFlowSpeedMultiplier(flowSpeedMultiplier);
      }, 120)
      : null;
  });
  edgeOpacityInput.addEventListener("input", () => {
    const raw = Number(edgeOpacityInput.value);
    if (!Number.isFinite(raw) || raw <= 0) return;
    displaySettings.edgeOpacity = Math.max(
      EDGE_OPACITY_MIN,
      Math.min(EDGE_OPACITY_MAX, raw),
    );
    renderDisplaySettings();
    controller.setDisplaySettings(displaySettings);
    persistCurrentUiSettings();
  });
  labelTextSizeInput.addEventListener("input", () => {
    const raw = Number(labelTextSizeInput.value);
    if (!Number.isFinite(raw) || raw <= 0) return;
    const previousLabelTextSize = displaySettings.labelTextSize;
    const previousDefaultLabelMargin = getDefaultLabelMargin(
      previousLabelTextSize,
    );
    const shouldFollowDefaultLabelMargin =
      displaySettings.labelMargin === previousDefaultLabelMargin ||
      displaySettings.labelMargin === GRAPH_DEFAULTS.label.yOffset ||
      displaySettings.labelMargin === LEGACY_LABEL_MARGIN_DEFAULT;
    displaySettings.labelTextSize = Math.round(
      Math.max(
        LABEL_TEXT_SIZE_MIN,
        Math.min(LABEL_TEXT_SIZE_MAX, raw),
      ),
    );
    if (shouldFollowDefaultLabelMargin) {
      displaySettings.labelMargin = getDefaultLabelMargin(
        displaySettings.labelTextSize,
      );
    }
    renderDisplaySettings();
    controller.setDisplaySettings(displaySettings);
    persistCurrentUiSettings();
  });
  labelMarginInput.addEventListener("input", () => {
    const raw = Number(labelMarginInput.value);
    if (!Number.isFinite(raw) || raw <= 0) return;
    displaySettings.labelMargin = Math.round(
      Math.max(
        LABEL_MARGIN_MIN,
        Math.min(LABEL_MARGIN_MAX, raw),
      ),
    );
    renderDisplaySettings();
    controller.setDisplaySettings(displaySettings);
    persistCurrentUiSettings();
  });

  const readDraggedDeviceTypeSlug = (event: DragEvent): string => {
    const transfer = event.dataTransfer;
    if (!transfer) return "";
    const byMime = transfer.getData(BUILDER_DEVICE_DRAG_MIME).trim();
    if (byMime) return byMime;
    return transfer.getData("text/plain").trim();
  };

  const setGraphDropTarget = (isActive: boolean) => {
    graphSvg.classList.toggle("is-drop-target", isActive);
  };

  graphSvg.addEventListener("dragenter", (event: DragEvent) => {
    const slug = readDraggedDeviceTypeSlug(event);
    if (!slug) return;
    event.preventDefault();
    setGraphDropTarget(true);
  });

  graphSvg.addEventListener("dragover", (event: DragEvent) => {
    const slug = readDraggedDeviceTypeSlug(event);
    if (!slug) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
    setGraphDropTarget(true);
  });

  graphSvg.addEventListener("dragleave", (event: DragEvent) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && graphSvg.contains(nextTarget)) return;
    setGraphDropTarget(false);
  });

  graphSvg.addEventListener("drop", (event: DragEvent) => {
    setGraphDropTarget(false);
    const slug = readDraggedDeviceTypeSlug(event);
    if (!slug) return;
    event.preventDefault();
    const { clientX, clientY } = event;
    void (async () => {
      const isBuilderReady = await ensureBuilderModeForEditing();
      if (!isBuilderReady) return;
      const point = controller.clientPointToGraph(clientX, clientY);
      if (slug === BUILDER_GROUP_SLUG) {
        controller.addCustomContainerAt(
          point ?? controller.getGraphViewportCenter(),
        );
        return;
      }
      if (point) {
        controller.addCustomDeviceAt(slug, point);
        return;
      }
      controller.addCustomDevice(slug);
    })();
  });

  doc.addEventListener("dragend", () => setGraphDropTarget(false));
  doc.addEventListener("drop", () => setGraphDropTarget(false));

  const renderAll = () => {
    const state = store.getState();
    const selectedCount = state.selected.size;
    if (selectedCount > 0 && lastSelectedCount === 0) {
      setSelectedPanelOpen(true);
    } else if (selectedCount === 0 && lastSelectedCount > 0) {
      setSelectedPanelOpen(false);
    }
    lastSelectedCount = selectedCount;

    const stats = controller.getBuilderDeviceStats();
    const pickerModel = buildBuilderPickerModel({
      deviceTypes: state.deviceTypes,
      recentDeviceTypeSlugs: stats.recentDeviceTypeSlugs,
      frequentDeviceTypeSlugs: stats.frequentDeviceTypeSlugs,
      shortlistByKind: stats.shortlistByKind,
      query: builderTypeSearchQuery,
    });
    controls.setBuilderDeviceTypeOptions(pickerModel.options);
    controls.setBuilderShortlistKinds(pickerModel.shortlistKinds);
    controls.setBuilderUndoEnabled(controller.canUndoCustomEdit());
    controls.setBuilderRedoEnabled(controller.canRedoCustomEdit());

    controls.render(state);
    searchPanel.render(state);
    selectedPanel.render(state);
  };

  // Initial paint and subsequent updates.
  renderAll();
  store.subscribe(() => renderAll());
  store.subscribe((state) =>
    persistUiSettings(storage, state, flowSpeedMultiplier, displaySettings)
  );

  doc.addEventListener("keydown", (event: KeyboardEvent) => {
    if (isTypingTarget(event.target)) return;

    if (event.key === "Delete") {
      const state = store.getState();
      const selectedIds = Array.from(state.selected);
      if (!selectedIds.length) return;
      event.preventDefault();
      const hasSelectedConnection = selectedIds.length === 2
        ? state.connections.some((connection) =>
          (connection.from.deviceId === selectedIds[0] &&
            connection.to.deviceId === selectedIds[1]) ||
          (connection.from.deviceId === selectedIds[1] &&
            connection.to.deviceId === selectedIds[0])
        )
        : false;
      void (async () => {
        const isBuilderReady = await ensureBuilderModeForEditing({
          preserveSelectionIds: selectedIds,
        });
        if (!isBuilderReady) return;
        if (hasSelectedConnection) {
          controller.deleteSelectedConnection();
          return;
        }
        controller.deleteSelectedDevices();
      })();
      return;
    }

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
