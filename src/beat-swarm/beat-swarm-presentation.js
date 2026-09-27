// BeatSwarm contract: simulation uses a fixed 1600x900 logical gameplay space.
// Gameplay presentation is a uniform contain-fit currently capped at 1.0; UI
// and decorative bleed remain browser-space. DPR/render quality is metadata
// only and must never affect simulation coordinates or gameplay decisions.
export function getBeatSwarmRawPresentationScale(viewportSpace) {
  const scale = Number(viewportSpace?.presentationScale);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

export function getBeatSwarmPresentationScale(viewportSpace) {
  return Math.min(1, getBeatSwarmRawPresentationScale(viewportSpace));
}

export function createBeatSwarmGameplayPresentationSpace(viewportSpace) {
  if (!viewportSpace) return null;
  const presentationScale = getBeatSwarmPresentationScale(viewportSpace);
  const logicalWidth = Math.max(1, Number(viewportSpace.logicalWidth) || 1600);
  const logicalHeight = Math.max(1, Number(viewportSpace.logicalHeight) || 900);
  const displayRect = viewportSpace.displayRect || { left: 0, top: 0, width: logicalWidth, height: logicalHeight };
  const contentWidth = logicalWidth * presentationScale;
  const contentHeight = logicalHeight * presentationScale;
  return Object.freeze({
    ...viewportSpace,
    presentationScale,
    contentRect: Object.freeze({
      left: (Number(displayRect.left) || 0) + ((Number(displayRect.width) - contentWidth) * 0.5),
      top: (Number(displayRect.top) || 0) + ((Number(displayRect.height) - contentHeight) * 0.5),
      width: contentWidth,
      height: contentHeight,
    }),
  });
}

export function projectBeatSwarmLogicalSize(viewportSpace, logicalSize) {
  return Math.max(0, Number(logicalSize) || 0) * getBeatSwarmPresentationScale(viewportSpace);
}

export function composeBeatSwarmGameplayTransform(baseTransform, presentationScale) {
  const base = String(baseTransform || '').trim();
  const scale = Number.isFinite(Number(presentationScale)) && Number(presentationScale) > 0
    ? Number(presentationScale)
    : 1;
  return `${base}${base ? ' ' : ''}scale(${scale.toFixed(6)})`;
}

export function createBeatSwarmPresentationDebugEntry({
  kind = '',
  logicalPosition = null,
  screenPosition = null,
  logicalSize = 0,
  presentationScale = 1,
} = {}) {
  return Object.freeze({
    kind: String(kind || ''),
    logicalPosition: logicalPosition ? Object.freeze({ x: Number(logicalPosition.x) || 0, y: Number(logicalPosition.y) || 0 }) : null,
    screenPosition: screenPosition ? Object.freeze({ x: Number(screenPosition.x) || 0, y: Number(screenPosition.y) || 0 }) : null,
    logicalSize: Math.max(0, Number(logicalSize) || 0),
    presentationScale: getBeatSwarmPresentationScale({ presentationScale }),
    cssSize: projectBeatSwarmLogicalSize({ presentationScale }, logicalSize),
  });
}
