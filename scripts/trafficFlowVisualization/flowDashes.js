const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

const speedFromRate = (rateMbps) => {
  const r = Math.max(0, Number(rateMbps) || 0);
  // Map 0..10G to a reasonable px/sec-ish range for dash offset.
  const clamped = Math.min(r, 10000);
  return 2 + (clamped / 10000) * 26; // 2..28
};

const DASH_UP = '10 8';

export function createFlowDashesTrafficVisualization({ trafficColor, trafficWidthRate } = {}) {
  let overlay;
  let rafId = 0;
  let running = false;
  let getTraffic;
  let linkSelection;
  let lastNow = 0;
  const offsetById = new Map();

  const animate = (now) => {
    if (!running) return;

    if (!lastNow) lastNow = now;
    const dt = Math.max(0, (now - lastNow) / 1000);
    lastNow = now;

    overlay
      .attr('stroke-dashoffset', (d) => {
        const t = getTraffic?.(d.id);
        const speed = speedFromRate(t?.rateMbps);
        const prev = offsetById.get(d.id) ?? 0;
        // negative makes it look like it moves forward; direction is arbitrary without A->B metrics
        const next = prev - dt * speed;
        offsetById.set(d.id, next);
        return next;
      });

    rafId = requestAnimationFrame(animate);
  };

  return {
    id: 'flow-dashes',

    // Base line stays understated; overlay carries most of the traffic encoding.
    getLinkStroke({ traffic, highlighted, defaultStroke }) {
      if (traffic) return '#334155';
      return highlighted ? '#e2e8f0' : defaultStroke;
    },
    getLinkWidth({ traffic, highlighted, defaultWidth }) {
      const base = traffic ? Math.max(1.1, (trafficWidthRate?.(traffic.rateMbps) ?? defaultWidth) * 0.45) : defaultWidth;
      return highlighted ? Math.max(base, 3) : base;
    },
    getLinkDasharray({ traffic }) {
      if (traffic?.status === 'down') return '6 4';
      return '0';
    },

    start({ container, links, link }) {
      linkSelection = link;

      overlay = container.append('g')
        .attr('pointer-events', 'none')
        .selectAll('line')
        .data(links, (d) => d.id)
        .join('line')
        .attr('stroke-linecap', 'round')
        .attr('stroke-opacity', 0.9);

      running = true;
      lastNow = 0;
      rafId = requestAnimationFrame(animate);

      return () => {
        running = false;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
        lastNow = 0;
        offsetById.clear();
        overlay?.remove();
        overlay = null;
      };
    },

    setTrafficGetter(fn) {
      getTraffic = fn;
    },

    onSimulationTick() {
      if (!overlay || !linkSelection) return;
      // Keep overlay in sync with base link positions.
      overlay
        .attr('x1', (d) => d.source.x)
        .attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x)
        .attr('y2', (d) => d.target.y);
    },

    afterLinkStyle({ highlightedLinks, hasSelection, filteredSet }) {
      if (!overlay) return;

      const o = overlay.interrupt().transition().duration(220).ease(d3.easeCubicOut);

      o
        .attr('stroke', (d) => {
          const t = getTraffic?.(d.id);
          if (!t) return 'transparent';
          return trafficColor?.(t.status, t.utilization) || '#38bdf8';
        })
        .attr('stroke-width', (d) => {
          const t = getTraffic?.(d.id);
          if (!t) return 0;
          const base = trafficWidthRate?.(t.rateMbps) ?? 1.4;
          const w = clamp(base * 0.35 + 0.8, 1.2, 6);
          return t?.status === 'down' ? Math.max(w, 3) : w;
        })
        .attr('opacity', (d) => {
          const t = getTraffic?.(d.id);
          if (t?.status === 'down') return 1;
          // Mirror base-link opacity rules.
          if (hasSelection) {
            if (highlightedLinks.size) return highlightedLinks.has(d.id) ? 1 : 0.14;
            return 0.28;
          }
          return (filteredSet.has(d.source.id) || filteredSet.has(d.target.id)) ? 0.9 : 0.18;
        });

      // Keep dasharray changes immediate (avoids odd tweening artifacts).
      overlay.attr('stroke-dasharray', (d) => {
        const t = getTraffic?.(d.id);
        if (!t) return '0';
        if (t.status === 'down') return '6 4';
        // Keep pattern stable; only speed should change.
        return DASH_UP;
      });
    },

    destroy() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      lastNow = 0;
      offsetById.clear();
      overlay?.remove();
      overlay = null;
    },
  };
}
