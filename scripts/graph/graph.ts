import { typeColor } from "../lib/colors.ts";
import type {
  Connection,
  NetworkDevice,
  TrafficUpdate,
} from "../domain/types.ts";
import { applyLayoutToGraph } from "./layoutAdapter.ts";
import { createGraphRenderer, type Guide } from "./renderer.ts";
import { createTrafficAdapter } from "./trafficAdapter.ts";
import { buildRendererUpdateArgs } from "./viewModel.ts";
import { getD3 } from "../lib/d3.ts";

type Adjacency = Record<
  string,
  Array<{ neighbor: string; connectionId: string }>
>;

export function createGraph(
  {
    svg,
    devices,
    connections,
    adjacency,
    onNodeSelect,
  }: {
    svg: string | SVGSVGElement;
    devices: NetworkDevice[];
    connections: Connection[];
    adjacency: Adjacency;
    onNodeSelect: (id: string) => void;
  },
): {
  update: (
    args: {
      filteredIds?: Set<string> | Iterable<string>;
      selected: Set<string>;
    },
  ) => void;
  updateTraffic: (traffic?: TrafficUpdate[]) => void;
  resetTraffic: () => void;
  destroy: () => void;
  setTrafficVisualization: (kind: string) => void;
  setLayout: (kind: string) => void;
  resize: (size: { width: number; height: number }) => void;
} {
  const d3 = getD3();
  const trafficById: Record<string, TrafficUpdate> = {};
  const getTraffic = (connectionId: string) => trafficById[connectionId];

  const renderer = createGraphRenderer({
    svg,
    devices,
    connections,
    getNodeFill: (d) => typeColor(d.deviceKind),
    onNodeSelect,
  });

  const trafficAdapter = createTrafficAdapter({
    kind: "classic",
    getTraffic,
  });

  const mount = () => ({
    container: renderer.vizLayer,
    links: renderer.links,
    linkSelection: renderer.linkSelection,
  });

  trafficAdapter.attach(mount());
  renderer.setOnTickHook(() => trafficAdapter.onSimulationTick?.());

  // Remember the most recent styling inputs so we can re-apply after viz switches.
  let lastUpdateArgs: { filteredIds: Set<string>; selected: Set<string> } = {
    filteredIds: new Set(renderer.nodes.map((n) => n.id)),
    selected: new Set<string>(),
  };

  let layoutKind = "force";

  const renderGuides = (guides: Guide[] = []) => {
    renderer.renderGuides(guides);
  };

  const setLayout = (kind: string) => {
    layoutKind = kind || "force";
    renderer.setLayoutKind(layoutKind);
    const meta = applyLayoutToGraph(layoutKind, {
      simulation: renderer.simulation,
      d3,
      nodes: renderer.nodes,
      links: renderer.links,
      width: renderer.width,
      height: renderer.height,
    });

    renderGuides((meta?.guides || []) as Guide[]);

    // Non-force modes are deterministic/static: no simulation ticks, so render once.
    if (layoutKind !== "force") {
      renderer.simulation.stop();
      renderer.renderPositions();
    }
  };

  // Ensure the initial simulation forces match the default selected layout.
  setLayout(layoutKind);

  const updateTraffic = (traffic: TrafficUpdate[] = []) => {
    traffic.forEach((t) => {
      if (!t || !t.connectionId) return;
      trafficById[t.connectionId] = {
        ...(trafficById[t.connectionId] || { connectionId: t.connectionId }),
        ...t,
      };
    });
  };

  const resetTraffic = () => {
    for (const key of Object.keys(trafficById)) delete trafficById[key];
    update(lastUpdateArgs);
  };

  const update = (
    {
      filteredIds = new Set<string>(),
      selected,
    }: { filteredIds?: Set<string> | Iterable<string>; selected: Set<string> },
  ) => {
    const filteredSet = filteredIds instanceof Set
      ? filteredIds
      : new Set(filteredIds);
    lastUpdateArgs = { filteredIds: filteredSet, selected };

    renderer.updateStyles(
      buildRendererUpdateArgs({
        adjacency,
        selected,
        filteredSet,
        trafficById,
        trafficAdapter,
      }),
    );
  };

  const destroy = () => {
    trafficAdapter.destroy();
    renderer.destroy();
  };

  const setTrafficVisualization = (kind: string) => {
    trafficAdapter.setKind(kind, mount());
    // Ensure freshly mounted viz layers (e.g., flow-dashes overlay) are
    // positioned even when the simulation is static (tiered layout).
    renderer.renderPositions();
    // Force a style pass so viz overlays appear immediately.
    update(lastUpdateArgs);
  };

  const resize = ({ width, height }: { width: number; height: number }) => {
    renderer.resize({ width, height });
    // Re-apply active layout so tiered/force recompute based on new bounds.
    setLayout(layoutKind);
  };

  return {
    update,
    updateTraffic,
    resetTraffic,
    destroy,
    setTrafficVisualization,
    setLayout,
    resize,
  };
}
