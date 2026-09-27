import {
  containsContentPoint,
  containsScreenPoint,
  logicalLengthToScreen,
  logicalToScreen,
  screenToLogical,
} from '../coordinates/viewport-space.js';

export const BEAT_SWARM_LOGICAL_WIDTH = 1600;
export const BEAT_SWARM_LOGICAL_HEIGHT = 900;
export const BEAT_SWARM_LOGICAL_SIZE = Object.freeze({
  width: BEAT_SWARM_LOGICAL_WIDTH,
  height: BEAT_SWARM_LOGICAL_HEIGHT,
});
export const BEAT_SWARM_LOGICAL_CENTER = Object.freeze({
  x: BEAT_SWARM_LOGICAL_WIDTH * 0.5,
  y: BEAT_SWARM_LOGICAL_HEIGHT * 0.5,
});
export const BEAT_SWARM_LOGICAL_BOUNDS = Object.freeze({
  left: 0,
  top: 0,
  right: BEAT_SWARM_LOGICAL_WIDTH,
  bottom: BEAT_SWARM_LOGICAL_HEIGHT,
  width: BEAT_SWARM_LOGICAL_WIDTH,
  height: BEAT_SWARM_LOGICAL_HEIGHT,
});

export function getBeatSwarmLogicalCenter() {
  return BEAT_SWARM_LOGICAL_CENTER;
}

export function createBeatSwarmPlayerAnchorSnapshot(viewportSpace, worldPosition = null) {
  const world = worldPosition && Number.isFinite(Number(worldPosition.x)) && Number.isFinite(Number(worldPosition.y))
    ? Object.freeze({ x: Number(worldPosition.x), y: Number(worldPosition.y) })
    : null;
  return Object.freeze({
    logical: BEAT_SWARM_LOGICAL_CENTER,
    world,
    screen: Object.freeze(projectBeatSwarmLogicalToScreen(viewportSpace, BEAT_SWARM_LOGICAL_CENTER)),
  });
}

export function getBeatSwarmLogicalBounds() {
  return BEAT_SWARM_LOGICAL_BOUNDS;
}

export function projectBeatSwarmLogicalToScreen(viewportSpace, point) {
  return logicalToScreen(viewportSpace, point);
}

export function projectBeatSwarmScreenToLogical(viewportSpace, point) {
  return screenToLogical(viewportSpace, point);
}

export function projectBeatSwarmLogicalLengthToScreen(viewportSpace, length) {
  return logicalLengthToScreen(viewportSpace, length);
}

export function classifyBeatSwarmScreenPoint(viewportSpace, point) {
  const insideDisplay = containsScreenPoint(viewportSpace, point);
  const insideGameplayContent = containsContentPoint(viewportSpace, point);
  return Object.freeze({
    insideDisplay,
    insideGameplayContent,
    outsideGameplayInsideDisplay: insideDisplay && !insideGameplayContent,
  });
}

