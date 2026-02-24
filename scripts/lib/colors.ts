import {
  DEVICE_KIND_ACCESS_POINT,
  DEVICE_KIND_ROUTER,
  DEVICE_KIND_SERVER,
  DEVICE_KIND_SWITCH,
  DEVICE_KIND_UNKNOWN,
  type DeviceKind,
} from "../domain/deviceKind.ts";

export const typeColor = (kind: DeviceKind = DEVICE_KIND_UNKNOWN): string => {
  switch (kind) {
    case DEVICE_KIND_ACCESS_POINT:
      return "#c084fc";
    case DEVICE_KIND_SWITCH:
      return "#22d3ee";
    case DEVICE_KIND_ROUTER:
      return "#34d399";
    case DEVICE_KIND_SERVER:
      return "#fbbf24";
    default:
      return "#c084fc";
  }
};
