// src/zoom/ZoomCoordinator.js
// Centralized zoom state + events. During a live gesture we only apply CSS transforms.
// Expensive reflows / canvas redraws happen AFTER the gesture "commits".

const listeners = new Set();
const frameStartListeners = new Set();

// --- Lightweight ZoomCoordinator profiling ---
const ZC_PROFILE = false;
try { if (typeof window !== 'undefined') window.__PERF_DEBUG = false; } catch {}
const ZC_PERF_DEBUG = (typeof window !== 'undefined') ? !!window.__PERF_DEBUG : false;

// --- Listener profiling ---
const ZC_LISTENER_DEBUG = false;
const ZC_LISTENER_LOG_THRESHOLD_MS = 1.0; // log listeners slower than this
const ZC_GESTURE_LOG = false; // suppress zoom-gesture-flag console spam by default

let zcFrameCount = 0;
let zcAccumMs = 0;
let zcMinMs = Infinity;
let zcMaxMs = 0;

let zcCommitCount = 0;
let zcLastLogTs = 0;

function zcSampleFrame(dtMs) {
  if (!ZC_PROFILE) return;

  zcFrameCount++;
  zcAccumMs += dtMs;
  if (dtMs < zcMinMs) zcMinMs = dtMs;
  if (dtMs > zcMaxMs) zcMaxMs = dtMs;

  const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();

  // Log roughly once per second.
  if (!zcLastLogTs) zcLastLogTs = now;
  if (now - zcLastLogTs >= 1000) {
    const avg = zcFrameCount > 0 ? zcAccumMs / zcFrameCount : 0;
    console.log('[ZC][profile] frame', {
      frames: zcFrameCount,
      avgFrameMs: Number(avg.toFixed(3)),
      minFrameMs: Number(zcMinMs === Infinity ? 0 : zcMinMs.toFixed(3)),
      maxFrameMs: Number(zcMaxMs.toFixed(3)),
      commitEvents: zcCommitCount,
    });

    zcFrameCount = 0;
    zcAccumMs = 0;
    zcMinMs = Infinity;
    zcMaxMs = 0;
    zcCommitCount = 0;
    zcLastLogTs = now;
  }
}

function zcSampleCommit() {
  if (!ZC_PROFILE) return;
  zcCommitCount++;
}

// --- ZoomCoordinator commit debounce ---
let ZC_COMMIT_MIN_INTERVAL_MS = 120; // minimum gap between costly commit passes
try {
  const v = window?.__ZC_COMMIT_MIN_INTERVAL_MS;
  if (Number.isFinite(v)) ZC_COMMIT_MIN_INTERVAL_MS = Math.max(0, v);
} catch {}

function zcGetCommitMinInterval() {
  let v = ZC_COMMIT_MIN_INTERVAL_MS;
  try {
    const w = window?.__ZC_COMMIT_MIN_INTERVAL_MS;
    if (Number.isFinite(w)) v = Math.max(0, w);
  } catch {}
  return v;
}
let zcLastCommitTs = 0;

function zcShouldEmitCommit(now) {
  const minGap = zcGetCommitMinInterval();
  if (!ZC_PROFILE && !minGap) return true;
  if (!minGap) return true;
  if (!zcLastCommitTs) {
    zcLastCommitTs = now;
    return true;
  }
  if ((now - zcLastCommitTs) >= minGap) {
    zcLastCommitTs = now;
    return true;
  }
  return false;
}

function zcPerfEnabled() {
  try { return !!window.__PERF_ZOOM_PROFILE; } catch { return false; }
}

function zcPerfMark(name, dt) {
  if (!zcPerfEnabled()) return;
  try { window.__PerfFrameProf?.mark?.(name, dt); } catch {}
}