// marginLogical is signed: positive expands the gameplay rectangle for
// admission/retirement grace; negative creates an inner safe rectangle.
export function isLogicalPointInsideGameplay(point, marginLogical = 0) {
  if (!point) return false;
  const x = Number(point.x);
  const y = Number(point.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const margin = Number.isFinite(Number(marginLogical)) ? Number(marginLogical) : 0;
  return x >= BEAT_SWARM_LOGICAL_BOUNDS.left - margin
    && x <= BEAT_SWARM_LOGICAL_BOUNDS.right + margin
    && y >= BEAT_SWARM_LOGICAL_BOUNDS.top - margin
    && y <= BEAT_SWARM_LOGICAL_BOUNDS.bottom + margin;
}

export function createBeatSwarmWorldLogicalProjection({ getPlayerWorld, getWorldScale } = {}) {
  const player = () => getPlayerWorld?.() || { x: 0, y: 0 };
  const scale = () => Math.max(0.001, Number(getWorldScale?.()) || 1);
  return Object.freeze({
    worldToLogical(point = null) {
      if (!point) return null;
      const center = player();
      const worldScale = scale();
      return {
        x: BEAT_SWARM_LOGICAL_CENTER.x + (((Number(point.x) || 0) - (Number(center.x) || 0)) * worldScale),
        y: BEAT_SWARM_LOGICAL_CENTER.y + (((Number(point.y) || 0) - (Number(center.y) || 0)) * worldScale),
      };
    },
    logicalToWorld(point = null) {
      if (!point) return null;
      const center = player();
      const worldScale = scale();
      return {
        x: (Number(center.x) || 0) + (((Number(point.x) || 0) - BEAT_SWARM_LOGICAL_CENTER.x) / worldScale),
        y: (Number(center.y) || 0) + (((Number(point.y) || 0) - BEAT_SWARM_LOGICAL_CENTER.y) / worldScale),
      };
    },
    worldLengthToLogical(length = 0) {
      return (Number(length) || 0) * scale();
    },
  });
}

// Temporary bridge while BeatSwarm world/camera ownership remains in
// board-viewport.js. It composes projections without duplicating either map.
export function createBeatSwarmProjectionBridge({
  getViewportSpace,
  boardWorldToScreen = null,
  boardScreenToWorld = null,
  worldToLogicalMap = null,
  logicalToWorldMap = null,
} = {}) {
  const current = () => getViewportSpace?.() || null;

  function logicalToScreenPoint(point) {
    return projectBeatSwarmLogicalToScreen(current(), point);
  }

  function screenToLogicalPoint(point) {
    return projectBeatSwarmScreenToLogical(current(), point);
  }

  function logicalToWorld(point) {
    if (typeof logicalToWorldMap === 'function') return logicalToWorldMap(point);
    const screen = logicalToScreenPoint(point);
    return typeof boardScreenToWorld === 'function' ? boardScreenToWorld(screen) : null;
  }

  function worldToLogical(point) {
    if (typeof worldToLogicalMap === 'function') return worldToLogicalMap(point);
    const screen = typeof boardWorldToScreen === 'function' ? boardWorldToScreen(point) : null;
    return screen ? screenToLogicalPoint(screen) : null;
  }

  function isWorldPointInsideGameplay(point, marginLogical = 0) {
    const logical = worldToLogical(point);
    return isLogicalPointInsideGameplay(logical, marginLogical);
  }

  function classifyWorldPoint(point, marginLogical = 0) {
    const viewportSpace = current();
    const screen = typeof boardWorldToScreen === 'function' ? boardWorldToScreen(point) : null;
    const logical = screen ? projectBeatSwarmScreenToLogical(viewportSpace, screen) : null;
    return Object.freeze({
      logical,
      screen,
      insideGameplay: isLogicalPointInsideGameplay(logical, marginLogical),
      insidePresentation: containsScreenPoint(viewportSpace, screen),
    });
  }

  return Object.freeze({
    getViewportSpace: current,
    getLogicalCenter: getBeatSwarmLogicalCenter,
    getLogicalBounds: getBeatSwarmLogicalBounds,
    logicalToScreen: logicalToScreenPoint,
    screenToLogical: screenToLogicalPoint,
    logicalLengthToScreen: (length) => projectBeatSwarmLogicalLengthToScreen(current(), length),
    classifyScreenPoint: (point) => classifyBeatSwarmScreenPoint(current(), point),
    logicalToWorld,
    worldToLogical,
    isLogicalPointInsideGameplay,
    isWorldPointInsideGameplay,
    isWorldPointLikelyVisible: (point, marginLogical = 0) => isWorldPointInsideGameplay(point, marginLogical),
    classifyWorldPoint,
  });
}

export function createBeatSwarmViewportDebugSnapshot(viewportSpace) {
  if (!viewportSpace) return null;
  return Object.freeze({
    logicalWidth: viewportSpace.logicalWidth,
    logicalHeight: viewportSpace.logicalHeight,
    logicalCenter: BEAT_SWARM_LOGICAL_CENTER,
    logicalBounds: BEAT_SWARM_LOGICAL_BOUNDS,
    displayRect: viewportSpace.displayRect,
    contentRect: viewportSpace.contentRect,
    presentationScale: viewportSpace.presentationScale,
    backingScale: viewportSpace.backingScale,
    safeInsets: viewportSpace.safeInsets,
  });
}
