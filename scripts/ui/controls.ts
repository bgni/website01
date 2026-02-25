import type { State } from "../app/state.ts";
import { CUSTOM_NETWORK_ID } from "../app/customTopology.ts";

type TrafficVizOption = { id: string; name: string };
type NetworkOption = { id: string; name?: string };
type TrafficSourceOption = { id: string; name: string };
type BuilderDeviceOption = {
  slug: string;
  label: string;
  groupId: string;
  groupLabel: string;
};

const clearChildren = (el: Element) => {
  while (el.firstChild) el.removeChild(el.firstChild);
};

export function createControls(
  {
    statusEl,
    networkSelect,
    trafficSourceSelect,
    trafficVizSelect,
    layoutSelect,
    createEditBtn,
    addDeviceTypeSearchInput,
    addDeviceTypeSelect,
    addDeviceBtn,
    undoBtn,
    redoBtn,
    connectBtn,
    deleteConnectionBtn,
    exportBtn,
    importBtn,
    importInput,
    clearSelectionBtn,
    onNetworkSelected,
    onTrafficSourceChanged,
    onLayoutChanged,
    onTrafficVizChanged,
    onEnterBuilderMode,
    onBuilderTypeSearchChanged,
    onAddDevice,
    onUndo,
    onRedo,
    onConnectSelected,
    onDeleteSelectedConnection,
    onExportTopology,
    onImportTopology,
    onClearSelection,
  }: {
    statusEl: HTMLElement;
    networkSelect: HTMLSelectElement;
    trafficSourceSelect: HTMLSelectElement;
    trafficVizSelect: HTMLSelectElement;
    layoutSelect: HTMLSelectElement;
    createEditBtn: HTMLButtonElement;
    addDeviceTypeSearchInput: HTMLInputElement;
    addDeviceTypeSelect: HTMLSelectElement;
    addDeviceBtn: HTMLButtonElement;
    undoBtn: HTMLButtonElement;
    redoBtn: HTMLButtonElement;
    connectBtn: HTMLButtonElement;
    deleteConnectionBtn: HTMLButtonElement;
    exportBtn: HTMLButtonElement;
    importBtn: HTMLButtonElement;
    importInput: HTMLInputElement;
    clearSelectionBtn: HTMLButtonElement;
    onNetworkSelected: (networkId: string) => void;
    onTrafficSourceChanged: (kind: string) => void;
    onLayoutChanged: (kind: string) => void;
    onTrafficVizChanged: (kind: string) => void;
    onEnterBuilderMode: () => Promise<void> | void;
    onBuilderTypeSearchChanged: (query: string) => void;
    onAddDevice: (deviceTypeSlug: string) => void;
    onUndo: () => void;
    onRedo: () => void;
    onConnectSelected: () => void;
    onDeleteSelectedConnection: () => void;
    onExportTopology: () => void;
    onImportTopology: (jsonText: string) => Promise<void> | void;
    onClearSelection: () => void;
  },
) {
  let hasWired = false;
  let canUndo = false;
  let canRedo = false;

  const setTrafficVizOptions = (options: TrafficVizOption[]) => {
    clearChildren(trafficVizSelect);
    options.forEach((o) => {
      const opt = document.createElement("option");
      opt.value = o.id;
      opt.textContent = o.name;
      trafficVizSelect.appendChild(opt);
    });
  };

  const setNetworkOptions = (
    networks: NetworkOption[],
  ) => {
    clearChildren(networkSelect);
    networks.forEach((n) => {
      const opt = document.createElement("option");
      opt.value = n.id;
      const label = n.name ? `${n.name} (${n.id})` : n.id;
      opt.textContent = label;
      networkSelect.appendChild(opt);
    });
  };

  const setTrafficSourceOptions = (options: TrafficSourceOption[]) => {
    clearChildren(trafficSourceSelect);
    options.forEach((o) => {
      const opt = document.createElement("option");
      opt.value = o.id;
      opt.textContent = o.name;
      trafficSourceSelect.appendChild(opt);
    });
  };

  const setBuilderDeviceTypeOptions = (options: BuilderDeviceOption[]) => {
    clearChildren(addDeviceTypeSelect);

    const groups = Array.from(
      options.reduce((map, option) => {
        if (!map.has(option.groupId)) {
          map.set(option.groupId, option.groupLabel);
        }
        return map;
      }, new Map<string, string>()).entries(),
    ).map(([id, label]) => ({ id, label }));

    groups.forEach((group) => {
      const groupOptions = options.filter((option) =>
        option.groupId === group.id
      );
      if (!groupOptions.length) return;

      const optGroup = document.createElement("optgroup");
      optGroup.label = group.label;
      groupOptions.forEach((option) => {
        const opt = document.createElement("option");
        opt.value = option.slug;
        opt.textContent = option.label;
        optGroup.appendChild(opt);
      });
      addDeviceTypeSelect.appendChild(optGroup);
    });

    const disabled = addDeviceTypeSelect.options.length === 0;
    addDeviceTypeSelect.disabled = disabled;
    addDeviceBtn.disabled = disabled;
  };

  const wire = () => {
    if (hasWired) return;
    hasWired = true;

    networkSelect.addEventListener("change", () => {
      onNetworkSelected(networkSelect.value);
    });

    trafficSourceSelect.addEventListener("change", () => {
      onTrafficSourceChanged(trafficSourceSelect.value);
    });

    layoutSelect.addEventListener("change", () => {
      onLayoutChanged(layoutSelect.value);
    });

    trafficVizSelect.addEventListener("change", () => {
      onTrafficVizChanged(trafficVizSelect.value);
    });

    createEditBtn.addEventListener("click", () => {
      void onEnterBuilderMode();
    });

    addDeviceBtn.addEventListener("click", () => {
      onAddDevice(addDeviceTypeSelect.value);
    });

    addDeviceTypeSearchInput.addEventListener("input", () => {
      onBuilderTypeSearchChanged(addDeviceTypeSearchInput.value);
    });

    undoBtn.addEventListener("click", () => {
      onUndo();
    });

    redoBtn.addEventListener("click", () => {
      onRedo();
    });

    connectBtn.addEventListener("click", () => {
      onConnectSelected();
    });

    deleteConnectionBtn.addEventListener("click", () => {
      onDeleteSelectedConnection();
    });

    exportBtn.addEventListener("click", () => {
      onExportTopology();
    });

    importBtn.addEventListener("click", () => {
      importInput.click();
    });

    importInput.addEventListener("change", async () => {
      const file = importInput.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        await onImportTopology(text);
      } finally {
        importInput.value = "";
      }
    });

    clearSelectionBtn.addEventListener("click", () => onClearSelection());
  };

  const render = (state: State) => {
    wire();
    const base =
      `${state.selected.size} selected | ${state.devices.length} total.`;
    statusEl.textContent = state.statusText
      ? `${state.statusText} | ${base}`
      : base;

    if (networkSelect.value !== state.networkId) {
      // Keep UI in sync if controller updated state.
      networkSelect.value = state.networkId;
    }

    if (trafficSourceSelect.value !== state.trafficSourceKind) {
      trafficSourceSelect.value = state.trafficSourceKind;
    }

    if (trafficVizSelect.value !== state.trafficVizKind) {
      trafficVizSelect.value = state.trafficVizKind;
    }
    if (layoutSelect.value !== state.layoutKind) {
      layoutSelect.value = state.layoutKind;
    }

    const isCustomMode = state.networkId === CUSTOM_NETWORK_ID;
    const hasDeviceOptions = addDeviceTypeSelect.options.length > 0;
    const selectedIds = Array.from(state.selected);
    const hasSelectedConnection = selectedIds.length === 2
      ? state.connections.some((connection) =>
        (connection.from.deviceId === selectedIds[0] &&
          connection.to.deviceId === selectedIds[1]) ||
        (connection.from.deviceId === selectedIds[1] &&
          connection.to.deviceId === selectedIds[0])
      )
      : false;
    createEditBtn.classList.toggle("is-active", isCustomMode);
    addDeviceTypeSearchInput.disabled = !isCustomMode;
    addDeviceTypeSelect.disabled = !isCustomMode || !hasDeviceOptions;
    addDeviceBtn.disabled = !isCustomMode || !hasDeviceOptions;
    undoBtn.disabled = !isCustomMode || !canUndo;
    redoBtn.disabled = !isCustomMode || !canRedo;
    connectBtn.disabled = !isCustomMode || state.selected.size !== 2;
    deleteConnectionBtn.disabled = !isCustomMode || !hasSelectedConnection;
  };

  const setBuilderUndoEnabled = (enabled: boolean) => {
    canUndo = enabled;
  };

  const setBuilderRedoEnabled = (enabled: boolean) => {
    canRedo = enabled;
  };

  return {
    render,
    setTrafficVizOptions,
    setTrafficSourceOptions,
    setNetworkOptions,
    setBuilderDeviceTypeOptions,
    setBuilderUndoEnabled,
    setBuilderRedoEnabled,
  };
}
