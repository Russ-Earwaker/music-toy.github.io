import { createViewportSpace, logicalToScreen, screenToLogical } from './coordinates/viewport-space.js';

export const WHEEL_LOGICAL_WIDTH = 300;
export const WHEEL_LOGICAL_HEIGHT = 300;
export const WHEEL_STEPS = 16;

export function createWheelViewportSpace({ left = 0, top = 0, width, height, backingScale = 1 } = {}) {
  return createViewportSpace({
    logicalWidth: WHEEL_LOGICAL_WIDTH,
    logicalHeight: WHEEL_LOGICAL_HEIGHT,
    displayRect: { left, top, width, height },
    backingScale,
  });
}

export function wheelLogicalToDisplay(viewportSpace, point) {
  return logicalToScreen(viewportSpace, point);
}

export function wheelDisplayToLogical(viewportSpace, point) {
  return screenToLogical(viewportSpace, point);
}

export function wheelClientToLogical(canvas, point) {
  const rect = canvas?.getBoundingClientRect?.();
  if (!rect) return { x: 0, y: 0 };
  return wheelDisplayToLogical(createWheelViewportSpace({
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  }), point);
}

export function getWheelGeometry() {
  const size = Math.min(WHEEL_LOGICAL_WIDTH, WHEEL_LOGICAL_HEIGHT);
  return Object.freeze({
    cx: WHEEL_LOGICAL_WIDTH / 2,
    cy: WHEEL_LOGICAL_HEIGHT / 2,
    Rmin: size * 0.22,
    Rout: size * 0.42,
    Rbtn: Math.max(10, size * 0.045),
  });
}

export function wheelSpokeAngle(index, steps = WHEEL_STEPS) {
  return -Math.PI / 2 + (index / steps) * Math.PI * 2;
}

export function wheelSpokeEnd(index, geometry = getWheelGeometry(), steps = WHEEL_STEPS) {
  const angle = wheelSpokeAngle(index, steps);
  return {
    x: geometry.cx + Math.cos(angle) * geometry.Rout,
    y: geometry.cy + Math.sin(angle) * geometry.Rout,
  };
}

export function hitWheelSpokeButton(point, geometry = getWheelGeometry(), steps = WHEEL_STEPS) {
  let best = -1;
  let bestDistance = geometry.Rbtn * 1.3;
  for (let index = 0; index < steps; index += 1) {
    const end = wheelSpokeEnd(index, geometry, steps);
    const distance = Math.hypot(point.x - end.x, point.y - end.y);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  return best;
}

