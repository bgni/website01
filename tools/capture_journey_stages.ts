import { JSDOM } from "npm:jsdom";
import { dirname, fromFileUrl, join, resolve } from "@std/path";
import { CUSTOM_NETWORK_ID } from "../scripts/app/customTopology.ts";
import { createControls } from "../scripts/ui/controls.ts";
import { buildBuilderPickerModel } from "../scripts/app/builderPickerOptions.ts";
import type { DeviceType, NetworkDevice } from "../scripts/domain/types.ts";
import type { State } from "../scripts/app/types.ts";

type Stage = {
  id: string;
  title: string;
  note: string;
  query?: string;
  networkId?: string;
  selectedIds?: string[];
  statusText?: string;
  recentDeviceTypeSlugs?: string[];
  frequentDeviceTypeSlugs?: string[];
  nextActionButtonId?: "addDevice" | "connectSelected";
  showPickerAsList?: boolean;
};

type CliOptions = {
  outDir: string;
  png: boolean;
  stageId?: string;
};

const repoRoot = resolve(dirname(fromFileUrl(import.meta.url)), "..");
const indexHtmlPath = join(repoRoot, "index.html");
const stylesPath = join(repoRoot, "styles.css");
const defaultOutDir = join(
  repoRoot,
  "docs",
  "ux",
  "captures",
  "journey-stages",
);

const mkType = (slug: string, brand: string, model: string): DeviceType => ({
  id: slug,
  slug,
  brand,
  model,
  ports: [],
});

const sampleDeviceTypes: Record<string, DeviceType> = {
  "switch/cisco-c9300-48t": mkType(
    "switch/cisco-c9300-48t",
    "Cisco",
    "C9300-48T",
  ),
  "switch/ubnt-usw-48": mkType("switch/ubnt-usw-48", "Ubiquiti", "USW-48"),
  "switch/dell-n1548": mkType("switch/dell-n1548", "Dell", "N1548"),
  "switch/arista-7050sx3-48yc8": mkType(
    "switch/arista-7050sx3-48yc8",
    "Arista",
    "7050SX3-48YC8",
  ),
  "router/juniper-mx204": mkType("router/juniper-mx204", "Juniper", "MX204"),
  "server/dell-r740": mkType("server/dell-r740", "Dell", "PowerEdge R740"),
};

const stages: Stage[] = [
  {
    id: "01-open-app",
    title: "Open app (before Create/Edit)",
    note: "User evaluates if editing looks possible.",
    networkId: "small-office",
    selectedIds: [],
    statusText: "",
    recentDeviceTypeSlugs: [],
    frequentDeviceTypeSlugs: [],
  },
  {
    id: "02-enter-create-edit",
    title: "Create/Edit enabled",
    note: "User can now add first device.",
    networkId: CUSTOM_NETWORK_ID,
    selectedIds: [],
    statusText: "Create/Edit mode active.",
    recentDeviceTypeSlugs: [],
    frequentDeviceTypeSlugs: [
      "switch/cisco-c9300-48t",
      "switch/ubnt-usw-48",
      "router/juniper-mx204",
      "server/dell-r740",
    ],
    nextActionButtonId: "addDevice",
  },
  {
    id: "03-picker-generic-switch",
    title: "Add picker (generic switch intent)",
    note: "User should immediately recognize normal switches.",
    networkId: CUSTOM_NETWORK_ID,
    selectedIds: [],
    statusText: "Choose a device type first.",
    recentDeviceTypeSlugs: [],
    frequentDeviceTypeSlugs: [
      "switch/cisco-c9300-48t",
      "switch/ubnt-usw-48",
      "switch/dell-n1548",
      "router/juniper-mx204",
    ],
    showPickerAsList: true,
  },
  {
    id: "04-picker-known-model",
    title: "Search known model",
    note: "User with exact model in mind can retrieve it quickly.",
    networkId: CUSTOM_NETWORK_ID,
    selectedIds: [],
    statusText: "Filter device types by model or brand.",
    query: "n1548",
    recentDeviceTypeSlugs: [],
    frequentDeviceTypeSlugs: [
      "switch/cisco-c9300-48t",
      "switch/ubnt-usw-48",
      "router/juniper-mx204",
    ],
    showPickerAsList: true,
  },
  {
    id: "05-after-add-switch",
    title: "After adding first switch",
    note: "Obvious next action should remain visible.",
    networkId: CUSTOM_NETWORK_ID,
    selectedIds: ["custom-device-1"],
    statusText: "Added C9300-48T 1. Add another device to auto-connect.",
    recentDeviceTypeSlugs: ["switch/cisco-c9300-48t"],
    frequentDeviceTypeSlugs: [
      "switch/cisco-c9300-48t",
      "switch/ubnt-usw-48",
      "router/juniper-mx204",
      "server/dell-r740",
    ],
    nextActionButtonId: "addDevice",
  },
];

