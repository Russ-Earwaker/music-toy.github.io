import { createViewportSpace, logicalToScreen, screenToLogical } from './coordinates/viewport-space.js';

export const CHORDWHEEL_MAIN_LOGICAL_WIDTH = 520;
export const CHORDWHEEL_MAIN_LOGICAL_HEIGHT = 520;
export const CHORDWHEEL_MAIN_CENTER = Object.freeze({ x: 260, y: 260 });
export const CHORDWHEEL_MAIN_WHEEL_RADIUS = 190;
export const CHORDWHEEL_MAIN_OUTER_CUBE_RADIUS = 235;
export const CHORDWHEEL_MAIN_OUTER_CUBE_SIZE = 48;
export const CHORDWHEEL_MAIN_INNER_CUBE_RADIUS = CHORDWHEEL_MAIN_WHEEL_RADIUS * 0.58;
export const CHORDWHEEL_MAIN_INNER_CUBE_SIZE = 60;

export function createChordWheelMainViewportSpace({ left = 0, top = 0, width, height, backingScale = 1 } = {}) {
  return createViewportSpace({
    logicalWidth: CHORDWHEEL_MAIN_LOGICAL_WIDTH,
    logicalHeight: CHORDWHEEL_MAIN_LOGICAL_HEIGHT,
    displayRect: { left, top, width, height },
    backingScale,
  });
}

export function chordWheelMainClientToLogical(clientPoint, displayRect) {
  return screenToLogical(createChordWheelMainViewportSpace({
    left: displayRect.left,
    top: displayRect.top,
    width: displayRect.width,
    height: displayRect.height,
  }), clientPoint);
}

export function getChordWheelCubeGeometry({ count = 16, inner = false } = {}) {
  const cubeCount = Math.max(1, Math.trunc(Number(count) || 16));
  const radius = inner ? CHORDWHEEL_MAIN_INNER_CUBE_RADIUS : CHORDWHEEL_MAIN_OUTER_CUBE_RADIUS;
  const size = inner ? CHORDWHEEL_MAIN_INNER_CUBE_SIZE : CHORDWHEEL_MAIN_OUTER_CUBE_SIZE;
  const phase = inner ? 0.5 : 0;
  const cubes = Array.from({ length: cubeCount }, (_, index) => {
    const angle = ((index + phase) / cubeCount) * Math.PI * 2 - Math.PI / 2;
    const centerX = CHORDWHEEL_MAIN_CENTER.x + radius * Math.cos(angle);
    const centerY = CHORDWHEEL_MAIN_CENTER.y + radius * Math.sin(angle);
    return Object.freeze({ x: centerX - size / 2, y: centerY - size / 2, w: size, h: size });
  });
  return Object.freeze({ cubes: Object.freeze(cubes), cubeSize: size });
}

export function hitTestChordWheelCubes(cubes, point) {
  if (!Array.isArray(cubes) || !point) return -1;
  return cubes.findIndex((cube) => (
    point.x >= cube.x && point.x <= cube.x + cube.w
    && point.y >= cube.y && point.y <= cube.y + cube.h
  ));
}

export function projectChordWheelLogicalPoint(viewportSpace, point) {
  return logicalToScreen(viewportSpace, point);
}
