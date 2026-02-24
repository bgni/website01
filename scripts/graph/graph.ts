import { typeColor } from "../lib/colors.ts";
import type { Connection, Device, TrafficUpdate } from "../domain/types.ts";
import { applyLayoutToGraph } from "./layoutAdapter.ts";
import { createGraphRenderer, type Guide } from "./renderer.ts";
import { createTrafficAdapter } from "./trafficAdapter.ts";
import { buildRendererUpdateArgs } from "./viewModel.ts";

type Adjacency = Record<
  string,
  Array<{ neighbor: string; connectionId: string }>
>;

export function createGraph(
  {
    devices,
    connections,
    adjacency,
    onNodeSelect,
  }: {
    devices: Device[];
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
  destroy: () => void;
  setTrafficVisualization: (kind: string) => void;
  setLayout: (kind: string) => void;
} {
  const trafficById: Record<string, TrafficUpdate> = {};
  const getTraffic = (connectionId: string) => trafficById[connectionId];

  const renderer = createGraphRenderer({
    devices,
    connections,
    getNodeFill: (d) => typeColor(d.type),
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

    // Tiered is deterministic/static: no simulation ticks, so render once.
    if (layoutKind === "tiered") {
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
    // Force a style pass so viz overlays appear immediately.
    update(lastUpdateArgs);
  };

  return { update, updateTraffic, destroy, setTrafficVisualization, setLayout };
}
