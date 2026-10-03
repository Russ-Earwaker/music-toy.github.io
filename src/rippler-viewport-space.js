import { createViewportSpace, logicalToScreen, screenToLogical } from './coordinates/viewport-space.js';

export const RIPPLER_LOGICAL_WIDTH = 300;
export const RIPPLER_LOGICAL_HEIGHT = 300;
export const RIPPLER_EDGE = 4;
export const RIPPLER_BLOCK_SIZE = 42;

export function createRipplerViewportSpace({ left = 0, top = 0, width, height, backingScale = 1 } = {}) {
  return createViewportSpace({
    logicalWidth: RIPPLER_LOGICAL_WIDTH,
    logicalHeight: RIPPLER_LOGICAL_HEIGHT,
    displayRect: { left, top, width, height },
    backingScale,
  });
}

export function ripplerLogicalToDisplay(viewportSpace, point) {
  return logicalToScreen(viewportSpace, point);
}

export function ripplerDisplayToLogical(viewportSpace, point) {
  return screenToLogical(viewportSpace, point);
}

export function ripplerClientToLogical(canvas, point) {
  const rect = canvas?.getBoundingClientRect?.();
  if (!rect) return { x: 0, y: 0 };
  return ripplerDisplayToLogical(createRipplerViewportSpace({
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  }), point);
}

export function ripplerNormalizedToLogical({ nx = 0.5, ny = 0.5 } = {}) {
  const spanX = RIPPLER_LOGICAL_WIDTH - RIPPLER_EDGE * 2;
  const spanY = RIPPLER_LOGICAL_HEIGHT - RIPPLER_EDGE * 2;
  return {
    x: RIPPLER_EDGE + Math.max(0, Math.min(1, Number(nx))) * spanX,
    y: RIPPLER_EDGE + Math.max(0, Math.min(1, Number(ny))) * spanY,
  };
}

export function ripplerLogicalToNormalized({ x = 0, y = 0 } = {}) {
  const spanX = RIPPLER_LOGICAL_WIDTH - RIPPLER_EDGE * 2;
  const spanY = RIPPLER_LOGICAL_HEIGHT - RIPPLER_EDGE * 2;
  return {
    nx: Math.max(0, Math.min(1, (Number(x) - RIPPLER_EDGE) / spanX)),
    ny: Math.max(0, Math.min(1, (Number(y) - RIPPLER_EDGE) / spanY)),
  };
}

export function reconstructRipplerBlock(block, size = RIPPLER_BLOCK_SIZE) {
  const centre = ripplerNormalizedToLogical(block);
  const logicalSize = Math.max(1, Number(size) || RIPPLER_BLOCK_SIZE);
  const minX = RIPPLER_EDGE;
  const minY = RIPPLER_EDGE;
  const maxX = RIPPLER_LOGICAL_WIDTH - RIPPLER_EDGE - logicalSize;
  const maxY = RIPPLER_LOGICAL_HEIGHT - RIPPLER_EDGE - logicalSize;
  return {
    x: Math.min(Math.max(centre.x - logicalSize / 2, minX), maxX),
    y: Math.min(Math.max(centre.y - logicalSize / 2, minY), maxY),
    w: logicalSize,
    h: logicalSize,
  };
}

export function doesRippleIntersectBlock({ source, radius, previousRadius = radius, block, blockRect, band = 9 } = {}) {
  const rect = blockRect || reconstructRipplerBlock(block);
  const centreX = rect.x + rect.w / 2;
  const centreY = rect.y + rect.h / 2;
  const dx = Math.max(Math.abs(centreX - source.x) - rect.w / 2, 0);
  const dy = Math.max(Math.abs(centreY - source.y) - rect.h / 2, 0);
  const distance = Math.hypot(dx, dy);
  const inner = Math.min(previousRadius, radius) - band;
  const outer = Math.max(previousRadius, radius) + band;
  return distance >= inner && distance <= outer;
}
