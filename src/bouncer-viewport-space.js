import { createViewportSpace, logicalToScreen, screenToLogical } from './coordinates/viewport-space.js';

export const BOUNCER_LOGICAL_WIDTH = 300;
export const BOUNCER_LOGICAL_HEIGHT = 300;
export const BOUNCER_LOGICAL_SIZE = Object.freeze({ width: 300, height: 300 });

export function createBouncerViewportSpace({ left = 0, top = 0, width, height, backingScale = 1 } = {}) {
  return createViewportSpace({
    logicalWidth: BOUNCER_LOGICAL_WIDTH,
    logicalHeight: BOUNCER_LOGICAL_HEIGHT,
    displayRect: { left, top, width, height },
    backingScale,
  });
}

export function bouncerLogicalToDisplay(viewportSpace, point) {
  return logicalToScreen(viewportSpace, point);
}

export function bouncerDisplayToLogical(viewportSpace, point) {
  return screenToLogical(viewportSpace, point);
}

export function bouncerClientToLogical(canvas, point) {
  const rect = canvas?.getBoundingClientRect?.();
  if (!rect) return { x: 0, y: 0 };
  return bouncerDisplayToLogical(createBouncerViewportSpace({
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  }), point);
}

export function getBouncerRenderTransform({ displayWidth, displayHeight, backingWidth, backingHeight } = {}) {
  const width = Math.max(1, Number(displayWidth) || 1);
  const height = Math.max(1, Number(displayHeight) || 1);
  const viewport = createBouncerViewportSpace({ width, height });
  const backingScaleX = Math.max(0.001, (Number(backingWidth) || width) / width);
  const backingScaleY = Math.max(0.001, (Number(backingHeight) || height) / height);
  return Object.freeze({
    scaleX: viewport.presentationScale * backingScaleX,
    scaleY: viewport.presentationScale * backingScaleY,
    offsetX: viewport.contentRect.left * backingScaleX,
    offsetY: viewport.contentRect.top * backingScaleY,
    viewport,
  });
}

export function reconstructBouncerBlockFromAnchor(anchor, logicalSize = BOUNCER_LOGICAL_SIZE) {
  const width = Math.max(1, Number(logicalSize?.width) || BOUNCER_LOGICAL_WIDTH);
  const height = Math.max(1, Number(logicalSize?.height) || BOUNCER_LOGICAL_HEIGHT);
  return Object.freeze({
    x: Math.round((Number(anchor?._fx) || 0) * width),
    y: Math.round((Number(anchor?._fy) || 0) * height),
    w: Math.round((Number(anchor?._fw) || 0) * width),
    h: Math.round((Number(anchor?._fh) || 0) * height),
  });
}
