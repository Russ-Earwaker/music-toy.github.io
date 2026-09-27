// Renderer-neutral coordinate mapping between a logical viewport and its
// uniformly contained presentation rectangle. All values are CSS/client-space
// numbers except backingScale, which is metadata for renderers only.

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function positive(value, fallback = 1) {
  const number = finite(value, fallback);
  return number > 0 ? number : fallback;
}

function freezeRect(rect = null) {
  return Object.freeze({
    left: finite(rect?.left ?? rect?.x, 0),
    top: finite(rect?.top ?? rect?.y, 0),
    width: positive(rect?.width, 1),
    height: positive(rect?.height, 1),
  });
}

function freezeInsets(insets = null) {
  return Object.freeze({
    top: Math.max(0, finite(insets?.top, 0)),
    right: Math.max(0, finite(insets?.right, 0)),
    bottom: Math.max(0, finite(insets?.bottom, 0)),
    left: Math.max(0, finite(insets?.left, 0)),
  });
}

export function createViewportSpace(options = {}) {
  const displayRect = freezeRect(options.displayRect);
  const logicalWidth = positive(options.logicalWidth, displayRect.width);
  const logicalHeight = positive(options.logicalHeight, displayRect.height);
  const presentationScale = Math.min(
    displayRect.width / logicalWidth,
    displayRect.height / logicalHeight,
  );
  const contentWidth = logicalWidth * presentationScale;
  const contentHeight = logicalHeight * presentationScale;
  const contentRect = Object.freeze({
    left: displayRect.left + ((displayRect.width - contentWidth) * 0.5),
    top: displayRect.top + ((displayRect.height - contentHeight) * 0.5),
    width: contentWidth,
    height: contentHeight,
  });

  return Object.freeze({
    logicalWidth,
    logicalHeight,
    displayRect,
    contentRect,
    presentationScale,
    backingScale: positive(options.backingScale, 1),
    safeInsets: freezeInsets(options.safeInsets),
  });
}

export function resizeViewportSpace(snapshot, options = {}) {
  return createViewportSpace({
    logicalWidth: options.logicalWidth ?? snapshot?.logicalWidth,
    logicalHeight: options.logicalHeight ?? snapshot?.logicalHeight,
    displayRect: options.displayRect ?? snapshot?.displayRect,
    backingScale: options.backingScale ?? snapshot?.backingScale,
    safeInsets: options.safeInsets ?? snapshot?.safeInsets,
  });
}

export function screenToLogical(snapshot, point = null) {
  const scale = positive(snapshot?.presentationScale, 1);
  return {
    x: (finite(point?.x, 0) - finite(snapshot?.contentRect?.left, 0)) / scale,
    y: (finite(point?.y, 0) - finite(snapshot?.contentRect?.top, 0)) / scale,
  };
}

export function logicalToScreen(snapshot, point = null) {
  const scale = positive(snapshot?.presentationScale, 1);
  return {
    x: finite(snapshot?.contentRect?.left, 0) + (finite(point?.x, 0) * scale),
    y: finite(snapshot?.contentRect?.top, 0) + (finite(point?.y, 0) * scale),
  };
}

export function logicalLengthToScreen(snapshot, length = 0) {
  return finite(length, 0) * positive(snapshot?.presentationScale, 1);
}

export function screenLengthToLogical(snapshot, length = 0) {
  return finite(length, 0) / positive(snapshot?.presentationScale, 1);
}

function contains(rect, point) {
  if (!rect || !point) return false;
  const x = Number(point.x);
  const y = Number(point.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return x >= rect.left
    && y >= rect.top
    && x <= rect.left + rect.width
    && y <= rect.top + rect.height;
}

export function containsLogicalPoint(snapshot, point = null) {
  return contains(
    { left: 0, top: 0, width: positive(snapshot?.logicalWidth, 1), height: positive(snapshot?.logicalHeight, 1) },
    point,
  );
}

export function containsScreenPoint(snapshot, point = null) {
  return contains(snapshot?.displayRect, point);
}

export function containsContentPoint(snapshot, point = null) {
  return contains(snapshot?.contentRect, point);
}