function emitZoom(payload) {
  if (!payload) return;
  const __perfOn = zcPerfEnabled();
  const __perfStart = __perfOn && typeof performance !== 'undefined' ? performance.now() : 0;
  const __perfPhase = payload?.phase || (payload?.committing ? 'commit' : 'progress');
  const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();

  if (payload.phase === 'commit' || payload.phase === 'done') {
    if (!zcShouldEmitCommit(now)) return;
    zcSampleCommit();
  }

  let idx = 0;
  for (const fn of listeners) {
    const t0 = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();

    try {
      fn(payload);
    } catch (err) {
      console.warn('[zoom] listener failed', err);
    } finally {
      const t1 = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now();
      const dt = t1 - t0;
      if (ZC_PROFILE && ZC_LISTENER_DEBUG && dt > ZC_LISTENER_LOG_THRESHOLD_MS) {
        const name = fn.__zcName || fn.name || `(listener #${idx})`;
        console.log('[ZC][listener]', {
          name,
          idx,
          phase: payload?.phase,
          dtMs: Number(dt.toFixed(3)),
        });
      }
    }
    idx++;
  }
  if (__perfOn && __perfStart) {
    const __perfEnd = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
    if (__perfEnd) zcPerfMark('zoom.emit.' + __perfPhase, __perfEnd - __perfStart);
  }
}

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

function __zoomGestureLogEnabled() {
  if (!ZC_GESTURE_LOG) return false;
  try {
    if (window.__MT_ZOOM_GESTURE_LOG) return true;
    if (typeof localStorage !== 'undefined' && localStorage.getItem('mt_zoom_gesture_log') === '1') return true;
  } catch {}
  return false;
}

