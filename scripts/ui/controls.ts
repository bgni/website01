import type { State } from "../app/state.ts";
import { CUSTOM_NETWORK_ID } from "../app/customTopology.ts";

type TrafficVizOption = { id: string; name: string };
type NetworkOption = { id: string; name?: string };
type TrafficSourceOption = { id: string; name: string };
export type BuilderWorkflow = "from-network" | "new" | "resume";
type BuilderShortlistChoice = {
  slug: string;
  label: string;
  portSummary: string;
  thumbPng?: string;
  thumbJpg?: string;
};
type BuilderShortlistKindOption = {
  kindId: number;
  kindLabel: string;
  selectedSlug: string;
  choices: BuilderShortlistChoice[];
};
type BuilderDeviceOption = {
  slug: string;
  label: string;
  groupId: string;
  groupLabel: string;
  portSummary: string;
  kindLabel: string;
  portTypes: string[];
  modelLabel?: string;
  thumbPng?: string;
  thumbJpg?: string;
};

export const BUILDER_DEVICE_DRAG_MIME = "application/x-website01-device-type";
const PLACEHOLDER_THUMB =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

const clearChildren = (el: Element) => {
  while (el.firstChild) el.removeChild(el.firstChild);
};

export function createControls(
  {
    statusEl,
    networkSelect,
    modeBadgeEl,
    trafficSourceSelect,
    trafficVizSelect,
    layoutSelect,
    builderWorkflowSelect,
    createEditBtn,
    builderOverlay: _builderOverlay,
    builderPalette,
    builderShortlistPanel,
    addDeviceTypeSearchInput,
    builderFilterToggleBtn,
    builderFilterPanel,
    builderFilterCloseBtn,
    addDeviceTypeSelect,
    addPortTypeFilterSelect,
    addDeviceBtn,
    groupSelectedBtn,
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
    onOpenBuilderMode,
    onExitBuilderMode,
    onBuilderTypeSearchChanged,
    onSetShortlistModel,
    onAddDevice,
    onGroupSelected,
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
    modeBadgeEl: HTMLElement;
    trafficSourceSelect: HTMLSelectElement;
    trafficVizSelect: HTMLSelectElement;
    layoutSelect: HTMLSelectElement;
    builderWorkflowSelect: HTMLSelectElement;
    createEditBtn: HTMLButtonElement;
    builderOverlay: HTMLElement;
    builderPalette: HTMLElement;
    builderShortlistPanel: HTMLElement;
    addDeviceTypeSearchInput: HTMLInputElement;
    builderFilterToggleBtn: HTMLButtonElement;
    builderFilterPanel: HTMLElement;
    builderFilterCloseBtn: HTMLButtonElement;
    addDeviceTypeSelect: HTMLSelectElement;
    addPortTypeFilterSelect: HTMLSelectElement;
    addDeviceBtn: HTMLButtonElement;
    groupSelectedBtn: HTMLButtonElement;
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
    onOpenBuilderMode: (
      workflow: BuilderWorkflow,
      sourceNetworkId: string,
    ) => Promise<void> | void;
    onExitBuilderMode: (sourceNetworkId: string) => Promise<void> | void;
    onBuilderTypeSearchChanged: (query: string) => void;
    onSetShortlistModel: (kindId: number, slug: string) => void;
    onAddDevice: (deviceTypeSlug: string) => void;
    onGroupSelected: () => void;
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
  let isCustomMode = false;
  let lastViewedNetworkId = "";
  let builderDeviceTypeOptions: BuilderDeviceOption[] = [];
  let builderShortlistKinds: BuilderShortlistKindOption[] = [];
  let builderFiltersOpen = false;
  const selectedTypeFilters = new Set<string>();
  const selectedPortFilters = new Set<string>();
  const getOptionThumbSrc = (
    option: { thumbPng?: string; thumbJpg?: string },
  ) => option.thumbPng || option.thumbJpg || PLACEHOLDER_THUMB;
  const parseBuilderWorkflow = (value: string): BuilderWorkflow => {
    if (value === "new" || value === "resume" || value === "from-network") {
      return value;
    }
    return "from-network";
  };

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

    const hasLastViewed = Array.from(networkSelect.options).some((option) =>
      option.value === lastViewedNetworkId
    );
    if (!hasLastViewed) {
      lastViewedNetworkId = networkSelect.options[0]?.value ?? "";
    }
    if (!isCustomMode && lastViewedNetworkId) {
      networkSelect.value = lastViewedNetworkId;
    }
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

  const syncFilterSetFromSelect = (
    select: HTMLSelectElement,
    targetSet: Set<string>,
  ) => {
    targetSet.clear();
    Array.from(select.selectedOptions).forEach((option) => {
      const value = option.value.trim();
      if (value) targetSet.add(value);
    });
  };

  const applyFilterSelections = () => {
    syncFilterSetFromSelect(addDeviceTypeSelect, selectedTypeFilters);
    syncFilterSetFromSelect(addPortTypeFilterSelect, selectedPortFilters);
    updateBuilderFilterToggle();
  };

  const getActiveBuilderFilterCount = () =>
    selectedTypeFilters.size + selectedPortFilters.size;

  const updateBuilderFilterToggle = () => {
    const activeCount = getActiveBuilderFilterCount();
    builderFilterToggleBtn.textContent = activeCount > 0
      ? `Filters (${activeCount})`
      : "Filters";
    builderFilterToggleBtn.classList.toggle(
      "is-active",
      builderFiltersOpen || activeCount > 0,
    );
  };

  const setBuilderFiltersOpen = (isOpen: boolean) => {
    builderFiltersOpen = isOpen;
    builderFilterPanel.classList.toggle("is-hidden", !isOpen);
    updateBuilderFilterToggle();
  };

  const getFilteredBuilderOptions = (): BuilderDeviceOption[] =>
    builderDeviceTypeOptions.filter((option) => {
      if (
        selectedTypeFilters.size > 0 &&
        !selectedTypeFilters.has(option.kindLabel)
      ) {
        return false;
      }
      if (selectedPortFilters.size === 0) return true;
      const portTypes = Array.isArray(option.portTypes) ? option.portTypes : [];
      return portTypes.some((portType) => selectedPortFilters.has(portType));
    });

  const renderShortlistPanel = () => {
    clearChildren(builderShortlistPanel);
    if (!builderShortlistKinds.length) {
      builderShortlistPanel.classList.add("is-hidden");
      return;
    }
    builderShortlistPanel.classList.remove("is-hidden");

    const title = document.createElement("div");
    title.className = "builder-shortlist-title";
    title.textContent = "Shortlist models";
    builderShortlistPanel.appendChild(title);

    builderShortlistKinds.forEach((kind) => {
      if (!kind.choices.length) return;

      const field = document.createElement("label");
      field.className = "builder-shortlist-field";

      const label = document.createElement("span");
      label.textContent = kind.kindLabel;

      const select = document.createElement("select");
      select.className = "builder-shortlist-select";
      select.setAttribute("aria-label", `${kind.kindLabel} shortlist model`);

      kind.choices.forEach((choice) => {
        const option = document.createElement("option");
        option.value = choice.slug;
        option.textContent = `${choice.label} (${choice.portSummary})`;
        if (choice.slug === kind.selectedSlug) option.selected = true;
        select.appendChild(option);
      });

      select.value = kind.selectedSlug;
      select.addEventListener("change", () => {
        onSetShortlistModel(kind.kindId, select.value);
      });

      field.appendChild(label);
      field.appendChild(select);
      builderShortlistPanel.appendChild(field);
    });
  };

  const renderBuilderPalette = () => {
    clearChildren(builderPalette);
    const filteredOptions = getFilteredBuilderOptions();

    const groups = Array.from(
      filteredOptions.reduce((map, option) => {
        if (!map.has(option.groupId)) {
          map.set(option.groupId, option.groupLabel);
        }
        return map;
      }, new Map<string, string>()).entries(),
    ).map(([id, label]) => ({ id, label }));

    const optionsByGroup = filteredOptions.reduce((map, option) => {
      const group = map.get(option.groupId);
      if (group) group.push(option);
      else map.set(option.groupId, [option]);
      return map;
    }, new Map<string, BuilderDeviceOption[]>());

    groups.forEach((group) => {
      const groupOptions = optionsByGroup.get(group.id) ?? [];
      if (!groupOptions.length) return;

      const paletteGroup = document.createElement("section");
      paletteGroup.className = "builder-palette-group";

      const title = document.createElement("div");
      title.className = "builder-palette-group-title";
      title.textContent = group.label;
      paletteGroup.appendChild(title);

      const list = document.createElement("div");
      list.className = "builder-palette-items";
      groupOptions.forEach((option) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "builder-palette-item";
        item.draggable = true;
        item.dataset.slug = option.slug;

        const thumb = document.createElement("img");
        thumb.className = "builder-palette-item-thumb";
        thumb.alt = "";
        thumb.loading = "lazy";
        thumb.src = getOptionThumbSrc(option);
        thumb.addEventListener(
          "error",
          () => {
            if (thumb.src !== PLACEHOLDER_THUMB) thumb.src = PLACEHOLDER_THUMB;
          },
          { once: true },
        );

        const content = document.createElement("div");
        content.className = "builder-palette-item-content";

        const heading = document.createElement("div");
        heading.className = "builder-palette-item-heading";

        const label = document.createElement("div");
        label.className = "builder-palette-item-label";
        label.textContent = option.label;

        const model = document.createElement("div");
        model.className = "builder-palette-item-model";
        model.textContent = option.modelLabel ??
          (option.slug.startsWith("__") ? "Canvas element" : option.slug);

        const slug = document.createElement("div");
        slug.className = "builder-palette-item-slug";
        slug.textContent = option.slug.startsWith("__")
          ? "canvas-element"
          : option.slug;

        heading.appendChild(label);
        heading.appendChild(model);
        content.appendChild(heading);
        content.appendChild(slug);

        if (option.portSummary) {
          const meta = document.createElement("div");
          meta.className = "builder-palette-item-meta";
          meta.textContent = `Ports: ${option.portSummary}`;
          content.appendChild(meta);
        }

        item.addEventListener("click", () => {
          onAddDevice(option.slug);
        });

        item.appendChild(thumb);
        item.appendChild(content);

        item.addEventListener("dragstart", (event: DragEvent) => {
          if (!event.dataTransfer) return;
          event.dataTransfer.effectAllowed = "copy";
          event.dataTransfer.setData(BUILDER_DEVICE_DRAG_MIME, option.slug);
          event.dataTransfer.setData("text/plain", option.slug);
        });

        list.appendChild(item);
      });

      paletteGroup.appendChild(list);
      builderPalette.appendChild(paletteGroup);
    });

    if (!filteredOptions.length) {
      const empty = document.createElement("div");
      empty.className = "builder-palette-empty";
      empty.textContent = builderDeviceTypeOptions.length > 0
        ? "No device types match the active filters."
        : "No matching device types.";
      builderPalette.appendChild(empty);
    }

    addDeviceBtn.disabled = filteredOptions.length === 0;
  };

  const renderFilterOptions = (
    select: HTMLSelectElement,
    values: string[],
    selected: Set<string>,
  ) => {
    const previous = new Set(selected);
    selected.clear();
    clearChildren(select);
    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      if (previous.has(value)) {
        option.selected = true;
        selected.add(value);
      }
      select.appendChild(option);
    });
    updateBuilderFilterToggle();
  };

  const setBuilderDeviceTypeOptions = (options: BuilderDeviceOption[]) => {
    builderDeviceTypeOptions = options;

    const typeFilterValues = Array.from(
      new Set(
        options
          .filter((option) => option.groupId === "device-kinds")
          .map((option) => option.kindLabel)
          .filter((label) => label),
      ),
    ).sort((left, right) => left.localeCompare(right));
    const portFilterValues = Array.from(
      new Set(
        options.flatMap((option) =>
          Array.isArray(option.portTypes) ? option.portTypes : []
        ).filter((label) => label),
      ),
    );

    const portOrder = [
      "100M",
      "1G",
      "2.5G",
      "5G",
      "10G",
      "25G",
      "40G",
      "50G",
      "100G",
      "Wi-Fi",
      "Other",
    ];
    const portOrderMap = new Map(
      portOrder.map((label, index) => [label, index]),
    );
    portFilterValues.sort((left, right) => {
      const leftOrder = portOrderMap.get(left) ?? Number.POSITIVE_INFINITY;
      const rightOrder = portOrderMap.get(right) ?? Number.POSITIVE_INFINITY;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return left.localeCompare(right);
    });

    renderFilterOptions(
      addDeviceTypeSelect,
      typeFilterValues,
      selectedTypeFilters,
    );
    renderFilterOptions(
      addPortTypeFilterSelect,
      portFilterValues,
      selectedPortFilters,
    );
    renderBuilderPalette();
  };

  const setBuilderShortlistKinds = (kinds: BuilderShortlistKindOption[]) => {
    builderShortlistKinds = kinds;
    renderShortlistPanel();
  };

  const wire = () => {
    if (hasWired) return;
    hasWired = true;
    setBuilderFiltersOpen(false);

    networkSelect.addEventListener("change", () => {
      lastViewedNetworkId = networkSelect.value;
      if (isCustomMode) {
        void onExitBuilderMode(networkSelect.value);
        return;
      }
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
      const sourceNetworkId = networkSelect.value || lastViewedNetworkId;
      if (!sourceNetworkId) return;
      if (isCustomMode) {
        void onExitBuilderMode(sourceNetworkId);
        return;
      }
      const workflow = parseBuilderWorkflow(builderWorkflowSelect.value);
      createEditBtn.classList.add("is-pending");
      createEditBtn.textContent = "Opening...";
      void Promise.resolve(onOpenBuilderMode(workflow, sourceNetworkId))
        .finally(() => {
          createEditBtn.classList.remove("is-pending");
        });
    });

    addDeviceBtn.addEventListener("click", () => {
      const firstOption = getFilteredBuilderOptions()[0];
      if (!firstOption) return;
      onAddDevice(firstOption.slug);
    });

    builderFilterToggleBtn.addEventListener("click", () => {
      setBuilderFiltersOpen(!builderFiltersOpen);
    });

    builderFilterCloseBtn.addEventListener("click", () => {
      setBuilderFiltersOpen(false);
    });

    addDeviceTypeSelect.addEventListener("change", () => {
      applyFilterSelections();
      renderBuilderPalette();
    });

    addPortTypeFilterSelect.addEventListener("change", () => {
      applyFilterSelections();
      renderBuilderPalette();
    });

    groupSelectedBtn.addEventListener("click", () => {
      onGroupSelected();
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
    isCustomMode = state.networkId === CUSTOM_NETWORK_ID;
    if (!isCustomMode && state.networkId) {
      lastViewedNetworkId = state.networkId;
    }
    const sourceNetworkId = lastViewedNetworkId ||
      networkSelect.options[0]?.value ||
      "";
    const sourceNetworkLabel =
      Array.from(networkSelect.options).find((option) =>
        option.value === sourceNetworkId
      )?.textContent || sourceNetworkId || "selected network";

    const base =
      `${state.selected.size} selected | ${state.devices.length} total.`;
    const defaultStatusText = `Editing ${sourceNetworkLabel}. | ${base}`;
    statusEl.textContent = state.statusText
      ? `${state.statusText} | ${base}`
      : defaultStatusText;

    if (!isCustomMode && networkSelect.value !== state.networkId) {
      // Keep UI in sync if controller updated view network.
      networkSelect.value = state.networkId;
    } else if (
      isCustomMode &&
      sourceNetworkId &&
      networkSelect.value !== sourceNetworkId
    ) {
      // In edit mode the selected source network remains visible.
      networkSelect.value = sourceNetworkId;
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

    const hasDeviceOptions = builderDeviceTypeOptions.length > 0;
    const hasTypeFilterOptions = addDeviceTypeSelect.options.length > 0;
    const hasPortFilterOptions = addPortTypeFilterSelect.options.length > 0;
    const hasShortlistOptions = builderShortlistKinds.length > 0;
    const hasAnyFilterOptions = hasTypeFilterOptions || hasPortFilterOptions ||
      hasShortlistOptions;
    const hasFilteredResults = getFilteredBuilderOptions().length > 0;
    const selectedIds = Array.from(state.selected);
    const hasSelectedConnection = selectedIds.length === 2
      ? state.connections.some((connection) =>
        (connection.from.deviceId === selectedIds[0] &&
          connection.to.deviceId === selectedIds[1]) ||
        (connection.from.deviceId === selectedIds[1] &&
          connection.to.deviceId === selectedIds[0])
      )
      : false;

    const customOnlyControls = [undoBtn, redoBtn, exportBtn, importBtn];
    customOnlyControls.forEach((control) => {
      control.hidden = !isCustomMode;
      control.setAttribute("aria-hidden", (!isCustomMode).toString());
    });
    modeBadgeEl.textContent = isCustomMode && canUndo ? "Modified" : "Editing";
    modeBadgeEl.classList.toggle("mode-edit", true);
    builderWorkflowSelect.hidden = true;
    builderWorkflowSelect.disabled = true;
    builderWorkflowSelect.setAttribute("aria-hidden", "true");
    createEditBtn.hidden = true;
    createEditBtn.disabled = true;
    createEditBtn.setAttribute("aria-hidden", "true");
    createEditBtn.classList.toggle("is-active", false);
    createEditBtn.classList.toggle("is-pending", false);
    addDeviceTypeSearchInput.disabled = false;
    builderFilterToggleBtn.disabled = !hasAnyFilterOptions;
    addDeviceTypeSelect.disabled = !hasTypeFilterOptions;
    addPortTypeFilterSelect.disabled = !hasPortFilterOptions;
    addDeviceBtn.disabled = !hasDeviceOptions || !hasFilteredResults;
    groupSelectedBtn.disabled = state.selected.size === 0;
    undoBtn.disabled = !isCustomMode || !canUndo;
    redoBtn.disabled = !isCustomMode || !canRedo;
    connectBtn.disabled = state.selected.size !== 2;
    deleteConnectionBtn.disabled = !hasSelectedConnection;
    exportBtn.disabled = !isCustomMode;
    importBtn.disabled = !isCustomMode;
    if (!hasAnyFilterOptions) setBuilderFiltersOpen(false);
    updateBuilderFilterToggle();
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
    setBuilderShortlistKinds,
    setBuilderUndoEnabled,
    setBuilderRedoEnabled,
  };
}
