import { createClassicTrafficVisualization } from './classic.js';
import { createUtilWidthTrafficVisualization } from './utilWidth.js';
import { createFlowDashesTrafficVisualization } from './flowDashes.js';

export const TRAFFIC_VIZ_OPTIONS = [
  { id: 'classic', name: 'Classic (width=rate, color=util)' },
  { id: 'util-width', name: 'Util width (width=util, color=status)' },
  { id: 'flow-dashes', name: 'Flow dashes (speed=rate)' },
];

export function createTrafficFlowVisualization(kind, helpers) {
  switch (kind) {
    case 'util-width':
      return createUtilWidthTrafficVisualization(helpers);
    case 'flow-dashes':
      return createFlowDashesTrafficVisualization(helpers);
    case 'classic':
    default:
      return createClassicTrafficVisualization(helpers);
  }
}
