export function resolveBeatSwarmPauseState(current = null, request = null) {
  const previous = current && typeof current === 'object' ? current : {};
  const next = request && typeof request === 'object' ? request : {};
  const paused = !!next.paused;
  const pauseUiVisible = paused && (next.pauseUiVisible !== false);
  const pauseSource = paused
    ? String(next.pauseSource || previous.pauseSource || 'normal')
    : 'none';

  return Object.freeze({ paused, pauseUiVisible, pauseSource });
}

