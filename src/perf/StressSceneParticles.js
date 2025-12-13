// src/perf/StressSceneParticles.js
// Particle worst-case scene generator (deterministic, no randomness).

import { getCommittedState } from '../zoom/ZoomCoordinator.js';

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

  const cam = getCommittedState();
  // Place toys around the current camera anchor.
  const centerX = cam.x;
  const centerY = cam.y;

  const totalW = (cols - 1) * spacing;
  const totalH = (rows - 1) * spacing;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = centerX + (c * spacing - totalW / 2);
      const y = centerY + (r * spacing - totalH / 2);
      try {
        factory.create(toyType, { centerX: x, centerY: y, autoCenter: false });
      } catch (err) {
        console.warn('[StressSceneParticles] create failed', { toyType, r, c }, err);
      }
    }
  }

  return true;
}