const parseArgs = (args: string[]): CliOptions => {
  let outDir = defaultOutDir;
  let png = false;
  let stageId: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--png") {
      png = true;
      continue;
    }
    if (arg === "--out-dir") {
      const value = args[index + 1];
      if (!value) throw new Error("--out-dir requires a value");
      outDir = resolve(value);
      index += 1;
      continue;
    }
    if (arg === "--stage") {
      const value = args[index + 1];
      if (!value) throw new Error("--stage requires a stage id");
      stageId = value;
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log(
        [
          "Usage: deno run --allow-read --allow-write --allow-run tools/capture_journey_stages.ts [--png] [--stage <id>] [--out-dir <dir>]",
          "",
          "Options:",
          "  --png             Also render PNG screenshots with Chromium.",
          "  --stage <id>      Render only one stage id.",
          "  --out-dir <dir>   Output directory (default: docs/ux/captures/journey-stages).",
        ].join("\n"),
      );
      Deno.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { outDir, png, stageId };
};

const mustGetById = <T extends Element>(doc: Document, id: string): T => {
  const el = doc.getElementById(id);
  if (!el) throw new Error(`Missing required element #${id}`);
  return el as unknown as T;
};

const createState = (stage: Stage): State => {
  const selectedIds = stage.selectedIds ?? [];
  const selected = new Set(selectedIds);
  const devices: NetworkDevice[] = selectedIds.map((id, index) => ({
    id,
    name: index === 0 ? "C9300-48T 1" : `Device ${index + 1}`,
    type: "switch",
    deviceKind: 1,
    deviceTypeSlug: "switch/cisco-c9300-48t",
  }));

  return {
    networkId: stage.networkId ?? CUSTOM_NETWORK_ID,
    statusText: stage.statusText ?? "",
    filter: "",
    sortKey: "name",
    sortDir: "asc",
    selected,
    page: 1,
    pageSize: 6,
    devices,
    connections: [],
    traffic: [],
    deviceTypes: sampleDeviceTypes,
    trafficSourceKind: "default",
    trafficVizKind: "classic",
    layoutKind: "force",
  };
};

const stageCss = `
.stage-caption {
  position: fixed;
  right: 20px;
  top: 20px;
  max-width: 420px;
  z-index: 10000;
  background: rgba(4, 15, 40, 0.92);
  border: 1px solid rgba(96, 165, 250, 0.35);
  border-radius: 12px;
  padding: 12px 14px;
  color: #dbeafe;
  font: 500 13px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}

.stage-caption h2 {
  margin: 0 0 6px 0;
  font-size: 14px;
  color: #eff6ff;
}

.stage-caption p {
  margin: 0;
}

.next-action {
  outline: 2px solid #34d399;
  box-shadow: 0 0 0 4px rgba(52, 211, 153, 0.24);
}

#addDeviceType.picker-open-preview {
  min-height: 230px;
}
`;

