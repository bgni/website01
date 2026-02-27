import type { Connection, NetworkDevice } from "../domain/types.ts";
import {
  normalizeGroupLayout,
  resolveGroupBackgroundHex,
} from "../domain/groupStyles.ts";
import { GRAPH_COLORS, GRAPH_DEFAULTS } from "../config.ts";
import { getD3 } from "../lib/d3.ts";

export type SimNode = NetworkDevice & {
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
};

const NODE_CARD_WIDTH = 116;
const NODE_CARD_HEIGHT = 34;
const NODE_HALF_WIDTH = NODE_CARD_WIDTH / 2;
const NODE_HALF_HEIGHT = NODE_CARD_HEIGHT / 2;
const NODE_COLLIDE_RADIUS = Math.max(NODE_HALF_WIDTH, NODE_HALF_HEIGHT) + 16;
const GROUP_MIN_WIDTH = 180;
const GROUP_MIN_HEIGHT = 120;
const MIDDLE_PAN_DEBUG_STORAGE_KEY = "networkMap.debugMiddlePan";
const MIN_CANVAS_WIDTH = 760;
const MIN_CANVAS_HEIGHT = 480;

const normalizeContainerId = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const zeroNodeVelocity = (node: SimNode) => {
  const state = node as SimNode & { vx?: number; vy?: number };
  state.vx = 0;
  state.vy = 0;
};

const isContainerNode = (node: SimNode): boolean =>
  Boolean(node.isContainer === true);

const getContainerWidth = (node: SimNode): number => {
  const width = Number(node.width);
  return Number.isFinite(width) && width > 80 ? width : 260;
};

const getContainerHeight = (node: SimNode): number => {
  const height = Number(node.height);
  return Number.isFinite(height) && height > 60 ? height : 170;
};

const clampNumber = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const hexToRgba = (hex: string, alpha: number): string => {
  const normalized = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `rgba(51, 65, 85, ${alpha})`;
  }
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const getContainerFill = (node: SimNode): string =>
  hexToRgba(
    resolveGroupBackgroundHex(
      (node as unknown as Record<string, unknown>).groupBackgroundColor,
    ),
    0.2,
  );

const getContainerLayout = (node: SimNode) =>
  normalizeGroupLayout(
    (node as unknown as Record<string, unknown>).groupLayout,
  );

type ResolvedLinkEnd = { id: string; x: number; y: number };

export type SimLink = {
  id: string;
  source: string | ResolvedLinkEnd;
  target: string | ResolvedLinkEnd;
} & Record<string, unknown>;

export type Guide = { y: number };

export type ZoomTransformSnapshot = { x: number; y: number; k: number };

export type GraphDisplaySettings = {
  edgeOpacity: number;
  labelTextSize: number;
  labelMargin: number;
};

const getLinkEndId = (end: string | ResolvedLinkEnd): string =>
  typeof end === "string" ? end : end.id;

const linkFanoutOffsetsByEndpoint = (links: SimLink[]) => {
  const byNode = new Map<string, SimLink[]>();
  const push = (nodeId: string, link: SimLink) => {
    const arr = byNode.get(nodeId);
    if (arr) arr.push(link);
    else byNode.set(nodeId, [link]);
  };

  links.forEach((link) => {
    const sourceId = getLinkEndId(link.source);
    const targetId = getLinkEndId(link.target);
    push(sourceId, link);
    push(targetId, link);
  });

  const out = new Map<string, number>();

  for (const [nodeId, nodeLinks] of byNode.entries()) {
    const sorted = [...nodeLinks].sort((a, b) => {
      const aOther = getLinkEndId(a.source) === nodeId
        ? getLinkEndId(a.target)
        : getLinkEndId(a.source);
      const bOther = getLinkEndId(b.source) === nodeId
        ? getLinkEndId(b.target)
        : getLinkEndId(b.source);
      return `${aOther}\n${a.id}`.localeCompare(`${bOther}\n${b.id}`);
    });

    const mid = (sorted.length - 1) / 2;
    sorted.forEach((link, idx) => {
      out.set(`${link.id}|${nodeId}`, idx - mid);
    });
  }

  return out;
};

export type RendererUpdateArgs = {
  getLinkStroke: (d: SimLink) => string;
  getLinkWidth: (d: SimLink) => number;
  getLinkDasharray: (d: SimLink) => string | null | undefined;
  getLinkOpacity: (d: SimLink) => number;
  afterLinkStyle?: (edgeOpacityMultiplier: number) => void;
  getHalo: (
    d: SimNode,
  ) => { r: number; stroke: string; strokeWidth: number; opacity: number };
  getNodeFilter: (d: SimNode) => string;
  getLabelOpacity: (d: SimNode) => number;
};

