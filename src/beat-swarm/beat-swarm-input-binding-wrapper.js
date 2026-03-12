export function bindBeatSwarmInputRuntimeWrapper(deps = {}) {
  const targets = deps.targets && typeof deps.targets === 'object' ? deps.targets : {};
  const handlers = deps.handlers && typeof deps.handlers === 'object' ? deps.handlers : {};
  const overlayEl = targets.overlayEl || null;
  const doc = targets.document || null;
  const win = targets.window || null;

  overlayEl?.addEventListener('pointerdown', handlers.onPointerDown, { passive: false });
  overlayEl?.addEventListener('pointermove', handlers.onPointerMove, { passive: false });
  overlayEl?.addEventListener('pointerup', handlers.onPointerUp, { passive: false });
  overlayEl?.addEventListener('pointercancel', handlers.onPointerUp, { passive: false });
  doc?.addEventListener('keydown', handlers.onKeyDown, { passive: false });
  win?.addEventListener('wheel', handlers.onWheel, { passive: false, capture: true });
  doc?.addEventListener('transport:pause', handlers.onTransportPause, { passive: true });
  doc?.addEventListener('transport:resume', handlers.onTransportResume, { passive: true });
  doc?.addEventListener('transport:play', handlers.onTransportResume, { passive: true });
  win?.addEventListener('beat-swarm:music-system-event', handlers.onMusicSystemEvent, { passive: true });
}

export function unbindBeatSwarmInputRuntimeWrapper(deps = {}) {
  const targets = deps.targets && typeof deps.targets === 'object' ? deps.targets : {};
  const handlers = deps.handlers && typeof deps.handlers === 'object' ? deps.handlers : {};
  const overlayEl = targets.overlayEl || null;
  const doc = targets.document || null;
  const win = targets.window || null;

  overlayEl?.removeEventListener('pointerdown', handlers.onPointerDown);
  overlayEl?.removeEventListener('pointermove', handlers.onPointerMove);
  overlayEl?.removeEventListener('pointerup', handlers.onPointerUp);
  overlayEl?.removeEventListener('pointercancel', handlers.onPointerUp);
  doc?.removeEventListener('keydown', handlers.onKeyDown);
  win?.removeEventListener('wheel', handlers.onWheel, { capture: true });
  doc?.removeEventListener('transport:pause', handlers.onTransportPause);
  doc?.removeEventListener('transport:resume', handlers.onTransportResume);
  doc?.removeEventListener('transport:play', handlers.onTransportResume);
  win?.removeEventListener('beat-swarm:music-system-event', handlers.onMusicSystemEvent);
}
