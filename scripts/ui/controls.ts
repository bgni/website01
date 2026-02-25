import type { State } from "../app/state.ts";

type TrafficVizOption = { id: string; name: string };
type NetworkOption = { id: string; name?: string };

const clearChildren = (el: Element) => {
  while (el.firstChild) el.removeChild(el.firstChild);
};

export function createControls(
  {
    statusEl,
    networkSelect,
    trafficVizSelect,
    layoutSelect,
    clearSelectionBtn,
    trafficLegendUtil,
    trafficLegendFlowNote,
    trafficLegendUtilWidthNote,
    onNetworkSelected,
    onLayoutChanged,
    onTrafficVizChanged,
    onClearSelection,
  }: {
    statusEl: HTMLElement;
    networkSelect: HTMLSelectElement;
    trafficVizSelect: HTMLSelectElement;
    layoutSelect: HTMLSelectElement;
    clearSelectionBtn: HTMLButtonElement;
    trafficLegendUtil?: HTMLElement;
    trafficLegendFlowNote?: HTMLElement;
    trafficLegendUtilWidthNote?: HTMLElement;
    onNetworkSelected: (networkId: string) => void;
    onLayoutChanged: (kind: string) => void;
    onTrafficVizChanged: (kind: string) => void;
    onClearSelection: () => void;
  },
) {
  let hasWired = false;

  const setHidden = (el: HTMLElement | undefined, hidden: boolean) => {
    if (!el) return;
    el.classList.toggle("is-hidden", hidden);
    el.setAttribute("aria-hidden", hidden ? "true" : "false");
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
  };

  const wire = () => {
    if (hasWired) return;
    hasWired = true;

    networkSelect.addEventListener("change", () => {
      onNetworkSelected(networkSelect.value);
    });

    layoutSelect.addEventListener("change", () => {
      onLayoutChanged(layoutSelect.value);
    });

    trafficVizSelect.addEventListener("change", () => {
      onTrafficVizChanged(trafficVizSelect.value);
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

    if (trafficVizSelect.value !== state.trafficVizKind) {
      trafficVizSelect.value = state.trafficVizKind;
    }
    if (layoutSelect.value !== state.layoutKind) {
      layoutSelect.value = state.layoutKind;
    }

    // Keep legend semantics aligned with the active visualization.
    // - util-width: width encodes utilization, so the color-based util pills don't apply.
    // - flow-dashes: not every connection has traffic; dashes only show where data exists.
    const kind = state.trafficVizKind;
    setHidden(trafficLegendUtil, kind === "util-width");
    setHidden(trafficLegendFlowNote, kind !== "flow-dashes");
    setHidden(trafficLegendUtilWidthNote, kind !== "util-width");
  };

  return {
    render,
    setTrafficVizOptions,
    setNetworkOptions,
  };
}