function publishGestureFlag(reason = '') {
  try {
    const flag = {
      mode: state.mode,
      active: state.mode !== 'idle',
      phase:
        state.mode === 'gesturing' ? 'begin' :
        state.mode === 'committing' ? 'commit' :
        'done',
      reason,
      currentScale: state.currentScale,
      targetScale: state.targetScale,
      targetX: state.targetX,
      targetY: state.targetY,
      ts: (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(),
    };

    const prev = window.__ZOOM_GESTURE_FLAG;
    window.__ZOOM_GESTURE_FLAG = flag;
    // Simple global for other modules that only need "are we gesturing?"
    // (DrawGrid particle throttling, anchor throttling, etc.)
    try { window.__GESTURE_ACTIVE = !!flag.active; } catch {}
    try {
      // True during the heavy multi-stage commit pipeline.
      // Remains false during 'progress' gesturing updates.
      window.__ZOOM_COMMIT_PHASE =
        flag.phase === 'freeze' ||
        flag.phase === 'recompute' ||
        flag.phase === 'swap' ||
        flag.phase === 'commit';
    } catch {}

    if (__zoomGestureLogEnabled()) {
      const changed =
        !prev ||
        prev.mode !== flag.mode ||
        prev.active !== flag.active ||
        prev.phase !== flag.phase;

      if (changed) console.debug('[zoom-gesture-flag][change]', flag);
    }
  } catch {}
}

let rafId = 0;
let worldEl = null;
const TRANSFORM_ORDER = 'T_S'; // translate then scale
let progressRaf = 0;
let lastProgressTs = 0;
let progressHz = 30; // ~30fps progress callbacks while pinching/wheeling
let minProgressGapMs = 1000 / progressHz;
let frameStartState = null;
let cameraDirty = false;
const ZC_MATRIX_DEBUG = false; // only read back CSS transform matrix when actively debugging
let lastApplied = { s: null, x: null, y: null };

export function attachWorldElement(el) {
  worldEl = el;
  if (!worldEl) return;
  worldEl.style.transformOrigin = '0 0';
  worldEl.style.willChange = 'transform';
  worldEl.style.transform = 'translate3d(0px, 0px, 0) scale(1)';
  worldEl.dataset.transformOrder = TRANSFORM_ORDER;
}

function normalizeSnapshot(snapshot) {
  const scale = Number.isFinite(snapshot?.scale) ? snapshot.scale : state.currentScale;
  const x = Number.isFinite(snapshot?.x) ? snapshot.x : state.currentX;
  const y = Number.isFinite(snapshot?.y) ? snapshot.y : state.currentY;
  return { scale, x, y };
}

function emitFrameStart(snapshot) {
  if (!frameStartListeners.size) return;
  for (const fn of frameStartListeners) {
    try { fn({ ...snapshot }); } catch (err) { console.warn('[zoom] frameStart listener failed', err); }
  }
}

export function getCommittedState() {
  return normalizeSnapshot({
    scale: state.currentScale,
    x: state.currentX,
    y: state.currentY,
  });
}

export function setFrameStartState(snapshot) {
  frameStartState = normalizeSnapshot(snapshot);
}

export function getFrameStartState() {
  return frameStartState ? { ...frameStartState } : getCommittedState();
}

export function onFrameStart(fn) {
  if (typeof fn !== 'function') return () => {};
  frameStartListeners.add(fn);
  return () => frameStartListeners.delete(fn);
}

export function publishFrameStart() {
  const snapshot = getCommittedState();
  setFrameStartState(snapshot);
  emitFrameStart(snapshot);
}

function roundPx(v) {
  return Math.round(v * 100) / 100; // 0.01px resolution
}

function applyTransform() {
  if (!worldEl) return;
  const s = Math.fround(state.currentScale);
  const x = roundPx(state.currentX);
  const y = roundPx(state.currentY);
  if (s === lastApplied.s && x === lastApplied.x && y === lastApplied.y) return;
  lastApplied = { s, x, y };
  worldEl.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`;

  // Publish CSS vars for any follower layers (runs in the same RAF)
  const st = worldEl.style;
  st.setProperty('--zoom-scale', String(s));
  st.setProperty('--zoom-x', `${x}px`);
  st.setProperty('--zoom-y', `${y}px`);
  // Only read back the computed matrix when explicitly debugging; this can force layout.
  if (ZC_MATRIX_DEBUG) {
    try {
      const matrix = getComputedStyle(worldEl).transform;
      if (worldEl.dataset.lastMatrix !== matrix) {
        worldEl.dataset.lastMatrix = matrix;
        //console.debug('[zoom] css transform', { order: TRANSFORM_ORDER, matrix });
      }
    } catch {}
  }
}

function tick() {
  if (ZC_PERF_DEBUG && typeof console !== 'undefined' && console.time) console.time('[ZC] tick');
  rafId = 0;
  if (!state.isDirty && !cameraDirty) {
    if (ZC_PERF_DEBUG && typeof console !== 'undefined' && console.timeEnd) console.timeEnd('[ZC] tick');
    return;
  }

  if (ZC_PERF_DEBUG && typeof console !== 'undefined' && console.time) console.time('[ZC] computeViewport');
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
  if (ZC_PERF_DEBUG && typeof console !== 'undefined' && console.timeEnd) console.timeEnd('[ZC] computeViewport');

  if (ZC_PERF_DEBUG && typeof console !== 'undefined' && console.time) console.time('[ZC] apply');
  applyTransform();
  publishFrameStart();
  state.isDirty = false;
  cameraDirty = false;
  if (ZC_PERF_DEBUG && typeof console !== 'undefined' && console.timeEnd) console.timeEnd('[ZC] apply');

  if (ZC_PERF_DEBUG && typeof console !== 'undefined' && console.time) console.time('[ZC] listeners');
  // notify listeners AFTER transform
  const payload = (state.mode === 'gesturing')
    ? { ...state, phase: 'progress', gesturing: true }
    : { ...state };
  emitZoom(payload);
  if (ZC_PERF_DEBUG && typeof console !== 'undefined' && console.timeEnd) console.timeEnd('[ZC] listeners');
  if (ZC_PERF_DEBUG && typeof console !== 'undefined' && console.timeEnd) console.timeEnd('[ZC] tick');
}

function schedule() {
  if (!tick.__perfRafTag) tick.__perfRafTag = 'perf.raf.zoomTick';
  if (!rafId) rafId = requestAnimationFrame(tick);
}

function startProgressLoop() {
  if (progressRaf) return;
  const loop = (ts) => {
    progressRaf = 0;
    if (state.mode !== 'gesturing') return;
    if (!lastProgressTs || (ts - lastProgressTs) >= minProgressGapMs) {
      lastProgressTs = ts || performance.now();
      const payload = { ...state, phase: 'progress', gesturing: true };
      emitZoom(payload);
    }
    progressRaf = requestAnimationFrame(loop);
  };
  loop.__perfRafTag = 'perf.raf.zoomProgress';
  progressRaf = requestAnimationFrame(loop);
}

function stopProgressLoop() {
  if (progressRaf) cancelAnimationFrame(progressRaf);
  progressRaf = 0;
  lastProgressTs = 0;
}

export function setGestureTransform({ scale, x, y }) {
  state.mode = 'gesturing';
  publishGestureFlag('setGestureTransform');
  const nextScale = Number.isFinite(scale) ? scale : state.targetScale;
  const nextX = Number.isFinite(x) ? x : state.targetX;
  const nextY = Number.isFinite(y) ? y : state.targetY;
  const prevScale = state.targetScale;
  const prevX = state.targetX;
  const prevY = state.targetY;
  const changed =
    !Number.isFinite(prevScale) ||
    !Number.isFinite(prevX) ||
    !Number.isFinite(prevY) ||
    Math.abs(nextScale - prevScale) > 1e-4 ||
    Math.abs(nextX - prevX) > 0.25 ||
    Math.abs(nextY - prevY) > 0.25;
  state.targetScale = nextScale;
  state.targetX = nextX;
  state.targetY = nextY;
  if (changed) {
    state.isDirty = true;
    cameraDirty = true;
    schedule();
  }
}

// Atomic commit: freeze visual transform, let toys recompute offscreen, then unfreeze.
// Ensures no 1-frame overshoot/undershoot between CSS transform and new backing stores.
let atomicCommitId = 0;

export function commitGesture({ scale, x, y }, { delayMs = 80 } = {}) {
  // Do NOT change transform targets here if setGestureTransform already set them this frame.
  // We only broadcast a "freeze -> recompute -> swap" protocol.

  stopProgressLoop();
  state.mode = 'committing';
  publishGestureFlag('commitGesture');
  // Keep target == last gesture values (assumed already set via setGestureTransform)
  // but mark dirty so we reapply exact transform (no rounding drift).
  state.isDirty = true;
  cameraDirty = true;
  schedule();

  const id = ++atomicCommitId;

  // Phase A (freeze): add a class so CSS can disable transitions/animations if any.
  document.documentElement.classList.add('zoom-commit-freeze');

  // Notify listeners that a commit is starting (freeze point: do NOT resize canvases yet).
  emitZoom({ ...state, committing: true, phase: 'freeze' });

  // Phase B on next RAF: allow heavy recompute OFFSCREEN (double buffers) but keep transform frozen.
  requestAnimationFrame(() => {
    if (id !== atomicCommitId) return;
    emitZoom({ ...state, committing: true, phase: 'recompute' });

    // Phase C on next RAF: swap buffers and unfreeze soon after to avoid paint/flicker
    requestAnimationFrame(() => {
      if (id !== atomicCommitId) return;
      emitZoom({ ...state, committing: true, phase: 'swap' });
      try { publishFrameStart(); } catch {}
      // (removed) overlay:instant-once was causing post-commit snaps
      // console.debug('[zoom][commit] swap (no overlay snaps)');

      // Small timeout gives Safari a breath to present the new pixels before any other layout.
      setTimeout(() => {
        const t0 = (typeof performance !== 'undefined' && typeof performance.now === 'function')
          ? performance.now()
          : Date.now();

        if (id !== atomicCommitId) return;
        state.mode = 'idle';
        publishGestureFlag('commitDone');
        document.documentElement.classList.remove('zoom-commit-freeze');
        // Final "committed" notification (single post-commit redraw if anyone needs it)
        const payload = { ...state, committed: true, phase: 'done' };
        const suppressDone = (() => { try { return !!window.__ZC_SUPPRESS_DONE_NOTIFY; } catch {} return false; })();
        if (!suppressDone) {
          emitZoom(payload);
          try { publishFrameStart(); } catch {}
        }
        // (removed) overlay:instant-once was causing post-commit snaps
        // console.debug('[zoom][commit] done (no overlay snaps)');

        const t1 = (typeof performance !== 'undefined' && typeof performance.now === 'function')
          ? performance.now()
          : Date.now();
        zcSampleFrame(t1 - t0);
      }, delayMs);
    });
  });
}

export function onZoomChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function namedZoomListener(name, fn) {
  if (typeof fn !== 'function') return fn;
  try { fn.__zcName = String(name || fn.name || 'zoom-listener'); } catch {}
  return fn;
}

export function zcIsCommitPhase(p) {
  const ph = p?.phase;
  return ph === 'freeze' || ph === 'recompute' || ph === 'swap' || ph === 'done' || ph === 'commit';
}

export function getZoomState() {
  return { ...state };
}

export function getTransformOrder() {
  return TRANSFORM_ORDER;
}

setFrameStartState(getCommittedState());
