import {
  containsContentPoint,
  createViewportSpace,
  logicalLengthToScreen,
  logicalToScreen,
  screenToLogical,
} from '../coordinates/viewport-space.js';

export const DRAWGRID_LOGICAL_WIDTH = 800;
export const DRAWGRID_LOGICAL_HEIGHT = 600;
export const DRAWGRID_SAFE_AREA_FRACTION = 0.05;
export const DRAWGRID_SAFE_AREA_MIN = 12;
export const DRAWGRID_STROKE_SPACE_LOGICAL = 'drawgrid-logical-v1';

export const DRAWGRID_LOGICAL_SIZE = Object.freeze({
  width: DRAWGRID_LOGICAL_WIDTH,
  height: DRAWGRID_LOGICAL_HEIGHT,
});

export const DRAWGRID_LOGICAL_CENTER = Object.freeze({ x: 400, y: 300 });

export const DRAWGRID_LOGICAL_BOUNDS = Object.freeze({
  left: 0,
  top: 0,
  width: DRAWGRID_LOGICAL_WIDTH,
  height: DRAWGRID_LOGICAL_HEIGHT,
});

export function getDrawGridLogicalSafeArea() {
  return Math.max(
    DRAWGRID_SAFE_AREA_MIN,
    Math.round(DRAWGRID_SAFE_AREA_FRACTION * Math.min(DRAWGRID_LOGICAL_WIDTH, DRAWGRID_LOGICAL_HEIGHT)),
  );
}

const safeArea = getDrawGridLogicalSafeArea();

export const DRAWGRID_LOGICAL_GRID_RECT = Object.freeze({
  left: safeArea,
  top: safeArea,
  width: DRAWGRID_LOGICAL_WIDTH - (safeArea * 2),
  height: DRAWGRID_LOGICAL_HEIGHT - (safeArea * 2),
});

export const DRAWGRID_NODE_DRAG_THRESHOLD_LOGICAL = 6;

export function createDrawGridLogicalGeometry({ cols = 8, rows = 12 } = {}) {
  const columnCount = Math.max(1, Math.trunc(Number(cols) || 8));
  const rowCount = Math.max(1, Math.trunc(Number(rows) || 12));
  const gridRect = Object.freeze({
    x: DRAWGRID_LOGICAL_GRID_RECT.left,
    y: DRAWGRID_LOGICAL_GRID_RECT.top,
    w: DRAWGRID_LOGICAL_GRID_RECT.width,
    h: DRAWGRID_LOGICAL_GRID_RECT.height,
  });
  const cellWidth = gridRect.w / columnCount;
  const cellHeight = gridRect.h / rowCount;
  const cell = Math.max(4, Math.min(cellWidth, cellHeight));
  const strokeWidth = Math.max(2, Math.min(cell * 0.8, 60));
  return Object.freeze({
    gridRect,
    cols: columnCount,
    rows: rowCount,
    topPad: 0,
    cellWidth,
    cellHeight,
    strokeWidth,
    liveMarkerSize: Math.max(1, Math.floor(strokeWidth / 6)),
    nodeRadius: Math.max(4, cell * 0.20),
    nodeDragThreshold: DRAWGRID_NODE_DRAG_THRESHOLD_LOGICAL,
    gridLineWidth: Math.max(1, Math.min(cell * 0.03, 8)),
    overlayStrokeExtra: 1.25,
    overlayClearPadding: Math.min(24, Math.max(4, strokeWidth * 0.6)),
    tutorialRadius: Math.max(6, cell * 0.55),
    playheadGradientWidth: Math.round(Math.max(0.8 * cellWidth, Math.min(gridRect.w * 0.08, 2.2 * cellWidth))),
    playheadSimpleLineWidth: Math.max(2, cellWidth * 0.08),
    playheadLineWidth: 3,
  });
}

export function getDrawGridLogicalNodeCenter(geometry, col, row) {
  return {
    x: geometry.gridRect.x + (Number(col) + 0.5) * geometry.cellWidth,
    y: geometry.gridRect.y + geometry.topPad + (Number(row) + 0.5) * geometry.cellHeight,
  };
}

