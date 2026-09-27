import {
  createViewportSpace,
  screenLengthToLogical,
  screenToLogical,
} from '../coordinates/viewport-space.js';

export const DRAWGRID_PARTICLE_LOGICAL_WIDTH = 800;
export const DRAWGRID_PARTICLE_LOGICAL_HEIGHT = 600;
export const DRAWGRID_PARTICLE_BOUNDS = Object.freeze({ left: 0, top: 0, width: 800, height: 600 });

export function createDrawGridParticleViewportSpace({ left = 0, top = 0, width, height, backingScale = 1 } = {}) {
  return createViewportSpace({
    logicalWidth: DRAWGRID_PARTICLE_LOGICAL_WIDTH,
    logicalHeight: DRAWGRID_PARTICLE_LOGICAL_HEIGHT,
    displayRect: { left, top, width, height },
    backingScale,
  });
}

export function drawGridParticleSourceToLogical(point, sourceSize) {
  return screenToLogical(createDrawGridParticleViewportSpace({
    width: sourceSize?.width,
    height: sourceSize?.height,
  }), point);
}

export function drawGridParticleSourceLengthToLogical(length, sourceSize) {
  return screenLengthToLogical(createDrawGridParticleViewportSpace({
    width: sourceSize?.width,
    height: sourceSize?.height,
  }), length);
}
