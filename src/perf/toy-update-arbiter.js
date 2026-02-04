// src/perf/toy-update-arbiter.js
// Enforcement mechanism for the toy performance contract.
//
// Installs window.__ToyUpdateArbiter with:
//   - getDecision(panel, kind, nowTs)
//   - noteInteraction(panel, nowTs)
//
// Toys should call getDecision() at the top of their rAF tick and skip expensive
// work when asked.

import { getViewportElement } from '../board-viewport.js';
import { decideToyPerfMode, fpsToFrameModulo } from './toy-performance-contract.js';

const VIS_CACHE_MS = 250;

function nowMs() {
  return (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();
}

function safeRect(el) {
  try {
    return el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
  } catch {
    return null;
  }
}

function rectsOverlap(a, b, pad = 0) {
  if (!a || !b) return false;
  const ax1 = a.left - pad;
  const ay1 = a.top - pad;
  const ax2 = a.right + pad;
  const ay2 = a.bottom + pad;
  const bx1 = b.left;
  const by1 = b.top;
  const bx2 = b.right;
  const by2 = b.bottom;
  return (ax1 < bx2) && (ax2 > bx1) && (ay1 < by2) && (ay2 > by1);
}

function isPanelFocused(panel) {
  try {
    if (typeof window !== 'undefined' && window.__toyFocused) {
      return window.__toyFocused === panel;
    }
  } catch {}
  try {
    if (panel?.classList?.contains('toy-zoomed')) return true;
    if (panel?.classList?.contains('toy-focused')) return true;
  } catch {}
  return false;
}

function isPanelPlaying(panel) {
  try {
    if (panel?.classList?.contains('toy-playing')) return true;
  } catch {}
  return false;
}

function isGesturing() {
  try {
    // Prefer the project-wide flag set in main.js (most reliable).
    if (typeof window !== 'undefined' && window.__mtZoomGesturing) return true;
  } catch {}
  try {
    if (window.__ZoomCoordinator?.isGesturing?.()) return true;
  } catch {}
  try {
    if (document.body?.classList?.contains?.('is-gesturing')) return true;
  } catch {}
  return false;
}

function getPulseValue(panel) {
  try {
    return Number(panel?.__pulseHighlight) || 0;
  } catch {
    return 0;
  }
}

function ensureGlobal() {
  const g = (typeof window !== 'undefined') ? window : null;
  if (!g) return null;
  if (g.__ToyUpdateArbiter) return g.__ToyUpdateArbiter;

  const st = {
    // WeakMap(panel -> { lastInteractTs })
    perPanel: new WeakMap(),
    // WeakMap(panel -> { ts, visible })
    visCache: new WeakMap(),
  };

  function noteInteraction(panel, ts = nowMs()) {
    if (!panel) return;
    const rec = st.perPanel.get(panel) || {};
    rec.lastInteractTs = ts;
    st.perPanel.set(panel, rec);
  }

  function getVisible(panel, ts = nowMs()) {
    if (!panel) return false;
    const cached = st.visCache.get(panel);
    if (cached && (ts - cached.ts) <= VIS_CACHE_MS) return !!cached.visible;

    const vp = getViewportElement();
    const vpRect = safeRect(vp) || {
      left: 0,
      top: 0,
      right: (typeof window !== 'undefined' ? window.innerWidth : 0) || 0,
      bottom: (typeof window !== 'undefined' ? window.innerHeight : 0) || 0,
    };
    const r = safeRect(panel);
    const visible = !!r && rectsOverlap(r, vpRect, 60);
    st.visCache.set(panel, { ts, visible });
    return visible;
  }

  function getDecision(panel, kind = 'toy', ts = nowMs()) {
    const rec = st.perPanel.get(panel) || {};
    const lastInteractTs = Number.isFinite(rec.lastInteractTs) ? rec.lastInteractTs : -Infinity;
    const recentlyInteractedMs = ts - lastInteractTs;

    const visible = getVisible(panel, ts);
    const focused = isPanelFocused(panel);
    const playing = isPanelPlaying(panel);
    const gesturing = isGesturing();
    const hasPulse = getPulseValue(panel) > 0;

    const policy = decideToyPerfMode({
      visible,
      focused,
      playing,
      gesturing,
      hasPulse,
      recentlyInteractedMs,
    });

    const frameModulo = (policy.mode === 'frozen')
      ? fpsToFrameModulo(policy.targetFps, 60)
      : 1;

    return {
      kind,
      mode: policy.mode,
      reason: policy.reason,
      targetFps: policy.targetFps,
      frameModulo,
      visible,
      focused,
      playing,
      gesturing,
      hasPulse,
      recentlyInteractedMs,
    };
  }

  // Global interaction hook: any pointerdown inside a toy-panel counts.
  try {
    document.addEventListener('pointerdown', (e) => {
      const panel = e?.target?.closest?.('.toy-panel');
      if (panel) noteInteraction(panel);
    }, { capture: true, passive: true });
  } catch {}

  g.__ToyUpdateArbiter = {
    noteInteraction,
    getDecision,
  };

  return g.__ToyUpdateArbiter;
}

// Install immediately on import.
ensureGlobal();
