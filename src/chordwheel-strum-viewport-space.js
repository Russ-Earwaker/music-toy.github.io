import { createViewportSpace, screenToLogical } from './coordinates/viewport-space.js';

export const CHORDWHEEL_STRUM_LOGICAL_WIDTH = 380;
export const CHORDWHEEL_STRUM_LOGICAL_HEIGHT = 380;

export function createChordWheelStrumViewportSpace({ left = 0, top = 0, width, height, backingScale = 1 } = {}) {
  return createViewportSpace({
    logicalWidth: CHORDWHEEL_STRUM_LOGICAL_WIDTH,
    logicalHeight: CHORDWHEEL_STRUM_LOGICAL_HEIGHT,
    displayRect: { left, top, width, height },
    backingScale,
  });
}

export function chordWheelStrumClientToLogical(clientPoint, displayRect) {
  const viewport = createChordWheelStrumViewportSpace({
    left: displayRect.left,
    top: displayRect.top,
    width: displayRect.width,
    height: displayRect.height,
  });
  return screenToLogical(viewport, clientPoint);
}
