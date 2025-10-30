// src/zoom/ZoomCoordinator.js
// Centralized zoom state + events. During a live gesture we only apply CSS transforms.
// Expensive reflows / canvas redraws happen AFTER the gesture "commits".

const listeners = new Set();

const state = {
  currentScale: 1,
  currentX: 0,
  currentY: 0,
  targetScale: 1,
  targetX: 0,
  targetY: 0,
  mode: 'idle', // 'gesturing' | 'committing' | 'idle'
  isDirty: false,
};

let rafId = 0;
let worldEl = null;
let progressRaf = 0;
let lastProgressTs = 0;
let progressHz = 30; // ~30fps progress callbacks while pinching/wheeling
let minProgressGapMs = 1000 / progressHz;

export function attachWorldElement(el) {
  worldEl = el;
  if (!worldEl) return;
  worldEl.style.transformOrigin = '0 0';
  worldEl.style.willChange = 'transform';
  worldEl.style.transform = 'translateZ(0)';
}

function roundPx(v) {
  return Math.round(v * 100) / 100; // 0.01px resolution
}

function applyTransform() {
  if (!worldEl) return;
  const s = Math.fround(state.currentScale);
  const x = roundPx(state.currentX);
  const y = roundPx(state.currentY);
  worldEl.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`;

  // Publish CSS vars for any follower layers (runs in the same RAF)
  const st = worldEl.style;
  st.setProperty('--zoom-scale', String(s));
  st.setProperty('--zoom-x', `${x}px`);
  st.setProperty('--zoom-y', `${y}px`);
}

function tick() {
  rafId = 0;
  if (!state.isDirty) return;

  // In gesturing mode, we snap current = target (no easing) to keep feel crisp for pinch,
  // but we still do it in RAF to batch DOM writes.
  if (state.mode === 'gesturing') {
    state.currentScale = state.targetScale;
    state.currentX = state.targetX;
    state.currentY = state.targetY;
  } else {
    // non-gesturing (e.g., PC lerp) handled elsewhere; this module is still the sink for updates
    state.currentScale = state.targetScale;
    state.currentX = state.targetX;
    state.currentY = state.targetY;
  }

  applyTransform();
  state.isDirty = false;

  // notify listeners AFTER transform
  for (const fn of listeners) fn({ ...state });
}

function schedule() {
  if (!rafId) rafId = requestAnimationFrame(tick);
}

function startProgressLoop() {
  if (progressRaf) return;
  const loop = (ts) => {
    progressRaf = 0;
    if (state.mode !== 'gesturing') return;
    if (!lastProgressTs || (ts - lastProgressTs) >= minProgressGapMs) {
      lastProgressTs = ts || performance.now();
      for (const fn of listeners) fn({ ...state, phase: 'progress', gesturing: true });
    }
    progressRaf = requestAnimationFrame(loop);
  };
  progressRaf = requestAnimationFrame(loop);
}

function stopProgressLoop() {
  if (progressRaf) cancelAnimationFrame(progressRaf);
  progressRaf = 0;
  lastProgressTs = 0;
}

export function setGestureTransform({ scale, x, y }) {
  state.mode = 'gesturing';
  state.targetScale = scale;
  state.targetX = x;
  state.targetY = y;
  state.isDirty = true;
  schedule();
  startProgressLoop();
}

// Atomic commit: freeze visual transform, let toys recompute offscreen, then unfreeze.
// Ensures no 1-frame overshoot/undershoot between CSS transform and new backing stores.
let atomicCommitId = 0;

export function commitGesture({ scale, x, y }, { delayMs = 80 } = {}) {
  // Do NOT change transform targets here if setGestureTransform already set them this frame.
  // We only broadcast a "freeze -> recompute -> swap" protocol.

  stopProgressLoop();
  state.mode = 'committing';
  // Keep target == last gesture values (assumed already set via setGestureTransform)
  // but mark dirty so we reapply exact transform (no rounding drift).
  state.isDirty = true;
  schedule();

  const id = ++atomicCommitId;

  // Phase A (freeze): add a class so CSS can disable transitions/animations if any.
  document.documentElement.classList.add('zoom-commit-freeze');

  // Notify listeners that a commit is starting (freeze point: do NOT resize canvases yet).
  for (const fn of listeners) fn({ ...state, committing: true, phase: 'freeze' });

  // Phase B on next RAF: allow heavy recompute OFFSCREEN (double buffers) but keep transform frozen.
  requestAnimationFrame(() => {
    if (id !== atomicCommitId) return;
    for (const fn of listeners) fn({ ...state, committing: true, phase: 'recompute' });

    // Phase C on next RAF: swap buffers and unfreeze soon after to avoid paint/flicker
    requestAnimationFrame(() => {
      if (id !== atomicCommitId) return;
      for (const fn of listeners) fn({ ...state, committing: true, phase: 'swap' });

      // Small timeout gives Safari a breath to present the new pixels before any other layout.
      setTimeout(() => {
        if (id !== atomicCommitId) return;
        state.mode = 'idle';
        document.documentElement.classList.remove('zoom-commit-freeze');
        // Final "committed" notification (single post-commit redraw if anyone needs it)
        for (const fn of listeners) fn({ ...state, committed: true, phase: 'done' });
      }, delayMs);
    });
  });
}

export function onZoomChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getZoomState() {
  return { ...state };
}
