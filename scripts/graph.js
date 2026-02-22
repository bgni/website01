import { collectHighlights, typeColor } from './graphLogic.js';
import { createTrafficFlowVisualization } from './trafficFlowVisualization/registry.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Ops-friendly semantics:
// - "down" is the only critical hue-shifted state (red).
// - "up" is neutral; brightness indicates utilization.
// - Near saturation, hue drifts slightly toward orange to signal "hot" without implying "bad" at moderate levels.
const trafficColor = (status, util) => {
  if (status === 'down') return '#f87171';
  const u = clamp01(Number(util) || 0);

  // Neutral slate/blue baseline.
  const baseHue = 215;
  const hotHue = 35; // orange
  const hotT = clamp01((u - 0.9) / 0.1); // only last 10% shifts hue
  const hue = baseHue + (hotHue - baseHue) * hotT;

  const saturation = 18 + u * 32;   // 18..50
  const lightness = 26 + u * 46;    // 26..72
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

const trafficWidth = (rateMbps) => {
  const minWidth = 0.7; // about half prior base
  const maxWidth = 14; // 10x base for 10Gbps+
  const clamped = Math.min(rateMbps || 0, 10000); // 10Gbps ceiling
  if (clamped <= 0.008) return minWidth; // ~1kB/s
  const scaled = minWidth + (clamped / 10000) * (maxWidth - minWidth);
  return Math.min(maxWidth, Math.max(minWidth, scaled));
};

export function createGraph({ devices, connections, adjacency, onNodeSelect }) {
  const width = 1200;
  const height = 720;
  const svg = d3.select('#graph');

  // Clear any prior render (important when switching networks).
  svg.on('.zoom', null);
  svg.selectAll('*').remove();

  svg
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');
  const container = svg.append('g');

  const zoom = d3.zoom().scaleExtent([0.5, 3]).on('zoom', (event) => {
    container.attr('transform', event.transform);
  });
  svg.call(zoom);

  const nodes = devices.map((d) => ({ ...d }));
  const links = connections.map((c) => ({ ...c, source: c.from.deviceId, target: c.to.deviceId }));

  // Explicit render layers keep z-order stable (especially when switching viz).
  const linkLayer = container.append('g').attr('class', 'layer-links');
  const vizLayer = container.append('g').attr('class', 'layer-viz');
  const haloLayer = container.append('g').attr('class', 'layer-halo');
  const nodeLayer = container.append('g').attr('class', 'layer-nodes');
  const labelLayer = container.append('g').attr('class', 'layer-labels');

  const trafficById = {};
  const getTraffic = (connectionId) => trafficById[connectionId];

  const trafficVizHelpers = {
    trafficColor,
    trafficWidthRate: trafficWidth,
  };

  let trafficViz = createTrafficFlowVisualization('classic', trafficVizHelpers);
  let stopViz = () => {};

  // Remember the most recent styling inputs so we can re-apply after viz switches.
  let lastUpdateArgs = {
    filteredIds: new Set(nodes.map((n) => n.id)),
    selected: new Set(),
  };

  const link = linkLayer
    .attr('stroke', '#334155')
    .attr('stroke-opacity', 0.6)
    .selectAll('line')
    .data(links, (d) => d.id)
    .join('line')
    .attr('stroke-width', 1.4);

  const startViz = () => {
    stopViz?.();
    stopViz = () => {};
    trafficViz?.destroy?.();

    if (typeof trafficViz?.setTrafficGetter === 'function') trafficViz.setTrafficGetter(getTraffic);
    if (typeof trafficViz?.start === 'function') {
      const stop = trafficViz.start({ container: vizLayer, links, link });
      if (typeof stop === 'function') stopViz = stop;
    }
  };

  startViz();

  // Selection/highlight indicator that doesn't compete with fill colors.
  const halo = haloLayer
    .attr('pointer-events', 'none')
    .selectAll('circle')
    .data(nodes, (d) => d.id)
    .join('circle')
    .attr('r', 16)
    .attr('fill', 'none')
    .attr('stroke', '#e2e8f0')
    .attr('stroke-width', 2.5)
    .attr('opacity', 0);

  const node = nodeLayer
    .selectAll('circle')
    .data(nodes, (d) => d.id)
    .join('circle')
    .attr('r', 12)
    .attr('fill', (d) => typeColor(d.type))
    .attr('stroke', '#0b1220')
    .attr('stroke-width', 2)
    .on('click', (_event, d) => onNodeSelect(d.id))
    .call(d3.drag()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      })
    );

  const labels = labelLayer
    .selectAll('text')
    .data(nodes, (d) => d.id)
    .join('text')
    .attr('fill', '#e2e8f0')
    .attr('font-size', 11)
    .attr('text-anchor', 'middle')
    .attr('dy', 22)
    .text((d) => d.name);

  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id((d) => d.id).distance(130).strength(0.6))
    .force('charge', d3.forceManyBody().strength(-260))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collide', d3.forceCollide(26));

  simulation.on('tick', () => {
    link
      .attr('x1', (d) => d.source.x)
      .attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x)
      .attr('y2', (d) => d.target.y);

    if (typeof trafficViz?.onSimulationTick === 'function') trafficViz.onSimulationTick();
    node
      .attr('cx', (d) => {
        d.x = Math.max(20, Math.min(width - 20, d.x || width / 2));
        return d.x;
      })
      .attr('cy', (d) => {
        d.y = Math.max(20, Math.min(height - 20, d.y || height / 2));
        return d.y;
      });

    halo
      .attr('cx', (d) => d.x)
      .attr('cy', (d) => d.y);
    labels
      .attr('x', (d) => d.x)
      .attr('y', (d) => d.y + 24);
  });

  const updateTraffic = (traffic = []) => {
    traffic.forEach((t) => {
      if (!t || !t.connectionId) return;
      trafficById[t.connectionId] = { ...(trafficById[t.connectionId] || {}), ...t };
    });
  };

  const update = ({ filteredIds = new Set(), selected }) => {
    lastUpdateArgs = { filteredIds, selected };
    const { nodes: highlightedNodes, links: highlightedLinks } = collectHighlights(adjacency, selected);
    const hasSelection = selected.size > 0;
    const filteredSet = filteredIds instanceof Set ? filteredIds : new Set(filteredIds);

    const linkT = link.interrupt().transition().duration(220).ease(d3.easeCubicOut);

    linkT
      .attr('stroke', (d) => trafficViz.getLinkStroke({
        traffic: trafficById[d.id],
        highlighted: highlightedLinks.has(d.id),
        defaultStroke: '#334155',
      }))
      .attr('stroke-width', (d) => trafficViz.getLinkWidth({
        traffic: trafficById[d.id],
        highlighted: highlightedLinks.has(d.id),
        defaultWidth: 1.4,
      }))
      .attr('stroke-dasharray', (d) => trafficViz.getLinkDasharray({
        traffic: trafficById[d.id],
        highlighted: highlightedLinks.has(d.id),
      }))
      .attr('opacity', (d) => {
        const t = trafficById[d.id];
        // Always make down links clearly visible.
        if (t?.status === 'down') return 1;
        if (hasSelection) {
          if (highlightedLinks.size) return highlightedLinks.has(d.id) ? 1 : 0.2;
          return (selected.has(d.source.id) || selected.has(d.target.id)) ? 0.85 : 0.25;
        }
        return (filteredSet.has(d.source.id) || filteredSet.has(d.target.id)) ? 0.8 : 0.25;
      });

    if (typeof trafficViz?.afterLinkStyle === 'function') {
      trafficViz.afterLinkStyle({ highlightedLinks, hasSelection, filteredSet, selected });
    }

    halo
      .attr('r', (d) => selected.has(d.id) ? 18 : (highlightedNodes.has(d.id) ? 16 : 16))
      .attr('stroke', (d) => {
        if (selected.has(d.id)) return '#e2e8f0';
        if (highlightedNodes.has(d.id)) return '#94a3b8';
        return '#e2e8f0';
      })
      .attr('stroke-width', (d) => {
        if (selected.has(d.id)) return 2.5;
        if (highlightedNodes.has(d.id)) return 2;
        return 2;
      })
      .attr('opacity', (d) => {
        if (!hasSelection) return 0;
        if (selected.has(d.id)) return 0.95;
        if (highlightedNodes.has(d.id)) return 0.55;
        return 0;
      });

    node
      .attr('r', 12)
      .attr('stroke', '#0b1220')
      .attr('stroke-width', 2)
      // Keep nodes opaque so links never visually "sit on top" of devices.
      .attr('opacity', 1)
      // De-emphasize via filter rather than transparency.
      .style('filter', (d) => {
        if (hasSelection) return highlightedNodes.has(d.id) ? 'none' : 'brightness(0.65) saturate(0.4)';
        return filteredSet.has(d.id) ? 'none' : 'brightness(0.78) saturate(0.55)';
      });

    labels
      .attr('opacity', (d) => {
        if (hasSelection) return highlightedNodes.has(d.id) ? 0.95 : 0.25;
        return filteredSet.has(d.id) ? 0.85 : 0.4;
      });
  };

  const destroy = () => {
    stopViz?.();
    stopViz = () => {};
    trafficViz?.destroy?.();
    simulation.stop();
    svg.on('.zoom', null);
    svg.selectAll('*').remove();
  };

  const setTrafficVisualization = (kind) => {
    trafficViz = createTrafficFlowVisualization(kind, trafficVizHelpers);
    startViz();
    // Force a style pass so viz overlays appear immediately.
    update(lastUpdateArgs);
  };

  return { update, updateTraffic, destroy, setTrafficVisualization };
}
