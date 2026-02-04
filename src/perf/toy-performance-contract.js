// src/perf/toy-performance-contract.js
// A small, explicit "performance contract" for toy rendering.
//
// This file defines the *policy* (rules). Enforcement is handled by
// src/perf/toy-update-arbiter.js.

export const TOY_PERF_MODE = Object.freeze({
  ACTIVE: 'active', // fully responsive (aim ~60fps)
  WARM: 'warm',     // reduced rate (aim ~30fps)
  IDLE: 'idle',     // heavily reduced (aim ~15fps)
  FROZEN: 'frozen', // essentially paused (aim ~2fps)
});

// Map an approximate target FPS to a rAF frame-modulo.
// Example: 30fps -> 2, 15fps -> 4.
export function fpsToFrameModulo(targetFps, assumedRefreshHz = 60) {
  const hz = Number.isFinite(assumedRefreshHz) && assumedRefreshHz > 0 ? assumedRefreshHz : 60;
  const fps = Number.isFinite(targetFps) ? targetFps : hz;
  if (fps >= hz) return 1;
  if (fps <= 0.01) return 60;
  return Math.max(1, Math.round(hz / Math.max(1, fps)));
}

/**
 * Decide a toy perf mode based on a small, stable set of signals.
 *
 * Inputs are intentionally simple booleans + a recent-interaction window.
 * Keep this deterministic to avoid flicker.
 */
export function decideToyPerfMode({
  visible = true,
  focused = false,
  playing = false,
  gesturing = false,
  hasPulse = false,
  recentlyInteractedMs = Infinity,
} = {}) {
  // Focused toys are always ACTIVE.
  if (focused) {
    return { mode: TOY_PERF_MODE.ACTIVE, targetFps: 60, reason: 'focused' };
  }

  // While the user is actively gesturing, keep visuals responsive.
  // (We can still reduce heavy logic elsewhere, but this contract is only
  // describing update cadence.)
  if (gesturing) {
    return { mode: TOY_PERF_MODE.WARM, targetFps: 30, reason: 'gesturing' };
  }

  // Recently interacted toys stay warm for a short window.
  if (recentlyInteractedMs <= 2000) {
    return { mode: TOY_PERF_MODE.WARM, targetFps: 30, reason: 'recent-interaction' };
  }

  // If transport is running, keep visible toys updating at a reasonable rate.
  if (playing && visible) {
    return { mode: TOY_PERF_MODE.WARM, targetFps: 30, reason: 'playing+visible' };
  }

  // Pulse highlights should be allowed to animate even if not visible.
  if (hasPulse) {
    return { mode: TOY_PERF_MODE.IDLE, targetFps: 15, reason: 'pulse' };
  }

  // Visible but not important -> idle.
  if (visible) {
    return { mode: TOY_PERF_MODE.IDLE, targetFps: 15, reason: 'visible-idle' };
  }

  // Offscreen -> frozen.
  return { mode: TOY_PERF_MODE.FROZEN, targetFps: 2, reason: 'offscreen' };
}