const renderStageHtml = async (stage: Stage): Promise<string> => {
  const html = await Deno.readTextFile(indexHtmlPath);
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });

  const win = dom.window;
  const doc = win.document;

  // Remove runtime scripts; this capture is deterministic and fixture-driven.
  doc.querySelectorAll("script").forEach((scriptEl: Element) =>
    scriptEl.remove()
  );

  const styleLink = doc.querySelector('link[href="styles.css"]') as
    | HTMLLinkElement
    | null;
  if (styleLink) {
    styleLink.href = `file://${stylesPath}`;
  }

  const previousDocument = (globalThis as Record<string, unknown>).document;
  const previousWindow = (globalThis as Record<string, unknown>).window;
  (globalThis as Record<string, unknown>).window = win;
  (globalThis as Record<string, unknown>).document = doc;

  try {
    const controls = createControls({
      statusEl: mustGetById<HTMLElement>(doc, "status"),
      networkSelect: mustGetById<HTMLSelectElement>(doc, "networkSelect"),
      modeBadgeEl: mustGetById<HTMLElement>(doc, "modeBadge"),
      trafficSourceSelect: mustGetById<HTMLSelectElement>(
        doc,
        "trafficSourceSelect",
      ),
      trafficVizSelect: mustGetById<HTMLSelectElement>(doc, "trafficVizSelect"),
      layoutSelect: mustGetById<HTMLSelectElement>(doc, "layoutSelect"),
      builderWorkflowSelect: mustGetById<HTMLSelectElement>(
        doc,
        "builderWorkflow",
      ),
      createEditBtn: mustGetById<HTMLButtonElement>(doc, "createEdit"),
      builderOverlay: mustGetById<HTMLElement>(doc, "builderOverlay"),
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
      { id: "small-office", name: "Small Office (flat star)" },
      { id: CUSTOM_NETWORK_ID, name: "Custom (local)" },
    ]);
    controls.setTrafficSourceOptions([{ id: "default", name: "Default" }]);
    controls.setTrafficVizOptions([{
      id: "classic",
      name: "Classic (width=rate, color=util)",
    }]);

    const pickerModel = buildBuilderPickerModel({
      deviceTypes: sampleDeviceTypes,
      recentDeviceTypeSlugs: stage.recentDeviceTypeSlugs ?? [],
      frequentDeviceTypeSlugs: stage.frequentDeviceTypeSlugs ?? [],
      shortlistByKind: {},
      query: stage.query ?? "",
    });
    controls.setBuilderDeviceTypeOptions(pickerModel.options);
    controls.setBuilderShortlistKinds(pickerModel.shortlistKinds);
    controls.setBuilderUndoEnabled(false);
    controls.setBuilderRedoEnabled(false);

    const state = createState(stage);
    controls.render(state);

    const addTypeSearch = mustGetById<HTMLInputElement>(
      doc,
      "addDeviceTypeSearch",
    );
    addTypeSearch.value = stage.query ?? "";

    if (stage.showPickerAsList) {
      const addTypeSelect = mustGetById<HTMLSelectElement>(
        doc,
        "addDeviceType",
      );
      addTypeSelect.size = Math.min(
        10,
        Math.max(6, addTypeSelect.options.length),
      );
      addTypeSelect.classList.add("picker-open-preview");
    }

    if (stage.nextActionButtonId) {
      const button = mustGetById<HTMLButtonElement>(
        doc,
        stage.nextActionButtonId,
      );
      button.classList.add("next-action");
    }

    const extraStyle = doc.createElement("style");
    extraStyle.textContent = stageCss;
    doc.head.appendChild(extraStyle);

    const caption = doc.createElement("aside");
    caption.className = "stage-caption";
    const title = doc.createElement("h2");
    title.textContent = stage.title;
    const note = doc.createElement("p");
    note.textContent = stage.note;
    caption.appendChild(title);
    caption.appendChild(note);
    doc.body.appendChild(caption);

    return dom.serialize();
  } finally {
    (globalThis as Record<string, unknown>).window = previousWindow;
    (globalThis as Record<string, unknown>).document = previousDocument;
    dom.window.close();
  }
};

const renderPng = async (htmlPath: string, pngPath: string) => {
  const cmd = new Deno.Command("chromium", {
    args: [
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      "--window-size=1600,1000",
      `--screenshot=${pngPath}`,
      `file://${htmlPath}`,
    ],
    stdout: "piped",
    stderr: "piped",
  });
  const result = await cmd.output();
  if (!result.success) {
    const stderr = new TextDecoder().decode(result.stderr).trim();
    throw new Error(stderr || "chromium screenshot command failed");
  }
};

const main = async () => {
  const options = parseArgs(Deno.args);
  const selectedStages = options.stageId
    ? stages.filter((stage) => stage.id === options.stageId)
    : stages;

  if (!selectedStages.length) {
    throw new Error(
      `No stage found for '${options.stageId}'. Available: ${
        stages.map((stage) => stage.id).join(", ")
      }`,
    );
  }

  await Deno.mkdir(options.outDir, { recursive: true });

  for (const stage of selectedStages) {
    const html = await renderStageHtml(stage);
    const htmlPath = join(options.outDir, `${stage.id}.html`);
    await Deno.writeTextFile(htmlPath, html);
    console.log(`html: ${htmlPath}`);

    if (options.png) {
      const pngPath = join(options.outDir, `${stage.id}.png`);
      await renderPng(htmlPath, pngPath);
      console.log(`png:  ${pngPath}`);
    }
  }
};

if (import.meta.main) {
  await main();
}
