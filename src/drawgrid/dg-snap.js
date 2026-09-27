// DrawGrid logical snap-to-grid adapter.

import { snapDrawGridStrokeLogical } from './drawgrid-logical-snap.js';

const LOGICAL_SNAP_CACHE_VERSION = 'drawgrid-logical-snap-v1';

export function createDgSnap({ state } = {}) {
  const s = state;

  function snapToGridFromStroke(stroke) {
    if (
      stroke.cachedNodes
      && stroke.cachedCols === s.cols
      && stroke.cachedSnapVersion === LOGICAL_SNAP_CACHE_VERSION
    ) {
      return stroke.cachedNodes;
    }

    const result = snapDrawGridStrokeLogical({
      stroke,
      geometry: s.logicalGeometry,
      strokeWidth: s.logicalGeometry?.strokeWidth,
      autoTune: s.autoTune,
      chromaticPalette: s.chromaticPalette,
      pentatonicPalette: s.pentatonicPalette,
    });

    try {
      stroke.cachedNodes = result;
      stroke.cachedCols = s.cols;
      stroke.cachedSnapVersion = LOGICAL_SNAP_CACHE_VERSION;
    } catch {}
    return result;
  }

  return { snapToGridFromStroke };
}
