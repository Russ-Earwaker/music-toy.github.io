import {
  containsContentPoint,
  containsScreenPoint,
  createViewportSpace,
  logicalLengthToScreen,
  logicalToScreen,
  screenToLogical,
} from '../coordinates/viewport-space.js';

export const ART_TOY_BASE_LOGICAL_SIZE = 220;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positive(value, fallback = 1) {
  const number = finite(value, fallback);
  return number > 0 ? number : fallback;
}

function freezeBounds(bounds, fallbackWidth, fallbackHeight) {
  return Object.freeze({
    left: finite(bounds?.left ?? bounds?.x, 0),
    top: finite(bounds?.top ?? bounds?.y, 0),
    width: positive(bounds?.width ?? bounds?.w, fallbackWidth),
    height: positive(bounds?.height ?? bounds?.h, fallbackHeight),
  });
}

function contains(bounds, point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  return Number.isFinite(x)
    && Number.isFinite(y)
    && x >= bounds.left
    && y >= bounds.top
    && x <= bounds.left + bounds.width
    && y <= bounds.top + bounds.height;
}

export const ART_TOY_AUTHORED_SPACES = Object.freeze({
  fireworks: Object.freeze({
    logicalWidth: 220,
    logicalHeight: 220,
    workspaceBounds: Object.freeze({ left: -142, top: 74, width: 1600, height: 1600 }),
  }),
  laserTrails: Object.freeze({
    logicalWidth: 220,
    logicalHeight: 220,
    workspaceBounds: Object.freeze({ left: -94, top: 74, width: 1600, height: 1600 }),
  }),
  sticker: Object.freeze({
    logicalWidth: 220,
    logicalHeight: 220,
    workspaceBounds: Object.freeze({ left: -94, top: 74, width: 1600, height: 1600 }),
  }),
});

export function getArtToyAuthoredSpace(type) {
  return ART_TOY_AUTHORED_SPACES[String(type || '')] || null;
}

export function createArtToyViewportSpace({
  logicalWidth = ART_TOY_BASE_LOGICAL_SIZE,
  logicalHeight = ART_TOY_BASE_LOGICAL_SIZE,
  displayRect,
  workspaceBounds = null,
  backingScale = 1,
} = {}) {
  const viewport = createViewportSpace({ logicalWidth, logicalHeight, displayRect, backingScale });
  const baseBounds = freezeBounds(null, viewport.logicalWidth, viewport.logicalHeight);
  const extendedBounds = freezeBounds(workspaceBounds, viewport.logicalWidth, viewport.logicalHeight);

  const classifyLogicalPoint = (point) => Object.freeze({
    insideBaseContent: contains(baseBounds, point),
    insideExtendedWorkspace: contains(extendedBounds, point),
  });

  const clientToLogical = (point) => screenToLogical(viewport, point);
  const logicalToDisplay = (point) => logicalToScreen(viewport, point);

  return Object.freeze({
    ...viewport,
    baseBounds,
    workspaceBounds: extendedBounds,
    clientToLogical,
    logicalToDisplay,
    logicalLengthToDisplay: (length) => logicalLengthToScreen(viewport, length),
    classifyLogicalPoint,
    classifyClientPoint: (point) => {
      const logicalPoint = clientToLogical(point);
      const logicalClassification = classifyLogicalPoint(logicalPoint);
      return Object.freeze({
        logicalPoint: Object.freeze(logicalPoint),
        insideDisplayRect: containsScreenPoint(viewport, point),
        insideBaseContent: containsContentPoint(viewport, point),
        insideExtendedWorkspace: logicalClassification.insideExtendedWorkspace,
      });
    },
  });
}

// DOM measurement adapter. It owns no simulation state and never reads DPR;
// each call returns a fresh immutable snapshot from the instance's client rect.
export function createArtToyViewportController({ element, authoredSpace } = {}) {
  const config = authoredSpace || {};
  const snapshot = () => {
    const rect = element?.getBoundingClientRect?.();
    return createArtToyViewportSpace({
      logicalWidth: config.logicalWidth,
      logicalHeight: config.logicalHeight,
      workspaceBounds: config.workspaceBounds,
      displayRect: rect
        ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
        : { left: 0, top: 0, width: config.logicalWidth, height: config.logicalHeight },
    });
  };

  return Object.freeze({
    authoredSpace: Object.freeze({
      logicalWidth: positive(config.logicalWidth, ART_TOY_BASE_LOGICAL_SIZE),
      logicalHeight: positive(config.logicalHeight, ART_TOY_BASE_LOGICAL_SIZE),
      workspaceBounds: freezeBounds(
        config.workspaceBounds,
        positive(config.logicalWidth, ART_TOY_BASE_LOGICAL_SIZE),
        positive(config.logicalHeight, ART_TOY_BASE_LOGICAL_SIZE),
      ),
    }),
    snapshot,
    clientToLogical: (point) => snapshot().clientToLogical(point),
    logicalToDisplay: (point) => snapshot().logicalToDisplay(point),
    logicalLengthToDisplay: (length) => snapshot().logicalLengthToDisplay(length),
    classifyClientPoint: (point) => snapshot().classifyClientPoint(point),
    compareClientPoint: (point, currentLocalPoint = null) => {
      const current = snapshot();
      const logicalPoint = current.clientToLogical(point);
      return Object.freeze({
        clientPoint: Object.freeze({ x: finite(point?.x), y: finite(point?.y) }),
        currentLocalPoint: currentLocalPoint
          ? Object.freeze({ x: finite(currentLocalPoint.x), y: finite(currentLocalPoint.y) })
          : null,
        logicalPoint: Object.freeze(logicalPoint),
        projectedDisplayPoint: Object.freeze(current.logicalToDisplay(logicalPoint)),
        classification: current.classifyClientPoint(point),
      });
    },
  });
}
