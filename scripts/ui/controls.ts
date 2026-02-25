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
    onNetworkSelected: (networkId: string) => void;
    onLayoutChanged: (kind: string) => void;
    onTrafficVizChanged: (kind: string) => void;
    onClearSelection: () => void;
  },
) {
  let hasWired = false;

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
  };

  return {
    render,
    setTrafficVizOptions,
    setNetworkOptions,
  };
}
