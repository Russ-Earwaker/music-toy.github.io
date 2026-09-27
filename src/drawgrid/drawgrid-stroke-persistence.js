import {
  DRAWGRID_LOGICAL_GRID_RECT,
  DRAWGRID_STROKE_SPACE_LOGICAL,
  drawGridLogicalPointToNormalized,
} from './drawgrid-viewport-space.js';

export const DRAWGRID_PERSISTENCE_VERSION = 2;
export const DRAWGRID_PERSISTENCE_COORDINATE_SPACE = 'drawgrid-logical-800x600';

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const normalized = (value) => finite(value);

export function drawGridNormalizedPointToLogical(point) {
  return {
    x: DRAWGRID_LOGICAL_GRID_RECT.left + normalized(point?.nx) * DRAWGRID_LOGICAL_GRID_RECT.width,
    y: DRAWGRID_LOGICAL_GRID_RECT.top + normalized(point?.ny) * DRAWGRID_LOGICAL_GRID_RECT.height,
  };
}

export function upgradeDrawGridStroke(stroke, { fallbackColor } = {}) {
  const source = stroke && typeof stroke === 'object' ? stroke : {};
  let pts;
  let ptsN;

  if (Array.isArray(source.ptsN) || Array.isArray(source.__ptsN)) {
    const normalized = Array.isArray(source.ptsN) ? source.ptsN : source.__ptsN;
    ptsN = normalized.map((point) => ({ nx: finite(point?.nx), ny: finite(point?.ny) }));
    pts = ptsN.map(drawGridNormalizedPointToLogical);
  } else {
    // Old unversioned saves stored panel/CSS-local points. Their authored
    // reference coordinate system was 800x600, so import is an identity mapping
    // into the fixed logical surface. The legacy representation ends here.
    pts = Array.isArray(source.pts)
      ? source.pts.map((point) => ({ x: finite(point?.x), y: finite(point?.y) }))
      : [];
    ptsN = pts.map(drawGridLogicalPointToNormalized);
  }

  return {
    pts,
    __ptsN: ptsN,
    coordinateSpace: DRAWGRID_STROKE_SPACE_LOGICAL,
    color: source.color || fallbackColor,
    isSpecial: !!source.isSpecial,
    generatorId: typeof source.generatorId === 'number' ? source.generatorId : undefined,
    overlayColorize: !!source.overlayColorize,
  };
}

export function upgradeDrawGridStrokes(strokes, options) {
  return Array.isArray(strokes) ? strokes.map((stroke) => upgradeDrawGridStroke(stroke, options)) : [];
}
