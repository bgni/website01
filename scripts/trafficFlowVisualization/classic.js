export function createClassicTrafficVisualization({ trafficColor, trafficWidthRate } = {}) {
  return {
    id: 'classic',
    getLinkStroke({ traffic, highlighted, defaultStroke }) {
      if (traffic) return trafficColor?.(traffic.status, traffic.utilization) || defaultStroke;
      return highlighted ? '#e2e8f0' : defaultStroke;
    },
    getLinkWidth({ traffic, highlighted, defaultWidth }) {
      const base = traffic ? (trafficWidthRate?.(traffic.rateMbps) ?? defaultWidth) : defaultWidth;
      return highlighted ? Math.max(base, 3) : base;
    },
    getLinkDasharray({ traffic }) {
      if (traffic?.status === 'down') return '6 4';
      return '0';
    },
    start() { return () => {}; },
    onSimulationTick() {},
    destroy() {},
  };
}
