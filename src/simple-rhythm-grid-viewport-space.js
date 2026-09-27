import {
  containsContentPoint,
  createViewportSpace,
  logicalLengthToScreen,
  logicalToScreen,
  screenToLogical,
} from './coordinates/viewport-space.js';

export const SIMPLE_RHYTHM_GRID_COLUMNS = 8;
export const SIMPLE_RHYTHM_GRID_CUBE_SIZE = 59;
export const SIMPLE_RHYTHM_GRID_GAP = 4;
export const SIMPLE_RHYTHM_GRID_MARGIN = 59;
export const SIMPLE_RHYTHM_GRID_LOGICAL_WIDTH = 618;
export const SIMPLE_RHYTHM_GRID_LOGICAL_HEIGHT = 177;

export const SIMPLE_RHYTHM_GRID_BOUNDS = Object.freeze({
  left: 0,
  top: 0,
  width: SIMPLE_RHYTHM_GRID_LOGICAL_WIDTH,
  height: SIMPLE_RHYTHM_GRID_LOGICAL_HEIGHT,
});

export const SIMPLE_RHYTHM_GRID_GEOMETRY = Object.freeze({
  columns: SIMPLE_RHYTHM_GRID_COLUMNS,
  cubeSize: SIMPLE_RHYTHM_GRID_CUBE_SIZE,
  gap: SIMPLE_RHYTHM_GRID_GAP,
  stride: SIMPLE_RHYTHM_GRID_CUBE_SIZE + SIMPLE_RHYTHM_GRID_GAP,
  originX: SIMPLE_RHYTHM_GRID_MARGIN,
  originY: SIMPLE_RHYTHM_GRID_MARGIN,
});

export function createSimpleRhythmGridViewportSpace({ left = 0, top = 0, width, height, backingScale = 1 } = {}) {
  return createViewportSpace({
    logicalWidth: SIMPLE_RHYTHM_GRID_LOGICAL_WIDTH,
    logicalHeight: SIMPLE_RHYTHM_GRID_LOGICAL_HEIGHT,
    displayRect: { left, top, width, height },
    backingScale,
  });
}

export function getSimpleRhythmCubeRect(column) {
  const index = Math.max(0, Math.min(SIMPLE_RHYTHM_GRID_COLUMNS - 1, Math.trunc(Number(column) || 0)));
  return Object.freeze({
    x: SIMPLE_RHYTHM_GRID_GEOMETRY.originX + index * SIMPLE_RHYTHM_GRID_GEOMETRY.stride,
    y: SIMPLE_RHYTHM_GRID_GEOMETRY.originY,
    width: SIMPLE_RHYTHM_GRID_CUBE_SIZE,
    height: SIMPLE_RHYTHM_GRID_CUBE_SIZE,
  });
}

export function hitSimpleRhythmCube(point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return -1;
  if (y < SIMPLE_RHYTHM_GRID_GEOMETRY.originY || y >= SIMPLE_RHYTHM_GRID_GEOMETRY.originY + SIMPLE_RHYTHM_GRID_CUBE_SIZE) return -1;

  const relativeX = x - SIMPLE_RHYTHM_GRID_GEOMETRY.originX;
  if (relativeX < 0) return -1;
  const column = Math.floor(relativeX / SIMPLE_RHYTHM_GRID_GEOMETRY.stride);
  if (column < 0 || column >= SIMPLE_RHYTHM_GRID_COLUMNS) return -1;
  const withinCell = relativeX - column * SIMPLE_RHYTHM_GRID_GEOMETRY.stride;
  return withinCell >= 0 && withinCell < SIMPLE_RHYTHM_GRID_CUBE_SIZE ? column : -1;
}

export function simpleRhythmGridClientToLogical(canvas, point) {
  const rect = canvas?.getBoundingClientRect?.();
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  const viewport = createSimpleRhythmGridViewportSpace({
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  });
  if (!containsContentPoint(viewport, point)) return null;
  return screenToLogical(viewport, point);
}

export function simpleRhythmGridLogicalToDisplay(viewport, point) {
  return logicalToScreen(viewport, point);
}

export function simpleRhythmGridLogicalLengthToDisplay(viewport, length) {
  return logicalLengthToScreen(viewport, length);
}
