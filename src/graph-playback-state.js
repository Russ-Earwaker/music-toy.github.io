import { getPlaybackInstance } from './playback-instances.js';

export function isObjectMusicallyActive(model, id, instance = getPlaybackInstance(id)) {
  return model.isRooted(id) && instance?.active === true;
}

// Selection/focus classes are deliberately independent of musical activity.
export function projectMusicalActiveState(panel, active) {
  const value = active ? 'true' : 'false';
  const clearVisuals = !active && (panel.dataset.chainActive !== value
    || panel.classList?.contains?.('toy-playing') || panel.classList?.contains?.('toy-playing-pulse'));
  if (panel.dataset.chainActive !== value) panel.dataset.chainActive = value;
  if (panel.classList && panel.classList.contains?.('toy-playing') !== active) panel.classList.toggle('toy-playing', active);
  if (clearVisuals) {
    panel.classList?.remove('toy-playing-pulse');
    panel.__pulseHighlight = 0; panel.__pulseRearm = false;
    panel.__simpleRhythmVisualState?.flash?.fill?.(0);
    panel.__loopgridNeedsRedraw = true;
  }
}
