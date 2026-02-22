import { collectHighlights, typeColor } from './graphLogic.js';

const trafficColor = (status, util) => {
  if (status === 'down') return '#f87171';
  if (util >= 0.6) return '#fb7185';
  if (util >= 0.35) return '#fbbf24';
  return '#38bdf8';
};

const trafficWidth = (rateMbps) => Math.min(6, 1 + Math.sqrt(rateMbps || 0) / 15);

export function createGraph({ devices, connections, adjacency, onNodeSelect }) {
  const width = 1200;
  const height = 720;
  const svg = d3.select('#graph')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');
  const container = svg.append('g');

  const zoom = d3.zoom().scaleExtent([0.5, 3]).on('zoom', (event) => {
    container.attr('transform', event.transform);
  });
  svg.call(zoom);

  const nodes = devices.map((d) => ({ ...d }));
  const links = connections.map((c) => ({ ...c, source: c.from.deviceId, target: c.to.deviceId }));

  const link = container.append('g')
    .attr('stroke', '#334155')
    .attr('stroke-opacity', 0.6)
    .selectAll('line')
    .data(links, (d) => d.id)
    .join('line')
    .attr('stroke-width', 1.4);

  const node = container.append('g')
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

  const labels = container.append('g')
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
    node
      .attr('cx', (d) => {
        d.x = Math.max(20, Math.min(width - 20, d.x || width / 2));
        return d.x;
      })
      .attr('cy', (d) => {
        d.y = Math.max(20, Math.min(height - 20, d.y || height / 2));
        return d.y;
      });
    labels
      .attr('x', (d) => d.x)
      .attr('y', (d) => d.y + 24);
  });

  const trafficById = {};

  const updateTraffic = (traffic = []) => {
    traffic.forEach((t) => { trafficById[t.connectionId] = t; });
  };

  const update = ({ filteredIds = new Set(), selected }) => {
    const { nodes: highlightedNodes, links: highlightedLinks } = collectHighlights(adjacency, selected);
    const hasSelection = selected.size > 0;
    const filteredSet = filteredIds instanceof Set ? filteredIds : new Set(filteredIds);

    link
      .attr('stroke', (d) => {
        const t = trafficById[d.id];
        if (t) return trafficColor(t.status, t.utilization);
        return highlightedLinks.has(d.id) ? '#f472b6' : '#334155';
      })
      .attr('stroke-width', (d) => {
        const t = trafficById[d.id];
        const base = t ? trafficWidth(t.rateMbps) : 1.4;
        return highlightedLinks.has(d.id) ? Math.max(base, 3) : base;
      })
      .attr('opacity', (d) => {
        if (hasSelection) {
          if (highlightedLinks.size) return highlightedLinks.has(d.id) ? 1 : 0.12;
          return (selected.has(d.source.id) || selected.has(d.target.id)) ? 0.85 : 0.15;
        }
        return (filteredSet.has(d.source.id) || filteredSet.has(d.target.id)) ? 0.8 : 0.25;
      });

    node
      .attr('r', (d) => selected.has(d.id) ? 16 : 12)
      .attr('stroke', (d) => highlightedNodes.has(d.id) ? '#e2e8f0' : '#0b1220')
      .attr('stroke-width', (d) => highlightedNodes.has(d.id) ? 2.5 : 2)
      .attr('opacity', (d) => {
        if (hasSelection) return highlightedNodes.has(d.id) ? 1 : 0.25;
        return filteredSet.has(d.id) ? 1 : 0.5;
      });

    labels
      .attr('opacity', (d) => {
        if (hasSelection) return highlightedNodes.has(d.id) ? 0.95 : 0.25;
        return filteredSet.has(d.id) ? 0.85 : 0.4;
      });
  };

  return { update, updateTraffic };
}