export function createGraphRenderer(
  {
    svg,
    devices,
    connections,
    getNodeFill,
    onNodeSelect,
    onCanvasDeselect,
    onSelectionReplaced,
    onConnectionDragCreate,
    onConnectionSelect,
    onDeviceDropOnContainer,
    onContainerGeometryCommit,
    width: initialWidth = GRAPH_DEFAULTS.width,
    height: initialHeight = GRAPH_DEFAULTS.height,
  }: {
    svg: string | SVGSVGElement;
    devices: NetworkDevice[];
    connections: Connection[];
    getNodeFill: (d: SimNode) => string;
    onNodeSelect: (id: string) => void;
    onCanvasDeselect?: () => void;
    onSelectionReplaced?: (ids: string[]) => void;
    onConnectionDragCreate?: (fromId: string, toId: string) => void;
    onConnectionSelect?: (
      connectionId: string,
      fromId: string,
      toId: string,
    ) => void;
    onDeviceDropOnContainer?: (
      deviceId: string,
      containerId: string | null,
    ) => void;
    onContainerGeometryCommit?: (
      containerId: string,
      geometry: { x: number; y: number; width: number; height: number },
    ) => void;
    width?: number;
    height?: number;
  },
) {
  const d3 = getD3();
  const svgSel = d3.select(svg);
  let displaySettings: GraphDisplaySettings = {
    edgeOpacity: 1,
    labelTextSize: GRAPH_DEFAULTS.label.fontSize,
    labelMargin: GRAPH_DEFAULTS.label.yOffset,
  };

  let width = initialWidth;
  let height = initialHeight;
  let lastGuides: Guide[] = [];

  // Clear any prior render (important when switching networks).
  svgSel.on(".zoom", null);
  svgSel.on(".middle-pan", null);
  svgSel.selectAll("*").remove();

  svgSel
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");
  const container = svgSel.append("g");

  const zoom = d3.zoom().filter((event: Event) => {
    if (event.type === "wheel") return true;
    return event.type === "touchstart" || event.type === "touchmove";
  }).scaleExtent([
    GRAPH_DEFAULTS.zoom.minScale,
    GRAPH_DEFAULTS.zoom.maxScale,
  ]).on(
    "zoom",
    (event: { transform: { toString(): string } }) => {
      container.attr("transform", event.transform.toString());
    },
  );
  svgSel.call(zoom);

  const middlePanDebugEnabled = (() => {
    const win = svgSel.node()?.ownerDocument?.defaultView;
    if (!win) return false;
    try {
      return win.localStorage?.getItem(MIDDLE_PAN_DEBUG_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  })();
  const middlePanLog = (event: string, details: Record<string, unknown>) => {
    if (!middlePanDebugEnabled) return;
    console.debug("[middle-pan]", event, details);
  };

  let middlePan:
    | {
      startClientX: number;
      startClientY: number;
      startTransform: { x: number; y: number; k: number };
    }
    | null = null;
  let middlePanMouseMove: ((event: MouseEvent) => void) | null = null;
  let middlePanMouseUp: ((event: MouseEvent) => void) | null = null;
  let middlePanWindowBlur: (() => void) | null = null;
  let middlePanCaptureMouseDown: ((event: MouseEvent) => void) | null = null;
  let middlePanCaptureAuxClick: ((event: MouseEvent) => void) | null = null;
  let middlePanCapturePointerDown: ((event: PointerEvent) => void) | null =
    null;
  let middlePanPointerMove: ((event: PointerEvent) => void) | null = null;
  let middlePanPointerUp: ((event: PointerEvent) => void) | null = null;
  let middlePanPointerCancel: ((event: PointerEvent) => void) | null = null;
  let middlePanPointerId: number | null = null;
  let middlePanMoveLogCount = 0;

  const detachMiddlePanWindowListeners = () => {
    const win = svgSel.node()?.ownerDocument?.defaultView;
    if (!win) return;
    if (middlePanMouseMove) {
      win.removeEventListener("mousemove", middlePanMouseMove);
      middlePanMouseMove = null;
    }
    if (middlePanMouseUp) {
      win.removeEventListener("mouseup", middlePanMouseUp);
      middlePanMouseUp = null;
    }
    if (middlePanWindowBlur) {
      win.removeEventListener("blur", middlePanWindowBlur);
      middlePanWindowBlur = null;
    }
  };

  const detachMiddlePanCaptureListeners = () => {
    const node = svgSel.node();
    if (!(node instanceof SVGSVGElement)) return;
    if (middlePanCaptureMouseDown) {
      node.removeEventListener("mousedown", middlePanCaptureMouseDown, true);
      middlePanCaptureMouseDown = null;
    }
    if (middlePanCaptureAuxClick) {
      node.removeEventListener("auxclick", middlePanCaptureAuxClick, true);
      middlePanCaptureAuxClick = null;
    }
    if (middlePanCapturePointerDown) {
      node.removeEventListener(
        "pointerdown",
        middlePanCapturePointerDown,
        true,
      );
      middlePanCapturePointerDown = null;
    }
    if (middlePanPointerMove) {
      node.removeEventListener("pointermove", middlePanPointerMove, true);
      middlePanPointerMove = null;
    }
    if (middlePanPointerUp) {
      node.removeEventListener("pointerup", middlePanPointerUp, true);
      middlePanPointerUp = null;
    }
    if (middlePanPointerCancel) {
      node.removeEventListener("pointercancel", middlePanPointerCancel, true);
      middlePanPointerCancel = null;
    }
  };

  const stopMiddlePan = (reason: string) => {
    if (!middlePan) return;
    const node = svgSel.node();
    if (
      node instanceof SVGSVGElement && middlePanPointerId != null &&
      typeof node.releasePointerCapture === "function"
    ) {
      try {
        node.releasePointerCapture(middlePanPointerId);
      } catch {
        // Pointer capture may already be gone.
      }
    }
    middlePanPointerId = null;
    middlePanLog("stop", { reason });
    middlePan = null;
    svgSel.classed("is-middle-panning", false);
    detachMiddlePanWindowListeners();
  };

  const isMiddlePanTrigger = (event: MouseEvent): boolean =>
    event.button === 1 || (event.buttons & 4) !== 0;

  const moveMiddlePan = (event: MouseEvent) => {
    if (!middlePan) return;
    const dx = event.clientX - middlePan.startClientX;
    const dy = event.clientY - middlePan.startClientY;
    if (middlePanMoveLogCount < 3) {
      middlePanMoveLogCount += 1;
      middlePanLog("move", {
        dx,
        dy,
        buttons: event.buttons,
      });
    }
    const nextTransform = d3.zoomIdentity
      .translate(
        middlePan.startTransform.x + dx,
        middlePan.startTransform.y + dy,
      )
      .scale(middlePan.startTransform.k);
    svgSel.call(zoom.transform, nextTransform);
    event.preventDefault();
  };
  const moveMiddlePanPointer = (event: PointerEvent) => {
    if (middlePanPointerId != null && event.pointerId !== middlePanPointerId) {
      return;
    }
    moveMiddlePan(event as unknown as MouseEvent);
  };

  const startMiddlePan = (event: MouseEvent) => {
    if (!isMiddlePanTrigger(event)) return;
    if (middlePan) return;
    const node = svgSel.node();
    if (!(node instanceof SVGSVGElement)) return;

    const current = d3.zoomTransform(node);
    middlePan = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startTransform: {
        x: Number(current.x) || 0,
        y: Number(current.y) || 0,
        k: Number(current.k) || 1,
      },
    };
    middlePanMoveLogCount = 0;
    middlePanLog("start", {
      button: event.button,
      buttons: event.buttons,
      target: event.target instanceof Element
        ? event.target.tagName
        : "unknown",
    });
    svgSel.classed("is-middle-panning", true);

    const win = node.ownerDocument.defaultView;
    if (win) {
      middlePanMouseMove = (moveEvent: MouseEvent) => moveMiddlePan(moveEvent);
      middlePanMouseUp = () => stopMiddlePan("mouseup");
      middlePanWindowBlur = () => stopMiddlePan("window-blur");
      win.addEventListener("mousemove", middlePanMouseMove);
      win.addEventListener("mouseup", middlePanMouseUp);
      win.addEventListener("blur", middlePanWindowBlur);
    }

    event.preventDefault();
    event.stopPropagation();
  };

  svgSel.on("mousedown.middle-pan", (event: MouseEvent) => {
    startMiddlePan(event);
  });

  // Prevent middle-click auto-scroll from hijacking drag-pan.
  svgSel.on("auxclick.middle-pan", (event: MouseEvent) => {
    if (event.button !== 1) return;
    event.preventDefault();
  });
  const svgNodeForMiddlePan = svgSel.node();
  if (svgNodeForMiddlePan instanceof SVGSVGElement) {
    middlePanCaptureMouseDown = (event: MouseEvent) => startMiddlePan(event);
    middlePanCapturePointerDown = (event: PointerEvent) => {
      if (!isMiddlePanTrigger(event as unknown as MouseEvent)) return;
      middlePanPointerId = event.pointerId;
      if (typeof svgNodeForMiddlePan.setPointerCapture === "function") {
        try {
          svgNodeForMiddlePan.setPointerCapture(event.pointerId);
        } catch {
          // Ignore capture failures and keep mouse/window fallback active.
        }
      }
      startMiddlePan(event as unknown as MouseEvent);
      event.preventDefault();
      event.stopPropagation();
    };
    middlePanCaptureAuxClick = (event: MouseEvent) => {
      if (event.button !== 1) return;
      event.preventDefault();
    };
    middlePanPointerMove = (event: PointerEvent) => moveMiddlePanPointer(event);
    middlePanPointerUp = (event: PointerEvent) => {
      if (
        middlePanPointerId != null && event.pointerId !== middlePanPointerId
      ) {
        return;
      }
      stopMiddlePan("pointerup");
    };
    middlePanPointerCancel = (event: PointerEvent) => {
      if (
        middlePanPointerId != null && event.pointerId !== middlePanPointerId
      ) {
        return;
      }
      stopMiddlePan("pointercancel");
    };
    svgNodeForMiddlePan.addEventListener(
      "mousedown",
      middlePanCaptureMouseDown,
      true,
    );
    svgNodeForMiddlePan.addEventListener(
      "pointerdown",
      middlePanCapturePointerDown,
      true,
    );
    svgNodeForMiddlePan.addEventListener(
      "auxclick",
      middlePanCaptureAuxClick,
      true,
    );
    svgNodeForMiddlePan.addEventListener(
      "pointermove",
      middlePanPointerMove,
      true,
    );
    svgNodeForMiddlePan.addEventListener(
      "pointerup",
      middlePanPointerUp,
      true,
    );
    svgNodeForMiddlePan.addEventListener(
      "pointercancel",
      middlePanPointerCancel,
      true,
    );
  }

  const isInteractiveTarget = (target: Element) =>
    Boolean(
      target.closest(".node-layer circle") ||
        target.closest(".node-card-layer *") ||
        target.closest(".label-layer text") ||
        target.closest(".link-layer line") ||
        target.closest(".container-layer .graph-container") ||
        target.closest(".container-resize-layer .graph-container-resize") ||
        target.closest(".viz-layer *") ||
        target.closest(".connection-handle-layer *") ||
        target.closest(".connection-draft-layer *"),
    );

  let suppressCanvasClickUntil = 0;

  const clientPointToGraph = (
    clientX: number,
    clientY: number,
  ): { x: number; y: number } | null => {
    const node = svgSel.node();
    if (!(node instanceof SVGSVGElement)) return null;

    const screenCtm = node.getScreenCTM();
    if (!screenCtm) return null;

    const point = node.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const local = point.matrixTransform(screenCtm.inverse());

    const zoomTransform = d3.zoomTransform(node);
    return {
      x: zoomTransform.invertX(local.x),
      y: zoomTransform.invertY(local.y),
    };
  };

  const getGraphPoint = (event: MouseEvent) => {
    const clientPoint = clientPointToGraph(event.clientX, event.clientY);
    if (clientPoint) return clientPoint;

    const node = svgSel.node();
    const [sx, sy] = d3.pointer(event, node);
    const t = node ? d3.zoomTransform(node) : d3.zoomIdentity;
    return {
      x: t.invertX(sx),
      y: t.invertY(sy),
    };
  };

  svgSel.on("click", (event: Event) => {
    if (Date.now() < suppressCanvasClickUntil) return;

    const target = event.target;
    if (!(target instanceof Element)) return;

    if (isInteractiveTarget(target)) return;

    onCanvasDeselect?.();
  });

  const getViewportTransform = (): ZoomTransformSnapshot => {
    const node = svgSel.node();
    const current = node ? d3.zoomTransform(node) : d3.zoomIdentity;
    return {
      x: Number(current.x) || 0,
      y: Number(current.y) || 0,
      k: Number(current.k) || 1,
    };
  };

  const setViewportTransform = (snapshot: ZoomTransformSnapshot | null) => {
    if (!snapshot) return;
    const node = svgSel.node();
    if (!node) return;

    const k = Number.isFinite(snapshot.k) && snapshot.k > 0 ? snapshot.k : 1;
    const x = Number.isFinite(snapshot.x) ? snapshot.x : 0;
    const y = Number.isFinite(snapshot.y) ? snapshot.y : 0;
    const t = d3.zoomIdentity.translate(x, y).scale(k);
    svgSel.call(zoom.transform, t);
  };

  const getViewportCenter = () => {
    const node = svgSel.node();
    const t = node ? d3.zoomTransform(node) : d3.zoomIdentity;
    const cx = Number.isFinite(t.invertX(width / 2))
      ? t.invertX(width / 2)
      : width / 2;
    const cy = Number.isFinite(t.invertY(height / 2))
      ? t.invertY(height / 2)
      : height / 2;
    return { x: cx, y: cy };
  };

  const getNodePositions = () => {
    const out = new Map<string, { x: number; y: number }>();
    nodes.forEach((node) => {
      const x = Number(node.x);
      const y = Number(node.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      out.set(node.id, { x, y });
    });
    return out;
  };

  const guideLayer = container.append("g").attr("class", "guide-layer");
  const containerLayer = container.append("g").attr("class", "container-layer");
  const linkBackdropLayer = container
    .append("g")
    .attr("class", "link-backdrop-layer");
  const linkLayer = container.append("g").attr("class", "link-layer");
  const vizLayer = container.append("g").attr("class", "viz-layer");
  const connectionDraftLayer = container
    .append("g")
    .attr("class", "connection-draft-layer");
  const connectionHandleLayer = container
    .append("g")
    .attr("class", "connection-handle-layer");
  const marqueeLayer = container.append("g").attr("class", "marquee-layer");
  const haloLayer = container.append("g").attr("class", "halo-layer");
  const nodeCardLayer = container.append("g").attr("class", "node-card-layer");
  const nodeLayer = container.append("g").attr("class", "node-layer");
  const labelLayer = container.append("g").attr("class", "label-layer");
  const containerResizeLayer = container
    .append("g")
    .attr("class", "container-resize-layer");

  const marqueeRect = marqueeLayer
    .append("rect")
    .attr("class", "marquee-rect")
    .attr("display", "none")
    .attr("pointer-events", "none");

  let dragSelect:
    | {
      startX: number;
      startY: number;
      lastX: number;
      lastY: number;
      active: boolean;
    }
    | null = null;

  const updateMarqueeRect = () => {
    if (!dragSelect || !dragSelect.active) {
      marqueeRect.attr("display", "none");
      return;
    }

    const x = Math.min(dragSelect.startX, dragSelect.lastX);
    const y = Math.min(dragSelect.startY, dragSelect.lastY);
    const w = Math.abs(dragSelect.lastX - dragSelect.startX);
    const h = Math.abs(dragSelect.lastY - dragSelect.startY);

    marqueeRect
      .attr("display", null)
      .attr("x", x)
      .attr("y", y)
      .attr("width", w)
      .attr("height", h);
  };

  const finalizeDragSelection = () => {
    if (!dragSelect) return;

    if (dragSelect.active) {
      const minX = Math.min(dragSelect.startX, dragSelect.lastX);
      const maxX = Math.max(dragSelect.startX, dragSelect.lastX);
      const minY = Math.min(dragSelect.startY, dragSelect.lastY);
      const maxY = Math.max(dragSelect.startY, dragSelect.lastY);

      const ids = nodes
        .filter((node) => {
          if (isContainerNode(node)) {
            const cx = Number(node.x);
            const cy = Number(node.y);
            if (!Number.isFinite(cx) || !Number.isFinite(cy)) return false;
            const halfW = getContainerWidth(node) / 2;
            const halfH = getContainerHeight(node) / 2;
            return (
              cx + halfW >= minX &&
              cx - halfW <= maxX &&
              cy + halfH >= minY &&
              cy - halfH <= maxY
            );
          }

          const x = Number(node.x);
          const y = Number(node.y);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
          return (
            x + NODE_HALF_WIDTH >= minX &&
            x - NODE_HALF_WIDTH <= maxX &&
            y + NODE_HALF_HEIGHT >= minY &&
            y - NODE_HALF_HEIGHT <= maxY
          );
        })
        .map((node) => node.id);

      onSelectionReplaced?.(ids);
      suppressCanvasClickUntil = Date.now() + 120;
    }

    dragSelect = null;
    updateMarqueeRect();
  };

  svgSel.on("mousedown.marquee", (event: MouseEvent) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (isInteractiveTarget(target)) return;

    const point = getGraphPoint(event);
    dragSelect = {
      startX: point.x,
      startY: point.y,
      lastX: point.x,
      lastY: point.y,
      active: false,
    };
    event.preventDefault();
  });

  svgSel.on("mousemove.marquee", (event: MouseEvent) => {
    if (!dragSelect) return;
    const point = getGraphPoint(event);
    dragSelect.lastX = point.x;
    dragSelect.lastY = point.y;

    if (!dragSelect.active) {
      const dx = dragSelect.lastX - dragSelect.startX;
      const dy = dragSelect.lastY - dragSelect.startY;
      dragSelect.active = Math.hypot(dx, dy) >= 8;
    }

    if (dragSelect.active) {
      event.preventDefault();
      updateMarqueeRect();
    }
  });

  svgSel.on("mouseup.marquee", () => {
    finalizeDragSelection();
  });

  svgSel.on("mouseleave.marquee", () => {
    finalizeDragSelection();
  });

  const nodes = devices.map((d: NetworkDevice) => ({ ...d })) as SimNode[];
  const containerNodes = nodes.filter((node) => isContainerNode(node));
  const deviceNodes = nodes.filter((node) => !isContainerNode(node));
  const containerById = new Map(containerNodes.map((node) => [node.id, node]));
  const containerIdSet = new Set(containerNodes.map((node) => node.id));
  const getAssignedContainerId = (node: SimNode): string | null => {
    const containerId = normalizeContainerId(node.containerId);
    if (!containerId) return null;
    return containerIdSet.has(containerId) ? containerId : null;
  };
  const isGroupedDeviceNode = (node: SimNode): boolean =>
    !isContainerNode(node) && Boolean(getAssignedContainerId(node));
  const links = connections.map((c: Connection) => ({
    ...c,
    source: c.from.deviceId,
    target: c.to.deviceId,
  })) as SimLink[];
  const fanoutOffsetByEndpoint = linkFanoutOffsetsByEndpoint(links);
  let containerDropTargetId: string | null = null;

  const findContainerAtPoint = (
    x: number,
    y: number,
  ): string | null => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    let best: { id: string; area: number } | null = null;
    for (const containerNode of containerNodes) {
      const cx = Number(containerNode.x);
      const cy = Number(containerNode.y);
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;

      const width = getContainerWidth(containerNode);
      const height = getContainerHeight(containerNode);
      const left = cx - width / 2;
      const right = cx + width / 2;
      const top = cy - height / 2;
      const bottom = cy + height / 2;
      if (x < left || x > right || y < top || y > bottom) continue;

      const area = width * height;
      if (!best || area < best.area) {
        best = { id: containerNode.id, area };
      }
    }
    return best?.id ?? null;
  };

  const getContainerForNode = (node: SimNode): SimNode | null => {
    const containerId = getAssignedContainerId(node);
    if (!containerId) return null;
    return containerById.get(containerId) ?? null;
  };

  const clampNodeToContainer = (node: SimNode) => {
    const containerNode = getContainerForNode(node);
    if (!containerNode) return;

    const cx = Number(containerNode.x);
    const cy = Number(containerNode.y);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;

    const width = getContainerWidth(containerNode);
    const height = getContainerHeight(containerNode);
    const left = cx - width / 2;
    const right = cx + width / 2;
    const top = cy - height / 2;
    const bottom = cy + height / 2;
    const pad = Math.max(NODE_HALF_WIDTH, NODE_HALF_HEIGHT) + 8;

    const minX = left + pad;
    const maxX = right - pad;
    const minY = top + pad;
    const maxY = bottom - pad;

    const x = Number(node.x);
    const y = Number(node.y);
    node.x = Number.isFinite(x) ? x : cx;
    node.y = Number.isFinite(y) ? y : cy;
    node.x = minX <= maxX ? clampNumber(node.x, minX, maxX) : cx;
    node.y = minY <= maxY ? clampNumber(node.y, minY, maxY) : cy;
  };

  const moveContainerMembersBy = (
    containerId: string,
    dx: number,
    dy: number,
  ) => {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return;

    for (const node of deviceNodes) {
      const nodeContainerId = getAssignedContainerId(node);
      if (nodeContainerId !== containerId) continue;

      const x = Number(node.x);
      const y = Number(node.y);
      node.x = Number.isFinite(x) ? x + dx : (width / 2) + dx;
      node.y = Number.isFinite(y) ? y + dy : (height / 2) + dy;

      const fx = Number(node.fx);
      if (Number.isFinite(fx)) node.fx = fx + dx;
      const fy = Number(node.fy);
      if (Number.isFinite(fy)) node.fy = fy + dy;
    }
  };

  const getMinimumCanvasSize = (): { width: number; height: number } => {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    const includeBounds = (
      left: number,
      right: number,
      top: number,
      bottom: number,
    ) => {
      if (
        !Number.isFinite(left) || !Number.isFinite(right) ||
        !Number.isFinite(top) || !Number.isFinite(bottom)
      ) {
        return;
      }
      minX = Math.min(minX, left);
      maxX = Math.max(maxX, right);
      minY = Math.min(minY, top);
      maxY = Math.max(maxY, bottom);
    };

    for (const node of deviceNodes) {
      const x = Number(node.x);
      const y = Number(node.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      includeBounds(
        x - NODE_HALF_WIDTH,
        x + NODE_HALF_WIDTH,
        y - NODE_HALF_HEIGHT,
        y + Math.max(
          NODE_HALF_HEIGHT,
          displaySettings.labelMargin + displaySettings.labelTextSize + 12,
        ),
      );
    }

    for (const node of containerNodes) {
      const x = Number(node.x);
      const y = Number(node.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const halfWidth = getContainerWidth(node) / 2;
      const halfHeight = getContainerHeight(node) / 2;
      includeBounds(
        x - halfWidth,
        x + halfWidth,
        y - halfHeight,
        y + halfHeight,
      );
    }

    if (
      !Number.isFinite(minX) || !Number.isFinite(maxX) ||
      !Number.isFinite(minY) || !Number.isFinite(maxY)
    ) {
      return {
        width: GRAPH_DEFAULTS.width,
        height: GRAPH_DEFAULTS.height,
      };
    }

    const horizontalPadding = Math.max(
      96,
      GRAPH_DEFAULTS.node.boundsPadding + NODE_HALF_WIDTH + 28,
    );
    const topPadding = 72;
    const bottomPadding = Math.max(
      88,
      displaySettings.labelMargin + displaySettings.labelTextSize + 28,
    );
    const estimatedNodeCount = Math.max(
      1,
      deviceNodes.length + containerNodes.length * 2,
    );
    const estimatedColumns = Math.max(
      1,
      Math.ceil(Math.sqrt(estimatedNodeCount * 1.8)),
    );
    const estimatedRows = Math.max(
      1,
      Math.ceil(estimatedNodeCount / estimatedColumns),
    );
    const estimatedWidth = Math.ceil(
      estimatedColumns * (NODE_CARD_WIDTH + 88) + horizontalPadding * 2,
    );
    const estimatedHeight = Math.ceil(
      estimatedRows * (NODE_CARD_HEIGHT + 120) + topPadding + bottomPadding,
    );

    return {
      width: Math.max(
        MIN_CANVAS_WIDTH,
        estimatedWidth,
        Math.ceil(maxX - minX + horizontalPadding * 2),
      ),
      height: Math.max(
        MIN_CANVAS_HEIGHT,
        estimatedHeight,
        Math.ceil(maxY - minY + topPadding + bottomPadding),
      ),
    };
  };

  const layoutContainerMembers = (containerNode: SimNode) => {
    const layout = getContainerLayout(containerNode);
    if (layout === "free") return;

    const cx = Number(containerNode.x);
    const cy = Number(containerNode.y);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;

    const members = deviceNodes
      .filter((node) => {
        const nodeContainerId = getAssignedContainerId(node);
        return nodeContainerId === containerNode.id;
      })
      .sort((left, right) =>
        `${String(left.name ?? left.id)}|${left.id}`.localeCompare(
          `${String(right.name ?? right.id)}|${right.id}`,
        )
      );

    if (!members.length) return;

    const width = getContainerWidth(containerNode);
    const height = getContainerHeight(containerNode);
    const paddingX = NODE_HALF_WIDTH + 16;
    const paddingY = NODE_HALF_HEIGHT + 20;
    const left = cx - width / 2 + paddingX;
    const right = cx + width / 2 - paddingX;
    const top = cy - height / 2 + paddingY;
    const bottom = cy + height / 2 - paddingY;
    const usableWidth = Math.max(1, right - left);
    const usableHeight = Math.max(1, bottom - top);

    const count = members.length;

    if (layout === "dot") {
      const idealRadiusForCount = (count * (NODE_CARD_WIDTH + 12)) /
        (Math.PI * 2);
      const radius = Math.max(
        18,
        idealRadiusForCount,
        Math.min(usableWidth, usableHeight) / 2 - Math.max(NODE_HALF_WIDTH, 14),
      );
      members.forEach((node, index) => {
        const angle = (index / Math.max(1, count)) * Math.PI * 2;
        node.x = cx + Math.cos(angle) * radius;
        node.y = cy + Math.sin(angle) * radius;
      });
      return;
    }

    if (layout === "layered") {
      const byKind = members.reduce((map, node) => {
        const key = Number.isFinite(Number(node.deviceKind))
          ? Number(node.deviceKind)
          : Number.POSITIVE_INFINITY;
        const list = map.get(key);
        if (list) {
          list.push(node);
        } else {
          map.set(key, [node]);
        }
        return map;
      }, new Map<number, SimNode[]>());

      const orderedLayers = Array.from(byKind.entries())
        .sort((left, right) => left[0] - right[0])
        .map((entry) => entry[1]);
      const layerCount = orderedLayers.length;
      const desiredLayerSpacing = NODE_CARD_HEIGHT + 16;
      const layerSpread = layerCount <= 1
        ? 0
        : Math.min(usableHeight, (layerCount - 1) * desiredLayerSpacing);
      const layerTop = cy - layerSpread / 2;
      orderedLayers.forEach((layerMembers, layerIndex) => {
        const y = layerCount <= 1
          ? cy
          : layerTop + (layerSpread / (layerCount - 1)) * layerIndex;
        const desiredSpan = layerMembers.length <= 1
          ? 0
          : (layerMembers.length - 1) * (NODE_CARD_WIDTH + 12);
        const layerSpan = Math.min(usableWidth, desiredSpan);
        const layerLeft = cx - layerSpan / 2;
        const xStep = layerMembers.length <= 1
          ? 0
          : layerSpan / (layerMembers.length - 1);
        layerMembers.forEach((node, index) => {
          node.x = layerMembers.length <= 1 ? cx : layerLeft + xStep * index;
          node.y = y;
        });
      });
      return;
    }

    if (layout === "force") {
      // Deterministic pseudo-force spread using a phyllotaxis spiral.
      members.forEach((node, index) => {
        const angle = index * 2.399963229728653; // golden angle
        const radius = Math.sqrt(index + 1) * 24;
        node.x = clampNumber(cx + Math.cos(angle) * radius, left, right);
        node.y = clampNumber(cy + Math.sin(angle) * radius, top, bottom);
      });
      return;
    }

    const cols = layout === "rows"
      ? count
      : layout === "columns"
      ? 1
      : Math.max(1, Math.ceil(Math.sqrt(count)));
    const rows = layout === "rows"
      ? 1
      : layout === "columns"
      ? count
      : Math.max(1, Math.ceil(count / cols));
    const desiredXSpan = cols <= 1 ? 0 : (cols - 1) * (NODE_CARD_WIDTH + 12);
    const desiredYSpan = rows <= 1 ? 0 : (rows - 1) * (NODE_CARD_HEIGHT + 16);
    const xSpan = Math.min(usableWidth, desiredXSpan);
    const ySpan = Math.min(usableHeight, desiredYSpan);
    const startX = cx - xSpan / 2;
    const startY = cy - ySpan / 2;
    const xStep = cols <= 1 ? 0 : xSpan / (cols - 1);
    const yStep = rows <= 1 ? 0 : ySpan / (rows - 1);

    members.forEach((node, index) => {
      const col = layout === "rows" ? index : index % cols;
      const row = layout === "columns" ? index : Math.floor(index / cols);
      const x = cols <= 1 ? cx : startX + xStep * col;
      const y = rows <= 1 ? cy : startY + yStep * row;
      node.x = x;
      node.y = y;
    });
  };

  let activeContainerDrag:
    | { containerId: string; lastX: number; lastY: number }
    | null = null;
  let activeContainerResize:
    | { containerId: string; centerX: number; centerY: number }
    | null = null;

  const linkBackdropSelection = linkBackdropLayer
    .attr("pointer-events", "none")
    .selectAll("line")
    .data(links, (d: SimLink) => d.id)
    .join("line")
    .attr("stroke", "#e2e8f0")
    .attr(
      "stroke-width",
      Math.max(3.2, GRAPH_DEFAULTS.link.defaultWidth + 2.4),
    )
    .attr("stroke-opacity", 0.45)
    .attr("stroke-linecap", "round")
    .attr("stroke-linejoin", "round");

  const linkSelection = linkLayer
    .attr("stroke", GRAPH_COLORS.linkStroke)
    .attr("stroke-opacity", GRAPH_DEFAULTS.link.defaultOpacity)
    .selectAll("line")
    .data(links, (d: SimLink) => d.id)
    .join("line")
    .attr("stroke-width", GRAPH_DEFAULTS.link.defaultWidth)
    .attr("stroke-linecap", "round")
    .attr("stroke-linejoin", "round")
    .on("click", (event: MouseEvent, d: SimLink) => {
      event.stopPropagation();
      onConnectionSelect?.(
        d.id,
        getLinkEndId(d.source),
        getLinkEndId(d.target),
      );
    });

  // Selection/highlight indicator that doesn't compete with fill colors.
  const haloSelection = haloLayer
    .attr("pointer-events", "none")
    .selectAll("circle")
    .data(nodes, (d: SimNode) => d.id)
    .join("circle")
    .attr("r", GRAPH_DEFAULTS.halo.radius.default)
    .attr("fill", "none")
    .attr("stroke", GRAPH_COLORS.halo.default)
    .attr("stroke-width", GRAPH_DEFAULTS.halo.strokeWidth.selected)
    .attr("opacity", 0);

  const containerSelection = containerLayer
    .selectAll("rect")
    .data(containerNodes, (d: SimNode) => d.id)
    .join("rect")
    .attr("rx", 10)
    .attr("ry", 10)
    .attr("class", "graph-container")
    .attr("fill", (d: SimNode) => getContainerFill(d))
    .on("click", (_event: unknown, d: SimNode) => onNodeSelect(d.id))
    .call(
      d3.drag()
        .on("start", (event: { x?: number; y?: number }, d: SimNode) => {
          const startX = Number.isFinite(event.x)
            ? Number(event.x)
            : Number(d.x);
          const startY = Number.isFinite(event.y)
            ? Number(event.y)
            : Number(d.y);
          activeContainerDrag = {
            containerId: d.id,
            lastX: Number.isFinite(startX) ? startX : width / 2,
            lastY: Number.isFinite(startY) ? startY : height / 2,
          };
        })
        .on("drag", (event: { x: number; y: number }, d: SimNode) => {
          const nextX = Number(event.x);
          const nextY = Number(event.y);
          const fallbackX = Number(d.x);
          const fallbackY = Number(d.y);
          const prevX = activeContainerDrag?.containerId === d.id
            ? activeContainerDrag.lastX
            : (Number.isFinite(fallbackX) ? fallbackX : nextX);
          const prevY = activeContainerDrag?.containerId === d.id
            ? activeContainerDrag.lastY
            : (Number.isFinite(fallbackY) ? fallbackY : nextY);
          const dx = nextX - prevX;
          const dy = nextY - prevY;

          d.x = event.x;
          d.y = event.y;
          d.fx = d.x;
          d.fy = d.y;
          moveContainerMembersBy(d.id, dx, dy);
          activeContainerDrag = {
            containerId: d.id,
            lastX: nextX,
            lastY: nextY,
          };
          renderPositions();
        })
        .on("end", (_event: unknown, d: SimNode) => {
          d.fx = d.x;
          d.fy = d.y;
          if (activeContainerDrag?.containerId === d.id) {
            activeContainerDrag = null;
          }
          const x = Number.isFinite(Number(d.x)) ? Number(d.x) : width / 2;
          const y = Number.isFinite(Number(d.y)) ? Number(d.y) : height / 2;
          onContainerGeometryCommit?.(d.id, {
            x,
            y,
            width: getContainerWidth(d),
            height: getContainerHeight(d),
          });
        }),
    );

  const containerResizeSelection = containerResizeLayer
    .selectAll("circle")
    .data(containerNodes, (d: SimNode) => d.id)
    .join("circle")
    .attr("class", "graph-container-resize")
    .attr("r", 6)
    .on("click", (event: MouseEvent, d: SimNode) => {
      event.stopPropagation();
      onNodeSelect(d.id);
    })
    .call(
      d3.drag()
        .on("start", (event: { x?: number; y?: number }, d: SimNode) => {
          onNodeSelect(d.id);
          const centerX = Number.isFinite(Number(d.x))
            ? Number(d.x)
            : width / 2;
          const centerY = Number.isFinite(Number(d.y))
            ? Number(d.y)
            : height / 2;
          activeContainerResize = {
            containerId: d.id,
            centerX,
            centerY,
          };
          if (typeof event.x === "number" && typeof event.y === "number") {
            const nextWidth = clampNumber(
              (Math.max(event.x, centerX + GROUP_MIN_WIDTH / 2) - centerX) * 2,
              GROUP_MIN_WIDTH,
              width * 2,
            );
            const nextHeight = clampNumber(
              (Math.max(event.y, centerY + GROUP_MIN_HEIGHT / 2) - centerY) * 2,
              GROUP_MIN_HEIGHT,
              height * 2,
            );
            d.width = nextWidth;
            d.height = nextHeight;
            renderPositions();
          }
        })
        .on("drag", (event: { x: number; y: number }, d: SimNode) => {
          const centerX = activeContainerResize?.containerId === d.id
            ? activeContainerResize.centerX
            : (Number.isFinite(Number(d.x)) ? Number(d.x) : width / 2);
          const centerY = activeContainerResize?.containerId === d.id
            ? activeContainerResize.centerY
            : (Number.isFinite(Number(d.y)) ? Number(d.y) : height / 2);
          const nextWidth = clampNumber(
            (Math.max(event.x, centerX + GROUP_MIN_WIDTH / 2) - centerX) * 2,
            GROUP_MIN_WIDTH,
            width * 2,
          );
          const nextHeight = clampNumber(
            (Math.max(event.y, centerY + GROUP_MIN_HEIGHT / 2) - centerY) * 2,
            GROUP_MIN_HEIGHT,
            height * 2,
          );
          d.width = nextWidth;
          d.height = nextHeight;
          renderPositions();
        })
        .on("end", (_event: unknown, d: SimNode) => {
          const x = Number.isFinite(Number(d.x)) ? Number(d.x) : width / 2;
          const y = Number.isFinite(Number(d.y)) ? Number(d.y) : height / 2;
          if (activeContainerResize?.containerId === d.id) {
            activeContainerResize = null;
          }
          onContainerGeometryCommit?.(d.id, {
            x,
            y,
            width: getContainerWidth(d),
            height: getContainerHeight(d),
          });
          renderPositions();
        }),
    );

  let layoutKind = "force";
  const deviceNodeById = new Map(deviceNodes.map((node) => [node.id, node]));
  const linkForce = d3.forceLink(links)
    .id((d: { id: string }) => d.id)
    .distance(GRAPH_DEFAULTS.link.force.distance)
    .strength((link: SimLink) => {
      const sourceNode = deviceNodeById.get(getLinkEndId(link.source));
      const targetNode = deviceNodeById.get(getLinkEndId(link.target));
      if (
        (sourceNode && isGroupedDeviceNode(sourceNode)) ||
        (targetNode && isGroupedDeviceNode(targetNode))
      ) {
        return 0;
      }
      return GRAPH_DEFAULTS.link.force.strength;
    });

  const simulation = d3.forceSimulation(deviceNodes)
    .force("link", linkForce)
    .force(
      "charge",
      d3.forceManyBody().strength((node: SimNode) =>
        isGroupedDeviceNode(node) ? 0 : GRAPH_DEFAULTS.simulation.chargeStrength
      ),
    )
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force(
      "collide",
      d3.forceCollide(
        Math.max(GRAPH_DEFAULTS.simulation.collideRadius, NODE_COLLIDE_RADIUS),
      ),
    );

  const nodeCardFrameSelection = nodeCardLayer
    .selectAll("rect")
    .data(deviceNodes, (d: SimNode) => d.id)
    .join("rect")
    .attr("class", "device-node-card")
    .attr("rx", 6)
    .attr("ry", 6)
    .attr("pointer-events", "none");

  const nodeCardImageSelection = nodeCardLayer
    .selectAll("image")
    .data(deviceNodes, (d: SimNode) => d.id)
    .join("image")
    .attr("class", "device-node-card-image")
    .attr("pointer-events", "none")
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr(
      "href",
      (d: SimNode) =>
        typeof d.thumbPng === "string" && d.thumbPng.trim()
          ? d.thumbPng
          : (typeof d.thumbJpg === "string" && d.thumbJpg.trim()
            ? d.thumbJpg
            : ""),
    );
  let activeNodeDragId: string | null = null;

  const nodeSelection = nodeLayer
    .selectAll("circle")
    .data(deviceNodes, (d: SimNode) => d.id)
    .join("circle")
    .attr("class", "device-node-hitbox")
    .attr("r", GRAPH_DEFAULTS.node.radius)
    .attr("fill", (d: SimNode) => getNodeFill(d))
    .attr("stroke", GRAPH_COLORS.nodeStroke)
    .attr("stroke-width", GRAPH_DEFAULTS.node.strokeWidth)
    .on("click", (_event: unknown, d: SimNode) => onNodeSelect(d.id))
    .call(
      d3.drag()
        .on("start", (event: { active?: boolean }, d: SimNode) => {
          activeNodeDragId = d.id;
          containerDropTargetId = null;
          if (layoutKind === "force") {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
            return;
          }

          // Tiered is static: don't restart the simulation.
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event: { x: number; y: number }, d: SimNode) => {
          if (layoutKind === "force") {
            d.x = event.x;
            d.y = event.y;
            d.fx = event.x;
            d.fy = event.y;
            containerDropTargetId = findContainerAtPoint(event.x, event.y);
            renderPositions();
            return;
          }

          // Tiered: move immediately and keep locked.
          d.x = event.x;
          d.y = event.y;
          d.fx = d.x;
          d.fy = d.y;
          containerDropTargetId = findContainerAtPoint(event.x, event.y);

          renderPositions();
        })
        .on(
          "end",
          (event: { active?: boolean; x?: number; y?: number }, d: SimNode) => {
            const dropX = Number.isFinite(event.x)
              ? Number(event.x)
              : Number(d.x);
            const dropY = Number.isFinite(event.y)
              ? Number(event.y)
              : Number(d.y);
            const nextContainerId = findContainerAtPoint(dropX, dropY);
            const currentContainerId = getAssignedContainerId(d);
            containerDropTargetId = null;
            if (activeNodeDragId === d.id) activeNodeDragId = null;

            if (currentContainerId !== nextContainerId) {
              onDeviceDropOnContainer?.(d.id, nextContainerId);
            }

            if (layoutKind === "force") {
              if (!event.active) simulation.alphaTarget(0);
              if (isGroupedDeviceNode(d)) {
                d.fx = d.x;
                d.fy = d.y;
              } else {
                d.fx = null;
                d.fy = null;
              }
            } else {
              d.fx = d.x;
              d.fy = d.y;
            }

            renderPositions();
          },
        ),
    );

  const draftLine = connectionDraftLayer
    .append("line")
    .attr("class", "connection-draft-line")
    .attr("display", "none");

  let connectionDrag:
    | {
      fromId: string;
      pointerX: number;
      pointerY: number;
      targetId: string | null;
    }
    | null = null;

  const findConnectionTarget = (
    fromId: string,
    pointerX: number,
    pointerY: number,
  ): string | null => {
    let nearestId: string | null = null;
    let nearestDist = Number.POSITIVE_INFINITY;
    const snapRadius = Math.max(NODE_HALF_WIDTH, NODE_HALF_HEIGHT) + 14;
    for (const node of deviceNodes) {
      if (node.id === fromId) continue;
      const x = Number(node.x);
      const y = Number(node.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const dist = Math.hypot(pointerX - x, pointerY - y);
      if (dist > snapRadius) continue;
      if (dist < nearestDist) {
        nearestId = node.id;
        nearestDist = dist;
      }
    }
    return nearestId;
  };

  const graphPointFromSourceEvent = (
    event: { sourceEvent?: unknown; x?: number; y?: number },
  ): { x: number; y: number } => {
    const source = event.sourceEvent;
    if (source && typeof source === "object") {
      const record = source as { clientX?: unknown; clientY?: unknown };
      if (
        typeof record.clientX === "number" && typeof record.clientY === "number"
      ) {
        const point = clientPointToGraph(record.clientX, record.clientY);
        if (point) return point;
      }
    }
    return {
      x: Number.isFinite(event.x) ? Number(event.x) : 0,
      y: Number.isFinite(event.y) ? Number(event.y) : 0,
    };
  };

  const connectionHandleSelection = connectionHandleLayer
    .selectAll("circle")
    .data(deviceNodes, (d: SimNode) => d.id)
    .join("circle")
    .attr("class", "connection-handle")
    .attr("r", 5)
    .call(
      d3.drag()
        .on(
          "start",
          (
            event: { sourceEvent?: unknown; x?: number; y?: number },
            d: SimNode,
          ) => {
            const point = graphPointFromSourceEvent(event);
            connectionDrag = {
              fromId: d.id,
              pointerX: point.x,
              pointerY: point.y,
              targetId: null,
            };
            suppressCanvasClickUntil = Date.now() + 180;
            const source = event.sourceEvent;
            if (source instanceof Event) {
              source.preventDefault();
              source.stopPropagation();
            }
            renderPositions();
          },
        )
        .on(
          "drag",
          (
            event: { sourceEvent?: unknown; x?: number; y?: number },
            _d: SimNode,
          ) => {
            if (!connectionDrag) return;
            const point = graphPointFromSourceEvent(event);
            connectionDrag.pointerX = point.x;
            connectionDrag.pointerY = point.y;
            connectionDrag.targetId = findConnectionTarget(
              connectionDrag.fromId,
              point.x,
              point.y,
            );
            renderPositions();
          },
        )
        .on(
          "end",
          (
            event: { sourceEvent?: unknown; x?: number; y?: number },
            _d: SimNode,
          ) => {
            if (!connectionDrag) return;
            const point = graphPointFromSourceEvent(event);
            const fromId = connectionDrag.fromId;
            const targetId = findConnectionTarget(fromId, point.x, point.y);
            connectionDrag = null;
            renderPositions();
            if (targetId && targetId !== fromId) {
              onConnectionDragCreate?.(fromId, targetId);
            }
          },
        ),
    );

  const labelSelection = labelLayer
    .selectAll("text")
    .data(deviceNodes, (d: SimNode) => d.id)
    .join("text")
    .attr("fill", GRAPH_COLORS.label)
    .attr("font-size", displaySettings.labelTextSize)
    .attr("text-anchor", "middle")
    .attr("dy", GRAPH_DEFAULTS.label.dy)
    .text((d: SimNode) => d.name);

  let onTickHook: (() => void) | null = null;

  const applyGroupedForceIsolation = () => {
    if (layoutKind !== "force") return;
    for (const node of deviceNodes) {
      if (activeNodeDragId === node.id) continue;
      if (isGroupedDeviceNode(node)) {
        const x = Number(node.x);
        const y = Number(node.y);
        node.fx = Number.isFinite(x) ? x : width / 2;
        node.fy = Number.isFinite(y) ? y : height / 2;
        zeroNodeVelocity(node);
        continue;
      }
      if (node.fx != null || node.fy != null) {
        node.fx = null;
        node.fy = null;
      }
    }
  };

  const renderPositions = () => {
    containerNodes.forEach((containerNode) =>
      layoutContainerMembers(containerNode)
    );
    applyGroupedForceIsolation();

    containerSelection
      .attr("x", (d: SimNode) => (d.x ?? width / 2) - getContainerWidth(d) / 2)
      .attr(
        "y",
        (d: SimNode) => (d.y ?? height / 2) - getContainerHeight(d) / 2,
      )
      .attr("width", (d: SimNode) => getContainerWidth(d))
      .attr("height", (d: SimNode) => getContainerHeight(d))
      .attr("fill", (d: SimNode) => getContainerFill(d))
      .classed(
        "is-drop-target",
        (d: SimNode) => d.id === containerDropTargetId,
      );
    nodeSelection
      .attr("cx", (d: SimNode) => {
        clampNodeToContainer(d);
        d.x = Math.max(
          NODE_HALF_WIDTH + GRAPH_DEFAULTS.node.boundsPadding,
          Math.min(
            width - NODE_HALF_WIDTH - GRAPH_DEFAULTS.node.boundsPadding,
            d.x || width / 2,
          ),
        );
        if (
          layoutKind === "force" &&
          activeNodeDragId !== d.id &&
          isGroupedDeviceNode(d)
        ) {
          d.fx = d.x;
          zeroNodeVelocity(d);
        }
        return d.x;
      })
      .attr("cy", (d: SimNode) => {
        clampNodeToContainer(d);
        d.y = Math.max(
          NODE_HALF_HEIGHT + GRAPH_DEFAULTS.node.boundsPadding,
          Math.min(
            height - NODE_HALF_HEIGHT - GRAPH_DEFAULTS.node.boundsPadding,
            d.y || height / 2,
          ),
        );
        if (
          layoutKind === "force" &&
          activeNodeDragId !== d.id &&
          isGroupedDeviceNode(d)
        ) {
          d.fy = d.y;
          zeroNodeVelocity(d);
        }
        return d.y;
      });

    const linkPosCache = new Map<string, {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }>();

    const linkPos = (d: SimLink) => {
      const cached = linkPosCache.get(d.id);
      if (cached) return cached;

      const source = d.source as ResolvedLinkEnd;
      const target = d.target as ResolvedLinkEnd;

      const dx = (target.x ?? 0) - (source.x ?? 0);
      const dy = (target.y ?? 0) - (source.y ?? 0);
      const length = Math.max(1e-6, Math.hypot(dx, dy));
      const nx = -dy / length;
      const ny = dx / length;

      const sourceOffset =
        (fanoutOffsetByEndpoint.get(`${d.id}|${source.id}`) ?? 0) *
        GRAPH_DEFAULTS.link.fanoutPx;
      const targetOffset =
        (fanoutOffsetByEndpoint.get(`${d.id}|${target.id}`) ?? 0) *
        GRAPH_DEFAULTS.link.fanoutPx;

      const positioned = {
        x1: source.x + nx * sourceOffset,
        y1: source.y + ny * sourceOffset,
        x2: target.x + nx * targetOffset,
        y2: target.y + ny * targetOffset,
      };
      linkPosCache.set(d.id, positioned);
      return positioned;
    };

    linkBackdropSelection
      .attr("x1", (d: SimLink) => linkPos(d).x1)
      .attr("y1", (d: SimLink) => linkPos(d).y1)
      .attr("x2", (d: SimLink) => linkPos(d).x2)
      .attr("y2", (d: SimLink) => linkPos(d).y2);

    linkSelection
      .attr("x1", (d: SimLink) => linkPos(d).x1)
      .attr("y1", (d: SimLink) => linkPos(d).y1)
      .attr("x2", (d: SimLink) => linkPos(d).x2)
      .attr("y2", (d: SimLink) => linkPos(d).y2);

    onTickHook?.();

    nodeCardFrameSelection
      .attr("x", (d: SimNode) => (d.x ?? width / 2) - NODE_HALF_WIDTH)
      .attr("y", (d: SimNode) => (d.y ?? height / 2) - NODE_HALF_HEIGHT)
      .attr("width", NODE_CARD_WIDTH)
      .attr("height", NODE_CARD_HEIGHT);

    nodeCardImageSelection
      .attr("x", (d: SimNode) => (d.x ?? width / 2) - NODE_HALF_WIDTH + 3)
      .attr("y", (d: SimNode) => (d.y ?? height / 2) - NODE_HALF_HEIGHT + 3)
      .attr("width", NODE_CARD_WIDTH - 6)
      .attr("height", NODE_CARD_HEIGHT - 6)
      .attr(
        "opacity",
        (d: SimNode) =>
          (typeof d.thumbPng === "string" && d.thumbPng.trim()) ||
            (typeof d.thumbJpg === "string" && d.thumbJpg.trim())
            ? 0.92
            : 0,
      );

    haloSelection
      .attr("cx", (d: SimNode) => d.x)
      .attr("cy", (d: SimNode) => d.y);

    containerResizeSelection
      .attr("cx", (d: SimNode) => (d.x ?? width / 2) + getContainerWidth(d) / 2)
      .attr(
        "cy",
        (d: SimNode) => (d.y ?? height / 2) + getContainerHeight(d) / 2,
      );

    connectionHandleSelection
      .attr(
        "cx",
        (d: SimNode) => (d.x ?? width / 2) + NODE_HALF_WIDTH + 2,
      )
      .attr("cy", (d: SimNode) => d.y ?? height / 2)
      .classed("is-source", (d: SimNode) => connectionDrag?.fromId === d.id)
      .classed("is-target", (d: SimNode) => connectionDrag?.targetId === d.id);

    if (connectionDrag) {
      const source = deviceNodes.find((n) => n.id === connectionDrag?.fromId);
      const sourceX = Number(source?.x);
      const sourceY = Number(source?.y);
      if (Number.isFinite(sourceX) && Number.isFinite(sourceY)) {
        draftLine
          .attr("display", null)
          .attr("x1", sourceX)
          .attr("y1", sourceY)
          .attr("x2", connectionDrag.pointerX)
          .attr("y2", connectionDrag.pointerY);
      } else {
        draftLine.attr("display", "none");
      }
    } else {
      draftLine.attr("display", "none");
    }

    labelSelection
      .attr("text-anchor", "middle")
      .attr("x", (d: SimNode) => d.x)
      .attr("y", (d: SimNode) => (d.y ?? 0) + displaySettings.labelMargin);
  };

  const renderGuides = (guides: Guide[] = []) => {
    const g = Array.isArray(guides) ? guides : [];
    lastGuides = g;
    guideLayer
      .attr("pointer-events", "none")
      .attr("opacity", g.length ? 1 : 0);

    guideLayer
      .selectAll("line")
      .data(g, (d: Guide, i: number) => `${i}:${d?.y}`)
      .join("line")
      .attr("x1", 0)
      .attr("x2", width)
      .attr("y1", (d: Guide) => d.y)
      .attr("y2", (d: Guide) => d.y)
      .attr("stroke", GRAPH_COLORS.guide)
      .attr("stroke-width", GRAPH_DEFAULTS.guides.strokeWidth)
      .attr("stroke-opacity", GRAPH_DEFAULTS.guides.strokeOpacity);
  };

  const setLayoutKind = (kind: string) => {
    layoutKind = kind || "force";
  };

  const updateStyles = (args: RendererUpdateArgs) => {
    linkBackdropSelection
      .attr(
        "stroke-width",
        (d: SimLink) => Math.max(3.2, Number(args.getLinkWidth(d)) + 2.2),
      )
      .attr(
        "stroke-dasharray",
        (d: SimLink) => args.getLinkDasharray(d) ?? null,
      )
      .attr("opacity", (d: SimLink) =>
        clampNumber(
          (Number(args.getLinkOpacity(d)) * 0.55 + 0.2) *
            displaySettings.edgeOpacity,
          0,
          0.85,
        ));

    const linkT = linkSelection.interrupt().transition().duration(
      GRAPH_DEFAULTS.transitionMs,
    ).ease(
      d3.easeCubicOut,
    );

    linkT
      .attr("stroke", args.getLinkStroke)
      .attr("stroke-width", args.getLinkWidth)
      .attr("stroke-dasharray", args.getLinkDasharray)
      .attr("opacity", (d: SimLink) =>
        clampNumber(
          Number(args.getLinkOpacity(d)) * displaySettings.edgeOpacity,
          0,
          1,
        ));

    args.afterLinkStyle?.(displaySettings.edgeOpacity);

    haloSelection
      .attr("r", (d: SimNode) => args.getHalo(d).r)
      .attr("stroke", (d: SimNode) => args.getHalo(d).stroke)
      .attr("stroke-width", (d: SimNode) => args.getHalo(d).strokeWidth)
      .attr("opacity", (d: SimNode) => args.getHalo(d).opacity);

    nodeCardFrameSelection
      .attr("fill", "rgba(11, 18, 32, 0.92)")
      .attr("stroke", (d: SimNode) => getNodeFill(d))
      .attr("stroke-width", 1.5)
      .style("filter", args.getNodeFilter);

    nodeSelection
      .attr("r", GRAPH_DEFAULTS.node.radius)
      .attr("fill", (d: SimNode) => getNodeFill(d))
      .attr("stroke", GRAPH_COLORS.nodeStroke)
      .attr("stroke-width", GRAPH_DEFAULTS.node.strokeWidth)
      // Hide circular hitbox; visual card lives in nodeCardLayer.
      .attr("opacity", 0.001)
      .style("filter", args.getNodeFilter);

    labelSelection.attr("opacity", args.getLabelOpacity);
  };

  const setDisplaySettings = (
    nextSettings: Partial<GraphDisplaySettings>,
  ): GraphDisplaySettings => {
    displaySettings = {
      edgeOpacity: clampNumber(
        Number(nextSettings.edgeOpacity ?? displaySettings.edgeOpacity),
        0.1,
        1,
      ),
      labelTextSize: clampNumber(
        Number(nextSettings.labelTextSize ?? displaySettings.labelTextSize),
        9,
        24,
      ),
      labelMargin: clampNumber(
        Number(nextSettings.labelMargin ?? displaySettings.labelMargin),
        8,
        52,
      ),
    };
    labelSelection.attr("font-size", displaySettings.labelTextSize);
    return { ...displaySettings };
  };

  simulation.on("tick", renderPositions);

  const resize = (next: { width: number; height: number }) => {
    const requestedWidth = Math.max(1, Math.floor(Number(next?.width) || 0));
    const requestedHeight = Math.max(1, Math.floor(Number(next?.height) || 0));
    const minimumCanvasSize = getMinimumCanvasSize();
    const w = Math.max(requestedWidth, minimumCanvasSize.width);
    const h = Math.max(requestedHeight, minimumCanvasSize.height);
    if (!w || !h) return;

    width = w;
    height = h;

    svgSel
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    simulation.force("center", d3.forceCenter(width / 2, height / 2));
    if (layoutKind === "force") simulation.alpha(0.5).restart();

    renderGuides(lastGuides);
    renderPositions();
  };

  const destroy = () => {
    stopMiddlePan("destroy");
    detachMiddlePanCaptureListeners();
    simulation.stop();
    svgSel.on(".marquee", null);
    svgSel.on(".zoom", null);
    svgSel.on(".middle-pan", null);
    svgSel.selectAll("*").remove();
  };

  return {
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    nodes,
    links,
    getNodePositions,
    getViewportCenter,
    getViewportTransform,
    setViewportTransform,
    clientPointToGraph,
    simulation,
    vizLayer,
    linkSelection,
    renderPositions,
    renderGuides,
    resize,
    setLayoutKind,
    setDisplaySettings,
    setOnTickHook: (fn: (() => void) | null) => {
      onTickHook = fn;
    },
    updateStyles,
    destroy,
  };
}
