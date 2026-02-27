/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { assertEquals, assertStringIncludes } from "@std/assert";
import { JSDOM } from "npm:jsdom";
import { createControls } from "./controls.ts";
import { CUSTOM_NETWORK_ID } from "../app/customTopology.ts";
import type { State } from "../app/types.ts";

const mkState = (networkId: string): State => ({
  networkId,
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
});

const withDom = (fn: (doc: Document) => void) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const doc = dom.window.document;

  const previousDocument = (globalThis as Record<string, unknown>).document;
  const previousWindow = (globalThis as Record<string, unknown>).window;
  (globalThis as Record<string, unknown>).document = doc;
  (globalThis as Record<string, unknown>).window = dom.window;

  try {
    fn(doc);
  } finally {
    (globalThis as Record<string, unknown>).document = previousDocument;
    (globalThis as Record<string, unknown>).window = previousWindow;
    dom.window.close();
  }
};

const mountControls = (doc: Document) => {
  const body = doc.body;
  const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, id: string) => {
    const el = doc.createElement(tag);
    el.id = id;
    body.appendChild(el);
    return el;
  };

  const controls = createControls({
    statusEl: mk("span", "status"),
    networkSelect: mk("select", "network"),
    modeBadgeEl: mk("span", "modeBadge"),
    trafficSourceSelect: mk("select", "source"),
    trafficVizSelect: mk("select", "viz"),
    layoutSelect: mk("select", "layout"),
    builderWorkflowSelect: mk("select", "builderWorkflow"),
    createEditBtn: mk("button", "createEdit"),
    builderOverlay: mk("div", "builderOverlay"),
    builderPalette: mk("div", "builderPalette"),
    builderShortlistPanel: mk("div", "builderShortlist"),
    addDeviceTypeSearchInput: mk("input", "addTypeSearch"),
    builderFilterToggleBtn: mk("button", "builderFilterToggle"),
    builderFilterPanel: mk("div", "builderFilterPanel"),
    builderFilterCloseBtn: mk("button", "builderFilterClose"),
    addDeviceTypeSelect: mk("select", "addType"),
    addPortTypeFilterSelect: mk("select", "addPortFilter"),
    addDeviceBtn: mk("button", "addDevice"),
    groupSelectedBtn: mk("button", "groupSelected"),
    undoBtn: mk("button", "undo"),
    redoBtn: mk("button", "redo"),
    connectBtn: mk("button", "connect"),
    deleteConnectionBtn: mk("button", "deleteConnection"),
    exportBtn: mk("button", "export"),
    importBtn: mk("button", "import"),
    importInput: mk("input", "importInput"),
    clearSelectionBtn: mk("button", "clearSelection"),
    onNetworkSelected: () => {},
    onTrafficSourceChanged: () => {},
    onLayoutChanged: () => {},
    onTrafficVizChanged: () => {},
    onOpenBuilderMode: () => {},
    onExitBuilderMode: () => {},
    onBuilderTypeSearchChanged: () => {},
    onSetShortlistModel: () => {},
    onAddDevice: () => {},
    onGroupSelected: () => {},
    onUndo: () => {},
    onRedo: () => {},
    onConnectSelected: () => {},
    onDeleteSelectedConnection: () => {},
    onExportTopology: () => {},
    onImportTopology: () => {},
    onClearSelection: () => {},
  });

  controls.setNetworkOptions([
    { id: "small-office", name: "Small Office" },
  ]);
  controls.setTrafficSourceOptions([{ id: "default", name: "Default" }]);
  controls.setTrafficVizOptions([{ id: "classic", name: "Classic" }]);
  controls.setBuilderDeviceTypeOptions([{
    slug: "switch/cisco-c9300-48t",
    label: "Switch",
    groupId: "device-kinds",
    groupLabel: "Device types",
    portSummary: "48 1G, 4 10G",
    kindLabel: "Switch",
    portTypes: ["1G", "10G"],
    modelLabel: "Cisco C9300-48T",
  }]);
  controls.setBuilderShortlistKinds([{
    kindId: 2,
    kindLabel: "Switch",
    selectedSlug: "switch/cisco-c9300-48t",
    choices: [{
      slug: "switch/cisco-c9300-48t",
      label: "Cisco C9300-48T",
      portSummary: "48 1G, 4 10G",
    }],
  }]);

  return {
    controls,
    status: doc.getElementById("status") as HTMLElement,
    modeBadge: doc.getElementById("modeBadge") as HTMLElement,
    addDevice: doc.getElementById("addDevice") as HTMLButtonElement,
    addTypeSearch: doc.getElementById("addTypeSearch") as HTMLInputElement,
    builderOverlay: doc.getElementById("builderOverlay") as HTMLElement,
    createEdit: doc.getElementById("createEdit") as HTMLButtonElement,
  };
};

Deno.test("controls: non-custom mode keeps builder panel available and shows editable state", () => {
  withDom((doc) => {
    const mounted = mountControls(doc);
    mounted.controls.render(mkState("small-office"));

    assertEquals(mounted.createEdit.hidden, true);
    assertEquals(mounted.addDevice.hidden, false);
    assertEquals(mounted.addTypeSearch.hidden, false);
    assertEquals(mounted.builderOverlay.hidden, false);
    assertStringIncludes(
      mounted.status.textContent ?? "",
      "Editing Small Office (small-office).",
    );
    assertEquals(mounted.modeBadge.textContent ?? "", "Editing");
  });
});

Deno.test("controls: custom mode shows builder controls", () => {
  withDom((doc) => {
    const mounted = mountControls(doc);
    mounted.controls.render(mkState(CUSTOM_NETWORK_ID));

    assertEquals(mounted.createEdit.hidden, true);
    assertEquals(mounted.addDevice.hidden, false);
    assertEquals(mounted.addTypeSearch.hidden, false);
    assertEquals(mounted.builderOverlay.hidden, false);
    assertStringIncludes(
      mounted.status.textContent ?? "",
      "Editing Small Office (small-office).",
    );
    assertEquals(mounted.modeBadge.textContent ?? "", "Editing");
  });
});

Deno.test("controls: custom mode shows modified badge when edits exist", () => {
  withDom((doc) => {
    const mounted = mountControls(doc);
    mounted.controls.setBuilderUndoEnabled(true);
    mounted.controls.render(mkState(CUSTOM_NETWORK_ID));

    assertEquals(mounted.modeBadge.textContent ?? "", "Modified");
  });
});
