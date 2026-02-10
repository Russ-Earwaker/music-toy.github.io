// src/baseMusicToy/index.js
export { syncCanvasCssSize } from './canvasCss.js';
export { applyCanvasBackingSize } from './canvasBackingStore.js';
export { clampDprForBackingStore } from './dprPolicy.js';
export { createOverlayResizeGate, quantizePx } from './overlayResizeGate.js';
export { readForcedTier } from './qualityOverrides.js';
export { clampInt, pickTierFromTable, stampTierDebugMeta, pickTierFromMap } from './toyQualityTier.js';
export { getDeviceDpr, computeEffectiveDpr } from './effectiveDpr.js';
export { resizeCanvasForDpr } from './resizeCanvasForDpr.js';
export { waitForStableBox } from './waitForStableBox.js';
export { syncCanvasesCssSize } from './syncCanvasesCssSize.js';
export { createToyCanvasRig } from './createToyCanvasRig.js';
export { createToyRelayoutController } from './toyRelayoutController.js';
export { createGlobalPanelScheduler } from './toyRenderScheduler.js';
export { createToyVisibilityObserver } from './toyVisibilityObserver.js';
export { createToyVisibleCounter } from './toyVisibleCounter.js';
export { createToyDirtyFlags } from './toyDirtyFlags.js';

// --- Particles (shared infra; toys should not reach into baseMusicToy/particles/* directly)
export { createParticleViewport } from './particles/particle-viewport.js';
export { createField } from './particles/field-generic.js';
export {
  getParticleBudget,
  getAdaptiveFrameBudget,
  getParticleCap,
  updateParticleQualityFromFps,
  setActiveToyCount,
  getMemoryPressureLevel,
  setParticleQualityLock,
  getParticleQuality,
} from './particles/ParticleQuality.js';