export function hitTestDrawGridLogicalCell(geometry, point, col, row) {
  const left = geometry.gridRect.x + Number(col) * geometry.cellWidth;
  const top = geometry.gridRect.y + geometry.topPad + Number(row) * geometry.cellHeight;
  return point.x >= left && point.x <= left + geometry.cellWidth
    && point.y >= top && point.y <= top + geometry.cellHeight;
}

export function drawGridLogicalRowFromPoint(geometry, point) {
  return Math.max(0, Math.min(
    geometry.rows - 1,
    Math.floor((point.y - (geometry.gridRect.y + geometry.topPad)) / geometry.cellHeight),
  ));
}

export function createDrawGridViewportSpace({ left = 0, top = 0, width, height, backingScale = 1 } = {}) {
  return createViewportSpace({
    logicalWidth: DRAWGRID_LOGICAL_WIDTH,
    logicalHeight: DRAWGRID_LOGICAL_HEIGHT,
    displayRect: { left, top, width, height },
    backingScale,
  });
}

export function drawGridClientToLogical(viewportSpace, point) {
  return screenToLogical(viewportSpace, point);
}

export function drawGridClientToStrokeLogical(viewportSpace, point) {
  if (!containsContentPoint(viewportSpace, point)) return null;
  return screenToLogical(viewportSpace, point);
}

export function drawGridLogicalToDisplay(viewportSpace, point) {
  return logicalToScreen(viewportSpace, point);
}

export function drawGridLogicalLengthToDisplay(viewportSpace, length) {
  return logicalLengthToScreen(viewportSpace, length);
}

export function drawGridLogicalPointToNormalized(point) {
  return {
    nx: (Number(point?.x) - DRAWGRID_LOGICAL_GRID_RECT.left) / DRAWGRID_LOGICAL_GRID_RECT.width,
    ny: (Number(point?.y) - DRAWGRID_LOGICAL_GRID_RECT.top) / DRAWGRID_LOGICAL_GRID_RECT.height,
  };
}

export function isDrawGridLogicalStroke(stroke) {
  return stroke?.coordinateSpace === DRAWGRID_STROKE_SPACE_LOGICAL;
}

export function createDrawGridViewportDebugSnapshot(viewportSpace, sampleClientPoint = null) {
  const clientPoint = sampleClientPoint || {
    x: viewportSpace.contentRect.left + (viewportSpace.contentRect.width * 0.5),
    y: viewportSpace.contentRect.top + (viewportSpace.contentRect.height * 0.5),
  };
  const logicalPoint = drawGridClientToLogical(viewportSpace, clientPoint);
  const projectedPoint = drawGridLogicalToDisplay(viewportSpace, logicalPoint);
  const currentCssPoint = Object.freeze({
    x: clientPoint.x - viewportSpace.displayRect.left,
    y: clientPoint.y - viewportSpace.displayRect.top,
  });
  const projectedCssPoint = Object.freeze({
    x: projectedPoint.x - viewportSpace.displayRect.left,
    y: projectedPoint.y - viewportSpace.displayRect.top,
  });
  return Object.freeze({
    logicalSize: DRAWGRID_LOGICAL_SIZE,
    logicalCenter: DRAWGRID_LOGICAL_CENTER,
    logicalBounds: DRAWGRID_LOGICAL_BOUNDS,
    logicalGridRect: DRAWGRID_LOGICAL_GRID_RECT,
    displayRect: viewportSpace.displayRect,
    contentRect: viewportSpace.contentRect,
    presentationScale: viewportSpace.presentationScale,
    backingScale: viewportSpace.backingScale,
    sample: Object.freeze({
      client: Object.freeze({ x: clientPoint.x, y: clientPoint.y }),
      currentCss: currentCssPoint,
      logical: Object.freeze({ x: logicalPoint.x, y: logicalPoint.y }),
      projectedDisplay: Object.freeze({ x: projectedPoint.x, y: projectedPoint.y }),
      projectedCss: projectedCssPoint,
    }),
  });
}
