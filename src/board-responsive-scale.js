export const BOARD_REFERENCE_WIDTH = 1600;
export const BOARD_REFERENCE_HEIGHT = 900;

function positive(value, fallback = 1) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function computeResponsiveBaseScale(
  viewportWidth,
  viewportHeight,
  referenceWidth = BOARD_REFERENCE_WIDTH,
  referenceHeight = BOARD_REFERENCE_HEIGHT,
) {
  const width = positive(viewportWidth);
  const height = positive(viewportHeight);
  const refWidth = positive(referenceWidth, BOARD_REFERENCE_WIDTH);
  const refHeight = positive(referenceHeight, BOARD_REFERENCE_HEIGHT);
  return Math.min(1, width / refWidth, height / refHeight);
}

export function composeEffectiveBoardScale(userBoardZoom, responsiveBaseScale) {
  return positive(userBoardZoom) * positive(responsiveBaseScale);
}

export function screenDeltaToWorldDelta(delta, effectiveBoardScale) {
  const scale = positive(effectiveBoardScale);
  return {
    x: (Number(delta?.x) || 0) / scale,
    y: (Number(delta?.y) || 0) / scale,
  };
}

export function screenToWorldPoint(point, transform) {
  const scale = positive(transform?.effectiveBoardScale ?? transform?.scale);
  return {
    x: ((Number(point?.x) || 0) - (Number(transform?.x) || 0)) / scale,
    y: ((Number(point?.y) || 0) - (Number(transform?.y) || 0)) / scale,
  };
}

export function worldToScreenPoint(point, transform) {
  const scale = positive(transform?.effectiveBoardScale ?? transform?.scale);
  return {
    x: (Number(point?.x) || 0) * scale + (Number(transform?.x) || 0),
    y: (Number(point?.y) || 0) * scale + (Number(transform?.y) || 0),
  };
}

// Translation is expressed in screen pixels. Preserve the world point that was
// under the old viewport centre, then place it under the new viewport centre.
export function preserveWorldPointAtViewportCenter({
  oldCenter,
  newCenter,
  layoutOffset = { x: 0, y: 0 },
  translation = { x: 0, y: 0 },
  oldEffectiveScale,
  newEffectiveScale,
}) {
  const layoutX = Number(layoutOffset?.x) || 0;
  const layoutY = Number(layoutOffset?.y) || 0;
  const oldScale = positive(oldEffectiveScale);
  const newScale = positive(newEffectiveScale);
  const oldX = Number(translation?.x) || 0;
  const oldY = Number(translation?.y) || 0;
  const worldPoint = {
    x: ((Number(oldCenter?.x) || 0) - layoutX - oldX) / oldScale,
    y: ((Number(oldCenter?.y) || 0) - layoutY - oldY) / oldScale,
  };
  return {
    worldPoint,
    translation: {
      x: (Number(newCenter?.x) || 0) - layoutX - worldPoint.x * newScale,
      y: (Number(newCenter?.y) || 0) - layoutY - worldPoint.y * newScale,
    },
  };
}
