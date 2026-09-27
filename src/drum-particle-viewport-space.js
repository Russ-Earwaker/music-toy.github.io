import { createViewportSpace } from './coordinates/viewport-space.js';

export const DRUM_PARTICLE_LOGICAL_WIDTH = 400;
export const DRUM_PARTICLE_LOGICAL_HEIGHT = 400;

export function createDrumParticleViewportSpace({ left = 0, top = 0, width, height, backingScale = 1 } = {}) {
  return createViewportSpace({
    logicalWidth: DRUM_PARTICLE_LOGICAL_WIDTH,
    logicalHeight: DRUM_PARTICLE_LOGICAL_HEIGHT,
    displayRect: { left, top, width, height },
    backingScale,
  });
}

