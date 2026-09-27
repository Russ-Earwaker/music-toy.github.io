import { createViewportSpace, screenToLogical } from './coordinates/viewport-space.js';

// Authored Loop Grid geometry: 8 × 59px cubes, seven 4px gaps,
// one 59px side margin at each edge, and a three-cube field height.
export const SIMPLE_RHYTHM_PARTICLE_LOGICAL_WIDTH = 618;
export const SIMPLE_RHYTHM_PARTICLE_LOGICAL_HEIGHT = 177;
export const SIMPLE_RHYTHM_PARTICLE_BOUNDS = Object.freeze({
  left: 0,
  top: 0,
  width: SIMPLE_RHYTHM_PARTICLE_LOGICAL_WIDTH,
  height: SIMPLE_RHYTHM_PARTICLE_LOGICAL_HEIGHT,
});

export function createSimpleRhythmParticleViewportSpace({ left = 0, top = 0, width, height, backingScale = 1 } = {}) {
  return createViewportSpace({
    logicalWidth: SIMPLE_RHYTHM_PARTICLE_LOGICAL_WIDTH,
    logicalHeight: SIMPLE_RHYTHM_PARTICLE_LOGICAL_HEIGHT,
    displayRect: { left, top, width, height },
    backingScale,
  });
}

export function simpleRhythmParticleClientToLogical(point, displayRect) {
  const viewport = createSimpleRhythmParticleViewportSpace({
    left: displayRect.left,
    top: displayRect.top,
    width: displayRect.width,
    height: displayRect.height,
  });
  return screenToLogical(viewport, point);
}
