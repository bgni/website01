import { TRAFFIC_VIZ_OPTIONS } from "../trafficFlowVisualization/registry.ts";
import { createController } from "./controller.ts";
import { createStore, type State } from "./state.ts";
import { createControls } from "../ui/controls.ts";
import { createSearchPanel } from "../ui/searchPanel.ts";
import { createSelectedPanel } from "../ui/selectedPanel.ts";

const mustGetById = <T extends HTMLElement>(doc: Document, id: string): T => {
  const el = doc.getElementById(id);
  if (!el) throw new Error(`Missing required element #${id}`);
  return el as T;
};

export function bootstrap(doc: Document) {
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
    trafficVizKind: "classic",
    layoutKind: "force",
  };

  const store = createStore(initialState);
  const controller = createController({ store, dispatch: store.dispatch });

  const statusEl = mustGetById<HTMLElement>(doc, "status");
  const networkSelect = mustGetById<HTMLSelectElement>(doc, "networkSelect");
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

  const controls = createControls({
    statusEl,
    networkSelect,
    trafficVizSelect,
    layoutSelect,
    clearSelectionBtn: mustGetById<HTMLButtonElement>(doc, "clearSelection"),
    onNetworkSelected: (id) => controller.loadNetwork(id),
    onLayoutChanged: (kind) => controller.setLayoutKind(kind),
    onTrafficVizChanged: (kind) => controller.setTrafficVizKind(kind),
    onClearSelection: () => controller.clearSelection(),
  });
  controls.setTrafficVizOptions(TRAFFIC_VIZ_OPTIONS);

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
  };

  // Initial paint and subsequent updates.
  renderAll();
  store.subscribe(() => renderAll());

  return {
    start: async () => {
      // Networks list for the selector.
      let desiredNetworkId = store.getState().networkId;
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
          defaultId && networks.some((n: { id: string }) => n.id === defaultId)
        ) {
          desiredNetworkId = defaultId;
        }
      } catch (err) {
        console.warn("Failed to load networks index.", err);
      }

      await controller.loadNetwork(desiredNetworkId);
    },
  };
}
