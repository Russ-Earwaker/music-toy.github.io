// src/perf/StressSceneParticles.js
// Particle worst-case scene generator (deterministic, no randomness).

import { getViewportElement, screenToWorld } from '../board-viewport.js';

function clearSceneViaSnapshot() {
  const P = window.Persistence;
  if (!P || typeof P.getSnapshot !== 'function' || typeof P.applySnapshot !== 'function') {
    console.warn('[StressSceneParticles] Persistence API not ready');
    return false;
  }
  const snap = P.getSnapshot();
  snap.toys = [];
  snap.chains = [];
  // preserve camera/theme/bpm in snap
  return !!P.applySnapshot(snap);
}

export function buildParticleWorstCase({
  toyType = 'loopgrid',
  rows = 7,
  cols = 9,
  spacing = 420,
} = {}) {
  const factory = window.MusicToyFactory;
  if (!factory || typeof factory.create !== 'function') {
    console.warn('[StressSceneParticles] MusicToyFactory.create not ready');
    return false;
  }

  clearSceneViaSnapshot();

  const viewEl = getViewportElement?.() || document.documentElement;
  const viewRect = viewEl?.getBoundingClientRect?.();
  const viewCx = (viewRect?.left ?? 0) + (viewRect?.width ?? window.innerWidth) * 0.5;
  const viewCy = (viewRect?.top ?? 0) + (viewRect?.height ?? window.innerHeight) * 0.5;
  const world = screenToWorld({ x: viewCx, y: viewCy });
  // Place toys around the current camera center in world space.
  const centerX = Number.isFinite(world?.x) ? world.x : 0;
  const centerY = Number.isFinite(world?.y) ? world.y : 0;

  const totalW = (cols - 1) * spacing;
  const totalH = (rows - 1) * spacing;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = centerX + (c * spacing - totalW / 2);
      const y = centerY + (r * spacing - totalH / 2);
      try {
        factory.create(toyType, { centerX: x, centerY: y, autoCenter: false, allowOffscreen: true, skipSpawnPlacement: true });
      } catch (err) {
        console.warn('[StressSceneParticles] create failed', { toyType, r, c }, err);
      }
    }
  }

  return true;
}
