// src/drawgrid.js
// Minimal, scoped Drawing Grid -- 16x12, draw strokes, build snapped nodes on release.
// Strictly confined to the provided panel element.
import { buildPalette, midiToName } from './note-helpers.js';
import { drawBlock } from './toyhelpers.js';
import { getLoopInfo, isRunning } from './audio-core.js';
import { onZoomChange, getZoomState, getFrameStartState, onFrameStart, namedZoomListener } from './zoom/ZoomCoordinator.js';
import { createParticleViewport } from './particles/particle-viewport.js';
import { createField } from './particles/field-generic.js';
import { getParticleBudget, getAdaptiveFrameBudget, getParticleCap } from './particles/ParticleQuality.js';
import { overviewMode } from './overview-mode.js';
import { boardScale as boardScaleHelper } from './board-scale-helpers.js';
import { beginFrameLayoutCache, getRect } from './layout-cache.js';
import { makeDebugLogger } from './debug-flags.js';
import { startSection } from './perf-meter.js';
import { traceCanvasResize } from './perf/PerfTrace.js';
import {
  fillGapsInNodeArray,
  findChainHead,
  chainHasSequencedNotes,
  normalizeMapColumns,
} from './drawgrid/dg-chain-utils.js';
import {
  __dgIsGesturing,
  getGlobalAdaptiveState,
  __dgAdaptiveTickMs,
  updateAdaptiveShared,
  startAdaptiveSharedTicker,
  __dgZoomScale,
  globalDrawgridState,
} from './drawgrid/dg-adaptive.js';
import {
  HeaderSweepForce,
  createDGTuning,
  dbgPoke,
  __dgLogFirstPoke,
} from './drawgrid/dg-tuning.js';
import {
  createDrawLabelOverlay,
  updateDrawLabelLayout,
  destroyDrawLabelOverlay,
} from './drawgrid/dg-dom-label.js';
import { installGeneratorButtons } from './drawgrid/dg-generators-ui.js';
import { createActiveCanvasHelpers } from './drawgrid/dg-canvas-active.js';
import { createDgPaintBuffers } from './drawgrid/dg-paint-buffers.js';
import { createDgPlayheadSprites } from './drawgrid/dg-playhead-sprites.js';
import {
  createDgPersist,
  computeCurrentMapNodeStats,
  computeSerializedNodeStats,
} from './drawgrid/dg-persist.js';
import { createDgRenderUtils } from './drawgrid/dg-render-utils.js';
import { createDgFlowTrace } from './drawgrid/dg-flow-trace.js';
import { createDgFlowDebug } from './drawgrid/dg-flow-debug.js';
import { createDgHydrationHelpers } from './drawgrid/dg-hydration-helpers.js';
import { createDgParticles } from './drawgrid/dg-particles.js';
import { createDgFieldForces } from './drawgrid/dg-field-forces.js';
import { createDgRandomizers } from './drawgrid/dg-randomizers.js';
import { requestPanelPulse } from './pulse-border.js';
import { queueClassToggle, markPanelForDomCommit } from './dom-commit.js';
import { createToySurfaceManager } from './toy-surface-manager.js';
import { getAutoQualityScale } from './perf/AutoQualityController.js';
import {
  DRAWGRID_ENABLE_PARTICLE_FIELD,
  DG_ALPHA_DEBUG,
  DG_ALPHA_SPAM_MS,
  DG_DEBUG,
  DG_FRAME_DEBUG,
  DG_GHOST_DEBUG,
  DG_LAYOUT_DEBUG,
  DG_SWAP_DEBUG,
  DG_TRACE_DEBUG,
  DG,
  DBG_DRAW,
  DG_CLEAR_DEBUG,
  DG_INK_DEBUG,
  createDGDebugHelpers,
  dbg,
  dbgCounters,
  dgAlphaState,
  dgLogLine,
  dgTraceLog,
  dgTraceWarn,
  dglog,
  dgf,
  dgs,
} from './drawgrid/dg-debug.js';

const drawgridLog = makeDebugLogger('mt_debug_logs', 'log');

// Lightweight trace helpers (opt-in via console):
//   window.__DG_INPUT_TRACE = true   // pointer event flow + drawing state
//   window.__DG_GHOST_TRACE = true   // ghost guide sweeps + sizing/scale
//   window.__DG_CANVAS_SCALE_TRACE = true // logs only when canvas scale signature changes
//   window.__DG_NODE_SCALE_TRACE = true   // logs only when node scale inputs change
//   window.__DG_RENDER_SCALE_TRACE = true // logs only when key render-basis inputs change
if (typeof window !== 'undefined' && window.__DG_INPUT_TRACE == null) {
  window.__DG_INPUT_TRACE = false;
}
if (typeof window !== 'undefined' && window.__DG_GHOST_TRACE == null) {
  window.__DG_GHOST_TRACE = false;
}
if (typeof window !== 'undefined' && window.__DG_CANVAS_SCALE_TRACE == null) {
  window.__DG_CANVAS_SCALE_TRACE = false;
}
if (typeof window !== 'undefined' && window.__DG_NODE_SCALE_TRACE == null) {
  window.__DG_NODE_SCALE_TRACE = false;
}
if (typeof window !== 'undefined' && window.__DG_RENDER_SCALE_TRACE == null) {
  window.__DG_RENDER_SCALE_TRACE = false;
}
// Optional: more verbose random-trace logging.
//   window.__DG_RANDOM_TRACE_VERBOSE = true
if (typeof window !== 'undefined' && window.__DG_RANDOM_TRACE_VERBOSE == null) {
  window.__DG_RANDOM_TRACE_VERBOSE = false;
}
// Optional: include stacks for scale-change logs.
//   window.__DG_CANVAS_SCALE_TRACE_STACK = true
if (typeof window !== 'undefined' && window.__DG_CANVAS_SCALE_TRACE_STACK == null) {
  window.__DG_CANVAS_SCALE_TRACE_STACK = false;
}
// Optional: include stacks for node-scale logs.
//   window.__DG_NODE_SCALE_TRACE_STACK = true
if (typeof window !== 'undefined' && window.__DG_NODE_SCALE_TRACE_STACK == null) {
  window.__DG_NODE_SCALE_TRACE_STACK = false;
}
// Optional: include stacks for render-scale logs.
//   window.__DG_RENDER_SCALE_TRACE_STACK = true
if (typeof window !== 'undefined' && window.__DG_RENDER_SCALE_TRACE_STACK == null) {
  window.__DG_RENDER_SCALE_TRACE_STACK = false;
}
if (typeof window !== 'undefined' && window.__DG_PARTICLE_BOOT_DEBUG == null) {
  window.__DG_PARTICLE_BOOT_DEBUG = true;
}
// Optional: include stacks for key ghost-guide start/stop events.
//   window.__DG_GHOST_TRACE_STACK = true
if (typeof window !== 'undefined' && window.__DG_GHOST_TRACE_STACK == null) {
  window.__DG_GHOST_TRACE_STACK = false;
}
let __dgInputTraceArmed = false;
let __dgGhostTraceArmed = false;
function dgInputTrace(tag, data = null) {
  try {
    if (typeof window !== 'undefined' && window.__DG_INPUT_TRACE) {
      // NOTE: makeDebugLogger may not output to console; force console visibility too.
      if (!__dgInputTraceArmed) {
        __dgInputTraceArmed = true;
        try { console.log('[DG][input] TRACE ARMED'); } catch {}
      }
      try { console.log(`[DG][input] ${tag}`, data || {}); } catch {}
      try { drawgridLog(`[DG][input] ${tag}`, data || {}); } catch {}
    }
  } catch {}
}
function dgGhostTrace(tag, data = null) {
  try {
    if (typeof window !== 'undefined' && window.__DG_GHOST_TRACE) {
      if (!__dgGhostTraceArmed) {
        __dgGhostTraceArmed = true;
        try { console.log('[DG][ghost] TRACE ARMED'); } catch {}
      }
      try { console.log(`[DG][ghost] ${tag}`, data || {}); } catch {}
      try { drawgridLog(`[DG][ghost] ${tag}`, data || {}); } catch {}
    }
  } catch {}
}

function dgParticleBootLog(tag, data = null) {
  try {
    if (typeof window === 'undefined' || !window.__DG_PARTICLE_BOOT_DEBUG) return;
    const payload = data || {};
    console.log(`[DG][particles] ${tag}`, JSON.stringify(payload));
  } catch {}
}

// --- Non-spammy canvas scale trace -------------------------------------------
let __dgScaleTraceArmed = false;
let __dgScaleTraceLastSig = '';
let __dgScaleTraceLastMismatchSig = '';
let __dgScaleSigMap = null;
let __dgNodeScaleSigLast = '';
let __dgRenderScaleSigLast = '';
let __dgPointerSigLast = '';
function dgScaleTrace(tag, data = null) {
  try {
    if (typeof window === 'undefined' || !window.__DG_CANVAS_SCALE_TRACE) return;
    if (!__dgScaleTraceArmed) {
      __dgScaleTraceArmed = true;
      try { console.log('[DG][scale] TRACE ARMED'); } catch {}
    }

    const payload = data || {};
    // Only log when the "signature" changes (rounded ratios to avoid float jitter spam).
    const sig = (() => {
      try {
        return JSON.stringify(payload);
      } catch {
        return String(tag);
      }
    })();
    if (sig === __dgScaleTraceLastSig) return;
    __dgScaleTraceLastSig = sig;

    let stack = null;
    try {
      if (window.__DG_CANVAS_SCALE_TRACE_STACK) {
        const e = new Error(`DG scale trace: ${tag}`);
        stack = e?.stack || null;
      }
    } catch {}

    try { console.log(`[DG][scale] ${tag}`, payload, stack ? { stack } : ''); } catch {}
    try { drawgridLog(`[DG][scale] ${tag}`, payload); } catch {}
  } catch {}
}

function __dgStableStringify(obj) {
  try {
    const seen = new WeakSet();
    return JSON.stringify(obj, (k, v) => {
      if (v && typeof v === 'object') {
        if (seen.has(v)) return '[Circular]';
        seen.add(v);
      }
      return v;
    });
  } catch {
    try { return String(obj); } catch { return '[unstringifiable]'; }
  }
}

function __dgMaybeTraceStack(flagName, label) {
  try {
    if (typeof window === 'undefined' || !window[flagName]) return null;
    const e = new Error(label);
    return { stack: String(e.stack || '') };
  } catch {
    return null;
  }
}

function dgNodeScaleTrace(tag, payload) {
  try {
    if (typeof window === 'undefined' || !window.__DG_NODE_SCALE_TRACE) return;
    const sig = __dgStableStringify(payload);
    if (sig === __dgNodeScaleSigLast) return;
    __dgNodeScaleSigLast = sig;
    const stack = __dgMaybeTraceStack('__DG_NODE_SCALE_TRACE_STACK', `DG node scale trace: ${tag}`);
    if (stack) console.log(`[DG][nodeScale] ${tag}`, payload, stack);
    else console.log(`[DG][nodeScale] ${tag}`, payload);
    if (window.__DG_NODE_SCALE_TRACE_VERBOSE) {
      try { console.log(`[DG][nodeScale] ${tag} verbose`, sig); } catch {}
    }
  } catch {}
}

function dgRenderScaleTrace(tag, payload) {
  try {
    if (typeof window === 'undefined' || !window.__DG_RENDER_SCALE_TRACE) return;
    const sig = __dgStableStringify(payload);
    if (sig === __dgRenderScaleSigLast) return;
    __dgRenderScaleSigLast = sig;
    const stack = __dgMaybeTraceStack('__DG_RENDER_SCALE_TRACE_STACK', `DG render scale trace: ${tag}`);
    if (stack) console.log(`[DG][renderScale] ${tag}`, payload, stack);
    else console.log(`[DG][renderScale] ${tag}`, payload);
  } catch {}
}

function __dgQuantRatio(n, step = 0.01) {
  const v = Number(n);
  const s = Number(step) || 0.01;
  if (!Number.isFinite(v)) return null;
  return Math.round(v / s) * s;
}

function __dgDescribeCanvasScale(el, wrapRect) {
  try {
    if (!el || !el.getBoundingClientRect) return null;
    const r = el.getBoundingClientRect();
    const ww = wrapRect?.width || 0;
    const wh = wrapRect?.height || 0;
    const rectW = r?.width || 0;
    const rectH = r?.height || 0;
    const ratioW = (ww > 0 && rectW > 0) ? rectW / ww : null;
    const ratioH = (wh > 0 && rectH > 0) ? rectH / wh : null;
    // "effective DPR" based on rect, not cssW (catches “rect drift” bugs).
    const effDprW = (rectW > 0 && el.width > 0) ? el.width / rectW : null;
    const effDprH = (rectH > 0 && el.height > 0) ? el.height / rectH : null;
    return {
      rectW: Math.round(rectW),
      rectH: Math.round(rectH),
      ratioW: __dgQuantRatio(ratioW, 0.01),
      ratioH: __dgQuantRatio(ratioH, 0.01),
      effDprW: __dgQuantRatio(effDprW, 0.01),
      effDprH: __dgQuantRatio(effDprH, 0.01),
      pxW: el.width || 0,
      pxH: el.height || 0,
      clientW: el.clientWidth || 0,
      clientH: el.clientHeight || 0,
      tsmCssW: Number.isFinite(el.__tsmCssW) ? el.__tsmCssW : null,
      tsmCssH: Number.isFinite(el.__tsmCssH) ? el.__tsmCssH : null,
      dgCssW: Number.isFinite(el.__dgCssW) ? el.__dgCssW : null,
      dgCssH: Number.isFinite(el.__dgCssH) ? el.__dgCssH : null,
      cssW: el.style?.width || null,
      cssH: el.style?.height || null,
      // Inline styles are often empty; include computed styles too (catches clobbers).
      csW: (() => { try { return (typeof getComputedStyle === 'function') ? (getComputedStyle(el)?.width || null) : null; } catch { return null; } })(),
      csH: (() => { try { return (typeof getComputedStyle === 'function') ? (getComputedStyle(el)?.height || null) : null; } catch { return null; } })(),
      csTransform: (() => { try { return (typeof getComputedStyle === 'function') ? (getComputedStyle(el)?.transform || null) : null; } catch { return null; } })(),
    };
  } catch {
    return null;
  }
}

function __dgDescribeDomPath(el, stopEl, maxDepth = 8) {
  try {
    const out = [];
    let cur = el;
    let depth = 0;
    while (cur && depth < maxDepth) {
      const role = cur?.getAttribute?.('data-role') || null;
      const cls = (cur?.className && typeof cur.className === 'string') ? cur.className : null;
      const tag = cur?.tagName ? String(cur.tagName).toLowerCase() : null;
      let t = null, w = null, h = null;
      try {
        if (typeof getComputedStyle === 'function') {
          const cs = getComputedStyle(cur);
          t = cs?.transform || null;
          w = cs?.width || null;
          h = cs?.height || null;
        }
      } catch {}
      out.push({ tag, role, cls, w, h, t });
      if (stopEl && cur === stopEl) break;
      cur = cur.parentElement;
      depth++;
    }
    return out;
  } catch {
    return null;
  }
}

function __dgGetCanvasSizingSnapshot(canvas) {
  try {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect?.();
    const cssW = canvas.style?.width || null;
    const cssH = canvas.style?.height || null;
    const cssWNum = cssW ? (parseFloat(cssW) || 0) : 0;
    const cssHNum = cssH ? (parseFloat(cssH) || 0) : 0;
    const clientW = canvas.clientWidth || 0;
    const clientH = canvas.clientHeight || 0;
    const rectW = rect?.width || 0;
    const rectH = rect?.height || 0;
    const pxW = canvas.width || 0;
    const pxH = canvas.height || 0;
    const basisW = cssWNum || clientW || rectW || 0;
    const basisH = cssHNum || clientH || rectH || 0;
    return {
      role: canvas?.getAttribute?.('data-role') || null,
      pxW,
      pxH,
      rectW: Math.round(rectW),
      rectH: Math.round(rectH),
      cssW,
      cssH,
      clientW,
      clientH,
      tsmCssW: Number.isFinite(canvas.__tsmCssW) ? canvas.__tsmCssW : null,
      tsmCssH: Number.isFinite(canvas.__tsmCssH) ? canvas.__tsmCssH : null,
      dgCssW: Number.isFinite(canvas.__dgCssW) ? canvas.__dgCssW : null,
      dgCssH: Number.isFinite(canvas.__dgCssH) ? canvas.__dgCssH : null,
      effDprW: (basisW > 0 && pxW > 0) ? +(pxW / basisW).toFixed(3) : null,
      effDprH: (basisH > 0 && pxH > 0) ? +(pxH / basisH).toFixed(3) : null,
    };
  } catch {
    return null;
  }
}

function __dgPaintDebugLog(tag, extra = null) {
  try {
    if (typeof window === 'undefined' || !window.__DG_PAINT_DEBUG) return;
    const active = (typeof getActivePaintCanvas === 'function') ? getActivePaintCanvas() : null;
    let pctxTransform = null;
    try {
      if (pctx && typeof pctx.getTransform === 'function') {
        const t = pctx.getTransform();
        pctxTransform = { a: t.a, b: t.b, c: t.c, d: t.d, e: t.e, f: t.f };
      }
    } catch {}
    const payload = {
      panelId: panel?.id || null,
      tag,
      usingBackBuffers,
      paintDpr,
      cssW,
      cssH,
      pctxRole: pctx?.canvas?.getAttribute?.('data-role') || null,
      activeRole: active?.getAttribute?.('data-role') || null,
      frontW: frontCanvas?.width || 0,
      frontH: frontCanvas?.height || 0,
      backW: backCanvas?.width || 0,
      backH: backCanvas?.height || 0,
      frontClientW: frontCanvas?.clientWidth || 0,
      frontClientH: frontCanvas?.clientHeight || 0,
      frontEffDpr: (cssW && frontCanvas?.width) ? +(frontCanvas.width / cssW).toFixed(3) : null,
      backEffDpr: (cssW && backCanvas?.width) ? +(backCanvas.width / cssW).toFixed(3) : null,
      pctxTransform,
    };
    if (extra && typeof extra === 'object') {
      Object.assign(payload, extra);
    }
    if (window.__DG_PAINT_SAMPLE && gridArea && gridArea.w > 0 && gridArea.h > 0) {
      const sx = Math.round(gridArea.x + gridArea.w * 0.5);
      const sy = Math.round(gridArea.y + topPad + (gridArea.h - topPad) * 0.5);
      payload.sample = {
        x: sx,
        y: sy,
        front: __dgSampleAlpha(frontCtx, sx, sy),
        back: __dgSampleAlpha(backCtx, sx, sy),
      };
    }
    console.log('[DG][paintDBG]', JSON.stringify(payload));
  } catch {}
}


function __dgScaleMismatchSummary(sigPayload) {
  try {
    const paint = sigPayload?.paint || null;
    const nodes = sigPayload?.nodes || null;
    const playhead = sigPayload?.playhead || null;
    const wrap = sigPayload?.wrap || null;

    const pw = paint?.ratioW;
    const ph = paint?.ratioH;
    const nw = nodes?.ratioW;
    const nh = nodes?.ratioH;

    // If we can’t compute ratios, don’t report mismatch.
    if (!Number.isFinite(pw) || !Number.isFinite(ph) || !Number.isFinite(nw) || !Number.isFinite(nh)) {
      return null;
    }

    // A “scaled smaller” bug should show up as nodes ratio < paint ratio (or generally ratios diverging).
    const dW = Math.abs(pw - nw);
    const dH = Math.abs(ph - nh);
    const mismatch = (dW >= 0.02) || (dH >= 0.02);

    if (!mismatch) return null;

    // Keep this intentionally tiny + actionable.
    return {
      panelId: sigPayload?.panelId || null,
      reason: sigPayload?.reason || null,
      zoomMode: sigPayload?.zoomMode || null,
      paintDpr: sigPayload?.paintDpr || null,
      wrap,
      paint: { rectW: paint?.rectW, rectH: paint?.rectH, ratioW: pw, ratioH: ph, effDprW: paint?.effDprW, effDprH: paint?.effDprH },
      nodes: { rectW: nodes?.rectW, rectH: nodes?.rectH, ratioW: nw, ratioH: nh, effDprW: nodes?.effDprW, effDprH: nodes?.effDprH },
      // Playhead is a frequent “got out of sync” canary; include if present.
      playhead: playhead ? { rectW: playhead?.rectW, rectH: playhead?.rectH, ratioW: playhead?.ratioW, ratioH: playhead?.ratioH } : null,
    };
  } catch {
    return null;
  }
}

function __dgEmitScaleMismatchIfChanged(sigPayload) {
  try {
    if (typeof window === 'undefined' || !window.__DG_CANVAS_SCALE_TRACE) return;
    const summary = __dgScaleMismatchSummary(sigPayload);
    const sig = (() => {
      try { return JSON.stringify(summary || { ok: true }); } catch { return String(!!summary); }
    })();
    if (sig === __dgScaleTraceLastMismatchSig) return;
    __dgScaleTraceLastMismatchSig = sig;
    if (!summary) return;
    // Add path info only at the point we log (still non-spammy; only on mismatch signature change).
    let extra = null;
    try {
      const panelId = sigPayload?.panelId || null;
      const panel = panelId ? document.getElementById(panelId) : null;
      const wrap = panel?.__dgWrap || panel?.querySelector?.('.drawgrid-size-wrap') || null;
      const paintEl = panel?.querySelector?.('canvas[data-role="drawgrid-paint"]') || null;
      const nodesEl = panel?.querySelector?.('canvas[data-role="drawgrid-nodes"]') || null;
      extra = {
        paintPath: paintEl ? __dgDescribeDomPath(paintEl, wrap) : null,
        nodesPath: nodesEl ? __dgDescribeDomPath(nodesEl, wrap) : null,
      };
    } catch {}
    try { console.warn('[DG][scale] MISMATCH', summary, extra || ''); } catch {}
    try { drawgridLog('[DG][scale] MISMATCH', summary); } catch {}
  } catch {}
}

function __dgGhostMaybeStack(label = 'DG ghost trace') {
  try {
    if (typeof window === 'undefined') return null;
    if (!window.__DG_GHOST_TRACE_STACK) return null;
    const e = new Error(label);
    return e?.stack || null;
  } catch {
    return null;
  }
}

// Lightweight canvas scale trace helpers (opt-in via console):
//   window.__DG_CANVAS_SCALE_TRACE = true        // logs only when a layer's effective scale changes
//   window.__DG_CANVAS_SCALE_TRACE_STACK = true  // include a short stack for the change event
if (typeof window !== 'undefined' && window.__DG_CANVAS_SCALE_TRACE == null) {
  window.__DG_CANVAS_SCALE_TRACE = false;
}
if (typeof window !== 'undefined' && window.__DG_CANVAS_SCALE_TRACE_STACK == null) {
  window.__DG_CANVAS_SCALE_TRACE_STACK = false;
}

let __dgCanvasScaleTraceArmed = false;
let __dgCanvasScaleSigMap = null;

function dgCanvasScaleTrace(tag, data = null) {
  try {
    if (typeof window !== 'undefined' && window.__DG_CANVAS_SCALE_TRACE) {
      if (!__dgCanvasScaleTraceArmed) {
        __dgCanvasScaleTraceArmed = true;
        try { console.log('[DG][scale] TRACE ARMED'); } catch {}
      }
      try { console.log(`[DG][scale] ${tag}`, data || {}); } catch {}
      try { drawgridLog(`[DG][scale] ${tag}`, data || {}); } catch {}
    }
  } catch {}
}

function __dgScaleMaybeStack(label = 'DG scale trace') {
  try {
    if (typeof window === 'undefined') return null;
    if (!window.__DG_CANVAS_SCALE_TRACE_STACK) return null;
    const e = new Error(label);
    return e?.stack || null;
  } catch {
    return null;
  }
}

function __dgReadElemScaleSig(el) {
  try {
    if (!el) return null;
    const rect = el.getBoundingClientRect?.();
    const rectW = Math.max(0, Math.round((rect?.width || 0) * 10) / 10);
    const rectH = Math.max(0, Math.round((rect?.height || 0) * 10) / 10);
    const clientW = Math.max(0, Math.round(((el.clientWidth ?? 0) || 0) * 10) / 10);
    const clientH = Math.max(0, Math.round(((el.clientHeight ?? 0) || 0) * 10) / 10);
    const styleW = (el.style && el.style.width) ? String(el.style.width) : '';
    const styleH = (el.style && el.style.height) ? String(el.style.height) : '';
    let transform = '';
    try {
      const cs = (typeof getComputedStyle === 'function') ? getComputedStyle(el) : null;
      transform = cs ? String(cs.transform || '') : '';
    } catch {}
    const sx = (clientW > 0) ? Math.round((rectW / clientW) * 1000) / 1000 : null;
    const sy = (clientH > 0) ? Math.round((rectH / clientH) * 1000) / 1000 : null;
    return {
      rectW, rectH, clientW, clientH,
      sx, sy,
      styleW, styleH,
      transform,
      sig: `${clientW}x${clientH}|${rectW}x${rectH}|${styleW}|${styleH}|${transform}`,
    };
  } catch {
    return null;
  }
}

// Non-spammy: only logs when a layer's effective CSS/rect scale signature changes.
function __dgTraceCanvasScaleSnapshot(reason, panelId, roles) {
  try {
    if (typeof window === 'undefined' || !window.__DG_CANVAS_SCALE_TRACE) return;
    if (!__dgCanvasScaleSigMap) __dgCanvasScaleSigMap = new Map();
    const changed = [];
    for (const entry of (roles || [])) {
      const role = entry?.role || 'unknown';
      const el = entry?.el;
      const snap = __dgReadElemScaleSig(el);
      if (!snap) continue;
      const key = `${panelId || 'panel'}|${role}`;
      const prev = __dgCanvasScaleSigMap.get(key);
      if (prev !== snap.sig) {
        __dgCanvasScaleSigMap.set(key, snap.sig);
        changed.push({ role, ...snap });
      }
    }
    if (changed.length) {
      dgCanvasScaleTrace('snapshot', { panelId, reason, changed, stack: __dgScaleMaybeStack(`DG scale trace: ${reason}`) });
    }
  } catch {}
}

// --- Canvas DPR helpers ------------------------------------------------------
// Some panels reduce backing-store DPR (visual/pressure/small-panel multipliers).
// If we draw in logical space assuming paintDpr=1 but a canvas backing store is
// actually smaller (e.g. 0.6 DPR), ghost strokes will "scale wrong", often on later sweeps/trails.
function __dgGetCanvasDprFromCss(canvas, cssW, fallback = 1) {
  try {
    const cw = canvas?.width || 0;
    const ch = canvas?.height || 0;

    // IMPORTANT (zoom-safe):
    // Do NOT use getBoundingClientRect() here. During zoom/pan, it reflects transformed
    // geometry and will make DPR estimates change with camera zoom (causing nodes/lines/text
    // to shrink/grow relative to other layers).
    //
    // Prefer the caller's CSS size (derived from stable layout), then our cached size,
    // then computedStyle as a last resort.
    //
    // IMPORTANT:
    // We have seen cases where per-canvas cached CSS sizes (canvas.__dgCssW/H) drift
    // across refresh/gesture transitions (especially when canvases get swapped or
    // styles are rewritten). If we trust a stale cached width, DPR estimation becomes
    // wrong and you get exactly the reported symptoms:
    //   - nodes/labels/connectors not filling the available space when zoomed out
    //   - the solid paint stroke rendering larger/smaller than the overlay stroke
    //
    // So: if the caller provides a numeric cssW, treat that as authoritative.
    const hasAuthoritativeW = Number.isFinite(cssW) && cssW > 0;
    let w = (hasAuthoritativeW ? cssW : 0);
    const cachedW = (canvas && Number.isFinite(canvas.__tsmCssW)) ? canvas.__tsmCssW
      : (canvas && Number.isFinite(canvas.__dgCssW)) ? canvas.__dgCssW : 0;
    const cachedH = (canvas && Number.isFinite(canvas.__tsmCssH)) ? canvas.__tsmCssH
      : (canvas && Number.isFinite(canvas.__dgCssH)) ? canvas.__dgCssH : 0;
    let h = cachedH || 0;
    if (!w && cachedW) w = cachedW;

    // If we *do* have an authoritative cssW, keep the canvas cache aligned so
    // future DPR estimates don't accidentally pick up an old value.
    if (canvas && w && (!cachedW || Math.abs(cachedW - w) > 1)) {
      try { canvas.__dgCssW = w; } catch {}
    }
    if ((!w || !h) && typeof getComputedStyle === 'function' && canvas) {
      try {
        const cs = getComputedStyle(canvas);
        const sw = parseFloat(cs?.width || '0') || 0;
        const sh = parseFloat(cs?.height || '0') || 0;
        if (!w && sw > 0) w = sw;
        if (!h && sh > 0) h = sh;
      } catch {}
    }

    // If both cached + computedStyle exist and disagree a lot, prefer computedStyle.
    // (This handles cases where a canvas was moved/swapped and the cache lags.)
    try {
      if (canvas && typeof getComputedStyle === 'function') {
        const cs = getComputedStyle(canvas);
        const sw = parseFloat(cs?.width || '0') || 0;
        if (sw > 0 && cachedW > 0 && Math.abs(sw - cachedW) > 2 && (!Number.isFinite(cssW) || !cssW)) {
          w = sw;
          try { canvas.__dgCssW = sw; } catch {}
        }
      }
    } catch {}

    if (cw > 0 && w > 0) {
      // If the caller supplies cssW, treat width as authoritative and avoid
      // averaging with a potentially stale cached height.
      if (hasAuthoritativeW) return cw / w;
      // If we have both axes, average them to reduce weirdness if one axis is rounded differently.
      if (ch > 0 && h > 0) {
        const dprX = cw / w;
        const dprY = ch / h;
        return (dprX + dprY) * 0.5;
      }
      return cw / w;
    }
  } catch {}
  return fallback;
}
function __dgWithLogicalSpaceDpr(R, ctx, dpr, fn) {
  // IMPORTANT:
  // Do NOT temporarily mutate the module-scoped paintDpr.
  // That global is shared across all drawgrid instances + layers, and mutating it
  // (even briefly) can cause exactly the "some overlays are scaled differently"
  // bug we're chasing (nodes/animated line/ghost trail drawn too small/large).
  //
  // Instead, apply the DPR as a local transform directly on this context.
  if (!ctx) return fn();

  // Guard against accidental nesting.
  if (ctx.__dgLogicalSpaceActive) {
    return fn();
  }

  const s = (Number.isFinite(dpr) && dpr > 0) ? dpr : 1;
  try { ctx.__dgLogicalSpaceActive = true; } catch {}
  ctx.save();
  ctx.setTransform(s, 0, 0, s, 0, 0);
  try {
    return fn();
  } finally {
    ctx.restore();
    try { ctx.__dgLogicalSpaceActive = false; } catch {}
  }
}

// One-shot dumper (manual, not spammy) is installed per-instance inside createDrawGrid()
// so it can see the actual canvases. (Module-scope can't see per-instance locals.)

const gridAreaLogical = { w: 0, h: 0 };

// Lightweight profiling for drawGrid; flip to true when testing.
const DG_PROFILE = false;
// Turn on to log slow drawgrid frames (full rAF body).
const DG_FRAME_PROFILE = false;
const DG_FRAME_SLOW_THRESHOLD_MS = 10;
// (moved into createDrawGrid - per-instance)
// Overlay compositor mode (module-scope so helper functions can read it safely).
const DG_SINGLE_CANVAS_OVERLAYS = (() => {
  try {
    if (typeof window !== 'undefined' && window.__DG_SINGLE_CANVAS_OVERLAYS !== undefined) {
      return !!window.__DG_SINGLE_CANVAS_OVERLAYS;
    }
  } catch {}
  return true;
})();
try { if (typeof window !== 'undefined') window.__DG_SINGLE_CANVAS_OVERLAYS = DG_SINGLE_CANVAS_OVERLAYS; } catch {}

// ---------------------------------------------------------------------------
// Overlay dirty gating
// ---------------------------------------------------------------------------
// Overlays are alpha-heavy. If we clear + redraw them every frame, they can
// dominate nonScript (raster/composite). We only want to redraw overlays when
// something actually changed.
function __dgMarkOverlayDirty(panel) {
  try { panel.__dgOverlayDirty = true; } catch {}
}

try { startAdaptiveSharedTicker(); } catch {}

// --- Performance / LOD tuning ----------------------------------------

// Below this FPS we start aggressively disabling the fancy background field.
// Hysteresis means we only re-enable once FPS climbs comfortably above.
const DG_MIN_FPS_FOR_PARTICLE_FIELD = 32;  // degrade if we live below this
const DG_FPS_PARTICLE_HYSTERESIS_UP = 38;  // re-enable once we're above this
const DG_PLAYHEAD_FPS_SIMPLE_ENTER = 28;
const DG_PLAYHEAD_FPS_SIMPLE_EXIT = 34;

// Test harness: allow Perf Lab to drive DrawGrid LOD using a forced FPS value.
// Perf Lab sets: window.__DG_FPS_TEST_OVERRIDE = 5/10/15/...
function __dgGetFpsDriveOverride() {
  try {
    const v = (typeof window !== 'undefined') ? Number(window.__DG_FPS_TEST_OVERRIDE || 0) : 0;
    return (Number.isFinite(v) && v > 0) ? v : 0;
  } catch {
    return 0;
  }
}

// IntersectionObserver visibility threshold - panels with <5% on-screen area
// are treated as "offscreen" and have their heavy work culled.
const DG_VISIBILITY_THRESHOLD = 0.05;

let dgProfileFrames = 0;
let dgProfileSumMs = 0;
let dgProfileMinMs = Infinity;
let dgProfileMaxMs = 0;

if (typeof window !== 'undefined' && typeof window.DG_ZOOM_AUDIT === 'undefined') {
  window.DG_ZOOM_AUDIT = false;
}

// -----------------------------------------------------------------------------
// Visual backing-store DPR reduction when visually small (generic, not gesture)
// -----------------------------------------------------------------------------

window.__DG_VISUAL_DPR_ZOOM_THRESHOLD ??= 0.9;   // below this, start reducing DPR
window.__DG_VISUAL_DPR_MIN_MUL        ??= 0.5;   // lowest visual multiplier
window.__DG_MIN_PANEL_DPR             ??= 0.5;   // absolute floor for backing DPR

// Zoom-commit DPR policy (Option C):
// Avoid visible "snap" at the end of zoom/pan by only changing backing-store DPR
// when it's a meaningful change OR when zoomed far enough out to justify it.
window.__DG_ZOOM_COMMIT_DPR_MIN_DELTA     ??= 0.18; // minimum DPR change to apply at commit
window.__DG_ZOOM_COMMIT_SCALE_THRESHOLD  ??= 0.8;  // if commitScale <= this, always allow DPR change

// Adaptive DPR (idle-time backing-store DPR changes)
// This can cause visible "late snaps" (layers appear to jump after zoom/pan settles),
// because it changes paintDpr while the camera is idle.
// Default OFF; we can re-enable later once it's hysteresis-stable and visually safe.
window.__DG_ADAPTIVE_DPR_ENABLED      ??= true;
// If adaptive DPR is enabled, do we allow it to run even when only a single DrawGrid is visible?
// (Useful for PerfLab focus runs, but usually want OFF for normal play.)
window.__DG_ADAPTIVE_DPR_ALLOW_SINGLE ??= false;

// Size-trace logging (DPR / canvas resize churn). Keep console OFF by default.
// PerfLab can enable __DG_REFRESH_SIZE_TRACE to collect to the perf buffer without spamming devtools.
window.__DG_REFRESH_SIZE_TRACE_TO_CONSOLE ??= false;
window.__DG_GESTURE_VISUAL_DPR_MUL ??= 0.85;
// Static layers (grid/nodes/base) can be reduced further during active gesture.
// These are visually stable and safe to blur temporarily.
// Tunable:
//   window.__DG_GESTURE_STATIC_DPR_MUL (default 0.7)
window.__DG_GESTURE_STATIC_DPR_MUL ??= 0.7;

function __dgComputeVisualBackingMul(boardScale) {
  const threshold = window.__DG_VISUAL_DPR_ZOOM_THRESHOLD;
  const minMul    = window.__DG_VISUAL_DPR_MIN_MUL;

  if (!boardScale || boardScale >= threshold) return 1;

  // Smooth linear falloff from threshold → 0
  const t = Math.max(0, Math.min(1, boardScale / threshold));
  return minMul + (1 - minMul) * t;
}

// During active zoom/pan gestures, we can temporarily reduce backing-store DPR
// to lower raster/compositor pressure without affecting layout.
// This is intentionally subtle and only applies while gesture motion is active.
//
// Tunable (defaults are conservative):
//   window.__DG_GESTURE_VISUAL_DPR_MUL = 0.85
function __dgComputeGestureBackingMul(isGestureMoving) {
  try {
    if (!isGestureMoving) return 1;
    const mul = (typeof window !== 'undefined' && Number.isFinite(window.__DG_GESTURE_VISUAL_DPR_MUL))
      ? window.__DG_GESTURE_VISUAL_DPR_MUL
      : 0.85;
    return Math.max(0.35, Math.min(1, mul));
  } catch {
    return 1;
  }
}

function __dgComputeGestureStaticMul(isGestureMoving) {
  try {
    if (!isGestureMoving) return 1;
    const mul = (typeof window !== 'undefined' && Number.isFinite(window.__DG_GESTURE_STATIC_DPR_MUL))
      ? window.__DG_GESTURE_STATIC_DPR_MUL
      : 0.7;
    return Math.max(0.35, Math.min(1, mul));
  } catch {
    return 1;
  }
}


// -----------------------------------------------------------------------------
// Size-based backing-store DPR reduction for very small panels
// -----------------------------------------------------------------------------
// When a toy is physically small on screen, backing-store resolution can be
// reduced without visible quality loss. This targets raster/compositor cost.
//
// Tunables (optional):
//   window.__DG_SMALL_PANEL_PX_THRESHOLD  (default 260k CSS px)
//   window.__DG_SMALL_PANEL_MIN_MUL       (default 0.6)
//
// Example:
//   threshold=260k: a 400x400 panel (160k px) gets a multiplier ~0.846.
window.__DG_SMALL_PANEL_PX_THRESHOLD ??= 260_000;
window.__DG_SMALL_PANEL_MIN_MUL      ??= 0.5;

function __dgComputeSmallPanelBackingMul(cssW, cssH) {
  const w = Number.isFinite(cssW) ? cssW : 0;
  const h = Number.isFinite(cssH) ? cssH : 0;
  if (w <= 0 || h <= 0) return 1;

  const area = w * h;
  const threshold = Number(window.__DG_SMALL_PANEL_PX_THRESHOLD) || 260_000;
  const minMul = Number(window.__DG_SMALL_PANEL_MIN_MUL) || 0.6;

  if (!Number.isFinite(threshold) || threshold <= 10_000) return 1;
  if (!Number.isFinite(minMul) || minMul <= 0 || minMul > 1) return 1;

  if (area >= threshold) return 1;
  const t = Math.max(0, Math.min(1, area / threshold));
  return minMul + (1 - minMul) * t;
}

// -----------------------------------------------------------------------------
// Pressure-based backing-store DPR reduction (generic, not “gesture mode”)
// -----------------------------------------------------------------------------
//
// Goal: when overall framerate is low (for any reason), reduce backing-store DPR
// smoothly to cut raster/compositor cost. This applies regardless of gesture.
//
// Tunables:
//   window.__DG_PRESSURE_DPR_ENABLED     (default true)
//   window.__DG_PRESSURE_DPR_START_MS    (default 20)  // start reducing above this
//   window.__DG_PRESSURE_DPR_END_MS      (default 34)  // hit min at/above this
//   window.__DG_PRESSURE_DPR_MIN_MUL     (default 0.6) // lowest multiplier from pressure
//   window.__DG_PRESSURE_DPR_EWMA_ALPHA  (default 0.12)
//   window.__DG_PRESSURE_DPR_COOLDOWN_MS (default 350) // delay recover to avoid thrash
//
window.__DG_PRESSURE_DPR_ENABLED     ??= true;
window.__DG_PRESSURE_DPR_START_MS    ??= 20;
window.__DG_PRESSURE_DPR_END_MS      ??= 34;
window.__DG_PRESSURE_DPR_MIN_MUL     ??= 0.5;
window.__DG_PRESSURE_DPR_EWMA_ALPHA  ??= 0.12;
window.__DG_PRESSURE_DPR_COOLDOWN_MS ??= 350;

// -----------------------------------------------------------------------------
// AutoQualityController integration (Quality Lab + adaptive quality scale)
// -----------------------------------------------------------------------------
// When enabled, DrawGrid's backing-store DPR participates in the global
// auto-quality signal (window.__AUTO_QUALITY_EFFECTIVE) driven by
// AutoQualityController + Quality Lab.
window.__DG_USE_AUTO_QUALITY ??= true;

function __dgGetAutoQualityMul() {
  try {
    if (!(window.__DG_USE_AUTO_QUALITY ?? true)) return 1;
    const v = getAutoQualityScale?.();
    if (!Number.isFinite(v) || v <= 0) return 1;
    return Math.max(0.25, Math.min(1.0, v));
  } catch {
    return 1;
  }
}

// -----------------------------------------------------------------------------
// Overlay-first pressure DPR (aggressive on transient layers)
// -----------------------------------------------------------------------------
// Overlays (flash/ghost/tutorial/playhead) are alpha-heavy and the biggest
// compositor/raster cost in focus runs. We bias pressure-DPR to reduce their
// backing-store resolution earlier and more aggressively than static layers.
//
// Tunables:
//   window.__DG_OVERLAY_PRESSURE_DPR_MIN_MUL   (default 0.45)
//   window.__DG_OVERLAY_PRESSURE_DPR_BIAS      (default 0.85)
//   window.__DG_OVERLAY_DPR_QUANT_PX           (default 32)   // backing-size bucketing
//
window.__DG_OVERLAY_PRESSURE_DPR_MIN_MUL ??= 0.45;
window.__DG_OVERLAY_PRESSURE_DPR_BIAS    ??= 0.85;
window.__DG_OVERLAY_DPR_QUANT_PX         ??= 32;

let __dgPressureFrameMsEwma = null;
let __dgPressureDprMul = 1;
let __dgPressureMulLastChangeTs = 0;

function __dgComputePressureDprMul(frameMs) {
  const startMs = Number.isFinite(window.__DG_PRESSURE_DPR_START_MS) ? window.__DG_PRESSURE_DPR_START_MS : 20;
  const endMs   = Number.isFinite(window.__DG_PRESSURE_DPR_END_MS) ? window.__DG_PRESSURE_DPR_END_MS : 34;
  const minMul  = Number.isFinite(window.__DG_PRESSURE_DPR_MIN_MUL) ? window.__DG_PRESSURE_DPR_MIN_MUL : 0.6;

  if (!Number.isFinite(frameMs) || frameMs <= startMs) return 1;
  if (frameMs >= endMs) return minMul;

  // Smooth linear ramp from 1.0 → minMul between startMs and endMs.
  const t = Math.max(0, Math.min(1, (frameMs - startMs) / Math.max(1e-6, (endMs - startMs))));
  return 1 - (1 - minMul) * t;
}

function __dgUpdatePressureDprMulFromFps(fps, nowTs) {
  if (!(window.__DG_PRESSURE_DPR_ENABLED ?? true)) {
    __dgPressureFrameMsEwma = null;
    __dgPressureDprMul = 1;
    return;
  }
  if (!Number.isFinite(fps) || fps <= 0) return;

  const frameMs = 1000 / fps;
  const alpha = Number.isFinite(window.__DG_PRESSURE_DPR_EWMA_ALPHA) ? window.__DG_PRESSURE_DPR_EWMA_ALPHA : 0.12;
  __dgPressureFrameMsEwma = (__dgPressureFrameMsEwma == null)
    ? frameMs
    : (__dgPressureFrameMsEwma * (1 - alpha) + frameMs * alpha);

  const targetMul = __dgComputePressureDprMul(__dgPressureFrameMsEwma);
  const cooldown = Number.isFinite(window.__DG_PRESSURE_DPR_COOLDOWN_MS) ? window.__DG_PRESSURE_DPR_COOLDOWN_MS : 350;

  // Hysteresis:
  // - degrade quickly when things get worse
  // - recover slowly (cooldown) to avoid DPR thrash
  const cur = __dgPressureDprMul;
  if (targetMul < (cur - 0.02)) {
    __dgPressureDprMul = targetMul;
    __dgPressureMulLastChangeTs = nowTs;
  } else if (targetMul > (cur + 0.02)) {
    if (!__dgPressureMulLastChangeTs || (nowTs - __dgPressureMulLastChangeTs) >= cooldown) {
      __dgPressureDprMul = targetMul;
      __dgPressureMulLastChangeTs = nowTs;
    }
  }
}

// === DRAWGRID TUNING (single source of truth) ===
const {
  ghostRadiusToy,
  headerRadiusToy,
  DG_KNOCK,
} = createDGTuning(gridAreaLogical);

const { dgGridAlphaLog, dgDumpCanvasMetrics, emitDG } = createDGDebugHelpers({
  boardScaleHelper,
  getPanel: () => {
    try { return (typeof panel !== 'undefined') ? panel : null; } catch { return null; }
  },
  getUsingBackBuffers: () => {
    try { return (typeof usingBackBuffers !== 'undefined') ? usingBackBuffers : null; } catch { return null; }
  },
  getDGSingleCanvas: () => {
    try { return (typeof DG_SINGLE_CANVAS !== 'undefined') && DG_SINGLE_CANVAS; } catch { return false; }
  },
  getPaintDpr: () => {
    try { return (typeof paintDpr !== 'undefined') ? paintDpr : null; } catch { return null; }
  },
  getCssW: () => {
    try { return (typeof cssW !== 'undefined') ? cssW : null; } catch { return null; }
  },
  getCssH: () => {
    try { return (typeof cssH !== 'undefined') ? cssH : null; } catch { return null; }
  },
});

const STROKE_COLORS = [
  'rgba(95,179,255,0.95)',  // Blue
  'rgba(255,95,179,0.95)',  // Pink
  'rgba(95,255,179,0.95)',  // Green
  'rgba(255,220,95,0.95)', // Yellow
];

// Opacity for decorative/visual-only strokes
const VISUAL_ONLY_ALPHA = 0.35; // decorative lines (non-generator)
const SECONDARY_ALPHA   = 0.6; // reserved for future use (e.g. alt styles)

/**
 * Visual-only strokes:
 * - do NOT generate nodes (no isSpecial, no generatorId)
 * - are not overlay colorize passes
 */
function isVisualOnlyStroke(s) {
  return !s?.isSpecial && !s?.generatorId && !s?.overlayColorize;
}

/**
 * Compute alpha for a stroke path.
 * - All generator/special lines (Line 1, Line 2, …) stay fully opaque.
 * - Visual-only strokes are semi-transparent, both on paint and overlay.
 * - Demoted overlay passes (overlayColorize) stay more subtle on overlay.
 */
function getPathAlpha({ isOverlay, wantsSpecial, isVisualOnly, generatorId }) {
  // Any special/generator line stays fully opaque (Line 1, Line 2, etc.)
  if (wantsSpecial) return 1;

  // Decorative / visual-only strokes are semi-transparent
  if (isVisualOnly) return VISUAL_ONLY_ALPHA;

  // Non-special but not decorative (e.g., overlay colorize passes)
  return isOverlay ? VISUAL_ONLY_ALPHA : 1;
}

let colorIndex = 0;

function createViewportBridgeDG(hostEl) {
  return {
    getZoom: () => {
      try {
        const raw = boardScaleHelper(hostEl);
        const value = Number(raw);
        if (Number.isFinite(value) && value > 0) return value;
      } catch {}
      return 1;
    },
    isOverview: () => {
      try {
        return !!overviewMode?.isActive?.();
      } catch {
        return false;
      }
    },
  };
}

// NOTE: DrawGrid has to be multi-instance safe. Do NOT store per-toy sizing state at module scope.
// These are now declared per-instance inside createDrawGrid().

// Playhead sprite caching + idle warming (extracted)
const __dgPlayhead = createDgPlayheadSprites({
  isGesturing: () => __dgIsGesturing(),
  getVisibleCount: () => Number.isFinite(globalDrawgridState?.visibleCount) ? globalDrawgridState.visibleCount : 0,
  getFps: () => (Number.isFinite(window.__MT_FPS) ? window.__MT_FPS :
    (Number.isFinite(window.__MT_SM_FPS) ? window.__MT_SM_FPS : 60)),
});

const pickPlayheadHue = __dgPlayhead.pickPlayheadHue;
const getPlayheadBandSprite = __dgPlayhead.getPlayheadBandSprite;
const getPlayheadLineSprite = __dgPlayhead.getPlayheadLineSprite;
const getPlayheadCompositeSprite = __dgPlayhead.getPlayheadCompositeSprite;
const __dgIdleCallback = __dgPlayhead.idleCallback;

// --- Commit/settle gating for overlay clears ---
let __dgDeferUntilTs = 0;
let __dgBypassCommitUntil = 0;
let __dgNeedsUIRefresh = false;
let __dgForceFullDrawUntil = 0;
let __dgForceFullDrawNext = false;
let __dgForceFullDrawFrames = 0;
let __dgForceOverlayClearNext = false;
let __dgForceSwapNext = false;
let __dgPostReleaseRaf = 0;
let __dgPostReleaseRaf2 = 0;
let __hydrationJustApplied = false;
let __dgLayoutStableFrames = 0;
let __dgLastLayoutKey = '';
let __dgHydrationPendingRedraw = false;
let __dgAdaptivePaintDpr = null;
let __dgAdaptivePaintLastTs = 0;
let __dgLastZoomCommitTs = 0;
// Per-panel (multi-instance safe) dirty helpers.
// We store the actual dirty flags on the panel object so multiple draw toys don't fight.
let __dgProbeDidFirstDraw = false;
try {
  if (typeof window !== 'undefined' && window.__DG_PROBE_ON === undefined) {
    window.__DG_PROBE_ON = false;
  }
} catch {}
let __dgLayerDebugLastTs = 0;
let __dgRegenSource = '';
let __dgLayerTraceLastTs = 0;
let __dgSampleCanvas = null;
let __dgSampleCtx = null;
let __dgStableFramesAfterCommit = 0;

function __dgComputeAdaptivePaintDpr({ boardScale = 1, isFocused = false, isZoomed = false }) {
  if (isFocused || isZoomed) return null;
  let cap = null;
  // IMPORTANT: do not key DPR caps off visible panel count (device-dependent).
  // We can still cap when visually small (zoomed out), and rely on pressure-DPR (FPS-based)
  // for machine-specific scaling.
  if (boardScale <= 0.35) {
    cap = 1.0;
  } else if (boardScale <= 0.45) {
    cap = 1.25;
  } else if (boardScale <= 0.6) {
    cap = 1.5;
  }
  return cap;
}

// Size-based DPR cap:
// Prevents massive backing stores when a panel is physically large on screen.
// This stacks *on top of* adaptive DPR and device DPR.
//
// Tunables (optional):
//   window.__DG_MAX_PANEL_BACKING_PX  (default 2.2M pixels)
//   window.__DG_MAX_PANEL_SIDE_PX    (default 2600 px)
function __dgCapDprForBackingStore(cssW = 0, cssH = 0, desiredDpr = 1, prevDpr = null) {
  const w = Number.isFinite(cssW) ? cssW : 0;
  const h = Number.isFinite(cssH) ? cssH : 0;
  let dpr = Number.isFinite(desiredDpr) ? desiredDpr : 1;
  const minDpr = (typeof window !== 'undefined' && window.__DG_MIN_PANEL_DPR !== undefined)
    ? window.__DG_MIN_PANEL_DPR
    : 0.6;
  if (w <= 0 || h <= 0) return Math.max(minDpr, dpr);

  // Pixel budget cap (area-based).
  let maxPx = 2_200_000; // default pixel budget for backing store
  try {
    const v = (typeof window !== 'undefined') ? Number(window.__DG_MAX_PANEL_BACKING_PX) : NaN;
    if (Number.isFinite(v) && v > 200_000) maxPx = v;
  } catch {}
  const capFromPx = Math.sqrt(maxPx / (w * h));

  // Side cap (dimension-based) to avoid huge single-axis backing stores.
  let maxSide = 2600;
  try {
    const v = (typeof window !== 'undefined') ? Number(window.__DG_MAX_PANEL_SIDE_PX) : NaN;
    if (Number.isFinite(v) && v > 600) maxSide = v;
  } catch {}
  const capFromSide = Math.min(maxSide / w, maxSide / h);

  let capped = Math.min(dpr, capFromPx, capFromSide);
  capped = Math.max(minDpr, Math.min(dpr, capped));

  // Hysteresis to avoid DPR thrash around thresholds.
  const prev = (Number.isFinite(prevDpr) && prevDpr > 0) ? prevDpr : null;
  if (prev !== null) {
    // Ramp UP slowly (prevents oscillation when hovering near a threshold).
    if (capped > prev && (capped - prev) < 0.12) return prev;
    // Don't flap DOWN on tiny deltas either.
    if (capped < prev && (prev - capped) < 0.06) return prev;
  }
  return capped;
}

/**
 * For a sparse array of nodes, fills in the empty columns by interpolating
 * and extrapolating from the existing nodes to create a continuous line.
 * @param {Array<Set<number>>} nodes - The sparse array of node rows.
 * @param {number} numCols - The total number of columns in the grid.
 * @returns {Array<Set<number>>} A new array with all columns filled.
 */
export function createDrawGrid(panel, { cols: initialCols = 8, rows = 12, toyId, bpm = 120 } = {}) {
  // Per-instance state (WAS module-level; moving fixes cross-toy leakage)
  let currentMap = null;                // { active:boolean[], nodes:Set[], disabled:Set[] }
  let usingBackBuffers = false;
  let __dgDrawingActive = false;
  let paintDpr = __dgCapDprForBackingStore(
    0,
    0,
    Math.max(1, Math.min((typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1, 3)),
    null
  );
  let cssW = 0, cssH = 0, cw = 0, ch = 0, topPad = 0;
  let layoutSizeDirty = true;
  // Cached layout size to avoid forced reflow from offsetWidth/clientWidth during rAF.
  // Updated by ResizeObserver; used by measureCSSSize(wrap).
  let __dgLayoutW = 0;
  let __dgLayoutH = 0;
  // Last known-good non-zero size (used to avoid transient 0s during refresh/boot).
  let __dgLayoutGoodW = 0;
  let __dgLayoutGoodH = 0;
  let __dgLayoutObs = null;
  let __dgLayoutObserverInstalled = false;
  // Per-instance (was module-level; caused cross-toy size/throttle leakage)
  let __dgFrameIdx = 0;
  let __dgLastResizeTargetW = 0;
  let __dgLastResizeTargetH = 0;
  let __dgLastResizeDpr = 0;
  let __dgLastResizeCssW = 0;
  let __dgLastResizeCssH = 0;
  let __dgCommitResizeCount = 0;
  let currentCols = 0;
  let nodeCoordsForHitTest = [];        // For draggable nodes (hit tests, drags)
  let dgViewport = null;
  let dgMap = null;
  let dgField = null;
  let backCtx = null;
  let headerSweepDirX = 1;
  const hydrationState = { retryRaf: 0, retryCount: 0 };
  const particleState = { field: null };
  // Warm-start particles for both restored + newly created toys.
  // This avoids the "restored toys start empty" vs "new toys start full" mismatch,
  // and makes quality-level transitions easier to visually verify.
    try {
      const nowTs = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now();
    // Unconditionally re-arm on boot (a refresh is effectively a new session).
    panel.__dgParticlesWarmStartUntil = nowTs + 1200;
    dgParticleBootLog('warm-start:arm', {
      panelId: panel?.id || null,
      until: panel.__dgParticlesWarmStartUntil,
    });
    } catch {}
  if (DG_DEBUG) console.log('[DG] instance sizing locals init', panel.id, {
    __dgLastResizeTargetW, __dgLastResizeTargetH, __dgLastResizeDpr
  });
  // Visibility + LOD state
  let isPanelVisible = true;          // IntersectionObserver will keep this updated
  let particleFieldEnabled = true;    // driven by FPS + zoom with hysteresis
  let particleCanvasVisible = true;
  let pendingResnapOnVisible = false;
  let lastResnapTs = 0;
  let countedVisible = false;
  const updateGlobalVisibility = (visible) => {
    const next = !!visible;
    if (next && !countedVisible) {
      countedVisible = true;
      globalDrawgridState.visibleCount = Math.max(0, (globalDrawgridState.visibleCount || 0) + 1);
    } else if (!next && countedVisible) {
      countedVisible = false;
      globalDrawgridState.visibleCount = Math.max(0, (globalDrawgridState.visibleCount || 0) - 1);
    }
  };
  updateGlobalVisibility(isPanelVisible);

  // DEBUG: prove these are per-instance
  dgTraceLog('[drawgrid] instance-state', panel.id, { scope: 'per-instance' });
  // The init script now guarantees the panel is a valid HTMLElement with the correct dataset.
  // The .toy-body is now guaranteed to exist by initToyUI, which runs first.
  const body = panel.querySelector('.toy-body');
  const drawToyBg = '#000413ff';

  // IMPORTANT: DrawGrid manages multiple canvases with a custom backing-store DPR policy.
  // Opt this panel (and its canvases) out of the generic auto-DPR managers.
  try { panel.dataset.toySurfaceManaged = '1'; } catch {}

  // === Generic surface manager (DrawGrid is the first adopter) ===
  const dgSurfaces = (() => {
    try {
      return createToySurfaceManager({
        panel,
        body,
        getBoardScale: () => {
          try { return boardScaleHelper(panel) || 1; } catch { return 1; }
        },
        tag: 'drawgrid',
      });
    } catch (e) {
      try { console.warn('[DG] createToySurfaceManager failed', e); } catch {}
      return null;
    }
  })();

  if (!body) {
    return;
  }
  body.style.position = 'relative';
  if (body.style) {
    body.style.background = drawToyBg;
  }
  if (panel?.style) {
    panel.style.background = drawToyBg;
    panel.style.backgroundColor = drawToyBg;
  }

  const resolvedToyId = toyId || panel.id || panel.dataset.toyid || panel.dataset.toyid || panel.dataset.toyName || 'drawgrid';
  const storageKey = resolvedToyId ? `drawgrid:saved:${resolvedToyId}` : null;
  // --- DEBUG: verify unique key per panel
  if (DG_TRACE_DEBUG) {
    if (DG_DEBUG) {
      console.log('[drawgrid] init', { panelId: panel.id, resolvedToyId, storageKey });
      console.log('[drawgrid][storage-key]', { panelId: panel.id, storageKey });
    }
  }
  // Expose a safe way for persistence.js to inspect our saved state on demand.
  function __loadPersistedStateRaw() {
    // Block legacy global key patterns to avoid cross-panel contamination
    try {
      if (storageKey && storageKey.endsWith(':drawgrid') && panel.id !== 'drawgrid') {
        if (DG_DEBUG) console.warn('[drawgrid] ignoring legacy global key for', panel.id, storageKey);
        return null;
      }
    } catch {}
    if (!storageKey) return null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const state = parsed?.state || parsed;
      return (state && typeof state === 'object') ? state : null;
    } catch {
      return null;
    }
  }
  try { panel.__getDrawgridPersistedState = __loadPersistedStateRaw; } catch {}
  const dgPersist = createDgPersist({
    panel,
    storageKey,
    dgTraceLog,
    DG_DEBUG,
    DG_TRACE_DEBUG,
    captureState,
    getStrokes: () => strokes,
    getCurrentMap: () => currentMap,
    warn: (...args) => {
      try {
        if (DG && typeof DG.warn === 'function') {
          DG.warn(...args);
          return;
        }
      } catch {}
      if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn(...args);
      }
    },
  });
  const {
    dgNow,
    getHydrateState,
    getFallbackHydrationState,
    inboundWasNonEmpty,
    loadPersistedState,
    markUserChange,
    persistBeforeUnload,
    persistStateNow,
    schedulePersistState,
    updateHydrateInboundFromState,
  } = dgPersist;
  const DG_HYDRATE = getHydrateState();
  let overlayCamState = getFrameStartState?.() || { scale: 1, x: 0, y: 0 };
  let unsubscribeFrameStart = null;

  function getZoomScale(el) {
    // Compare transformed rect to layout box to infer CSS transform scale.
    // Fallback to 1 to remain stable if values are 0 or unavailable.
    if (!el) return { x: 1, y: 1 };
    const rect = el.getBoundingClientRect?.();
    const cw = el.clientWidth || 0;
    const ch = el.clientHeight || 0;
    if (!rect || cw <= 0 || ch <= 0) return { x: 1, y: 1 };
    const inferredX = rect.width  / cw;
    const inferredY = rect.height / ch;
    const cam = typeof getFrameStartState === 'function' ? getFrameStartState() : null;
    const committedScale = Number.isFinite(cam?.scale) ? cam.scale :
      (Number.isFinite(boardScale) ? boardScale : NaN);
    const sx = Number.isFinite(committedScale) ? committedScale : inferredX;
    const sy = Number.isFinite(committedScale) ? committedScale : inferredY;
    const clampedX = Math.max(0.1, Math.min(4, sx));
    const clampedY = Math.max(0.1, Math.min(4, sy));
    return {
      x: (isFinite(clampedX) ? clampedX : 1),
      y: (isFinite(clampedY) ? clampedY : 1)
    };
  }

  // Layers (z-index order) — particles behind the art layers
  // IMPORTANT: do not overwrite runtime perf toggles.
  // PerfLab (and manual console tests) need to be able to set this BEFORE a toy is created.
  try { if (typeof window !== 'undefined') window.__DG_SINGLE_CANVAS ??= true; } catch {}
  const DG_SINGLE_CANVAS = !!(typeof window !== 'undefined' && window.__DG_SINGLE_CANVAS);
  try { if (typeof window !== 'undefined') window.__DG_SINGLE_CANVAS = DG_SINGLE_CANVAS; } catch {}
  try {
    if (typeof window !== 'undefined' && window.__DG_PLAYHEAD_SEPARATE_CANVAS === undefined) {
      // Perf default: keep playhead on its own canvas to reduce full-panel invalidation during pan/zoom.
      window.__DG_PLAYHEAD_SEPARATE_CANVAS = true;
    }
  } catch {}
  const DG_COMBINE_GRID_NODES = false;
  // TODO: consider single-canvas draw order (grid/nodes/overlays) after merge validation.
  const particleCanvas = document.createElement('canvas');
  particleCanvas.className = 'toy-particles';
  particleCanvas.setAttribute('data-role', 'drawgrid-particles');
  try { particleCanvas.dataset.skipAutoDpr = '1'; } catch {}
  try { dgSurfaces?.registerCanvas?.('particles', particleCanvas, { policy: 'css' }); } catch {}
  const grid = document.createElement('canvas');
  grid.classList.add('toy-canvas');
  grid.setAttribute('data-role','drawgrid-grid');
  try { grid.dataset.skipAutoDpr = '1'; } catch {}
  try { dgSurfaces?.registerCanvas?.('grid', grid, { policy: 'managed' }); } catch {}
  const paint = document.createElement('canvas');
  paint.classList.add('toy-canvas');
  paint.setAttribute('data-role','drawgrid-paint');
  try { paint.dataset.skipAutoDpr = '1'; } catch {}
  try { dgSurfaces?.registerCanvas?.('paint', paint, { policy: 'managed' }); } catch {}
  const nodesCanvas = DG_COMBINE_GRID_NODES ? grid : document.createElement('canvas');
  if (!DG_COMBINE_GRID_NODES) {
    nodesCanvas.classList.add('toy-canvas');
    nodesCanvas.setAttribute('data-role', 'drawgrid-nodes');
    try { nodesCanvas.dataset.skipAutoDpr = '1'; } catch {}
    try { dgSurfaces?.registerCanvas?.('nodes', nodesCanvas, { policy: 'managed' }); } catch {}
  }
  const flashCanvas = document.createElement('canvas');
  flashCanvas.classList.add('toy-canvas');
  flashCanvas.setAttribute('data-role', 'drawgrid-flash');
  try { flashCanvas.dataset.skipAutoDpr = '1'; } catch {}
  try { dgSurfaces?.registerCanvas?.('flash', flashCanvas, { policy: 'managed' }); } catch {}
  const ghostCanvas = document.createElement('canvas');
  ghostCanvas.classList.add('toy-canvas');
  ghostCanvas.setAttribute('data-role','drawgrid-ghost');
  try { ghostCanvas.dataset.skipAutoDpr = '1'; } catch {}
  try { dgSurfaces?.registerCanvas?.('ghost', ghostCanvas, { policy: 'managed' }); } catch {}
  const tutorialCanvas = document.createElement('canvas');
  tutorialCanvas.classList.add('toy-canvas');
  tutorialCanvas.setAttribute('data-role', 'drawgrid-tutorial-highlight');
  try { tutorialCanvas.dataset.skipAutoDpr = '1'; } catch {}
  try { dgSurfaces?.registerCanvas?.('tutorial', tutorialCanvas, { policy: 'managed' }); } catch {}
  const playheadCanvas = document.createElement('canvas');
  playheadCanvas.classList.add('toy-canvas');
  playheadCanvas.setAttribute('data-role', 'drawgrid-playhead');
  try { playheadCanvas.dataset.skipAutoDpr = '1'; } catch {}
  try { dgSurfaces?.registerCanvas?.('playhead', playheadCanvas, { policy: 'managed' }); } catch {}
  // ------------------------------------------------------------
  // DEBUG: dump canvas scale / DPR state for this DrawGrid instance
  // Usage:
  //   window.__DG_DUMP_CANVAS_SCALES()             // dumps this instance (most recent)
  //   window.__DG_DUMP_CANVAS_SCALES(panel.id)    // dumps only if id matches
  // ------------------------------------------------------------
  try {
    if (typeof window !== 'undefined') {
      window.__DG_DUMP_CANVAS_SCALES = (wantPanelId) => {
        try {
          if (wantPanelId && wantPanelId !== panel?.id) return;
          const dump = (name, canvas) => {
            if (!canvas) return { name, missing: true };
            const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
            const styleW = canvas.style?.width || null;
            const styleH = canvas.style?.height || null;
            const cachedW = Number.isFinite(canvas.__dgCssW) ? canvas.__dgCssW : null;
            const cachedH = Number.isFinite(canvas.__dgCssH) ? canvas.__dgCssH : null;
            const cssW = rect ? rect.width : null;
            const cssH = rect ? rect.height : null;
            const bw = canvas.width || 0;
            const bh = canvas.height || 0;
            return {
              name,
              cssW: cssW != null ? Math.round(cssW) : null,
              cssH: cssH != null ? Math.round(cssH) : null,
              styleW,
              styleH,
              cachedW,
              cachedH,
              display: canvas.style?.display || null,
              backingW: bw || null,
              backingH: bh || null,
              dprX: (cssW && cssW > 0) ? +(bw / cssW).toFixed(3) : null,
              dprY: (cssH && cssH > 0) ? +(bh / cssH).toFixed(3) : null,
            };
          };

          console.group('[DG][DUMP][CANVAS_SCALES]', panel?.id || '');
          // Be defensive: different refactors have used different local names.
          // Never reference an undeclared identifier directly (would throw ReferenceError).
          const __paintCanvasForDump =
            (typeof paint !== 'undefined' && paint) ? paint :
            (typeof paintCanvas !== 'undefined' && paintCanvas) ? paintCanvas :
            (typeof paintEl !== 'undefined' && paintEl) ? paintEl :
            null;
          console.table([
            dump('paint', __paintCanvasForDump),
            dump('grid', grid),
            dump('nodes', nodesCanvas),
            dump('ghost', ghostCanvas),
            dump('flash', flashCanvas),
            dump('playhead', playheadCanvas),
            dump('tutorial', tutorialCanvas),
          ]);
          try { console.log('paintDpr', paintDpr, 'usingBackBuffers', usingBackBuffers); } catch {}
          try { console.log('gridArea', gridArea); } catch {}
          console.groupEnd();
        } catch (e) {
          console.warn('[DG][DUMP] failed', e);
        }
      };
      window.__DG_CHECK_LAYER_SIZES = (wantPanelId, opts = {}) => {
        if (wantPanelId && wantPanelId !== panel?.id) return null;
        return __dgGetLayerSizingSnapshot();
      };
      window.__DG_ENSURE_LAYER_SIZES = (wantPanelId, opts = {}) => {
        if (wantPanelId && wantPanelId !== panel?.id) return null;
        return __dgEnsureLayerSizes('manual', { force: true, log: true, ...opts });
      };
    }
  } catch {}
  // Tag canvases so shared helper code can locate the owning panel.
  try {
    particleCanvas.__dgPanel = panel;
    grid.__dgPanel = panel;
    paint.__dgPanel = panel;
    nodesCanvas.__dgPanel = panel;
    flashCanvas.__dgPanel = panel;
    ghostCanvas.__dgPanel = panel;
    tutorialCanvas.__dgPanel = panel;
    playheadCanvas.__dgPanel = panel;
  } catch {}
  if (DG_COMBINE_GRID_NODES) {
    try { panel.classList.add('drawgrid-combined'); } catch {}
  } else {
    try { panel.classList.remove('drawgrid-combined'); } catch {}
  }
  if (DG_SINGLE_CANVAS) {
    try { panel.classList.add('drawgrid-single'); } catch {}
  } else {
    try { panel.classList.remove('drawgrid-single'); } catch {}
  }

  // ---------------------------------------------------------------------------
  // Debug readout: show which FPS/quality degradations are currently active.
  // Toggle with: window.__DG_STATE_READOUT = true/false
  // ---------------------------------------------------------------------------
  function __dgEnsureStateReadoutEl() {
    try {
      if (!panel) return null;
      // Ensure absolute children position correctly inside the toy.
      try {
        const cs = window.getComputedStyle(panel);
        if (cs && cs.position === 'static') panel.style.position = 'relative';
      } catch {}
      if (panel.__dgStateReadoutEl && panel.__dgStateReadoutEl.isConnected) return panel.__dgStateReadoutEl;
      const el = document.createElement('div');
      el.className = 'dg-state-readout';
      el.style.position = 'absolute';
      el.style.left = '8px';
      el.style.bottom = '8px';
      el.style.zIndex = '2147483647';
      el.style.pointerEvents = 'none';
      el.style.whiteSpace = 'pre';
      el.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace';
      el.style.fontSize = '11px';
      el.style.lineHeight = '1.25';
      el.style.padding = '6px 8px';
      el.style.borderRadius = '8px';
      el.style.background = 'rgba(0,0,0,0.55)';
      el.style.color = 'rgba(255,255,255,0.92)';
      el.style.border = '1px solid rgba(255,255,255,0.18)';
      el.style.backdropFilter = 'blur(2px)';
      el.style.textShadow = '0 1px 0 rgba(0,0,0,0.6)';
      panel.appendChild(el);
      panel.__dgStateReadoutEl = el;
      return el;
    } catch {
      return null;
    }
  }

  // Expose a safe, low-noise state snapshot for Perf Lab / debugging.
  // - Collect: window.__DG_COLLECT_DRAWGRID_STATES()
  // - Print  : window.__DG_PRINT_STATE()
  try {
    if (typeof window !== 'undefined' && !window.__DG_COLLECT_DRAWGRID_STATES) {
      window.__DG_COLLECT_DRAWGRID_STATES = () => {
        try {
          const panels = Array.from(document.querySelectorAll('.toy-panel'));
          return panels
            .filter((p) => p && (p.__dgStateSnapshot || (p.classList && p.classList.contains('drawgrid'))))
            .map((p) => ({
              panelId: p.id || null,
              ...((p.__dgStateSnapshot && typeof p.__dgStateSnapshot === 'object') ? p.__dgStateSnapshot : {}),
              text: p.__dgStateSnapshotText || null,
            }));
        } catch {
          return [];
        }
      };
    }
    if (typeof window !== 'undefined' && !window.__DG_PRINT_STATE) {
      window.__DG_PRINT_STATE = () => {
        const states = (typeof window.__DG_COLLECT_DRAWGRID_STATES === 'function')
          ? window.__DG_COLLECT_DRAWGRID_STATES()
          : [];
        try {
          console.group('[DG][STATE] snapshot');
          console.table(states.map((s) => ({
            panelId: s.panelId,
            fps: s.fpsLive != null ? Number(s.fpsLive).toFixed(1) : '--',
            emergency: !!s.lowFpsEmergency,
            playhead: s.playheadSimple ? 'SIMPLE' : 'FULL',
            particles: s.particleFieldEnabled ? 'ON' : 'off',
            particleCount: s.particleCount ?? '--',
            maxScale: s.particleBudgetMaxScale != null ? Number(s.particleBudgetMaxScale).toFixed(3) : '--',
            capScale: s.particleBudgetCapScale != null ? Number(s.particleBudgetCapScale).toFixed(3) : '--',
            spawnScale: s.particleBudgetSpawnScale != null ? Number(s.particleBudgetSpawnScale).toFixed(3) : '--',
            tickMod: s.particleTickModulo ?? '--',
            qlabFps: s.qlabTargetFps ?? 0,
            qlabBurnMs: s.qlabCpuBurnMs ?? 0,
            autoQEff: s.autoQualityEffective != null ? Number(s.autoQualityEffective).toFixed(3) : '--',
            autoQScale: s.autoQualityScale != null ? Number(s.autoQualityScale).toFixed(3) : '--',
            pressureMul: s.pressureDprMul != null ? Number(s.pressureDprMul).toFixed(3) : '--',
          })));
          // Also print the full text blocks (useful when comparing sessions).
          for (const s of states) {
            if (!s || !s.panelId) continue;
            if (!s.text) continue;
            console.log(`\n[DG][STATE][${s.panelId}]\n${s.text}`);
          }
          console.groupEnd();
        } catch {}
        return states;
      };
    }
  } catch {}
  if (DG_SINGLE_CANVAS) {
    panel.__dgCompositeBaseDirty = true;
    panel.__dgCompositeOverlayDirty = true;
    panel.__dgCompositeBaseCanvas = null;
    panel.__dgCompositeBaseCtx = null;
  }
  // Init per-panel dirty flags used by compositeSingleCanvas().
  panel.__dgSingleCompositeDirty = true;
  panel.__dgCompositeBaseDirty = true;
  panel.__dgCompositeOverlayDirty = true;

  function __dgProbeDump(tag = 'probe') {
    try {
      const gridEl = grid;
      const nodesEl = nodesCanvas;
      const paintEl = paint;
      const dump = {
        tag,
        panelId: panel?.id || null,
        singleCanvas: DG_SINGLE_CANVAS,
        combineGridNodes: DG_COMBINE_GRID_NODES,
        cssW,
        cssH,
        gridArea: gridArea ? { ...gridArea } : null,
        gridAreaLogical: gridAreaLogical ? { ...gridAreaLogical } : null,
        canvases: {
          paint: {
            display: paintEl?.style?.display || null,
            z: paintEl?.style?.zIndex || null,
            role: paintEl?.getAttribute?.('data-role') || null,
          },
          grid: {
            display: gridEl?.style?.display || null,
            z: gridEl?.style?.zIndex || null,
            role: gridEl?.getAttribute?.('data-role') || null,
          },
          nodes: {
            display: nodesEl?.style?.display || null,
            z: nodesEl?.style?.zIndex || null,
            role: nodesEl?.getAttribute?.('data-role') || null,
          },
        },
        ctx: {
          gctxRole: gctx?.canvas?.getAttribute?.('data-role') || null,
          nctxRole: nctx?.canvas?.getAttribute?.('data-role') || null,
        },
        nodes: {
          cols: cols || 0,
          nodeCount: (() => {
            let count = 0;
            if (Array.isArray(currentMap?.nodes)) {
              for (const col of currentMap.nodes) count += col?.size || 0;
            }
            return count;
          })(),
          groupStacks: (() => {
            let stacks = 0;
            if (Array.isArray(nodeGroupMap)) {
              for (const m of nodeGroupMap) {
                if (!m || typeof m.forEach !== 'function') continue;
                m.forEach((arr) => { if (Array.isArray(arr) && arr.length > 1) stacks++; });
              }
            }
            return stacks;
          })(),
        },
      };
      if (typeof window !== 'undefined' && window.__DG_PROBE_ON) {
        console.log('[DG][probe]', dump);
      }
    } catch {}
  }
  try { panel.__dgProbe = __dgProbeDump; } catch {}
  try { window.__DG_PROBE__ = window.__DG_PROBE__ || __dgProbeDump; } catch {}
  Object.assign(particleCanvas.style, { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', zIndex: 0, pointerEvents: 'none' });
  particleCanvas.style.background = 'transparent';
  Object.assign(grid.style,           { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', zIndex: DG_COMBINE_GRID_NODES ? 5 : 1 });
  grid.style.background = 'transparent';
  if (DG_COMBINE_GRID_NODES) grid.style.pointerEvents = 'none';
  Object.assign(paint.style,          { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', zIndex: DG_COMBINE_GRID_NODES ? 1 : 2 });
  paint.style.background = 'transparent';
  paint.style.pointerEvents = 'auto';
  Object.assign(ghostCanvas.style, { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', zIndex: DG_COMBINE_GRID_NODES ? 2 : 3, pointerEvents: 'none' });
  ghostCanvas.style.background = 'transparent';
  Object.assign(flashCanvas.style,  { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', zIndex: DG_COMBINE_GRID_NODES ? 3 : 4, pointerEvents: 'none' });
  flashCanvas.style.background = 'transparent';
  if (!DG_COMBINE_GRID_NODES) {
    Object.assign(nodesCanvas.style,  { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', zIndex: 5, pointerEvents: 'none' });
    nodesCanvas.style.background = 'transparent';
  }
  Object.assign(tutorialCanvas.style, { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', zIndex: 6, pointerEvents: 'none' });
  tutorialCanvas.style.background = 'transparent';
  Object.assign(playheadCanvas.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    display: 'block',
    zIndex: 7,
    pointerEvents: 'none',
    willChange: 'transform, opacity',
    contain: 'paint',
  });
  playheadCanvas.style.background = 'transparent';

  // IMPORTANT:
  // Do NOT append canvases directly to `body` here.
  // We mount canvases ONLY after `wrap` + `layersRoot` exist (stable DOM hierarchy),
  // using the deterministic ordered list below.
  if (DG_SINGLE_CANVAS) {
    grid.style.display = 'none';
    if (nodesCanvas !== grid) nodesCanvas.style.display = 'none';
    ghostCanvas.style.display = 'none';
    flashCanvas.style.display = 'none';
    playheadCanvas.style.display = 'none';
  }

  
  // debugCanvas.setAttribute('data-role','drawgrid-debug');
  // Object.assign(debugCanvas.style, {
  //   position: 'absolute',
  //   inset: '0',
  //   width: '100%',
  //   height: '100%',
  //   display: DG_DEBUG ? 'block' : 'none',
  //   zIndex: 9999,
  //   pointerEvents: 'none',
  // });
  // body.appendChild(debugCanvas);
  const debugCanvas = null;
  const debugCtx = null;

  function drawDebugHUD(extraLines = []) { /* no-op */ }

  // --- Stable body layout (IDEMPOTENT) --------------------------------------
  // Refresh/re-init MUST NOT create nested wraps or leave old canvases visible.
  // Reuse a single wrapper + roots, and mount canvases deterministically.
  let wrap = body.querySelector(':scope > .drawgrid-size-wrap');
  const isNewWrap = !wrap;
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'drawgrid-size-wrap';
    body.appendChild(wrap);
  }
  wrap.style.position = 'relative';
  wrap.style.width = '100%';
  wrap.style.height = '100%';
  wrap.style.overflow = 'hidden';
  wrap.style.background = drawToyBg;

  // If we just created the wrap, migrate existing body children into it.
  // (If wrap already existed, DO NOTHING — avoids reparent loops on refresh.)
  if (isNewWrap) {
    [...body.childNodes].forEach((node) => {
      if (node === wrap) return;
      try { wrap.appendChild(node); } catch {}
    });
  }

  // Dedicated roots inside wrap.
  let layersRoot = wrap.querySelector(':scope > .drawgrid-layers-root');
  if (!layersRoot) {
    layersRoot = document.createElement('div');
    layersRoot.className = 'drawgrid-layers-root';
    wrap.insertBefore(layersRoot, wrap.firstChild);
  }
  layersRoot.style.position = 'absolute';
  layersRoot.style.inset = '0';
  layersRoot.style.width = '100%';
  layersRoot.style.height = '100%';
  layersRoot.style.pointerEvents = 'auto';
  layersRoot.style.zIndex = '0';

  let overlaysRoot = wrap.querySelector(':scope > .drawgrid-overlays-root');
  if (!overlaysRoot) {
    overlaysRoot = document.createElement('div');
    overlaysRoot.className = 'drawgrid-overlays-root';
    wrap.appendChild(overlaysRoot);
  }
  overlaysRoot.style.position = 'absolute';
  overlaysRoot.style.inset = '0';
  overlaysRoot.style.width = '100%';
  overlaysRoot.style.height = '100%';
  overlaysRoot.style.zIndex = '50';
  overlaysRoot.style.pointerEvents = 'none';

  // Safety: if any canvases ended up as direct children of wrap, move them into layersRoot.
  try {
    const directCanvasChildren = [...wrap.querySelectorAll(':scope > canvas')];
    for (const c of directCanvasChildren) {
      try { layersRoot.appendChild(c); } catch {}
    }
  } catch {}

  // Deterministic mount order: ensures exactly one visible stack.
  const __dgOrderedCanvases = [
    particleCanvas,
    grid,
    ...(DG_COMBINE_GRID_NODES ? [] : [nodesCanvas]),
    paint,
    ghostCanvas,
    flashCanvas,
    tutorialCanvas,
    playheadCanvas,
  ].filter(Boolean);
  for (const c of __dgOrderedCanvases) {
    try { layersRoot.appendChild(c); } catch {}
  }

  // PRUNE: remove any stale drawgrid canvases left behind from a previous init.
  // This prevents duplicated strokes/ghosts after refresh at mismatched zoom/DPR.
  try {
    const keep = new Set(__dgOrderedCanvases);
    const all = [...layersRoot.querySelectorAll('canvas')];
    for (const cv of all) {
      if (keep.has(cv)) continue;
      const role = cv.getAttribute ? cv.getAttribute('data-role') : null;
      const cls = (cv.className || '');
      const looksLikeDrawgrid =
        (typeof role === 'string' && role.startsWith('drawgrid-')) ||
        (typeof cls === 'string' && cls.indexOf('drawgrid') >= 0);
      if (looksLikeDrawgrid) {
        try { cv.remove(); } catch {}
      }
    }
  } catch {}

  // Pointer routing: only the paint canvas should receive pointer input.
  try {
    const nonInteractive = [particleCanvas, grid, nodesCanvas, ghostCanvas, flashCanvas, tutorialCanvas, playheadCanvas].filter(Boolean);
    for (const c of nonInteractive) {
      if (c && c.style) c.style.pointerEvents = 'none';
    }
    if (paint && paint.style) {
      paint.style.pointerEvents = 'auto';
      paint.style.touchAction = 'none';
    }
  } catch {}

  // Optional: expose for debugging/inspection
  try {
    panel.__dgWrap = wrap;
    panel.__dgLayersRoot = layersRoot;
    panel.__dgOverlaysRoot = overlaysRoot;
    panel.__dgMount = { wrap, layersRoot, overlaysRoot };
  } catch {}
  // Install RO only once the stable wrapper exists (safe if already installed).
  __installLayoutObserver();

  const drawLabelState = createDrawLabelOverlay(
    panel,
    () => {
      let gridAreaValue = null;
      let gridAreaLogicalValue = null;
      let isPanelVisibleValue = true;
      let dgViewportValue = null;
      try { gridAreaValue = gridArea; } catch {}
      try { gridAreaLogicalValue = gridAreaLogical; } catch {}
      try { isPanelVisibleValue = isPanelVisible; } catch {}
      try { dgViewportValue = dgViewport; } catch {}
      return {
        gridArea: gridAreaValue,
        gridAreaLogical: gridAreaLogicalValue,
        isPanelVisible: isPanelVisibleValue,
        dgViewport: dgViewportValue,
      };
    },
    // Mount under overlaysRoot so the label is a true overlay (never a layout participant)
    // and stays consistent across refresh + zoom.
    { wrap, grid, mountRoot: overlaysRoot }
  );
  const {
    updateDrawLabel,
    fadeOutDrawLabel,
    knockLettersAt,
    ensureLetterPhysicsLoop,
    getDrawLabelYRange,
  } = drawLabelState;

  function getToyLogicalSize() {
    // IMPORTANT: avoid clientWidth/clientHeight reads in hot/boot paths; they can
    // reflect transient zoom/transform states right after refresh.
    const s = __dgGetStableWrapSize();
    return { w: s.w, h: s.h };
  }

  function getToyCssSizeForParticles() {
    // Keep particles on the same size basis as everything else.
    const s = __dgGetStableWrapSize();
    return { w: s.w, h: s.h };
  }

  function __auditZoomSizes(tag = 'audit') {
    if (typeof window === 'undefined' || !window.DG_ZOOM_AUDIT) return;
    try {
      const rect = wrap?.getBoundingClientRect?.();
      const clientW = wrap?.clientWidth || 0;
      const clientH = wrap?.clientHeight || 0;

      const zoomState = (typeof getZoomState === 'function') ? getZoomState() : null;
      const zoomScale = Number.isFinite(dgViewport?.getZoom?.())
        ? dgViewport.getZoom()
        : (Number.isFinite(zoomState?.scale) ? zoomState.scale : 1);

      // --- Common area basis (logical toy size) ---
      const areaW = Number.isFinite(gridAreaLogical?.w) && gridAreaLogical.w > 0
        ? gridAreaLogical.w
        : Math.round(rect?.width || clientW || 0);
      const areaH = Number.isFinite(gridAreaLogical?.h) && gridAreaLogical.h > 0
        ? gridAreaLogical.h
        : Math.round(rect?.height || clientH || 0);

      // --- DRAW label sizing (DOM text) ---
      const minDim = Math.max(1, Math.min(areaW || 0, areaH || 0));
      const labelZoomScale = Math.max(0.1, __dgZoomScale());
      const rawLbl = Math.max(48, Math.min(240, minDim * 0.26));
      const drawLabelPx = Math.max(12, Math.round(rawLbl * labelZoomScale));

      // --- Grid scale + grid line thickness ---
      const gridCellW = cw || 0;
      const gridCellH = ch || 0;
      const gridLineWidthPx = (gridCellW > 0 && gridCellH > 0)
        ? Math.max(0.5, Math.min(gridCellW, gridCellH) * 0.05 * zoomScale)
        : 0;

      // --- Drawn animated line thickness ---
      let drawLineWidthPx = null;
      try {
        drawLineWidthPx = typeof R.getLineWidth === 'function' ? R.getLineWidth() : null;
      } catch {
        drawLineWidthPx = null;
      }

      // --- Ghost finger / disturbance radii (world-space, based on toy area) ---
      const areaForRadii = { w: areaW || 0, h: areaH || 0 };
      const ghostRadius =
        (typeof ghostRadiusToy === 'function')
          ? ghostRadiusToy(areaForRadii)
          : null;
      const headerRadius =
        (typeof headerRadiusToy === 'function')
          ? headerRadiusToy(areaForRadii)
          : null;

      DG_LOG({
        tag: 'ZOOM-AUDIT',
        source: tag,
        zoomScale,
        rectW: Math.round(rect?.width || 0),
        rectH: Math.round(rect?.height || 0),
        clientW,
        clientH,
        gridAreaLogical: { ...gridAreaLogical },

        // Element-specific zoom diagnostics:
        drawLabelPx,
        drawLabelRawPx: rawLbl,
        gridCellW,
        gridCellH,
        gridLineWidthPx,
        drawLineWidthPx,
        ghostRadiusToy: ghostRadius,
        headerRadiusToy: headerRadius,
      });
    } catch (err) {
      console.warn('[DG][ZOOM-AUDIT] failed', err);
    }
  }

  // --- Particle viewport / field init after wrap is ready ---
  const pausedRef = () => !!panel?.dataset?.paused;
  const viewportBridge = createViewportBridgeDG(panel);

  // IMPORTANT:
  // Use the logical toy size for the particle viewport so that:
  // - grid, ghost path, and particles all share the same world-space basis, and
  // - camera zoom (board scale) just scales the whole toy visually.
  dgViewport = createParticleViewport(() => {
    return getToyLogicalSize();
  });
  Object.assign(dgViewport, viewportBridge);
  dgMap = dgViewport.map;
  const panelSeed = panel?.dataset?.toyid || panel?.id || 'drawgrid';
  let gridArea = { x: 0, y: 0, w: 0, h: 0 };
  // Last-known-good grid sizing. Used to avoid "not ready" churn during transient layout hiccups.
  // This is NOT a startup hack; it only kicks in when we previously had a valid grid and then
  // briefly measure invalid sizes (0/1px, etc.) mid-run.
  let __dgLastGoodGridArea = null;
  let __dgLastGoodCw = 0;
  let __dgLastGoodCh = 0;
  const getRenderState = () => ({
    paintDpr,
    cssW,
    cssH,
    cw,
    ch,
    topPad,
    usingBackBuffers,
    backCtx,
    DG_SINGLE_CANVAS,
    gridArea,
    __dgDrawingActive,
    isVisualOnlyStroke,
    getPathAlpha,
    __dgMarkSingleCanvasDirty,
  });
  const R = createDgRenderUtils(getRenderState);
  const flowDebugState = {
    get panel() { return panel; },
    get paint() { return paint; },
    get backCanvas() { return backCanvas; },
    get flashCanvas() { return flashCanvas; },
    get flashBackCanvas() { return flashBackCanvas; },
    get usingBackBuffers() { return usingBackBuffers; },
    get __dgPaintRev() { return __dgPaintRev; },
    get __dgDrawingActive() { return __dgDrawingActive; },
    get __dgDeferUntilTs() { return __dgDeferUntilTs; },
    set __dgDeferUntilTs(value) { __dgDeferUntilTs = value; },
    get __dgBypassCommitUntil() { return __dgBypassCommitUntil; },
    set __dgBypassCommitUntil(value) { __dgBypassCommitUntil = value; },
    get __dgHydrationPendingRedraw() { return __dgHydrationPendingRedraw; },
    set __dgHydrationPendingRedraw(value) { __dgHydrationPendingRedraw = value; },
    get __dgLayerDebugLastTs() { return __dgLayerDebugLastTs; },
    set __dgLayerDebugLastTs(value) { __dgLayerDebugLastTs = value; },
    get __dgLayerTraceLastTs() { return __dgLayerTraceLastTs; },
    set __dgLayerTraceLastTs(value) { __dgLayerTraceLastTs = value; },
    get __dgRegenSource() { return __dgRegenSource; },
    set __dgRegenSource(value) { __dgRegenSource = value; },
    get DG_SINGLE_CANVAS_OVERLAYS() { return DG_SINGLE_CANVAS_OVERLAYS; },
    get __dgSampleCanvas() { return __dgSampleCanvas; },
    set __dgSampleCanvas(value) { __dgSampleCanvas = value; },
    get __dgSampleCtx() { return __dgSampleCtx; },
    set __dgSampleCtx(value) { __dgSampleCtx = value; },
    get __dgSkipSwapsDuringDrag() { return __dgSkipSwapsDuringDrag; },
    get cur() { return cur; },
    get previewGid() { return previewGid; },
    get nextDrawTarget() { return nextDrawTarget; },
    get strokes() { return strokes; },
    get getActiveFlashCanvas() { return getActiveFlashCanvas; },
    get hasOverlayStrokesCached() { return hasOverlayStrokesCached; },
  };
  const getFlowDebugState = () => flowDebugState;
  const FD = createDgFlowDebug(getFlowDebugState);
  const getHydrationState = () => ({
    hydrationState,
    __dgHydrationPendingRedraw,
    __dgBypassCommitUntil,
    __dgDeferUntilTs,
  });
  const HY = createDgHydrationHelpers(getHydrationState);
  const getFieldForceState = () => ({
    panel,
    R,
    dgField,
    dgMap,
    gridArea,
    gridAreaLogical,
    cssW,
    cssH,
    DG_KNOCK,
    DG_DEBUG,
    HeaderSweepForce,
    headerSweepDirX,
    ghostCtx,
    getOverlayZoomSnapshot,
    headerPushSuppressed,
    dbgPoke,
    knockLettersAt,
    __auditZoomSizes,
    drawgridLog,
    __dgLogFirstPoke,
    cw,
    cols,
    get __dgParticlePokeTs() { return __dgParticlePokeTs; },
    set __dgParticlePokeTs(v) { __dgParticlePokeTs = v; },
  });
  const FF = createDgFieldForces(getFieldForceState);
  const getParticleState = () => ({
    panel,
    wrap,
    particleCanvas,
    dgViewport,
    particleState,
    panelSeed,
    getToyLogicalSize,
    gridAreaLogical,
    drawgridLog,
    __auditZoomSizes,
    globalDrawgridState,
    getParticleBudget,
    getParticleCap,
    getAdaptiveFrameBudget,
    createField,
    pausedRef,
    __lastZoomMotionTs,
    ZOOM_STALL_MS,
  });
  const P = createDgParticles(getParticleState);

  function makeFlowCtx() {
    return {
      panel,
      paint,
      backCanvas,
      flashCanvas,
      flashBackCanvas,
      activeFlashCanvas: (typeof getActiveFlashCanvas === 'function') ? getActiveFlashCanvas() : null,
      strokes,
      usingBackBuffers,
      paintRev: __dgPaintRev,
      compositeDirty: panel.__dgSingleCompositeDirty,
      hasOverlayStrokesCached,
    };
  }

  const getRandomizerState = () => ({
    get panel() { return panel; },
    get DG_SINGLE_CANVAS() { return DG_SINGLE_CANVAS; },
    get isPanelVisible() { return isPanelVisible; },
    get cols() { return cols; },
    get strokes() { return strokes; },
    set strokes(value) { strokes = value; },
    get currentMap() { return currentMap; },
    set currentMap(value) { currentMap = value; },
    get persistentDisabled() { return persistentDisabled; },
    set persistentDisabled(value) { persistentDisabled = value; },
    get pctx() { return pctx; },
    set pctx(value) { pctx = value; },
    get drawFullStroke() { return drawFullStroke; },
    get regenerateMapFromStrokes() { return regenerateMapFromStrokes; },
    get drawGrid() { return drawGrid; },
    get drawNodes() { return drawNodes; },
    get emitDrawgridUpdate() { return emitDrawgridUpdate; },
    get stopAutoGhostGuide() { return stopAutoGhostGuide; },
    get updateDrawLabel() { return updateDrawLabel; },
    get updateGeneratorButtons() { return updateGeneratorButtons; },
    get __dgMarkSingleCanvasDirty() { return __dgMarkSingleCanvasDirty; },
    get compositeSingleCanvas() { return compositeSingleCanvas; },
    get markUserChange() { return markUserChange; },
    get FD() { return FD; },
    get makeFlowCtx() { return makeFlowCtx; },
    get dgTraceWarn() { return dgTraceWarn; },
    get dgTraceLog() { return dgTraceLog; },
    get gridArea() { return gridArea; },
    get cssW() { return cssW; },
    get cssH() { return cssH; },
    get paintDpr() { return paintDpr; },
    get topPad() { return topPad; },
    get ch() { return ch; },
    get rows() { return rows; },
    get cw() { return cw; },
    get getActivePaintCtx() { return getActivePaintCtx; },
    get resetPaintBlend() { return resetPaintBlend; },
    get setDrawingState() { return setDrawingState; },
    get R() { return R; },
    get emitDG() { return emitDG; },
    get nctx() { return nctx; },
    get fctx() { return fctx; },
    get getActiveFlashCanvas() { return getActiveFlashCanvas; },
    get flashBackCtx() { return flashBackCtx; },
    get flashFrontCtx() { return flashFrontCtx; },
    get backCtx() { return backCtx; },
    get frontCtx() { return frontCtx; },
    get markFlashLayerCleared() { return markFlashLayerCleared; },
    get __dgMarkSingleCanvasOverlayDirty() { return __dgMarkSingleCanvasOverlayDirty; },
    get __dgOverlayStrokeListCache() { return __dgOverlayStrokeListCache; },
    set __dgOverlayStrokeListCache(value) { __dgOverlayStrokeListCache = value; },
    get __dgOverlayStrokeCache() { return __dgOverlayStrokeCache; },
    set __dgOverlayStrokeCache(value) { __dgOverlayStrokeCache = value; },
    get __dgSkipSwapsDuringDrag() { return __dgSkipSwapsDuringDrag; },
    set __dgSkipSwapsDuringDrag(value) { __dgSkipSwapsDuringDrag = value; },
    get cur() { return cur; },
    set cur(value) { cur = value; },
    get pendingNodeTap() { return pendingNodeTap; },
    set pendingNodeTap(value) { pendingNodeTap = value; },
    get nodeGroupMap() { return nodeGroupMap; },
    set nodeGroupMap(value) { nodeGroupMap = value; },
    get manualOverrides() { return manualOverrides; },
    set manualOverrides(value) { manualOverrides = value; },
    get previewGid() { return previewGid; },
    set previewGid(value) { previewGid = value; },
    get nextDrawTarget() { return nextDrawTarget; },
    set nextDrawTarget(value) { nextDrawTarget = value; },
    get clearAndRedrawFromStrokes() { return clearAndRedrawFromStrokes; },
    get usingBackBuffers() { return usingBackBuffers; },
  });

  const RNG = createDgRandomizers(getRandomizerState);

  function __dgGridReady() {
    return !!(gridArea && gridArea.w > 0 && gridArea.h > 0 && cw > 0 && ch > 0);
  }
  const gridFrontCtx = grid.getContext('2d', { willReadFrequently: true });
  const gridBackCanvas = document.createElement('canvas');
  const gridBackCtx = gridBackCanvas.getContext('2d', { willReadFrequently: true });
  let gctx = DG_SINGLE_CANVAS ? gridBackCtx : gridFrontCtx;

  const frontCanvas = paint;
  frontCanvas.classList.add('toy-canvas');
  const frontCtx = frontCanvas.getContext('2d', { willReadFrequently: true });
  const backCanvas = document.createElement('canvas');
  backCanvas.setAttribute('data-role', 'drawgrid-paint-back');
  if (backCanvas.style) backCanvas.style.pointerEvents = 'none';
  backCtx = backCanvas.getContext('2d', { alpha: true, desynchronized: true });
  let pctx = DG_SINGLE_CANVAS ? backCtx : frontCtx;

  const nodesFrontCtx = nodesCanvas.getContext('2d', { willReadFrequently: true });
  const nodesBackCanvas = document.createElement('canvas');
  const nodesBackCtx = nodesBackCanvas.getContext('2d', { willReadFrequently: true });
  let nctx = (DG_SINGLE_CANVAS && DG_SINGLE_CANVAS_OVERLAYS && nodesCanvas !== grid)
    ? nodesFrontCtx
    : (DG_SINGLE_CANVAS ? nodesBackCtx : nodesFrontCtx);

  const flashFrontCtx = flashCanvas.getContext('2d', { willReadFrequently: true });
  const flashBackCanvas = document.createElement('canvas');
  const flashBackCtx = flashBackCanvas.getContext('2d', { willReadFrequently: true });
  let fctx = flashFrontCtx;

  const ghostFrontCtx = ghostCanvas.getContext('2d');
  const ghostBackCanvas = document.createElement('canvas');
  const ghostBackCtx = ghostBackCanvas.getContext('2d');
  let ghostCtx = ghostFrontCtx;
  const playheadFrontCtx = playheadCanvas.getContext('2d');
  panel.__dgFlashLayerEmpty = true;
  panel.__dgGhostLayerEmpty = true;
  panel.__dgTutorialLayerEmpty = true;
  panel.__dgPlayheadLayerEmpty = true;

  // Keep flash overlay alive briefly after the last write.
  // Without this, the generic overlay-clear path will wipe transient trails
  // (e.g. draw/ghost trails) immediately on pointer-up or shortly after boot.
  const __DG_FLASH_KEEPALIVE_MS = (typeof window !== 'undefined' && Number.isFinite(window.__DG_FLASH_KEEPALIVE_MS))
    ? window.__DG_FLASH_KEEPALIVE_MS
    : 650;

  const markFlashLayerActive = () => {
    panel.__dgFlashLayerEmpty = false;
    try {
      const nowTs = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
      panel.__dgFlashActiveUntil = nowTs + __DG_FLASH_KEEPALIVE_MS;
    } catch {}
    __dgMarkOverlayDirty(panel);
    __dgMarkSingleCanvasOverlayDirty(panel);
  };
  const markFlashLayerCleared = () => {
    panel.__dgFlashLayerEmpty = true;
    try { panel.__dgFlashActiveUntil = 0; } catch {}
    __dgMarkOverlayDirty(panel);
    __dgMarkSingleCanvasOverlayDirty(panel);
  };
  const markGhostLayerActive = () => {
    // This is called frequently during the ghost sweep; only log on the
    // empty -> non-empty transition to avoid spamming the console.
    const __wasEmpty = panel.__dgGhostLayerEmpty !== false;
    panel.__dgGhostLayerEmpty = false;
    __dgMarkOverlayDirty(panel);
    __dgMarkSingleCanvasOverlayDirty(panel);
    try {
      if (
        __wasEmpty &&
        typeof window !== 'undefined' &&
        window.__DG_GHOST_TRACE &&
        !window.__DG_GHOST_TRACE_CLEAR_ONLY
      ) {
        const stack = __dgGhostMaybeStack('DG markGhostLayerActive');
        dgGhostTrace('layer:ghost-active', {
          id: panel?.id || null,
          usingBackBuffers,
          stack,
        });
      }
    } catch {}
  };
  const markGhostLayerCleared = () => {
    const __wasEmpty = panel.__dgGhostLayerEmpty !== true;
    panel.__dgGhostLayerEmpty = true;
    __dgMarkOverlayDirty(panel);
    __dgMarkSingleCanvasOverlayDirty(panel);
    try {
      if (
        __wasEmpty &&
        typeof window !== 'undefined' &&
        window.__DG_GHOST_TRACE &&
        !window.__DG_GHOST_TRACE_CLEAR_ONLY
      ) {
        const stack = __dgGhostMaybeStack('DG markGhostLayerCleared');
        dgGhostTrace('layer:ghost-cleared', {
          id: panel?.id || null,
          usingBackBuffers,
          stack,
        });
      }
    } catch {}
  };
  const markTutorialLayerActive = () => { panel.__dgTutorialLayerEmpty = false; __dgMarkOverlayDirty(panel); __dgMarkSingleCanvasOverlayDirty(panel); };
  const markTutorialLayerCleared = () => { panel.__dgTutorialLayerEmpty = true; __dgMarkOverlayDirty(panel); __dgMarkSingleCanvasOverlayDirty(panel); };
  const markPlayheadLayerActive = () => { panel.__dgPlayheadLayerEmpty = false; __dgMarkOverlayDirty(panel); __dgMarkSingleCanvasOverlayDirty(panel); };
  const markPlayheadLayerCleared = () => { panel.__dgPlayheadLayerEmpty = true; __dgMarkOverlayDirty(panel); __dgMarkSingleCanvasOverlayDirty(panel); };

  function drawColumnFlashesOverlay(ctx) {
    if (!ctx) return;
    if (!gridArea || gridArea.w <= 0 || gridArea.h <= 0) return;
    if (!flashes || flashes.length === 0) return;
    const height = rows * ch;
    if (!Number.isFinite(height) || height <= 0) return;
    const y = gridArea.y + topPad;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < flashes.length; i++) {
      const alpha = flashes[i];
      if (alpha <= 0) continue;
      ctx.globalAlpha = alpha * 0.25;
      const x = gridArea.x + i * cw;
      ctx.fillRect(x, y, cw, height);
    }
    ctx.restore();
  }

  const handleChainActiveChange = (isActive) => {
    try {
      panel.__dgShowPlaying = null;
      panel.classList?.toggle?.('toy-playing', !!isActive);
    } catch {}
    try {
      if (!isActive) {
        panel.__dgPlayheadLastX = null;
        panel.__dgPlayheadLayer = null;
        if (playheadFrontCtx?.canvas && playheadCanvas?.width && playheadCanvas?.height) {
          R.resetCtx(playheadFrontCtx);
          R.withDeviceSpace(playheadFrontCtx, () => {
            playheadFrontCtx.clearRect(0, 0, playheadCanvas.width, playheadCanvas.height);
          });
          markPlayheadLayerCleared();
        }
      }
    } catch {}
    __dgNeedsUIRefresh = true;
  };
  try {
    let lastChainActive = panel?.dataset?.chainActive;
    handleChainActiveChange(lastChainActive === 'true');
    const chainObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type !== 'attributes' || m.attributeName !== 'data-chain-active') continue;
        const next = panel?.dataset?.chainActive;
        if (next === lastChainActive) continue;
        lastChainActive = next;
        handleChainActiveChange(next === 'true');
      }
    });
    chainObserver.observe(panel, { attributes: true });
    panel.addEventListener('toy:remove', () => chainObserver.disconnect(), { once: true });
  } catch {}

  function updateFlatLayerVisibility() {
    const flat = !!(typeof window !== 'undefined' && window.__PERF_DRAWGRID_FLAT_LAYERS);
    // Default to separating the playhead canvas (perf lever), but allow explicit override.
    // - If user sets window.__DG_PLAYHEAD_SEPARATE_CANVAS = true/false, respect it.
    // - Otherwise default to true.
    const separatePlayhead = (typeof window !== 'undefined' && (window.__DG_PLAYHEAD_SEPARATE_CANVAS === true || window.__DG_PLAYHEAD_SEPARATE_CANVAS === false))
      ? !!window.__DG_PLAYHEAD_SEPARATE_CANVAS
      : true;
    const transportRunning = (typeof isRunning === 'function') && isRunning();
    const ghostEmpty = !!panel.__dgGhostLayerEmpty;
    const flashEmpty = !!panel.__dgFlashLayerEmpty;
    const tutorialEmpty = !!panel.__dgTutorialLayerEmpty;
    const modeKey = `${flat ? 1 : 0}-${DG_SINGLE_CANVAS ? 1 : 0}-${DG_SINGLE_CANVAS_OVERLAYS ? 1 : 0}-${separatePlayhead ? 1 : 0}-${transportRunning ? 1 : 0}-${ghostEmpty ? 1 : 0}-${flashEmpty ? 1 : 0}-${tutorialEmpty ? 1 : 0}`;
    if (panel.__dgFlatLayerMode === modeKey) return;
    panel.__dgFlatLayerMode = modeKey;
    const toggle = (el, visible) => {
      if (!el || !el.style) return;
      el.style.display = visible ? 'block' : 'none';
      // IMPORTANT: if we hide via opacity, we must restore it when showing,
      // otherwise canvases can get stuck invisible.
      if (!visible) el.style.opacity = '0';
      else el.style.opacity = '';
    };
    const showGrid = !flat && !DG_SINGLE_CANVAS;
    const showOverlayBase = !flat && (!DG_SINGLE_CANVAS || DG_SINGLE_CANVAS_OVERLAYS);
    // Hide overlay canvases when they're empty to reduce compositor/layer work.
    // (These flags are maintained by mark*LayerActive/Cleared.)
    const showGhost = showOverlayBase && !panel.__dgGhostLayerEmpty;
    const showFlash = showOverlayBase && !panel.__dgFlashLayerEmpty;
    const showTutorial = !flat && !panel.__dgTutorialLayerEmpty;
    // Playhead should follow transport running state, not note/chain flags.
    // (If we gate this, it's easy to end up with a permanently hidden playhead.)
    const showPlayhead = !flat && separatePlayhead && transportRunning && (!DG_SINGLE_CANVAS || DG_SINGLE_CANVAS_OVERLAYS);
    // Keep the main paint canvas visible; hide auxiliary layers in flat mode.
    toggle(paint, true);
    toggle(grid, showGrid);
    if (nodesCanvas !== grid) toggle(nodesCanvas, showGrid);
    toggle(ghostCanvas, showGhost);
    toggle(flashCanvas, showFlash);
    toggle(tutorialCanvas, showTutorial);
    toggle(particleCanvas, !flat);
    toggle(playheadCanvas, showPlayhead);
    if (DG_SINGLE_CANVAS) {
      toggle(grid, false);
      if (nodesCanvas !== grid) toggle(nodesCanvas, DG_SINGLE_CANVAS_OVERLAYS);
      toggle(ghostCanvas, DG_SINGLE_CANVAS_OVERLAYS && !panel.__dgGhostLayerEmpty);
      toggle(flashCanvas, DG_SINGLE_CANVAS_OVERLAYS && !panel.__dgFlashLayerEmpty);
      toggle(playheadCanvas, DG_SINGLE_CANVAS_OVERLAYS && separatePlayhead && transportRunning);
    }
    try { __dgEnsureLayerSizes('flat-layer-visibility'); } catch {}
  }

  const tutorialFrontCtx = tutorialCanvas.getContext('2d');
  const tutorialBackCanvas = document.createElement('canvas');
  const tutorialBackCtx = tutorialBackCanvas.getContext('2d');

  const __dgGetCanvasEl = (item) => (item && item.canvas) ? item.canvas : item;
  const __dgListAllLayerRefs = () => ([
    frontCanvas,
    backCanvas,
    grid,
    gridFrontCtx,
    gridBackCanvas,
    paint,
    nodesFrontCtx,
    nodesCanvas,
    nodesBackCanvas,
    flashFrontCtx,
    flashCanvas,
    flashBackCanvas,
    ghostFrontCtx,
    ghostCanvas,
    ghostBackCanvas,
    tutorialFrontCtx,
    tutorialCanvas,
    tutorialBackCanvas,
    playheadCanvas,
    particleCanvas,
  ].filter(Boolean));
  const __dgListAllLayerEls = () => {
    const out = [];
    const seen = new Set();
    for (const ref of __dgListAllLayerRefs()) {
      const el = __dgGetCanvasEl(ref);
      if (!el || !el.style) continue;
      if (seen.has(el)) continue;
      seen.add(el);
      out.push(el);
    }
    return out;
  };
  const __dgListManagedBackingEls = () => {
    const out = [];
    const seen = new Set();
    for (const ref of __dgListAllLayerRefs()) {
      const el = __dgGetCanvasEl(ref);
      if (!el || !el.style) continue;
      if (el === particleCanvas) continue; // field-generic owns its backing store
      if (seen.has(el)) continue;
      seen.add(el);
      out.push(el);
    }
    return out;
  };
  const __dgExpectedLayerSizing = () => {
    const w = Number.isFinite(cssW) ? cssW : null;
    const h = Number.isFinite(cssH) ? cssH : null;
    const dpr = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
    if (!w || !h) return null;
    return {
      cssW: w,
      cssH: h,
      pxW: Math.max(1, Math.round(w * dpr)),
      pxH: Math.max(1, Math.round(h * dpr)),
      dpr,
    };
  };
  const __dgGetLayerSizingSnapshot = () => {
    const expected = __dgExpectedLayerSizing();
    if (!expected) return null;
    const rows = [];
    for (const el of __dgListAllLayerEls()) {
      const role = el.getAttribute?.('data-role') || el.className || 'canvas';
      const styleW = (el.style && el.style.width) ? String(el.style.width) : '';
      const styleH = (el.style && el.style.height) ? String(el.style.height) : '';
      const styleWpx = styleW.endsWith('px') ? parseFloat(styleW) : null;
      const styleHpx = styleH.endsWith('px') ? parseFloat(styleH) : null;
      const cachedW = Number.isFinite(el.__dgCssW) ? el.__dgCssW : null;
      const cachedH = Number.isFinite(el.__dgCssH) ? el.__dgCssH : null;
      const wantsBacking = (el !== particleCanvas);
      const bw = Number.isFinite(el.width) ? el.width : null;
      const bh = Number.isFinite(el.height) ? el.height : null;
      const cssWNow = cachedW ?? styleWpx;
      const cssHNow = cachedH ?? styleHpx;
      const cssMismatch = (cssWNow != null && Math.abs(cssWNow - expected.cssW) > 1) ||
        (cssHNow != null && Math.abs(cssHNow - expected.cssH) > 1);
      const backingMismatch = wantsBacking && (
        (bw != null && bw !== expected.pxW) || (bh != null && bh !== expected.pxH)
      );
      rows.push({
        role,
        display: el.style?.display || '',
        cssW: cssWNow,
        cssH: cssHNow,
        styleW,
        styleH,
        backingW: bw,
        backingH: bh,
        wantsBacking,
        cssMismatch,
        backingMismatch,
      });
    }
    return { expected, rows };
  };
  const __dgEnsureLayerSizes = (reason, { force = false, log = false } = {}) => {
    const snap = __dgGetLayerSizingSnapshot();
    if (!snap) return null;
    const { expected, rows } = snap;
    let changed = false;
    const cssWpx = `${expected.cssW}px`;
    const cssHpx = `${expected.cssH}px`;
    for (const el of __dgListAllLayerEls()) {
      if (!el.style) continue;
      if (force || el.__dgCssW !== expected.cssW || el.__dgCssH !== expected.cssH ||
          el.style.width !== cssWpx || el.style.height !== cssHpx) {
        el.__dgCssW = expected.cssW;
        el.__dgCssH = expected.cssH;
        el.style.width = cssWpx;
        el.style.height = cssHpx;
        changed = true;
      }
    }
    for (const el of __dgListManagedBackingEls()) {
      if (!el) continue;
      if (force || el.width !== expected.pxW || el.height !== expected.pxH) {
        el.width = expected.pxW;
        el.height = expected.pxH;
        changed = true;
      }
    }
    if (log || (typeof window !== 'undefined' && window.__DG_LAYER_SIZE_TRACE)) {
      const mismatches = rows.filter(r => r.cssMismatch || r.backingMismatch);
      if (mismatches.length || log) {
        try {
          console.group('[DG][layer-size]', reason || 'sync');
          console.log('expected', expected, 'changed', changed);
          console.table(mismatches.length ? mismatches : rows);
          console.groupEnd();
        } catch {}
      }
    }
    return { expected, rows, changed };
  };
  updateFlatLayerVisibility();
  let tutorialCtx = tutorialFrontCtx;
  // Tag back-buffer canvases so helpers can resolve the owning panel.
  try {
    gridBackCanvas.__dgPanel = panel;
    backCanvas.__dgPanel = panel;
    nodesBackCanvas.__dgPanel = panel;
    flashBackCanvas.__dgPanel = panel;
    ghostBackCanvas.__dgPanel = panel;
    tutorialBackCanvas.__dgPanel = panel;
  } catch {}

// ===== Paint lifecycle tracing (disabled by default) =====
// Flip manually in console if needed:
//   window.__DG_PAINT_TRACE = true
try {
  if (typeof window !== 'undefined' && window.__DG_PAINT_TRACE === undefined) {
    window.__DG_PAINT_TRACE = false;
  }
} catch {}
  function dgPaintTrace(event, data = null) {
    try {
      const on = __dgFlag('paintTrace') || !!(window && window.__DG_PAINT_TRACE);
      if (!on) return;
    } catch { return; }

    try {
      dgLogLine?.('paint-trace', {
        event,
        panelId: panel?.id || null,
        usingBackBuffers,
        zoomGestureActive,
        zoomMode,
        cssW,
        cssH,
        paintDpr,
        front: { w: frontCanvas?.width || 0, h: frontCanvas?.height || 0 },
        back: { w: backCanvas?.width || 0, h: backCanvas?.height || 0 },
        // This helps detect “double scaling” issues:
        frontRect: (() => { try { const r = frontCanvas?.getBoundingClientRect?.(); return r ? { w: r.width, h: r.height } : null; } catch {} return null; })(),
        data
      });
    } catch {}
  }

// Size/scale trace for refresh flicker debugging (disabled by default).
// Enable manually if required:
//   window.__DG_REFRESH_SIZE_TRACE = true
try {
  if (typeof window !== 'undefined' && window.__DG_REFRESH_DEBUG === undefined) {
    window.__DG_REFRESH_DEBUG = false;
  }
  if (typeof window !== 'undefined' && window.__DG_REFRESH_SIZE_TRACE === undefined) {
    window.__DG_REFRESH_SIZE_TRACE = false;
  }
  // IMPORTANT:
  // Size trace is safe to enable during perf runs (buffered, throttled),
  // but pixel sampling can trigger expensive GPU readbacks (e.g. getImageData).
  // Keep sampling OFF by default; only enable it when actively debugging a visual.
  if (typeof window !== 'undefined' && window.__DG_REFRESH_SIZE_TRACE_SAMPLE === undefined) {
    window.__DG_REFRESH_SIZE_TRACE_SAMPLE = false;
  }
  if (typeof window !== 'undefined' && window.__DG_REFRESH_SIZE_TRACE_LIMIT === undefined) {
    window.__DG_REFRESH_SIZE_TRACE_LIMIT = 200;
  }
  // Throttle noisy size-trace logs (per panel instance).
  // Default is intentionally conservative; bump lower only when actively diagnosing.
  //   window.__DG_REFRESH_SIZE_TRACE_THROTTLE_MS = 0   // disables throttling
  if (typeof window !== 'undefined' && window.__DG_REFRESH_SIZE_TRACE_THROTTLE_MS === undefined) {
    window.__DG_REFRESH_SIZE_TRACE_THROTTLE_MS = 800;
  }
} catch {}
  let __dgSizeTraceCount = 0;
  let __dgSizeTraceLastTs = 0;

  function __dgSizeTraceGate(consume = false) {
    try {
      const on = (typeof window !== 'undefined' && window.__DG_REFRESH_SIZE_TRACE);
      if (!on) return false;
    } catch { return false; }

    // Throttle: this trace can spam hard during resize/commit churn.
    let now = 0;
    try {
      const throttleMs = (typeof window !== 'undefined') ? Number(window.__DG_REFRESH_SIZE_TRACE_THROTTLE_MS) : 0;
      now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if (Number.isFinite(throttleMs) && throttleMs > 0) {
        if (__dgSizeTraceLastTs && (now - __dgSizeTraceLastTs) < throttleMs) return false;
      }
    } catch {}

    // Hard cap (per panel instance).
    try {
      const limit = (typeof window !== 'undefined') ? window.__DG_REFRESH_SIZE_TRACE_LIMIT : null;
      if (Number.isFinite(limit) && limit >= 0 && __dgSizeTraceCount >= limit) return false;
    } catch {}

    // Consume gate (advance counters) only when we're actually going to log.
    if (consume) {
      try { __dgSizeTraceLastTs = now || __dgSizeTraceLastTs; } catch {}
      try { __dgSizeTraceCount++; } catch {}
    }
    return true;
  }

  // Cheap predicate so size-trace callers can avoid expensive DOM reads unless a log will actually be recorded.
  function dgSizeTraceCanLog() {
    return __dgSizeTraceGate(false);
  }

  function dgSizeTrace(event, data = null) {
    if (!__dgSizeTraceGate(true)) return;
    try {
      const payload = data && typeof data === 'object' ? data : {};
      payload.panelId = panel?.id || null;

      // Prefer the perf trace buffer (cheap + bounded). Console logging is opt-in.
      try {
        if (typeof window !== 'undefined' && typeof window.__PERF_TRACE_PUSH === 'function') {
          window.__PERF_TRACE_PUSH('DG.size-trace', { event, ...payload });
        }
      } catch {}

      // Console logging is *explicit* opt-in (no dependency on DG_DEBUG).
      const toConsole = (typeof window !== 'undefined' && window.__DG_REFRESH_SIZE_TRACE_TO_CONSOLE === true);
      if (!toConsole) return;

      const text = (() => {
        try { return JSON.stringify(payload); } catch { return null; }
      })();
      if (text) console.log('[DG][size-trace]', event, text);
      else console.log('[DG][size-trace]', event, payload);
    } catch {}
  }

  // Extra targeted logs for refresh/zoom/layout issues.
  // Enable with: window.__DG_REFRESH_DEBUG = true
  function dgRefreshTrace(event, data = null) {
    try {
      const on = (typeof window !== 'undefined' && window.__DG_REFRESH_DEBUG);
      if (!on) return;
      // ro:size can be noisy during initial mount/overview settling.
      // Keep it opt-in so refresh debug stays usable.
      if (event === 'ro:size' && !window.__DG_REFRESH_DEBUG_RO_SIZE) return;
    } catch { return; }
    try {
      if (data !== null && data !== undefined) console.log('[DG][refresh]', event, data);
      else console.log('[DG][refresh]', event);
    } catch {}
  }


  function dgSizeTraceCanvas(tag, extra = null) {
    try {
      const on = (typeof window !== 'undefined' && window.__DG_REFRESH_SIZE_TRACE);
      if (!on) return;
    } catch { return; }
    try {
      const describeCanvas = (c) => {
        if (!c) return null;
        const w = c.width || 0;
        const h = c.height || 0;
        const effDprW = (cssW > 0 && w > 0) ? (w / cssW) : null;
        const effDprH = (cssH > 0 && h > 0) ? (h / cssH) : null;
        return { w, h, effDprW, effDprH };
      };
      const rect = frontCanvas?.getBoundingClientRect?.();
      const panelRect = panel?.getBoundingClientRect?.();
      const payload = {
        tag,
        cssW,
        cssH,
        paintDpr,
        frontCanvas: {
          w: frontCanvas?.width || 0,
          h: frontCanvas?.height || 0,
          rectW: rect?.width || 0,
          rectH: rect?.height || 0,
        },
        // Snapshot all major composited surfaces so we can see effective DPR + backing-store sizes.
        // NOTE: particles are owned by field-generic; see __FG_EFFECTIVE_DPR_TRACE for that.
        surfaces: {
          front: describeCanvas(frontCanvas),
          back: describeCanvas(backCanvas),
          playhead: describeCanvas(playheadCanvas),
          gridBack: describeCanvas(gridBackCanvas),
          nodesBack: describeCanvas(nodesBackCanvas),
          flashBack: describeCanvas(flashBackCanvas),
          ghostBack: describeCanvas(ghostBackCanvas),
          tutorialBack: describeCanvas(tutorialBackCanvas),
        },
        gridBack: {
          w: gridBackCanvas?.width || 0,
          h: gridBackCanvas?.height || 0,
        },
        panelRect: {
          w: panelRect?.width || 0,
          h: panelRect?.height || 0,
        },
        toyScale: (() => {
          try {
            const raw = panel ? getComputedStyle(panel).getPropertyValue('--toy-scale') : '';
            const n = parseFloat(raw);
            return Number.isFinite(n) ? n : null;
          } catch { return null; }
        })(),
        boardScale: (() => {
          try {
            const host = panel?.closest?.('.board-viewport') || document.querySelector('.board-viewport');
            const raw = host ? boardScaleHelper(host) : (Number.isFinite(window?.__boardScale) ? window.__boardScale : 1);
            return Number.isFinite(raw) ? raw : null;
          } catch { return null; }
        })(),
        extra: extra || null,
      };
      dgSizeTrace('canvas-sizes', payload);
    } catch {}
  }

  // Effective DPR tracer (per surface).
  // Purpose: prove that pressure-DPR is *actually* applying to every heavy canvas, and
  // catch backing-store churn (e.g. oscillating 1px resizes) after refactors.
  let __dgLastEffectiveDprSig = '';
  function dgEffectiveDprTrace(tag, extra = null) {
    try {
      const on = (typeof window !== 'undefined' && window.__DG_EFFECTIVE_DPR_TRACE);
      if (!on) return;
    } catch { return; }

    try {
      const describe = (c) => {
        if (!c) return null;
        const w = c.width || 0;
        const h = c.height || 0;
        const effDprW = (cssW > 0 && w > 0) ? (w / cssW) : null;
        const effDprH = (cssH > 0 && h > 0) ? (h / cssH) : null;
        return { w, h, effDprW, effDprH };
      };

      const payload = {
        tag,
        cssW,
        cssH,
        paintDpr,
        surfaces: {
          front: describe(frontCanvas),
          back: describe(backCanvas),
          playhead: describe(playheadCanvas),
          gridBack: describe(gridBackCanvas),
          nodesBack: describe(nodesBackCanvas),
          flashBack: describe(flashBackCanvas),
          ghostBack: describe(ghostBackCanvas),
          tutorialBack: describe(tutorialBackCanvas),
        },
        extra: extra || null,
      };

      const sig = JSON.stringify(payload);
      if (sig === __dgLastEffectiveDprSig) return;
      __dgLastEffectiveDprSig = sig;

      // Prefer buffered trace (PerfLab) to avoid console stalls during perf runs.
      try {
        const push = (typeof window !== 'undefined') ? window.__PERF_TRACE_PUSH : null;
        if (typeof push === 'function') push('DG.dpr', payload);
      } catch {}

      // Console is opt-in only (debugging, not perf).
      try {
        const toConsole = (typeof window !== 'undefined') ? !!window.__PERF_TRACE_TO_CONSOLE : true;
        if (toConsole) console.log('[DG][dpr]', payload);
      } catch {}
    } catch {}
  }

  function debugPaintSizes(tag, extra = null) {
    if (!DG_LAYOUT_DEBUG) return;
    try {
      const targetW = Math.max(1, Math.round(cssW * paintDpr));
      const targetH = Math.max(1, Math.round(cssH * paintDpr));
      dgLogLine('paint-sizes', {
        tag,
        panelId: panel?.id || null,
        cssW,
        cssH,
        paintDpr,
        targetW,
        targetH,
        front: {
          w: frontCanvas?.width || 0,
          h: frontCanvas?.height || 0,
          cssW: frontCanvas?.style?.width || '',
          cssH: frontCanvas?.style?.height || '',
        },
        back: {
          w: backCanvas?.width || 0,
          h: backCanvas?.height || 0,
          cssW: backCanvas?.style?.width || '',
          cssH: backCanvas?.style?.height || '',
        },
        extra,
      });
    } catch {}
  }

  // Used by dg-paint-buffers to avoid re-entrant post-commit redraw scheduling.
  // NOTE: must be declared before createDgPaintBuffers() host snapshot to avoid TDZ.
  let __dgSuppressPostCommitOnPaintResize = false;

  // === Paint/backbuffer subsystem (extracted) ===
  const dgPaintBuffers = createDgPaintBuffers(() => ({
    // Flags + sizing
    DG_LAYOUT_DEBUG,
    cssW,
    cssH,
    paintDpr,
    zoomGestureActive,

    // Required callbacks / debug
    withDeviceSpace: R.withDeviceSpace,
    dgPaintTrace,
    dgLogLine,
    debugPaintSizes,

    // Redraw scheduling
    strokes,
    __dgSuppressPostCommitOnPaintResize,
    ensurePostCommitRedraw,

    // The specific contexts/canvases used by swapBackToFront
    backCtx,
    frontCtx,
    backCanvas,
    frontCanvas,

    // All contexts to resize (front/back)
    frontCtxs: [
      { ctx: gridFrontCtx, label: 'gridFront' },
      { ctx: nodesFrontCtx, label: 'nodesFront' },
      { ctx: flashFrontCtx, label: 'flashFront' },
      { ctx: ghostFrontCtx, label: 'ghostFront' },
      { ctx: tutorialFrontCtx, label: 'tutorialFront' },
    ],
    backCtxs: [
      { ctx: gridBackCtx, label: 'gridBack' },
      { ctx: nodesBackCtx, label: 'nodesBack' },
      { ctx: flashBackCtx, label: 'flashBack' },
      { ctx: ghostBackCtx, label: 'ghostBack' },
      { ctx: tutorialBackCtx, label: 'tutorialBack' },
    ],

    // Back/front pairs for sync
    backFrontPairs: [
      [gridBackCtx, gridFrontCtx],
      [nodesBackCtx, nodesFrontCtx],
      [flashBackCtx, flashFrontCtx],
      [ghostBackCtx, ghostFrontCtx],
      [tutorialBackCtx, tutorialFrontCtx],
    ],
  }));

  const syncBackBufferSizes = dgPaintBuffers.syncBackBufferSizes;
  const updatePaintBackingStores = dgPaintBuffers.updatePaintBackingStores;
  const swapBackToFront = dgPaintBuffers.swapBackToFront;
  let __dgPostCommitRaf = 0;
  let __dgPostCommitTries = 0;
  function __dgReprojectNormalizedStrokesIfNeeded(tag = 'reproject') {
    try {
      if (!strokes || strokes.length === 0) return false;
      if (!gridArea || !Number.isFinite(gridArea.x) || !Number.isFinite(gridArea.w) || !Number.isFinite(gridArea.h)) return false;

      const gh = Math.max(1, (gridArea.h - (topPad || 0)));
      let changed = 0;

      const reprojectList = (list) => {
        if (!Array.isArray(list) || list.length === 0) return;
        for (const s of list) {
          if (!s || !Array.isArray(s.__ptsN) || s.__ptsN.length === 0) continue;
          const needsPts = (!Array.isArray(s.pts) || s.pts.length === 0);
          if (!needsPts) continue;
          s.pts = s.__ptsN.map(np => ({
            x: gridArea.x + (Number(np?.nx) || 0) * gridArea.w,
            y: (gridArea.y + (topPad || 0)) + (Number(np?.ny) || 0) * gh,
          }));
          changed++;
        }
      };

      reprojectList(strokes);
      if (changed && DG_LAYOUT_DEBUG) {
        try {
          dgLogLine?.('reproject-normalized-strokes', {
            panelId: panel?.id || null,
            tag,
            changed,
            strokes: Array.isArray(strokes) ? strokes.length : 0,
          });
        } catch {}
      }

      return changed > 0;
    } catch {}
    return false;
  }

  function ensurePostCommitRedraw(reason = 'post-commit') {
    if (__dgPostCommitRaf) return;
    const tick = () => {
      __dgPostCommitRaf = 0;
      dgPaintTrace('postCommit:tick', { tries: __dgPostCommitTries, inCommit: (() => { try { return !!window.__ZOOM_COMMIT_PHASE; } catch {} return false; })() });
      const inCommit = (() => { try { return !!window.__ZOOM_COMMIT_PHASE; } catch {} return false; })();
      if (inCommit && __dgPostCommitTries < 20) {
        __dgPostCommitTries++;
        __dgPostCommitRaf = requestAnimationFrame(tick);
        return;
      }
      __dgPostCommitTries = 0;
      try { useFrontBuffers(); } catch {}
      try {
        __dgSuppressPostCommitOnPaintResize = true;
        updatePaintBackingStores({ force: true, target: 'both' });
      } catch {} finally {
        __dgSuppressPostCommitOnPaintResize = false;
      }

      const hasStrokes = Array.isArray(strokes) && strokes.length > 0;
      if (hasStrokes) {
        // IMPORTANT: if we're about to redraw from strokes, make sure normalized strokes
        // have been reprojected into live `pts` first. Otherwise this path can clear
        // the paint canvas and draw nothing (line "vanishes" until next interaction).
        try { __dgReprojectNormalizedStrokesIfNeeded(`post-commit:${reason}`); } catch {}
        dgPaintTrace('postCommit:redraw-from-strokes:begin', { strokes: strokes?.length || 0 });
        try { clearAndRedrawFromStrokes(DG_SINGLE_CANVAS ? backCtx : frontCtx, `post-commit:${reason}`); } catch {}
        dgPaintTrace('postCommit:redraw-from-strokes:end', { strokes: strokes?.length || 0 });
        try { ensureBackVisualsFreshFromFront?.(); } catch {}

        // IMPORTANT:
        // In DG_SINGLE_CANVAS mode, redrawing the paint surface is not sufficient.
        // We must also guarantee a composite + front swap, otherwise the user can
        // see an empty body (grid hidden) / incorrect scale until an interaction.
        try { markStaticDirty(`post-commit:${reason}`); } catch {}
        try { panel.__dgSingleCompositeDirty = true; } catch {}
        __dgNeedsUIRefresh = true;
        __dgFrontSwapNextDraw = true;
        __dgForceFullDrawNext = true;
        __dgForceFullDrawFrames = Math.max(__dgForceFullDrawFrames || 0, 4);
        try {
          if (typeof requestFrontSwap === 'function') {
            requestFrontSwap(useFrontBuffers);
          }
        } catch {}
      } else {
        // No strokes: we still need a deterministic post-commit refresh on refresh/boot.
        // Otherwise a transient scaled DOM rect during zoom settle can leave the user
        // seeing an empty body (grid hidden) until the next interaction.
        try { markLayoutSizeDirty(); } catch {}
        try { ensureSizeReady({ force: false }); } catch {}
        try { panel.__dgSingleCompositeDirty = true; } catch {}
        try { resnapAndRedraw(false, { preservePaintIfNoStrokes: true, skipLayout: true }); } catch {}
        try {
          if (typeof requestFrontSwap === 'function') {
            requestFrontSwap(useFrontBuffers);
          }
        } catch {}
      }
      if (DG_LAYOUT_DEBUG) {
        dgLogLine('post-commit-redraw', { panelId: panel?.id || null, reason });
      }
    };
    __dgPostCommitRaf = requestAnimationFrame(tick);
  }

  // === Active canvas helpers (front/back safe) ===
  const {
    getActivePaintCanvas,
    getActivePaintCtx,
    resetPaintBlend,
    pointerToPaintLogical,
  } = createActiveCanvasHelpers(() => ({
    DG_SINGLE_CANVAS,
    usingBackBuffers,
    backCanvas,
    frontCanvas,
    backCtx,
    frontCtx,
    cssW,
    cssH,
    paintDpr,
    // Stable layout root (screen-space basis)
    wrap,
    // Optional: stable layer root for screen-space mapping
    layersRoot,
    // Optional: unified mount object (if present)
    mount: panel.__dgMount,
  }));

  function resizeSurfacesFor(nextCssW, nextCssH, nextDpr, reason) {
    return F.perfMarkSection('drawgrid.resize', () => {
      if (!__dgCommitResizeCount && (() => { try { return !!window.__ZOOM_COMMIT_PHASE; } catch {} return false; })()) {
        __dgCommitResizeCount = 1;
        if (DG_DEBUG) { try { console.warn('[DG] resizeSurfacesFor during commit'); } catch {} }
      }
      // Allow backing-store DPR < 1 (critical for perf when zoomed out / under pressure).
      const dpr = Math.max(0.25, Number.isFinite(nextDpr) ? nextDpr : (window.devicePixelRatio || 1));

      const __prevCssW = cssW, __prevCssH = cssH, __prevPaintDpr = paintDpr;
      const __reason = (typeof reason === 'string' && reason) ? reason : 'unknown';
      // IMPORTANT:
      // __dgCapDprForBackingStore includes hysteresis to prevent thrash (good),
      // but during explicit zoom commits it can cause "only shrinks over time"
      // because small ramp-ups are blocked while ramp-downs are allowed.
      // So: disable hysteresis on zoom-commit paths.
      const __prevForCap = (__reason.indexOf('zoom-commit') === 0) ? null : paintDpr;
      if (__reason.indexOf('zoom-commit') !== -1) {
        __dgLastZoomCommitTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      }
      const __nextPaintDpr = __dgCapDprForBackingStore(nextCssW, nextCssH, Math.min(dpr, 3), __prevForCap);
      // Quantize DPR to avoid tiny float jitter causing 1–2px backing-store oscillation.
      const __quantizeDpr = (v) => {
        const n = Number.isFinite(v) ? v : 1;
        return Math.max(0.25, Math.round(n * 64) / 64);
      };
      paintDpr = __quantizeDpr(__nextPaintDpr);
      if (typeof window !== 'undefined' && window.__DG_REFRESH_DEBUG) {
        const __changed = (__prevCssW !== nextCssW) || (__prevCssH !== nextCssH) || (Math.abs(__prevPaintDpr - __nextPaintDpr) > 1e-6);
        if (__changed) {
          try {
            dgRefreshTrace('resizeSurfacesFor', {
              reason: __reason,
              prev: { cssW: __prevCssW, cssH: __prevCssH, paintDpr: __prevPaintDpr },
              next: { cssW: nextCssW, cssH: nextCssH, paintDpr: __nextPaintDpr },
              zoomMode: __dgIsGesturing() ? 'gesturing' : 'idle',
            });
          } catch {}
        }
      }
      const __quant2 = (v) => Math.max(1, Math.round(v / 2) * 2); // reduce 1px resize churn
      const __quantTarget = (v) => {
        const n = Number.isFinite(v) ? v : 1;
        const r = Math.round(n);
        // If already (very nearly) an integer, keep it exact to avoid 599->600 drift.
        if (Math.abs(n - r) < 1e-6) return Math.max(1, r);
        return __quant2(n);
      };
      let prevCssW = cssW;
      let prevCssH = cssH;
      let prevTargetW = frontCanvas?.width;
      let prevTargetH = frontCanvas?.height;
      // IMPORTANT:
      // If CSS size has not changed, do NOT allow backing-store dimensions
      // to drift due to rounding (e.g. 599 -> 600).
      // This prevents resize churn that causes compositor stalls.
      let targetW = __quantTarget(nextCssW * paintDpr);
      let targetH = __quantTarget(nextCssH * paintDpr);
      const dprChanged = Math.abs(paintDpr - __dgLastResizeDpr) > 0.001;
      let sizeChanged = targetW !== __dgLastResizeTargetW || targetH !== __dgLastResizeTargetH;
      const cssChanged = nextCssW !== __dgLastResizeCssW || nextCssH !== __dgLastResizeCssH;
      // Drift-lock:
      // If CSS size is stable, treat tiny target changes as noise and keep the previous backing-store.
      // This avoids 1-2px oscillation (e.g. 599 <-> 600) causing expensive resizes.
      if (prevCssW === nextCssW && prevCssH === nextCssH) {
        if (Number.isFinite(prevTargetW) && Number.isFinite(prevTargetH)) {
          const dw = Math.abs(targetW - prevTargetW);
          const dh = Math.abs(targetH - prevTargetH);
          if (dw <= 2 && dh <= 2) {
            targetW = prevTargetW;
            targetH = prevTargetH;
          }
        }
        sizeChanged = targetW !== __dgLastResizeTargetW || targetH !== __dgLastResizeTargetH;
      }
      // Fast no-op exit: avoids DOM writes + potential compositor churn when we only differ by float jitter.
      if (!dprChanged && !sizeChanged && !cssChanged) {
        dgSizeTrace('resizeSurfacesFor(no-op)', { reason, nextCssW, nextCssH, nextDpr, paintDpr, targetW, targetH, sizeChanged: false, dprChanged: false });
        return;
      }
      // Any size/DPR change should force overlays dirty.
      try { __dgMarkOverlayDirty(panel); } catch {}
      // Optional: when hunting "mystery scale jumps", capture who triggered a real resize.
      // Enable with: window.__DG_RESIZE_TRACE = true; window.__DG_RESIZE_TRACE_STACK = true;
      try {
        if (typeof window !== 'undefined' && window.__DG_RESIZE_TRACE) {
          let stack = null;
          try {
            if (window.__DG_RESIZE_TRACE_STACK) {
              const e = new Error('DG resizeSurfacesFor');
              stack = (e && e.stack) ? String(e.stack).split('\n').slice(1, 7).join('\n') : null;
            }
          } catch {}
          console.log('[DG][resize]', reason, {
            nextCssW, nextCssH, nextDpr, paintDpr,
            targetW, targetH,
            cssChanged, sizeChanged, dprChanged,
            zoomMode,
            stack,
          });
        }
      } catch {}
      __dgLastResizeCssW = nextCssW;
      __dgLastResizeCssH = nextCssH;
      // Track the last committed backing-store target so we can no-op out next frame.
      // Without these assignments, every tick looks like a 'sizeChanged/dprChanged' and we thrash canvases.
      __dgLastResizeTargetW = targetW;
      __dgLastResizeTargetH = targetH;
      __dgLastResizeDpr = paintDpr;
      __dgPaintDebugLog('resizeSurfacesFor', {
        reason,
        nextCssW,
        nextCssH,
        nextDpr,
        paintDpr,
        targetW,
        targetH,
        sizeChanged,
        dprChanged,
      });

      // === NEW: single applier for managed canvases ===
      // If the generic surface manager is present, let it apply:
      // - CSS sizes
      // - backing-store sizes for managed canvases
      // - ctx.setTransform(dpr,0,0,dpr,0,0) for managed canvases
      //
      // Particles are registered as policy:'css' (field-generic owns backing store),
      // so they'll only get CSS sizing here.
      const setCssSize = (canvasEl) => {
        if (!canvasEl) return;
        // Accept either a canvas element or a 2D context (ctx.canvas).
        const el = (canvasEl && canvasEl.canvas) ? canvasEl.canvas : canvasEl;
        if (!el || !el.style) return;
        // Avoid repeated style writes inside RAF; these can be surprisingly expensive at scale.
        if (el.__dgCssW === nextCssW && el.__dgCssH === nextCssH) return;
        el.__dgCssW = nextCssW;
        el.__dgCssH = nextCssH;
        el.style.width = `${nextCssW}px`;
        el.style.height = `${nextCssH}px`;
      };

      try {
        if (dgSurfaces && typeof dgSurfaces.applyExplicit === 'function') {
          // Keep local state in sync with the manager-applied state.
          cssW = nextCssW;
          cssH = nextCssH;
          dgSurfaces.applyExplicit(nextCssW, nextCssH, paintDpr);
          __dgListAllLayerRefs().forEach(setCssSize);
          const resizeBack = (canvas) => {
            if (!canvas) return;
            if (canvas.width === targetW && canvas.height === targetH) return;
            canvas.width = targetW;
            canvas.height = targetH;
          };
          resizeBack(gridBackCanvas);
          resizeBack(nodesBackCanvas);
          resizeBack(flashBackCanvas);
          resizeBack(ghostBackCanvas);
          resizeBack(tutorialBackCanvas);
          resizeBack(backCanvas);
          dgSizeTrace('resizeSurfacesFor(surfaceMgr)', { reason, nextCssW, nextCssH, paintDpr, targetW, targetH });
          try { __dgEnsureLayerSizes('resizeSurfacesFor(surfaceMgr)'); } catch {}
          return;
        }
      } catch (e) {
        try { console.warn('[DG] surfaceMgr applyExplicit failed, falling back', e); } catch {}
      }
      // Keep *all* drawgrid canvases pinned to the same CSS size as the panel.
      // Otherwise, when paintDpr/backing-store sizes are reduced (< 1) for perf while zoomed out,
      // some overlays (nodes/connectors/labels) can end up with a smaller intrinsic CSS size and appear scaled down.
      __dgListAllLayerRefs().forEach(setCssSize);
      const resize = (canvas) => {
        if (!canvas) return;
        if (canvas.width === targetW && canvas.height === targetH) return;
        canvas.width = targetW;
        canvas.height = targetH;
      };
      resize(gridFrontCtx?.canvas);
      resize(gridBackCanvas);
      // particleCanvas sizing is managed by field-generic (it owns DPR/size)
      resize(nodesFrontCtx?.canvas);
      resize(nodesBackCanvas);
      resize(flashFrontCtx?.canvas);
      resize(flashBackCanvas);
      resize(ghostFrontCtx?.canvas);
      resize(ghostBackCanvas);
      resize(tutorialFrontCtx?.canvas);
      resize(tutorialBackCanvas);
      resize(playheadCanvas);
      resize(frontCanvas);
      resize(backCanvas);
      try { __dgEnsureLayerSizes('resizeSurfacesFor'); } catch {}
      try {
        if (playheadFrontCtx?.canvas) {
          R.resetCtx(playheadFrontCtx);
          __dgWithLogicalSpace(playheadFrontCtx, () => {
            const surface = playheadFrontCtx.canvas;
            const w = surface?.width || 0;
            const h = surface?.height || 0;
            playheadFrontCtx.clearRect(0, 0, w, h);
          });
          markPlayheadLayerCleared();
        }
      } catch {}

      // Non-spammy: only logs when a meaningful scale signature changes.
      // This should catch cases where nodes/lines/text appear “smaller” than other layers.
      try {
        const wrapRect = wrap?.getBoundingClientRect?.();
        const sigPayload = {
          panelId: panel?.id || null,
          reason,
          zoomMode,
          cssW: nextCssW,
          cssH: nextCssH,
          paintDpr,
          wrap: wrapRect ? { w: Math.round(wrapRect.width), h: Math.round(wrapRect.height) } : null,
          paint: __dgDescribeCanvasScale(paint, wrapRect),
          nodes: __dgDescribeCanvasScale(nodesCanvas, wrapRect),
          grid: __dgDescribeCanvasScale(grid, wrapRect),
          ghost: __dgDescribeCanvasScale(ghostCanvas, wrapRect),
          flash: __dgDescribeCanvasScale(flashCanvas, wrapRect),
          tutorial: __dgDescribeCanvasScale(tutorialCanvas, wrapRect),
          playhead: __dgDescribeCanvasScale(playheadCanvas, wrapRect),
        };
        dgScaleTrace('resizeSurfacesFor', sigPayload);
        // Emit a single WARN line when nodes (note nodes + connecting lines + note text)
        // are physically scaled differently than paint. Logs only on state change.
        __dgEmitScaleMismatchIfChanged(sigPayload);
      } catch {}

      dgSizeTrace('resizeSurfacesFor', {
        reason,
        nextCssW,
        nextCssH,
        nextDpr,
        paintDpr,
        targetW,
        targetH,
        sizeChanged,
        dprChanged,
      });
      dgSizeTraceCanvas('after-resizeSurfacesFor', {
        targetW,
        targetH,
      });
      dgEffectiveDprTrace('resizeSurfacesFor', { reason, nextCssW, nextCssH, nextDpr, paintDpr, targetW, targetH, sizeChanged, dprChanged });
      // Optional, non-spammy: trace when any layer's CSS/rect scale signature changes.
      __dgTraceCanvasScaleSnapshot(__reason, panel?.id || null, [
        { role: 'wrap', el: wrap },
        { role: 'front', el: frontCanvas },
        { role: 'grid', el: grid },
        { role: 'paint', el: paint },
        { role: 'nodes', el: nodesCanvas },
        { role: 'ghost', el: ghostCanvas },
        { role: 'flash', el: flashCanvas },
        { role: 'tutorial', el: tutorialCanvas },
        { role: 'particles', el: particleCanvas },
        { role: 'playhead', el: playheadCanvas },
      ]);
      if (dprChanged || sizeChanged) {
        try { markStaticDirty('resize-surfaces'); } catch {}
        // BUGFIX: overlay caches must not survive a DPR/size change.
        // If caches persist, nodes/connectors/labels can redraw later using stale
        // assumptions and “jump” or appear scaled from the top-left.
        try {
          if (__dgGridCache) __dgGridCache.key = '';
        if (__dgNodesCache) { __dgNodesCache.key = ''; __dgNodesCache.nodeCoords = null; }
          if (__dgBlocksCache) __dgBlocksCache.key = '';
          panel.__dgGridHasPainted = false;
          __dgForceFullDrawNext = true;
        } catch {}
        updatePaintBackingStores({ force: true, target: 'both' });
        if (Array.isArray(strokes) && strokes.length > 0) {
          try { useFrontBuffers(); } catch {}
          try { clearAndRedrawFromStrokes(DG_SINGLE_CANVAS ? backCtx : frontCtx, 'resize-surfaces'); } catch {}
          try { ensureBackVisualsFreshFromFront?.(); } catch {}
        }
        // In single-canvas mode, composite immediately so the user doesn’t see a
        // temporarily stale overlay stack until another camera move.
        if (DG_SINGLE_CANVAS && isPanelVisible) {
          try { compositeSingleCanvas(); } catch {}
          try { panel.__dgSingleCompositeDirty = false; } catch {}
        }
      } else {
        updatePaintBackingStores({ force: false, target: 'both' });
      }
      debugPaintSizes('resizeSurfacesFor');
      try { ensureBackVisualsFreshFromFront?.(); } catch {}
    });
  }

  let __forceSwipeVisible = null; // null=auto, true/false=forced by tutorial
  let __swapRAF = null;
  let __dgSkipSwapsDuringDrag = false;

  // helper: request a single swap this frame
  function requestFrontSwap(andThen) {
    if (__swapRAF || __dgSkipSwapsDuringDrag) {
      if (DG_SWAP_DEBUG && __dgSkipSwapsDuringDrag) dgs('skip', 'live drag in progress');
      return;
    }
    const mark = `DG.swapRAF@${performance.now().toFixed(2)}`;
    if (DG_SWAP_DEBUG) dgs('request', { usingBackBuffers, pendingPaintSwap, pendingSwap, zoomCommitPhase, zoomGestureActive });
    __swapRAF = requestAnimationFrame(() => {
      __swapRAF = null;
      FD.layerEvent('frontSwap:raf', {
        panelId: panel?.id || null,
        panelRef: panel,
        usingBackBuffers,
        pendingPaintSwap,
        pendingSwap,
        singleCanvas: !!DG_SINGLE_CANVAS,
        overlays: !!DG_SINGLE_CANVAS_OVERLAYS,
      });
      dgPaintTrace('requestFrontSwap:raf-begin', { pendingPaintSwap, pendingSwap, zoomCommitPhase, zoomGestureActive });
      if (DG_SWAP_DEBUG) console.time(mark);
      // SWAP GUARD:
      // On refresh/hydrate we sometimes see the front canvas temporarily sized to the *scaled* DOM rect
      // (e.g. 479x359 when the backing store should be 798x599). That resize clears the canvas and
      // can make strokes "disappear" until a later interaction triggers a redraw.
      try {
        const expW = (__dgLastResizeTargetW || (cssW ? Math.max(1, Math.round(cssW * paintDpr)) : 0));
        const expH = (__dgLastResizeTargetH || (cssH ? Math.max(1, Math.round(cssH * paintDpr)) : 0));
        if (frontCanvas && expW && expH) {
          const rect = getRect(frontCanvas);
          const rectW = Math.max(1, Math.round(rect?.width || 0));
          const rectH = Math.max(1, Math.round(rect?.height || 0));
          const looksLikeScaledRect = (frontCanvas.width === rectW && frontCanvas.height === rectH && (rectW !== expW || rectH !== expH));
          const wrongBackingStore = (frontCanvas.width !== expW || frontCanvas.height !== expH);
          if (wrongBackingStore && looksLikeScaledRect) {
            dgPaintTrace('swapGuard:frontBackingStoreWrong', { expW, expH, rectW, rectH, frontW: frontCanvas.width, frontH: frontCanvas.height });
            if (DG_SWAP_DEBUG || DG_DEBUG) {
              console.warn('[DG][swapGuard] front canvas backing store was scaled-rect sized; restoring + redrawing', { expW, expH, rectW, rectH, frontW: frontCanvas.width, frontH: frontCanvas.height });
              console.trace('[DG][swapGuard] stack (who resized front canvas?)');
            }
            // Restore the correct backing store size (clears, so immediately redraw strokes).
            frontCanvas.width = expW;
            frontCanvas.height = expH;
            if (Array.isArray(strokes) && strokes.length > 0) {
              try { clearAndRedrawFromStrokes(DG_SINGLE_CANVAS ? backCtx : frontCtx, 'swap-guard'); } catch {}
            }
          }
        }
      } catch {}
      // NEW: if we're currently drawing to FRONT, make back visuals fresh to prevent a blank frame.
      if (!usingBackBuffers) { ensureBackVisualsFreshFromFront(); if (DG_SWAP_DEBUG) dgs('ensureBackVisualsFreshFromFront()'); }

      if (DG_SINGLE_CANVAS) {
        pendingPaintSwap = false;
        FD.layerEvent('frontSwap:composite', {
          panelId: panel?.id || null,
          panelRef: panel,
          singleCanvas: !!DG_SINGLE_CANVAS,
          overlays: !!DG_SINGLE_CANVAS_OVERLAYS,
        });
        compositeSingleCanvas();
      } else if (pendingPaintSwap) {
        swapBackToFront(); if (DG_SWAP_DEBUG) dgs('swapBackToFront()'); if (DG_DEBUG) drawDebugHUD(['swapBackToFront()']); pendingPaintSwap = false;
      }
      dgPaintTrace('requestFrontSwap:after-swapBackToFront', { pendingPaintSwap });
      if (typeof flushVisualBackBuffersToFront === 'function') {
        flushVisualBackBuffersToFront(); if (DG_SWAP_DEBUG) dgs('flushVisualBackBuffersToFront()'); if (DG_DEBUG) drawDebugHUD(['flushVisualBackBuffersToFront()']);
        dgPaintTrace('requestFrontSwap:after-flushVisualBackBuffersToFront');
      }
      if (DG_SWAP_DEBUG) console.timeEnd(mark);
      if (DG_DEBUG) drawDebugHUD(['swap: FRONT painted']);
      if (andThen) {
        requestAnimationFrame(andThen);
      }
      dgPaintTrace('requestFrontSwap:raf-end');
    });
  }
  let isRestoring = false;
  const handleInstrumentPersist = () => {
    if (isRestoring) return;
    schedulePersistState({ source: 'instrument-change', bypassGuard: true });
  };
  try { panel.addEventListener('toy-instrument', handleInstrumentPersist); } catch {}

  // Double-buffer + DPR tracking
  let pendingPaintSwap = false;
  const __dgDeviceDpr = Math.max(
    1,
    Math.min(((typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1), 3)
  );
  paintDpr = __dgCapDprForBackingStore(cssW, cssH, __dgDeviceDpr, paintDpr);
  let zoomCommitPhase = 'idle';

  // State
  let cols = initialCols;
  currentCols = cols;
  function emitDrawgridUpdate({ activityOnly = false, steps } = {}) {
    const stepCount = Number.isFinite(steps)
      ? steps | 0
      : (Number.isFinite(currentCols) && currentCols > 0
          ? currentCols | 0
          : (currentMap?.nodes?.length ?? 0));
    currentCols = stepCount;
    currentMap = normalizeMapColumns(currentMap, stepCount);
    if (Array.isArray(currentMap.nodes) && Array.isArray(currentMap.active)) {
      for (let c = 0; c < stepCount; c++) {
        const nodes = currentMap.nodes[c] || new Set();
        const dis = currentMap.disabled?.[c] || new Set();
        let anyOn = false;
        if (nodes.size > 0) {
          for (const r of nodes) {
            if (!dis.has(r)) { anyOn = true; break; }
          }
        }
        currentMap.active[c] = anyOn;
      }
    }
    const strokeCount = Array.isArray(strokes) ? strokes.length : 0;
    const trapHydrateFlip =
      DG_HYDRATE.guardActive &&
      prevStrokeCount === 1 &&
      strokeCount === 0 &&
      !DG_HYDRATE.seenUserChange;
    DG.log('emit update', {
      steps: stepCount,
      strokeCount,
      activeCount: currentMap.active?.filter(Boolean).length,
      nonEmptyCols: currentMap.nodes?.reduce((n, s)=>n + (s && s.size ? 1 : 0), 0)
    });
    const updateDetail = { map: currentMap, steps: stepCount, activityOnly };
    if (trapHydrateFlip) {
      if (DG_DEBUG) console.warn('[drawgrid][trap] 1->0 during hydrate window; DROP persist this frame', {
        prevStrokeCount,
        strokeCount,
        guardActive: DG_HYDRATE.guardActive,
        inbound: { ...DG_HYDRATE.inbound },
        seenUserChange: DG_HYDRATE.seenUserChange,
      });
      panel.dispatchEvent(new CustomEvent('drawgrid:update', { detail: updateDetail }));
      prevStrokeCount = strokeCount;
      return;
    }
    panel.dispatchEvent(new CustomEvent('drawgrid:update', { detail: updateDetail }));
    prevStrokeCount = strokeCount;
    if (!activityOnly) schedulePersistState({ source: 'emit-update' });
  }

  let lastBoardScale = 1;
  let boardScale = 1;
  let zoomMode = 'idle';
  let pendingZoomResnap = false;
  let zoomGestureActive = false;
  const nowMs = () => {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  };
  const ZOOM_STALL_MS = 420;
  function extractZoomSnapshot(z) {
    const scale = Number.isFinite(z?.targetScale) ? z.targetScale :
      (Number.isFinite(z?.currentScale) ? z.currentScale : null);
    const x = Number.isFinite(z?.targetX) ? z.targetX :
      (Number.isFinite(z?.currentX) ? z.currentX : null);
    const y = Number.isFinite(z?.targetY) ? z.targetY :
      (Number.isFinite(z?.currentY) ? z.currentY : null);
    return { scale, x, y };
  }
  function getOverlayZoomSnapshot() {
    const camSource = overlayCamState || (typeof getFrameStartState === 'function' ? getFrameStartState() : null);
    const snapshot = extractZoomSnapshot(camSource);
    const fallbackScale = Number.isFinite(boardScale) ? boardScale : 1;
    const rawScale = Number.isFinite(snapshot?.scale) ? snapshot.scale : fallbackScale;
    const clampedScale = Math.max(0.1, rawScale);
    return {
      scale: clampedScale,
      x: Number.isFinite(snapshot?.x) ? snapshot.x : 0,
      y: Number.isFinite(snapshot?.y) ? snapshot.y : 0,
    };
  }
  const initialZoomState = (typeof getZoomState === 'function') ? getZoomState() : null;
  let __zoomActive = false; // true while pinch/wheel gesture is in progress
  let __zoomActiveSince = 0;
  let __dgLastZoomDoneScale = null;
  // Track backing-store DPR at the moment a zoom commit settles.
  // If paintDpr changes (common when zooming out due to the visual/pressure multipliers),
  // we must force a stroke redraw. Otherwise the solid (paint) stroke will be drawn in
  // the wrong logical space and appear to "scale up" relative to the animated overlay.
  let __dgLastZoomDonePaintDpr = null;
  let __lastZoomMotionTs = 0;
  P.initDrawgridParticles();
  dgField = particleState.field;
  P.installParticleResizeObserver();
  // Suppress header sweep pushes while zoom/pan gestures are active.
  let suppressHeaderPushUntil = 0;
  const HEADER_PUSH_SUPPRESS_MS = 180; // cooldown after zoom motion/commit
  function readHeaderFpsHint() {
    try {
      const auto = window.__PERF_PARTICLES?.__gestureAuto;
      if (auto && Number.isFinite(auto.fps)) return auto.fps;
    } catch {}
    try {
      const v = window.__dgFpsValue;
      if (Number.isFinite(v)) return v;
    } catch {}
    return null;
  }
  function allowHeaderPushDuringGesture() {
    try {
      if (window.__PERF_FORCE_HEADER_SUPPRESS) return false;
      const fps = readHeaderFpsHint();
      return Number.isFinite(fps) && fps >= 52;
    } catch {}
    return false;
  }
  function headerPushSuppressed() {
    try {
      if (window.__PERF_FORCE_HEADER_SUPPRESS) return true;
    } catch {}
    return false;
  }
  let __lastZoomEventTs = 0;
  let __lastZoomSnapshot = extractZoomSnapshot(initialZoomState);
  let __overviewActive = false;
  const zoomFreezeActive = () => {
    if (!__zoomActive) return false;
    const anchor = __lastZoomMotionTs || __zoomActiveSince || __lastZoomEventTs;
    if (!anchor) return true;
    return (nowMs() - anchor) < ZOOM_STALL_MS;
  };
  const dgNonReactive = () => false;
  function resetZoomFreezeTracking() {
    __zoomActiveSince = 0;
    __lastZoomMotionTs = 0;
    __lastZoomSnapshot = extractZoomSnapshot((typeof getZoomState === 'function') ? getZoomState() : null);
  }
  function markZoomActive() {
    const now = nowMs();
    __zoomActiveSince = now;
    if (!__lastZoomMotionTs) {
      __lastZoomMotionTs = now;
    }
  }
  function noteZoomMotion(z) {
    if (!z) return;
    __lastZoomEventTs = nowMs();
    const snapshot = extractZoomSnapshot(z);
    const prev = __lastZoomSnapshot || {};
    const moved =
      (__zoomActive && snapshot.scale != null && prev.scale != null && Math.abs(snapshot.scale - prev.scale) > 1e-4) ||
      (__zoomActive && snapshot.x != null && prev.x != null && Math.abs(snapshot.x - prev.x) > 0.4) ||
      (__zoomActive && snapshot.y != null && prev.y != null && Math.abs(snapshot.y - prev.y) > 0.4);
    if (moved) {
      __lastZoomMotionTs = nowMs();
    }
    if (snapshot.scale != null || snapshot.x != null || snapshot.y != null) {
      __lastZoomSnapshot = snapshot;
    }
  }
  function releaseZoomFreeze({ reason = 'generic', refreshLayout = false, zoomPayload = null } = {}) {
    if (!__zoomActive && zoomMode !== 'gesturing') return;
    if (DG_DEBUG) dglog('zoom-freeze:release', {
      reason,
      since: __zoomActiveSince,
      lastMotion: __lastZoomMotionTs,
      mode: zoomMode
    });
    __zoomActive = false;
    zoomGestureActive = false;
    zoomCommitPhase = 'idle';
    pendingPaintSwap = false;
    pendingSwap = false;
    __dgNeedsUIRefresh = true;
    __dgForceFullDrawUntil = nowMs() + 220;
    __dgBypassCommitUntil = nowMs() + 220;
    __dgForceFullDrawNext = true;
    __dgForceFullDrawFrames = 8;
    // Avoid a 1-frame flash on overlay strokes (animated/gradient) when releasing a zoom.
    let __dgPreserveOverlaysOnZoomRelease = false;
    try {
      __dgPreserveOverlaysOnZoomRelease = !!(typeof hasOverlayStrokesCached === 'function' && hasOverlayStrokesCached());
      if (!__dgPreserveOverlaysOnZoomRelease && Array.isArray(strokes) && strokes.length) {
        for (let i = 0; i < strokes.length; i++) {
          const s = strokes[i];
          if (s && (s.isSpecial || s.overlayColorize)) { __dgPreserveOverlaysOnZoomRelease = true; break; }
        }
      }
    } catch {}
    __dgForceOverlayClearNext = !__dgPreserveOverlaysOnZoomRelease;
    __dgForceSwapNext = true;
    __dgStableFramesAfterCommit = 2;
    __dgDeferUntilTs = 0;
    if (__dgPostReleaseRaf) { try { cancelAnimationFrame(__dgPostReleaseRaf); } catch {} }
    __dgPostReleaseRaf = requestAnimationFrame(() => {
      __dgPostReleaseRaf = 0;
      const redrawNow = () => {
        if (!panel?.isConnected) return;
        if (!isPanelVisible) return;
        try {
          markStaticDirty('external-state-change');
          __dgNeedsUIRefresh = true;
          __dgFrontSwapNextDraw = true;
          if (typeof requestFrontSwap === 'function') requestFrontSwap(useFrontBuffers);
        } catch {}
      };
      redrawNow();
      if (__dgPostReleaseRaf2) { try { cancelAnimationFrame(__dgPostReleaseRaf2); } catch {} }
      __dgPostReleaseRaf2 = requestAnimationFrame(() => {
        __dgPostReleaseRaf2 = 0;
        redrawNow();
      });
    });
    zoomMode = zoomPayload?.mode && zoomPayload.mode !== 'gesturing' ? zoomPayload.mode : 'idle';
    try { dgViewport?.setNonReactive?.(null); } catch {}
    resetZoomFreezeTracking();
    __dgFrontSwapNextDraw = true;
    if (refreshLayout) {
      const deferBase = nowMs();
      const deferUntil = deferBase + 160;
      __dgDeferUntilTs = Math.max(__dgDeferUntilTs || 0, deferUntil);
      __dgStableFramesAfterCommit = 0;
      __dgNeedsUIRefresh = true;
      const commitScale = Number.isFinite(zoomPayload?.currentScale)
        ? zoomPayload.currentScale
        : (Number.isFinite(zoomPayload?.targetScale)
          ? zoomPayload.targetScale
          : (Number.isFinite(boardScale) ? boardScale : 1));
      const visualMul = __dgComputeVisualBackingMul(commitScale);
      const pressureMul = (Number.isFinite(__dgPressureDprMul) && __dgPressureDprMul > 0) ? __dgPressureDprMul : 1;
      const layoutSize = getLayoutSize();
      if (layoutSize.w && layoutSize.h) {
        cssW = Math.max(1, layoutSize.w);
        cssH = Math.max(1, layoutSize.h);
        progressMeasureW = cssW;
        progressMeasureH = cssH;
        try { dgViewport?.refreshSize?.({ snap: true }); } catch {}
        // IMPORTANT: zoom-commit refreshLayout must also respect size-based DPR caps.
        // Otherwise a commit can allocate huge backing stores and spike compositor time.
        const deviceDpr = Math.max(
          1,
          Number.isFinite(window?.devicePixelRatio) ? window.devicePixelRatio : 1
        );
        let desiredDpr =
          (typeof __dgAdaptivePaintDpr !== 'undefined' &&
            Number.isFinite(__dgAdaptivePaintDpr) &&
            __dgAdaptivePaintDpr > 0)
            ? __dgAdaptivePaintDpr
            : Math.max(1, Math.min(deviceDpr, 3));
        const smallMul = __dgComputeSmallPanelBackingMul(cssW, cssH);
        desiredDpr = Math.min(deviceDpr, desiredDpr * visualMul * pressureMul * smallMul);
        // Option C:
        // During the gesture we look great because we're mostly seeing transform scaling.
        // The "snap" happens at zoom end when we re-rasterize at a new backing-store DPR.
        // So only apply commit DPR changes when it's worth it.
        const prevDpr = paintDpr;
        const targetDpr = __dgCapDprForBackingStore(cssW, cssH, desiredDpr, null); // no hysteresis for commit target
        const minDelta = (typeof window !== 'undefined' && Number.isFinite(window.__DG_ZOOM_COMMIT_DPR_MIN_DELTA))
          ? window.__DG_ZOOM_COMMIT_DPR_MIN_DELTA
          : 0.18;
        const scaleThreshold = (typeof window !== 'undefined' && Number.isFinite(window.__DG_ZOOM_COMMIT_SCALE_THRESHOLD))
          ? window.__DG_ZOOM_COMMIT_SCALE_THRESHOLD
          : 0.8;
        const delta = Math.abs(targetDpr - prevDpr);
        const allow = (delta >= minDelta) && (!Number.isFinite(commitScale) || commitScale <= scaleThreshold);

        if (allow) {
          paintDpr = targetDpr;
          resizeSurfacesFor(cssW, cssH, targetDpr, `zoom-commit:${reason || 'unknown'}`);
        } else {
          // Keep backing-store DPR stable (prevents end-of-gesture snap).
          paintDpr = prevDpr;
          if (typeof window !== 'undefined' && window.__DG_REFRESH_DEBUG) {
            dgRefreshTrace('zoom-commit:dpr-skip', {
              commitScale,
              prevDpr,
              targetDpr,
              delta,
              minDelta,
              scaleThreshold,
              reason: reason || 'unknown',
            });
          }
        }
      }
      layout(true);
      dglog('zoom:commit', { scale: commitScale, reason });
    }
  }
  function forceReleaseZoomFreeze(reason = 'stall') {
    releaseZoomFreeze({ reason });
  }
  function maybeReleaseStalledZoom() {
    if (!__zoomActive) return;
    const anchor = __lastZoomMotionTs || __zoomActiveSince || __lastZoomEventTs;
    if (!anchor) return;
    if ((nowMs() - anchor) < ZOOM_STALL_MS) return;
    forceReleaseZoomFreeze('stall');
  }
  try { dgViewport?.setNonReactive?.(zoomFreezeActive() ? true : null); } catch {}
  if (initialZoomState) {
    const initialScale =
      initialZoomState.currentScale ?? initialZoomState.targetScale;
    if (Number.isFinite(initialScale)) {
      boardScale = initialScale;
    }
  }
  // Debug helper for Overview tuning
  const DG_OV_DBG = !!(location.search.includes('dgov=1') || localStorage.getItem('DG_OV_DBG') === '1');
  function ovlog(...a){ try { if (DG_OV_DBG) console.debug('[DG][overview]', ...a); } catch {} }

  // Force a front swap after the next successful draw - used on boot and overview toggles.
  let __dgFrontSwapNextDraw = true;
  // Draw a tiny corner probe (debug only) so we can see the visible canvas is active.
  const DG_CORNER_PROBE = !!(location.search.includes('dgprobe=1') || localStorage.getItem('DG_CORNER_PROBE') === '1');

  let __dgLastEnsureSizeChanged = false;
  let __dgLastEnsureSizeAtMs = 0;
  const DG_ENSURE_SIZE_COOLDOWN_MS = 250;
  // Hysteresis: avoid 1-frame resize churn from transient/oscillating CSS measurements.
  let __dgEnsureSizeCandW = 0;
  let __dgEnsureSizeCandH = 0;
  let __dgEnsureSizeCandSinceMs = 0;
  let __dgLastSizeCommitMs = 0;
  const DG_ENSURE_SIZE_HYSTERESIS_MS = 120;

function ensureSizeReady({ force = false } = {}) {
  let changed = false;
  if (!force && zoomFreezeActive()) return true;
  if (!force && !layoutSizeDirty) return true;
  const nowTs = (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();
  if (!force) {
    try {
      // Never resize surfaces during zoom commit pipeline; it causes backing-store churn.
      if (window.__ZOOM_COMMIT_PHASE) return true;
    } catch {}
  }
  if (!force && HY.inCommitWindow(nowTs)) {
    return true;
  }
  // IMPORTANT: Single source of truth for sizing is the wrap RO cache (or last known-good).
  // Do not fall back to body/parent measurements, which can be transient during boot/refresh/zoom.
  const measured = __dgGetStableWrapSize();
  let { w, h } = measured;
  if (!w || !h) return false;
  layoutSizeDirty = false;
  // Prevent resize jitter from fractional CSS pixels (and downstream DPR rounding).
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));

  if (!force) {
    // Kill 1px oscillation (e.g. 599 <-> 600) which can repeatedly trigger expensive
    // backing-store resizes and compositor churn. We treat +/-1px changes as noise
    // unless the caller explicitly forces a resize.
    if (cssW > 0 && Math.abs(w - cssW) === 1) w = cssW;
    if (cssH > 0 && Math.abs(h - cssH) === 1) h = cssH;
  }

  if (!force) {
    // Debounce frequent size commits during camera/focus/zoom animations.
    // During motion, wrap size can change every frame by a few pixels; resizing backing stores
    // each frame triggers expensive snapshot/restore and (in some cases) stroke redraws.
    const minMs = (typeof window !== 'undefined' && Number.isFinite(window.__DG_RESIZE_COMMIT_MIN_MS))
      ? window.__DG_RESIZE_COMMIT_MIN_MS
      : 120;
    const minPx = (typeof window !== 'undefined' && Number.isFinite(window.__DG_RESIZE_COMMIT_MIN_PX))
      ? window.__DG_RESIZE_COMMIT_MIN_PX
      : 4;
    if (__dgLastSizeCommitMs && (nowTs - __dgLastSizeCommitMs) < minMs) {
      if (cssW > 0 && cssH > 0 && Math.abs(w - cssW) < minPx && Math.abs(h - cssH) < minPx) {
        return true;
      }
    }
  }

  if (!force) {
    // If the measured size flips briefly (e.g. during gesture/zoom settle), wait for it to
    // remain stable for a short window before committing an expensive backing-store resize.
    const wouldChange = (w !== cssW) || (h !== cssH);
    if (wouldChange) {
      const bigDelta = (Math.abs(w - cssW) >= 8) || (Math.abs(h - cssH) >= 8);
      if (!bigDelta) {
        if (__dgEnsureSizeCandW !== w || __dgEnsureSizeCandH !== h) {
          __dgEnsureSizeCandW = w;
          __dgEnsureSizeCandH = h;
          __dgEnsureSizeCandSinceMs = nowTs;
          layoutSizeDirty = true;
          return true;
        }
        if ((nowTs - (__dgEnsureSizeCandSinceMs || 0)) < DG_ENSURE_SIZE_HYSTERESIS_MS) {
          layoutSizeDirty = true;
          return true;
        }
      }
    } else {
      __dgEnsureSizeCandW = 0;
      __dgEnsureSizeCandH = 0;
      __dgEnsureSizeCandSinceMs = 0;
    }
  }

  // Cooldown: avoid repeated backing-store churn during camera/overview turbulence.
  // If we *do* see a size change during cooldown, keep dirty=true so we try again soon.
  if (!force) {
    const dt = nowTs - (__dgLastEnsureSizeAtMs || 0);
    if (dt >= 0 && dt < DG_ENSURE_SIZE_COOLDOWN_MS) {
      // If size would change, defer it to the next window.
      const wouldChange = (w !== cssW) || (h !== cssH);
      if (wouldChange) {
        layoutSizeDirty = true;
      }
      return true;
    }
  }

  // IMPORTANT: "force" should bypass cooldown/hysteresis, but must NOT cause a resize
  // when the size is already correct. Otherwise we churn backing stores and spam
  // [perf][canvas-resize] even at stable dimensions.
  const sizeDiff = (w !== cssW) || (h !== cssH);
  const forceResize = !!force && (cssW === 0 || cssH === 0);
  changed = sizeDiff || forceResize;
  if (changed) {
    dgSizeTrace('ensureSizeReady:apply', {
      force,
      prevCssW: cssW,
      prevCssH: cssH,
      nextCssW: w,
      nextCssH: h,
      sizeDiff,
      forceResize,
    });
    __dgLastEnsureSizeAtMs = nowTs;
    // Snapshot current paint to preserve drawn lines across resize.
    let paintSnapshot = null;
    let paintSnapshotDpr = null;
    try {
      // IMPORTANT: only use back buffers when they are actually enabled.
      // Using backCanvas/backCtx while usingBackBuffers===false causes the paint layer
      // (flat colour line) to desync scale vs the animated overlay line after zoom.
      const snapSrc = (usingBackBuffers && backCanvas)
        ? backCanvas
        : ((typeof getActivePaintCanvas === 'function' ? getActivePaintCanvas() : paint) || paint);
      if (snapSrc && snapSrc.width > 0 && snapSrc.height > 0) {
        paintSnapshot = document.createElement('canvas');
        paintSnapshot.width = snapSrc.width;
        paintSnapshot.height = snapSrc.height;
        paintSnapshot.getContext('2d')?.drawImage(snapSrc, 0, 0);
        paintSnapshotDpr = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : null;
      }
    } catch {}

    cssW = w; cssH = h;
    __dgLastSizeCommitMs = nowTs;
    progressMeasureW = cssW; progressMeasureH = cssH;

    try { dgViewport?.refreshSize?.({ snap: true }); } catch {}

    // If ensureSize changes canvas dimensions frequently, this can cause huge nonScript stalls.
    traceCanvasResize(frontCanvas || paint || backCanvas, 'drawgrid.ensureSize');
    // IMPORTANT:
    // ensureSizeReady must not "accidentally" apply adaptive DPR, otherwise you get
    // delayed snapping after RO settles / cooldown expires.
    const __ensureDpr =
      (Number.isFinite(paintDpr) && paintDpr > 0)
        ? paintDpr
        : (Number.isFinite(window?.devicePixelRatio) ? window.devicePixelRatio : 1);
    resizeSurfacesFor(cssW, cssH, __ensureDpr, 'ensureSizeReady:paintDpr');
    try { markStaticDirty('ensure-size'); } catch {}
    if (paintSnapshot) {
      try {
        const ctx = (usingBackBuffers && backCtx)
          ? backCtx
          : ((typeof getActivePaintCtx === 'function' ? getActivePaintCtx() : pctx) || pctx);
        if (ctx) {
          const dprMismatch =
            Number.isFinite(paintSnapshotDpr) &&
            Number.isFinite(paintDpr) &&
            Math.abs(paintSnapshotDpr - paintDpr) > 1e-3;
          const hasStrokeData = Array.isArray(strokes) && strokes.length > 0;
          const skipByCount = __dgSkipPaintSnapshotCount > 0 && hasStrokeData;
          const skipSnapshot = skipByCount || (dprMismatch && hasStrokeData);
          if (skipByCount) __dgSkipPaintSnapshotCount = Math.max(0, (__dgSkipPaintSnapshotCount || 0) - 1);
          if (skipSnapshot) {
            // Avoid scaling old pixels across DPR changes; redraw from strokes for correct scale.
            try {
              if (typeof window !== 'undefined' && window.__DG_ZOOM_COMMIT_TRACE) {
                const payload = {
                  panelId: panel?.id || null,
                  source: 'ensureSizeReady',
                  skipByCount,
                  dprMismatch,
                  paintSnapshotDpr,
                  paintDpr,
                };
                console.log('[DG][paint] snapshot-skip', JSON.stringify(payload));
              }
            } catch {}
            __dgPaintDebugLog('snapshot-skip', {
              source: 'ensureSizeReady',
              skipByCount,
              dprMismatch,
              paintSnapshotDpr,
            });
            try { clearAndRedrawFromStrokes(null, 'paintSnapshot-skip:dpr'); } catch {}
          } else {
            resetPaintBlend?.(ctx);
            R.resetCtx(ctx);
            R.withLogicalSpace(ctx, () => {
              ctx.clearRect(0, 0, cssW, cssH);
              ctx.drawImage(
                paintSnapshot,
                0, 0, paintSnapshot.width, paintSnapshot.height,
                0, 0, cssW, cssH
              );
            });
            try {
              if (typeof window !== 'undefined' && window.__DG_ZOOM_COMMIT_TRACE) {
                const payload = {
                  panelId: panel?.id || null,
                  source: 'ensureSizeReady',
                  paintSnapshotDpr,
                  paintDpr,
                };
                console.log('[DG][paint] snapshot-restore', JSON.stringify(payload));
              }
            } catch {}
            __dgPaintDebugLog('snapshot-restore', {
              source: 'ensureSizeReady',
              paintSnapshotDpr,
            });
          }
        }
      } catch {}
    }

    __dgFrontSwapNextDraw = true;
    dglog('ensureSizeReady:update', { cssW, cssH });
  }
  __dgLastEnsureSizeChanged = changed;
  return true;
}

  function wireOverviewTransitions(panelEl) {
    if (!panelEl) return;
    panelEl.addEventListener('overview:precommit', () => {
      // Particle field handles its own throttling; no extra hooks needed.
    });
    panelEl.addEventListener('overview:commit', () => {
      const t0 = performance?.now?.() ?? Date.now();
      try {
        try { dgViewport?.setNonReactive?.(zoomFreezeActive() ? true : null); } catch {}
        __dgDeferUntilTs = 0;
        __dgStableFramesAfterCommit = 0;
        __dgNeedsUIRefresh = true;
        __dgFrontSwapNextDraw = true;
        const sync = () => {
          try {
            // Mark dirty so ensureSizeReady can resize IF needed, but avoid forced resize
            // (forced resize clears the paint canvas and nukes drawn lines)
        try { markLayoutSizeDirty(); } catch {}
        ensureSizeReady({ force: false });
        const sizeChanged = !!__dgLastEnsureSizeChanged;
        try { if (DG_OV_DBG) console.debug('[DG] overview:commit sizeReady', { sizeChanged, cssW, cssH }); } catch {}
        // Always resnap/redraw to refresh paint + grid in overview, but avoid relayout
        resnapAndRedraw(false, { preservePaintIfNoStrokes: true, skipLayout: true });
        const t1 = performance?.now?.() ?? Date.now();
        try {
          if (DG_OV_DBG) console.debug('[DG][overview] commit redraw ms=', (t1 - t0).toFixed(1), { cssW, cssH, sizeChanged });
        } catch {}
      } catch (err) {
        dglog('overview:commit:sync-error', String((err && err.message) || err));
      }
        };
        requestAnimationFrame(() => requestAnimationFrame(sync));
      } catch (err) {
        dglog('overview:commit:error', String((err && err.message) || err));
      }
    });
  }

  // Zoom signal hygiene
  let lastCommittedScale = boardScale;
  let drawing = false;
  const setDrawingState = (state) => {
    drawing = !!state;
    __dgDrawingActive = !!state;
  };
  setDrawingState(false);
  // The `strokes` array is removed. The paint canvas is now the source of truth.
  let cur = null;
  let strokes = []; // Store all completed stroke objects
  let __dgOverlayStrokeCache = { value: false, len: 0, ts: 0 };
  let __dgOverlayStrokeListCache = { paintRev: -1, len: 0, special: [], colorized: [] };

  function hasOverlayStrokesCached() {
    const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
    const len = Array.isArray(strokes) ? strokes.length : 0;
    if (__dgOverlayStrokeCache.len === len && (now - (__dgOverlayStrokeCache.ts || 0)) < 120) {
      return __dgOverlayStrokeCache.value;
    }
    let hasOverlay = false;
    for (let i = 0; i < len; i++) {
      const s = strokes[i];
      if (!s) continue;
      if (s.isSpecial || s.overlayColorize) { hasOverlay = true; break; }
    }
    __dgOverlayStrokeCache = { value: hasOverlay, len, ts: now };
    return hasOverlay;
  }
  let prevStrokeCount = Array.isArray(strokes) ? strokes.length : 0;
  // Debug-only: trap suspicious clears that cause 1->0 flips
  let __dbgStrokesProxyInstalled = false;
  (function installStrokesProxyOnce(){
    if (typeof window === 'undefined' || __dbgStrokesProxyInstalled) return;
    try {
      let _strokes = strokes || [];
      Object.defineProperty(window, '__dgGetStrokes', { get: () => _strokes });
      Object.defineProperty(window, '__dgSetStrokes', { value: (v)=>{ _strokes = v; }});
      Object.defineProperty(window, 'strokes', {
        get(){ return _strokes; },
        set(v){
          const prevLen = Array.isArray(_strokes) ? _strokes.length : 0;
          const nextLen = Array.isArray(v) ? v.length : 0;
          if (DG_HYDRATE.guardActive && prevLen === 1 && nextLen === 0 && !DG_HYDRATE.seenUserChange) {
            if (DG_DEBUG) {
              console.warn('[drawgrid][probe] strokes cleared during guard window', { prevLen, nextLen });
              try { console.trace(); } catch {}
            }
          }
          _strokes = v;
        }
      });
      __dbgStrokesProxyInstalled = true;
    } catch {}
  })();
  // DEV SENTINEL: watch for unexpected zeroing of strokes
  let __dgPrevStrokeLen = Array.isArray(strokes) ? strokes.length : 0;
  function __dgCheckStrokeLen(tag) {
    const len = Array.isArray(strokes) ? strokes.length : 0;
    if (__dgPrevStrokeLen > 0 && len === 0) {
      let stackSnippet = null;
      try {
        const stackRaw = (new Error('flip')).stack;
        if (stackRaw) stackSnippet = stackRaw.split('\n').slice(0, 6).join('\n');
      } catch {}
      if (DG_DEBUG) console.warn('[DG][SENTINEL] strokes flipped >0 -> 0', {
        tag,
        prev: __dgPrevStrokeLen,
        now: len,
        stack: stackSnippet,
      });
    }
    __dgPrevStrokeLen = len;
  }
  let cellFlashes = []; // For flashing grid squares on note play
  let noteToggleEffects = []; // For tap feedback ring animations
  let noteBurstEffects = [];  // For short-range radial particle bursts on note hits
  let __dgPaintRev = 0;
  function markPaintDirty() {
    __dgPaintRev = (__dgPaintRev + 1) | 0;
  }

  function spawnNoteRingEffect(cx, cy, baseRadius) {
    const r =
      Math.max(
        6,
        baseRadius ||
          (Number.isFinite(cw) && Number.isFinite(ch)
            ? Math.min(cw, ch) * 0.5
            : 12),
      );
    noteToggleEffects.push({ x: cx, y: cy, radius: r, progress: 0 });

    // Keep a reasonable cap so we don't leak
    if (noteToggleEffects.length > 48) {
      noteToggleEffects.splice(0, noteToggleEffects.length - 48);
    }
  }

  function spawnNoteBurst(cx, cy, baseRadius) {
    // We want small particles that travel about half a grid cell
    // IMPORTANT: `cw/ch` are *canvas* dimensions in logical space, NOT a grid-cell size.
    // Using them here makes bursts travel/offset by hundreds of pixels (especially after zoom).
    const cell = (() => {
      const w = Number.isFinite(gridArea?.w) ? gridArea.w : null;
      const h = Number.isFinite(gridArea?.h) ? gridArea.h : null;
      const c = Number.isFinite(cols) && cols > 0 ? cols : null;
      const r = Number.isFinite(rows) && rows > 0 ? rows : null;
      const cellW = (w != null && c != null) ? (w / c) : null;
      const cellH = (h != null && r != null) ? (h / r) : null;
      const cellPx = (cellW != null && cellH != null) ? Math.min(cellW, cellH) : (cellW != null ? cellW : (cellH != null ? cellH : null));
      return (cellPx != null && cellPx > 0) ? cellPx : 24;
    })();
    const lowFps = __dgLowFpsMode || (() => {
      const fpsSample = Number.isFinite(window.__MT_SM_FPS)
        ? window.__MT_SM_FPS
        : (Number.isFinite(window.__MT_FPS) ? window.__MT_FPS : null);
      return Number.isFinite(fpsSample) && fpsSample <= DG_PLAYHEAD_FPS_SIMPLE_ENTER;
    })();
    const emergency = __dgLowFpsMode;
    const count = emergency ? 20 : (lowFps ? 28 : 48);
    const sizeBoost = emergency ? 2.0 : (lowFps ? 1.7 : 1);
    const lifeBase = emergency ? 0.42 : (lowFps ? 0.55 : 0.8);

    // Travel radius target: ~0.5 of a grid square
    const travelRadius =
      Math.max(
        6,
        baseRadius && baseRadius > 0
          ? baseRadius * 0.5
          : cell * 0.5
      );

    const particles = [];

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;

      // Speed tuned so, over the particle lifetime, they move visibly across the cell
      const speed = travelRadius * (10.0 + Math.random() * 10.0);

      // Bigger jitter so motion is obvious from the start
      const jitter = travelRadius * 0.3 * Math.random();

      particles.push({
        x: cx + Math.cos(angle) * jitter,
        y: cy + Math.sin(angle) * jitter,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        // Enough life so the faster particles can travel visibly
        life: lifeBase,
        // Larger, more obvious dots
        size: (0.25 + Math.random() * 2) * sizeBoost,
      });
    }

    noteBurstEffects.push({ particles });
    __dgMarkOverlayDirty(panel);

    // Cap the number of active bursts so we don't leak
    const maxBursts = emergency ? 16 : (lowFps ? 24 : 32);
    if (noteBurstEffects.length > maxBursts) {
      noteBurstEffects.splice(0, noteBurstEffects.length - maxBursts);
    }
  }
  let nodeGroupMap = []; // Per-column Map(row -> groupId or [groupIds]) to avoid cross-line connections and track z-order
  let nextDrawTarget = null; // Per-instance arming for generator buttons (1 or 2).
  let flashes = new Float32Array(cols);
  let __dgHadNodeFlash = false;
  let playheadCol = -1;
  let localLastPhase = 0; // For chain-active race condition
  let manualOverrides = Array.from({ length: initialCols }, () => new Set()); // per-column node rows overridden by drags
  let draggedNode = null; // { col, row, group? }
  let pendingNodeTap = null; // potential tap for toggle
  let pendingActiveMask = null; // preserve active columns across resolution changes
  let dragScaleHighlightCol = null; // column index currently showing pentatonic hints
  let previewGid = null; // 1 or 2 while drawing a special line preview
  const flowState = {
    get panel() { return panel; },
    get usingBackBuffers() { return usingBackBuffers; },
    get __dgSkipSwapsDuringDrag() { return __dgSkipSwapsDuringDrag; },
    get __dgDrawingActive() { return __dgDrawingActive; },
    get cur() { return cur; },
    get previewGid() { return previewGid; },
    get nextDrawTarget() { return nextDrawTarget; },
    get strokes() { return strokes; },
    get currentMap() { return currentMap; },
    get paint() { return paint; },
    get backCanvas() { return backCanvas; },
    get flashCanvas() { return flashCanvas; },
    get flashBackCanvas() { return flashBackCanvas; },
    get getActiveFlashCanvas() { return getActiveFlashCanvas; },
    get hasOverlayStrokesCached() { return hasOverlayStrokesCached; },
    get __dgPaintRev() { return __dgPaintRev; },
    get __dgHydrationPendingRedraw() { return __dgHydrationPendingRedraw; },
    get __dgDeferUntilTs() { return __dgDeferUntilTs; },
    get __dgBypassCommitUntil() { return __dgBypassCommitUntil; },
    get __dgLayerDebugLastTs() { return __dgLayerDebugLastTs; },
    set __dgLayerDebugLastTs(value) { __dgLayerDebugLastTs = value; },
    get __dgLayerTraceLastTs() { return __dgLayerTraceLastTs; },
    set __dgLayerTraceLastTs(value) { __dgLayerTraceLastTs = value; },
    get __dgRegenSource() { return __dgRegenSource; },
    set __dgRegenSource(value) { __dgRegenSource = value; },
    get __dgSampleCanvas() { return __dgSampleCanvas; },
    set __dgSampleCanvas(value) { __dgSampleCanvas = value; },
    get __dgSampleCtx() { return __dgSampleCtx; },
    set __dgSampleCtx(value) { __dgSampleCtx = value; },
    get dgProfileFrames() { return dgProfileFrames; },
    set dgProfileFrames(value) { dgProfileFrames = value; },
    get dgProfileSumMs() { return dgProfileSumMs; },
    set dgProfileSumMs(value) { dgProfileSumMs = value; },
    get dgProfileMinMs() { return dgProfileMinMs; },
    set dgProfileMinMs(value) { dgProfileMinMs = value; },
    get dgProfileMaxMs() { return dgProfileMaxMs; },
    set dgProfileMaxMs(value) { dgProfileMaxMs = value; },
  };
  const getFlowState = () => flowState;
  const F = createDgFlowTrace(getFlowState);
  function __dgMarkSingleCanvasDirty(panel) {
    if (!panel) return;
    panel.__dgCompositeBaseDirty = true;
    panel.__dgSingleCompositeDirty = true;
    FD.maybeLogStall(panel, 'markDirty');
  }
  function __dgMarkSingleCanvasOverlayDirty(panel) {
    if (!panel) return;
    panel.__dgCompositeOverlayDirty = true;
    if (!DG_SINGLE_CANVAS_OVERLAYS) {
      panel.__dgSingleCompositeDirty = true;
    }
    FD.maybeLogStall(panel, 'markDirty');
  }
  function __dgMarkSingleCanvasCompositeDirty(panel) {
    if (!panel) return;
    panel.__dgSingleCompositeDirty = true;
  }
  let persistentDisabled = Array.from({ length: initialCols }, () => new Set()); // survives view changes
  let autoTune = true; // Default to on
  // Proportional safe area so the grid keeps the same relative size at any zoom.
  // Start with ~5% of the smaller dimension; clamp to a sensible px range.
  const SAFE_AREA_FRACTION = 0.05;
  let tutorialHighlightMode = 'none'; // 'none' | 'notes' | 'drag'
  let tutorialHighlightRaf = null;
  let tutorialHighlightOverride = false;
  let tutorialHighlightPausedByDraw = false;
  const dgTutorialTrace = (tag, data) => {
    if (typeof window === 'undefined' || !window.__DG_TUTORIAL_TRACE) return;
    try { console.log(`[DG][tutorial] ${tag}`, data || {}); } catch {}
  };
  const isTutorialActive = () => {
    return typeof document !== 'undefined' && !!document.body?.classList?.contains('tutorial-active');
  };
  const isHighlightActive = () => isTutorialActive() || tutorialHighlightOverride;
  const pauseTutorialHighlightForDraw = () => {
    if (tutorialHighlightPausedByDraw) return;
    tutorialHighlightPausedByDraw = true;
    dgTutorialTrace('pause:draw', {
      mode: tutorialHighlightMode,
      active: isHighlightActive(),
      culled: isPanelCulled(),
      raf: !!tutorialHighlightRaf,
    });
    stopTutorialHighlightLoop();
  };
  const resumeTutorialHighlightAfterDraw = () => {
    if (!tutorialHighlightPausedByDraw) return;
    tutorialHighlightPausedByDraw = false;
    dgTutorialTrace('resume:draw', {
      mode: tutorialHighlightMode,
      active: isHighlightActive(),
      culled: isPanelCulled(),
      raf: !!tutorialHighlightRaf,
    });
    if (tutorialHighlightMode === 'none') return;
    if (!isHighlightActive() || isPanelCulled()) return;
    startTutorialHighlightLoop();
  };
  const isPanelCulled = () => !isPanelVisible;
  let pendingSwap = false;
  let pendingWrapSize = null;
  let __dgSkipPaintSnapshotCount = 0;

  // Wrap-size "flush" (legacy)
  //
  // We previously pinned `wrap` to a fixed pixel size during certain refresh/commit
  // paths (primarily when back-buffers were enabled) and then restored it to 100% on
  // the next rAF. After the draw-toy restructure, that pin→restore manifests as
  // delayed, staggered scale jumps (notably: notes/connectors/column text suddenly
  // rescale *after* a zoom/pan gesture has ended).
  //
  // Default OFF: leave wrap at its normal (percentage) sizing and avoid visual jumps.
  // You can re-enable for experimentation via:
  //   window.__DG_WRAP_SIZE_FLUSH = true
  const DG_WRAP_SIZE_FLUSH = (() => {
    try { return !!window.__DG_WRAP_SIZE_FLUSH; } catch {}
    return false;
  })();
  let progressMeasureW = 0;
  let progressMeasureH = 0;
  const PROGRESS_SIZE_THRESHOLD = 4;
  const PROGRESS_AREA_THRESHOLD = 64 * 64;

  const initialSize = getLayoutSize();
  if (initialSize.w && initialSize.h) {
    cssW = Math.max(1, initialSize.w);
    cssH = Math.max(1, initialSize.h);
    progressMeasureW = cssW;
    progressMeasureH = cssH;
    resizeSurfacesFor(cssW, cssH, paintDpr, 'refreshLayout');
  }

  ensureSizeReady({ force: true });
  try { refreshHomes({ resetPositions: true }); } catch {}
  try {
    [grid, paint, particleCanvas, ghostCanvas, flashCanvas, nodesCanvas, tutorialCanvas]
      .filter(Boolean)
      .forEach((cv) => {
        const s = cv.style || {};
        if (s.visibility === 'hidden') s.visibility = '';
        if (s.opacity === '0') s.opacity = '';
        if (s.display === 'none') s.display = '';
      });
  } catch {}

  try {
    if (DG_CORNER_PROBE) {
      const ctx = particleCanvas?.getContext?.('2d');
      if (ctx && cssW && cssH) {
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ff00ff';
        ctx.fillRect(0, 0, 3, 3);
        ctx.restore();
      }
    }
    if (typeof requestFrontSwap === 'function') {
      requestFrontSwap();
    }
    __dgNeedsUIRefresh = true;
    __dgStableFramesAfterCommit = 0;
    try {
      markStaticDirty('external-state-change');
    } catch {}
    __dgNeedsUIRefresh = true;
    __dgStableFramesAfterCommit = 0;
  } catch {}

  const __dgGetDrawLabelYRange = () => getDrawLabelYRange?.();

  // --- ghost path helper: off-screen left->right with random Y inside safe area
  function __dgComputeGhostSweepLR() {
    if (!gridArea || gridArea.w <= 0 || gridArea.h <= 0) {
      const fallbackY = gridArea?.y || 0;
      const fallbackX = gridArea?.x || 0;
      return {
        from: { x: fallbackX, y: fallbackY },
        to: { x: fallbackX + (gridArea?.w || 0), y: fallbackY },
        safeMinY: fallbackY,
        safeMaxY: fallbackY,
      };
    }
    // Push the ghost further off-screen so the trail fully exits before fading.
    const marginBase = Math.min(gridArea.w, gridArea.h);
    const margin = Math.max(32, Math.round(marginBase * 0.24));
    const leftX = gridArea.x - margin;
    const rightX = gridArea.x + gridArea.w + margin;
    const cellH = rows > 0 ? gridArea.h / rows : gridArea.h;
    const safeMargin = Math.max(6, Math.round(cellH * 0.5));
    const safeMinY = gridArea.y + safeMargin;
    const safeMaxY = Math.max(safeMinY, gridArea.y + gridArea.h - safeMargin);

    const range = Math.max(1, safeMaxY - safeMinY);
    const startY = Math.round(safeMinY + Math.random() * range);
    const letterRange = __dgGetDrawLabelYRange();
    const crossY = (letterRange && letterRange.maxY > letterRange.minY)
      ? Math.round((Math.max(safeMinY, letterRange.minY) + Math.min(safeMaxY, letterRange.maxY)) * 0.5)
      : Math.round(safeMinY + range * 0.5);

    const clampedY = Math.max(safeMinY, Math.min(safeMaxY, startY));
    return {
      from: { x: leftX, y: clampedY },
      to: { x: rightX, y: clampedY },
      crossY,
      safeMinY,
      safeMaxY,
    };
  }

  wireOverviewTransitions(panel);

  (function wireOverviewTransitionForDrawgrid(){
    try {
      window.addEventListener('overview:transition', (e) => {
        const active = !!e?.detail?.active;
        __overviewActive = active;
        const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
          ? performance.now()
          : Date.now();
        const deferUntil = now + 32;
        __dgDeferUntilTs = Math.max(__dgDeferUntilTs || 0, deferUntil);
        __dgStableFramesAfterCommit = 0;
        __dgNeedsUIRefresh = true;
        dglog('overview:transition', { active });
        try { dgViewport?.setNonReactive?.(zoomFreezeActive() ? true : null); } catch {}
        try { dgViewport?.refreshSize?.({ snap: true }); } catch {}
        try { dgField?.resize?.(); } catch {}
        try {
          // Ensure all layers are visible & transparent
          [grid, paint, particleCanvas, ghostCanvas, flashCanvas, nodesCanvas, tutorialCanvas]
            .filter(Boolean)
            .forEach((cv) => {
              const s = cv.style || {};
              if (s.visibility === 'hidden') s.visibility = '';
              if (s.opacity === '0') s.opacity = '';
              if (s.display === 'none') s.display = '';
              s.background = 'transparent';
            });

          const body = panel.querySelector('.toy-body');
          if (body && body.style) {
            body.style.background = drawToyBg;
          }
          if (panel?.style) {
            panel.style.background = drawToyBg;
            panel.style.backgroundColor = drawToyBg;
          }
          if (wrap && wrap.style) {
            wrap.style.background = drawToyBg;
          }
        } catch {}
        try {
          __dgFrontSwapNextDraw = true;
          __dgNeedsUIRefresh = true;
          __dgStableFramesAfterCommit = 0;

          let __dgGridStart = null;
          if (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf) {
            __dgGridStart = performance.now();
          }
          drawGrid();
          if (__dgGridStart !== null) {
            const __dgGridDt = performance.now() - __dgGridStart;
            try { window.__PerfFrameProf?.mark?.('drawgrid.grid', __dgGridDt); } catch {}
          }

          if (currentMap) {
            let __dgNodesStart = null;
            if (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf) {
              __dgNodesStart = performance.now();
            }
            drawNodes(currentMap.nodes);
            if (__dgNodesStart !== null) {
              const __dgNodesDt = performance.now() - __dgNodesStart;
              try { window.__PerfFrameProf?.mark?.('drawgrid.nodes', __dgNodesDt); } catch {}
            }
          }

          const flashTarget = getActiveFlashCanvas();
          const __flashDpr = __dgGetCanvasDprFromCss(flashTarget, cssW, paintDpr);
          R.resetCtx(fctx);
          __dgWithLogicalSpaceDpr(R, fctx, __flashDpr, () => {
            const { x, y, w, h } = R.getOverlayClearRect({
              canvas: flashTarget,
              pad: R.getOverlayClearPad(),
              allowFull: !!panel.__dgFlashOverlayOutOfGrid,
              gridArea,
            });
            fctx.clearRect(x, y, w, h);
          });
          markFlashLayerCleared();

          // Ghost trail should NEVER be cleared by gesture settle / re-snap.
          // Only clear it when the ghost backing store has actually changed (resize / DPR change)
          // or when explicitly stopped via stopGhostGuide({ immediate: true }).
          {
            const ghostTarget = getActiveGhostCanvas();
            const __ghostDpr = __dgGetCanvasDprFromCss(ghostTarget, cssW, paintDpr);
            const __ghostKey = `${cssW}x${cssH}@${__ghostDpr}`;
            const __prevGhostKey = panel.__dgGhostClearKey || null;
            const __shouldClearGhost = (__prevGhostKey !== __ghostKey);
            if (__shouldClearGhost) {
              panel.__dgGhostClearKey = __ghostKey;
              R.resetCtx(ghostCtx);
              __dgWithLogicalSpaceDpr(R, ghostCtx, __ghostDpr, () => {
                const { x, y, w, h } = R.getOverlayClearRect({
                  canvas: ghostTarget,
                  pad: R.getOverlayClearPad() * 1.2,
                  gridArea,
                });
                ghostCtx.clearRect(x, y, w, h);
              });
              markGhostLayerCleared();
              try {
                if (typeof window !== 'undefined' && window.__DG_GHOST_TRACE) {
                  dgGhostTrace('clear:do', {
                    id: panel?.id || null,
                    reason: 'overview:transition:overlay-clear',
                    key: __ghostKey,
                    prevKey: __prevGhostKey,
                  });
                }
              } catch {}
            } else {
              // Preserve existing trail.
              try {
                if (
                  typeof window !== 'undefined' &&
                  window.__DG_GHOST_TRACE &&
                  !window.__DG_GHOST_TRACE_CLEAR_ONLY
                ) {
                  dgGhostTrace('clear:skip (preserve-trail)', {
                    id: panel?.id || null,
                    reason: 'overview:transition:overlay-clear',
                    key: __ghostKey,
                  });
                }
              } catch {}
            }
          }
        } catch {}
        // Don't re-home during overview toggles -- avoids visible lerp.
        // refreshHomes({ resetPositions: false });
        __dgFrontSwapNextDraw = true;
        try {
          if (typeof ovlog === 'function') ovlog('overview:transition handled', { active, cssW, cssH });
        } catch {}
      }, { passive: true });
    } catch {}
  })();

  function headerProgress() {
    try {
      const li = (typeof getLoopInfo === 'function') ? (getLoopInfo() || {}) : {};
      if (Number.isFinite(li.progress)) return li.progress;
      if (Number.isFinite(li.phase01)) return li.phase01;
      if (Number.isFinite(li.step) && Number.isFinite(li.steps) && li.steps > 0) {
        const steps = Math.max(1, li.steps);
        return ((li.step || 0) % steps) / steps;
      }
      const bpmSafe = Math.max(30, Math.min(200, Number.isFinite(bpm) ? bpm : 120));
      const stepCount = Math.max(1, currentCols || initialCols || 8);
      const loopSeconds = (60 / bpmSafe) * stepCount;
      if (!Number.isFinite(loopSeconds) || loopSeconds <= 0) return null;
      const nowMs = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now();
      const t = nowMs / 1000;
      return (t % loopSeconds) / loopSeconds;
    } catch {
      return null;
    }
  }

  if (typeof onFrameStart === 'function') {
    unsubscribeFrameStart?.();
    unsubscribeFrameStart = onFrameStart((camState) => {
      overlayCamState = camState; // keep for HUD/other use
      try {
        if (!isRunning?.()) return;
        if (!isActiveInChain) return;
        const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
          ? performance.now()
          : Date.now();
        if (panel.__dgPlayheadLastRenderTs && (now - panel.__dgPlayheadLastRenderTs) < 24) {
          return;
        }
        const prog = headerProgress();
        if (!Number.isFinite(prog)) return;
        const clampedProgress = Math.max(0, Math.min(1, prog));
        const area = (gridArea && gridArea.w > 0 && gridArea.h > 0)
          ? gridArea
          : { x: 0, y: 0, w: cssW || 0, h: cssH || 0 };
        const usableWidth = area?.w || 0;
        if (!Number.isFinite(usableWidth) || usableWidth <= 0) return;
        const startX = area?.x || 0;
        const xToy = startX + clampedProgress * usableWidth;
        FF.pushHeaderSweepAt(xToy);
      } catch {}
    });
  }

  const clearTutorialHighlight = () => {
    if (!tutorialCtx) return;
    dgTutorialTrace('clear', {
      mode: tutorialHighlightMode,
      active: isHighlightActive(),
      culled: isPanelCulled(),
    });
    R.resetCtx(tutorialCtx);
    R.withLogicalSpace(tutorialCtx, () => {
      const tutorialSurface = getActiveTutorialCanvas();
      if (!tutorialSurface) return;
      const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
      const width = cssW || (tutorialSurface.width ?? 0) / scale;
      const height = cssH || (tutorialSurface.height ?? 0) / scale;
      tutorialCtx.clearRect(0, 0, width, height);
    });
    markTutorialLayerCleared();
  };

  const renderTutorialHighlight = () => {
    if (!tutorialCtx) return;
    const tutorialSurface = getActiveTutorialCanvas();
    dgTutorialTrace('render', {
      mode: tutorialHighlightMode,
      active: isHighlightActive(),
      culled: isPanelCulled(),
      hasNodes: !!nodeCoordsForHitTest?.length,
    });
    R.resetCtx(tutorialCtx);
    R.withLogicalSpace(tutorialCtx, () => {
      const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
      const width = cssW || (tutorialSurface?.width ?? 0) / scale;
      const height = cssH || (tutorialSurface?.height ?? 0) / scale;
      tutorialCtx.clearRect(0, 0, width, height);
      if (tutorialHighlightMode === 'none' || !nodeCoordsForHitTest?.length) {
        markTutorialLayerCleared();
        return;
      }
      markTutorialLayerActive();
      const baseRadius = Math.max(6, Math.min(cw || 0, ch || 0) * 0.55);
      tutorialCtx.save();
      tutorialCtx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      tutorialCtx.shadowBlur = Math.max(4, baseRadius * 0.3);
      const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now();
      const pulsePhase = (now / 480) % (Math.PI * 2);
      const pulseScale = 1 + Math.sin(pulsePhase) * 0.24;
      const highlightNodes = nodeCoordsForHitTest;
      let anchorNode = null;
      if (tutorialHighlightMode === 'drag') {
        const effectiveWidth = (gridArea.w && gridArea.w > 0) ? gridArea.w : (cw * cols);
        const effectiveHeight = (gridArea.h && gridArea.h > 0) ? gridArea.h : (ch * rows);
        const fallbackX = gridArea.x + (effectiveWidth / 2);
        const fallbackY = gridArea.y + topPad + Math.max(0, effectiveHeight - topPad) / 2;
        const activeNode = nodeCoordsForHitTest.find(node => !node?.disabled);
        anchorNode = activeNode || (nodeCoordsForHitTest.length ? nodeCoordsForHitTest[0] : { x: fallbackX, y: fallbackY });
      }

      highlightNodes.forEach((node) => {
        if (!node) return;
        tutorialCtx.globalAlpha = node.disabled ? 0.45 : 1;
        tutorialCtx.lineWidth = Math.max(2, baseRadius * 0.22);
        tutorialCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        tutorialCtx.beginPath();
        tutorialCtx.arc(node.x, node.y, baseRadius * pulseScale, 0, Math.PI * 2);
        tutorialCtx.stroke();
      });

      if (tutorialHighlightMode === 'drag' && anchorNode) {
        const bob = Math.sin(now / 420) * Math.min(12, ch * 0.35);
        const arrowColor = 'rgba(255, 255, 255, 0.9)';
        const arrowWidth = Math.max(10, Math.min(cw, ch) * 0.45);
        const arrowHeight = arrowWidth * 1.25;

        const drawArrow = (x, y, direction) => {
          tutorialCtx.beginPath();
          if (direction < 0) {
            tutorialCtx.moveTo(x, y);
            tutorialCtx.lineTo(x - arrowWidth * 0.5, y + arrowHeight);
            tutorialCtx.lineTo(x + arrowWidth * 0.5, y + arrowHeight);
          } else {
            tutorialCtx.moveTo(x, y);
            tutorialCtx.lineTo(x - arrowWidth * 0.5, y - arrowHeight);
            tutorialCtx.lineTo(x + arrowWidth * 0.5, y - arrowHeight);
          }
          tutorialCtx.closePath();
          tutorialCtx.globalAlpha = 0.9;
          tutorialCtx.fillStyle = arrowColor;
          tutorialCtx.fill();
        };

        highlightNodes.forEach((node) => {
          if (!node) return;
          const topY = node.y - baseRadius - arrowHeight - 16 - bob;
          const bottomY = node.y + baseRadius + arrowHeight + 16 + bob;
          drawArrow(node.x, topY, -1);
          drawArrow(node.x, bottomY, 1);
        });
        tutorialCtx.globalAlpha = 1;
      }
      tutorialCtx.restore();
      tutorialCtx.shadowBlur = 0;
      tutorialCtx.globalAlpha = 1;
    });
  };

  const startTutorialHighlightLoop = () => {
    if (tutorialHighlightMode === 'none') return;
    if (!isHighlightActive() || isPanelCulled()) return;
    if (tutorialHighlightRaf !== null) return;
    dgTutorialTrace('loop:start', {
      mode: tutorialHighlightMode,
      active: isHighlightActive(),
      culled: isPanelCulled(),
    });
    const tick = () => {
      // IMPORTANT:
      // If we stop the loop without clearing, the last rendered highlight frame
      // (ghost-finger particles) can appear "frozen" on the tutorial canvas.
      // Use isHighlightActive() (respects allowGuide override), and always clear on exit.
      if (tutorialHighlightMode === 'none' || !isHighlightActive() || isPanelCulled()) {
        tutorialHighlightRaf = null;
        clearTutorialHighlight();
        dgTutorialTrace('loop:stop', {
          mode: tutorialHighlightMode,
          active: isHighlightActive(),
          culled: isPanelCulled(),
        });
        return;
      }
      renderTutorialHighlight();
      tutorialHighlightRaf = requestAnimationFrame(tick);
    };
    renderTutorialHighlight();
    tutorialHighlightRaf = requestAnimationFrame(tick);
  };

  const stopTutorialHighlightLoop = () => {
    if (tutorialHighlightRaf !== null) {
      cancelAnimationFrame(tutorialHighlightRaf);
      tutorialHighlightRaf = null;
    }
    clearTutorialHighlight();
    dgTutorialTrace('loop:stop:manual', {
      mode: tutorialHighlightMode,
      active: isHighlightActive(),
      culled: isPanelCulled(),
    });
  };

  panel.setSwipeVisible = (show, { immediate = false } = {}) => {
  __forceSwipeVisible = !!show;
};

  function syncLetterFade({ immediate = false } = {}) {
    // Legacy hook retained for future use; no-op now that particles manage themselves.
  }

  if (!panel.__drawgridHelpModeChecker) {
    panel.__drawgridHelpModeChecker = setInterval(() => {
      const imm = !zoomGestureActive; // never force during gesture
      syncLetterFade({ immediate: imm });
    }, 250);
  }

  panel.dataset.steps = String(cols);

  const { updateGeneratorButtons } = installGeneratorButtons(panel, {
    get cols() { return cols; },
    get rows() { return rows; },
    get gridArea() { return gridArea; },
    get gridAreaLogical() { return gridAreaLogical; },
    get cw() { return cw; },
    get ch() { return ch; },
    get topPad() { return topPad; },
    get updateDrawLabel() { return updateDrawLabel; },
    get markUserChange() { return markUserChange; },
    get emitDG() { return emitDG; },
    get isPanelVisible() { return isPanelVisible; },
    get __dgMarkSingleCanvasDirty() { return __dgMarkSingleCanvasDirty; },
  });

  // New central helper to redraw the paint canvas and regenerate the node map from the `strokes` array.
  function clearAndRedrawFromStrokes(targetCtx, reason) {
    return F.perfMarkSection('drawgrid.paint.redraw', () => {
      if (reason) FD.markRegenSource(reason);
      // IMPORTANT:
      // Keep the caller's target ctx, but ensure the composite back buffer stays in sync.
      // In DG_SINGLE_CANVAS, some call paths draw into frontCtx (visible) while composite
      // uses backCtx as the base. If backCtx isn't updated, the solid line can appear
      // scaled incorrectly after zoom-out.
      const resolvedTarget = targetCtx;
      // IMPORTANT:
      // The paint stroke must be redrawn into the *currently visible* paint buffer.
      // When `usingBackBuffers` is false we should never fall back to `backCtx`,
      // otherwise the redraw can land in a hidden backing store that has stale CSS sizing,
      // producing the "solid line scales up" bug when zoomed out.
      const activePaintCtx = (typeof getActivePaintCtx === 'function') ? getActivePaintCtx() : null;
      const ctx =
        resolvedTarget ||
        activePaintCtx ||
        (usingBackBuffers ? backCtx : frontCtx) ||
        pctx;
      if (!ctx) return;
      dgPaintTrace('clearAndRedrawFromStrokes:enter', {
        ctxIsFront: ctx === frontCtx,
        ctxIsBack: ctx === backCtx,
        canvasW: ctx?.canvas?.width || 0,
        canvasH: ctx?.canvas?.height || 0
      });
      if (DG_LAYOUT_DEBUG) {
        const expectedW = Math.max(1, Math.round(cssW * paintDpr));
        const expectedH = Math.max(1, Math.round(cssH * paintDpr));
        if (ctx.canvas?.width !== expectedW || ctx.canvas?.height !== expectedH) {
          debugPaintSizes('clearAndRedrawFromStrokes:canvas-mismatch', { ctxW: ctx.canvas?.width, ctxH: ctx.canvas?.height });
        }
      }
      const normalStrokes = strokes.filter(s => !s.justCreated);
      const newStrokes = strokes.filter(s => s.justCreated);
      R.resetCtx(ctx);
      __dgWithLogicalSpace(ctx, () => {
        const surface = ctx.canvas;
        const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
        const width = cssW || (surface?.width ?? 0) / scale;
        const height = cssH || (surface?.height ?? 0) / scale;
        ctx.clearRect(0, 0, width, height);
        dgPaintTrace('clearAndRedrawFromStrokes:about-to-draw', { paintDpr, cssW, cssH });

        // 1. Draw all existing, non-new strokes first.
        for (const s of normalStrokes) {
          drawFullStroke(ctx, s, { skipReset: true, skipTransform: true });
        }
        // 2. Draw the brand new strokes on top.
        for (const s of newStrokes) {
          drawFullStroke(ctx, s, { skipReset: true, skipTransform: true });
        }
      });

      // If we drew into the front buffer in single-canvas mode, mirror it into the
      // back buffer before composite so the base isn't stale or mismatched.
      if (DG_SINGLE_CANVAS && ctx === frontCtx && backCtx && backCtx !== frontCtx) {
        try {
          const src = frontCtx?.canvas;
          const dst = backCtx?.canvas;
          if (src && dst && src.width > 0 && src.height > 0 && dst.width > 0 && dst.height > 0) {
            R.resetCtx(backCtx);
            R.withDeviceSpace(backCtx, () => {
              backCtx.clearRect(0, 0, dst.width, dst.height);
              backCtx.drawImage(
                src,
                0, 0, src.width, src.height,
                0, 0, dst.width, dst.height
              );
            });
            if (typeof window !== 'undefined' && window.__DG_RANDOM_TRACE_VERBOSE && reason && String(reason).includes('random')) {
              const payload = {
                panelId: panel?.id || null,
                reason,
                copied: true,
                srcRole: src.getAttribute?.('data-role') || null,
                dstRole: dst.getAttribute?.('data-role') || null,
                srcSize: { w: src.width, h: src.height, cssW: src.style?.width || null, cssH: src.style?.height || null },
                dstSize: { w: dst.width, h: dst.height, cssW: dst.style?.width || null, cssH: dst.style?.height || null },
              };
              console.log('[DG][random][sync]', JSON.stringify(payload));
            }
          }
        } catch {}
      }

      regenerateMapFromStrokes();
      try { (panel.__dgUpdateButtons || updateGeneratorButtons || function(){})() } catch(e) { }
      syncLetterFade();
      __dgMarkSingleCanvasDirty(panel);
      if (DG_SINGLE_CANVAS) {
        try { compositeSingleCanvas(); } catch {}
      }
        if (!DG_SINGLE_CANVAS && usingBackBuffers) {
          pendingPaintSwap = true;
          requestFrontSwap();
        }
        markPaintDirty();
        __dgPaintDebugLog('clearAndRedrawFromStrokes', {
          reason: reason || null,
          ctxRole: ctx?.canvas?.getAttribute?.('data-role') || null,
          ctxW: ctx?.canvas?.width || 0,
          ctxH: ctx?.canvas?.height || 0,
        });
        dgPaintTrace('clearAndRedrawFromStrokes:exit');
      });
    }

  function drawIntoBackOnly(includeCurrentStroke = false) {
    if (!backCtx || !cssW || !cssH) return;
    clearAndRedrawFromStrokes(backCtx, 'zoom-recompute-back');
    if (includeCurrentStroke && cur && Array.isArray(cur.pts) && cur.pts.length > 0) {
      drawFullStroke(backCtx, cur);
    }
    __dgMarkSingleCanvasDirty(panel);
    if (!DG_SINGLE_CANVAS) {
      pendingPaintSwap = true;
    }
  }

  /**
   * Processes a single generator stroke, fills in gaps to create a full line,
   * and marks the interpolated nodes as disabled.
   */
  function processGeneratorStroke(stroke, newMap, newGroups) {
    const partial = snapToGridFromStroke(stroke);
    const filledNodes = fillGapsInNodeArray(partial.nodes, cols);

    for (let c = 0; c < cols; c++) {
        if (filledNodes[c]?.size > 0) {
            filledNodes[c].forEach(row => {
                newMap.nodes[c].add(row);
                if (stroke.generatorId) {
                    const stack = newGroups[c].get(row) || [];
                    if (!stack.includes(stroke.generatorId)) stack.push(stroke.generatorId);
                    newGroups[c].set(row, stack);
                }
            });

            if (partial.nodes[c]?.size === 0) {
                if (!newMap.disabled[c]) newMap.disabled[c] = new Set();
                filledNodes[c].forEach(row => newMap.disabled[c].add(row));
            }
            // Add any nodes that were explicitly marked as disabled by the snapping logic (e.g., out of bounds)
            if (partial.disabled && partial.disabled[c]?.size > 0) {
                if (!newMap.disabled[c]) newMap.disabled[c] = new Set();
                partial.disabled[c].forEach(row => newMap.disabled[c].add(row));
            }
        }
    }
  }

  // Regenerates the node map by snapping all generator strokes.
function regenerateMapFromStrokes() {
      const isZoomed = panel.classList.contains('toy-zoomed');
      const newMap = { active: Array(cols).fill(false), nodes: Array.from({ length: cols }, () => new Set()), disabled: Array.from({ length: cols }, () => new Set()) };
      const newGroups = Array.from({ length: cols }, () => new Map());

      if (isZoomed) {
        // Advanced view: snap each generator line separately and union nodes.
        const gens = strokes.filter(s => s.generatorId);
        gens.forEach(s => processGeneratorStroke(s, newMap, newGroups));
      } else {
        // Standard view: keep a single generator line to avoid double nodes.
        const gens = strokes.filter(s => s.generatorId);
        if (gens.length > 0){
          const specialGen = gens.find(s => s.isSpecial) || gens[gens.length - 1];
          if (specialGen) processGeneratorStroke(specialGen, newMap, newGroups);
        } else {
          // Prefer a special stroke, otherwise use the latest stroke.
          const specialStroke = strokes.find(s => s.isSpecial) || (strokes.length ? strokes[strokes.length - 1] : null);
          if (specialStroke) processGeneratorStroke(specialStroke, newMap, newGroups);
        }
        // ...manual overrides (unchanged)...
        try {
          if (manualOverrides && Array.isArray(manualOverrides)) {
            for (let c = 0; c < cols; c++) {
              const ov = manualOverrides[c];
              if (ov && ov.size > 0) {
                newMap.nodes[c] = new Set(ov);
                // recompute active based on disabled set
                const dis = newMap.disabled?.[c] || new Set();
                const anyOn = Array.from(newMap.nodes[c]).some(r => !dis.has(r));
                newMap.active[c] = anyOn;
                // carry over groups from nodeGroupMap so we still avoid cross-line connections
                if (nodeGroupMap && nodeGroupMap[c] instanceof Map) {
                  for (const r of newMap.nodes[c]) {
                    const g = nodeGroupMap[c].get(r);
                    if (g != null) {
                      const stack = Array.isArray(g) ? g.slice() : [g];
                      newGroups[c].set(r, stack);
                    }
                  }
                }
              }
            }
          }
        } catch {}
      }

      // Finalize active mask: a column is active if it has at least one non-disabled node
      for (let c = 0; c < cols; c++) {
        const nodes = newMap.nodes?.[c] || new Set();
        const dis = newMap.disabled?.[c] || new Set();
        let anyOn = false;
        if (nodes.size > 0) {
          for (const r of nodes) { if (!dis.has(r)) { anyOn = true; break; } }
        }
        newMap.active[c] = anyOn;
      }

      // If NOTHING is active but there are nodes, default to active for columns that have nodes.
      if (!newMap.active.some(Boolean)) {
        for (let c = 0; c < cols; c++) {
          if ((newMap.nodes?.[c] || new Set()).size > 0) newMap.active[c] = true;
        }
      }

      // If a pending active mask exists (e.g., after steps change), map it to new cols
      if (pendingActiveMask && Array.isArray(pendingActiveMask.prevActive)) {
        const prevCols = pendingActiveMask.prevCols || newMap.active.length;
        const prevActive = pendingActiveMask.prevActive;
        const newCols = cols;
        const mapped = Array(newCols).fill(false);
        if (prevCols === newCols) {
          for (let i = 0; i < newCols; i++) mapped[i] = !!prevActive[i];
        } else if (newCols > prevCols && newCols % prevCols === 0) { // Upscaling (e.g., 8 -> 16)
          const factor = newCols / prevCols;
          for (let i = 0; i < prevCols; i++) {
            for (let j = 0; j < factor; j++) mapped[i * factor + j] = !!prevActive[i];
          }
        } else if (prevCols > newCols && prevCols % newCols === 0) { // Downscaling (e.g., 16 -> 8)
          const factor = prevCols / newCols;
          for (let i = 0; i < newCols; i++) {
            let any = false;
            for (let j = 0; j < factor; j++) any = any || !!prevActive[i * factor + j];
            mapped[i] = any;
          }
        } else {
          // fallback proportional map
          for (let i = 0; i < newCols; i++) {
            const src = Math.floor(i * prevCols / newCols);
            mapped[i] = !!prevActive[src];
          }
        }
        newMap.active = mapped;
        // Rebuild the disabled sets based on the new active state
        for (let c = 0; c < newCols; c++) {
            if (newMap.active[c]) {
                newMap.disabled[c].clear();
            } else if (newMap.nodes[c]) {
                newMap.nodes[c].forEach(r => newMap.disabled[c].add(r));
            }
        }
        pendingActiveMask = null; // consume
      } else {
          // Preserve disabled nodes from the persistent set where positions still exist
          for (let c = 0; c < cols; c++) {
            const prevDis = persistentDisabled[c] || new Set();
            for (const r of prevDis) {
              if (newMap.nodes[c]?.has(r)) newMap.disabled[c].add(r);
            }
          }
      }

      const regenSource = __dgRegenSource || 'unknown';
      __dgRegenSource = '';
      if (DG_DEBUG) {
        console.log('[DG][regen]', {
          panelId: panel?.id || null,
          source: regenSource,
          strokes: Array.isArray(strokes) ? strokes.length : 0,
          generators: Array.isArray(strokes) ? strokes.filter(s => s && s.generatorId).length : 0,
          cols: cols,
          nodeCount: newMap.nodes.reduce((n, s) => n + (s?.size || 0), 0),
        });
      }
      DG.log('rebuild map', {
        cols: newMap.nodes.length,
        activeCount: newMap.active.filter(Boolean).length
      });

      const prevRev = (currentMap && Number.isFinite(currentMap.__dgRev)) ? currentMap.__dgRev : 0;

      const prevActive = currentMap?.active ? currentMap.active.slice() : null;
      const prevNodes = currentMap?.nodes ? currentMap.nodes.map(s => s ? new Set(s) : new Set()) : null;

      currentMap = newMap;
      // Bump a simple revision counter so drawNodes() can cheaply know whether the node layout/render cache is still valid.
      currentMap.__dgRev = ((prevRev | 0) + 1) | 0;
      try { panel.__dgNodesRev = currentMap.__dgRev; } catch {}
      // Any regen implies nodes layer is dirty.
      try { if (__dgNodesCache) { __dgNodesCache.key = ''; __dgNodesCache.nodeCoords = null; } } catch {}
      nodeGroupMap = newGroups;
      persistentDisabled = currentMap.disabled; // Update persistent set
      try { (panel.__dgUpdateButtons || function(){})() } catch {}

      let didChange = true;
      if (prevActive && Array.isArray(currentMap.active) && prevActive.length === currentMap.active.length){
        didChange = currentMap.active.some((v,i)=> v !== prevActive[i]);
        if (!didChange && prevNodes && Array.isArray(currentMap.nodes) && prevNodes.length === currentMap.nodes.length){
          didChange = currentMap.nodes.some((set,i)=>{
            const a = prevNodes[i], b = set || new Set();
            if (a.size !== b.size) return true;
            for (const v of a) if (!b.has(v)) return true;
            return false;
          });
        }
      }

      if (didChange){
        emitDrawgridUpdate({ activityOnly: false });
      } else {
        // noise-free activity: do not notify the guide as a progress update
        emitDrawgridUpdate({ activityOnly: true });
      }

      try {
        dgTraceLog('[drawgrid] drawNodes', panel.id, {
          cols: currentCols,
          nodesCols: currentMap?.nodes?.length ?? 0,
        });
      } catch {}
      drawNodes(currentMap.nodes);
      drawGrid();
      if (DG_SINGLE_CANVAS) {
        __dgMarkSingleCanvasDirty(panel);
        try { compositeSingleCanvas(); } catch {}
      }
  }

  function capturePaintSnapshot() {
    try {
      const snapSrc = (DG_SINGLE_CANVAS && backCanvas) ? backCanvas : paint;
      if (snapSrc && snapSrc.width > 0 && snapSrc.height > 0) {
        const snap = document.createElement('canvas');
        snap.width = snapSrc.width;
        snap.height = snapSrc.height;
        snap.getContext('2d')?.drawImage(snapSrc, 0, 0);
        return {
          canvas: snap,
          dpr: (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : null,
        };
      }
    } catch {}
    return null;
  }

  function restorePaintSnapshot(snap) {
    if (!snap) return;
    try {
      updatePaintBackingStores({ target: usingBackBuffers ? 'back' : 'both' });
      pctx = getActivePaintCtx();
      if (!pctx) {
        try {
          const active = getActivePaintCanvas?.();
          console.warn('[DG][ink] NO paint ctx', {
            id: panel.id,
            usingBackBuffers,
            cssW, cssH,
            paintDpr,
            activeRole: active?.getAttribute?.('data-role') || active?.id || null,
            activeW: active?.width || null,
            activeH: active?.height || null,
          });
        } catch {}
      }

      const snapCanvas = snap?.canvas || snap;
      const snapDpr = (snap && typeof snap === 'object' && 'dpr' in snap) ? snap.dpr : null;
      const dprMismatch =
        Number.isFinite(snapDpr) &&
        Number.isFinite(paintDpr) &&
        Math.abs(snapDpr - paintDpr) > 1e-3;
      if (dprMismatch && Array.isArray(strokes) && strokes.length > 0) {
        // Avoid scaling old pixels across DPR changes; redraw from strokes for correct scale.
        try { clearAndRedrawFromStrokes(null, 'paintSnapshot-skip:dpr:zoom-recompute'); } catch {}
        return;
      }
      if (!snapCanvas) return;
      resetPaintBlend(pctx);
      R.clearCanvas(pctx);
      emitDG('paint-clear', { reason: 'restore-snapshot' });
      R.resetCtx(pctx);
      R.resetCtx(pctx);
      R.withLogicalSpace(pctx, () => {
        pctx.drawImage(snapCanvas, 0, 0, snapCanvas.width, snapCanvas.height, 0, 0, cssW, cssH);
        markPaintDirty();
      });
    } catch {}
  }

  function scheduleZoomRecompute() {
    if (zoomRAF) return;
    zoomRAF = requestAnimationFrame(() => {
      zoomRAF = 0;
      try {
        if (window.__ZOOM_COMMIT_PHASE) return;
      } catch {}
      // IMPORTANT:
      // If zoom recompute changes paintDpr but we do not resize the overlay backing stores,
      // the next draw will apply a different logical transform and nodes/connectors/text
      // can "jump" sometime after the zoom ends.
      {
        const deviceDpr = Math.max(1, Number.isFinite(window?.devicePixelRatio) ? window.devicePixelRatio : 1);
        const visualMul = __dgComputeVisualBackingMul(Number.isFinite(boardScale) ? boardScale : 1);
        const pressureMul = (Number.isFinite(__dgPressureDprMul) && __dgPressureDprMul > 0) ? __dgPressureDprMul : 1;
        // Prefer the most recent adaptive DPR (already includes non-gesture caps),
        // then apply size-based capping to avoid huge backing stores.
        let desiredDpr =
          (Number.isFinite(__dgAdaptivePaintDpr) && __dgAdaptivePaintDpr > 0)
            ? __dgAdaptivePaintDpr
            : Math.max(1, Math.min(deviceDpr, 3));
        const smallMul = __dgComputeSmallPanelBackingMul(cssW, cssH);
        desiredDpr = Math.min(deviceDpr, desiredDpr * visualMul * pressureMul * smallMul);
        // Keep ALL overlay surfaces in sync with the computed backing-store DPR.
        resizeSurfacesFor(cssW, cssH, desiredDpr, 'zoom-recompute');
        dgRefreshTrace('zoom-recompute', { cssW, cssH, desiredDpr, paintDpr, zoomMode });
      }
      pendingZoomResnap = false;

      // IMPORTANT:
      // Zoom recompute can rebuild/resize backing stores (and resnap can clear paint if it
      // thinks there's "no content"). In DrawGrid, the paint canvas may be the source of truth,
      // so we must preserve it across this path.
      const snap = capturePaintSnapshot();
      const hadInk = !!snap;
      const hadStrokes = Array.isArray(strokes) && strokes.length > 0;
      const hadNodes =
        currentMap &&
        Array.isArray(currentMap.nodes) &&
        currentMap.nodes.some(set => set && set.size > 0);

      useBackBuffers();
      updatePaintBackingStores({ force: true, target: 'back' });

      // If paint is non-empty but there are no reconstructible sources, never clear it here.
      // ALSO: during gesture zoom/pan, a blank toy may still have a live ghost trail. Preserving avoids
      // the "resnap-empty -> clear" path, which would cut the trail.
      const __ghostNonEmpty = panel && panel.__dgGhostLayerEmpty === false;
      const __preserveBlankDuringZoom =
        (hadInk && !hadStrokes && !hadNodes) ||
        (!hadStrokes && !hadNodes && (ghostGuideAutoActive || __ghostNonEmpty));

      if (typeof window !== 'undefined' && window.__DG_GHOST_TRACE) {
        dgGhostTrace('zoom:recompute:resnap', {
          preserveBlankDuringZoom: __preserveBlankDuringZoom,
          hadInk,
          hadStrokes,
          hadNodes,
          ghostNonEmpty: __ghostNonEmpty,
          ghostAutoActive: ghostGuideAutoActive,
          zoomMode,
        });
      }

      resnapAndRedraw(true, { preservePaintIfNoStrokes: __preserveBlankDuringZoom });

      // After backing-store churn, restore paint if it was our only source of truth.
      if (hadInk && !hadStrokes && !hadNodes) {
        restorePaintSnapshot(snap);
      }
      drawIntoBackOnly();
      pendingSwap = true;
    });
  }

  const handleZoom = (z = {}) => {
    __lastZoomEventTs = nowMs();
    noteZoomMotion(z);
    __auditZoomSizes('zoom-change');
    const phase = z?.phase;
    const mode = z?.mode;
    // Keep pctx aligned with current buffer choice to avoid drawing into stale back buffers.
    try {
      if (usingBackBuffers && pctx !== backCtx) pctx = backCtx;
      if (!usingBackBuffers && pctx !== frontCtx) pctx = frontCtx;
    } catch {}
    __dgPaintDebugLog('zoom-phase', {
      phase: phase || null,
      mode: mode || zoomMode || null,
      currentScale: z?.currentScale ?? null,
      targetScale: z?.targetScale ?? null,
    });
    try {
      if (typeof window !== 'undefined' && window.__DG_ZOOM_COMMIT_TRACE) {
        const isCommitLike =
          phase === 'freeze' ||
          phase === 'recompute' ||
          phase === 'swap' ||
          phase === 'done' ||
          phase === 'commit' ||
          phase === 'idle';
        if (isCommitLike) {
          const active = (typeof getActivePaintCanvas === 'function') ? getActivePaintCanvas() : null;
          const ctx = (typeof getActivePaintCtx === 'function') ? getActivePaintCtx() : null;
          const payload = {
            panelId: panel?.id || null,
            phase: phase || null,
            mode: mode || zoomMode || null,
            currentScale: z?.currentScale ?? null,
            targetScale: z?.targetScale ?? null,
            usingBackBuffers,
            paintDpr,
            cssW,
            cssH,
            pctxRole: pctx?.canvas?.getAttribute?.('data-role') || null,
            ctxRole: ctx?.canvas?.getAttribute?.('data-role') || null,
            activeRole: active?.getAttribute?.('data-role') || null,
            frontW: frontCanvas?.width || 0,
            frontH: frontCanvas?.height || 0,
            backW: backCanvas?.width || 0,
            backH: backCanvas?.height || 0,
          };
          console.log('[DG][zoom] phase', JSON.stringify(payload));
        }
      }
    } catch {}
    if (mode) {
      zoomMode = mode;
    }
    const currentlyGesturing = zoomMode === 'gesturing';
    if (currentlyGesturing && !__zoomActive) {
      __zoomActive = true;
      markZoomActive();
      zoomGestureActive = true;
      try { dgViewport?.setNonReactive?.(true); } catch {}
    } else if (!currentlyGesturing && !phase && __zoomActive && zoomMode === 'idle') {
      suppressHeaderPushUntil = nowMs() + HEADER_PUSH_SUPPRESS_MS;
      releaseZoomFreeze({ reason: 'mode-idle', zoomPayload: z });
    } else {
      zoomGestureActive = currentlyGesturing;
    }

    if (phase === 'begin') {
      if (!__zoomActive) {
        __zoomActive = true;
        zoomGestureActive = true;
        markZoomActive();
      }
      try { dgViewport?.setNonReactive?.(true); } catch {}
      const beginScale = Number.isFinite(z?.currentScale) ? z.currentScale : (Number.isFinite(z?.targetScale) ? z.targetScale : null);
      dglog('zoom:begin', { scale: beginScale });
      suppressHeaderPushUntil = nowMs() + HEADER_PUSH_SUPPRESS_MS;
      return;
    }

    if (phase === 'commit' || phase === 'idle' || phase === 'done') {
      markLayoutSizeDirty();
      try { particles?.snapAllToHomes?.(); } catch {}
      suppressHeaderPushUntil = nowMs() + HEADER_PUSH_SUPPRESS_MS;

      // Let ZoomCoordinator know we're done with the freeze,
      // but only request a heavy layout on 'done'.
      releaseZoomFreeze({
        reason: `phase-${phase}`,
        refreshLayout: phase === 'done',
        zoomPayload: z
      });

      if (phase === 'done') {
        // Avoid restoring paint snapshots after zoom settle; redraw from strokes instead.
        // Set count > 1 because both ensureSizeReady and layout can attempt a restore.
        __dgSkipPaintSnapshotCount = Math.max(__dgSkipPaintSnapshotCount || 0, 2);
        // Ensure we end commit on front buffers so paint isn't stuck scaled in back buffers.
        try { useFrontBuffers(); } catch {}
        // Only do heavy layout + field resize once commit fully settles.
        try { layout(true); } catch {}
        try { dgField?.resize?.(); } catch {}
        layoutSizeDirty = true;
        ensureSizeReady({ force: true });
        const zoomSnapshot = extractZoomSnapshot(z);
        const doneScale = Number.isFinite(zoomSnapshot?.scale) ? zoomSnapshot.scale : null;
        const scaleChanged =
          Number.isFinite(doneScale) &&
          (!Number.isFinite(__dgLastZoomDoneScale) || Math.abs(doneScale - __dgLastZoomDoneScale) > 1e-4) &&
          (Number.isFinite(lastCommittedScale) ? Math.abs(doneScale - lastCommittedScale) > 1e-4 : true);
        if (Number.isFinite(doneScale)) {
          __dgLastZoomDoneScale = doneScale;
        }
        const dprChanged =
          Number.isFinite(paintDpr) && paintDpr > 0 &&
          (!Number.isFinite(__dgLastZoomDonePaintDpr) || Math.abs(paintDpr - __dgLastZoomDonePaintDpr) > 1e-6);
        if (Number.isFinite(paintDpr) && paintDpr > 0) {
          __dgLastZoomDonePaintDpr = paintDpr;
        }
        const hasStrokes = Array.isArray(strokes) && strokes.length > 0;
        const hasNodes = !!(currentMap && Array.isArray(currentMap.nodes) && currentMap.nodes.some(s => s && s.size > 0));
        // IMPORTANT:
        // Our "scaleChanged" heuristic looks at the camera scale, but the paint backing-store DPR can
        // still change independently (visual/pressure/small multipliers). When that happens, we MUST
        // redraw the paint stroke layer into the new logical space, otherwise the solid (paint) line
        // can appear to "scale up" while the animated overlay remains correct.
        if ((scaleChanged || dprChanged) && (hasStrokes || hasNodes)) {
          try {
            if (typeof window !== 'undefined' && window.__DG_ZOOM_COMMIT_TRACE) {
              const payload = {
                panelId: panel?.id || null,
                hasStrokes,
                hasNodes,
                dprChanged,
                usingBackBuffers,
                paintDpr,
                cssW,
                cssH,
                pctxRole: pctx?.canvas?.getAttribute?.('data-role') || null,
                frontW: frontCanvas?.width || 0,
                frontH: frontCanvas?.height || 0,
                backW: backCanvas?.width || 0,
                backH: backCanvas?.height || 0,
              };
              console.log('[DG][zoom] done:redraw', JSON.stringify(payload));
            }
          } catch {}
          if (hasStrokes) {
            // IMPORTANT: redraw into the currently visible paint buffer.
            // (Don't force backCtx in single-canvas mode unless back buffers are enabled.)
            try { clearAndRedrawFromStrokes(usingBackBuffers ? backCtx : frontCtx, 'zoom-done'); } catch {}
            // If we're in a zoom commit and render onto back, force a front swap so paint is visible.
            try {
              if (usingBackBuffers && typeof requestFrontSwap === 'function') {
                requestFrontSwap(useFrontBuffers);
              }
            } catch {}
            __dgPaintDebugLog('zoom-done:redraw', {
              hasStrokes,
              hasNodes,
            });
          } else {
            // No strokes, but we still need static layers to match the new zoom basis.
            try { drawNodes(currentMap.nodes); } catch {}
            try { drawGrid(); } catch {}
          }
          try { ensureBackVisualsFreshFromFront?.(); } catch {}
          try { markStaticDirty('zoom-done'); } catch {}
          __dgForceFullDrawNext = true;
          // In single-canvas mode, ensure we composite immediately so the
          // toy doesn't appear blank/mis-scaled
          // until the next camera move triggers a redraw.
          if (DG_SINGLE_CANVAS && isPanelVisible) {
            try { compositeSingleCanvas(); } catch {}
            try { panel.__dgSingleCompositeDirty = false; } catch {}
          }
        }

        // BUGFIX: prevent delayed “snap later” jumps after zoom/pan.
        // resnapAndRedraw() can defer while zoomMode==='gesturing' and set pendingZoomResnap.
        // If we leave that flag set, it will apply later (RO/layout timer/etc.) and the
        // nodes/connectors/text appear to “jump” after the zoom ends.
        try {
          const hadPending = pendingZoomResnap || pendingResnapOnVisible;
          if (hadPending) {
            dgRefreshTrace('zoom-done:apply-pending-resnap', { pendingZoomResnap, pendingResnapOnVisible });
            pendingZoomResnap = false;
            pendingResnapOnVisible = false;
            // Ensure resnap executes immediately and is not blocked by gesturing state.
            zoomMode = 'idle';
            zoomGestureActive = false;
            // IMPORTANT:
            // After a gesture ends, a blank toy can still have a live ghost trail (auto guide).
            // If we run the "resnap-empty -> clearDrawgridInternal" path here, it will cut the trail.
            const __hasStrokes = Array.isArray(strokes) && strokes.length > 0;
            const __hasNodes =
              !!(currentMap && Array.isArray(currentMap.nodes) && currentMap.nodes.some(s => s && s.size > 0));
            const __hasAnyPaint = ((__dgPaintRev | 0) > 0) || hasOverlayStrokesCached();
            const __ghostNonEmpty = panel && panel.__dgGhostLayerEmpty === false;
            const __preserveBlankDuringDoneResnap =
              (!__hasStrokes && !__hasNodes) && (ghostGuideAutoActive || __ghostNonEmpty || !__hasAnyPaint);
            if (typeof window !== 'undefined' && window.__DG_GHOST_TRACE) {
              dgGhostTrace('zoom:done:pending-resnap', {
                preserveBlankDuringDoneResnap: __preserveBlankDuringDoneResnap,
                hasStrokes: __hasStrokes,
                hasNodes: __hasNodes,
                hasAnyPaint: __hasAnyPaint,
                ghostNonEmpty: __ghostNonEmpty,
                ghostAutoActive: ghostGuideAutoActive,
                zoomMode,
              });
            }
            resnapAndRedraw(true, { preservePaintIfNoStrokes: __preserveBlankDuringDoneResnap });
          }
        } catch {}
      }

      return;
    }
  };

  // Tag for zoom profiling readability
  handleZoom.__zcName = `drawgrid:${panel.id || 'unknown'}`;
  const unsubscribeZoom = onZoomChange(namedZoomListener('drawgrid:zoom', handleZoom));

  let zoomRAF = null;

function resnapAndRedraw(forceLayout = false, opts = {}) {
    const preservePaintIfNoStrokes = !!opts.preservePaintIfNoStrokes;
    const skipLayout = !!opts.skipLayout;
    dgRefreshTrace('resnap', { forceLayout, skipLayout, preservePaintIfNoStrokes, zoomMode, isPanelVisible });
    if (zoomMode === 'gesturing' && !forceLayout) {
      dgRefreshTrace('resnap:defer gesturing');
      pendingZoomResnap = true;
      return;
    }
    if (!isPanelVisible && !forceLayout) {
      dgRefreshTrace('resnap:defer not visible');
      pendingResnapOnVisible = true;
      return;
    }

    const nowTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (!forceLayout && (nowTs - lastResnapTs) < 50) {
      // Too soon; coalesce into a single resnap after the cooldown.
      pendingResnapOnVisible = true;
      return;
    }
    lastResnapTs = nowTs;

    const hasStrokes = Array.isArray(strokes) && strokes.length > 0;
    const hasNodes =
      currentMap &&
      Array.isArray(currentMap.nodes) &&
      currentMap.nodes.some(set => set && set.size > 0);

    syncLetterFade({ immediate: true });

    // Layout policy:
    // - Most callers should allow layout.
    // - Some callers (e.g. focus/DOM normalize) request skipLayout to avoid forced sync reads.
    // - HOWEVER: after refresh/boot and after RO size changes, we *must* run layout at least once,
    //   otherwise overlay canvases (grid/ghost/playhead) can keep stale backing sizes and appear to
    //   "scale wrong" or disappear until some other event triggers a full resnap.
    const needLayout =
      !!forceLayout ||
      !skipLayout ||
      !!layoutSizeDirty ||
      zoomMode === 'committing';

    if (needLayout) {
      layout(!!forceLayout);
    } else if (cssW <= 0 || cssH <= 0) {
      // Safety: if somehow we have no valid backing size, force a one-off layout.
      layout(true);
    }

    requestAnimationFrame(() => {
      if (!panel.isConnected) return;
      __dgNeedsUIRefresh = true;
      __dgStableFramesAfterCommit = 0;

      if (hasStrokes) {
        FD.markRegenSource('resnap');
        regenerateMapFromStrokes();
        R.resetCtx(pctx);
        __dgWithLogicalSpace(pctx, () => {
          R.clearCanvas(pctx);
          emitDG('paint-clear', { reason: 'resnap-redraw' });
          for (const s of strokes) {
            drawFullStroke(pctx, s, { skipReset: true, skipTransform: true });
          }
        });
        if (DG_SINGLE_CANVAS) {
          __dgMarkSingleCanvasDirty(panel);
          try { compositeSingleCanvas(); } catch {}
          panel.__dgSingleCompositeDirty = false;
        }
        updateGeneratorButtons();
        return;
      }

      if (hasNodes) {
        drawGrid();
        drawNodes(currentMap.nodes);
        if (DG_SINGLE_CANVAS) {
          __dgMarkSingleCanvasDirty(panel);
          try { compositeSingleCanvas(); } catch {}
          panel.__dgSingleCompositeDirty = false;
        }
        emitDrawgridUpdate({ activityOnly: false });
        updateGeneratorButtons();
        return;
      }

      const inboundNonEmpty = inboundWasNonEmpty();
      if (preservePaintIfNoStrokes) {
        // IMPORTANT: even when preserving paint state (blank / no-strokes toys),
        // we still need baseline visuals to be correct after refresh/zoom commit:
        // - grid background should be redrawn
        // - ghost guide should use the current layout backing size (otherwise it can "stick" at 1x)
        // - single-canvas composite must be refreshed so the user sees something immediately
        dgTraceWarn('[drawgrid][resnap] preserve paint (no strokes/nodes)', {
          guardActive: DG_HYDRATE.guardActive,
          inboundNonEmpty,
        });

        try { drawGrid(); } catch {}
        try { if (ghostGuideAutoActive) runAutoGhostGuideSweep(); } catch {}

        if (DG_SINGLE_CANVAS) {
          __dgMarkSingleCanvasDirty(panel);
          try { compositeSingleCanvas(); } catch {}
          panel.__dgSingleCompositeDirty = false;
        }

        updateGeneratorButtons();
        return;
      }
      if (!inboundNonEmpty && !DG_HYDRATE.guardActive) {
        clearDrawgridInternal({ reason: 'resnap-empty' });
      } else {
        dgTraceWarn('[drawgrid][boot] skip clear', {
          reason: 'resnap-empty',
          guardActive: DG_HYDRATE.guardActive,
          inboundNonEmpty,
        });
      }
      updateGeneratorButtons();
    });
  }




  panel.addEventListener('toy-zoom', (e)=>{
    const z = e?.detail;
    if (!z) return;
    try {
      if (typeof window !== 'undefined' && window.__DG_ZOOM_COMMIT_TRACE) {
        console.log('[DG][zoom] event', {
          panelId: panel?.id || null,
          phase: z?.phase || null,
          mode: z?.mode || null,
          currentScale: z?.currentScale ?? null,
          targetScale: z?.targetScale ?? null,
        });
      }
    } catch {}

    if (z.phase === 'prepare') {
      zoomGestureActive = true;
      zoomMode = 'gesturing';
      // during gesture we render via CSS transforms only
      useBackBuffers();
      return;
    }

  if (z.phase === 'recompute') {
    // During gesture, we rely on CSS transforms; schedule a resnap so the
    // backing stores catch up safely outside the current event.
    // dglog('toy-zoom:recompute', { zoomGestureActive, zoomMode, __zoomActive, __overviewActive });
    scheduleZoomRecompute();
    return;
  }

    if (z.phase === 'commit') {
      // one-time swap & finalize
      useFrontBuffers();
      // copy ghost back -> front exactly once after swap
      const front = ghostFrontCtx?.canvas, back = ghostBackCtx?.canvas;
      if (front && back) {
        R.withDeviceSpace(ghostFrontCtx, () => ghostFrontCtx.drawImage(back, 0, 0, back.width, back.height, 0, 0, front.width, front.height));
      }
      // NEW: also copy other overlays back -> front once to avoid a 1-frame size pop
      copyCanvas(gridBackCtx,      gridFrontCtx);
      emitDG('blit', { from: 'back', to: 'front', layer: 'grid' });
      copyCanvas(nodesBackCtx,     nodesFrontCtx);
      emitDG('blit', { from: 'back', to: 'front', layer: 'nodes' });
      copyCanvas(flashBackCtx,     flashFrontCtx);
      emitDG('blit', { from: 'back', to: 'front', layer: 'flash' });
      copyCanvas(tutorialBackCtx,  tutorialFrontCtx);
      emitDG('blit', { from: 'back', to: 'front', layer: 'tutorial' });

      const __hasStrokes = Array.isArray(strokes) && strokes.length > 0;
      const __hasNodes = !!(currentMap && Array.isArray(currentMap.nodes) && currentMap.nodes.some(s => s && s.size > 0));
      const __hasAnyPaint = ((__dgPaintRev | 0) > 0) || hasOverlayStrokesCached();
      const __ghostNonEmpty = panel && panel.__dgGhostLayerEmpty === false;
      // IMPORTANT: During gesture pan/zoom commit, a blank toy may still have a live ghost trail.
      // Never run the "resnap-empty -> clearDrawgridInternal" path in that case, because it cuts the trail.
      const __preserveBlankDuringCommit = (!__hasStrokes && !__hasNodes) && (ghostGuideAutoActive || __ghostNonEmpty || !__hasAnyPaint);
      if (typeof window !== 'undefined' && window.__DG_GHOST_TRACE) {
        dgGhostTrace('zoom:commit:resnap', {
          preserveBlankDuringCommit: __preserveBlankDuringCommit,
          hasStrokes: __hasStrokes,
          hasNodes: __hasNodes,
          hasAnyPaint: __hasAnyPaint,
          ghostNonEmpty: __ghostNonEmpty,
          ghostAutoActive: ghostGuideAutoActive,
          zoomMode,
        });
      }
      resnapAndRedraw(true, { preservePaintIfNoStrokes: __preserveBlankDuringCommit });
      try {
        if (typeof window !== 'undefined' && window.__DG_ZOOM_COMMIT_TRACE) {
          const active = (typeof getActivePaintCanvas === 'function') ? getActivePaintCanvas() : null;
          const ctx = (typeof getActivePaintCtx === 'function') ? getActivePaintCtx() : null;
          const payload = {
            panelId: panel?.id || null,
            usingBackBuffers,
            paintDpr,
            cssW,
            cssH,
            pctxRole: pctx?.canvas?.getAttribute?.('data-role') || null,
            activeRole: active?.getAttribute?.('data-role') || null,
            ctxRole: ctx?.canvas?.getAttribute?.('data-role') || null,
            frontW: frontCanvas?.width || 0,
            frontH: frontCanvas?.height || 0,
            backW: backCanvas?.width || 0,
            backH: backCanvas?.height || 0,
          };
          console.log('[DG][zoom-commit] pre-redraw', payload);
        }
      } catch {}
      try { clearAndRedrawFromStrokes(pctx, 'zoom-commit'); } catch {}
      try { markStaticDirty('zoom-commit'); } catch {}
      __dgForceFullDrawNext = true;
      zoomGestureActive = false;
      zoomMode = 'idle'; // ensure we fully exit zoom mode 
      lastCommittedScale = boardScale;
      return;
    }
  });

  // NOTE:
  // We intentionally DO NOT install a second legacy ResizeObserver here.
  // The stable wrap observer (installed via __installLayoutObserver()) is the
  // single source of truth for size changes + resnap scheduling.

  // Visibility culling: turn off heavy work when the panel is completely offscreen.
  // Hard-cull should treat "barely intersecting" as not visible, otherwise
  // toys keep their rAF loop alive while only a tiny sliver is on-screen.
  if (typeof window !== 'undefined' && 'IntersectionObserver' in window) {
    try {
      let lastVisibleState = isPanelVisible;
      let visRoot = null;
      try {
        visRoot = panel?.closest?.('.board-viewport') || null;
      } catch {}
      const visObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.target !== panel) continue;
            // Require a minimum intersection ratio to count as visible.
            const visible =
              entry.isIntersecting &&
              (typeof entry.intersectionRatio !== 'number'
                ? true
                : entry.intersectionRatio >= DG_VISIBILITY_THRESHOLD);
            isPanelVisible = !!visible;
            try {
              const debugCull = (typeof window !== 'undefined' && window.__DG_DEBUG_CULL);
              if (debugCull && isPanelVisible !== lastVisibleState) {
                console.log('[DG][cull] VIS', {
                  panelId: panel?.id || null,
                  from: lastVisibleState,
                  to: isPanelVisible,
                  ratio: entry?.intersectionRatio,
                  isIntersecting: entry?.isIntersecting,
                });
              }
            } catch {}
            const becameVisible = (isPanelVisible && !lastVisibleState);
            if (becameVisible) {
              // Force a real redraw/composite the moment we come back on-screen.
              try {
                __dgMarkSingleCanvasDirty(panel);
                panel.__dgSingleCompositeDirty = true;
                panel.__dgCompositeBaseDirty = true;
                panel.__dgCompositeOverlayDirty = true;
              } catch {}

              // Restart the per-panel render loop if it was hard-culled while offscreen.
              ensureRenderLoopRunning();

              try { __dgForceFullDrawNext = true; } catch {}
              try { __dgForceFullDrawUntil = nowMs() + 200; } catch {}

              // If we're using the single-canvas path, actually run it once immediately.
              try {
                if (DG_SINGLE_CANVAS) {
                  requestAnimationFrame(() => {
                    try { compositeSingleCanvas(); } catch {}
                    try { panel.__dgSingleCompositeDirty = false; } catch {}
                  });
                }
              } catch {}
            }
            if (isPanelVisible && pendingResnapOnVisible) {
              pendingResnapOnVisible = false;
              resnapAndRedraw(true);
            }
            updateGlobalVisibility(isPanelVisible);
            if (isPanelVisible && drawLabelState.drawLabelVisible) {
              ensureLetterPhysicsLoop();
            }
            if (isPanelVisible !== lastVisibleState) {
              lastVisibleState = isPanelVisible;
              try {
                drawgridLog('[DG][cull] visibility change', {
                  id: panel.id || null,
                  visible: isPanelVisible,
                  ratio: Number.isFinite(entry.intersectionRatio)
                    ? Number(entry.intersectionRatio.toFixed(3))
                    : null,
                });
              } catch {}
            }
          }
        },
        {
          root: visRoot,
          threshold: [0, DG_VISIBILITY_THRESHOLD],
        }
      );
      visObserver.observe(panel);
      panel.__dgVisibilityObserver = visObserver;
    } catch (e) {
      // If anything goes wrong, assume visible so we don't break rendering
      isPanelVisible = true;
    }
  }

  // IMPORTANT: ensure there is NOT a second/duplicate IntersectionObserver visibility block
  // elsewhere in this file. If one exists (often using `entry.intersectionRatio > DG_VISIBILITY_THRESHOLD`
  // without the "minimum ratio" comment), delete it. Having two observers causes conflicting
  // isPanelVisible updates and makes panels become "visible" at ~1-2%.
  // Also respond to generic toy visibility events (shared culler)
  panel.addEventListener('toy:visibility', (e) => {
    if (typeof e?.detail?.visible === 'boolean') {
      isPanelVisible = !!e.detail.visible;
      updateGlobalVisibility(isPanelVisible);
      if (isPanelVisible && pendingResnapOnVisible) {
        pendingResnapOnVisible = false;
        resnapAndRedraw(true);
      }
      if (isPanelVisible && drawLabelState.drawLabelVisible) {
        ensureLetterPhysicsLoop();
      }
    }
  });
  const onGlobalDrawgridRefresh = (e) => {
    if (e?.detail?.sourcePanelId === panel?.id) return;
    panel.__dgForceNodesRefresh = true;
  };
  try {
    window.addEventListener('drawgrid:refresh-all', onGlobalDrawgridRefresh);
    panel.addEventListener('toy:remove', () => {
      try { window.removeEventListener('drawgrid:refresh-all', onGlobalDrawgridRefresh); } catch {}
    }, { once: true });
  } catch {}

  const onGlobalPointerUp = () => {
    const now = nowMs();
    let wasGesturing = false;
    try {
      wasGesturing = !!(window.__mtZoomGesturing || window.__GESTURE_ACTIVE || document.body?.classList?.contains?.('is-gesturing'));
    } catch {}
    let inSettle = false;
    try {
      const settle = window.__GESTURE_SETTLE_UNTIL_TS;
      if (Number.isFinite(settle) && now < settle) inSettle = true;
    } catch {}
    if (!wasGesturing && !inSettle) return;
    __dgBypassCommitUntil = now + 240;
    __dgForceFullDrawUntil = now + 240;
    __dgForceFullDrawNext = true;
    __dgForceFullDrawFrames = Math.max(__dgForceFullDrawFrames || 0, 8);
    // Avoid a 1-frame "flash" where overlay strokes disappear on gesture release.
    // If we have overlay-colorized/special strokes, preserve overlays through the release.
    let __dgPreserveOverlaysOnRelease = false;
    try {
      __dgPreserveOverlaysOnRelease = !!(typeof hasOverlayStrokesCached === 'function' && hasOverlayStrokesCached());
      if (!__dgPreserveOverlaysOnRelease && Array.isArray(strokes) && strokes.length) {
        for (let i = 0; i < strokes.length; i++) {
          const s = strokes[i];
          if (s && (s.isSpecial || s.overlayColorize)) { __dgPreserveOverlaysOnRelease = true; break; }
        }
      }
    } catch {}
    __dgForceOverlayClearNext = !__dgPreserveOverlaysOnRelease;
    __dgForceSwapNext = true;
    __dgNeedsUIRefresh = true;
    __dgStableFramesAfterCommit = 2;
    __dgDeferUntilTs = 0;
  };
  try {
    window.addEventListener('pointerup', onGlobalPointerUp, true);
    panel.addEventListener('toy:remove', () => {
      try { window.removeEventListener('pointerup', onGlobalPointerUp, true); } catch {}
    }, { once: true });
  } catch {}

  let lastZoomX = 1;
  let lastZoomY = 1;

  function getLayoutSize() {
    return measureCSSSize(wrap);
  }

  function markLayoutSizeDirty() {
    layoutSizeDirty = true;
  }

  function __installLayoutObserver() {
    try {
      if (!wrap) { dgRefreshTrace('ro:skip no wrap'); return; }
      if (__dgLayoutObserverInstalled) { dgRefreshTrace('ro:skip already exists'); return; }
      if (typeof ResizeObserver === 'undefined') { dgRefreshTrace('ro:skip no ResizeObserver'); return; }
      if (__dgLayoutObs) { dgRefreshTrace('ro:skip already exists'); return; }

      // Coalesce RO-triggered resnaps to at most once per frame per instance.
      // IMPORTANT:
      // - RO callbacks can fire multiple times per frame (and across many toys).
      // - Doing real work inside RO increases churn and can line up expensive redraws badly.
      // - We still do NOT "defer until gesture end" here; resnapAndRedraw itself controls that policy.
      let __dgROResnapRAF = 0;
      const scheduleROResnap = () => {
        if (__dgROResnapRAF) return;
        __dgROResnapRAF = requestAnimationFrame(() => {
          __dgROResnapRAF = 0;
          try { if (!panel?.isConnected) return; } catch { return; }
          try { resnapAndRedraw(false); } catch {}
        });
      };
      try {
        panel?.addEventListener?.('toy:remove', () => {
          try { if (__dgROResnapRAF) cancelAnimationFrame(__dgROResnapRAF); } catch {}
          __dgROResnapRAF = 0;
        }, { once: true });
      } catch {}
      __dgLayoutObs = new ResizeObserver((entries) => {
        const e = entries && entries[0];
        const cr = e && e.contentRect;
        if (!cr) return;
        const w = Math.max(1, Math.round(cr.width || 0));
        const h = Math.max(1, Math.round(cr.height || 0));
        if (!w || !h) return;
        if (w === __dgLayoutW && h === __dgLayoutH) return;
        dgRefreshTrace('ro:size', { w, h, prevW: __dgLayoutW, prevH: __dgLayoutH });
        __dgLayoutW = w;
        __dgLayoutH = h;
        // Remember a stable non-zero size for callers that need continuity on refresh.
        __dgLayoutGoodW = w;
        __dgLayoutGoodH = h;
        layoutSizeDirty = true;

        // IMPORTANT:
        // Keep RO callback lightweight; schedule resnap for next frame (coalesced).
        // Policy about gesturing/visibility is handled inside resnapAndRedraw().
        scheduleROResnap();
      });
      __dgLayoutObs.observe(wrap);
      __dgLayoutObserverInstalled = true;
      panel?.addEventListener?.('toy:remove', () => {
        try { __dgLayoutObs?.disconnect?.(); } catch {}
        __dgLayoutObs = null;
        __dgLayoutObserverInstalled = false;
      }, { once: true });
    } catch {}
  }

  function __dgGetStableWrapSize() {
    // Single source of truth for "toy logical size".
    // Prefer RO cache; if RO hasn't reported yet (common just after refresh),
    // fall back to last known-good non-zero size; otherwise return 0 to force retry.
    if (__dgLayoutW > 0 && __dgLayoutH > 0) return { w: __dgLayoutW, h: __dgLayoutH };
    if (__dgLayoutGoodW > 0 && __dgLayoutGoodH > 0) return { w: __dgLayoutGoodW, h: __dgLayoutGoodH };
    return { w: 0, h: 0 };
  }

  function __dgGetLayoutGoodSize() {
    // Return last known-good RO size only (no current RO size).
    if (__dgLayoutGoodW > 0 && __dgLayoutGoodH > 0) return { w: __dgLayoutGoodW, h: __dgLayoutGoodH };
    return { w: 0, h: 0 };
  }

  function measureCSSSize(el) {
    if (!el) return { w: 0, h: 0 };

    // If we're measuring the drawgrid wrap, prefer cached RO size (no layout read).
    // IMPORTANT: If RO is installed but hasn't reported yet (common on refresh/boot),
    // do NOT fall back to offset/client/getBoundingClientRect() (can reflect transient zoom/transform).
    // Returning 0 forces callers to retry next frame.
    if (el === wrap && __dgLayoutObs && (__dgLayoutW <= 0 || __dgLayoutH <= 0)) {
      // RO is installed but hasn't reported yet (common on refresh/boot).
      // Prefer last-known-good RO size if we have it; otherwise return 0 to force callers to retry.
      const good = __dgGetLayoutGoodSize();
      if (good.w > 0 && good.h > 0) {
        dgRefreshTrace('size:wrap zero (RO pending) -> use good', { w: __dgLayoutW, h: __dgLayoutH, goodW: good.w, goodH: good.h });
        return good;
      }
      dgRefreshTrace('size:wrap zero (RO pending)', { w: __dgLayoutW, h: __dgLayoutH });
      return { w: 0, h: 0 };
    }
    if (el === wrap && __dgLayoutW > 0 && __dgLayoutH > 0) {
      return { w: __dgLayoutW, h: __dgLayoutH };
    }

    const w = el.offsetWidth || el.clientWidth || 0;
    const h = el.offsetHeight || el.clientHeight || 0;
    if (w > 0 && h > 0) return { w, h };
    // IMPORTANT:
    // Do NOT fall back to getBoundingClientRect() for sizing. During zoom/pan (CSS transforms),
    // it reflects transformed geometry and causes mixed-scale layers (steppy zoom + extra scaling).
    // If we can't read stable layout size yet, return 0 and let RO / next frame provide it.
    dgRefreshTrace('size:zero (no layout size yet)', { role: el?.getAttribute?.('data-role') || null });
    return { w: 0, h: 0 };
  }

  function useBackBuffers() {
    if (usingBackBuffers) return;
    usingBackBuffers = true;
    syncBackBufferSizes();
    gctx = gridBackCtx;
    nctx = nodesBackCtx;
    if (DG_SINGLE_CANVAS) {
      gctx = gridBackCtx;
      nctx = (DG_SINGLE_CANVAS_OVERLAYS && nodesCanvas !== grid) ? nodesFrontCtx : nodesBackCtx;
    }
    fctx = flashBackCtx;
    ghostCtx = ghostBackCtx;
    tutorialCtx = tutorialBackCtx;
    // Keep paint context aligned to active buffer.
    try { pctx = (typeof getActivePaintCtx === 'function') ? getActivePaintCtx() : backCtx; } catch { pctx = backCtx; }
    emitDG('buffers', { action: 'useBackBuffers', usingBackBuffers });
  }

  function useFrontBuffers() {
    if (!usingBackBuffers) return;
    usingBackBuffers = false;
    gctx = gridFrontCtx;
    nctx = nodesFrontCtx;
    if (DG_SINGLE_CANVAS) {
      gctx = gridBackCtx;
      nctx = (DG_SINGLE_CANVAS_OVERLAYS && nodesCanvas !== grid) ? nodesFrontCtx : nodesBackCtx;
    }
    fctx = flashFrontCtx;
    ghostCtx = ghostFrontCtx;
    tutorialCtx = tutorialFrontCtx;
    // Keep paint context aligned to active buffer.
    try { pctx = (typeof getActivePaintCtx === 'function') ? getActivePaintCtx() : frontCtx; } catch { pctx = frontCtx; }
    emitDG('buffers', { action: 'useFrontBuffers', usingBackBuffers });
  }

  function syncGhostBackToFront() {
    if (!ghostFrontCtx || !ghostBackCtx) return;
    const front = ghostFrontCtx.canvas;
    const back = ghostBackCtx.canvas;
    if (!front || !back || !front.width || !front.height) return;
    R.withDeviceSpace(ghostFrontCtx, () => {
      ghostFrontCtx.globalCompositeOperation = 'source-over';
      ghostFrontCtx.globalAlpha = 1;
      ghostFrontCtx.clearRect(0, 0, front.width, front.height);
      ghostFrontCtx.drawImage(
        back,
        0, 0, back.width, back.height,
        0, 0, front.width, front.height
      );
    });
  }

function copyCanvas(backCtx, frontCtx) {
  if (!backCtx || !frontCtx) return;
  const front = frontCtx.canvas, back = backCtx.canvas;
  if (!front || !back || !front.width || !front.height || !back.width || !back.height) return;
  R.withDeviceSpace(frontCtx, () => {
    frontCtx.clearRect(0, 0, front.width, front.height);
    frontCtx.drawImage(back, 0, 0, back.width, back.height, 0, 0, front.width, front.height);
  });
}

  function getActiveFlashCanvas() {
    return usingBackBuffers ? flashBackCanvas : flashCanvas;
  }

  function getActiveGhostCanvas() {
    return usingBackBuffers ? ghostBackCanvas : ghostCanvas;
  }

  function getActiveTutorialCanvas() {
    return usingBackBuffers ? tutorialBackCanvas : tutorialCanvas;
  }

  function __dgSampleAlpha(ctx, xCss, yCss) {
    if (!ctx || !ctx.canvas) return null;
    const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
    const px = Math.max(0, Math.min(ctx.canvas.width - 1, Math.round(xCss * scale)));
    const py = Math.max(0, Math.min(ctx.canvas.height - 1, Math.round(yCss * scale)));
    try {
      const data = ctx.getImageData(px, py, 1, 1).data;
      return { r: data[0], g: data[1], b: data[2], a: data[3], px, py };
    } catch {
      return { error: true, px, py };
    }
  }

  function __dgSampleCanvasStyles(canvas) {
    if (!canvas) return null;
    try {
      const cs = getComputedStyle(canvas);
      return {
        display: cs?.display || null,
        visibility: cs?.visibility || null,
        opacity: cs?.opacity || null,
        transform: cs?.transform || null,
      };
    } catch {
      return null;
    }
  }

  function __dgElSummary(el) {
    if (!el) return null;
    try {
      const r = el.getBoundingClientRect?.();
      const cs = getComputedStyle?.(el);
      return {
        rect: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
        transform: cs?.transform || null,
        transformOrigin: cs?.transformOrigin || null,
        contain: cs?.contain || null,
        willChange: cs?.willChange || null,
        display: cs?.display || null,
        position: cs?.position || null,
        pointerEvents: cs?.pointerEvents || null,
      };
    } catch {
      return null;
    }
  }



  function compositeSingleCanvas() {
    if (!DG_SINGLE_CANVAS || !frontCtx) return;
    if (!__dgGridReady()) return;
    const surface = frontCtx.canvas;
    if (!surface || !surface.width || !surface.height) return;
    const sampleX = gridArea ? (gridArea.x + 2) : null;
    const sampleY = gridArea ? (gridArea.y + topPad + 2) : null;
    // Guard: if the front backing store was resized to the scaled DOM rect,
    // fix sizes before compositing to avoid "scaled up" strokes.
    try {
      const expW = (__dgLastResizeTargetW || (cssW ? Math.max(1, Math.round(cssW * paintDpr)) : 0));
      const expH = (__dgLastResizeTargetH || (cssH ? Math.max(1, Math.round(cssH * paintDpr)) : 0));
      if (expW && expH) {
        const rect = getRect(surface);
        const rectW = Math.max(1, Math.round(rect?.width || 0));
        const rectH = Math.max(1, Math.round(rect?.height || 0));
        const looksLikeScaledRect =
          (surface.width === rectW && surface.height === rectH && (rectW !== expW || rectH !== expH));
        const wrongBackingStore = (surface.width !== expW || surface.height !== expH);
        if (wrongBackingStore && looksLikeScaledRect) {
          dgSizeTrace('composite:front-guard', {
            cssW,
            cssH,
            paintDpr,
            expW,
            expH,
            rectW,
            rectH,
            frontW: surface.width,
            frontH: surface.height,
          });
          resizeSurfacesFor(cssW, cssH, paintDpr, 'front-size-guard');
          markStaticDirty('front-size-guard');
          __dgForceFullDrawNext = true;
          return;
        }
      }
    } catch {}
    if (!panel.__dgSingleCompositeDirty && !panel.__dgCompositeBaseDirty && !panel.__dgCompositeOverlayDirty) {
      return;
    }

    // Perf: when overlays are separate DOM canvases (DG_SINGLE_CANVAS_OVERLAYS),
    // we should NOT re-composite the base just because an overlay got marked dirty.
    // In that mode, only base-ish dirtiness should trigger an expensive composite pass.
    // (Overlay canvases will render independently on top.)
    if (DG_SINGLE_CANVAS_OVERLAYS) {
      const needBaseComposite = !!panel.__dgSingleCompositeDirty || !!panel.__dgCompositeBaseDirty;
      if (!needBaseComposite) {
        panel.__dgCompositeOverlayDirty = false;
        return;
      }
    }

    FD.layerEvent('composite:begin', {
      panelId: panel?.id || null,
      panelRef: panel,
      singleCanvas: !!DG_SINGLE_CANVAS,
      overlays: !!DG_SINGLE_CANVAS_OVERLAYS,
      baseDirty: !!panel.__dgCompositeBaseDirty,
      overlayDirty: !!panel.__dgCompositeOverlayDirty,
      singleDirty: !!panel.__dgSingleCompositeDirty,
    });
    const __perfOn = !!(window.__PerfFrameProf && typeof performance !== 'undefined' && performance.now);
    dgGridAlphaLog('composite:begin', frontCtx);
    FD.layerTrace('composite:enter', {
      panelId: panel?.id || null,
      usingBackBuffers,
      frontRole: frontCtx?.canvas?.getAttribute?.('data-role') || null,
      frontSize: frontCtx?.canvas ? { w: frontCtx.canvas.width, h: frontCtx.canvas.height } : null,
    });
    if (!panel.__dgGridHasPainted) {
      try { drawGrid(); } catch {}
    }
    if (typeof window !== 'undefined' && window.__DG_REFRESH_SIZE_TRACE && gridBackCtx && gridArea) {
      const doSample =
        !!(typeof window !== 'undefined' && (window.__DG_REFRESH_SIZE_TRACE_SAMPLE || window.__DG_RESIZE_TRACE_SAMPLE));
      const sample = (doSample && sampleX !== null && sampleY !== null)
        ? __dgSampleAlpha(gridBackCtx, sampleX, sampleY)
        : null;
      dgSizeTrace('gridBack-sample', {
        cssW,
        cssH,
        gridHasPainted: !!panel.__dgGridHasPainted,
        baseDirty: !!panel.__dgCompositeBaseDirty,
        sample,
        sampleX,
        sampleY,
        gridArea: gridArea ? { ...gridArea } : null,
      });
    }
    dgSizeTraceCanvas('before-composite');
    const width = surface.width;
    const height = surface.height;

    // Perf: many "overlay-like" surfaces are visually confined to the grid area.
    // When possible, clip blits to the grid rect (device px) to reduce raster work.
    const __compDpr = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
    const __gridBoundsPx = (gridArea && gridArea.w > 0 && gridArea.h > 0)
      ? (() => {
          // NOTE: gridArea.y is typically relative to the grid region; include topPad.
          const gx = gridArea.x || 0;
          const gy = (gridArea.y || 0) + (topPad || 0);
          const x = Math.max(0, Math.min(width, Math.round(gx * __compDpr)));
          const y = Math.max(0, Math.min(height, Math.round(gy * __compDpr)));
          const w = Math.max(0, Math.min(width - x, Math.round(gridArea.w * __compDpr)));
          const h = Math.max(0, Math.min(height - y, Math.round(gridArea.h * __compDpr)));
          return (w > 0 && h > 0) ? { x, y, w, h } : null;
        })()
      : null;

    function __dgBlitTo(ctx, srcCanvas) {
      if (!ctx || !srcCanvas || !srcCanvas.width || !srcCanvas.height) return;
      const b = __gridBoundsPx;
      // Fast path: same backing store size -> direct clipped blit.
      if (b && srcCanvas.width === width && srcCanvas.height === height) {
        ctx.drawImage(srcCanvas, b.x, b.y, b.w, b.h, b.x, b.y, b.w, b.h);
        return;
      }
      // Fallback: scale full canvas (previous behavior).
      ctx.drawImage(
        srcCanvas,
        0, 0, srcCanvas.width, srcCanvas.height,
        0, 0, width, height
      );
    }
    const baseCanvas = panel.__dgCompositeBaseCanvas;
    let compositeBaseCanvas = baseCanvas;
    if (!compositeBaseCanvas) {
      compositeBaseCanvas = document.createElement('canvas');
      panel.__dgCompositeBaseCanvas = compositeBaseCanvas;
      panel.__dgCompositeBaseDirty = true;
    }
    if (compositeBaseCanvas.width !== width || compositeBaseCanvas.height !== height) {
      compositeBaseCanvas.width = width;
      compositeBaseCanvas.height = height;
      panel.__dgCompositeBaseDirty = true;
    }
    let compositeBaseCtx = panel.__dgCompositeBaseCtx;
    if (!compositeBaseCtx) {
      compositeBaseCtx = compositeBaseCanvas.getContext('2d');
      panel.__dgCompositeBaseCtx = compositeBaseCtx;
      panel.__dgCompositeBaseDirty = true;
    }

      if (panel.__dgCompositeBaseDirty && compositeBaseCtx) {
        const __baseStart = __perfOn ? performance.now() : 0;
        const baseCtx = compositeBaseCtx;
      R.withDeviceSpace(baseCtx, () => {
        // Use 'copy' to overwrite the backing store without a separate clearRect.
        baseCtx.globalAlpha = 1;
        baseCtx.globalCompositeOperation = 'copy';
        if (gridBackCanvas && gridBackCanvas.width && gridBackCanvas.height) {
          baseCtx.drawImage(
            gridBackCanvas,
            0, 0, gridBackCanvas.width, gridBackCanvas.height,
            0, 0, width, height
          );
        } else {
          baseCtx.clearRect(0, 0, width, height);
        }
        baseCtx.globalCompositeOperation = 'source-over';
        if (backCanvas && backCanvas.width && backCanvas.height) {
          baseCtx.drawImage(
            backCanvas,
            0, 0, backCanvas.width, backCanvas.height,
            0, 0, width, height
          );
        }
      });
      panel.__dgCompositeBaseDirty = false;
      if (__perfOn && __baseStart) {
        try { window.__PerfFrameProf?.mark?.('drawgrid.composite.base', performance.now() - __baseStart); } catch {}
      }
      dgSizeTrace('composite:base-rebuild', {
        cssW,
        cssH,
        paintDpr,
        surfaceW: width,
        surfaceH: height,
        gridArea: gridArea ? { ...gridArea } : null,
      });
    }

    const __finalStart = __perfOn ? performance.now() : 0;
    R.withDeviceSpace(frontCtx, () => {
      if (compositeBaseCanvas && compositeBaseCanvas.width && compositeBaseCanvas.height) {
        // Use 'copy' to overwrite the destination in a single draw (no separate clearRect).
        frontCtx.globalAlpha = 1;
        frontCtx.globalCompositeOperation = 'copy';
        const __baseBlitStart = __perfOn ? performance.now() : 0;
        frontCtx.drawImage(
          compositeBaseCanvas,
          0, 0, compositeBaseCanvas.width, compositeBaseCanvas.height,
          0, 0, width, height
        );
        if (__perfOn && __baseBlitStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.composite.base.blit', performance.now() - __baseBlitStart); } catch {}
        }
        frontCtx.globalCompositeOperation = 'source-over';
      } else {
        frontCtx.globalAlpha = 1;
        frontCtx.globalCompositeOperation = 'source-over';
        frontCtx.clearRect(0, 0, width, height);
      }
      const __doSample =
        (typeof window !== 'undefined') &&
        !!window.__DG_REFRESH_SIZE_TRACE &&
        window.__DG_REFRESH_SIZE_TRACE_SAMPLE === true &&
        sampleX !== null && sampleY !== null;
      if (__doSample) {
        const frontSample = __dgSampleAlpha(frontCtx, sampleX, sampleY);
        dgSizeTrace('front-sample', {
          cssW,
          cssH,
          gridHasPainted: !!panel.__dgGridHasPainted,
          baseDirty: !!panel.__dgCompositeBaseDirty,
          sample: frontSample,
          sampleX,
          sampleY,
          frontStyle: __dgSampleCanvasStyles(surface),
        });
      }
      const flashSource = getActiveFlashCanvas();
      if (!DG_SINGLE_CANVAS_OVERLAYS && !panel.__dgFlashLayerEmpty && flashSource && flashSource.width && flashSource.height) {
        const __flashStart = __perfOn ? performance.now() : 0;
        const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
        const allowFullFlash = !!panel.__dgFlashOverlayOutOfGrid;
        const bounds = (allowFullFlash || !(gridArea && gridArea.w > 0 && gridArea.h > 0))
          ? {
              x: 0,
              y: 0,
              w: Math.round(width),
              h: Math.round(height),
            }
          : {
              x: Math.round(gridArea.x * scale),
              y: Math.round(gridArea.y * scale),
              w: Math.round(gridArea.w * scale),
              h: Math.round(gridArea.h * scale),
            };
        let sx = 0;
        let sy = 0;
        let sw = flashSource.width;
        let sh = flashSource.height;
        if (bounds) {
          const maxX = flashSource.width;
          const maxY = flashSource.height;
          const bx = Math.max(0, Math.min(bounds.x, maxX));
          const by = Math.max(0, Math.min(bounds.y, maxY));
          const bw = Math.max(0, Math.min(bounds.w, maxX - bx));
          const bh = Math.max(0, Math.min(bounds.h, maxY - by));
          if (bw > 0 && bh > 0) {
            sx = bx;
            sy = by;
            sw = bw;
            sh = bh;
          }
        }
        frontCtx.drawImage(flashSource, sx, sy, sw, sh, sx, sy, sw, sh);
        if (__perfOn && __flashStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.composite.flash', performance.now() - __flashStart); } catch {}
        }
      }
      if (!DG_SINGLE_CANVAS_OVERLAYS) {
        // Compose overlays into a single overlay canvas, then blit once to the main surface.
        // This tends to reduce raster/compositor pressure vs multiple drawImage calls to the
        // full composite surface (especially at high DPR).
        
        // Perf: most overlay-like surfaces are visually confined to the grid area.
        // When possible, build the overlay canvas only for the grid bounds (device px),
        // and then blit it back into place. This reduces the pixel work involved in:
        //   - clearing the overlay
        //   - blitting multiple overlay sources into the overlay
        //   - blitting the overlay back to the main surface
        const __ovBounds = __gridBoundsPx;
        const __ovBoundsKey = __ovBounds ? `${__ovBounds.x},${__ovBounds.y},${__ovBounds.w},${__ovBounds.h}` : 'full';
        if (panel.__dgCompositeOverlayBoundsKey !== __ovBoundsKey) {
          panel.__dgCompositeOverlayBoundsKey = __ovBoundsKey;
          panel.__dgCompositeOverlayDirty = true;
        }
        const __ovW = (__ovBounds && __ovBounds.w > 0) ? __ovBounds.w : width;
        const __ovH = (__ovBounds && __ovBounds.h > 0) ? __ovBounds.h : height;
        let overlayCanvas = panel.__dgCompositeOverlayCanvas;
        if (!overlayCanvas) {
          overlayCanvas = document.createElement('canvas');
          panel.__dgCompositeOverlayCanvas = overlayCanvas;
          panel.__dgCompositeOverlayDirty = true;
        }
        if (overlayCanvas.width !== __ovW || overlayCanvas.height !== __ovH) {
          overlayCanvas.width = __ovW;
          overlayCanvas.height = __ovH;
          panel.__dgCompositeOverlayDirty = true;
        }
        let overlayCtx = panel.__dgCompositeOverlayCtx;
        if (!overlayCtx) {
          overlayCtx = overlayCanvas.getContext('2d');
          panel.__dgCompositeOverlayCtx = overlayCtx;
          panel.__dgCompositeOverlayDirty = true;
        }

        if (panel.__dgCompositeOverlayDirty && overlayCtx) {
          const __ovBuildStart = __perfOn ? performance.now() : 0;
          R.withDeviceSpace(overlayCtx, () => {
            // Clear to transparent without a separate clearRect.
            overlayCtx.globalAlpha = 1;
            overlayCtx.globalCompositeOperation = 'copy';
            overlayCtx.fillStyle = 'rgba(0,0,0,0)';
            overlayCtx.fillRect(0, 0, __ovW, __ovH);
            overlayCtx.globalCompositeOperation = 'source-over';

            function __dgBlitOverlaySource(srcCanvas) {
              if (!srcCanvas || !srcCanvas.width || !srcCanvas.height) return;
              if (__ovBounds) {
                // Copy only the grid bounds into the overlay canvas.
                overlayCtx.drawImage(
                  srcCanvas,
                  __ovBounds.x, __ovBounds.y, __ovBounds.w, __ovBounds.h,
                  0, 0, __ovW, __ovH
                );
              } else {
                __dgBlitTo(overlayCtx, srcCanvas);
              }
            }

            // Nodes (back then front if distinct)
            const nodesFrontCanvas = nodesFrontCtx?.canvas;
            const nodeSources = [];
            if (nodesBackCanvas && nodesBackCanvas.width && nodesBackCanvas.height) nodeSources.push(nodesBackCanvas);
            if (
              !DG_SINGLE_CANVAS &&
              nodesFrontCanvas &&
              nodesFrontCanvas !== nodesBackCanvas &&
              nodesFrontCanvas.width &&
              nodesFrontCanvas.height
            ) nodeSources.push(nodesFrontCanvas);

            for (const nodeCanvas of nodeSources) {
              const __nodesStart = __perfOn ? performance.now() : 0;
              __dgBlitOverlaySource(nodeCanvas);
              if (__perfOn && __nodesStart) {
                try { window.__PerfFrameProf?.mark?.('drawgrid.composite.nodes', performance.now() - __nodesStart); } catch {}
              }
            }

            const ghostSource = getActiveGhostCanvas();
            if (!panel.__dgGhostLayerEmpty && ghostSource && ghostSource.width && ghostSource.height) {
              const __ghostStart = __perfOn ? performance.now() : 0;
              __dgBlitOverlaySource(ghostSource);
              if (__perfOn && __ghostStart) {
                try { window.__PerfFrameProf?.mark?.('drawgrid.composite.ghost', performance.now() - __ghostStart); } catch {}
              }
            }

            const tutorialSource = getActiveTutorialCanvas();
            if (!panel.__dgTutorialLayerEmpty && tutorialSource && tutorialSource.width && tutorialSource.height) {
              const __tutorialStart = __perfOn ? performance.now() : 0;
              __dgBlitOverlaySource(tutorialSource);
              if (__perfOn && __tutorialStart) {
                try { window.__PerfFrameProf?.mark?.('drawgrid.composite.tutorial', performance.now() - __tutorialStart); } catch {}
              }
            }

            if (!panel.__dgPlayheadLayerEmpty && playheadCanvas && playheadCanvas.width && playheadCanvas.height) {
              const __playheadStart = __perfOn ? performance.now() : 0;
              __dgBlitOverlaySource(playheadCanvas);
              if (__perfOn && __playheadStart) {
                try { window.__PerfFrameProf?.mark?.('drawgrid.composite.playhead', performance.now() - __playheadStart); } catch {}
              }
            }
          });
          panel.__dgCompositeOverlayDirty = false;
          if (__perfOn && __ovBuildStart) {
            try { window.__PerfFrameProf?.mark?.('drawgrid.composite.overlayBuild', performance.now() - __ovBuildStart); } catch {}
          }
        }

        // Finally, blit the composed overlay to the main surface (clipped if possible).
        if (overlayCanvas && overlayCanvas.width && overlayCanvas.height) {
          const __ovBlitStart = __perfOn ? performance.now() : 0;
          if (__ovBounds) {
            frontCtx.drawImage(
              overlayCanvas,
              0, 0, __ovW, __ovH,
              __ovBounds.x, __ovBounds.y, __ovBounds.w, __ovBounds.h
            );
          } else {
            __dgBlitTo(frontCtx, overlayCanvas);
          }
          if (__perfOn && __ovBlitStart) {
            try { window.__PerfFrameProf?.mark?.('drawgrid.composite.overlayBlit', performance.now() - __ovBlitStart); } catch {}
          }
        }
      }
    });
    if (__perfOn && __finalStart) {
      try { window.__PerfFrameProf?.mark?.('drawgrid.composite.final', performance.now() - __finalStart); } catch {}
    }
    try { panel.__dgLastCompositeTs = (performance?.now ? performance.now() : Date.now()); } catch {}
    dgGridAlphaLog('composite:end', frontCtx);
    FD.layerTrace('composite:exit', {
      panelId: panel?.id || null,
      usingBackBuffers,
    });
  }

  function ensureBackVisualsFreshFromFront() {
    try {
      const paintScale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
      const logicalWidth = Math.max(1, cssW || ((frontCanvas?.width ?? 1) / paintScale));
      const logicalHeight = Math.max(1, cssH || ((frontCanvas?.height ?? 1) / paintScale));

      // Default all DOM-backed layers to paintScale, but allow "aux" layers (grid/nodes/ghost/tutorial/playhead/etc)
      // to reduce backing resolution when zoomed out or under frame-time pressure. This targets **raster/compositor**
      // cost ("frame.nonScript") without changing CSS size/layout.
      const deviceDpr = (Number.isFinite(window?.devicePixelRatio) && window.devicePixelRatio > 0) ? window.devicePixelRatio : 1;
      const toyScale = (Number.isFinite(panel?.__dgLastToyScale) && panel.__dgLastToyScale > 0) ? panel.__dgLastToyScale : 1;
      const visualMul = __dgComputeVisualBackingMul(toyScale);
      const pressureMul = (Number.isFinite(__dgPressureDprMul) && __dgPressureDprMul > 0) ? __dgPressureDprMul : 1;
      const autoMul = __dgGetAutoQualityMul();

      // Aux layer DPR: never exceed paintScale, but can drop below it smoothly.
      const auxDprRaw = deviceDpr * visualMul * pressureMul * autoMul;
      const auxScale = Math.min(
        paintScale,
        __dgCapDprForBackingStore(logicalWidth, logicalHeight, auxDprRaw, __dgAdaptivePaintDpr)
      );


      // Overlay layer DPR: drop earlier/more aggressively under pressure.
      // IMPORTANT: do NOT reduce overlay DPR based on gesture state; only generic pressure.
      const overlayMinMul = (Number.isFinite(window.__DG_OVERLAY_PRESSURE_DPR_MIN_MUL) && window.__DG_OVERLAY_PRESSURE_DPR_MIN_MUL > 0)
        ? window.__DG_OVERLAY_PRESSURE_DPR_MIN_MUL
        : 0.45;
      const overlayBias = (Number.isFinite(window.__DG_OVERLAY_PRESSURE_DPR_BIAS) && window.__DG_OVERLAY_PRESSURE_DPR_BIAS > 0)
        ? window.__DG_OVERLAY_PRESSURE_DPR_BIAS
        : 0.85;
      const overlayPressureMul = (pressureMul < 0.999)
        ? Math.max(overlayMinMul, Math.min(1, pressureMul * overlayBias))
        : 1;
      const overlayDprRaw = deviceDpr * visualMul * overlayPressureMul * autoMul;
      const overlayScale = Math.min(
        paintScale,
        __dgCapDprForBackingStore(logicalWidth, logicalHeight, overlayDprRaw, __dgAdaptivePaintDpr)
      );

      const overlayQuantPx = (Number.isFinite(window.__DG_OVERLAY_DPR_QUANT_PX) && window.__DG_OVERLAY_DPR_QUANT_PX >= 8)
        ? (window.__DG_OVERLAY_DPR_QUANT_PX|0)
        : 32;
      const quantPx = (n) => {
        const v = Math.max(1, (n|0));
        const step = overlayQuantPx;
        return Math.max(step, Math.round(v / step) * step);
      };

      const overlayStableFrames = (Number.isFinite(window.__DG_OVERLAY_RESIZE_STABLE_FRAMES) && window.__DG_OVERLAY_RESIZE_STABLE_FRAMES >= 1)
        ? (window.__DG_OVERLAY_RESIZE_STABLE_FRAMES|0)
        : 6;

      const isOverlayLayer = (c) => (c === flashCanvas) || (c === flashBackCanvas) || (c === ghostCanvas) || (c === ghostBackCanvas) || (c === tutorialCanvas) || (c === tutorialBackCanvas) || (c === playheadCanvas);
      const isOverlayDormant = (c) => {
        try {
          if (!c || !c.style) return false;
          if (c.style.display !== 'none') return false;
          if (c === flashCanvas || c === flashBackCanvas) return !!panel.__dgFlashLayerEmpty;
          if (c === ghostCanvas || c === ghostBackCanvas) return !!panel.__dgGhostLayerEmpty;
          if (c === tutorialCanvas || c === tutorialBackCanvas) return !!panel.__dgTutorialLayerEmpty;
          if (c === playheadCanvas) return !!panel.__dgPlayheadLayerEmpty;
        } catch {}
        return false;
      };

      const styleCanvases = __dgListAllLayerEls();

      const cssWpx = `${logicalWidth}px`;
      const cssHpx = `${logicalHeight}px`;
      for (const canvas of styleCanvases) {
        if (canvas.style.width !== cssWpx) canvas.style.width = cssWpx;
        if (canvas.style.height !== cssHpx) canvas.style.height = cssHpx;
        // Keep authoritative CSS size cached for DPR math.
        canvas.__dgCssW = logicalWidth;
        canvas.__dgCssH = logicalHeight;
      }

      const allCanvases = __dgListManagedBackingEls();
      for (const canvas of allCanvases) {
        try {
          canvas.__dgCssW = logicalWidth;
          canvas.__dgCssH = logicalHeight;
        } catch {}
      }

      // NOTE: avoid per-canvas getContext() calls here (can be surprisingly costly).
      // We only reset contexts we already hold references to.
      let resizedAny = false;

      const isPaintLayer = (c) => (c === frontCanvas) || (c === backCanvas) || (c === paint);

      for (const canvas of allCanvases) {
        // If an overlay layer is dormant (display:none + marked empty), do not resize it.
        // Resizing dormant overlays during pressure changes can create big realloc spikes
        // even though the layer isn't contributing any pixels this frame.
        if (isOverlayLayer(canvas) && isOverlayDormant(canvas)) {
          continue;
        }

        const dpr = isPaintLayer(canvas)
          ? paintScale
          : isOverlayLayer(canvas)
            ? overlayScale
            : (auxScale * __dgComputeGestureStaticMul(zoomGestureMoving));
        let pxW = Math.max(1, Math.round(logicalWidth * dpr));
        let pxH = Math.max(1, Math.round(logicalHeight * dpr));

        // Backing-store bucketing for overlays: reduces resize thrash when DPR oscillates.
        if (isOverlayLayer(canvas)) {
          pxW = quantPx(pxW);
          pxH = quantPx(pxH);
        }

        // Cache DPR used for this backing store (useful for debug and for ctx reset helpers).
        try { canvas.__dgBackingDpr = dpr; } catch {}

        // Overlay DPR can oscillate under pressure; avoid resize thrash by requiring a few
        // consecutive frames requesting the same backing size before we actually resize.
        // (Large jumps apply immediately.)
        if (isOverlayLayer(canvas)) {
          const wantW = pxW;
          const wantH = pxH;
          const curW = canvas.width|0;
          const curH = canvas.height|0;
          const dw = Math.abs(curW - wantW);
          const dh = Math.abs(curH - wantH);
          const bigJump = (dw >= (overlayQuantPx * 2)) || (dh >= (overlayQuantPx * 2));
          if (!bigJump && (curW !== wantW || curH !== wantH)) {
            const pw = canvas.__dgPendingW|0;
            const ph = canvas.__dgPendingH|0;
            if (pw === wantW && ph === wantH) {
              canvas.__dgPendingN = (canvas.__dgPendingN|0) + 1;
            } else {
              canvas.__dgPendingW = wantW;
              canvas.__dgPendingH = wantH;
              canvas.__dgPendingN = 1;
            }
            if ((canvas.__dgPendingN|0) < overlayStableFrames) {
              continue;
            }
          }
          // Applying: clear pending so the next oscillation must restabilize.
          canvas.__dgPendingN = 0;
        } else {
          // Non-overlay layers: don't accumulate pending state.
          try { canvas.__dgPendingN = 0; } catch {}
        }

        if (canvas.width !== pxW) {
          canvas.width = pxW;
          resizedAny = true;
          try { window.__PERF_DG_BACKING_RESIZE_COUNT = (window.__PERF_DG_BACKING_RESIZE_COUNT || 0) + 1; } catch {}
          if (isOverlayLayer(canvas)) { try { window.__PERF_DG_OVERLAY_RESIZE_COUNT = (window.__PERF_DG_OVERLAY_RESIZE_COUNT || 0) + 1; } catch {} }
        }
        if (canvas.height !== pxH) {
          canvas.height = pxH;
          resizedAny = true;
          try { window.__PERF_DG_BACKING_RESIZE_COUNT = (window.__PERF_DG_BACKING_RESIZE_COUNT || 0) + 1; } catch {}
          if (isOverlayLayer(canvas)) { try { window.__PERF_DG_OVERLAY_RESIZE_COUNT = (window.__PERF_DG_OVERLAY_RESIZE_COUNT || 0) + 1; } catch {} }
        }
        // style width/height is already set via styleCanvases above
      }
      if (resizedAny) {
        // Resizing clears grid/nodes backing stores; force a static redraw.
        panel.__dgGridHasPainted = false;
        try { markStaticDirty('sync-back-resize'); } catch {}
        __dgForceFullDrawNext = true;
      }

      // Reset known contexts after resize
      try { R.resetCtx(frontCtx); } catch {}
      try { R.resetCtx(backCtx); } catch {}
      try { R.resetCtx(gridFrontCtx); } catch {}
      try { R.resetCtx(gridBackCtx); } catch {}
      try { R.resetCtx(nodesFrontCtx); } catch {}
      try { R.resetCtx(nodesBackCtx); } catch {}
      try { R.resetCtx(flashFrontCtx); } catch {}
      try { R.resetCtx(flashBackCtx); } catch {}
      try { R.resetCtx(ghostFrontCtx); } catch {}
      try { R.resetCtx(ghostBackCtx); } catch {}
      try { R.resetCtx(tutorialFrontCtx); } catch {}
      try { R.resetCtx(tutorialBackCtx); } catch {}
      try { R.resetCtx(playheadFrontCtx); } catch {}

      const copyCtx = (srcCtx, dstCtx) => {
        if (!srcCtx || !dstCtx) return;
        if (srcCtx === dstCtx || srcCtx.canvas === dstCtx.canvas) return;
        if (DG_SINGLE_CANVAS && usingBackBuffers && (srcCtx === gridFrontCtx || srcCtx === nodesFrontCtx)) return;
        const dw = dstCtx.canvas?.width || 0;
        const dh = dstCtx.canvas?.height || 0;
        if (!dw || !dh) return;
        R.withDeviceSpace(dstCtx, () => {
          dstCtx.clearRect(0, 0, dw, dh);
          dstCtx.drawImage(
            srcCtx.canvas,
            0, 0, srcCtx.canvas.width, srcCtx.canvas.height,
            0, 0, dw, dh
          );
        });
      };

      if (!DG_SINGLE_CANVAS) {
        copyCtx(pctx, backCtx);
        copyCtx(gridFrontCtx, gridBackCtx);
        copyCtx(nodesFrontCtx, nodesBackCtx);
        copyCtx(flashFrontCtx, flashBackCtx);
        copyCtx(ghostFrontCtx, ghostBackCtx);
        copyCtx(tutorialFrontCtx, tutorialBackCtx);
      } else if (!usingBackBuffers) {
        // In single-canvas mode, backCtx must remain *paint-only*.
        // Copying from frontCtx (which includes grid/overlays) makes the grid
        // get composited twice, causing the "grid gets darker when zooming/panning".
        // Keep back updated via stroke redraws instead.
        try {
          if (backCtx && Array.isArray(strokes) && strokes.length > 0) {
            clearAndRedrawFromStrokes(backCtx, 'sync-back-from-strokes');
          }
        } catch {}
      }
    } catch {}
  }

  function flushVisualBackBuffersToFront() {
    // IMPORTANT: These visual overlay canvases must match the paint backing-store DPR.
    // If we size them to raw cssW/cssH, they render in a different coordinate space
    // than the paint/particle surfaces, causing post-mount scale/offset glitches.
    const wCss = Math.max(1, Math.round(cssW));
    const hCss = Math.max(1, Math.round(cssH));
    const w = Math.max(1, Math.round(cssW * paintDpr));
    const h = Math.max(1, Math.round(cssH * paintDpr));
    FD.layerEvent('flushVisualBackBuffersToFront', {
      panelId: panel?.id || null,
      panelRef: panel,
      cssW: wCss,
      cssH: hCss,
      pxW: w,
      pxH: h,
      singleCanvas: !!DG_SINGLE_CANVAS,
      overlays: !!DG_SINGLE_CANVAS_OVERLAYS,
      usingBackBuffers,
    });

    // Legacy pin→restore flush (disabled by default; see DG_WRAP_SIZE_FLUSH).
    if (DG_WRAP_SIZE_FLUSH && pendingWrapSize) {
      try {
        wrap.style.width = `${pendingWrapSize.width}px`;
        wrap.style.height = `${pendingWrapSize.height}px`;
      } catch {}
      pendingWrapSize = null;
      requestAnimationFrame(() => {
        try {
          wrap.style.width = '100%';
          wrap.style.height = '100%';
        } catch {}
      });
    }
    // IMPORTANT:
    // Setting canvas.width/height clears its backing store. During gesture settle / commit we
    // may call this even when the size hasn't changed, which would incorrectly wipe overlays
    // like the ghost trail. Only resize when needed.
    //
    // Additionally, if the ghost layer is non-empty and we *must* resize, preserve pixels
    // across the resize so the trail does not "cut out".
    const __ghostNonEmpty = !!(panel && panel.__dgGhostLayerEmpty === false);
    const __dgResizeCanvasIfNeeded = (c, ww, hh, label, preservePixels = false) => {
      if (!c) return false;
      const curW = c.width || 0;
      const curH = c.height || 0;
      if (curW === ww && curH === hh) return false;

      let snap = null;
      if (preservePixels && curW > 0 && curH > 0) {
        try {
          snap = document.createElement('canvas');
          snap.width = curW;
          snap.height = curH;
          const sctx = snap.getContext('2d');
          if (sctx) sctx.drawImage(c, 0, 0);
        } catch {
          snap = null;
        }
      }

      // Resize (this clears).
      c.width = ww;
      c.height = hh;

      // Restore snapshot scaled into the new backing store.
      if (snap) {
        try {
          const ctx = c.getContext('2d');
          if (ctx) ctx.drawImage(snap, 0, 0, snap.width, snap.height, 0, 0, ww, hh);
        } catch {}
      }

      if (typeof window !== 'undefined' && window.__DG_GHOST_TRACE) {
        try {
          dgGhostTrace('canvas:resize', {
            label,
            fromW: curW, fromH: curH,
            toW: ww, toH: hh,
            ghostNonEmpty: __ghostNonEmpty,
            preserved: !!snap,
          });
        } catch {}
      }
      return true;
    };

    __dgResizeCanvasIfNeeded(grid,           w, h, 'grid:front',      false);
    __dgResizeCanvasIfNeeded(nodesCanvas,    w, h, 'nodes:front',     false);
    __dgResizeCanvasIfNeeded(flashCanvas,    w, h, 'flash:front',     false);
    __dgResizeCanvasIfNeeded(ghostCanvas,    w, h, 'ghost:front',     __ghostNonEmpty);
    __dgResizeCanvasIfNeeded(tutorialCanvas, w, h, 'tutorial:front',  false);

    // Keep back-buffer backing stores in sync too.
    // If back canvases keep stale backing sizes after refresh, overlays can appear
    // to "scale wrong" on subsequent sweeps (e.g. ghost second pass).
    if (gridBackCanvas) { __dgResizeCanvasIfNeeded(gridBackCanvas, w, h, 'grid:back', false); }
    if (nodesBackCanvas) { __dgResizeCanvasIfNeeded(nodesBackCanvas, w, h, 'nodes:back', false); }
    if (flashBackCanvas) { __dgResizeCanvasIfNeeded(flashBackCanvas, w, h, 'flash:back', false); }
    if (ghostBackCanvas) { __dgResizeCanvasIfNeeded(ghostBackCanvas, w, h, 'ghost:back', __ghostNonEmpty); }
    if (tutorialBackCanvas) { __dgResizeCanvasIfNeeded(tutorialBackCanvas, w, h, 'tutorial:back', false); }

    if (debugCanvas) { __dgResizeCanvasIfNeeded(debugCanvas, w, h, 'debug', false); }

    // Only flush back→front when back buffers are active.
    // When usingBackBuffers is false, the front canvases are the source of truth; flushing would
    // clear overlays (like the ghost trail) by copying from an empty/stale back buffer.
    if (!usingBackBuffers) return;

    if (gridFrontCtx && gridBackCanvas) {
      R.withDeviceSpace(gridFrontCtx, () => {
        const surface = gridFrontCtx.canvas;
        const width = surface?.width ?? w;
        const height = surface?.height ?? h;
        gridFrontCtx.clearRect(0, 0, width, height);
        gridFrontCtx.drawImage(
          gridBackCanvas,
          0, 0, gridBackCanvas.width, gridBackCanvas.height,
          0, 0, width, height
        );
      });
    }

    if (nodesFrontCtx && nodesBackCanvas) {
      R.withDeviceSpace(nodesFrontCtx, () => {
        const surface = nodesFrontCtx.canvas;
        const width = surface?.width ?? w;
        const height = surface?.height ?? h;
        nodesFrontCtx.clearRect(0, 0, width, height);
        nodesFrontCtx.drawImage(
          nodesBackCanvas,
          0, 0, nodesBackCanvas.width, nodesBackCanvas.height,
          0, 0, width, height
        );
      });
    }

    if (flashFrontCtx && flashBackCanvas) {
      R.withDeviceSpace(flashFrontCtx, () => {
        const surface = flashFrontCtx.canvas;
        const width = surface?.width ?? w;
        const height = surface?.height ?? h;
        flashFrontCtx.clearRect(0, 0, width, height);
        flashFrontCtx.drawImage(
          flashBackCanvas,
          0, 0, flashBackCanvas.width, flashBackCanvas.height,
          0, 0, width, height
        );
      });
    }

    if (ghostFrontCtx && ghostBackCanvas) {
      R.withDeviceSpace(ghostFrontCtx, () => {
        const surface = ghostFrontCtx.canvas;
        const width = surface?.width ?? w;
        const height = surface?.height ?? h;
        ghostFrontCtx.clearRect(0, 0, width, height);
        ghostFrontCtx.drawImage(
          ghostBackCanvas,
          0, 0, ghostBackCanvas.width, ghostBackCanvas.height,
          0, 0, width, height
        );
      });
    }

    if (tutorialFrontCtx && tutorialBackCanvas) {
      R.withDeviceSpace(tutorialFrontCtx, () => {
        const surface = tutorialFrontCtx.canvas;
        const width = surface?.width ?? w;
        const height = surface?.height ?? h;
        tutorialFrontCtx.clearRect(0, 0, width, height);
        tutorialFrontCtx.drawImage(
          tutorialBackCanvas,
          0, 0, tutorialBackCanvas.width, tutorialBackCanvas.height,
          0, 0, width, height
        );
      });
    }

  }

  function layout(force = false){
    return F.perfMarkSection('drawgrid.layout', () => {
    // IMPORTANT:
    // Do NOT force-wrap to a measured pixel size here.
    // The wrap must remain `100%` so it tracks the toy body without being "locked"
    // to a transient scaled value during zoom/drag settle (which causes RO:size resnaps
    // and mixed-scale layers).
    // Fast-path: if RO has already given us a stable size that matches our current
    // cssW/cssH, and layout isn't dirty, avoid *all* DOM reads in this frame.
    // This reduces forced style/layout work (often shows up as "nonScript" time).
    if (!force && !layoutSizeDirty) {
      const roW = __dgLayoutW || 0;
      const roH = __dgLayoutH || 0;
      if (roW > 0 && roH > 0 && Math.abs(roW - cssW) <= 1 && Math.abs(roH - cssH) <= 1) {
        return;
      }
    }
    // Keep the wrap responsive (CSS %) so it tracks the toy body through drag/zoom settle.
    // If we pin it to pixels here, later transforms can leave different internal canvases
    // rendering at different effective scales.
    wrap.style.width  = '100%';
    wrap.style.height = '100%';

    // Only measure BODY as a fallback when RO hasn't reported yet (or when forced).
    let bodyW = 0;
    let bodyH = 0;
    if (force || (__dgLayoutW <= 0 || __dgLayoutH <= 0)) {
      const bodySize = body ? measureCSSSize(body) : measureCSSSize(wrap);
      bodyW = bodySize.w;
      bodyH = bodySize.h;
    }


    // Measure transform-immune base...
    // Prefer RO-backed wrap size; if RO hasn't reported yet (common just after refresh),
    // fall back to BODY size (untransformed layout pixels). This avoids "self-locking" a 0-size
    // layout while still staying zoom/transform safe.
    let { w: baseW, h: baseH } = __dgGetStableWrapSize();
    if ((baseW <= 0 || baseH <= 0) && bodyW > 0 && bodyH > 0) {
      baseW = bodyW;
      baseH = bodyH;
    }
    // Back-buffer paths sometimes need a stable "last known" size for a commit flush.
    // Use the transform-immune base size (RO/body fallback), not a forced wrap px size.
    if (DG_WRAP_SIZE_FLUSH && usingBackBuffers) {
      pendingWrapSize = { width: baseW, height: baseH };
    } else {
      pendingWrapSize = null;
    }
    const { x: zoomX, y: zoomY } = getZoomScale(panel); // tracking only for logs/debug
    // IMPORTANT: During refresh/boot the RO-backed size can legitimately be 0 for a frame.
    // Do NOT clamp to 1 before checking; that would force a 1px backing-store resize and
    // effectively "lock in" a broken layout until something else triggers a resnap.
    const rawW = Math.round(baseW || 0);
    const rawH = Math.round(baseH || 0);
    if (rawW <= 0 || rawH <= 0) {
      dgRefreshTrace('layout:bail zero size', { force, newW: rawW, newH: rawH, roW: __dgLayoutW, roH: __dgLayoutH });
      requestAnimationFrame(() => resnapAndRedraw(force));
      return;
    }

    const newW = Math.max(1, rawW);
    const newH = Math.max(1, rawH);
    try {
      // Avoid forced-layout DOM reads unless we're tracing size or actively zooming.
      // (getBoundingClientRect + getComputedStyle can trigger synchronous layout.)
      const wantLayoutTrace = (() => { try { return !!window.__DG_REFRESH_SIZE_TRACE; } catch {} return false; })();
      // Only read DOM synchronously when we truly need it (gesture/forced paths).
      // Size trace should not force expensive reads every frame; it is throttled + gated.
      const shouldReadDom = force || zoomGestureActive;

      let rect = null;
      let toyScale = null;

      if (shouldReadDom) {
        rect = panel?.getBoundingClientRect?.();
        const toyScaleRaw = panel ? getComputedStyle(panel).getPropertyValue('--toy-scale') : '';
        const ts = parseFloat(toyScaleRaw);
        toyScale = Number.isFinite(ts) ? ts : null;
        // Cache last known toyScale for fast paths (used by backing DPR decisions).
        try { panel.__dgLastToyScale = toyScale ?? (panel.__dgLastToyScale ?? 1); } catch {}
      } else {
        const ts = panel?.__dgLastToyScale;
        toyScale = Number.isFinite(ts) ? ts : null;
      }

      if (wantLayoutTrace && dgSizeTraceCanLog()) {
        // Only gather DOM/layout reads when a trace sample will actually be recorded.
        if (!rect) rect = panel?.getBoundingClientRect?.();
        if (toyScale === null || toyScale === undefined) {
          const toyScaleRaw = panel ? getComputedStyle(panel).getPropertyValue('--toy-scale') : '';
          const ts = parseFloat(toyScaleRaw);
          toyScale = Number.isFinite(ts) ? ts : null;
          try { panel.__dgLastToyScale = toyScale ?? (panel.__dgLastToyScale ?? 1); } catch {}
        }
        dgSizeTrace('layout:measure', {
          force,
          bodyW,
          bodyH,
          baseW,
          baseH,
          newW,
          newH,
          wrapClientW: wrap?.clientWidth || 0,
          wrapClientH: wrap?.clientHeight || 0,
          panelRectW: rect?.width || 0,
          panelRectH: rect?.height || 0,
          toyScale,
          zoomMode,
          zoomGestureActive,
          overview: !!__overviewActive,
        });
      }
    } catch {}

      if ((!zoomGestureActive && (force || Math.abs(newW - cssW) > 1 || Math.abs(newH - cssH) > 1)) || (force && zoomGestureActive)) {
        const oldW = cssW;
        const oldH = cssH;
        dgSizeTrace('layout:apply', {
          force,
          oldW,
          oldH,
          newW,
          newH,
          zoomMode,
          zoomGestureActive,
          overview: !!__overviewActive,
        });
        // Snapshot current paint to preserve drawn content across resize.
        // IMPORTANT: snapshot the ACTIVE paint surface (front/back), not just `paint`,
        // otherwise wheel-zoom / overview can wipe the user's line.
        let paintSnapshot = null;
        let paintSnapshotDpr = null;
        try {
          const snapSrc = (typeof getActivePaintCanvas === 'function' ? getActivePaintCanvas() : null) || paint;
          if (snapSrc && snapSrc.width > 0 && snapSrc.height > 0) {
            paintSnapshot = document.createElement('canvas');
            paintSnapshot.width = snapSrc.width;
            paintSnapshot.height = snapSrc.height;
            paintSnapshot.getContext('2d')?.drawImage(snapSrc, 0, 0);
            paintSnapshotDpr = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : null;
          }
        } catch {}

      cssW = newW;
      cssH = newH;
      progressMeasureW = cssW;
      progressMeasureH = cssH;
      if (dgViewport?.refreshSize) dgViewport.refreshSize({ snap: true });
      // IMPORTANT:
      // Do NOT use __dgAdaptivePaintDpr as a "fallback" during generic layout sizing.
      // That causes delayed backing-store DPR changes (RO/ensureSize/layout) which show up
      // as staggered "scale jumps" after zoom/pan settles.
      const __layoutDpr =
        (Number.isFinite(paintDpr) && paintDpr > 0)
          ? paintDpr
          : (Number.isFinite(window?.devicePixelRatio) ? window.devicePixelRatio : 1);
      resizeSurfacesFor(cssW, cssH, __layoutDpr, 'layout:paintDpr');
      if (tutorialHighlightMode !== 'none') {
        // Only render highlight when actually enabled; no hidden DPR "fallback" resizes.
        renderTutorialHighlight();
      }

      // Layout changes invalidate static layers (grid geometry / node positions).
      try { markStaticDirty('layout'); } catch {}
      __dgForceFullDrawNext = true;


      lastZoomX = zoomX;
      lastZoomY = zoomY;

      // Scale stroke geometry ONLY when this is a “real” panel resize.
      // During zoom/overview transitions we must NOT mutate stroke points,
      // or lines will drift/vanish permanently.
      const recentlyHydrated =
        __hydrationJustApplied ||
        (DG_HYDRATE.hydratedAt && (dgNow() - DG_HYDRATE.hydratedAt < 1200));
      const okToScaleStrokeGeometry =
        !zoomGestureActive &&
        zoomMode !== 'gesturing' &&
        !__zoomActive &&
        !__overviewActive &&
        !recentlyHydrated;

      if (okToScaleStrokeGeometry && strokes.length > 0 && oldW > 4 && oldH > 4 && !isRestoring) {
        const scaleX = cssW / oldW;
        const scaleY = cssH / oldH;
        if (scaleX !== 1 || scaleY !== 1) {
          for (const s of strokes) {
            if (Array.isArray(s?.__ptsN)) continue;
            s.pts = s.pts.map(p => ({ x: p.x * scaleX, y: p.y * scaleY }));
          }
        }
      } else if (!okToScaleStrokeGeometry && strokes.length > 0 && oldW > 0 && oldH > 0) {
        // Optional debug:
        // dgTraceLog?.('[DG][layout] skip stroke scaling (zoom/overview)', { zoomGestureActive, zoomMode, __zoomActive, __overviewActive, oldW, oldH, cssW, cssH });
      }

      const { w: logicalW, h: logicalH } = __dgGetStableWrapSize();
      gridAreaLogical.w = logicalW;
      gridAreaLogical.h = logicalH;

      const minGridArea = 20; // px floor so it never fully collapses
      // Compute proportional margin in *logical* CSS px.
      // IMPORTANT: this must NOT depend on board zoom / transforms. If we use any
      // zoom-derived value here (e.g. a map scale), the gridArea changes during
      // zoom/refresh boot and strokes will appear to “re-scale” incorrectly.
      const safeScale = Math.min(logicalW, logicalH);
      const dynamicSafeArea = Math.max(
        12,                               // lower bound so lines don't hug edges on tiny panels
        Math.round(SAFE_AREA_FRACTION * safeScale)
      );

      gridArea = {
        x: dynamicSafeArea,
        y: dynamicSafeArea,
        w: Math.max(minGridArea, logicalW - 2 * dynamicSafeArea),
        h: Math.max(minGridArea, logicalH - 2 * dynamicSafeArea),
      };
    
      // All calculations are now relative to the gridArea
      // Remove the top cube row; use a minimal padding
      topPad = 0;
      cw = gridArea.w / cols;
      ch = (gridArea.h - topPad) / rows;
      // Record last-known-good sizing so transient "not ready" moments don't nuke the grid.
      if (__dgGridReady()) {
        __dgLastGoodGridArea = { ...gridArea };
        __dgLastGoodCw = cw;
        __dgLastGoodCh = ch;
      }
      if (__dgGridReady()) {
        if (__dgGridCache) __dgGridCache.key = '';
        if (__dgNodesCache) { __dgNodesCache.key = ''; __dgNodesCache.nodeCoords = null; }
        if (__dgBlocksCache) __dgBlocksCache.key = '';
        try {
          if (gridBackCtx?.canvas) R.withDeviceSpace(gridBackCtx, () => gridBackCtx.clearRect(0, 0, gridBackCtx.canvas.width, gridBackCtx.canvas.height));
          if (nodesBackCtx?.canvas) R.withDeviceSpace(nodesBackCtx, () => nodesBackCtx.clearRect(0, 0, nodesBackCtx.canvas.width, nodesBackCtx.canvas.height));
        } catch {}
        panel.__dgGridHasPainted = false;
        try { markStaticDirty('layout-clear'); } catch {}
        __dgForceFullDrawNext = true;
      }
      const layoutKey = `${Math.round(cssW)}x${Math.round(cssH)}:${Math.round(gridArea.w)}x${Math.round(gridArea.h)}`;
      if (layoutKey === __dgLastLayoutKey) __dgLayoutStableFrames++;
      else {
        __dgLayoutStableFrames = 0;
        __dgLastLayoutKey = layoutKey;
        if (DG_LAYOUT_DEBUG) {
          try {
            dgLogLine('layout-change', {
              panelId: panel.id || null,
              cssW,
              cssH,
              gridW: gridArea.w,
              gridH: gridArea.h,
              zoomGestureActive,
              zoomMode,
              overview: !!__overviewActive,
              recentlyHydrated,
            });
            dgDumpCanvasMetrics(panel, 'layout-change', frontCanvas, wrap, body);
          } catch {}
        }
      }
      // Reproject strokes from normalized coords once layout is stable.
      if (strokes.length > 0) {
        const gh = Math.max(1, gridArea.h - topPad);
        let reprojected = false;
        for (const s of strokes) {
          if (!Array.isArray(s?.__ptsN)) continue;
          reprojected = true;
          s.pts = s.__ptsN.map(np => ({
            x: gridArea.x + (Number(np?.nx) || 0) * gridArea.w,
            y: (gridArea.y + topPad) + (Number(np?.ny) || 0) * gh,
          }));
        }
        if (reprojected) {
          if (DG_LAYOUT_DEBUG) {
            try {
              dgLogLine('layout-reproject', {
                panelId: panel.id || null,
                layoutKey,
              });
              dgDumpCanvasMetrics(panel, 'layout-reproject', frontCanvas, wrap, body);
            } catch {}
          }
          try { clearAndRedrawFromStrokes(null, 'layout-reproject'); } catch {}
        }
        __dgHydrationPendingRedraw = false;
        hydrationState.retryCount = 0;
      }

      // === DRAW label responsive sizing tied to toy, not viewport ===
      updateDrawLabelLayout(drawLabelState, { gridAreaLogical, wrap });


      drawGrid();
      // Restore paint snapshot scaled to new size (preserves erasures) — but never during an active stroke
      // Skip snapshot restore when hydrated strokes are present; redraw from data instead.
      const hasHydratedStroke = strokes.some(s => Array.isArray(s?.__ptsN));
      if (paintSnapshot && !hasHydratedStroke && zoomCommitPhase !== 'recompute') {
        try {
          if (!drawing) {
            // When using back buffers, keep BOTH in sync so front/back swaps don't "lose" the line.
            updatePaintBackingStores({ target: usingBackBuffers ? 'both' : 'both' });
            const dprMismatch =
              Number.isFinite(paintSnapshotDpr) &&
              Number.isFinite(paintDpr) &&
              Math.abs(paintSnapshotDpr - paintDpr) > 1e-3;
            const hasStrokeData = Array.isArray(strokes) && strokes.length > 0;
            const skipByCount = __dgSkipPaintSnapshotCount > 0 && hasStrokeData;
            const skipSnapshot = skipByCount || (dprMismatch && hasStrokeData);
            if (skipByCount) __dgSkipPaintSnapshotCount = Math.max(0, (__dgSkipPaintSnapshotCount || 0) - 1);
            if (skipSnapshot) {
              // Avoid scaling old pixels across DPR changes; redraw from strokes for correct scale.
              try {
              if (typeof window !== 'undefined' && window.__DG_ZOOM_COMMIT_TRACE) {
                const payload = {
                  panelId: panel?.id || null,
                  source: 'layout',
                  skipByCount,
                  dprMismatch,
                  paintSnapshotDpr,
                  paintDpr,
                };
                console.log('[DG][paint] snapshot-skip', JSON.stringify(payload));
              }
            } catch {}
            __dgPaintDebugLog('snapshot-skip', {
              source: 'layout',
              skipByCount,
              dprMismatch,
              paintSnapshotDpr,
            });
              try { clearAndRedrawFromStrokes(null, 'paintSnapshot-skip:dpr'); } catch {}
            } else {
              const ctx = (typeof getActivePaintCtx === 'function' ? getActivePaintCtx() : null) || pctx;
              if (ctx) {
                resetPaintBlend?.(ctx);
                R.resetCtx(ctx);
                R.withLogicalSpace(ctx, () => {
                  ctx.clearRect(0, 0, cssW, cssH);
                  ctx.drawImage(
                    paintSnapshot,
                    0, 0, paintSnapshot.width, paintSnapshot.height,
                    0, 0, cssW, cssH
                  );
                });
                try {
                  if (typeof window !== 'undefined' && window.__DG_ZOOM_COMMIT_TRACE) {
                    const payload = {
                      panelId: panel?.id || null,
                      source: 'layout',
                      paintSnapshotDpr,
                      paintDpr,
                    };
                    console.log('[DG][paint] snapshot-restore', JSON.stringify(payload));
                  }
                } catch {}
                __dgPaintDebugLog('snapshot-restore', {
                  source: 'layout',
                  paintSnapshotDpr,
                });
              }
            }
            // If we have explicit front/back contexts, mirror the snapshot into both.
            try {
              if (usingBackBuffers && typeof getPaintCtxFront === 'function' && typeof getPaintCtxBack === 'function') {
                const f = getPaintCtxFront();
                const b = getPaintCtxBack();
                for (const c of [f, b]) {
                  if (!c) continue;
                  if (skipSnapshot) continue;
                  resetPaintBlend?.(c);
                  R.resetCtx(c);
                  R.withLogicalSpace(c, () => {
                    c.clearRect(0, 0, cssW, cssH);
                    c.drawImage(
                      paintSnapshot,
                      0, 0, paintSnapshot.width, paintSnapshot.height,
                      0, 0, cssW, cssH
                    );
                  });
                }
              }
            } catch {}
          }
        } catch {}
      }
      if (DG_SINGLE_CANVAS) {
        __dgMarkSingleCanvasDirty(panel);
        try { compositeSingleCanvas(); } catch {}
      }
      // Clear other content canvases. The caller is responsible for redrawing nodes/overlay.
      // Defer overlay clears if we are in/near a gesture commit; renderLoop will clear safely.
      const __now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if ((HY.inCommitWindow(__now) || __dgStableFramesAfterCommit < 2) && !__dgForceOverlayClearNext) {
        __dgNeedsUIRefresh = true;
      } else {
        __dgForceOverlayClearNext = false;
        R.clearCanvas(nctx);
        const flashTarget = getActiveFlashCanvas();
        const __flashDpr = __dgGetCanvasDprFromCss(flashTarget, cssW, paintDpr);
        R.resetCtx(fctx);
        __dgWithLogicalSpaceDpr(R, fctx, __flashDpr, () => {
          const { x, y, w, h } = R.getOverlayClearRect({
            canvas: flashTarget,
            pad: R.getOverlayClearPad(),
            allowFull: !!panel.__dgFlashOverlayOutOfGrid,
            gridArea,
          });
          fctx.clearRect(x, y, w, h);
        });
        markFlashLayerCleared();
        // Ghost trail should NEVER be cleared by gesture settle / re-snap.
        // Only clear it when the ghost backing store has actually changed (resize / DPR change)
        // or when explicitly stopped via stopGhostGuide({ immediate: true }).
        const ghostTarget = getActiveGhostCanvas();
        const __ghostDpr = __dgGetCanvasDprFromCss(ghostTarget, cssW, paintDpr);
        const __ghostKey = `${cssW}x${cssH}@${__ghostDpr}`;
        const __prevGhostKey = panel.__dgGhostClearKey || null;
        const __shouldClearGhost = (__prevGhostKey !== __ghostKey);
        if (__shouldClearGhost) {
          panel.__dgGhostClearKey = __ghostKey;
          R.resetCtx(ghostCtx);
          __dgWithLogicalSpaceDpr(R, ghostCtx, __ghostDpr, () => {
            const { x, y, w, h } = R.getOverlayClearRect({
              canvas: ghostTarget,
              pad: R.getOverlayClearPad() * 1.2,
              gridArea,
            });
            ghostCtx.clearRect(x, y, w, h);
          });
          markGhostLayerCleared();
        } else {
          // Preserve existing trail.
          if (typeof window !== 'undefined' && window.__DG_GHOST_TRACE) {
            dgGhostTrace('clear:skip (preserve-trail)', {
              id: panel?.id || null,
              reason: 'layout:overlay-clear',
              key: __ghostKey,
            });
          }
        }
      }
    }
  });
  }

  function flashColumn(col) {
    // Save current grid state to restore after flash
    const gridSurface = usingBackBuffers ? gridBackCanvas : grid;
    const currentGridData = gctx.getImageData(0, 0, gridSurface.width, gridSurface.height);

    const x = gridArea.x + col * cw;
    const w = cw;
    try {
      const xToy = x + w * 0.5;
      FF.pushHeaderSweepAt(xToy, { lineWidthPx: w });
    } catch {}
    gctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    gctx.fillRect(x, gridArea.y, w, gridArea.h);

    setTimeout(() => {
        // A fade-out effect for a "fancier" feel
        let opacity = 0.6;
        const fade = setInterval(() => {
            gctx.putImageData(currentGridData, 0, 0); // Restore grid
            opacity -= 0.1;
            if (opacity <= 0) {
                clearInterval(fade);
                drawGrid(); // Final clean redraw
            } else {
                gctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
                gctx.fillRect(x, gridArea.y, w, gridArea.h);
            }
        }, 30);
    }, 100); // Start fade after a short hold
  }

  let __dgGridPath = null;
  let __dgGridPathKey = '';
  let __dgGridCache = { canvas: null, ctx: null, key: '' };
  function buildGridPath(noteGridY) {
    const path = new Path2D();
    // Verticals (including outer lines)
    for (let i = 0; i <= cols; i++) {
      const x = crisp(gridArea.x + i * cw);
      path.moveTo(x, noteGridY);
      path.lineTo(x, gridArea.y + gridArea.h);
    }
    // Horizontals (including outer lines)
    for (let j = 0; j <= rows; j++) {
      const y = crisp(noteGridY + j * ch);
      path.moveTo(gridArea.x, y);
      path.lineTo(gridArea.x + gridArea.w, y);
    }
    return path;
  }

  function renderGridTo(ctx, width, height, noteGridY, noteGridH, hasTwoLines) {
    if (!ctx) return;
    R.resetCtx(ctx);
    R.withLogicalSpace(ctx, () => {
      ctx.clearRect(0, 0, width, height);

      // 1. Draw the note grid area below the top padding
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(gridArea.x, noteGridY, gridArea.w, noteGridH);

      // 2. Subtle fill for active columns
      if (currentMap) {
        for (let c = 0; c < cols; c++) {
          if (currentMap.nodes[c]?.size > 0 && currentMap.active[c]) {
            let fillOpacity = 0.1;
            if (hasTwoLines) {
              const totalNodes = currentMap.nodes[c].size;
              const disabledNodes = currentMap.disabled[c]?.size || 0;
              const activeNodes = totalNodes - disabledNodes;
              if (activeNodes === 1) fillOpacity = 0.05;
            }
            ctx.fillStyle = `rgba(143, 168, 255, ${fillOpacity})`;
            const x = gridArea.x + c * cw;
            ctx.fillRect(x, noteGridY, cw, noteGridH);
          }
        }
      }

      // 3. Draw all grid lines with the base color
      const cellW = cw || 24;
      const cellH = ch || 24;
      const cell = Math.max(4, Math.min(cellW, cellH));
      const gridLineWidthPx = Math.max(1, Math.min(cell * 0.03, 8));
      ctx.strokeStyle = 'rgba(143, 168, 255, 0.35)';
      ctx.lineWidth = gridLineWidthPx;
      if (typeof Path2D !== 'undefined') {
        const key = [
          gridArea.x, gridArea.y, gridArea.w, gridArea.h,
          rows, cols, cw, ch, topPad, noteGridY,
        ].join('|');
        if (key !== __dgGridPathKey || !__dgGridPath) {
          __dgGridPath = buildGridPath(noteGridY);
          __dgGridPathKey = key;
        }
        ctx.stroke(__dgGridPath);
      } else {
        // Verticals (including outer lines)
        for (let i = 0; i <= cols; i++) {
          const x = crisp(gridArea.x + i * cw);
          ctx.beginPath();
          ctx.moveTo(x, noteGridY);
          ctx.lineTo(x, gridArea.y + gridArea.h);
          ctx.stroke();
        }
        // Horizontals (including outer lines)
        for (let j = 0; j <= rows; j++) {
          const y = crisp(noteGridY + j * ch);
          ctx.beginPath();
          ctx.moveTo(gridArea.x, y);
          ctx.lineTo(gridArea.x + gridArea.w, y);
          ctx.stroke();
        }
      }

      // 4. Highlight active columns by thickening their vertical lines
      if (currentMap) {
        ctx.strokeStyle = 'rgba(143, 168, 255, 0.7)';
        for (let c = 0; c < cols; c++) {
          if (currentMap.nodes[c]?.size > 0 && currentMap.active[c]) {
            const x1 = crisp(gridArea.x + c * cw);
            ctx.beginPath();
            ctx.moveTo(x1, noteGridY);
            ctx.lineTo(x1, gridArea.y + gridArea.h);
            ctx.stroke();

            const x2 = crisp(gridArea.x + (c + 1) * cw);
            ctx.beginPath();
            ctx.moveTo(x2, noteGridY);
            ctx.lineTo(x2, gridArea.y + gridArea.h);
            ctx.stroke();
          }
        }
      }
    });
  }

  function drawGrid(){
    if (typeof window !== 'undefined' && window.__PERF_DG_DISABLE_GRID) {
      panel.__dgGridHasPainted = false;
      return;
    }
    if (typeof window !== 'undefined' && window.__DG_LAYER_SIZE_ENFORCE) {
      try { __dgEnsureLayerSizes('drawGrid'); } catch {}
    }

    // ------------------------------------------------------------
    // Bootstrap sizing:
    // In perf runs we still see drawGrid:skip-not-ready with cssW/cssH=0.
    // That means we're drawing before we have any stable layout size.
    // Try *once* per panel to recover a stable size before taking the "not ready" path.
    // ------------------------------------------------------------
    if ((cssW <= 1 || cssH <= 1) && !panel.__dgBootstrapSizeTried) {
      panel.__dgBootstrapSizeTried = true;
      try {
        // Prefer RO-derived stable size (zoom-safe).
        const stable = (typeof __dgGetStableWrapSize === 'function') ? __dgGetStableWrapSize() : { w: 0, h: 0 };
        if (stable && stable.w > 1 && stable.h > 1) {
          cssW = stable.w;
          cssH = stable.h;
        } else {
          // Force one layout pass. This is guarded so it can't hammer every frame.
          try { layout(true); } catch {}
          const stable2 = (typeof __dgGetStableWrapSize === 'function') ? __dgGetStableWrapSize() : { w: 0, h: 0 };
          if (stable2 && stable2.w > 1 && stable2.h > 1) {
            cssW = stable2.w;
            cssH = stable2.h;
          }
        }
      } catch {}
    }

    if (!__dgGridReady()) {
      // Transient layout hiccup protection:
      // If we had a valid grid recently, reuse it for this frame instead of bailing.
      // This prevents repeated "skip-not-ready" churn which can correlate with large nonScript spikes.
      if (__dgLastGoodGridArea && __dgLastGoodCw > 0 && __dgLastGoodCh > 0) {
        gridArea = { ...__dgLastGoodGridArea };
        cw = __dgLastGoodCw;
        ch = __dgLastGoodCh;
        dgSizeTrace('drawGrid:use-last-good', {
          cssW,
          cssH,
          gridArea: gridArea ? { ...gridArea } : null,
          cw,
          ch,
        });
      } else {
        // If we don't have a last-known-good grid yet (e.g. brand new panel), still try a safe fallback
        // based on CSS size so we avoid repeated "skip-not-ready" churn.
        if (cssW >= 2 && cssH >= 2) {
          gridArea = { x: 0, y: 0, w: cssW, h: cssH };
          cw = gridArea.w / cols;
          ch = (gridArea.h - topPad) / rows;
          dgSizeTrace('drawGrid:fallback-not-ready', {
            cssW,
            cssH,
            gridArea: { ...gridArea },
            cw,
            ch,
          });
        } else {
          // De-spam: only log skip-not-ready once per panel instance.
          if (!panel.__dgLoggedSkipNotReady) {
            panel.__dgLoggedSkipNotReady = true;
            dgGridAlphaLog('drawGrid:skip-not-ready', gctx, {
              gridArea: gridArea ? { ...gridArea } : null,
              cw,
              ch,
              cssW,
              cssH,
            });
            dgSizeTrace('drawGrid:skip-not-ready', {
              cssW,
              cssH,
              gridArea: gridArea ? { ...gridArea } : null,
              cw,
              ch,
            });
          }
          panel.__dgGridHasPainted = false;

          // If we hit this state, we want to *promptly* recover as soon as RO reports / layout stabilizes,
          // but without hammering resnap every frame.
          if (!panel.__dgResnapQueuedNotReady) {
            panel.__dgResnapQueuedNotReady = true;
            requestAnimationFrame(() => {
              if (!panel.isConnected) return;
              panel.__dgResnapQueuedNotReady = false;
              // Force layout here because RO may be pending and we want to rebuild canvases ASAP.
              try { resnapAndRedraw(true, { preservePaintIfNoStrokes: true }); } catch {}
            });
          }

          return;
        }
      }
    }
    dgGridAlphaLog('drawGrid:begin', gctx, {
      cacheKey: __dgGridCache?.key || null,
    });
    dgSizeTrace('drawGrid:begin', {
      cssW,
      cssH,
      gridArea: gridArea ? { ...gridArea } : null,
      cw,
      ch,
      cacheKey: __dgGridCache?.key || null,
    });
    FD.layerTrace('drawGrid:enter', {
      panelId: panel?.id || null,
      usingBackBuffers,
      gctxRole: gctx?.canvas?.getAttribute?.('data-role') || null,
      gctxSize: gctx?.canvas ? { w: gctx.canvas.width, h: gctx.canvas.height } : null,
    });
    let __dgProfileStart = null;
    if (DG_PROFILE && typeof performance !== 'undefined' && performance.now) {
      __dgProfileStart = performance.now();
    }
    const __perfOn = !!(window.__PerfFrameProf && typeof performance !== 'undefined' && performance.now);

    const surface = gctx.canvas;
    const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
    const width = cssW || (surface?.width ?? 0) / scale;
    const height = cssH || (surface?.height ?? 0) / scale;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 1 || height <= 1) {
      panel.__dgGridHasPainted = false;
      return;
    }
    if (!__dgProbeDidFirstDraw && typeof window !== 'undefined' && window.__DG_PROBE_ON !== false) {
      __dgProbeDidFirstDraw = true;
      try { __dgProbeDump('first-draw:grid'); } catch {}
    }
    const noteGridY = gridArea.y + topPad;
    const noteGridH = gridArea.h - topPad;
    const hasTwoLines = strokes.some(s => s.generatorId === 2);

    let __dgHash = 2166136261;
    const __dgHashStep = (h, v) => {
      const n = (Number.isFinite(v) ? v : 0) | 0;
      return ((h ^ n) * 16777619) >>> 0;
    };
    __dgHash = __dgHashStep(__dgHash, rows);
    __dgHash = __dgHashStep(__dgHash, cols);
    __dgHash = __dgHashStep(__dgHash, Math.round(cw * 1000));
    __dgHash = __dgHashStep(__dgHash, Math.round(ch * 1000));
    __dgHash = __dgHashStep(__dgHash, Math.round(topPad * 1000));
    __dgHash = __dgHashStep(__dgHash, Math.round((gridArea?.x || 0) * 1000));
    __dgHash = __dgHashStep(__dgHash, Math.round((gridArea?.y || 0) * 1000));
    __dgHash = __dgHashStep(__dgHash, Math.round((gridArea?.w || 0) * 1000));
    __dgHash = __dgHashStep(__dgHash, Math.round((gridArea?.h || 0) * 1000));
    __dgHash = __dgHashStep(__dgHash, hasTwoLines ? 1 : 0);
    if (currentMap) {
      for (let c = 0; c < cols; c++) {
        const nodes = currentMap.nodes[c];
        const totalNodes = nodes ? nodes.size : 0;
        const disabledNodes = currentMap.disabled[c]?.size || 0;
        const active = currentMap.active[c] ? 1 : 0;
        __dgHash = __dgHashStep(__dgHash, totalNodes);
        __dgHash = __dgHashStep(__dgHash, disabledNodes);
        __dgHash = __dgHashStep(__dgHash, active);
      }
    }

    const cache = __dgGridCache;
    const surfacePxW = surface?.width ?? gctx.canvas?.width ?? 0;
    const surfacePxH = surface?.height ?? gctx.canvas?.height ?? 0;
    if (!cache.canvas) cache.canvas = document.createElement('canvas');
    if (cache.canvas.width !== surfacePxW) cache.canvas.width = surfacePxW;
    if (cache.canvas.height !== surfacePxH) cache.canvas.height = surfacePxH;
    if (!cache.ctx) cache.ctx = cache.canvas.getContext('2d');
    const cacheKey = `${__dgHash}|${surfacePxW}x${surfacePxH}`;

    if (cache.key !== cacheKey) {
      FD.layerDebugLog('grid-cache-miss', {
        panelId: panel?.id || null,
        cacheKey,
        surfacePxW,
        surfacePxH,
        cssW,
        cssH,
        gridArea: gridArea ? { ...gridArea } : null,
      });
      const __cacheStart = __perfOn ? performance.now() : 0;
      renderGridTo(cache.ctx, width, height, noteGridY, noteGridH, hasTwoLines);
      if (__perfOn && __cacheStart) {
        try { window.__PerfFrameProf?.mark?.('drawgrid.grid.cache', performance.now() - __cacheStart); } catch {}
      }
      cache.key = cacheKey;
    }

    R.resetCtx(gctx);
    const __blitStart = __perfOn ? performance.now() : 0;
    R.withDeviceSpace(gctx, () => {
      gctx.clearRect(0, 0, surfacePxW, surfacePxH);
      if (cache.canvas) gctx.drawImage(cache.canvas, 0, 0, surfacePxW, surfacePxH);
    });
    dgGridAlphaLog('drawGrid:blit', gctx, {
      cacheKey,
      cacheHit: cache.key === cacheKey,
    });
    if (DG_SINGLE_CANVAS && gridFrontCtx?.canvas) {
      const frontSurface = gridFrontCtx.canvas;
      R.withDeviceSpace(gridFrontCtx, () => {
        gridFrontCtx.clearRect(0, 0, frontSurface.width, frontSurface.height);
      });
    }
    if (__perfOn && __blitStart) {
      try { window.__PerfFrameProf?.mark?.('drawgrid.grid.blit', performance.now() - __blitStart); } catch {}
    }

    if (__dgProfileStart !== null) {
      const dt = performance.now() - __dgProfileStart;
      F.dgProfileSample(dt);
    }
    panel.__dgGridReadyForNodes = true;
    panel.__dgGridHasPainted = true;
    __dgMarkSingleCanvasDirty(panel);
    dgGridAlphaLog('drawGrid:end', gctx);
    dgSizeTrace('drawGrid:end', {
      cssW,
      cssH,
      gridArea: gridArea ? { ...gridArea } : null,
      cw,
      ch,
      cacheKey: cache.key || null,
    });
    FD.layerTrace('drawGrid:exit', {
      panelId: panel?.id || null,
      usingBackBuffers,
      gctxRole: gctx?.canvas?.getAttribute?.('data-role') || null,
    });
  }

  function crisp(v) {
    return Math.round(v) + 0.5;
  }

  function getStrokePath(stroke) {
    if (!stroke || !stroke.pts || stroke.pts.length < 2) return null;
    if (typeof Path2D === 'undefined') return null;
    const pts = stroke.pts;
    const last = pts[pts.length - 1];
    const needsRebuild =
      !stroke.__overlayPath ||
      stroke.__overlayPathPts !== pts ||
      stroke.__overlayPathLen !== pts.length ||
      stroke.__overlayPathLastX !== last.x ||
      stroke.__overlayPathLastY !== last.y;
    if (needsRebuild) {
      const path = new Path2D();
      path.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        path.lineTo(pts[i].x, pts[i].y);
      }
      stroke.__overlayPath = path;
      stroke.__overlayPathPts = pts;
      stroke.__overlayPathLen = pts.length;
      stroke.__overlayPathLastX = last.x;
      stroke.__overlayPathLastY = last.y;
    }
    return stroke.__overlayPath;
  }

  // A helper to draw a complete stroke from a point array.
  // This is used to create a clean image for snapping.
  function drawFullStroke(ctx, stroke, opts = {}) {
    if (!stroke || !stroke.pts || stroke.pts.length < 1) return;
    if (DG_SINGLE_CANVAS && usingBackBuffers && ctx?.canvas?.getAttribute?.('data-role') === 'drawgrid-paint' && backCtx && ctx !== backCtx) {
      ctx = backCtx;
    }
    try {
      if (typeof window !== 'undefined' && window.__DG_RANDOM_TRACE_VERBOSE && stroke?.generatorId != null) {
        const isOverlay = (ctx === fctx) || !!ctx.__dgIsOverlay;
        const flag = isOverlay ? '__dgRandomOverlayLogged' : '__dgRandomPaintLogged';
        if (!stroke[flag]) {
          stroke[flag] = true;
          const canvas = ctx?.canvas || null;
          const dpr = __dgGetCanvasDprFromCss(canvas, cssW, paintDpr);
          const payload = {
            panelId: panel?.id || null,
            layer: isOverlay ? 'overlay' : 'paint',
            generatorId: stroke.generatorId,
            cssW,
            cssH,
            paintDpr,
            dpr,
            canvasRole: canvas?.getAttribute?.('data-role') || null,
            canvasSize: canvas ? { w: canvas.width, h: canvas.height, cssW: canvas.style?.width || null, cssH: canvas.style?.height || null } : null,
            logicalActive: !!ctx.__dgLogicalSpaceActive,
            transform: (() => {
              try {
                const t = (typeof ctx.getTransform === 'function') ? ctx.getTransform() : null;
                return t ? { a: t.a, d: t.d, e: t.e, f: t.f } : null;
              } catch {
                return null;
              }
            })(),
          };
          console.log('[DG][random][stroke]', JSON.stringify(payload));
        }
      }
    } catch {}
    const color = stroke.color || STROKE_COLORS[0];
    const wasOverlay = (ctx === fctx) || !!ctx.__dgIsOverlay;
    const skipReset = !!opts.skipReset;
    const skipTransform = !!opts.skipTransform;

    const drawCore = () => {
      ctx.save();
      const isOverlay = (ctx === fctx) || !!ctx.__dgIsOverlay;
      const wantsSpecial = !!stroke.isSpecial;
      const visualOnly = isVisualOnlyStroke(stroke);
      const alpha = getPathAlpha({
        isOverlay,
        wantsSpecial,
        isVisualOnly: visualOnly,
        generatorId: stroke.generatorId ?? null,
      });

      emitDG('path-alpha', {
        layer: (ctx === fctx) ? 'overlay' : 'paint',
        wantsSpecial: !!stroke.isSpecial,
        visualOnly,
        alpha,
        overlayColorize: !!stroke.overlayColorize,
        hasGeneratorId: !!stroke.generatorId,
        pts: stroke.pts?.length || 0
      });

      if (DG_ALPHA_DEBUG) {
        const now = performance?.now?.() ?? Date.now();
        if (now - dgAlphaState.pathLastTs > DG_ALPHA_SPAM_MS) {
          dgAlphaState.pathLastTs = now;
          console.debug('[DG][alpha:path]', {
            isOverlay,
            wantsSpecial,
            VISUAL_ONLY_ALPHA,
          });
        }
      }

      ctx.globalAlpha = alpha;

      const useMultiColour = wantsSpecial && isOverlay;

      if (!useMultiColour) {
        if (isOverlay) {
          ctx.strokeStyle = stroke.overlayColor || '#ffffff';
          ctx.fillStyle = ctx.strokeStyle;
        } else {
          ctx.strokeStyle = color;
          ctx.fillStyle = color;
        }
      }

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      ctx.beginPath();
      if (stroke.pts.length === 1) {
        const lineWidth = R.getLineWidth();
        const p = stroke.pts[0];
        if (useMultiColour) {
          const r = lineWidth / 2;
          const t = (performance.now ? performance.now() : Date.now());
          const gid = stroke.generatorId ?? 1;
          const hue = gid === 1
            ? (200 + 20 * Math.sin((t / 1600) * Math.PI * 2))
            : (20 + 20 * Math.sin((t / 1800) * Math.PI * 2));
          const hueKey = Math.round(hue * 0.5) * 2;
          const gradKey = `${hueKey}|${p.x.toFixed(1)}|${p.y.toFixed(1)}|${r.toFixed(2)}`;
          let grad = stroke.__overlayRadialGrad;
          if (!grad || stroke.__overlayRadialGradKey !== gradKey) {
            grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
            if (gid === 1) {
              grad.addColorStop(0, `hsl(${hueKey}, 100%, 75%)`);
              grad.addColorStop(0.7, `hsl(${(hueKey + 60) % 360}, 100%, 68%)`);
              grad.addColorStop(1, `hsla(${(hueKey + 120) % 360}, 100%, 60%, 0.35)`);
            } else {
              grad.addColorStop(0, `hsl(${hueKey}, 100%, 70%)`);
              grad.addColorStop(0.7, `hsl(${(hueKey - 25 + 360) % 360}, 100%, 65%)`);
              grad.addColorStop(1, `hsla(${(hueKey - 45 + 360) % 360}, 100%, 55%, 0.35)`);
            }
            stroke.__overlayRadialGrad = grad;
            stroke.__overlayRadialGradKey = gradKey;
          }
          ctx.fillStyle = grad;
        }
        ctx.arc(p.x, p.y, lineWidth / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const lw = R.getLineWidth() + (isOverlay ? 1.25 : 0);
        ctx.lineWidth = lw;
        if (useMultiColour) {
          const p1 = stroke.pts[0];
          const pLast = stroke.pts[stroke.pts.length - 1];
          const t = (performance.now ? performance.now() : Date.now());
          const gid = stroke.generatorId ?? 1;
          const hue = gid === 1
            ? (200 + 20 * Math.sin((t / 1600) * Math.PI * 2))
            : (20 + 20 * Math.sin((t / 1800) * Math.PI * 2));
          const hueKey = Math.round(hue * 0.5) * 2;
          const gradKey = `${hueKey}|${p1.x.toFixed(1)}|${p1.y.toFixed(1)}|${pLast.x.toFixed(1)}|${pLast.y.toFixed(1)}`;
          let grad = stroke.__overlayLinearGrad;
          if (!grad || stroke.__overlayLinearGradKey !== gradKey) {
            grad = ctx.createLinearGradient(p1.x, p1.y, pLast.x, pLast.y);
            if (gid === 1) {
              grad.addColorStop(0, `hsl(${hueKey}, 100%, 70%)`);
              grad.addColorStop(0.5, `hsl(${(hueKey + 45) % 360}, 100%, 70%)`);
              grad.addColorStop(1, `hsl(${(hueKey + 90) % 360}, 100%, 68%)`);
            } else {
              grad.addColorStop(0, `hsl(${hueKey}, 100%, 68%)`);
              grad.addColorStop(0.5, `hsl(${(hueKey - 25 + 360) % 360}, 100%, 66%)`);
              grad.addColorStop(1, `hsl(${(hueKey - 50 + 360) % 360}, 100%, 64%)`);
            }
            stroke.__overlayLinearGrad = grad;
            stroke.__overlayLinearGradKey = gradKey;
          }
          ctx.strokeStyle = grad;
        }
        const path = getStrokePath(stroke);
        if (path) {
          ctx.stroke(path);
        } else {
          ctx.moveTo(stroke.pts[0].x, stroke.pts[0].y);
          for (let i = 1; i < stroke.pts.length; i++) {
            ctx.lineTo(stroke.pts[i].x, stroke.pts[i].y);
          }
          ctx.stroke();
        }
      }

      ctx.restore();
    };

    if (!skipReset) R.resetCtx(ctx);
    if (skipTransform) {
      drawCore();
    } else {
      // IMPORTANT:
      // Many call paths are already wrapped in logical-space (e.g. nodes/overlays).
      // Using R.withLogicalSpace here can double-apply the DPR scale when paintDpr < 1
      // (common after zoom-out), causing nodes/connectors/text to shrink or grow incorrectly.
      // __dgWithLogicalSpace has a nesting guard (ctx.__dgLogicalSpaceActive) and uses the
      // canvas's actual backing-store DPR (canvas.width / CSS width) to stay in sync.
      __dgWithLogicalSpace(ctx, drawCore);
    }
    if (!wasOverlay) markPaintDirty();
  }
let __dgNodesCache = { canvas: null, ctx: null, key: '', nodeCoords: null };

function __dgBumpNodesRev(reason = '') {
  try {
    if (!currentMap) return;
    const prev = (Number.isFinite(currentMap.__dgRev) ? currentMap.__dgRev : 0) | 0;
    currentMap.__dgRev = (prev + 1) | 0;

    // Any change that affects nodes / active / disabled must invalidate the cached nodes layer.
    if (__dgNodesCache) {
      __dgNodesCache.key = '';
      __dgNodesCache.nodeCoords = null;
    }
    // Optional: make it easy to see rev churn while debugging.
    panel.__dgNodesRev = currentMap.__dgRev;
    if (reason) panel.__dgNodesRevReason = String(reason);
  } catch {}
}
  let __dgBlocksCache = { canvas: null, ctx: null, key: '' };

  // Draw helpers -----------------------------------------------------------
  // We sometimes run with paintDpr < 1 (pressure/adaptive DPR). In that mode,
  // canvases are allocated at cssW*paintDpr but MUST still be drawn in CSS-pixel
  // logical space. If we draw assuming device DPR, overlays will appear shrunk
  // and offset toward the top-left (repro: notes/connectors/column text drift).
  function __dgWithLogicalSpace(ctx, fn) {
    // Guard against accidental nesting.
    // Some call paths already wrap in logical-space (R.withLogicalSpace or another
    // __dgWithLogicalSpace). A second scale application will make overlays appear
    // too small/large, especially when paintDpr < 1 under zoom/pressure.
    if (ctx && ctx.__dgLogicalSpaceActive) {
      fn();
      return;
    }

    // IMPORTANT:
    // Use the *canvas's actual* backing-store DPR (canvas.width / CSS width), not just paintDpr.
    // During zoom/refresh, some layers (notably nodes/connectors/labels) can temporarily drift out
    // of sync and appear scaled smaller/larger than other layers. This keeps logical space correct
    // per-layer.
    const fallback = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
    const dpr = __dgGetCanvasDprFromCss(ctx?.canvas, cssW, fallback);

    // Non-spammy: log only when the logical-space DPR for a given role changes.
    try {
      if (typeof window !== 'undefined' && window.__DG_CANVAS_SCALE_TRACE) {
        const role = ctx?.canvas?.getAttribute?.('data-role') || 'unknown';
        const key = `LS:${role}`;
        const cw = ctx?.canvas?.width || 0;
        const sig = `${Math.round(dpr * 1000)}|${Math.round(fallback * 1000)}|${Math.round((cssW || 0) * 10)}|${cw}`;
        if (!__dgScaleSigMap) __dgScaleSigMap = new Map();
        const prev = __dgScaleSigMap.get(key);
        if (prev !== sig) {
          __dgScaleSigMap.set(key, sig);
          let debugSizing = null;
          try {
            if (window.__DG_CANVAS_SCALE_TRACE_VERBOSE) {
              const canvas = ctx?.canvas;
              const rect = canvas?.getBoundingClientRect?.();
              const styleW = canvas?.style?.width ? parseFloat(canvas.style.width) : null;
              const styleH = canvas?.style?.height ? parseFloat(canvas.style.height) : null;
              const clientW = canvas?.clientWidth || null;
              const clientH = canvas?.clientHeight || null;
              const rectW = rect ? rect.width : null;
              const rectH = rect ? rect.height : null;
              debugSizing = {
                cssWState: Number.isFinite(cssW) ? cssW : null,
                cssHState: Number.isFinite(cssH) ? cssH : null,
                tsmCssW: Number.isFinite(canvas?.__tsmCssW) ? canvas.__tsmCssW : null,
                tsmCssH: Number.isFinite(canvas?.__tsmCssH) ? canvas.__tsmCssH : null,
                dgCssW: Number.isFinite(canvas?.__dgCssW) ? canvas.__dgCssW : null,
                dgCssH: Number.isFinite(canvas?.__dgCssH) ? canvas.__dgCssH : null,
                styleW,
                styleH,
                clientW,
                clientH,
                rectW,
                rectH,
                boardScale: Number.isFinite(boardScale) ? +boardScale.toFixed(3) : null,
                panelId: panel?.id || null,
              };
            }
          } catch {}
          try {
            dgCanvasScaleTrace('logicalSpaceDpr', { role, dpr, paintDpr: fallback, cssW, canvasW: cw, debugSizing });
          } catch {
            console.log('[DG][scale] logicalSpaceDpr', { role, dpr, paintDpr: fallback, cssW, canvasW: cw, debugSizing });
          }
        }
      }
    } catch {}

    try { if (ctx) ctx.__dgLogicalSpaceActive = true; } catch {}
    ctx.save();
    // Reset to a known transform; callers typically called R.resetCtx(ctx) already.
    // setTransform avoids compounding transforms if something slipped through.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    try {
      fn();
    } finally {
      ctx.restore();
      try { if (ctx) ctx.__dgLogicalSpaceActive = false; } catch {}
    }
  }

  function drawNodes(nodes) {
    if (!__dgGridReady()) {
      return;
    }
    FD.layerTrace('drawNodes:enter', {
      panelId: panel?.id || null,
      usingBackBuffers,
      nctxRole: nctx?.canvas?.getAttribute?.('data-role') || null,
      nctxSize: nctx?.canvas ? { w: nctx.canvas.width, h: nctx.canvas.height } : null,
    });
    let nodeCoords = null;
    nodeCoordsForHitTest = [];
    const __perfOn = !!(window.__PerfFrameProf && typeof performance !== 'undefined' && performance.now);
    const __layoutStart = __perfOn ? performance.now() : 0;
    R.resetCtx(nctx);
    R.resetCtx(nctx);
    if (DG_COMBINE_GRID_NODES) {
      if (!panel.__dgGridReadyForNodes) {
        drawGrid();
      }
      panel.__dgGridReadyForNodes = false;
    }
    const surface = nctx.canvas;
    const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
    const width = cssW || (surface?.width ?? 0) / scale;
    const height = cssH || (surface?.height ?? 0) / scale;
    if (!DG_COMBINE_GRID_NODES) {
      const surfacePxW = surface?.width ?? 0;
      const surfacePxH = surface?.height ?? 0;
      R.withDeviceSpace(nctx, () => {
        nctx.clearRect(0, 0, surfacePxW, surfacePxH);
      });
    }
    if (DG_SINGLE_CANVAS && nodesFrontCtx?.canvas) {
      const frontSurface = nodesFrontCtx.canvas;
      R.withDeviceSpace(nodesFrontCtx, () => {
        nodesFrontCtx.clearRect(0, 0, frontSurface.width, frontSurface.height);
      });
    }
    if (!__dgProbeDidFirstDraw && typeof window !== 'undefined' && window.__DG_PROBE_ON !== false) {
      __dgProbeDidFirstDraw = true;
      try { __dgProbeDump('first-draw:nodes'); } catch {}
    }
    __dgWithLogicalSpace(nctx, () => {
      if (!nodes) {
        return;
      }

      const radius = Math.max(4, Math.min(cw, ch) * 0.20);
      const isZoomed = panel.classList.contains('toy-zoomed');
      const hasTwoLines = Array.isArray(strokes) && strokes.some(s => s && s.generatorId === 2);
      let mapKey = 2166136261;
      const __dgHashStep = (h, v) => {
        const n = (Number.isFinite(v) ? v : 0) | 0;
        return ((h ^ n) * 16777619) >>> 0;
      };

      // Build a *sparse* key for nodes layout + render caching.
      // Important: do NOT iterate every row/col cell here (that's what we're trying to avoid).
      mapKey = __dgHashStep(mapKey, rows);
      mapKey = __dgHashStep(mapKey, cols);
      mapKey = __dgHashStep(mapKey, Math.round(cw * 1000));
      mapKey = __dgHashStep(mapKey, Math.round(ch * 1000));
      mapKey = __dgHashStep(mapKey, Math.round(topPad * 1000));
      mapKey = __dgHashStep(mapKey, Math.round((gridArea?.x || 0) * 1000));
      mapKey = __dgHashStep(mapKey, Math.round((gridArea?.y || 0) * 1000));
      mapKey = __dgHashStep(mapKey, Math.round((gridArea?.w || 0) * 1000));
      mapKey = __dgHashStep(mapKey, Math.round((gridArea?.h || 0) * 1000));
      mapKey = __dgHashStep(mapKey, hasTwoLines ? 1 : 0);
      mapKey = __dgHashStep(mapKey, isZoomed ? 1 : 0);

      if (currentMap) {
        // IMPORTANT PERF: avoid iterating over every node just to build a cache key.
        // Node sets can be large (and this was dominating drawgrid.nodes.layout in perf).
        // Instead, rely on a simple revision counter that we bump whenever nodes/active/disabled change.
        const __rev = (Number.isFinite(currentMap.__dgRev) ? currentMap.__dgRev : 0) | 0;
        mapKey = __dgHashStep(mapKey, __rev);

        // Also hash the active mask (cheap, cols is small) so toggles are reflected even if a caller forgets to bump rev.
        if (Array.isArray(currentMap.active)) {
          for (let c = 0; c < cols; c++) {
            mapKey = __dgHashStep(mapKey, currentMap.active[c] ? 1 : 0);
          }
        }
      }

      const dragCol = (typeof dragScaleHighlightCol === 'number') ? dragScaleHighlightCol : -1;
      const dragRow = (draggedNode && typeof draggedNode.row === 'number') ? draggedNode.row : -1;
      mapKey = __dgHashStep(mapKey, dragCol);
      mapKey = __dgHashStep(mapKey, dragRow);

      const cache = __dgNodesCache;
      const surfacePxW = surface?.width ?? nctx.canvas?.width ?? 0;
      const surfacePxH = surface?.height ?? nctx.canvas?.height ?? 0;
      if (!cache.canvas) cache.canvas = document.createElement('canvas');
      if (cache.canvas.width !== surfacePxW) cache.canvas.width = surfacePxW;
      if (cache.canvas.height !== surfacePxH) cache.canvas.height = surfacePxH;
      if (!cache.ctx) cache.ctx = cache.canvas.getContext('2d');
      const cacheKey = `${mapKey}|${Math.round(radius * 1000)}|${surfacePxW}x${surfacePxH}`;
      const cacheMiss = cache.key !== cacheKey;

      const cacheHit = !cacheMiss && cache.canvas && Array.isArray(cache.nodeCoords);
      if (cacheHit) {
        // Reuse last layout for hit-testing; avoid O(cols*rows) rebuilds.
        nodeCoords = cache.nodeCoords;
        nodeCoordsForHitTest = nodeCoords;

        if (__perfOn && __layoutStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.layout', performance.now() - __layoutStart); } catch {}
        }

        const __cacheBlitStart = __perfOn ? performance.now() : 0;
        // Cache is stored in device pixels; blit in device space to avoid double-scaling.
        R.withDeviceSpace(nctx, () => {
          nctx.drawImage(cache.canvas, 0, 0);
        });
        if (__perfOn && __cacheBlitStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.cacheBlit', performance.now() - __cacheBlitStart); } catch {}
        }
      }

      // Non-spammy node/canvas scale tracing (logs only when the relevant scale inputs change).
      // Repro: zoomed-out scene -> create draw toy -> draw line; notes/connectors/text appear smaller and shrink further on zoom.
      if (typeof window !== 'undefined' && window.__DG_NODE_SCALE_TRACE) {
        let __dgScaleHash = 2166136261;
        __dgScaleHash = __dgHashStep(__dgScaleHash, rows);
        __dgScaleHash = __dgHashStep(__dgScaleHash, cols);
        __dgScaleHash = __dgHashStep(__dgScaleHash, Math.round(cw * 1000));
        __dgScaleHash = __dgHashStep(__dgScaleHash, Math.round(ch * 1000));
        __dgScaleHash = __dgHashStep(__dgScaleHash, Math.round(topPad * 1000));
        __dgScaleHash = __dgHashStep(__dgScaleHash, Math.round((gridArea?.x || 0) * 1000));
        __dgScaleHash = __dgHashStep(__dgScaleHash, Math.round((gridArea?.y || 0) * 1000));
        __dgScaleHash = __dgHashStep(__dgScaleHash, Math.round((gridArea?.w || 0) * 1000));
        __dgScaleHash = __dgHashStep(__dgScaleHash, Math.round((gridArea?.h || 0) * 1000));
        __dgScaleHash = __dgHashStep(__dgScaleHash, isZoomed ? 1 : 0);
        __dgScaleHash = __dgHashStep(__dgScaleHash, Math.round((cssW || 0) * 10));
        __dgScaleHash = __dgHashStep(__dgScaleHash, Math.round((cssH || 0) * 10));
        __dgScaleHash = __dgHashStep(__dgScaleHash, Math.round(((Number.isFinite(paintDpr) ? paintDpr : 1) || 1) * 1000));

        const __last = panel.__dgLastNodeScaleHash;
        if (__last !== __dgScaleHash) {
          panel.__dgLastNodeScaleHash = __dgScaleHash;

          const panelRect = panel?.getBoundingClientRect?.();
          const wrapRect = wrap?.getBoundingClientRect?.();
          const nodesRect = nctx?.canvas?.getBoundingClientRect?.();
          const nodesPx = nctx?.canvas ? { w: nctx.canvas.width, h: nctx.canvas.height } : null;
          const paintCanvas = (typeof getActivePaintCanvas === 'function')
            ? getActivePaintCanvas()
            : (frontCanvas || paint || null);
          const nodesScale = __dgDescribeCanvasScale(nctx?.canvas, wrapRect);
          const paintScale = __dgDescribeCanvasScale(paintCanvas, wrapRect);
          const frontScale = __dgDescribeCanvasScale(frontCanvas, wrapRect);
          const backScale = __dgDescribeCanvasScale(backCanvas, wrapRect);
          const paintSnap = __dgGetCanvasSizingSnapshot(paintCanvas);
          const frontSnap = __dgGetCanvasSizingSnapshot(frontCanvas);
          const backSnap = __dgGetCanvasSizingSnapshot(backCanvas);
          const wrapScaleW = (wrapRect && wrapRect.width && wrap?.clientWidth)
            ? +(wrapRect.width / wrap.clientWidth).toFixed(3)
            : null;
          const wrapScaleH = (wrapRect && wrapRect.height && wrap?.clientHeight)
            ? +(wrapRect.height / wrap.clientHeight).toFixed(3)
            : null;

          const payload = {
            panelId: panel?.id || null,
            paintDpr,
            deviceDpr: (typeof devicePixelRatio === 'number' ? devicePixelRatio : null),
            cssW, cssH,
            panelRect: panelRect ? { w: Math.round(panelRect.width), h: Math.round(panelRect.height) } : null,
            wrapRect: wrapRect ? { w: Math.round(wrapRect.width), h: Math.round(wrapRect.height) } : null,
            wrapClient: wrap ? { w: wrap.clientWidth || 0, h: wrap.clientHeight || 0 } : null,
            wrapScaleW,
            wrapScaleH,
            boardScale: (Number.isFinite(boardScale) ? +boardScale.toFixed(3) : null),
            layoutCache: { w: __dgLayoutW || 0, h: __dgLayoutH || 0, goodW: __dgLayoutGoodW || 0, goodH: __dgLayoutGoodH || 0 },
            nodesRect: nodesRect ? { w: Math.round(nodesRect.width), h: Math.round(nodesRect.height) } : null,
            nodesPx,
            nodesScale,
            paintScale,
            frontScale,
            backScale,
            activePaintRole: paintCanvas?.getAttribute?.('data-role') || null,
            usingBackBuffers,
            paintSizes: { active: paintSnap, front: frontSnap, back: backSnap },
            paintActivePxW: paintSnap?.pxW ?? null,
            paintActivePxH: paintSnap?.pxH ?? null,
            paintActiveRectW: paintSnap?.rectW ?? null,
            paintActiveRectH: paintSnap?.rectH ?? null,
            paintActiveClientW: paintSnap?.clientW ?? null,
            paintActiveClientH: paintSnap?.clientH ?? null,
            paintActiveCssW: paintSnap?.cssW ?? null,
            paintActiveCssH: paintSnap?.cssH ?? null,
            paintActiveTsmCssW: paintSnap?.tsmCssW ?? null,
            paintActiveTsmCssH: paintSnap?.tsmCssH ?? null,
            paintActiveDgCssW: paintSnap?.dgCssW ?? null,
            paintActiveDgCssH: paintSnap?.dgCssH ?? null,
            paintActiveEffDprW: paintSnap?.effDprW ?? null,
            paintActiveEffDprH: paintSnap?.effDprH ?? null,
            gridArea: gridArea ? { x: Math.round(gridArea.x), y: Math.round(gridArea.y), w: Math.round(gridArea.w), h: Math.round(gridArea.h) } : null,
            cw: Number.isFinite(cw) ? +cw.toFixed(3) : cw,
            ch: Number.isFinite(ch) ? +ch.toFixed(3) : ch,
            topPad: Number.isFinite(topPad) ? +topPad.toFixed(3) : topPad,
            // sanity: if these drift, notes/connectors can visually "shrink" within the canvas
            gridColsW: Number.isFinite(cw) ? +(cw * cols).toFixed(2) : null,
            gridRowsH: Number.isFinite(ch) ? +(ch * rows).toFixed(2) : null,
          };
          dgNodeScaleTrace('drawNodes:basis', payload);
        }
      }

      if (!cacheHit) {
        nodeCoords = [];
        nodeCoordsForHitTest = nodeCoords;
        for (let c = 0; c < cols; c++) {
          if (!nodes[c] || nodes[c].size === 0) continue;
          for (const r of nodes[c]) {
            const x = gridArea.x + c * cw + cw * 0.5;
            const y = gridArea.y + topPad + r * ch + ch * 0.5;
            const groupEntry = nodeGroupMap?.[c]?.get(r) ?? null;
            const disabledSet = currentMap?.disabled?.[c];
            const isDisabled = !!(disabledSet && disabledSet.has(r));
            if (Array.isArray(groupEntry) && groupEntry.length > 0) {
              for (let i = groupEntry.length - 1; i >= 0; i--) {
                const gid = groupEntry[i];
                const nodeData = { x, y, col: c, row: r, radius: radius * 1.5, group: gid, disabled: isDisabled };
                nodeCoords.push(nodeData);
              }
            } else {
              const groupId = typeof groupEntry === 'number' ? groupEntry : null;
              const nodeData = { x, y, col: c, row: r, radius: radius * 1.5, group: groupId, disabled: isDisabled };
              nodeCoords.push(nodeData);
            }
          }
        }

        cache.nodeCoords = nodeCoords;
        if (__perfOn && __layoutStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.layout', performance.now() - __layoutStart); } catch {}
        }
      }

    if (!cacheHit && cacheMiss) {
      FD.layerDebugLog('nodes-cache-miss', {
        panelId: panel?.id || null,
        cacheKey,
        surfacePxW,
        surfacePxH,
        cssW,
        cssH,
        nodeCount: nodeCoords.length,
      });
      const __drawStart = __perfOn ? performance.now() : 0;
      renderDragScaleBlueHints(nctx);
      nctx.lineWidth = 3;
      const colsMap = new Map();
      for (const node of nodeCoords) {
        if (!colsMap.has(node.col)) colsMap.set(node.col, []);
        colsMap.get(node.col).push(node);
      }

      const colorFor = (gid, active = true) => {
        if (!active) return 'rgba(80, 100, 160, 0.6)';
        if (gid === 1) return 'rgba(125, 180, 255, 0.9)';
        if (gid === 2) return 'rgba(255, 160, 120, 0.9)';
        return 'rgba(255, 255, 255, 0.85)';
      };

      const matchGroup = (value, gid) => {
        if (gid == null) return value == null;
        return value === gid;
      };

      const __connStart = __perfOn ? performance.now() : 0;
      for (let c = 0; c < cols - 1; c++) {
        const currentColNodes = colsMap.get(c);
        const nextColNodes = colsMap.get(c + 1);
        if (!currentColNodes || !nextColNodes) continue;
        const currentIsActive = currentMap?.active?.[c] ?? false;
        const nextIsActive = currentMap?.active?.[c + 1] ?? true;
        const advanced = panel.classList.contains('toy-zoomed');

        const drawGroupConnections = (gid) => {
          for (const nodeA of currentColNodes) {
            if (!matchGroup(nodeA.group ?? null, gid)) continue;
            for (const nodeB of nextColNodes) {
              if (!matchGroup(nodeB.group ?? null, gid)) continue;
              const eitherDisabled = nodeA.disabled || nodeB.disabled;
              nctx.strokeStyle = colorFor(gid, currentIsActive && nextIsActive && !eitherDisabled);
              if (gid && advanced && !eitherDisabled) {
                nctx.shadowColor = nctx.strokeStyle;
                nctx.shadowBlur = 12;
              } else {
                nctx.shadowColor = 'transparent';
                nctx.shadowBlur = 0;
              }
              nctx.beginPath();
              nctx.moveTo(nodeA.x, nodeA.y);
              nctx.lineTo(nodeB.x, nodeB.y);
              nctx.stroke();
            }
          }
        };

        drawGroupConnections(1);
        drawGroupConnections(2);
        drawGroupConnections(null);
      }
      if (__perfOn && __connStart) {
        try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.connections', performance.now() - __connStart); } catch {}
      }

      nctx.shadowColor = 'transparent';
      nctx.shadowBlur = 0;

      const gradientCache = new Map();
      const getGradient = (ctx, x, y, r, color) => {
        const key = `${color}-${r}`;
        if (!gradientCache.has(key)) {
          const grad = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
          grad.addColorStop(0, color);
          grad.addColorStop(0.92, 'rgba(143, 168, 255, 0)');
          grad.addColorStop(1, 'rgba(143, 168, 255, 0)');
          gradientCache.set(key, grad);
        }
        return gradientCache.get(key);
      };

      const __circleStart = __perfOn ? performance.now() : 0;
      for (const node of nodeCoords) {
        const disabled = node.disabled || currentMap?.disabled?.[node.col]?.has(node.row);
        const group = node.group ?? null;
        const advanced = panel.classList.contains('toy-zoomed');
        const isSpecialLine1 = group === 1;
        const isSpecialLine2 = group === 2;
        const mainColor = disabled
          ? 'rgba(143, 168, 255, 0.4)'
          : isSpecialLine1
            ? 'rgba(125, 180, 255, 0.92)'
            : isSpecialLine2
              ? 'rgba(255, 160, 120, 0.92)'
              : 'rgba(255, 255, 255, 0.92)';

        if (advanced && (isSpecialLine1 || isSpecialLine2) && !disabled) {
          const glowRadius = node.radius * 1.6;
          const glowColor = isSpecialLine1 ? 'rgba(125, 180, 255, 0.4)' : 'rgba(255, 160, 120, 0.4)';
          nctx.fillStyle = glowColor;
          nctx.beginPath();
          nctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
          nctx.fill();
        }

        nctx.fillStyle = getGradient(nctx, node.x, node.y, node.radius, mainColor);
        nctx.beginPath();
        nctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        nctx.fill();

        nctx.beginPath();
        nctx.fillStyle = disabled ? 'rgba(90, 110, 150, 0.65)' : 'rgba(255, 255, 255, 0.9)';
        nctx.arc(node.x, node.y, node.radius * 0.55, 0, Math.PI * 2);
        nctx.fill();

        nctx.fillStyle = disabled ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.5)';
        nctx.beginPath();
        nctx.arc(node.x, node.y - node.radius * 0.3, node.radius * 0.3, 0, Math.PI * 2);
        nctx.fill();
      }
      if (__perfOn && __circleStart) {
        try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.circles', performance.now() - __circleStart); } catch {}
      }

      if (panel.classList.contains('toy-zoomed')) {
        const __outlineStart = __perfOn ? performance.now() : 0;
        for (const node of nodeCoords) {
          if (!node.group) continue;
          const disabled = node.disabled || currentMap?.disabled?.[node.col]?.has(node.row);
          const outlineColor = node.group === 1
            ? 'rgba(125, 180, 255, 0.95)'
            : node.group === 2
              ? 'rgba(255, 160, 120, 0.95)'
              : 'rgba(255, 255, 255, 0.85)';
          const strokeAlpha = disabled ? 0.65 : 1;
          nctx.lineWidth = disabled ? 2 : 3.5;
          nctx.strokeStyle = outlineColor.replace(/0\.[0-9]+\)$/, `${strokeAlpha})`);
          nctx.beginPath();
          nctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
          nctx.stroke();
        }
        if (__perfOn && __outlineStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.outlines', performance.now() - __outlineStart); } catch {}
        }
      }

      if (cache.ctx) {
        cache.ctx.setTransform(1, 0, 0, 1, 0, 0);
        cache.ctx.clearRect(0, 0, cache.canvas.width, cache.canvas.height);
        cache.ctx.drawImage(nctx.canvas, 0, 0);
      }
      cache.key = cacheKey;
      cache.nodeCoords = nodeCoords;
      if (__perfOn && __drawStart) {
        try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.draw', performance.now() - __drawStart); } catch {}
      }
      }

      const blockCache = __dgBlocksCache;
      if (!blockCache.canvas) blockCache.canvas = document.createElement('canvas');
      if (blockCache.canvas.width !== surfacePxW) blockCache.canvas.width = surfacePxW;
      if (blockCache.canvas.height !== surfacePxH) blockCache.canvas.height = surfacePxH;
      if (!blockCache.ctx) blockCache.ctx = blockCache.canvas.getContext('2d');
      const blockKey = `${mapKey}|${Math.round(radius * 1000)}|${surfacePxW}x${surfacePxH}|blocks`;
      if (blockCache.key !== blockKey && blockCache.ctx) {
        const __blocksBuildStart = __perfOn ? performance.now() : 0;
        blockCache.key = blockKey;
        R.resetCtx(blockCache.ctx);
        R.withLogicalSpace(blockCache.ctx, () => {
          blockCache.ctx.clearRect(0, 0, width, height);
          for (const node of nodeCoords) {
            const colActive = currentMap?.active?.[node.col] ?? true;
            const nodeOn = colActive && !node.disabled;
            const size = radius * 2;
            const cubeRect = { x: node.x - size / 2, y: node.y - size / 2, w: size, h: size };
            drawBlock(blockCache.ctx, cubeRect, {
              baseColor: nodeOn ? '#ff8c00' : '#333',
              active: nodeOn,
              variant: 'button',
              noteLabel: null,
              showArrows: false,
            });
          }
          drawNoteLabelsTo(blockCache.ctx, nodes);
        });
        if (__perfOn && __blocksBuildStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.blocks.build', performance.now() - __blocksBuildStart); } catch {}
        }
      }

      if (blockCache.canvas) {
        const __blocksBlitStart = __perfOn ? performance.now() : 0;
        // Block cache is device-pixel content; blit without logical scaling.
        R.withDeviceSpace(nctx, () => {
          nctx.drawImage(blockCache.canvas, 0, 0);
        });
        if (__perfOn && __blocksBlitStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.blocks.blit', performance.now() - __blocksBlitStart); } catch {}
        }
      }

      const __flashStart = __perfOn ? performance.now() : 0;
      for (const node of nodeCoords) {
        const flash = flashes[node.col] || 0;
        if (flash <= 0) continue;
        const size = radius * 2;
        const cubeRect = { x: node.x - size / 2, y: node.y - size / 2, w: size, h: size };
        nctx.save();
        const scale = 1 + 0.15 * Math.sin(flash * Math.PI);
        nctx.translate(node.x, node.y);
        nctx.scale(scale, scale);
        nctx.translate(-node.x, -node.y);
        drawBlock(nctx, cubeRect, {
          baseColor: '#FFFFFF',
          active: true,
          variant: 'button',
          noteLabel: null,
          showArrows: false,
        });
        nctx.restore();
      }
      if (__perfOn && __flashStart) {
        try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.flash', performance.now() - __flashStart); } catch {}
      }
      if (tutorialHighlightMode !== 'none') {
        const __tutorialStart = __perfOn ? performance.now() : 0;
        renderTutorialHighlight();
        if (__perfOn && __tutorialStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.tutorial', performance.now() - __tutorialStart); } catch {}
        }
      } else {
        const __tutorialStart = __perfOn ? performance.now() : 0;
        clearTutorialHighlight();
        if (__perfOn && __tutorialStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.nodes.tutorial', performance.now() - __tutorialStart); } catch {}
        }
      }

      nodeCoordsForHitTest = nodeCoords;
    });
    if (DG_SINGLE_CANVAS && !DG_SINGLE_CANVAS_OVERLAYS) {
      __dgMarkSingleCanvasCompositeDirty(panel);
    }
    FD.layerTrace('drawNodes:exit', {
      panelId: panel?.id || null,
      usingBackBuffers,
      nctxRole: nctx?.canvas?.getAttribute?.('data-role') || null,
    });
  }

  function drawNoteLabelsTo(ctx, nodes) {
    if (!ctx) return;
    __dgWithLogicalSpace(ctx, () => {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = '600 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      const labelY = Math.round((cssH || 0) - 10);

      for (let c = 0; c < cols; c++) {
        if (!nodes[c] || nodes[c].size === 0) continue;
        let r = undefined;
        const disabledSet = currentMap?.disabled?.[c] || new Set();
        for (const row of nodes[c]) {
          if (!disabledSet.has(row)) { r = row; break; }
        }
        if (r === undefined) continue;
        const midiNote = chromaticPalette[r];
        if (midiNote === undefined) continue;
        const tx = Math.round(gridArea.x + c * cw + cw * 0.5);
        ctx.fillText(midiToName(midiNote), tx, labelY);
      }
    });
  }

  function drawNoteLabels(nodes) {
    drawNoteLabelsTo(nctx, nodes);
  }

  // --- Note Palettes for Snapping ---
  const pentatonicOffsets = [0, 3, 5, 7, 10];
  const chromaticOffsets = Array.from({length: 12}, (_, i) => i);
  // Create palettes of MIDI numbers. Reversed so top row is highest pitch.
  const chromaticPalette = buildPalette(48, chromaticOffsets, 1).reverse(); // MIDI 59 (B3) down to 48 (C3)
  const pentatonicPalette = buildPalette(48, pentatonicOffsets, 2).reverse(); // 10 notes from C3-C5 range
  const pentatonicPitchClasses = new Set(pentatonicOffsets.map(offset => ((offset % 12) + 12) % 12));

  function renderDragScaleBlueHints(ctx) {
    if (!ctx) return;
    if (typeof dragScaleHighlightCol !== 'number' || dragScaleHighlightCol < 0 || dragScaleHighlightCol >= cols) return;
    if (cw <= 0 || ch <= 0) return;
    const noteGridY = gridArea.y + topPad;
    const colX = gridArea.x + dragScaleHighlightCol * cw;
    const activeRow = (draggedNode && draggedNode.col === dragScaleHighlightCol) ? draggedNode.row : null;
    ctx.save();
    const strokeWidth = Math.max(1, Math.min(cw, ch) * 0.045);
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'butt';
    for (let r = 0; r < rows; r++) {
      const midi = chromaticPalette[r];
      if (typeof midi !== 'number') continue;
      const pitchClass = ((midi % 12) + 12) % 12;
      if (!pentatonicPitchClasses.has(pitchClass)) continue;
      const y = noteGridY + r * ch;
      const alpha = (activeRow === r) ? 0.6 : 0.35;
      ctx.fillStyle = `rgba(90, 200, 255, ${alpha})`;
      ctx.fillRect(colX, y, cw, ch);
      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = activeRow === r ? 'rgba(160, 240, 255, 0.95)' : 'rgba(130, 220, 255, 0.85)';
      ctx.strokeRect(colX, y, cw, ch);
    }
    ctx.restore();
  }

  function setDragScaleHighlight(col) {
    const next = (typeof col === 'number' && col >= 0 && col < cols) ? col : null;
    if (dragScaleHighlightCol === next) return;
    dragScaleHighlightCol = next;
    drawGrid();
    drawNodes(currentMap?.nodes || null);
  }

  function snapToGrid(sourceCtx = pctx){
    // build a map: for each column, choose at most one row where line crosses
    const active = Array(cols).fill(false);
    const nodes = Array.from({length:cols}, ()=> new Set());
    const disabled = Array.from({length:cols}, ()=> new Set());
    const w = paint.width;
    const h = paint.height;
    if (!w || !h) return { active, nodes, disabled }; // Abort if canvas is not ready
    
    // IMPORTANT: gridArea/cw/ch/topPad are in CSS/logical space, but getImageData is in backing-store pixels.
    // When we run with reduced DPR while zoomed out, we must scale + clamp the scan rects, otherwise we can
    // read pixels from the wrong rows/cols (which shows up as phantom "last column" notes).
    const dpr = (typeof paintDpr === 'number' && paintDpr > 0) ? paintDpr : (w / Math.max(1, Math.round(gridArea?.w || w)));
    const defaultRow = Math.max(0, Math.min(rows - 1, Math.floor(rows * 0.5)));
    const data = sourceCtx.getImageData(0, 0, w, h).data;

    for (let c=0;c<cols;c++){
      // Define the scan area strictly to the visible grid column to avoid phantom nodes
      const xStart_css = gridArea.x + c * cw;
      const xEnd_css = gridArea.x + (c + 1) * cw;

      // Convert to backing-store pixels and clamp into [0, w]
      const xStart = Math.max(0, Math.min(w, Math.floor(xStart_css * dpr)));
      const xEnd = Math.max(0, Math.min(w, Math.ceil(xEnd_css * dpr)));

      let ySum = 0;
      let inkCount = 0;

      if (xEnd <= xStart) {
        // Column has no drawable width at this DPR; keep a stable "empty" node.
        nodes[c].add(defaultRow);
        disabled[c].add(defaultRow);
        continue;
      }

      // Scan the column for all "ink" pixels to find the average Y position
      // We scan the full canvas height because the user can draw above or below the visual grid.
      for (let x = xStart; x < xEnd; x++) {
        for (let y = 0; y < h; y++) {
          const i = (y * w + x) * 4;
          if (data[i + 3] > 10) { // alpha threshold
            ySum += y;
            inkCount++;
          }
        }
      }

      if (inkCount > 0) {
        const avgY_dpr = ySum / inkCount;
        const avgY_css = avgY_dpr / dpr;

        const noteGridTop = gridArea.y + topPad;
        const noteGridBottom = noteGridTop + rows * ch;
        const isOutside = avgY_css <= noteGridTop || avgY_css >= noteGridBottom;

        if (isOutside) {
            // Find a default "in-key" row for out-of-bounds drawing.
            // This ensures disabled notes are still harmonically related.
            let safeRow = defaultRow; // Fallback to the vertical middle cell
            try {
                const visiblePentatonicNotes = pentatonicPalette.filter(p => chromaticPalette.includes(p));
                if (visiblePentatonicNotes.length > 0) {
                    // Pick a note from the middle of the available pentatonic notes.
                    const middleIndex = Math.floor(visiblePentatonicNotes.length / 2);
                    const targetMidi = visiblePentatonicNotes[middleIndex];
                    const targetRow = chromaticPalette.indexOf(targetMidi);
                    if (targetRow !== -1) safeRow = targetRow;
                }
            } catch {}
            nodes[c].add(safeRow);
            disabled[c].add(safeRow);
            active[c] = false; // This will be recomputed later, but good to be consistent
        } else {
            // Map average Y to nearest row, clamped to valid range.
            const r_clamped = Math.max(0, Math.min(rows - 1, Math.round((avgY_css - (gridArea.y + topPad)) / ch)));
            let r_final = r_clamped;

            if (autoTune) {
              // 1. Get the MIDI note for the visually-drawn row
              const drawnMidi = chromaticPalette[r_clamped];

              // 2. Find the nearest note in the pentatonic scale
              let nearestMidi = pentatonicPalette[0];
              let minDiff = Math.abs(drawnMidi - nearestMidi);
              for (const pNote of pentatonicPalette) {
                const diff = Math.abs(drawnMidi - pNote);
                if (diff < minDiff) { minDiff = diff; nearestMidi = pNote; }
              }

              // 3. Map that pentatonic note into the visible chromatic range by octave wrapping
              try {
                const minC = chromaticPalette[chromaticPalette.length - 1];
                const maxC = chromaticPalette[0];
                let wrapped = nearestMidi|0;
                while (wrapped > maxC) wrapped -= 12;
                while (wrapped < minC) wrapped += 12;
                const correctedRow = chromaticPalette.indexOf(wrapped);
                if (correctedRow !== -1) r_final = correctedRow;
              } catch {}
            }

            nodes[c].add(r_final);
            active[c] = true;
        }
      } else {
        // No ink in this column: keep a stable "empty" node at the vertical middle.
        nodes[c].add(defaultRow);
        disabled[c].add(defaultRow);
        active[c] = false;
      }
    }
    if (typeof window !== 'undefined' && window.DG_DRAW_DEBUG) {
      const totalNodes = nodes.reduce((n, set) => n + ((set && set.size) || 0), 0);
      console.debug('[DG][SNAP] summary', { w, h, dpr, totalNodes, anyInk: totalNodes > 0 });
    }
    return {active, nodes, disabled};
  }

  function onPointerDown(e){
    e.stopPropagation();
    dgInputTrace('paint:down', {
      pointerId: e.pointerId,
      buttons: e.buttons,
      isPrimary: e.isPrimary,
      targetRole: e?.target?.getAttribute?.('data-role') || e?.target?.id || e?.target?.className || null,
      cssW,
      cssH,
      paintDpr,
      gridArea: gridArea ? { x: gridArea.x, y: gridArea.y, w: gridArea.w, h: gridArea.h } : null,
      drawing,
      pendingNodeTap: !!pendingNodeTap,
      draggedNode: !!draggedNode,
      skipSwapsDuringDrag: !!__dgSkipSwapsDuringDrag,
    });
    dgPaintTrace('pointer:down', { pointerId: e.pointerId, buttons: e.buttons, isPrimary: e.isPrimary, zoomMode, zoomGestureActive });

    FD.flowLog('pointer:down:entry', {
      focusedId: window.gFocusedToy?.id || null,
      focusMismatch: !!(window.gFocusedToy && window.gFocusedToy !== panel),
      unfocused: panel?.classList?.contains?.('toy-unfocused') || false,
    });
    if (window.gFocusedToy && window.gFocusedToy !== panel) {
      // If another toy is focused, request focus here but still allow drawing.
      try { window.requestToyFocus?.(panel, { center: false }); } catch {}
    }
    // When the user starts manual drawing, the ghost guide particles must disappear (not freeze).
    // immediate:true forces a visual clear so we don't leave a "stuck" ghost frame on screen.
    stopAutoGhostGuide({ immediate: true, reason: 'pointerdown:manual-draw' });
    markUserChange('pointerdown');
    FD.flowLog('pointer:down', {});
    const p = pointerToPaintLogical(e);
    if (typeof window !== 'undefined' && window.__DG_POINTER_TRACE) {
      __dgPointerTraceId = e.pointerId;
      __dgPointerTraceMoveLogged = false;
      __dgPointerTraceLocal('down', e, p);
    }

    // (Top cubes removed)

    // Check for node hit first using full grid cell bounds (bigger tap area)
    for (const node of nodeCoordsForHitTest) {
      const cellX = gridArea.x + node.col * cw;
      const cellY = gridArea.y + topPad + node.row * ch;
      if (p.x >= cellX && p.x <= cellX + cw && p.y >= cellY && p.y <= cellY + ch) {
        pendingNodeTap = { col: node.col, row: node.row, x: p.x, y: p.y, group: node.group ?? null };
        setDrawingState(true); // capture move/up
        try { paint.setPointerCapture?.(e.pointerId); } catch {}
        e.preventDefault?.();
        return; // Defer deciding until move/up
      }
    }

    // Manual drawing should temporarily hide tutorial highlights (ghost finger particles).
    pauseTutorialHighlightForDraw();

    setDrawingState(true);
    try { paint.setPointerCapture?.(e.pointerId); } catch {}
    e.preventDefault?.();

    // Live ink should draw straight to the visible canvas; suppress swaps during drag.
    __dgSkipSwapsDuringDrag = true;
    if (typeof useFrontBuffers === 'function') useFrontBuffers();
    pctx = getActivePaintCtx();
    if (typeof window !== 'undefined' && window.DG_DRAW_DEBUG && pctx && pctx.canvas) {
      const c = pctx.canvas;
      console.debug('[DG][PAINT/ctx]', {
        role: c.getAttribute?.('data-role') || c.id || 'unknown',
        w: c.width,
        h: c.height,
        cssW,
        cssH,
        dpr: paintDpr,
        alpha: pctx.globalAlpha,
        comp: pctx.globalCompositeOperation,
      });
    }
    resetPaintBlend(pctx);

      // When starting a new line, don't clear the canvas. This makes drawing additive.
      // If we are about to draw a special line (previewGid decided), demote any existing line of that kind.
      try {
        const isZoomed = panel.classList.contains('toy-zoomed');
        const hasLine1 = strokes.some(s => s.generatorId === 1);
        const hasLine2 = strokes.some(s => s.generatorId === 2);
        let intendedGid = null;
        if (!isZoomed) {
          if (!hasLine1 && !hasLine2) intendedGid = 1;
        } else {
          if (!hasLine1) intendedGid = 1; else if (nextDrawTarget) intendedGid = nextDrawTarget;
        }
        if (intendedGid) {
          const existing = strokes.find(s => s.generatorId === intendedGid);
          if (existing) {
            existing.isSpecial = false;
            existing.generatorId = null;
            existing.overlayColorize = true;
            // assign a random palette color
            const idx = Math.floor(Math.random() * STROKE_COLORS.length);
            existing.color = STROKE_COLORS[idx];
          }
        }
      } catch {}
      const paintStart = p;
      const { x: x0, y: y0 } = paintStart;
      // Particle push on gesture start — snowplow a full-width band even before movement.
      try {
        const area = (gridArea && gridArea.w > 0 && gridArea.h > 0)
          ? gridArea
          : { w: cssW || 0, h: cssH || 0 };
        const baseRadius = DG_KNOCK.ghostTrail.radiusToy(area);
        const lw = (typeof R.getLineWidth === 'function') ? R.getLineWidth() : 12;
        FF.pokeAlongStrokeBand(x0, y0, x0, y0, lw, DG_KNOCK.ghostTrail);
        const pushRadius = baseRadius * 1.5;
        FF.pokeFieldToy('pointerDown', x0, y0, pushRadius, DG_KNOCK.ghostTrail.strength, { mode: 'plow' });
      } catch {}
      cur = {
        pts:[paintStart],
        color: STROKE_COLORS[colorIndex++ % STROKE_COLORS.length]
      };
      try {
        knockLettersAt(
          p.x - (gridArea?.x || 0),
          p.y - (gridArea?.y || 0),
          { radius: 100, strength: 14, source: 'line' }
        );
      } catch {}
      // The full stroke will be drawn on pointermove.
  }
  let __dgMoveRAF = 0;
  let __dgPendingMoveEvt = null;
  let __dgPointerTraceId = null;
  let __dgPointerTraceMoveLogged = false;
  function __dgPointerTraceLocal(tag, e, p) {
    try {
      if (typeof window === 'undefined' || !window.__DG_POINTER_TRACE) return;
      const paintCanvas = (typeof getActivePaintCanvas === 'function')
        ? getActivePaintCanvas()
        : (frontCanvas || paint || null);
      const paintRect = paintCanvas?.getBoundingClientRect?.();
      const wrapRect = wrap?.getBoundingClientRect?.();
      const layerRect = layersRoot?.getBoundingClientRect?.();
      const payload = {
        tag,
        panelId: panel?.id || null,
        pointerId: e?.pointerId ?? null,
        buttons: e?.buttons ?? null,
        client: { x: e?.clientX ?? null, y: e?.clientY ?? null },
        logical: { x: p?.x ?? null, y: p?.y ?? null },
        basis: p?.__dbg || null,
        cssW,
        cssH,
        paintDpr,
        usingBackBuffers,
        DG_SINGLE_CANVAS,
        wrapRect: wrapRect ? { w: Math.round(wrapRect.width), h: Math.round(wrapRect.height) } : null,
        wrapClient: wrap ? { w: wrap.clientWidth || 0, h: wrap.clientHeight || 0 } : null,
        layerRect: layerRect ? { w: Math.round(layerRect.width), h: Math.round(layerRect.height) } : null,
        paintRole: paintCanvas?.getAttribute?.('data-role') || null,
        paintRect: paintRect ? { w: Math.round(paintRect.width), h: Math.round(paintRect.height) } : null,
        paintSize: paintCanvas ? {
          pxW: paintCanvas.width || 0,
          pxH: paintCanvas.height || 0,
          cssW: paintCanvas.style?.width || null,
          cssH: paintCanvas.style?.height || null,
          clientW: paintCanvas.clientWidth || 0,
          clientH: paintCanvas.clientHeight || 0,
          tsmCssW: Number.isFinite(paintCanvas.__tsmCssW) ? paintCanvas.__tsmCssW : null,
          tsmCssH: Number.isFinite(paintCanvas.__tsmCssH) ? paintCanvas.__tsmCssH : null,
          dgCssW: Number.isFinite(paintCanvas.__dgCssW) ? paintCanvas.__dgCssW : null,
          dgCssH: Number.isFinite(paintCanvas.__dgCssH) ? paintCanvas.__dgCssH : null,
        } : null,
        frontScale: __dgDescribeCanvasScale(frontCanvas, wrapRect),
        backScale: __dgDescribeCanvasScale(backCanvas, wrapRect),
      };
      const sig = __dgStableStringify(payload);
      if (__dgPointerSigLast === sig) return;
      __dgPointerSigLast = sig;
      const stack = __dgMaybeTraceStack('__DG_POINTER_TRACE_STACK', `DG pointer trace: ${tag}`);
      if (stack) console.log(`[DG][pointer] ${tag}`, payload, stack);
      else console.log(`[DG][pointer] ${tag}`, payload);
    } catch {}
  }
  function onPointerMove(e){
    dgInputTrace('paint:move:enqueue', { pointerId: e.pointerId, buttons: e.buttons, drawing, pendingNodeTap: !!pendingNodeTap, draggedNode: !!draggedNode });
    __dgPendingMoveEvt = e;
    if (__dgMoveRAF) return;
    __dgMoveRAF = requestAnimationFrame(() => {
      __dgMoveRAF = 0;
      const evt = __dgPendingMoveEvt;
      __dgPendingMoveEvt = null;
      handlePointerMove(evt || e);
    });
  }

  function handlePointerMove(e){
    const p = pointerToPaintLogical(e);
    if (typeof window !== 'undefined' && window.__DG_POINTER_TRACE) {
      if (__dgPointerTraceId === e.pointerId && !__dgPointerTraceMoveLogged) {
        __dgPointerTraceMoveLogged = true;
        __dgPointerTraceLocal('move', e, p);
      }
    }
    dgInputTrace('paint:move:handle', {
      pointerId: e.pointerId,
      buttons: e.buttons,
      x: p?.x,
      y: p?.y,
      drawing,
      pendingNodeTap: !!pendingNodeTap,
      draggedNode: !!draggedNode,
      hasCur: !!cur,
    });
    if (!pctx) {
      DG.warn('pctx missing; forcing front buffers');
      if (typeof useFrontBuffers === 'function') useFrontBuffers();
    }
    
    // Update cursor for draggable nodes
    if (!draggedNode) {
      let onNode = false;
      for (const node of nodeCoordsForHitTest) {
        const cellX = gridArea.x + node.col * cw;
        const cellY = gridArea.y + topPad + node.row * ch;
        if (p.x >= cellX && p.x <= cellX + cw && p.y >= cellY && p.y <= cellY + ch) { onNode = true; break; }
      }
      paint.style.cursor = onNode ? 'grab' : 'default';
    }

    // Promote pending tap to drag if moved sufficiently
    if (pendingNodeTap && drawing && !draggedNode) {
      const dx = p.x - pendingNodeTap.x;
      const dy = p.y - pendingNodeTap.y;
      if (Math.hypot(dx, dy) > 6) {
        draggedNode = {
          col: pendingNodeTap.col,
          row: pendingNodeTap.row,
          group: pendingNodeTap.group ?? null,
          moved: false,
          originalRow: pendingNodeTap.row
        };
        paint.style.cursor = 'grabbing';
        pendingNodeTap = null;
        setDragScaleHighlight(draggedNode.col);
      }
    }

    if (draggedNode && drawing) {
      const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
      const newRow = clamp(Math.round((p.y - (gridArea.y + topPad)) / ch), 0, rows - 1);

      if (newRow !== draggedNode.row && currentMap) {
          const col = draggedNode.col;
          const oldRow = draggedNode.row;
          const gid = draggedNode.group ?? null;

          // Ensure group map exists for this column
          if (!nodeGroupMap[col]) nodeGroupMap[col] = new Map();
          const colGroupMap = nodeGroupMap[col];

          // Remove this group's presence from the old row's stack
          if (gid != null) {
            const oldArr = (colGroupMap.get(oldRow) || []).filter(g => g !== gid);
            if (oldArr.length > 0) colGroupMap.set(oldRow, oldArr); else colGroupMap.delete(oldRow);
          } else {
            // Ungrouped move: nothing in group map to update
          }

          // Update nodes set for old row only if no groups remain there
          if (!(colGroupMap.has(oldRow))) {
            // If some other ungrouped logic wants to keep it, ensure we don't remove erroneously
            currentMap.nodes[col].delete(oldRow);
          }

          // Add/move to new row; place on top of z-stack
          if (gid != null) {
            const newArr = colGroupMap.get(newRow) || [];
            // Remove any existing same gid first to avoid dupes, then push to end (top)
            const filtered = newArr.filter(g => g !== gid);
            filtered.push(gid);
            colGroupMap.set(newRow, filtered);
          }
          currentMap.nodes[col].add(newRow);

          // record manual override for standard view preservation
          try {
            if (!manualOverrides[col]) manualOverrides[col] = new Set();
            manualOverrides[col] = new Set(currentMap.nodes[col]);
          } catch {}

          draggedNode.row = newRow;
          draggedNode.moved = true;
          try {
            panel.dispatchEvent(new CustomEvent('drawgrid:node-drag', { detail: { col, row: newRow, group: gid } }));
          } catch {}
          
          // Redraw only the nodes canvas; the blue line on the paint canvas is untouched.
          drawNodes(currentMap.nodes);
          drawGrid();
          // We just redrew static layers, so treat them as clean.
          panel.__dgStaticDirty = false;
          __dgMarkSingleCanvasDirty(panel);
          if (DG_SINGLE_CANVAS && isPanelVisible) {
            try { compositeSingleCanvas(); } catch {}
            panel.__dgSingleCompositeDirty = false;
          }
      } else if (dragScaleHighlightCol === null) {
          setDragScaleHighlight(draggedNode.col);
      }
      return;
    }

    if (!drawing) return; // Guard for drawing logic below

    if (cur) {
      pctx = getActivePaintCtx();
      resetPaintBlend(pctx);
      const paintPt = p;
      const pt = paintPt;
      try {
        if (!previewGid && pctx) {
          const sz = Math.max(1, Math.floor(R.getLineWidth() / 6));
          R.withLogicalSpace(pctx, () => {
            pctx.fillStyle = '#ffffff';
            pctx.fillRect(paintPt.x, paintPt.y, sz, sz);
          });
        }
        if (DG_TRACE_DEBUG) {
          console.debug('[DG][ink] livemove', {
            id: panel.id,
            w: pctx?.canvas?.width ?? null,
            h: pctx?.canvas?.height ?? null,
            cssW,
            cssH,
            dpr: paintDpr,
            usingBackBuffers,
            previewGid,
            nextDrawTarget,
          });
        }
      } catch {}
      cur.pts.push(paintPt);
      // Determine if current stroke should show a special-line preview
      const isAdvanced = panel.classList.contains('toy-zoomed');
      const hasLine1 = strokes.some(s => s.generatorId === 1);
      const hasLine2 = strokes.some(s => s.generatorId === 2);

      previewGid = null;
      // Only show preview in advanced mode or when a line button is explicitly armed.
      if (isAdvanced) {
        if (!hasLine1) previewGid = 1;
        else if (nextDrawTarget) previewGid = nextDrawTarget;
      } else if (nextDrawTarget) {
        previewGid = nextDrawTarget;
      }
      // If overlay strokes are disabled, fall back to paint so live lines remain visible.
      if (previewGid && typeof window !== 'undefined' && window.__PERF_DG_OVERLAY_STROKES_OFF) {
        previewGid = null;
      }
      dbgCounters.pointerMoves++;
      // Debug: track preview vs paint to ensure live line visibility
      try {
        if ((dbgCounters.pointerMoves % 7) === 1) {
          dgTraceLog('[drawgrid] liveMove', {
            id: panel.id,
            advanced: isAdvanced,
            nextDrawTarget,
            previewGid,
            hasLine1,
            hasLine2,
          });
        }
      } catch {}
      if ((dbgCounters.pointerMoves % 12) === 1) {
        FD.flowLog('draw:move', { previewGid, nextDrawTarget, advanced: isAdvanced });
      }
      // For normal lines (no previewGid), paint segment onto paint; otherwise, overlay will show it
      if (!previewGid) {
        const lastIdx = cur.pts.length - 1;
        const prevIdx = Math.max(0, cur.pts.length - 2);
        const lastPt = cur.pts[lastIdx];
        const prevPt = cur.pts[prevIdx];
        // ensure we're actually painting opaque pixels in normal mode
        resetPaintBlend(pctx);
        const hasSpecialLine = strokes.some(s => s.isSpecial || s.generatorId);
        const wantsSpecialLive = !isAdvanced && !hasSpecialLine;
        const liveStrokeMeta = { ...cur, isSpecial: wantsSpecialLive, liveAlphaOverride: 1 };
        R.drawLiveStrokePoint(pctx, lastPt, prevPt, liveStrokeMeta);

        __dgNeedsUIRefresh = false; // don't trigger overlay clears during draw
      }
      try {
        const lastIdx = cur.pts.length - 1;
        const lastPt = cur.pts[lastIdx];
        if (lastPt) {
          const area = (gridArea && gridArea.w > 0 && gridArea.h > 0)
            ? gridArea
            : { w: cssW || 0, h: cssH || 0 };
          let baseRadius = typeof DG_KNOCK?.ghostTrail?.radiusToy === 'function'
            ? DG_KNOCK.ghostTrail.radiusToy(area)
            : 0;
          if (!Number.isFinite(baseRadius) || baseRadius <= 0) baseRadius = 18;
          const pointerR = baseRadius * 1.5;
          const logicalW = (Number.isFinite(gridAreaLogical?.w) && gridAreaLogical.w > 0)
            ? gridAreaLogical.w
            : (area?.w || cssW || 0);
          const logicalH = (Number.isFinite(gridAreaLogical?.h) && gridAreaLogical.h > 0)
            ? gridAreaLogical.h
            : (area?.h || cssH || 0);
          const logicalMin = Math.min(
            Number.isFinite(logicalW) && logicalW > 0 ? logicalW : 0,
            Number.isFinite(logicalH) && logicalH > 0 ? logicalH : 0,
          );
          const capR = Math.max(8, logicalMin > 0 ? logicalMin * 0.25 : pointerR * 1.25);
          const disturbanceRadius = Math.min(pointerR, capR);
          FF.pokeFieldToy('ghostTrail', lastPt.x, lastPt.y, disturbanceRadius, DG_KNOCK.ghostTrail.strength, {
            mode: 'plow',
            highlightMs: 900,
          });
          const lettersRadius = Math.max(
            disturbanceRadius * 2.25,
            logicalMin * 0.2,
            40,
          );
          const localX = lastPt.x - (gridArea?.x || 0);
          const localY = lastPt.y - (gridArea?.y || 0);
          knockLettersAt(localX, localY, {
            radius: lettersRadius,
            strength: 12,
            source: 'line',
          });
        }
      } catch {}
      const includeCurrent = !previewGid;
      // drawIntoBackOnly(includeCurrent);
      // pendingPaintSwap = true;
    }
  }
  function onPointerUp(e){
    dgInputTrace('paint:up', { pointerId: e.pointerId, buttons: e.buttons, drawing, pendingNodeTap: !!pendingNodeTap, draggedNode: !!draggedNode, hasCur: !!cur, usingBackBuffers, pendingPaintSwap });
    if (typeof window !== 'undefined' && window.__DG_POINTER_TRACE) {
      if (__dgPointerTraceId === e.pointerId) {
        __dgPointerTraceLocal('up', e, pointerToPaintLogical(e));
        __dgPointerTraceId = null;
        __dgPointerTraceMoveLogged = false;
      }
    }
    dgPaintTrace('pointer:up', { pointerId: e.pointerId, buttons: e.buttons, isPrimary: e.isPrimary, zoomMode, zoomGestureActive });

    // Resume tutorial highlights after manual drawing completes.
    resumeTutorialHighlightAfterDraw();

    __dgSkipSwapsDuringDrag = false;
    // Only defer/blank if a *zoom commit* is actually settling.
    const now = performance?.now?.() ?? Date.now();
    const settleTs = (typeof window !== 'undefined') ? window.__GESTURE_SETTLE_UNTIL_TS : 0;
    const inZoomCommit = Number.isFinite(settleTs) && settleTs > now;

    if (inZoomCommit) {
      __dgDeferUntilTs = Math.max(__dgDeferUntilTs, settleTs);
      __dgStableFramesAfterCommit = 0;          // only reset when a zoom commit is settling
      __dgNeedsUIRefresh = true;                // schedule safe clears
    } else {
      // No zoom commit -> do NOT schedule the deferred clears here
      // (avoids one-frame blank/freeze of particles/text on simple pointerup)
    }
    // IMPORTANT: do not clear here; renderLoop will do it safely.
    if (draggedNode) {
      const finalDetail = { col: draggedNode.col, row: draggedNode.row, group: draggedNode.group ?? null };
      const didMove = !!draggedNode.moved;
      if (didMove || inZoomCommit) __dgNeedsUIRefresh = true;
      emitDrawgridUpdate({ activityOnly: false });
      if (didMove) {
        try { panel.dispatchEvent(new CustomEvent('drawgrid:node-drag-end', { detail: finalDetail })); } catch {}
        try {
          const cx = gridArea.x + draggedNode.col * cw + cw * 0.5;
          const cy = gridArea.y + topPad + draggedNode.row * ch + ch * 0.5;
          const baseRadius = Math.max(6, Math.min(cw, ch) * 0.5);
          spawnNoteRingEffect(cx, cy, baseRadius);
          dgField?.pulse?.(0.25);
          const wrapRect = wrap?.getBoundingClientRect?.();
          if (wrapRect && wrapRect.width && wrapRect.height) {
            const localX = (wrapRect.width * 0.5) - (gridArea?.x || 0);
            const localY = (wrapRect.height * 0.5) - (gridArea?.y || 0);
            knockLettersAt(localX, localY, { radius: 80, strength: 10 });
          }
        } catch {}
      }
      draggedNode = null;
      setDragScaleHighlight(null);
      setDrawingState(false);
      paint.style.cursor = 'default';
      return;
    }

    // Tap on a node toggles column active state
    if (pendingNodeTap) {
      const col = pendingNodeTap.col;
      const row = pendingNodeTap.row;
      if (!currentMap) {
        currentMap = {
          active:Array(cols).fill(false),
          nodes:Array.from({length:cols},()=>new Set()),
          disabled:Array.from({length:cols},()=>new Set()),
        };
      }

      const dis = persistentDisabled[col] || new Set();
      if (dis.has(row)) dis.delete(row); else dis.add(row);
      persistentDisabled[col] = dis;
      currentMap.disabled[col] = dis;
      // Recompute column active: any node present and not disabled
      const anyOn = Array.from(currentMap.nodes[col] || []).some(r => !dis.has(r));
      currentMap.active[col] = anyOn;

      __dgBumpNodesRev('node-toggle');

      // Flash feedback on toggle
      flashes[col] = 1.0;
      useBackBuffers();
      drawGrid();
      drawNodes(currentMap.nodes);
      // We just redrew static layers, so treat them as clean.
      panel.__dgStaticDirty = false;
      __dgNeedsUIRefresh = true;
      FD.flowLog('node-toggle', {
        col,
        row,
        active: currentMap?.active?.[col] ?? null,
        disabledCount: currentMap?.disabled?.[col]?.size ?? null,
      });
      requestFrontSwap(useFrontBuffers);
      emitDrawgridUpdate({ activityOnly: false });
      panel.dispatchEvent(new CustomEvent('drawgrid:node-toggle', { detail: { col, row, disabled: dis.has(row) } }));
      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('drawgrid:refresh-all', {
            detail: { sourcePanelId: panel?.id || null }
          }));
        }
      } catch {}

      const cx = gridArea.x + col * cw + cw * 0.5;
      const cy = gridArea.y + topPad + row * ch + ch * 0.5;
      const baseRadius = Math.max(6, Math.min(cw, ch) * 0.5);
      spawnNoteRingEffect(cx, cy, baseRadius);
      try {
        dgField?.pulse?.(0.25);
        const wrapRect = wrap?.getBoundingClientRect?.();
        if (wrapRect && wrapRect.width && wrapRect.height) {
          const localX = (wrapRect.width * 0.5) - (gridArea?.x || 0);
          const localY = (wrapRect.height * 0.5) - (gridArea?.y || 0);
          knockLettersAt(localX, localY, { radius: 80, strength: 10 });
        }
      } catch {}

      pendingNodeTap = null;
      setDrawingState(false);
      return; // handled as a tap, skip stroke handling
    }

    // If we were capturing the pointer but ended up not drawing or toggling anything,
    // we may still be in back-buffer mode from pointerdown. Do a safe no-op swap to
    // avoid a single-frame blank on release.
    if (!drawing) {
      // Background tap: only swap if we truly staged something.
      const needSwap = usingBackBuffers || pendingPaintSwap;
      if (needSwap) {
        if (!usingBackBuffers) ensureBackVisualsFreshFromFront();
        __dgNeedsUIRefresh = true;
        DG.log('onPointerUp: coalesced swap (staged)', { usingBackBuffers, pendingPaintSwap });
        pendingPaintSwap = true;
        requestFrontSwap(useFrontBuffers);
      } else {
        __dgNeedsUIRefresh = false;
        // Nothing staged - don't poke the overlay clears; keeping visuals intact avoids a one-frame blank.
        DG.log('onPointerUp: no-op (no swap needed)');
      }
      return;
    }
    setDrawingState(false);
    if (cur) {
      try {
        const finalPaintPt = pointerToPaintLogical(e);
        const lastPt = cur.pts[cur.pts.length - 1];
        if (!lastPt || Math.hypot((lastPt.x ?? 0) - finalPaintPt.x, (lastPt.y ?? 0) - finalPaintPt.y) > 0.25) {
          cur.pts.push(finalPaintPt);
        }
      } catch {}
    }
    const strokeToProcess = cur;
    cur = null;
    FD.flowLog('pointer:up', {
      strokePts: strokeToProcess?.pts?.length || 0,
      hadPreview: !!previewGid,
    });

    // If we were previewing a special line, mark it but let the commit redraw handle visibility.
    if (strokeToProcess && previewGid) {
      try {
        if (!strokeToProcess.generatorId) {
          strokeToProcess.generatorId = previewGid;
        }
      } catch {}
      try { previewGid = null; } catch {}
    }

    if (!strokeToProcess) {
      // This was a background tap, not a drag that started on a node.
      // Fire activity event but don't modify strokes.
      emitDrawgridUpdate({ activityOnly: true });
      return;
    }

    // If the stroke was just a tap, don't treat it as a drawing.
    if (strokeToProcess.pts.length <= 1) {
      emitDrawgridUpdate({ activityOnly: true });
      return;
    }

    const isZoomed = panel.classList.contains('toy-zoomed');
    let shouldGenerateNodes = true;
    let generatorId = null;

    if (isZoomed) {
        const hasLine1 = strokes.some(s => s.generatorId === 1);
        const hasLine2 = strokes.some(s => s.generatorId === 2);

        if (!hasLine1) {
            // No lines exist, this new one is Line 1.
            shouldGenerateNodes = true;
            isSpecial = true;
            generatorId = 1;
        } else if (nextDrawTarget) {
            // A "Draw Line" button was explicitly clicked.
            shouldGenerateNodes = true;
            isSpecial = true;
            generatorId = nextDrawTarget;
            nextDrawTarget = null; // consume target so subsequent swipes follow natural order
        } else {
            // No target armed: decorative line (no nodes)
            shouldGenerateNodes = false;
        }
        nextDrawTarget = null; // Always reset after a draw completes
        try { (panel.__dgUpdateButtons || updateGeneratorButtons)(); } catch(e){ }
    } else { // Standard view logic (unchanged)
        const hasNodes = currentMap && currentMap.nodes.some(s => s.size > 0);
        // If a special line already exists, this new line is decorative.
        // If the user wants to draw a *new* generator line, they should clear first.
        const hasSpecialLine = strokes.some(s => s.isSpecial || s.generatorId);
        if (hasSpecialLine) {
            shouldGenerateNodes = false;
        } else {
            shouldGenerateNodes = true; // Explicitly set to true
            generatorId = 1; // Standard view's first line is functionally Line 1
            // In standard view, a new generator line should replace any old decorative lines.
            strokes = [];
        }
    }
    
    const isSpecial = !!shouldGenerateNodes;
    strokeToProcess.isSpecial = isSpecial;
    strokeToProcess.justCreated = true;

    if (isSpecial) {
      strokeToProcess.generatorId = generatorId || 1;
    } else {
      delete strokeToProcess.generatorId;
      strokeToProcess.overlayColorize = false;
    }

    if (DG_DEBUG) {
      console.debug('[DG][commit]', {
        mode: panel.classList.contains('toy-zoomed') ? 'zoomed' : 'standard',
        shouldGenerateNodes,
        isSpecial,
        generatorId: strokeToProcess.generatorId ?? null,
      });
    }

    emitDG('commit', {
      mode: panel.classList.contains('toy-zoomed') ? 'zoomed' : 'standard',
      shouldGenerateNodes,
      isSpecial,
      generatorId: strokeToProcess.generatorId ?? null,
      pts: strokeToProcess.pts?.length || 0
    });

    strokes.push(strokeToProcess);
    markUserChange('stroke-commit');

    // Redraw back for consistency, and regenerate nodes
    clearAndRedrawFromStrokes(null, 'stroke-commit');
    pendingPaintSwap = usingBackBuffers;

    // Commit: redraw ink to the visible paint surface (front).
    // In single-canvas mode, the composite pass already handles this.
    if (!DG_SINGLE_CANVAS) {
      pctx = getActivePaintCtx();
      resetPaintBlend(pctx);
      if (pctx) {
        R.withLogicalSpace(pctx, () => {
          // Clear the front paint canvas before redrawing all strokes so
          // we don't leave the full-opacity live stroke underneath.
          const surface = pctx.canvas;
          const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
          const width = cssW || (surface?.width ?? 0) / scale;
          const height = cssH || (surface?.height ?? 0) / scale;
          pctx.clearRect(0, 0, width, height);

          // Now redraw all strokes with the correct alpha (visual-only lines
          // use VISUAL_ONLY_ALPHA via getPathAlpha in drawFullStroke).
          for (const s of strokes) drawFullStroke(pctx, s);
        });
      }
    }
    // Keep back buffer fresh if we use it
    if (usingBackBuffers && typeof ensureBackVisualsFreshFromFront === 'function') {
      try { ensureBackVisualsFreshFromFront(); } catch {}
    }
    __dgMarkSingleCanvasDirty(panel);
    if (DG_SINGLE_CANVAS && isPanelVisible) {
      try {
        markStaticDirty('external-state-change');
        compositeSingleCanvas();
      } catch {}
      panel.__dgSingleCompositeDirty = false;
    }
    // No swap needed
    __dgNeedsUIRefresh = true;
    // After drawing, unmark all strokes so they become part of the normal background for the next operation.
    strokes.forEach(s => delete s.justCreated);
    schedulePersistState({ source: 'stroke-commit' });
    try { window.Persistence?.flushAutosaveNow?.(); } catch {}

    // First successful line -> fade out the DRAW label.
    try {
      if (!drawLabelState.hasDrawnFirstLine && strokeToProcess?.pts?.length > 1) {
        fadeOutDrawLabel({ immediate: false });
      }
    } catch {}

    try {
      syncLetterFade();
    } catch (e) { /* ignore */ }
    try { previewGid = null; } catch {}
    nextDrawTarget = null;
    try {
      const updateButtons = panel.__dgUpdateButtons || updateGeneratorButtons;
      if (typeof updateButtons === 'function') updateButtons();
    } catch {}
  }

  // A version of snapToGrid that analyzes a single stroke object instead of the whole canvas
  function snapToGridFromStroke(stroke) {
    // Check for cached nodes, but only if the column count matches.
    if (stroke.cachedNodes && stroke.cachedCols === cols) {
      return stroke.cachedNodes;
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = paint.width;
    tempCanvas.height = paint.height;
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
    if (!tempCtx) return {
        active: Array(cols).fill(false),
        nodes: Array.from({length:cols}, ()=> new Set()),
        disabled: Array.from({length:cols}, ()=> new Set())
    };

    tempCtx.save();
    tempCtx.globalCompositeOperation = 'source-over';
    tempCtx.globalAlpha = 1;
    tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
    tempCtx.restore();

    drawFullStroke(tempCtx, stroke);
    // Pass the temporary context to the main snapToGrid function
    const result = snapToGrid(tempCtx);
    // Cache the result against the current column count.
    try { stroke.cachedNodes = result; stroke.cachedCols = cols; } catch {}
    return result;
  }

  // Debug capture-phase listeners so we can see events even if they miss the paint canvas.
  // (These only run when __DG_INPUT_TRACE is enabled.)
  panel.addEventListener('pointerdown', (e) => {
    if (typeof window !== 'undefined' && window.__DG_INPUT_TRACE) {
      dgInputTrace('capture:panel:down', {
        targetRole: e?.target?.getAttribute?.('data-role') || e?.target?.id || e?.target?.className || null,
        pointerId: e.pointerId,
        buttons: e.buttons,
        isPrimary: e.isPrimary,
      });
    }
  }, { capture: true });

  panel.addEventListener('pointermove', (e) => {
    if (typeof window !== 'undefined' && window.__DG_INPUT_TRACE) {
      dgInputTrace('capture:panel:move', { pointerId: e.pointerId, buttons: e.buttons, isPrimary: e.isPrimary });
    }
  }, { capture: true });

  panel.addEventListener('pointerup', (e) => {
    if (typeof window !== 'undefined' && window.__DG_INPUT_TRACE) {
      dgInputTrace('capture:panel:up', { pointerId: e.pointerId, buttons: e.buttons, isPrimary: e.isPrimary });
    }
  }, { capture: true });

  paint.addEventListener('pointerdown', onPointerDown);
  paint.addEventListener('pointermove', onPointerMove);
  paint.addEventListener('pointerleave', () => {
    paint.style.cursor = 'default';
  });
  window.addEventListener('pointerup', onPointerUp);
  panel.addEventListener('drawgrid:playcol', (e) => {
    const col = e?.detail?.col;
    playheadCol = col;
    if (col >= 0 && col < cols) {
        if (currentMap?.active[col]) {
            let pulseTriggered = false;
            flashes[col] = 1.0;
            // Add flashes for the grid cells that are playing
            const nodesToFlash = currentMap.nodes[col];
            if (nodesToFlash && nodesToFlash.size > 0) {
                for (const row of nodesToFlash) {
                    const isDisabled = currentMap.disabled?.[col]?.has(row);
                    if (!isDisabled) {
                        if (!pulseTriggered) {
                            requestPanelPulse(panel, { rearm: true });
                            pulseTriggered = true;
                        }
                          cellFlashes.push({ col, row, age: 1.0 });
                          __dgMarkOverlayDirty(panel);
                          try {
                              const x = gridArea.x + col * cw + cw * 0.5;
                              const y = gridArea.y + topPad + row * ch + ch * 0.5;

                              // Radius roughly the size of a grid square
                              const nodeRadiusToy = Math.max(10, Math.min(cw, ch) * 0.55);

                              // New local pink burst (no knockback, just visuals)
                              try {
                                if (typeof window !== 'undefined' && window.__DG_NOTE_BURST_TRACE) {
                                  console.log('[DG][burst][spawn]', {
                                    panelId: panel?.id || null,
                                    col, row,
                                    x, y,
                                    cw, ch,
                                    topPad,
                                    gridArea: gridArea ? { x: gridArea.x, y: gridArea.y, w: gridArea.w, h: gridArea.h } : null,
                                    paintDpr,
                                    flash: fctx?.canvas ? { w: fctx.canvas.width, h: fctx.canvas.height } : null,
                                    playhead: playheadFrontCtx?.canvas ? { w: playheadFrontCtx.canvas.width, h: playheadFrontCtx.canvas.height } : null,
                                  });
                                }
                              } catch {}
                              spawnNoteBurst(x, y, nodeRadiusToy);

                              // Existing ring effect
                              const ringRadius = Math.max(6, Math.min(cw, ch) * 0.5);
                              spawnNoteRingEffect(x, y, ringRadius);

                              // Keep the subtle global "breathe" pulse if you like
                              dgField?.pulse?.(0.8);
                          } catch (e) {}
                    }
                }
            }
        }
    }
  });

  let rafId = 0;

  // Hard offscreen culling:
  // Stop the per-panel rAF loop entirely when the panel is offscreen and nothing is pending.
  // Resume when the panel becomes visible again (IntersectionObserver) or when work is requested.
  function ensureRenderLoopRunning() {
    if (rafId) return;
    rafId = requestAnimationFrame(renderLoop);
  }

  // Static layer caching:
  // "Static" = grid + nodes (and anything that doesn't animate every frame).
  // We redraw static layers only when marked dirty, never because of gestures.
  panel.__dgStaticDirty = true;
  function markStaticDirty(reason) {
    panel.__dgStaticDirty = true;
    // Composite base depends on static layers.
    try { panel.__dgCompositeBaseDirty = true; } catch {}
    try { panel.__dgSingleCompositeDirty = true; } catch {}
    // If you later add any other "base" caches, mark them here too.
    try { panel.__dgLastStaticDirtyReason = reason || 'unknown'; } catch {}
    ensureRenderLoopRunning();
  }

  // Debug FPS (per-panel)
  // Only used when DG_DEBUG && window.DEBUG_DRAWGRID === 1.
  let __dgFpsLastTs = 0;
  let __dgFpsFrameCount = 0;
  let __dgFpsValue = 0;

  // Per-panel lightweight profiling for renderLoop + drawGrid.
  // This is separate from the global DG_PROFILE sampling at the top,
  // and logs once per panel per ~1 second when DG_PROFILE is true.
  let __dgFrameProfileFrames = 0;
  let __dgFrameProfileSumMs = 0;
  let __dgFrameProfileMinMs = Infinity;
  let __dgFrameProfileMaxMs = 0;
  let __dgFrameProfileLastLogTs = 0;

  let __dgParticleStateCache = { key: '', ts: 0, value: null, hadField: false };
  function updatePanelParticleState(boardScaleValue, panelVisible) {
    const nowTs = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
    // Boot grace: on fresh load / restore, allow the particle field to spin up even
    // before any interaction (prevents "no particles until poke").
    try {
      if (!Number.isFinite(panel.__dgParticlesWarmBootUntil)) {
        panel.__dgParticlesWarmBootUntil = nowTs + 1200;
        // Count as a "poke" too so offscreen culling doesn't block the warm start.
        __dgParticlePokeTs = nowTs;
      }
    } catch {}
    const warmBoot = (Number.isFinite(panel.__dgParticlesWarmBootUntil) && nowTs < panel.__dgParticlesWarmBootUntil);
    const recentPoke = warmBoot || (Number.isFinite(__dgParticlePokeTs) && (nowTs - __dgParticlePokeTs) <= DG_PARTICLE_POKE_GRACE_MS);
    if (!panelVisible && !recentPoke) {
      dgParticleBootLog('visibility:skip-offscreen', {
        panelId: panel?.id || null,
        panelVisible,
        warmBoot,
        recentPoke,
      });
      particleFieldEnabled = false;
      return __dgParticleStateCache?.value || null;
    }
    const overviewState = (typeof window !== 'undefined' && window.__overviewMode) ? window.__overviewMode : { isActive: () => false, state: { zoomThreshold: 0.36 } };
    const inOverview = !!overviewState?.isActive?.();
    const visiblePanels = Math.max(0, Number(globalDrawgridState?.visibleCount) || 0);
    const hasField = !!dgField;
    const cacheKey = `${visiblePanels}|${inOverview ? 1 : 0}|${hasField ? 1 : 0}`;
    if (
      __dgParticleStateCache &&
      __dgParticleStateCache.key === cacheKey &&
      __dgParticleStateCache.hadField === hasField &&
      (nowTs - __dgParticleStateCache.ts) < 350
    ) {
      return __dgParticleStateCache.value;
    }
    let adaptive = getGlobalAdaptiveState();
    if (!adaptive) adaptive = updateAdaptiveShared(true);
    const particleBudget = adaptive?.particleBudget;
    const threshold = Number.isFinite(overviewState?.state?.zoomThreshold) ? overviewState.state.zoomThreshold : 0.36;
    const zoomTooWide = Number.isFinite(boardScaleValue) && boardScaleValue < threshold;
      const allowField = !inOverview && !zoomTooWide;
      // Warm boot: ensure particles come up at full density on refresh/creation,
      // even if global adaptive signals are temporarily pessimistic.
      const allowFieldWarm = warmBoot ? true : allowField;
      const fpsSample = Number.isFinite(adaptive?.smoothedFps)
        ? adaptive.smoothedFps
        : (Number.isFinite(adaptive?.fps) ? adaptive.fps : null);
      const emergencyMode = !!adaptive?.emergencyMode;
      // Keep fields on, but thin them out when many panels are visible.
      // Do not vary by focus state so particles feel consistent across panels.
      particleFieldEnabled = !!allowFieldWarm;
      dgParticleBootLog('state:allow', {
        panelId: panel?.id || null,
        inOverview,
        zoomTooWide,
        allowField,
        warmBoot,
        allowFieldWarm,
        particleFieldEnabled,
        visiblePanels,
      });
    panel.__dgParticleStateFlags = { inOverview, zoomTooWide };

    if (dgField && typeof dgField.applyBudget === 'function' && particleBudget) {
      const round = (v) => Math.round((Number.isFinite(v) ? v : 0) * 10000) / 10000;
      const maxCountScaleBase = (particleBudget.maxCountScale ?? 1) * (particleBudget.capScale ?? 1);
      const zoomGesturing = (typeof window !== 'undefined' && window.__mtZoomGesturing === true);
      const zoomGestureMoving = !!(zoomGesturing && __lastZoomMotionTs && (nowTs - __lastZoomMotionTs) < ZOOM_STALL_MS);
      const fpsDamp = (() => {
        if (!Number.isFinite(fpsSample)) return 1;
        if (fpsSample >= 55) return 1;
        if (fpsSample <= 35) return 0.45;
        return 0.45 + ((fpsSample - 35) / 20) * 0.55;
      })();
      const gestureDamp = zoomGestureMoving
        ? (visiblePanels >= 12 ? 0.5 : (visiblePanels >= 6 ? 0.62 : 0.72))
        : 1;
      // Crowd-based attenuation: more visible panels -> fewer particles per panel.
      const crowdScale = (() => {
        const base = 1 / Math.max(1, visiblePanels);
        if (visiblePanels <= 6) return Math.max(0.14, base);
        const minScale =
          visiblePanels >= 36 ? 0.03 :
          visiblePanels >= 24 ? 0.04 :
          visiblePanels >= 16 ? 0.055 :
          0.075;
        return Math.max(minScale, base);
      })();
      // If we're cruising near 60fps with few panels, allow a modest boost above nominal.
      const fpsBoost = (Number.isFinite(fpsSample) && fpsSample >= 58 && visiblePanels <= 2)
        ? Math.min(1.3, 1 + 0.02 * (fpsSample - 58))
        : 1;

      const emergencyScale = emergencyMode ? 0.45 : 1;
      const emergencySize = emergencyMode ? 1.1 : 1;
      const perfDamp = Math.min(fpsDamp, gestureDamp);
      panel.__dgParticleKnockbackMul = Math.min(8, 1 / Math.max(0.2, perfDamp));
      if (dgField?._config) {
        if (!Number.isFinite(panel.__dgFieldBaseReturnSeconds)) {
          panel.__dgFieldBaseReturnSeconds = Number(dgField._config.returnSeconds) || 2.4;
        }
        if (!Number.isFinite(panel.__dgFieldBaseForceMul)) {
          panel.__dgFieldBaseForceMul = Number(dgField._config.forceMul) || 2.5;
        }
        const baseReturn = panel.__dgFieldBaseReturnSeconds;
        const returnMul = Math.min(3, panel.__dgParticleKnockbackMul || 1);
        dgField._config.returnSeconds = Math.max(0.35, baseReturn / returnMul);
        const baseForce = panel.__dgFieldBaseForceMul;
        dgField._config.forceMul = Math.min(10, baseForce * (panel.__dgParticleKnockbackMul || 1));
      }
      // "Perf panic" = we're overloaded but not necessarily at catastrophic FPS.
      // We respond by shedding particle count quickly (not throttling cadence).
      const __dgCurFpsSample =
        Number.isFinite(fpsSample) ? fpsSample :
        ((typeof window !== 'undefined' && Number.isFinite(window.__MT_SM_FPS)) ? window.__MT_SM_FPS :
        ((typeof window !== 'undefined' && Number.isFinite(window.__MT_FPS)) ? window.__MT_FPS : 60));

      // Perf Lab test harness: drive particle LOD using the forced FPS override
      // (otherwise rAF-based FPS sampling can stay ~60 even when Target FPS is set).
      const __dgFpsOverride =
        (typeof window !== 'undefined' && Number.isFinite(window.__DG_FPS_TEST_OVERRIDE) && window.__DG_FPS_TEST_OVERRIDE > 0)
          ? window.__DG_FPS_TEST_OVERRIDE
          : 0;
      const __dgFpsDriveSample = (__dgFpsOverride > 0) ? __dgFpsOverride : __dgCurFpsSample;

      // Auto quality scale (used by the DPR hook) should also influence particles.
      const __dgAutoQ = (() => { try { return getAutoQualityScale?.(); } catch { return 1; } })();
      const __dgAutoQClamped = (Number.isFinite(__dgAutoQ) && __dgAutoQ > 0) ? Math.max(0.05, Math.min(1.0, __dgAutoQ)) : 1;
      // Quality multiplier
      // We want particles to respond like they would in real perf pressure:
      // take the *strongest* reduction signal (i.e. the minimum).
      // - FPS: 30fps => 1, 5fps => ~0.166
      // - AutoQ: global quality scaler (0..1)
      const __dgFpsMul = Math.max(0.05, Math.min(1.0, (__dgFpsDriveSample || 60) / 30));
      const __dgParticleQualityMul = Math.min(__dgAutoQClamped, __dgFpsMul);
      // Persist for renderLoop readout + debug (avoid scope issues).
      try { panel.__dgParticleQualityMul = __dgParticleQualityMul; } catch {}
      const perfPanicBase =
        (visiblePanels >= 12 && __dgFpsDriveSample < 45) ||
        (visiblePanels >= 18 && __dgFpsDriveSample < 50) ||
        (__dgFpsDriveSample < 35);
      // When the Quality Lab is forcing a low FPS *for testing*, do NOT treat that as a "panic".
      // We still want to shed particle density, but we should keep the field alive so we can observe behaviour.
      const perfPanic = (!(__dgFpsOverride > 0)) && perfPanicBase;

      const panicScale = perfPanic ? 0.22 : 1;
      let maxCountScale = Math.max(0.0, maxCountScaleBase * crowdScale * fpsBoost * emergencyScale * perfDamp * panicScale * __dgParticleQualityMul);
      let capScale = Math.max(0.0, (particleBudget.capScale ?? 1) * crowdScale * fpsBoost * emergencyScale * perfDamp * panicScale * __dgParticleQualityMul);
      const sizeScale = (particleBudget.sizeScale ?? 1) * emergencySize * (perfDamp < 0.8 ? 1.05 : 1);
      let spawnScale = Math.max(0.0, (particleBudget.spawnScale ?? 1) * crowdScale * fpsBoost * emergencyScale * perfDamp * (perfPanic ? 0.0 : 1) * __dgParticleQualityMul);

      // ---------------------------------------------------------------------
      // Perf Lab test harness behaviour:
      // When Target FPS is forced (e.g. 5fps), we want the field to shed
      // particles rapidly but NOT "freeze" immediately. So keep a small,
      // non-zero minCount and avoid letting cap/max collapse to ~0.
      // ---------------------------------------------------------------------
      const __dgTestFps = (typeof window !== 'undefined' && Number.isFinite(window.__DG_FPS_TEST_OVERRIDE) && window.__DG_FPS_TEST_OVERRIDE > 0)
        ? window.__DG_FPS_TEST_OVERRIDE
        : 0;
      const __dgTestMode = (__dgTestFps > 0) || (__dgFpsOverride > 0);
      if (__dgTestMode) {
        // Keep simulation alive while it fades down.
        maxCountScale = Math.max(maxCountScale, 0.08);
        capScale = Math.max(capScale, 0.08);
        // If we are forcing *very* low FPS for testing, shed density aggressively.
        // (This is about visual verification, not performance rescue.)
        if (__dgFpsDriveSample <= 10) {
          maxCountScale = Math.min(maxCountScale, 0.10);
          capScale = Math.min(capScale, 0.10);
          spawnScale = 0.0;
        }
        // Spawn can still be zero in test mode; we just want existing particles to animate while fading.
        spawnScale = Math.max(0.0, spawnScale);
      }

      // Persist resolved scalars for the tick gate (avoids expensive tick when effectively off).
      panel.__dgParticleBudgetMaxCountScale = maxCountScale;
      panel.__dgParticleBudgetCapScale = capScale;
      panel.__dgParticleBudgetSpawnScale = spawnScale;
      // Keep tick cadence steady for smooth lerps; rely on lower counts for performance.
      const tickModulo = 1;
      // If budgets drop to ~0, fully disable particle SIM for this panel (draw stays smooth).
      // We allow counts to ramp down to zero, then stop ticking the field to avoid per-frame cost.
      //
      // IMPORTANT: In worst-case scenes, the adaptive scalars may not naturally reach ~0,
      // so add a "hard emergency" off-ramp that triggers only when we are clearly overwhelmed
      // (very low FPS + many visible drawgrids). This preserves smoothness (no cadence stepping)
      // while eliminating the expensive dgField.tick() work.
      const __dgCurFps =
        // If the perf lab is forcing a low FPS for testing, don't trip "hard emergency" based on that.
        (__dgFpsOverride > 0 && Number.isFinite(fpsSample)) ? fpsSample :
        ((typeof window !== 'undefined' && Number.isFinite(window.__MT_SM_FPS)) ? window.__MT_SM_FPS :
        ((typeof window !== 'undefined' && Number.isFinite(window.__MT_FPS)) ? window.__MT_FPS : 60));
      const __dgCurFpsDrive = (__dgFpsOverride > 0) ? __dgFpsOverride : __dgCurFps;
      const __dgVisible = Number.isFinite(globalDrawgridState?.visibleCount) ? globalDrawgridState.visibleCount : 0;
      // "Hard emergency" off-ramp: only used when we are clearly overwhelmed.
      // This should trigger in the perf-lab worst-case scenes so we can fully skip dgField.tick().
      const __dgHardEmergencyOff =
        (__dgCurFpsDrive < 14) || // catastrophic FPS, regardless of count
        (__dgVisible >= 12 && __dgCurFpsDrive < 22) ||
        (__dgVisible >= 20 && __dgCurFpsDrive < 28);

      // -----------------------------------------------------------------------
      // Debug: color the toy by quality (red=low, green=high), throttled
      // Toggle with: window.__DG_STATE_COLOR = true/false
      // -----------------------------------------------------------------------
      try {
        const on = (typeof window !== 'undefined') ? !!window.__DG_STATE_COLOR : false;
        if (!on) {
          if (panel.__dgQualColorApplied) {
            panel.__dgQualColorApplied = false;
            panel.style.outline = '';
            panel.style.outlineOffset = '';
          }
        } else {
          const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          const lastTs = Number.isFinite(panel.__dgQualColorTs) ? panel.__dgQualColorTs : 0;
          if (!lastTs || (now - lastTs) > 250) {
            panel.__dgQualColorTs = now;
            const q = __dgParticleQualityMul; // same “testable” quality signal particles now use
            const tier = (q <= 0.40) ? 'low' : (q >= 0.85 ? 'high' : 'med');
            if (tier !== panel.__dgQualColorTier) {
              panel.__dgQualColorTier = tier;
              panel.__dgQualColorApplied = true;
              const col =
                (tier === 'low') ? 'rgba(255, 70, 70, 0.95)' :
                (tier === 'high') ? 'rgba(70, 255, 110, 0.95)' :
                'rgba(255, 190, 70, 0.95)';
              panel.style.outline = `3px solid ${col}`;
              panel.style.outlineOffset = '-3px';
            }
          }
        }
      } catch {}

      // In test mode, we want "shed density" rather than "freeze/off".
      // Only allow a full off-ramp in true hard emergency (real catastrophic).
      const particlesOffWanted =
        // Never fully turn the field off in Quality Lab test mode; we want to observe behaviour.
        (!__dgTestMode && __dgHardEmergencyOff) ||
        (!__dgTestMode && (maxCountScale < 0.02 && capScale < 0.02 && spawnScale < 0.02)) ||
        !particleFieldEnabled;

      if (particlesOffWanted && !panel.__dgParticlesOff) {
        panel.__dgParticlesOff = true;
        // Ensure the tick gate sees "effectively off" immediately, even before the next adaptive pass.
        panel.__dgParticleBudgetMaxCountScale = 0;
        panel.__dgParticleBudgetCapScale = 0;
        panel.__dgParticleBudgetSpawnScale = 0;
        // Force a final budget apply so any existing particles can fade out quickly.
        panel.__dgParticleBudgetKey = '';
        dgField.applyBudget({
          maxCountScale: 0,
          capScale: 0,
          sizeScale,
          spawnScale: 0,
          tickModulo,
          minCount: 0,
          emergencyFade: true,
          emergencyFadeSeconds: 1.0,
        });
      } else if (!particlesOffWanted && panel.__dgParticlesOff) {
        // Re-enable; normal budget application below will regen naturally.
        panel.__dgParticlesOff = false;
        // Clear persisted scalars; they will be repopulated by the normal adaptive budget path.
        panel.__dgParticleBudgetMaxCountScale = null;
        panel.__dgParticleBudgetCapScale = null;
        panel.__dgParticleBudgetSpawnScale = null;
        panel.__dgParticleBudgetKey = '';
      }
      // Warm-start: ensure restored and newly created toys start at full density,
      // then quickly converge to the correct density for current FPS.
      try {
        if (!Number.isFinite(panel.__dgParticlesWarmStartUntil)) {
          panel.__dgParticlesWarmStartUntil = nowTs + 1200;
        }
      } catch {}
      const __dgWarm = (Number.isFinite(panel.__dgParticlesWarmStartUntil) && nowTs < panel.__dgParticlesWarmStartUntil);
      if (panel.__dgParticlesWarmStartActive !== __dgWarm) {
        panel.__dgParticlesWarmStartActive = __dgWarm;
        dgParticleBootLog('warm-start:state', {
          panelId: panel?.id || null,
          warmStart: __dgWarm,
          nowTs,
          until: panel.__dgParticlesWarmStartUntil,
        });
      }
      if (__dgWarm) {
        // Force full density during warm start (refresh/create) so particles
        // never boot at "empty" even if adaptive signals are pessimistic.
        maxCountScale = Math.max(1.0, maxCountScale);
        capScale = Math.max(1.0, capScale);
        spawnScale = Math.max(1.0, spawnScale);
      }
      dgParticleBootLog('budget:pre-apply', {
        panelId: panel?.id || null,
        warmStart: __dgWarm,
        maxCountScale,
        capScale,
        sizeScale,
        spawnScale,
        tickModulo,
        emergencyMode,
        particleFieldEnabled,
      });
      const budgetKey = [
        round(maxCountScale),
        round(capScale),
        round(sizeScale),
        round(spawnScale),
        tickModulo,
        __dgLowFpsMode ? 1 : 0,
        emergencyMode ? 1 : 0,
        particleFieldEnabled ? 1 : 0,
      ].join('|');
      if (!panel.__dgParticlesOff && panel.__dgParticleBudgetKey !== budgetKey) {
        panel.__dgParticleBudgetKey = budgetKey;
        dgField.applyBudget({
          maxCountScale,
          capScale,
          tickModulo,
          sizeScale,
          spawnScale: __dgWarm ? Math.max(spawnScale, 1.0) : spawnScale,
          // When overloaded, shed particle count quickly (still ticking every frame).
          emergencyFade: !!perfPanic || __dgTestMode,
          // In test mode, fade down faster so you see it respond immediately.
          emergencyFadeSeconds: __dgTestMode ? 0.85 : (perfPanic ? 1.1 : 2.2),
          // In test mode, keep a visible floor so the field continues to animate.
          minCount: __dgWarm ? 600 : (__dgTestMode ? 120 : (perfPanic ? 0 : 50)),
        });
        try {
          const st = dgField?._state || null;
          dgParticleBootLog('budget:state', {
            panelId: panel?.id || null,
            particles: Array.isArray(st?.particles) ? st.particles.length : null,
            targetDesired: Number.isFinite(st?.targetDesired) ? st.targetDesired : null,
            minParticles: Number.isFinite(st?.minParticles) ? st.minParticles : null,
            lodScale: Number.isFinite(st?.lodScale) ? st.lodScale : null,
          });
        } catch {}
        try {
          if (__dgWarm) {
            const st = dgField?._state || null;
            const needsSeed = !st || !Array.isArray(st.particles) || st.particles.length === 0;
            if (needsSeed && typeof dgField?.forceSeed === 'function') {
              const seeded = dgField.forceSeed();
              dgParticleBootLog('budget:seed', {
                panelId: panel?.id || null,
                seeded,
              });
            }
          }
        } catch {}
        dgParticleBootLog('budget:applied', {
          panelId: panel?.id || null,
          budgetKey,
          warmStart: __dgWarm,
        });

        // -------------------------------------------------------------------
        // IMPORTANT: Some particle-field builds may ignore applyBudget() fields
        // like maxCountScale/tickModulo. To keep the Quality Lab reliable,
        // clamp the internal desired count/config directly as a backstop.
        // (This should preserve the same "fade toward target" behaviour as
        // natural FPS pressure, but ensures the target actually changes.)
        // -------------------------------------------------------------------
        try {
          const st = dgField?._state || null;
          const cfg = dgField?._config || null;
          // Capture a stable "base" count once, so scaling is consistent.
          if (!Number.isFinite(panel.__dgParticlesBaseCount) || panel.__dgParticlesBaseCount <= 0) {
            const curCount = Array.isArray(st?.particles) ? st.particles.length : 0;
            const cfgMax =
              Number.isFinite(cfg?.maxCount) ? cfg.maxCount :
              (Number.isFinite(cfg?.maxParticles) ? cfg.maxParticles : 0);
            panel.__dgParticlesBaseCount = Math.max(600, cfgMax || curCount || 1200);
          }
          const base = Number(panel.__dgParticlesBaseCount) || 1200;
          const minCount = __dgWarm ? 600 : (__dgTestMode ? 120 : (perfPanic ? 0 : 50));
          const desired = Math.max(0, Math.round(Math.max(minCount, base * Math.max(0, maxCountScale))));
          if (st && Number.isFinite(desired)) st.targetDesired = desired;
          if (cfg && Number.isFinite(tickModulo)) cfg.tickModulo = tickModulo;
        } catch {}
      }
    }

    __dgParticleStateCache = { key: cacheKey, ts: nowTs, value: adaptive, hadField: hasField };
    return adaptive;
  }

  // Warn (debug only) if we end up throttling particles for too long during a zoom gesture.
  let __dgParticleZoomThrottleSince = 0;
  let __dgParticleZoomThrottleWarned = false;
  let __dgParticlePokeTs = 0;
  let __dgPlayheadSimpleMode = false;
  let __dgPlayheadModeWanted = null;
  let __dgPlayheadModeWantedSince = 0;
  let __dgLowFpsMode = false;
  const DG_PARTICLE_ZOOM_THROTTLE_WARN_MS = 250;
  const DG_PARTICLE_POKE_GRACE_MS = 220;
  const DG_PLAYHEAD_MODE_MIN_MS = 650;

  function getChainHasNotesCached(panel, hasActiveNotes) {
    if (!panel) return hasActiveNotes;
    const prevId = panel.dataset?.prevToyId || null;
    const nextId = panel.dataset?.nextToyId || null;
    if (!prevId && !nextId) return hasActiveNotes;
    const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
    const cache = panel.__dgChainCache;
    if (
      cache &&
      cache.prevId === prevId &&
      cache.nextId === nextId &&
      (now - cache.ts) < 250
    ) {
      return cache.hasNotes;
    }
    const head = findChainHead(panel);
    const hasNotes = head ? chainHasSequencedNotes(head) : hasActiveNotes;
    panel.__dgChainCache = {
      ts: now,
      prevId,
      nextId,
      headId: head?.id || null,
      hasNotes,
    };
    return hasNotes;
  }

  function renderLoop() {
    // Clear scheduled id at start so we can safely re-schedule via ensureRenderLoopRunning().
    rafId = 0;
    const endPerf = startSection('drawgrid:render');
    const __perfOn = !!(window.__PerfFrameProf && typeof performance !== 'undefined' && performance.now);
    const __rafStart = __perfOn ? performance.now() : 0;
    const __frameStart = (__perfOn && typeof performance !== 'undefined' && performance.now)
      ? performance.now()
      : 0;
    try {
      if (!panel.__dgFrame) panel.__dgFrame = 0;
      panel.__dgFrame++;
      beginFrameLayoutCache(panel.__dgFrame);
      if (!panel.__dgGridAlphaSeen) {
        panel.__dgGridAlphaSeen = true;
        try {
          if (typeof window !== 'undefined' && window.__DG_GRID_ALPHA_DEBUG) {
            console.warn('[DG][grid-alpha] renderLoop active', { panelId: panel?.id || null });
          }
        } catch {}
      }
      const __dgFrameProfileStart = (DG_FRAME_PROFILE && typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : null;
      const nowTs = performance?.now?.() ?? Date.now();
      updateFlatLayerVisibility();

    // --- FPS accumulation (per panel, debug only) ---
    if (DG_DEBUG && window.DEBUG_DRAWGRID === 1) {
      if (!__dgFpsLastTs) {
        __dgFpsLastTs = nowTs;
        __dgFpsFrameCount = 0;
      }
      __dgFpsFrameCount++;
      const elapsed = nowTs - __dgFpsLastTs;
      if (elapsed >= 500) { // update every ~0.5s
        __dgFpsValue = (__dgFpsFrameCount * 1000) / elapsed;
        __dgFpsFrameCount = 0;
        __dgFpsLastTs = nowTs;
      }
    }
    // ------------------------------------------------

    const __prepStart = __perfOn ? performance.now() : 0;
    let inCommitWindow = HY.inCommitWindow(nowTs);
        const forcePostRelease = (__dgForceFullDrawNext || (__dgForceFullDrawFrames > 0) || __dgForceOverlayClearNext || __dgForceSwapNext);
        if (forcePostRelease) inCommitWindow = false;
        if (inCommitWindow) {
          __dgStableFramesAfterCommit = 0; // still settling - do nothing destructive
        } else if (__dgStableFramesAfterCommit < 2) {
          __dgStableFramesAfterCommit++; // count a couple of stable frames
        }

        const waitingForStable = inCommitWindow;

      const __visibilityStart = __perfOn ? performance.now() : 0;
      const shouldSkipOffscreen = !isPanelVisible &&
        !__dgFrontSwapNextDraw &&
        !__dgNeedsUIRefresh &&
        !__hydrationJustApplied;
      if (__perfOn && __visibilityStart) {
        try { window.__PerfFrameProf?.mark?.('drawgrid.prep.visibility', performance.now() - __visibilityStart); } catch {}
      }
      if (shouldSkipOffscreen) {
        // Hard cull: do not schedule another frame while fully offscreen with no pending work.
        // IntersectionObserver (or explicit work requests) will restart the loop.
        rafId = 0;
        return;
      }

      const __cameraStart = __perfOn ? performance.now() : 0;
      const frameCam = overlayCamState || (typeof getFrameStartState === 'function' ? getFrameStartState() : null);
      const boardScaleValue = Number.isFinite(frameCam?.scale) ? frameCam.scale : __dgZoomScale();
      if (Number.isFinite(boardScaleValue)) {
        if (!Number.isFinite(boardScale) || Math.abs(boardScale - boardScaleValue) > 1e-4) {
          boardScale = boardScaleValue;
        }
      }
      if (__perfOn && __cameraStart) {
        try { window.__PerfFrameProf?.mark?.('drawgrid.prep.camera', performance.now() - __cameraStart); } catch {}
      }

      const zoomDebugFreeze = !!(typeof window !== 'undefined' && window.__zoomDebugFreeze);

      // Update per-panel LOD state from global FPS + zoom.
      const __adaptiveStart = __perfOn ? performance.now() : 0;
      const overviewState = (typeof window !== 'undefined' && window.__overviewMode) ? window.__overviewMode : { isActive: () => false, state: { zoomThreshold: 0.36 } };
      const inOverview = !!overviewState?.isActive?.();
      const threshold = Number.isFinite(overviewState?.state?.zoomThreshold) ? overviewState.state.zoomThreshold : 0.36;
      const zoomTooWide = Number.isFinite(boardScaleValue) && boardScaleValue < threshold;
      const flags = panel.__dgParticleStateFlags || {};
      const flagsChanged = (flags.inOverview !== inOverview) || (flags.zoomTooWide !== zoomTooWide);
      const sharedTs = globalDrawgridState?.__adaptiveShared?.ts || 0;
      let adaptiveState = null;
      if (!flagsChanged && panel.__dgLastAdaptiveSharedTs === sharedTs) {
        adaptiveState = panel.__dgParticleStateCache?.value || getGlobalAdaptiveState();
      } else {
        panel.__dgLastAdaptiveSharedTs = sharedTs;
        adaptiveState = updatePanelParticleState(boardScaleValue, isPanelVisible);
      }
      __dgLowFpsMode = !!adaptiveState?.emergencyMode;
      const fpsSample = Number.isFinite(adaptiveState?.smoothedFps)
        ? adaptiveState.smoothedFps
        : (Number.isFinite(adaptiveState?.fps) ? adaptiveState.fps : null);
        const fpsLiveRaw = Number.isFinite(fpsSample)
          ? fpsSample
          : (Number.isFinite(__dgFpsValue) ? __dgFpsValue : null);
      const fpsLive = (Number.isFinite(fpsLiveRaw) && fpsLiveRaw >= 5) ? fpsLiveRaw : null;
      // Update global pressure DPR multiplier (generic: keys off low FPS, not gestures).
      const fpsOverride = __dgGetFpsDriveOverride();
      const fpsDrive = fpsOverride > 0 ? fpsOverride : fpsLive;

      // Pressure DPR should follow the drive signal in test mode (so you can
      // verify pressure behavior deterministically).
      if (Number.isFinite(fpsDrive)) {
        __dgUpdatePressureDprMulFromFps(fpsDrive, nowTs);
      }
      if (Number.isFinite(fpsDrive)) {
        let desiredSimple = null;
        if (fpsDrive <= DG_PLAYHEAD_FPS_SIMPLE_ENTER) {
          desiredSimple = true;
        } else if (fpsDrive >= DG_PLAYHEAD_FPS_SIMPLE_EXIT) {
          desiredSimple = false;
        }
        if (desiredSimple !== null && desiredSimple !== __dgPlayheadSimpleMode) {
          if (__dgPlayheadModeWanted !== desiredSimple) {
            __dgPlayheadModeWanted = desiredSimple;
            __dgPlayheadModeWantedSince = nowTs;
          }
        } else if (desiredSimple === null) {
          __dgPlayheadModeWanted = null;
          __dgPlayheadModeWantedSince = 0;
        }
      }

      // --- Debug state readout (throttled, DOM safe) --------------------------
      try {
        const enabled = !!(typeof window !== 'undefined' && (window.__DG_STATE_READOUT || ((window.__QUALITY_LAB || {}).targetFps > 0)));
        // Cleanup quickly when disabled (and avoid any DOM work).
        if (!enabled) {
          try {
            const oldEl = panel.__dgStateReadoutEl || null;
            if (oldEl && oldEl.isConnected) oldEl.remove();
            panel.__dgStateReadoutEl = null;
          } catch {}
        }

        const last = Number.isFinite(panel.__dgStateReadoutTs) ? panel.__dgStateReadoutTs : 0;
        if (!last || (nowTs - last) > 250) {
          panel.__dgStateReadoutTs = nowTs;

          const qlab = (typeof window !== 'undefined') ? (window.__QUALITY_LAB || null) : null;
          const aqEff = (typeof window !== 'undefined' && Number.isFinite(window.__AUTO_QUALITY_EFFECTIVE))
            ? window.__AUTO_QUALITY_EFFECTIVE
            : null;
          // IMPORTANT: DrawGrid uses the imported getAutoQualityScale(), not a window-global.
          const aqScale = (() => {
            try { return getAutoQualityScale?.(); } catch { return null; }
          })();

          const pressureMul = (typeof window !== 'undefined' && Number.isFinite(window.__DG_PRESSURE_DPR_MUL))
            ? window.__DG_PRESSURE_DPR_MUL
            : (Number.isFinite(__dgPressureDprMul) ? __dgPressureDprMul : null);

          const pfState = dgField?._state || null;
          const pfCfg = dgField?._config || null;
          const pfCount = Array.isArray(pfState?.particles) ? pfState.particles.length : null;

          const maxCountScale = Number.isFinite(panel.__dgParticleBudgetMaxCountScale) ? panel.__dgParticleBudgetMaxCountScale : null;
          const capScale = Number.isFinite(panel.__dgParticleBudgetCapScale) ? panel.__dgParticleBudgetCapScale : null;
          const spawnScale = Number.isFinite(panel.__dgParticleBudgetSpawnScale) ? panel.__dgParticleBudgetSpawnScale : null;

          const lines = [];
          lines.push(
            `DG  measuredFps=${Number.isFinite(fpsLive) ? fpsLive.toFixed(1) : '--'}  ` +
            `driveFps=${Number.isFinite(fpsDrive) ? fpsDrive.toFixed(1) : '--'}  ` +
            `override=${fpsOverride > 0 ? String(fpsOverride) : 'off'}  ` +
            `emergency=${__dgLowFpsMode ? 'YES' : 'no '}`
          );
          lines.push(`playhead=${__dgPlayheadSimpleMode ? 'SIMPLE' : 'FULL  '} (enter<=${DG_PLAYHEAD_FPS_SIMPLE_ENTER}, exit>=${DG_PLAYHEAD_FPS_SIMPLE_EXIT})`);

          // Particle field
          lines.push(`particles: enabled=${particleFieldEnabled ? 'YES' : 'no '}  count=${pfCount ?? '--'}`);
          lines.push(`  budget: max=${maxCountScale?.toFixed?.(3) ?? '--'} cap=${capScale?.toFixed?.(3) ?? '--'} spawn=${spawnScale?.toFixed?.(3) ?? '--'}`);
          lines.push(`  state: target=${Number.isFinite(pfState?.targetDesired) ? pfState.targetDesired.toFixed(0) : '--'} lod=${Number.isFinite(pfState?.lodScale) ? pfState.lodScale.toFixed(3) : '--'} tickMod=${Number.isFinite(pfCfg?.tickModulo) ? pfCfg.tickModulo : '--'}`);

          // Quality lab + auto quality (single-source-of-truth)
          const qFps = (qlab && Number.isFinite(qlab.targetFps)) ? qlab.targetFps : 0;
          const qBurn = (qlab && Number.isFinite(qlab.cpuBurnMs)) ? qlab.cpuBurnMs : 0;
          const qForce = (qlab && Number.isFinite(qlab.forceScale)) ? qlab.forceScale : null;
          const forcedActive = qFps > 0;
          lines.push(`QualityLab: forcedFps=${qFps} (${forcedActive ? 'ON' : 'off'}) burn=${qBurn}ms force=${qForce ?? 'auto'}`);
          lines.push(`Measured: fps=${Number.isFinite(fpsLive) ? fpsLive.toFixed(1) : '--'}  (note: may not reflect throttle if FPS is sampled elsewhere)`);
          lines.push(`AutoQ: eff=${aqEff != null ? aqEff.toFixed(3) : '--'} scale=${Number.isFinite(aqScale) ? aqScale.toFixed(3) : '--'} pressureMul=${pressureMul != null ? Number(pressureMul).toFixed(3) : '--'}`);

          const txt = lines.join('\n');

          // Always store a snapshot (Perf Lab can print this even when readout is hidden).
          try {
            panel.__dgStateSnapshot = {
              fpsLive: Number.isFinite(fpsLive) ? fpsLive : null,
              fpsDrive: Number.isFinite(fpsDrive) ? fpsDrive : null,
              fpsOverride: fpsOverride > 0 ? fpsOverride : 0,
              lowFpsEmergency: !!__dgLowFpsMode,
              playheadSimple: !!__dgPlayheadSimpleMode,
              particleFieldEnabled: !!particleFieldEnabled,
              particleCount: (pfCount == null ? null : pfCount),
              particleBudgetMaxScale: (maxCountScale == null ? null : maxCountScale),
              particleBudgetCapScale: (capScale == null ? null : capScale),
              particleBudgetSpawnScale: (spawnScale == null ? null : spawnScale),
              particleTargetDesired: Number.isFinite(pfState?.targetDesired) ? pfState.targetDesired : null,
              particleLodScale: Number.isFinite(pfState?.lodScale) ? pfState.lodScale : null,
              particleTickModulo: Number.isFinite(pfCfg?.tickModulo) ? pfCfg.tickModulo : null,
              qlabTargetFps: qFps,
              qlabCpuBurnMs: qBurn,
              qlabForceScale: (qForce == null ? null : qForce),
              autoQualityEffective: (aqEff == null ? null : aqEff),
              autoQualityScale: Number.isFinite(aqScale) ? aqScale : null,
              pressureDprMul: (pressureMul == null ? null : pressureMul),
            };
            panel.__dgStateSnapshotText = txt;
          } catch {}

          // Only touch the DOM when enabled.
          if (enabled) {
            const el = __dgEnsureStateReadoutEl();
            if (el) {
              // Colour the readout by quality tier: red (low) / amber (med) / green (high)
              const q = Number.isFinite(panel.__dgParticleQualityMul) ? panel.__dgParticleQualityMul : 1;
              const tier = (q <= 0.40) ? 'low' : (q >= 0.85 ? 'high' : 'med');
              const col =
                (tier === 'low') ? 'rgba(255, 90, 90, 0.98)' :
                (tier === 'high') ? 'rgba(90, 255, 140, 0.98)' :
                'rgba(255, 200, 90, 0.98)';
              el.style.color = col;
              el.style.borderColor = col;
              el.textContent = txt;
            }
          }
        }
      } catch {}
      // -----------------------------------------------------------------------
      if (__perfOn && __adaptiveStart) {
        try { window.__PerfFrameProf?.mark?.('drawgrid.prep.adaptive', performance.now() - __adaptiveStart); } catch {}
      }

      // We never draw overlays or particles if the panel is completely offscreen.
      const canDrawAnything = !waitingForStable && isPanelVisible;
      try {
        if (typeof window !== 'undefined' && window.__DG_DEBUG_DRAWFLOW && !panel.__dgFlowBootLogged) {
          panel.__dgFlowBootLogged = true;
          console.log('[DG][flow] boot', {
            panelId: panel?.id || null,
            visible: isPanelVisible,
            usingBackBuffers,
            singleCanvas: DG_SINGLE_CANVAS,
          });
        }
      } catch {}
      const renderEvery = Math.max(1, adaptiveState?.renderBudget?.skipNonCriticalEvery || 1);
      const skipNonCritical = false;

      // Extra throttling for "idle" panels when lots of toys are visible.
      const visiblePanels = Math.max(0, Number(globalDrawgridState?.visibleCount) || 0);
      const gesturing = __dgIsGesturing();
      const gestureMoving = !!(gesturing && __lastZoomMotionTs && (nowTs - __lastZoomMotionTs) < ZOOM_STALL_MS);
      const isFocused = panel.classList?.contains('toy-focused') || panel.classList?.contains('focused');
      const isZoomed = panel.classList?.contains('toy-zoomed');
      const hasAnyNotes = !!(currentMap && currentMap.active && currentMap.active.some(Boolean));
      const disableOverlayCore = !!(typeof window !== 'undefined' && window.__PERF_DG_OVERLAY_CORE_OFF);
      const zoomForOverlay = Number.isFinite(boardScale) ? boardScale : 1;
      const overlayFlashesEnabled = !disableOverlayCore;
      const overlayBurstsEnabled = !disableOverlayCore && zoomForOverlay > 0.45 && !__dgLowFpsMode;
      const flashRecentlyActive = (() => {
        const until = panel.__dgFlashActiveUntil;
        return Number.isFinite(until) && until > 0 && nowTs < until;
      })();
      const hasOverlayFx =
        (overlayFlashesEnabled && ((noteToggleEffects?.length || 0) > 0 || (cellFlashes?.length || 0) > 0)) ||
        (overlayBurstsEnabled && (noteBurstEffects?.length || 0) > 0) ||
        flashRecentlyActive;
      const hasNodeFlash = (() => {
        for (let i = 0; i < flashes.length; i++) {
          if (flashes[i] > 0) return true;
        }
        return false;
      })();
      const transportRunning = (typeof isRunning === 'function') && isRunning();
      const hasChainLink = panel.dataset.nextToyId || panel.dataset.prevToyId;
      const isChained = !!hasChainLink;
      const isActiveInChain = isChained ? (panel.dataset.chainActive === 'true') : true;
      const hasActiveNotes = currentMap && currentMap.active && currentMap.active.some(a => a);
      const chainHasNotes = isChained ? getChainHasNotesCached(panel, hasActiveNotes) : hasActiveNotes;

      const isTrulyIdle =
        !hasAnyNotes &&
        !hasOverlayFx &&
        !hasNodeFlash &&
        !transportRunning &&
        !__dgFrontSwapNextDraw &&
        !__dgNeedsUIRefresh &&
        !__hydrationJustApplied;

      const adaptiveCap = __dgComputeAdaptivePaintDpr({
        boardScale: Number.isFinite(boardScale) ? boardScale : 1,
        isFocused,
        isZoomed,
      });
      const zoomGesturing = (typeof window !== 'undefined' && window.__mtZoomGesturing === true);
      const zoomGestureMoving = !!(zoomGesturing && __lastZoomMotionTs && (nowTs - __lastZoomMotionTs) < ZOOM_STALL_MS);
      const deviceDpr = Math.max(1, Number.isFinite(window?.devicePixelRatio) ? window.devicePixelRatio : 1);
      const gestureMul = __dgComputeGestureBackingMul(zoomGestureMoving);
      const visualMul = __dgComputeVisualBackingMul(Number.isFinite(boardScale) ? boardScale : 1) * gestureMul;
      const pressureMul = (Number.isFinite(__dgPressureDprMul) && __dgPressureDprMul > 0) ? __dgPressureDprMul : 1;
      const smallMul = __dgComputeSmallPanelBackingMul(cssW, cssH);
      const autoMul = __dgGetAutoQualityMul();
      const desiredDprRaw = (adaptiveCap ? Math.min(deviceDpr, adaptiveCap) : deviceDpr) * visualMul * pressureMul * smallMul * autoMul;
      const desiredDpr = __dgCapDprForBackingStore(cssW, cssH, desiredDprRaw, __dgAdaptivePaintDpr);
      const nowAdaptiveTs = nowTs || (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
      const canAdjustDpr =
        !gesturing &&
        !HY.inCommitWindow(nowAdaptiveTs) &&
        __dgStableFramesAfterCommit >= 2 &&
        (nowAdaptiveTs - (__dgLastZoomCommitTs || 0)) > 800 &&
        cssW > 0 &&
        cssH > 0;
      if (typeof window !== 'undefined' && (window.__DG_ADAPTIVE_DPR_ENABLED ?? false)) {
        if (
          canAdjustDpr &&
          (visiblePanels >= 4 || __dgLowFpsMode || (typeof window !== 'undefined' && window.__DG_ADAPTIVE_DPR_ALLOW_SINGLE)) &&
          Number.isFinite(desiredDpr) &&
          Math.abs(desiredDpr - paintDpr) >= 0.15 &&
          (nowAdaptiveTs - __dgAdaptivePaintLastTs) > 240
        ) {
          __dgAdaptivePaintLastTs = nowAdaptiveTs;
          __dgAdaptivePaintDpr = desiredDpr;
          try {
            resizeSurfacesFor(cssW, cssH, desiredDpr, 'adaptivePaintDpr');
          } catch {}

          // If we ever re-enable this, keep the "no delayed redraw" behaviour.
          try {
            if (typeof window !== 'undefined' && window.__DG_REFRESH_DEBUG) {
              dgRefreshTrace('adaptivePaintDpr', { cssW, cssH, desiredDpr, paintDpr, zoomMode });
            }
          } catch {}
          try { markStaticDirty('adaptivePaintDpr'); } catch {}
          __dgForceFullDrawNext = true;
        }
      }

      let effectiveRenderEvery = renderEvery;
      if (isTrulyIdle && canDrawAnything && visiblePanels >= 4) {
        // For many visible idle panels, only do a "heavy" frame every few RAF ticks.
        // (We still tick RAF every frame, but most frames early-out before heavy work.)
        effectiveRenderEvery = Math.max(effectiveRenderEvery, 3);
      }

      const disableOverlays = !!(typeof window !== 'undefined' && window.__PERF_DG_DISABLE_OVERLAYS);
      // IMPORTANT: do not disable overlays based on gesture state.
      // If overlays need to scale back, that should be driven by generic pressure (FPS-based) systems.
      const disableOverlaysEffective = disableOverlays;

      // Overlays (notes, playhead, flashes) respect visibility & hydrations guard,
      // but are otherwise always on - they're core UX.
      const __overlayGateStart = __perfOn ? performance.now() : 0;
      const allowOverlayDraw = canDrawAnything && !disableOverlaysEffective;
      const disableOverlayStrokes = !!(typeof window !== 'undefined' && window.__PERF_DG_OVERLAY_STROKES_OFF);
      let hasOverlayStrokes = false;
      if (allowOverlayDraw && !disableOverlayStrokes) {
        hasOverlayStrokes = hasOverlayStrokesCached();
      }
      // Safety: if cache says no overlay but we have special strokes, don't clear overlays.
      // BUT: treating *committed* special/colorize strokes as "live overlay" forces a full-canvas
      // clear + composite every frame (very expensive). We only treat overlay strokes as "live"
      // when we're actively previewing a stroke (cur+previewGid) or when the cache explicitly says
      // there are live overlay strokes (e.g. a transient effect).
      let hasOverlayStrokesLive = !!(cur && previewGid);
      if (!hasOverlayStrokesLive) {
        hasOverlayStrokesLive = hasOverlayStrokes;
      }
      // Escape hatch: if you discover a visual regression (special strokes that truly must animate
      // as an overlay every frame), enable this and we will fall back to the old behavior.
      if (!hasOverlayStrokesLive && typeof window !== 'undefined' && window.__DG_OVERLAY_SPECIAL_ALWAYS_LIVE) {
        if (Array.isArray(strokes) && strokes.length) {
          for (let i = 0; i < strokes.length; i++) {
            const s = strokes[i];
            if (s && (s.isSpecial || s.overlayColorize)) { hasOverlayStrokesLive = true; break; }
          }
        }
      }
      // NOTE: "overlayTransport" is meant to keep *existing* overlay visuals animating while the
      // transport is running. It should NOT force overlay passes when there is no overlay content.
      // Otherwise we pay a big full-canvas clear + composite cost every frame during playback.
      let overlayTransport = false;
      let overlayActive = false;
      let overlayEvery = 1;
      // IMPORTANT: do not change overlay cadence based on gestures or visible count.
      if (overlayEvery > 1) {
        panel.__dgOverlayFrame = (panel.__dgOverlayFrame || 0) + 1;
      }
      const skipOverlayHeavy = overlayEvery > 1 && ((panel.__dgOverlayFrame % overlayEvery) !== 0);
      let allowOverlayDrawHeavy = allowOverlayDraw && (!skipOverlayHeavy || __dgNeedsUIRefresh);
      let overlayCoreWanted = (hasOverlayFx || hasOverlayStrokesLive || (cur && previewGid));
      if (!disableOverlayCore) {
        // Only keep overlay passes alive while the transport is running *and* there is overlay work to do.
        // (If flashes are active, panel.__dgFlashLayerEmpty will be false, so the gate won't skip.)
        overlayTransport = !!(transportRunning && overlayCoreWanted);
      }
      // overlayActive is used as a general "is there overlay content?" signal.
      // Do not include overlayTransport here, otherwise transport forces overlays even when empty.
      overlayActive = !!(allowOverlayDraw && (overlayCoreWanted || hasNodeFlash));

      let overlayCoreActive = allowOverlayDrawHeavy && overlayCoreWanted;
      let overlayCompositeNeeded = false;
      let overlayClearedThisFrame = false;
      let __dbgOverlaySpecialCount = null;
      let __dbgOverlayColorizedCount = null;
      let __dbgOverlayHasPreview = null;
      let gotoOverlayEnd = false;

      // PERF: if the flash overlay is known to be empty and there is no active
      // overlay content, skip all overlay passes entirely.
      // This avoids running overlay.core / overlay.flash.pass when idle.
      //
      // NOTE: This gate must account for things that can "wake" overlays later in the frame
      // (eg node flashes, UI refresh). Otherwise we can incorrectly skip overlay work.
      if (
        panel.__dgFlashLayerEmpty &&
        !overlayActive &&
        !overlayTransport &&
        !hasNodeFlash &&
        !__dgNeedsUIRefresh &&
        !panel.__dgFlashOverlayOutOfGrid
      ) {
        panel.__dgLastTransportRunning = transportRunning;
        // No overlay work needed this frame.
        gotoOverlayEnd = true;
        allowOverlayDrawHeavy = false;
        overlayCoreWanted = false;
        overlayCoreActive = false;
      }

      if (!gotoOverlayEnd) {
        if (__perfOn && __overlayGateStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.prep.overlayGate', performance.now() - __overlayGateStart); } catch {}
        }
        if (__perfOn && __prepStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.render.prep', performance.now() - __prepStart); } catch {}
        }

        if (allowOverlayDraw) {
          const lastTransportRunning = !!panel.__dgLastTransportRunning;
          if ((allowOverlayDrawHeavy || (lastTransportRunning && !transportRunning)) && !transportRunning && !overlayActive) {
            const __nowTs = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
            const __flashAliveUntil = panel.__dgFlashActiveUntil || 0;
            const __flashIsEmpty = !!panel.__dgFlashLayerEmpty;

            // Only clear the flash overlay once it has actually been drawn *and* its keepalive has expired.
            // (Avoid per-frame clears when idle; they show up as costly GPU/raster work.)
            if (!__flashIsEmpty && __nowTs >= __flashAliveUntil) {
              const __overlayClearStart = __perfOn ? performance.now() : 0;
              try {
              const flashSurface = getActiveFlashCanvas();
              const __flashDpr = __dgGetCanvasDprFromCss(flashSurface, cssW, paintDpr);
              R.resetCtx(fctx);
              __dgWithLogicalSpaceDpr(R, fctx, __flashDpr, () => {
                  const { x, y, w, h } = R.getOverlayClearRect({
                    canvas: flashSurface,
                    pad: R.getOverlayClearPad(),
                    allowFull: !!panel.__dgFlashOverlayOutOfGrid,
                    gridArea,
                  });
                  fctx.clearRect(x, y, w, h);
                });
                markFlashLayerCleared();
                overlayCompositeNeeded = true;
              } catch {}
              if (__perfOn && __overlayClearStart) {
                try { window.__PerfFrameProf?.mark?.('drawgrid.prep.overlayClear', performance.now() - __overlayClearStart); } catch {}
              }
            }
          }
          panel.__dgLastTransportRunning = transportRunning;
        }
      }

      // Particle field visibility is driven by global allow/overview/zoom state.
      // Do NOT toggle visibility just because we're in a brief commit window; that caused resets on pan/zoom release.
      const __particlePrepStart = __perfOn ? performance.now() : 0;
      const disableParticles = !!(typeof window !== 'undefined' && window.__PERF_DG_DISABLE_PARTICLES);
      const particleStateAllowed =
        DRAWGRID_ENABLE_PARTICLE_FIELD &&
        !zoomDebugFreeze &&
        particleFieldEnabled;

      // Only throttle particles during zoom if the scene is busy.
      // With 1-2 toys, keep particles running for responsiveness.
      const shouldThrottleForZoom = zoomGestureMoving && (visiblePanels >= 4);
      if (shouldThrottleForZoom) {
        if (!__dgParticleZoomThrottleSince) __dgParticleZoomThrottleSince = nowTs;
        if (!__dgParticleZoomThrottleWarned && (nowTs - __dgParticleZoomThrottleSince) > DG_PARTICLE_ZOOM_THROTTLE_WARN_MS) {
          __dgParticleZoomThrottleWarned = true;
          dglog('particle-field:throttle zoom gesture (still active)', { visiblePanels });
        }
      } else {
        __dgParticleZoomThrottleSince = 0;
        __dgParticleZoomThrottleWarned = false;
      }

      const recentPoke = Number.isFinite(__dgParticlePokeTs) && (nowTs - __dgParticlePokeTs) <= DG_PARTICLE_POKE_GRACE_MS;
      const emergencyMode = !!adaptiveState?.emergencyMode;
      const allowParticleDraw =
        !disableParticles &&
        particleStateAllowed &&
        isPanelVisible &&
        (!shouldThrottleForZoom || recentPoke || emergencyMode);
      const skipDomUpdates =
        !!(typeof window !== 'undefined' && window.__PERF_NO_DOM_UPDATES) &&
        (typeof window !== 'undefined' && window.__mtZoomGesturing === true);
      const nextParticleVisible = !!particleStateAllowed && !disableParticles;
      if (!skipDomUpdates && particleCanvas && particleCanvasVisible !== nextParticleVisible) {
        const __particleToggleStart = __perfOn ? performance.now() : 0;
        particleCanvasVisible = nextParticleVisible;
        particleCanvas.style.opacity = nextParticleVisible ? '1' : '0';
        dgParticleBootLog('visibility:toggle', {
          panelId: panel?.id || null,
          visible: nextParticleVisible,
          particleFieldEnabled,
          disableParticles,
          isPanelVisible,
        });
        if (!nextParticleVisible) {
          const ctx = particleCanvas.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, particleCanvas.width || 0, particleCanvas.height || 0);
        } else {
          try { dgField?.resetHome?.(); } catch {}
        }
        if (__perfOn && __particleToggleStart) {
          try { window.__PerfFrameProf?.mark?.('drawgrid.prep.particleToggle', performance.now() - __particleToggleStart); } catch {}
        }
      }
      if (__perfOn && __particlePrepStart) {
        try { window.__PerfFrameProf?.mark?.('drawgrid.render.particles', performance.now() - __particlePrepStart); } catch {}
      }

      if (dgField) {
        if (!disableParticles && gridArea && gridArea.w > 0 && gridArea.h > 0 && cssW > 0 && cssH > 0) {
          const pad = 6;
          const x = Math.max(0, gridArea.x - pad);
          const y = Math.max(0, gridArea.y - pad);
          const w = Math.max(0, Math.min(cssW - x, gridArea.w + pad * 2));
          const h = Math.max(0, Math.min(cssH - y, gridArea.h + pad * 2));
          const key = `${Math.round(x)}|${Math.round(y)}|${Math.round(w)}|${Math.round(h)}`;
          if (panel.__dgParticleClipKey !== key) {
            panel.__dgParticleClipKey = key;
            try { dgField.setClipRect({ x, y, w, h }); } catch {}
          }
        } else if (panel.__dgParticleClipKey) {
          panel.__dgParticleClipKey = '';
          try { dgField.setClipRect(null); } catch {}
        }
      }

      // If we're offscreen and nothing is pending (no swaps or deferred clears),
      // skip the heavy draw work and let the next visible frame catch up.
      const singleCompositeNeeded = DG_SINGLE_CANVAS && canDrawAnything;
      const skipFrame =
        !canDrawAnything &&
        !__dgFrontSwapNextDraw &&
        !__dgNeedsUIRefresh &&
        !__hydrationJustApplied &&
        !singleCompositeNeeded;
      const throttleFrame =
        effectiveRenderEvery > 1 &&
        (panel.__dgFrame % effectiveRenderEvery !== 0) &&
        canDrawAnything &&
        !__dgFrontSwapNextDraw &&
        !__dgNeedsUIRefresh &&
        !__hydrationJustApplied &&
        !singleCompositeNeeded &&
        !hasNodeFlash;
      maybeReleaseStalledZoom();
      dgf('start', { f: panel.__dgFrame|0, cssW, cssH, allowOverlayDraw, allowParticleDraw });
      const __ensureSizeStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
        ? performance.now()
        : 0;
      if (!ensureSizeReady()) {
        rafId = requestAnimationFrame(renderLoop);
        return;
      }
      if (DG_SINGLE_CANVAS && !DG_SINGLE_CANVAS_OVERLAYS) {
        if (flashCanvas?.style?.display !== 'none') flashCanvas.style.display = 'none';
        if (ghostCanvas?.style?.display !== 'none') ghostCanvas.style.display = 'none';
      }
      if (__ensureSizeStart) {
        const __ensureSizeDt = performance.now() - __ensureSizeStart;
        try { window.__PerfFrameProf?.mark?.('drawgrid.ensureSize', __ensureSizeDt); } catch {}
      }
      if ((skipFrame || throttleFrame) && panel.__dgGridHasPainted) {
        rafId = requestAnimationFrame(renderLoop);
        return;
      }
      const __perfZoomOn = !!window.__PERF_ZOOM_PROFILE;
      const __perfRenderStart = __perfZoomOn && typeof performance !== 'undefined' ? performance.now() : 0;
      if (frameCam && !panel.__dgFrameCamLogged) {
        const isProd = (typeof process !== 'undefined') && (process?.env?.NODE_ENV === 'production');
        if (!isProd && DG_DEBUG && DBG_DRAW) {
          try { console.debug('[DG][overlay] frameStart camera', frameCam); } catch {}
        }
        panel.__dgFrameCamLogged = true;
      }
      __dgFrameIdx++;
      // Static redraw cadence must NOT change during gestures.
      // Static layers (grid + nodes) should redraw only when dirty or explicitly forced.
      // If we need perf headroom, we reduce detail (particles / playhead detail), not frames.
      let doFullDraw = !!panel.__dgStaticDirty;
      let forceFullDraw = false;
      if (__dgForceFullDrawNext) {
        __dgForceFullDrawNext = false;
        doFullDraw = true;
        forceFullDraw = true;
      }
      if (__dgForceFullDrawFrames > 0) {
        __dgForceFullDrawFrames -= 1;
        doFullDraw = true;
        forceFullDraw = true;
      }
      if (Number.isFinite(__dgForceFullDrawUntil) && nowTs < __dgForceFullDrawUntil) {
        doFullDraw = true;
        forceFullDraw = true;
      }
      if (!panel.__dgGridHasPainted && __dgGridReady()) {
        doFullDraw = true;
      }
      // IMPORTANT:
      // Node flashes are an overlay effect and must NOT force a full static redraw.
      // (Static = grid + nodes). Only tutorial highlight can still require static redraw.
      // Tutorial highlight needs redraw even if static isn't dirty.
      if (tutorialHighlightMode !== 'none') {
        doFullDraw = true;
      }

      // Perf gate:
      // During active camera gesture motion, avoid repainting static layers (grid/nodes)
      // unless explicitly forced. This targets the "nonScript" cost (raster/composite)
      // that dominates in focus runs, while keeping correctness because:
      // - panel.__dgStaticDirty remains true
      // - a redraw will happen naturally once motion stops or when we forceFullDraw
      //
      // Override for debugging/verification:
      //   window.__DG_FREEZE_STATIC_DURING_GESTURE = false
      try {
        const freezeStaticDuringGesture =
          (typeof window === 'undefined') ? true : (window.__DG_FREEZE_STATIC_DURING_GESTURE !== false);
        if (freezeStaticDuringGesture && doFullDraw && !forceFullDraw && zoomGestureMoving) {
          doFullDraw = false;
        }
      } catch {}

      const overlayFxWanted = hasOverlayFx || (overlayFlashesEnabled && hasNodeFlash);
      overlayActive = allowOverlayDraw && (overlayFxWanted || overlayTransport || hasOverlayStrokesLive || (cur && previewGid));
      allowOverlayDrawHeavy = allowOverlayDraw && (!skipOverlayHeavy || __dgNeedsUIRefresh || hasNodeFlash);
      overlayCoreWanted = (overlayFxWanted || hasOverlayStrokesLive || (cur && previewGid));
      overlayCoreActive = allowOverlayDrawHeavy && overlayCoreWanted;
      if (gotoOverlayEnd) {
        overlayActive = false;
        allowOverlayDrawHeavy = false;
        overlayCoreWanted = false;
        overlayCoreActive = false;
      }

      // Perf gate:
      // During active camera gesture motion, avoid repainting *heavy* overlay core every frame
      // unless it is required for correctness (live strokes / preview / transport / forced UI refresh).
      //
      // Override for debugging/verification:
      //   window.__DG_FREEZE_OVERLAY_DURING_GESTURE = false
      try {
        const freezeOverlayDuringGesture =
          (typeof window === 'undefined') ? true : (window.__DG_FREEZE_OVERLAY_DURING_GESTURE !== false);
        const overlayNeedsRealtime =
          overlayTransport || hasOverlayStrokesLive || (cur && previewGid) || __dgNeedsUIRefresh || hasNodeFlash;
        if (freezeOverlayDuringGesture && zoomGestureMoving && !forceFullDraw && !overlayNeedsRealtime) {
          allowOverlayDrawHeavy = false;
          overlayCoreActive = false;
        }
      } catch {}

      const needsFx = overlayCoreActive || __dgNeedsUIRefresh || hasNodeFlash;
      // IMPORTANT: overlayDirty must mean “we need to re-render overlay core”.
      // A layer being *non-empty* is NOT “dirty” — cached layers should be allowed to persist
      // without forcing expensive overlay redraw every frame.
      try {
        if (!overlayCoreWanted) panel.__dgOverlayCorePainted = false;
      } catch {}
      const overlayDirtyBase =
        !!panel.__dgOverlayDirty ||
        __dgNeedsUIRefresh ||
        hasNodeFlash;
      const overlayNeedsFirstPaint =
        !!overlayCoreWanted && !panel.__dgOverlayCorePainted;
      const overlayDirty = overlayDirtyBase || overlayNeedsFirstPaint;
      if (overlayDirtyBase) {
        try { panel.__dgOverlayDirty = false; } catch {}
      }
      if (DG_SINGLE_CANVAS && canDrawAnything) {
        const needsFullDraw =
          panel.__dgSingleCompositeDirty ||
          __dgNeedsUIRefresh ||
          __dgFrontSwapNextDraw ||
          __hydrationJustApplied ||
          forceFullDraw ||
          !panel.__dgGridHasPainted ||
          tutorialHighlightMode !== 'none';
        if (!needsFullDraw) doFullDraw = false;
      }
      if (doFullDraw && isTrulyIdle && canDrawAnything && !__dgNeedsUIRefresh && !__dgFrontSwapNextDraw && !__hydrationJustApplied && !(Number.isFinite(__dgForceFullDrawUntil) && nowTs < __dgForceFullDrawUntil)) {
        doFullDraw = false;
      }
      let __dgUpdateStart = null;
      if (typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf) {
        __dgUpdateStart = performance.now();
      }
      try {
        if (allowParticleDraw) {
          const dtMs = Number.isFinite(frameCam?.dt) ? frameCam.dt : 16.6;
          const dt = Number.isFinite(dtMs) ? dtMs / 1000 : (1 / 60);
          const __pfStart = __perfZoomOn && typeof performance !== 'undefined' ? performance.now() : 0;
          const __pfDbgOn = !!(typeof window !== 'undefined' && window.__PERF_PARTICLE_DBG);
          const __pfDbgState = __pfDbgOn ? (dgField?._state || null) : null;
          const __pfDbgConfig = __pfDbgOn ? (dgField?._config || null) : null;
          const __pfUpdateStart = (__perfOn && typeof performance !== 'undefined' && performance.now)
            ? performance.now()
            : 0;
          // Hard emergency gate (renderLoop-local): ensure we can skip dgField.tick(dt) immediately
          // even if the adaptive budget pass is cached/skipped for this frame.
          const __dgCurFpsNow =
            (typeof window !== 'undefined' && Number.isFinite(window.__MT_SM_FPS)) ? window.__MT_SM_FPS :
            ((typeof window !== 'undefined' && Number.isFinite(window.__MT_FPS)) ? window.__MT_FPS : 60);
          const __dgVisibleNow = Number.isFinite(globalDrawgridState?.visibleCount) ? globalDrawgridState.visibleCount : 0;
          const __dgHardEmergencyOffNow =
            (__dgCurFpsNow < 14) || // catastrophic FPS regardless of count
            (__dgVisibleNow >= 12 && __dgCurFpsNow < 22) ||
            (__dgVisibleNow >= 20 && __dgCurFpsNow < 28);
          const __dgParticlesEffectivelyOff =
            (!particleFieldEnabled) ||
            (panel.__dgParticlesOff === true) ||
            (__dgHardEmergencyOffNow === true) ||
            (
              panel.__dgParticleBudgetMaxCountScale != null &&
              panel.__dgParticleBudgetCapScale != null &&
              panel.__dgParticleBudgetSpawnScale != null &&
              panel.__dgParticleBudgetMaxCountScale < 0.02 &&
              panel.__dgParticleBudgetCapScale < 0.02 &&
              panel.__dgParticleBudgetSpawnScale < 0.02
            );

          // Only tick the particle sim when it's actually doing meaningful work.
          if (!__dgParticlesEffectivelyOff) {
            dgField?.tick?.(dt);
          } else if (__dgHardEmergencyOffNow && !panel.__dgParticlesOff) {
            // Flip off immediately (don't wait for adaptive), and force a quick fade-out budget.
            panel.__dgParticlesOff = true;
            panel.__dgParticleBudgetMaxCountScale = 0;
            panel.__dgParticleBudgetCapScale = 0;
            panel.__dgParticleBudgetSpawnScale = 0;
            panel.__dgParticleBudgetKey = '';
            try {
              dgField?.applyBudget?.({
                maxCountScale: 0,
                capScale: 0,
                sizeScale: 1,
                spawnScale: 0,
                tickModulo: 1,
                emergencyFade: true,
              });
            } catch {}
          }
          if (__perfOn && __pfUpdateStart) {
            try { window.__PerfFrameProf?.mark?.('drawgrid.update.particles', performance.now() - __pfUpdateStart); } catch {}
          }
          if (__perfZoomOn && __pfStart && !window.__PERF_PARTICLE_FIELD_PROFILE) {
            const __pfEnd = performance.now();
            try { window.__PerfFrameProf?.mark?.('drawgrid.particle', __pfEnd - __pfStart); } catch {}
          }

          // Debug snapshot (only when enabled via __PERF_PARTICLE_DBG).
          if (__pfDbgOn) {
            try {
              window.__DG_PARTICLE_DBG_LAST = {
                t: nowTs,
                allowParticleDraw: true,
                disableParticles: false,
                isPanelVisible: !!isPanelVisible,
                particles: Array.isArray(__pfDbgState?.particles) ? __pfDbgState.particles.length : null,
                targetDesired: Number.isFinite(__pfDbgState?.targetDesired) ? __pfDbgState.targetDesired : null,
                capScale: Number.isFinite(__pfDbgState?.capScale) ? __pfDbgState.capScale : null,
                lodScale: Number.isFinite(__pfDbgState?.lodScale) ? __pfDbgState.lodScale : null,
                tickModulo: Number.isFinite(__pfDbgConfig?.tickModulo) ? __pfDbgConfig.tickModulo : null,
              };
            } catch {}
          }
        }
        else {
          // Particles skipped this frame. Mark it so we can verify NoParticles truly disables work.
          const __pfDbgOn = !!(typeof window !== 'undefined' && window.__PERF_PARTICLE_DBG);
          if (__perfOn) {
            try {
              window.__PerfFrameProf?.mark?.('drawgrid.update.particles.skipped', 0);
            } catch {}
          }
          if (__pfDbgOn) {
            try {
              window.__DG_PARTICLE_DBG_LAST = {
                t: nowTs,
                allowParticleDraw: false,
                disableParticles: !!disableParticles,
                isPanelVisible: !!isPanelVisible,
                particleStateAllowed: !!particleStateAllowed,
                zoomGestureMoving: !!zoomGestureMoving,
              };
            } catch {}
          }
        }
      } catch (e) {
        dglog('particle-field.tick:error', String((e && e.message) || e));
      }

      const __dgUpdateDt = (__dgUpdateStart !== null) ? (performance.now() - __dgUpdateStart) : 0;

      try {
        if (window.__ZOOM_COMMIT_PHASE) {
          F.perfMark(__dgUpdateDt, 0);
          rafId = requestAnimationFrame(renderLoop);
          return;
        }
      } catch {}

      let __dgDrawDt = 0;
      if (doFullDraw) {
        try {
          // Measure just the visual work for this panel: grid + nodes.
          let __dgDrawStart = null;
          let __dgDrawStartPerf = null;
          if (typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf) {
            __dgDrawStartPerf = performance.now();
          }
          if (DG_PROFILE && typeof performance !== 'undefined' && performance.now) {
            __dgDrawStart = performance.now();
          }

          const __gridDrawStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
            ? performance.now()
            : 0;
          dgGridAlphaLog('renderLoop:drawGrid', gctx, {
            doFullDraw,
            canDrawAnything,
            gridHasPainted: !!panel.__dgGridHasPainted,
            gridReady: __dgGridReady(),
          });
          drawGrid();
          if (__gridDrawStart) {
            const __gridDrawDt = performance.now() - __gridDrawStart;
            try { window.__PerfFrameProf?.mark?.('drawgrid.draw.grid', __gridDrawDt); } catch {}
          }

          if (currentMap) {
            const __nodesDrawStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
              ? performance.now()
              : 0;
            drawNodes(currentMap.nodes);
            if (__nodesDrawStart) {
              const __nodesDrawDt = performance.now() - __nodesDrawStart;
              try { window.__PerfFrameProf?.mark?.('drawgrid.draw.nodes', __nodesDrawDt); } catch {}
            }
          }

          // Static layers are now up to date.
          // (Even after force draws, treat as clean unless something marks it dirty again.)
          panel.__dgStaticDirty = false;

          if (__dgDrawStart !== null) {
          const now = performance.now();
          const dt = now - __dgDrawStart;

          __dgFrameProfileFrames++;
          __dgFrameProfileSumMs += dt;
          if (dt < __dgFrameProfileMinMs) __dgFrameProfileMinMs = dt;
          if (dt > __dgFrameProfileMaxMs) __dgFrameProfileMaxMs = dt;

          // Log about once a second per panel
          if (!__dgFrameProfileLastLogTs || (now - __dgFrameProfileLastLogTs) >= 1000) {
            const avg = __dgFrameProfileFrames > 0
              ? (__dgFrameProfileSumMs / __dgFrameProfileFrames)
              : 0;

            console.log('[DG][profile:panel]', {
              panelId: panel.id || null,
              frames: __dgFrameProfileFrames,
              avgFrameMs: Number(avg.toFixed(3)),
              minFrameMs: Number(__dgFrameProfileMinMs.toFixed(3)),
              maxFrameMs: Number(__dgFrameProfileMaxMs.toFixed(3)),
            });

            __dgFrameProfileFrames = 0;
            __dgFrameProfileSumMs = 0;
            __dgFrameProfileMinMs = Infinity;
            __dgFrameProfileMaxMs = 0;
            __dgFrameProfileLastLogTs = now;
          }
        }

        if (__dgDrawStartPerf !== null) {
          __dgDrawDt = performance.now() - __dgDrawStartPerf;
        }
      } catch (e) {
        dglog('drawGrid:error', String((e && e.message) || e));
      }
    }

      const forceNodesRefresh = !!panel.__dgForceNodesRefresh;
      if (!doFullDraw && canDrawAnything && currentMap && (hasNodeFlash || __dgHadNodeFlash || forceNodesRefresh)) {
        try { drawNodes(currentMap.nodes); } catch {}
        if (forceNodesRefresh) panel.__dgForceNodesRefresh = false;
      }
      __dgHadNodeFlash = hasNodeFlash;

      if (DG_SINGLE_CANVAS && overlayCompositeNeeded) {
        __dgMarkSingleCanvasOverlayDirty(panel);
      }
    F.perfMark(__dgUpdateDt, __dgDrawDt);
    if (__perfZoomOn && __perfRenderStart) {
      const __perfEnd = performance.now();
      try { window.__PerfFrameProf?.mark?.('drawgrid.render', __perfEnd - __perfRenderStart); } catch {}
    }


    if (__dgFrontSwapNextDraw && typeof requestFrontSwap === 'function') {
      __dgFrontSwapNextDraw = false;
      const __frontSwapStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
        ? performance.now()
        : 0;
      try { requestFrontSwap(); } catch (err) { dgs('error', String((err && err.message) || err)); }
      if (__frontSwapStart) {
        const __frontSwapDt = performance.now() - __frontSwapStart;
        try { window.__PerfFrameProf?.mark?.('drawgrid.frontSwap', __frontSwapDt); } catch {}
      }
    }
    // const dgr = panel?.getBoundingClientRect?.();
    //console.debug('[DIAG][DG] frame', {
      //f: panel.__dgFrame,
      //lastPointerup: window.__LAST_POINTERUP_DIAG__,
      //box: dgr ? { x: dgr.left, y: dgr.top, w: dgr.width, h: dgr.height } : null,
    //});
    const __uiRefreshStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
      ? performance.now()
      : 0;
    if (__dgNeedsUIRefresh && __dgStableFramesAfterCommit >= 2) {
      __dgNeedsUIRefresh = false;
      __dgDeferUntilTs = 0;
      try {
        if (!__hydrationJustApplied) {
          // PERF: don't back-sync (front -> back) during generic UI refresh by default.
          // Back-sync is only *required* right before we actually swap buffers (handled elsewhere),
          // and doing it here is extremely expensive (copies multiple canvases).
          const __uiRefreshBackSync = (typeof window !== 'undefined') ? !!window.__DG_UI_REFRESH_BACKSYNC : false;
          if (__uiRefreshBackSync && !usingBackBuffers && typeof ensureBackVisualsFreshFromFront === 'function') {
            const __backSyncStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
              ? performance.now()
              : 0;
            ensureBackVisualsFreshFromFront();
            if (__backSyncStart) {
              const __backSyncDt = performance.now() - __backSyncStart;
              try { window.__PerfFrameProf?.mark?.('drawgrid.ui.backSync', __backSyncDt); } catch {}
            }
          }
          const __uiClearStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
            ? performance.now()
            : 0;
          // Ghost trail should NEVER be cleared by gesture settle / re-snap.
          // Only clear it when the ghost backing store has actually changed (resize / DPR change)
          // or when explicitly stopped via stopGhostGuide({ immediate: true }).
          if (ghostCtx?.canvas) {
            const ghostSurface = getActiveGhostCanvas();
            // IMPORTANT: use the context that matches the currently-active ghost surface.
            // During buffer swaps, the global ghostCtx can point at the other buffer which causes
            // ghost visuals to scale incorrectly on subsequent passes.
            const __ghostCtx = (usingBackBuffers ? ghostBackCtx : ghostFrontCtx) || ghostCtx;
            const ghostDpr = __dgGetCanvasDprFromCss(ghostSurface || __ghostCtx?.canvas, cssW, paintDpr);
            const __ghostKey = `${cssW}x${cssH}@${ghostDpr}`;
            const __prevGhostKey = panel.__dgGhostClearKey || null;
            const __shouldClearGhost = (__prevGhostKey !== __ghostKey);
            if (__shouldClearGhost) {
              panel.__dgGhostClearKey = __ghostKey;
              R.resetCtx(__ghostCtx);
              __dgWithLogicalSpaceDpr(R, __ghostCtx, ghostDpr, () => {
                const { x, y, w, h } = R.getOverlayClearRect({
                  canvas: ghostSurface || __ghostCtx.canvas,
                  pad: R.getOverlayClearPad() * 1.2,
                  gridArea,
                });
                __ghostCtx.clearRect(x, y, w, h);
              });
              markGhostLayerCleared();
              try {
                if (typeof window !== 'undefined' && window.__DG_GHOST_TRACE) {
                  dgGhostTrace('clear:do', {
                    id: panel?.id || null,
                    reason: 'ui:refresh:overlay-clear',
                    key: __ghostKey,
                    prevKey: __prevGhostKey,
                  });
                }
              } catch {}
            } else {
              // Preserve existing trail.
              try {
                if (
                  typeof window !== 'undefined' &&
                  window.__DG_GHOST_TRACE &&
                  !window.__DG_GHOST_TRACE_CLEAR_ONLY
                ) {
                  dgGhostTrace('clear:skip (preserve-trail)', {
                    id: panel?.id || null,
                    reason: 'ui:refresh:overlay-clear',
                    key: __ghostKey,
                  });
                }
              } catch {}
            }
          }
          if (fctx?.canvas) {
            const flashSurface = getActiveFlashCanvas();
            const __flashDpr = __dgGetCanvasDprFromCss(flashSurface, cssW, paintDpr);
            R.resetCtx(fctx);
            __dgWithLogicalSpaceDpr(R, fctx, __flashDpr, () => {
              const { x, y, w, h } = R.getOverlayClearRect({
                canvas: flashSurface || fctx.canvas,
                pad: R.getOverlayClearPad(),
                allowFull: !!panel.__dgFlashOverlayOutOfGrid,
                gridArea,
              });
              fctx.clearRect(x, y, w, h);
            });
            markFlashLayerCleared();
          }
          if (tutorialCtx?.canvas) {
            R.resetCtx(tutorialCtx);
            R.withLogicalSpace(tutorialCtx, () => {
              const active = getActiveTutorialCanvas();
              const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
              const tw = cssW || (active?.width ?? tutorialCtx.canvas.width ?? 0) / scale;
              const th = cssH || (active?.height ?? tutorialCtx.canvas.height ?? 0) / scale;
              tutorialCtx.clearRect(0, 0, tw, th);
            });
            markTutorialLayerCleared();
          }
          if (__uiClearStart) {
            const __uiClearDt = performance.now() - __uiClearStart;
            try { window.__PerfFrameProf?.mark?.('drawgrid.ui.clear', __uiClearDt); } catch {}
          }
        }
      } catch (err) {
        DG.warn('deferred UI clear failed', err);
      }
    }
    if (__uiRefreshStart) {
      const __uiRefreshDt = performance.now() - __uiRefreshStart;
      try { window.__PerfFrameProf?.mark?.('drawgrid.ui.refresh', __uiRefreshDt); } catch {}
    }
    if (!panel.isConnected) {
      if (__frameStart) {
        const __frameDt = performance.now() - __frameStart;
        try { window.__PerfFrameProf?.mark?.('drawgrid.frame.total', __frameDt); } catch {}
      }
      cancelAnimationFrame(rafId);
      return;
    }

    // Set playing class for border highlight
    // Only show the steady highlight while the transport is running.
    // Chained toys require both an active chain link and notes somewhere in the chain.
    const showPlaying = transportRunning
      ? (isChained ? (isActiveInChain && chainHasNotes) : hasActiveNotes)
      : false;
    const __domPlayingStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
      ? performance.now()
      : 0;
    if (!skipDomUpdates) {
      const lastPlaying = !!panel.__dgShowPlaying;
      if (showPlaying !== lastPlaying) {
        // Avoid DOM writes in rAF: queue for deferred commit.
        markPanelForDomCommit(panel);
        queueClassToggle(panel, 'toy-playing', showPlaying);
        panel.__dgShowPlaying = showPlaying;
      }
    }
    if (__domPlayingStart) {
      const __domPlayingDt = performance.now() - __domPlayingStart;
      try { window.__PerfFrameProf?.mark?.('drawgrid.dom.playing', __domPlayingDt); } catch {}
    }

    // --- other overlay layers still respect allowOverlayDraw ---
    if (allowOverlayDrawHeavy && needsFx && overlayDirty) {
      overlayCompositeNeeded = true;
      const __flashPassStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
        ? performance.now()
        : 0;
      const __dgOverlayStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
        ? performance.now()
        : 0;
      // Clear flash canvas for this frame's animations
      const __overlayClearStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
        ? performance.now()
        : 0;
      const flashSurface = getActiveFlashCanvas();
      const __flashDpr = __dgGetCanvasDprFromCss(flashSurface, cssW, paintDpr);
      const __withFlashLogical = (fn) => __dgWithLogicalSpaceDpr(R, fctx, __flashDpr, fn);
      R.resetCtx(fctx);
      __dgWithLogicalSpaceDpr(R, fctx, __flashDpr, () => {
        const { x, y, w, h } = R.getOverlayClearRect({
          canvas: flashSurface,
          pad: R.getOverlayClearPad(),
          allowFull: !!panel.__dgFlashOverlayOutOfGrid,
          gridArea,
        });
        fctx.clearRect(x, y, w, h);
        emitDG('overlay-clear', { reason: 'pre-redraw' });
      });
      markFlashLayerCleared();
      overlayClearedThisFrame = true;
      if (__overlayClearStart) {
        const __overlayClearDt = performance.now() - __overlayClearStart;
        try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.clear', __overlayClearDt); } catch {}
      }

        if (hasNodeFlash && overlayFlashesEnabled) {
          markFlashLayerActive();
          R.withOverlayClip(fctx, gridArea, false, () => {
            __dgWithLogicalSpaceDpr(R, fctx, __flashDpr, () => {
            });
          });
        }

      // Animate special stroke paint (hue cycling).
      // Draw animated special strokes into flashCanvas, then mask with current paint alpha.
        if (!disableOverlayStrokes && (hasOverlayStrokesLive || (cur && previewGid))) {
        const __overlayStrokeStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
          ? performance.now()
          : 0;
        let specialStrokes = __dgOverlayStrokeListCache.special;
        let colorized = __dgOverlayStrokeListCache.colorized;
        let overlayOutOfGrid = __dgOverlayStrokeListCache.outOfGrid;
        let overlayBounds = __dgOverlayStrokeListCache.bounds;
        if (
          __dgOverlayStrokeListCache.paintRev !== __dgPaintRev ||
          __dgOverlayStrokeListCache.len !== (strokes?.length || 0)
        ) {
          specialStrokes = [];
          colorized = [];
          overlayOutOfGrid = false;
          overlayBounds = null;
          let boundsMinX = Infinity;
          let boundsMinY = Infinity;
          let boundsMaxX = -Infinity;
          let boundsMaxY = -Infinity;
          const hasGridBounds = !!(gridArea && gridArea.w > 0 && gridArea.h > 0);
          const gridMinX = hasGridBounds ? gridArea.x : 0;
          const gridMaxX = hasGridBounds ? (gridArea.x + gridArea.w) : 0;
          const gridMinY = hasGridBounds ? gridArea.y : 0;
          const gridMaxY = hasGridBounds ? (gridArea.y + gridArea.h) : 0;
          const pad = hasGridBounds ? Math.max(2, (R.getLineWidth() + 2) * 0.6) : 0;
          if (hasOverlayStrokesLive) {
            for (let i = 0; i < strokes.length; i++) {
              const s = strokes[i];
              if (!s) continue;
              if (s.isSpecial) specialStrokes.push(s);
              if (s.overlayColorize) colorized.push(s);
              if (Array.isArray(s.pts)) {
                const isOverlayStroke = !!(s.isSpecial || s.overlayColorize);
                for (let j = 0; j < s.pts.length; j++) {
                  const p = s.pts[j];
                  if (!p) continue;
                  if (!overlayOutOfGrid && hasGridBounds) {
                    if ((p.x - pad) < gridMinX || (p.x + pad) > gridMaxX || (p.y - pad) < gridMinY || (p.y + pad) > gridMaxY) {
                      overlayOutOfGrid = true;
                    }
                  }
                  if (isOverlayStroke) {
                    if (p.x < boundsMinX) boundsMinX = p.x;
                    if (p.y < boundsMinY) boundsMinY = p.y;
                    if (p.x > boundsMaxX) boundsMaxX = p.x;
                    if (p.y > boundsMaxY) boundsMaxY = p.y;
                  }
                }
              }
            }
          }
          if (Number.isFinite(boundsMinX) && Number.isFinite(boundsMinY) && Number.isFinite(boundsMaxX) && Number.isFinite(boundsMaxY)) {
            overlayBounds = {
              minX: boundsMinX - pad,
              minY: boundsMinY - pad,
              maxX: boundsMaxX + pad,
              maxY: boundsMaxY + pad,
            };
          }
          __dgOverlayStrokeListCache = {
            paintRev: __dgPaintRev,
            len: strokes?.length || 0,
            special: specialStrokes,
            colorized,
            outOfGrid: overlayOutOfGrid,
            bounds: overlayBounds,
          };
        }
        panel.__dgFlashOverlayOutOfGrid = !!overlayOutOfGrid;
          if (specialStrokes.length > 0 || colorized.length > 0 || (cur && previewGid)) {
            __dbgOverlaySpecialCount = specialStrokes.length;
            __dbgOverlayColorizedCount = colorized.length;
            __dbgOverlayHasPreview = !!(cur && previewGid);
            FD.layerDebugLog('overlay-strokes', {
              panelId: panel?.id || null,
              singleCanvas: !!DG_SINGLE_CANVAS,
              zoomed: panel?.classList?.contains('toy-zoomed') || false,
              specialCount: specialStrokes.length,
              colorizedCount: colorized.length,
              hasPreview: !!(cur && previewGid),
              flashVisible: flashCanvas?.style?.display || null,
            });
            markFlashLayerActive();
            R.withOverlayClip(fctx, gridArea, !!panel.__dgFlashOverlayOutOfGrid, () => {
            fctx.save();
            // Draw animated strokes in logical space once (avoid per-stroke reset/transform).
            __withFlashLogical(() => {
              // Draw demoted colorized strokes as static overlay tints
              try {
                const __colorStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
                  ? performance.now()
                  : 0;
                if (colorized.length) {
                  const flashSurface = getActiveFlashCanvas();
                  const baseW = flashSurface?.width || fctx.canvas?.width || 0;
                  const baseH = flashSurface?.height || fctx.canvas?.height || 0;
                  const cacheKey = `${__dgOverlayStrokeListCache.paintRev}|${__dgOverlayStrokeListCache.len}|${colorized.length}|${baseW}x${baseH}|${__flashDpr}`;
                  let cache = panel.__dgOverlayColorizedCache;
                  if (!cache || cache.key !== cacheKey || cache.width !== baseW || cache.height !== baseH) {
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, Math.round(baseW || 0));
                    canvas.height = Math.max(1, Math.round(baseH || 0));
                    const cctx = canvas.getContext('2d');
                    if (cctx) {
                      cctx.__dgIsOverlay = true;
                      R.resetCtx(cctx);
                      cctx.setTransform(1, 0, 0, 1, 0, 0);
                      cctx.clearRect(0, 0, canvas.width, canvas.height);
                      cctx.save();
                      cctx.setTransform(__flashDpr, 0, 0, __flashDpr, 0, 0);
                      for (const s of colorized) drawFullStroke(cctx, s, { skipReset: true, skipTransform: true });
                      cctx.restore();
                    }
                    cache = {
                      key: cacheKey,
                      width: canvas.width,
                      height: canvas.height,
                      canvas,
                    };
                    panel.__dgOverlayColorizedCache = cache;
                  }
                  if (cache?.canvas) {
                    fctx.drawImage(cache.canvas, 0, 0, baseW, baseH);
                  }
                }
                if (__colorStart) {
                  try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.strokes.colorized', performance.now() - __colorStart); } catch {}
                }
              } catch {}
              // Then draw animated special lines on top of normal lines
              const __specialStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
                ? performance.now()
                : 0;
              for (const s of specialStrokes) drawFullStroke(fctx, s, { skipReset: true, skipTransform: true });
              if (__specialStart) {
                try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.strokes.special', performance.now() - __specialStart); } catch {}
              }
              // Draw current special preview on top.
              if (cur && previewGid && cur.pts && cur.pts.length) {
                const __previewStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
                  ? performance.now()
                  : 0;
                const preview = { pts: cur.pts, isSpecial: true, generatorId: previewGid };
                drawFullStroke(fctx, preview, { skipReset: true, skipTransform: true });
                if (__previewStart) {
                  try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.strokes.preview', performance.now() - __previewStart); } catch {}
                }
              }
            });
            fctx.restore();
            });
          }
        if (__overlayStrokeStart) {
          const __overlayStrokeDt = performance.now() - __overlayStrokeStart;
          try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.strokes', __overlayStrokeDt); } catch {}
        }
      }
      if (__dgOverlayStart) {
        const __dgOverlayDt = performance.now() - __dgOverlayStart;
        try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.core', __dgOverlayDt); } catch {}
      }
      if (__flashPassStart) {
        const __flashPassDt = performance.now() - __flashPassStart;
        try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.flash.pass', __flashPassDt); } catch {}
      }
      try { panel.__dgOverlayCorePainted = true; } catch {}
      if (typeof window !== 'undefined' && window.__DG_DEBUG_DRAWFLOW) {
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const until = panel.__dgDebugOverlayUntil || 0;
        if (until > now) {
          if (!panel.__dgDebugOverlayLogged) {
            panel.__dgDebugOverlayLogged = true;
            const payload = {
              panelId: panel?.id || null,
              allowOverlayDraw,
              allowOverlayDrawHeavy,
              skipOverlayHeavy,
              overlayActive,
              overlayCoreWanted,
              overlayCoreActive,
              hasOverlayStrokes,
              hasOverlayStrokesLive,
              disableOverlayStrokes,
              hasOverlayFx,
              overlayTransport,
              overlayEvery,
              strokes: Array.isArray(strokes) ? strokes.length : 0,
              flashEmpty: !!panel.__dgFlashLayerEmpty,
              flashOutOfGrid: !!panel.__dgFlashOverlayOutOfGrid,
              specialCount: __dbgOverlaySpecialCount,
              colorizedCount: __dbgOverlayColorizedCount,
              hasPreview: __dbgOverlayHasPreview,
              flashAlpha: FD.__dgSampleAlphaFromCanvas(getActiveFlashCanvas()),
            };
            console.log('[DG][flow][overlay]', JSON.stringify(payload));
            try { window.__dgLastOverlayState = payload; } catch {}
          }
        }
      }
    }

    for (let i = 0; i < flashes.length; i++) {
        if (flashes[i] > 0) {
            flashes[i] = Math.max(0, flashes[i] - 0.08);
        }
    }

    if (cellFlashes.length > 0) {
      if (disableOverlayCore) {
        for (let i = cellFlashes.length - 1; i >= 0; i--) {
          const flash = cellFlashes[i];
          flash.age -= 0.05;
          if (flash.age <= 0) cellFlashes.splice(i, 1);
        }
      } else {
        const __dgOverlayStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
          ? performance.now()
          : 0;
          try {
            if (allowOverlayDraw) {
              overlayCompositeNeeded = true;
              markFlashLayerActive();
              // Draw cell flashes
              // IMPORTANT:
              // Draw in the flash canvas' logical space so bursts stay aligned after zoom/DPR shifts.
              R.resetCtx(fctx);
              __dgWithLogicalSpace(fctx, () => {
                R.withOverlayClip(fctx, gridArea, false, () => {
              fctx.save();
          for (let i = cellFlashes.length - 1; i >= 0; i--) {
            const flash = cellFlashes[i];
            const x = gridArea.x + flash.col * cw;
            const y = gridArea.y + topPad + flash.row * ch;

            fctx.globalAlpha = flash.age * 0.6; // Match grid line color
            fctx.fillStyle = 'rgb(143, 168, 255)';
            fctx.fillRect(x, y, cw, ch);

            flash.age -= 0.05; // Decay rate
            if (flash.age <= 0) {
              cellFlashes.splice(i, 1);
            }
          }
          fctx.restore();
                });
              });
        } else {
          for (let i = cellFlashes.length - 1; i >= 0; i--) {
            const flash = cellFlashes[i];
            flash.age -= 0.05;
            if (flash.age <= 0) {
              cellFlashes.splice(i, 1);
            }
          }
          }
        } catch (e) { /* fail silently */ }
        if (__dgOverlayStart && allowOverlayDrawHeavy) {
          const __dgOverlayDt = performance.now() - __dgOverlayStart;
          try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.cellFlashes', __dgOverlayDt); } catch {}
        }
      }
    }

    if (__frameStart) {
      const __frameDt = performance.now() - __frameStart;
      try { window.__PerfFrameProf?.mark?.('drawgrid.frame.total', __frameDt); } catch {}
    }

    if (noteToggleEffects.length > 0) {
      try {
        if (!disableOverlayCore && allowOverlayDraw) {
          overlayCompositeNeeded = true;
          markFlashLayerActive();
          const __dgOverlayStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
            ? performance.now()
            : 0;
          const __noteToggleStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
            ? performance.now()
            : 0;
          R.resetCtx(fctx);
          __dgWithLogicalSpace(fctx, () => {
            R.withOverlayClip(fctx, gridArea, false, () => {
            fctx.save();
            for (let i = noteToggleEffects.length - 1; i >= 0; i--) {
              const effect = noteToggleEffects[i];
              effect.progress += 0.12;
              const alpha = Math.max(0, 1 - effect.progress);
              if (alpha <= 0) {
                noteToggleEffects.splice(i, 1);
                continue;
              }
              const radius = effect.radius * (1 + effect.progress * 1.6);
              const lineWidth = Math.max(1.2, effect.radius * 0.28 * (1 - effect.progress * 0.5));
              fctx.globalAlpha = alpha;
              fctx.lineWidth = lineWidth;
              fctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
              fctx.beginPath();
              fctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
              fctx.stroke();
            }
            fctx.restore();
            });
          });
          if (__dgOverlayStart) {
            const __dgOverlayDt = performance.now() - __dgOverlayStart;
            try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.toggles', __dgOverlayDt); } catch {}
          }
          if (__noteToggleStart) {
            const __noteToggleDt = performance.now() - __noteToggleStart;
            try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.noteToggles', __noteToggleDt); } catch {}
          }
        } else {
          // Even if we skip drawing, continue advancing animations so they stay in sync.
          for (let i = noteToggleEffects.length - 1; i >= 0; i--) {
            const effect = noteToggleEffects[i];
            effect.progress += 0.12;
            const alpha = Math.max(0, 1 - effect.progress);
            if (alpha <= 0) {
              noteToggleEffects.splice(i, 1);
            }
          }
        }
      } catch {}
    }

    // Pink radial bursts for active notes
    if (typeof window !== 'undefined' && window.__DG_NOTE_BURST_TRACE) {
      try {
        console.log('[DG][burst][draw]', {
          panelId: panel?.id || null,
          burstCount: noteBurstEffects.length,
          gridArea: gridArea ? { x: gridArea.x, y: gridArea.y, w: gridArea.w, h: gridArea.h } : null,
          paintDpr,
          flash: fctx?.canvas ? { w: fctx.canvas.width, h: fctx.canvas.height } : null,
        });
      } catch {}
    }
    if (noteBurstEffects.length > 0) {
      try {
        if (__dgLowFpsMode || !overlayBurstsEnabled) {
          noteBurstEffects.length = 0;
          // Skip burst draw work, but keep the rest of the overlay rendering.
        } else if (disableOverlayCore) {
          const dtMs = Number.isFinite(frameCam?.dt) ? frameCam.dt : 16.6;
          const dt = Number.isFinite(dtMs) ? dtMs / 1000 : (1 / 60);
          for (let i = noteBurstEffects.length - 1; i >= 0; i--) {
            const burst = noteBurstEffects[i];
            for (let j = burst.particles.length - 1; j >= 0; j--) {
              const p = burst.particles[j];
              p.life -= dt * 2.8;
              if (p.life <= 0) {
                burst.particles.splice(j, 1);
              }
            }
            if (!burst.particles.length) {
              noteBurstEffects.splice(i, 1);
            }
          }
        } else {
          const dtMs = Number.isFinite(frameCam?.dt) ? frameCam.dt : 16.6;
          const dt = Number.isFinite(dtMs) ? dtMs / 1000 : (1 / 60);

          if (allowOverlayDrawHeavy || __dgLowFpsMode) {
            overlayCompositeNeeded = true;
            const __dgOverlayStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
              ? performance.now()
              : 0;
            R.resetCtx(fctx);
            __dgWithLogicalSpace(fctx, () => {
              R.withOverlayClip(fctx, gridArea, false, () => {
              fctx.save();
              markFlashLayerActive();
              fctx.globalCompositeOperation = 'lighter';
              for (let i = noteBurstEffects.length - 1; i >= 0; i--) {
                const burst = noteBurstEffects[i];
                let anyAlive = false;

                for (let j = burst.particles.length - 1; j >= 0; j--) {
                  const p = burst.particles[j];

                  // Fade out – faster fade so the burst clears quickly
                  p.life -= dt * 2.0;
                  if (p.life <= 0) {
                    burst.particles.splice(j, 1);
                    continue;
                  }

                  anyAlive = true;

                  // Integrate
                  p.x += p.vx * dt;
                  p.y += p.vy * dt;

                  // Gentle damping so they slow as they fade
                  p.vx *= 0.9;
                  p.vy *= 0.9;

                  const alpha = p.life;
                  const radius = p.size;

                  fctx.globalAlpha = alpha;
                  fctx.fillStyle = 'rgba(255, 180, 210, 1)';
                  fctx.beginPath();
                  fctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
                  fctx.fill();
                }

                if (!anyAlive) {
                  noteBurstEffects.splice(i, 1);
                }
              }
              fctx.restore();
              });
            });
            if (__dgOverlayStart) {
              const __dgOverlayDt = performance.now() - __dgOverlayStart;
              try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.bursts', __dgOverlayDt); } catch {}
            }
          } else {
            for (let i = noteBurstEffects.length - 1; i >= 0; i--) {
              const burst = noteBurstEffects[i];
              for (let j = burst.particles.length - 1; j >= 0; j--) {
                const p = burst.particles[j];
                p.life -= dt * 2.8;
                if (p.life <= 0) {
                  burst.particles.splice(j, 1);
                }
              }
              if (!burst.particles.length) {
                noteBurstEffects.splice(i, 1);
              }
            }
          }
        }
      } catch {}
    }

    // Draw scrolling playhead
    if (!disableOverlayCore && allowOverlayDraw) {
      const __dgOverlayStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
        ? performance.now()
        : 0;
      const __playheadStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
        ? performance.now()
        : 0;
      const __phMark = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf?.mark)
        ? window.__PerfFrameProf.mark.bind(window.__PerfFrameProf)
        : null;
      try {
        const info = getLoopInfo();
        const prevPhase = Number.isFinite(localLastPhase) ? localLastPhase : null;
        const currentPhase = Number.isFinite(info?.phase01) ? info.phase01 : null;
          const phaseJustWrapped = currentPhase != null && prevPhase != null && currentPhase < prevPhase && prevPhase > 0.9;
          if (currentPhase != null) {
            localLastPhase = currentPhase;
          }
          if (panel.__dgPlayheadWrapCount == null) panel.__dgPlayheadWrapCount = 0;
          if (phaseJustWrapped) panel.__dgPlayheadWrapCount++;
          if (__dgPlayheadModeWanted !== null && phaseJustWrapped) {
            const modeNow = performance?.now?.() ?? Date.now();
            if ((modeNow - __dgPlayheadModeWantedSince) >= DG_PLAYHEAD_MODE_MIN_MS &&
                (panel.__dgPlayheadWrapCount || 0) >= 2) {
              __dgPlayheadSimpleMode = __dgPlayheadModeWanted;
              __dgPlayheadModeWanted = null;
              __dgPlayheadModeWantedSince = 0;
            }
          }

      // Only draw and repulse particles if transport is running and this toy is the active one in its chain.
      // If this toy thinks it's active, but the global transport phase just wrapped,
      // it's possible its active status is stale. Skip one frame of playhead drawing
      // to wait for the scheduler to update the `data-chain-active` attribute.
      const probablyStale = isActiveInChain && phaseJustWrapped;

        const playheadSimpleOnly = __dgPlayheadSimpleMode;
        const useSeparatePlayhead = !!(typeof window !== 'undefined' && window.__DG_PLAYHEAD_SEPARATE_CANVAS);
        const playheadFpsHint = readHeaderFpsHint();
        const playheadFps = Number.isFinite(playheadFpsHint) ? playheadFpsHint : 60;

        // IMPORTANT: playhead quality is *generic* (FPS-based), not gesture-based and not panel-count-based.
        // We only drop to the simple playhead when the frame rate suggests we need to.
        const fancyMinFps = Number.isFinite(window.__DG_PLAYHEAD_FANCY_MIN_FPS) ? Number(window.__DG_PLAYHEAD_FANCY_MIN_FPS) : 55;
        const fancyMinFpsZoomedIn = Number.isFinite(window.__DG_PLAYHEAD_FANCY_MIN_FPS_ZOOMED_IN) ? Number(window.__DG_PLAYHEAD_FANCY_MIN_FPS_ZOOMED_IN) : 50;

        const playheadFancyDesired = !playheadSimpleOnly && (
          (playheadFps >= fancyMinFps) ||
          ((zoomForOverlay > 0.9) && (playheadFps >= fancyMinFpsZoomedIn))
        );
        // If global FPS pressure has switched us into "simple playhead" mode,
        // drop fancy immediately (do NOT wait for a phase wrap to re-lock).
        // This is generic (FPS-based), not gesture-based, and not device-count-based.
        if (playheadSimpleOnly) {
          panel.__dgPlayheadFancyLocked = false;
        }
        if (phaseJustWrapped || panel.__dgPlayheadFancyLocked == null) {
          panel.__dgPlayheadFancyLocked = playheadFancyDesired;
        }
        if (phaseJustWrapped || panel.__dgPlayheadHue == null) {
          panel.__dgPlayheadHue = pickPlayheadHue(strokes);
        }
        const playheadFancy = !!panel.__dgPlayheadFancyLocked;
        const playheadDrawSimple = playheadSimpleOnly || !playheadFancy;
        const canUseTutorialLayer = tutorialHighlightMode === 'none' && !!tutorialCtx?.canvas;
        const playheadLayer = useSeparatePlayhead
          ? 'playhead'
          : (playheadDrawSimple && canUseTutorialLayer) ? 'tutorial' : 'flash';
        const wantsPlayhead = !!(info && isRunning() && isActiveInChain && !probablyStale);

        // Throttle playhead draws during heavy pan/zoom (especially with many panels),
        // but DO NOT clear the existing playhead unless it genuinely shouldn't exist.
        // Otherwise we'd flicker because the "!shouldRenderPlayhead" clear-path also
        // resets __dgPlayheadLastX.
        let allowPlayheadThisFrame = wantsPlayhead;
        try {
          const overrideEvery = Number(window.__PERF_DG_PLAYHEAD_EVERY);
          // Quality should NOT change just because the user is gesturing.
          // All visible toys are treated equally (unless in small-screen focus edit mode).
          const __dgFps =
            (typeof window !== 'undefined' && Number.isFinite(window.__MT_SM_FPS)) ? window.__MT_SM_FPS :
            ((typeof window !== 'undefined' && Number.isFinite(window.__MT_FPS)) ? window.__MT_FPS : 60);

          // Global quality knob (not gesture-based). When low, we may reduce *detail*, not cadence.
          // Leave playhead cadence at full rate; later we can swap to low-detail visual instead of skipping frames.
          let playheadEvery = 1;
          if (Number.isFinite(overrideEvery) && overrideEvery >= 1) {
            playheadEvery = Math.floor(overrideEvery);
          }
          if (playheadEvery > 1) {
            panel.__dgPlayheadFrame = (panel.__dgPlayheadFrame | 0) + 1;
            allowPlayheadThisFrame = ((panel.__dgPlayheadFrame % playheadEvery) === 0);
          }
        } catch {}

        const shouldRenderPlayhead = wantsPlayhead && allowPlayheadThisFrame;
        const lastX = Number.isFinite(panel.__dgPlayheadLastX) ? panel.__dgPlayheadLastX : null;
        const lastLayer = panel.__dgPlayheadLayer || playheadLayer;
        const lastGridArea = panel.__dgPlayheadLastGridArea || gridArea;
        const clearPlayheadBandAt = (clearX, layer) => {
          if (!Number.isFinite(clearX) || !gridArea) return;
          const clearArea = (lastGridArea && lastGridArea.w > 0) ? lastGridArea : gridArea;
          const clearCtx = (layer === 'tutorial')
            ? tutorialCtx
            : (layer === 'playhead') ? playheadFrontCtx : fctx;
          if (!clearCtx?.canvas) return;
          const defaultBand = Math.max(6, Math.round(Math.max(0.8 * cw, Math.min(clearArea.w * 0.08, 2.2 * cw))));
          const band = Number.isFinite(panel.__dgPlayheadClearBand) ? panel.__dgPlayheadClearBand : defaultBand;
          const clearBandAt = () => {
            const y0 = Math.floor(clearArea.y) - 4;
            const y1 = Math.ceil(clearArea.y + clearArea.h) + 4;
            const h = Math.max(0, y1 - y0);
            clearCtx.clearRect(clearX - band - 1, y0, band * 2 + 2, h);
          };
          if (clearCtx === playheadFrontCtx) {
            R.resetCtx(clearCtx);
            __dgWithLogicalSpace(clearCtx, clearBandAt);
          } else {
            const clipArea = { x: clearArea.x, y: Math.floor(clearArea.y) - 2, w: clearArea.w, h: Math.ceil(clearArea.h) + 4 };
            R.resetCtx(clearCtx);
            __dgWithLogicalSpace(clearCtx, () => {
              R.withOverlayClip(clearCtx, clipArea, false, clearBandAt);
            });
          }
        };

        // If the phase wrapped but we skip rendering this frame (e.g. zoom/throttle),
        // clear the previous end-band so the playhead doesn't "stick".
        if (phaseJustWrapped && lastX != null) {
          try { clearPlayheadBandAt(lastX, lastLayer); } catch {}
        }

        if (!wantsPlayhead) {
          const lastGridArea = panel.__dgPlayheadLastGridArea || gridArea;
          if (lastX != null) {
            if (lastLayer === 'tutorial' && tutorialHighlightMode === 'none' && tutorialCtx?.canvas) {
              const __overlayClearStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
                ? performance.now()
                : 0;
              R.resetCtx(tutorialCtx);
              R.withLogicalSpace(tutorialCtx, () => {
                const active = getActiveTutorialCanvas();
                const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
                const tw = cssW || (active?.width ?? tutorialCtx.canvas.width ?? 0) / scale;
                const th = cssH || (active?.height ?? tutorialCtx.canvas.height ?? 0) / scale;
                tutorialCtx.clearRect(0, 0, tw, th);
              });
              markTutorialLayerCleared();
              if (DG_SINGLE_CANVAS) overlayCompositeNeeded = true;
              if (__overlayClearStart) {
                try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.clear', performance.now() - __overlayClearStart); } catch {}
              }
            } else if (lastLayer === 'playhead' && playheadFrontCtx?.canvas) {
              const __overlayClearStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
                ? performance.now()
                : 0;
              R.resetCtx(playheadFrontCtx);
              const clearPlayheadBand = () => {
                const clearArea = (lastGridArea && lastGridArea.w > 0) ? lastGridArea : gridArea;
                const defaultBand = Math.max(6, Math.round(Math.max(0.8 * cw, Math.min(clearArea.w * 0.08, 2.2 * cw))));
                const band = Number.isFinite(panel.__dgPlayheadClearBand) ? panel.__dgPlayheadClearBand : defaultBand;
                const y0 = Math.floor(clearArea.y) - 4;
                const y1 = Math.ceil(clearArea.y + clearArea.h) + 4;
                const h = Math.max(0, y1 - y0);
                playheadFrontCtx.clearRect(lastX - band - 1, y0, band * 2 + 2, h);
              };
              clearPlayheadBand();
              markPlayheadLayerCleared();
              if (DG_SINGLE_CANVAS) overlayCompositeNeeded = true;
              if (__overlayClearStart) {
                try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.clear', performance.now() - __overlayClearStart); } catch {}
              }
            } else if (fctx?.canvas) {
              const __overlayClearStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
                ? performance.now()
                : 0;
              const flashSurface = getActiveFlashCanvas();
              const __flashDpr = __dgGetCanvasDprFromCss(flashSurface, cssW, paintDpr);
              R.resetCtx(fctx);
              __dgWithLogicalSpaceDpr(R, fctx, __flashDpr, () => {
                const scale = (Number.isFinite(__flashDpr) && __flashDpr > 0) ? __flashDpr : 1;
                const width = cssW || (flashSurface?.width ?? fctx.canvas.width ?? 0) / scale;
                const height = cssH || (flashSurface?.height ?? fctx.canvas.height ?? 0) / scale;
                if (overlayCoreWanted) {
                  // We can't clear the full overlay here without risking a 1-frame expose
                  // of the base (white) line if overlay redraw is throttled.
                  // BUT: if the playhead is no longer wanted (e.g. chain-active race at wrap),
                  // we *must* clear the playhead itself, otherwise it can get "stuck" at the
                  // end of the path until a later playhead overlaps it.
                  const clearArea = (lastGridArea && lastGridArea.w > 0) ? lastGridArea : gridArea;
                  const defaultBand = Math.max(6, Math.round(Math.max(0.8 * cw, Math.min(clearArea.w * 0.08, 2.2 * cw))));
                  const band = Number.isFinite(panel.__dgPlayheadClearBand) ? panel.__dgPlayheadClearBand : defaultBand;
                  const y0 = Math.floor(clearArea.y) - 4;
                  const y1 = Math.ceil(clearArea.y + clearArea.h) + 4;
                  const h = Math.max(0, y1 - y0);
                  fctx.clearRect(lastX - band - 1, y0, band * 2 + 2, h);

                  __dgNeedsUIRefresh = true;
                  overlayCompositeNeeded = true;
                } else {
                  const { x, y, w, h } = R.getOverlayClearRect({
                    canvas: flashSurface || fctx.canvas,
                    pad: R.getOverlayClearPad(),
                    allowFull: !!panel.__dgFlashOverlayOutOfGrid,
                    gridArea,
                  });
                  fctx.clearRect(x, y, w, h);
                }
              });
              if (overlayCoreWanted) {
                markFlashLayerActive();
              } else {
                markFlashLayerCleared();
              }
              if (DG_SINGLE_CANVAS) overlayCompositeNeeded = true;
              if (__overlayClearStart) {
                try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.clear', performance.now() - __overlayClearStart); } catch {}
              }
            }
          }
          panel.__dgPlayheadLastX = null;
          panel.__dgPlayheadLayer = null;
          panel.__dgPlayheadLastGridArea = null;
        }

        if (shouldRenderPlayhead) {
          const playheadCtx = (playheadLayer === 'tutorial')
            ? tutorialCtx
            : (playheadLayer === 'playhead') ? playheadFrontCtx : fctx;
          panel.__dgPlayheadLastRenderTs = (typeof performance !== 'undefined' && typeof performance.now === 'function')
            ? performance.now()
            : Date.now();
          if ((playheadCtx === tutorialCtx || playheadCtx === playheadFrontCtx || !overlayClearedThisFrame) && lastX != null) {
            const clearCtx = (lastLayer === 'tutorial')
              ? tutorialCtx
              : (lastLayer === 'playhead') ? playheadFrontCtx : fctx;
            if (clearCtx?.canvas && gridArea) {
              const clearArea = (lastGridArea && lastGridArea.w > 0) ? lastGridArea : gridArea;
              const defaultBand = Math.max(6, Math.round(Math.max(0.8 * cw, Math.min(clearArea.w * 0.08, 2.2 * cw))));
              const band = Number.isFinite(panel.__dgPlayheadClearBand) ? panel.__dgPlayheadClearBand : defaultBand;
              R.resetCtx(clearCtx);
              const clearPlayheadBand = () => {
                const y0 = Math.floor(clearArea.y) - 4;
                const y1 = Math.ceil(clearArea.y + clearArea.h) + 4;
                const h = Math.max(0, y1 - y0);
                clearCtx.clearRect(lastX - band - 1, y0, band * 2 + 2, h);
              };
              if (clearCtx === playheadFrontCtx) {
                R.resetCtx(clearCtx);
                __dgWithLogicalSpace(clearCtx, clearPlayheadBand);
              } else {
                const clipArea = { x: clearArea.x, y: Math.floor(clearArea.y) - 2, w: clearArea.w, h: Math.ceil(clearArea.h) + 4 };
                R.resetCtx(clearCtx);
                __dgWithLogicalSpace(clearCtx, () => {
                  R.withOverlayClip(clearCtx, clipArea, false, clearPlayheadBand);
                });
              }
              emitDG('overlay-clear', { reason: 'playhead-band' });
            }
          }
        if (!useSeparatePlayhead && !overlayClearedThisFrame) {
          const __overlayClearStart = (__perfOn && typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf)
            ? performance.now()
            : 0;
          try {
            if (playheadCtx === tutorialCtx) {
              R.resetCtx(tutorialCtx);
              R.withLogicalSpace(tutorialCtx, () => {
                const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
                const active = getActiveTutorialCanvas();
                const width = cssW || (active?.width ?? tutorialCtx.canvas.width ?? 0) / scale;
                const height = cssH || (active?.height ?? tutorialCtx.canvas.height ?? 0) / scale;
                tutorialCtx.clearRect(0, 0, width, height);
              });
              markTutorialLayerCleared();
            } else {
              const flashSurface = getActiveFlashCanvas();
              R.resetCtx(fctx);
              R.withLogicalSpace(fctx, () => {
                const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
                const width = cssW || (flashSurface?.width ?? 0) / scale;
                const height = cssH || (flashSurface?.height ?? 0) / scale;
                if (!overlayCoreWanted) {
                  const { x, y, w, h } = R.getOverlayClearRect({
                    canvas: flashSurface,
                    pad: R.getOverlayClearPad(),
                    allowFull: !!panel.__dgFlashOverlayOutOfGrid,
                    gridArea,
                  });
                  fctx.clearRect(x, y, w, h);
                  emitDG('overlay-clear', { reason: 'playhead' });
                  markFlashLayerCleared();
                }
              });
              overlayClearedThisFrame = true;
            }
          } catch {}
          if (__perfOn && __overlayClearStart) {
            try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.clear', performance.now() - __overlayClearStart); } catch {}
          }
        }
        overlayCompositeNeeded = true;
        if (playheadCtx === tutorialCtx) {
          markTutorialLayerActive();
        } else if (playheadCtx === playheadFrontCtx) {
          markPlayheadLayerActive();
        } else {
          markFlashLayerActive();
        }
        // Calculate playhead X position based on loop phase
        const playheadX = gridArea.x + info.phase01 * gridArea.w;
        // If the playhead wrapped (end -> start), ensure we clear the "stuck" end segment.
        // This can happen if playback briefly stops rendering at the end-of-loop boundary.
        try {
          const prevX = Number.isFinite(lastX) ? lastX : null;
          if (prevX != null && gridArea && Number.isFinite(gridArea.w) && gridArea.w > 0) {
            const wrapped = (playheadX < (gridArea.x + gridArea.w * 0.25)) && (prevX > (gridArea.x + gridArea.w * 0.75));
            if (wrapped) {
              const clearCtx = (lastLayer === 'tutorial')
                ? tutorialCtx
                : (lastLayer === 'playhead') ? playheadFrontCtx : fctx;
              if (clearCtx?.canvas) {
                const defaultBand = Math.max(6, Math.round(Math.max(0.8 * cw, Math.min(gridArea.w * 0.08, 2.2 * cw))));
                const band = Number.isFinite(panel.__dgPlayheadClearBand) ? panel.__dgPlayheadClearBand : defaultBand;
                const clearBandAt = () => {
                  const y0 = Math.floor(gridArea.y) - 4;
                  const y1 = Math.ceil(gridArea.y + gridArea.h) + 4;
                  const h = Math.max(0, y1 - y0);
                  clearCtx.clearRect(prevX - band - 1, y0, band * 2 + 2, h);
                };
                if (clearCtx === playheadFrontCtx) {
                  R.resetCtx(clearCtx);
                  __dgWithLogicalSpace(clearCtx, clearBandAt);
                } else {
                  const clipArea = { x: gridArea.x, y: Math.floor(gridArea.y) - 2, w: gridArea.w, h: Math.ceil(gridArea.h) + 4 };
                  R.resetCtx(clearCtx);
                  __dgWithLogicalSpace(clearCtx, () => {
                    R.withOverlayClip(clearCtx, clipArea, false, clearBandAt);
                  });
                }
              }
            }
          }
        } catch {}
        panel.__dgPlayheadLastX = playheadX;
        panel.__dgPlayheadLayer = playheadLayer;
        panel.__dgPlayheadLastGridArea = gridArea ? { x: gridArea.x, y: gridArea.y, w: gridArea.w, h: gridArea.h } : null;

        // Use a dedicated overlay context for the playhead to avoid wiping strokes.
        const __drawPlayheadInner = () => {
        playheadCtx.save();

        // Width of the soft highlight band scales with a column, clamped
        const gradientWidth = Math.round(
          Math.max(0.8 * cw, Math.min(gridArea.w * 0.08, 2.2 * cw))
        );

        // IMPORTANT: the fancy playhead uses cached glow sprites.
        // During zoom, cw/gridArea.h change continuously -> cache misses -> expensive sprite rebuilds.
        // Quantize dimensions so the cache actually hits while gesturing.
        const __dgQuant = (v, step, min = step) => {
          const n = Number(v);
          if (!Number.isFinite(n)) return min;
          const s = Math.max(1, Number(step) || 1);
          return Math.max(min, Math.round(n / s) * s);
        };
        const spriteGradientWidth = __dgQuant(gradientWidth, 8, 32);
        const spriteHeight = __dgQuant(gridArea.h, 16, 96);
        const playheadLineW = playheadDrawSimple ? Math.max(2, cw * 0.08) : 3;
        const trailLineCount = playheadDrawSimple ? 0 : 3;
        const gap = playheadDrawSimple ? 0 : 28; // A constant, larger gap
        const trailW0 = 2.5;
        const trailWStep = 0.6;
        const extraTrail = playheadDrawSimple ? 0 : (trailLineCount * gap + 6);
        const baseBand = Math.max(gradientWidth / 2, playheadLineW / 2);
        panel.__dgPlayheadClearBand = Math.max(6, Math.ceil(baseBand + extraTrail));

        const hue = Number.isFinite(panel.__dgPlayheadHue)
          ? panel.__dgPlayheadHue
          : pickPlayheadHue(strokes);

        // Header sweep: decouple VISUAL from FORCE.
        //
        // - Visual sweep is a cheap translucent band drawn on the playhead overlay (always "looks right").
        // - Force sweep is the expensive field push along the segment (particle simulation).
        //
        // Both degrade by FPS (generic "framerate is low, fix it"), not gesture or panel count.
        try {
          let sweepDir = headerSweepDirX || 1;
          if (currentPhase != null && prevPhase != null) {
            if (phaseJustWrapped) {
              sweepDir = 1;
            } else if (Math.abs(currentPhase - prevPhase) > 1e-4) {
              sweepDir = (currentPhase - prevPhase) >= 0 ? 1 : -1;
            }
          }
          headerSweepDirX = sweepDir;

          const fpsHint = Number.isFinite(fpsLive) ? fpsLive : null;
          const __disableForceFps =
            (typeof window !== 'undefined' && Number.isFinite(window.__DG_HEADER_SWEEP_FORCE_DISABLE_FPS))
              ? Number(window.__DG_HEADER_SWEEP_FORCE_DISABLE_FPS)
              : 50; // default: disable forces below ~50fps
          const __disableVisualFps =
            (typeof window !== 'undefined' && Number.isFinite(window.__DG_HEADER_SWEEP_VISUAL_DISABLE_FPS))
              ? Number(window.__DG_HEADER_SWEEP_VISUAL_DISABLE_FPS)
              : 28; // visual can survive lower; off only when things are dire

          const allowVisual = (fpsHint == null) ? true : (fpsHint >= __disableVisualFps);
          const allowForce  = (fpsHint == null) ? true : (fpsHint >= __disableForceFps);

          // VISUAL-ONLY sweep (cheap): translucent band behind/with playhead.
          if (allowVisual) {
            const bandW = Math.max(18, Math.round(gradientWidth * 0.9));
            const x0 = playheadX - bandW * 0.5;
            const x1 = playheadX + bandW * 0.5;
            const g = playheadCtx.createLinearGradient(x0, 0, x1, 0);
            g.addColorStop(0.00, 'rgba(255,255,255,0)');
            g.addColorStop(0.45, `hsla(${(hue + 45).toFixed(0)}, 100%, 70%, 0.035)`);
            g.addColorStop(0.55, `hsla(${(hue + 45).toFixed(0)}, 100%, 70%, 0.035)`);
            g.addColorStop(1.00, 'rgba(255,255,255,0)');
            const __vStart = (__phMark ? performance.now() : 0);
            playheadCtx.save();
            playheadCtx.globalCompositeOperation = 'source-over';
            playheadCtx.fillStyle = g;
            playheadCtx.fillRect(x0, gridArea.y, bandW, gridArea.h);
            playheadCtx.restore();
            if (__vStart) {
              try { __phMark('drawgrid.playhead.headerSweepVisual', performance.now() - __vStart); } catch {}
            }
          }

          // FORCE sweep (expensive): push along the full segment.
          // Degrade aggressively by FPS: run less often + fewer steps, and OFF entirely when needed.
          let sweepEvery = 1;
          let sweepMaxSteps = 36;
          if (fpsHint != null) {
            if (fpsHint < (__disableForceFps + 3)) { sweepEvery = 10; sweepMaxSteps = 6; }
            else if (fpsHint < 55) { sweepEvery = 6; sweepMaxSteps = 10; }
            else if (fpsHint < 60) { sweepEvery = 3; sweepMaxSteps = 18; }
            else { sweepEvery = 2; sweepMaxSteps = 24; }
          }

          panel.__dgPlayheadSweepFrame = (panel.__dgPlayheadSweepFrame || 0) + 1;
          if (allowForce && sweepEvery > 0 && (panel.__dgPlayheadSweepFrame % sweepEvery) === 0) {
            const baseSweepMaxSteps = 36;
            const forceMul = Math.max(
              1,
              sweepEvery * (baseSweepMaxSteps / Math.max(1, sweepMaxSteps)) * 1.35
            );
            const __hsStart = (__phMark ? performance.now() : 0);
            FF.pushHeaderSweepAt(playheadX, { lineWidthPx: gradientWidth, maxSteps: sweepMaxSteps, forceMul });
            if (__hsStart) {
              try { __phMark('drawgrid.playhead.headerSweep', performance.now() - __hsStart); } catch {}
            }
          }
        } catch (e) { /* fail silently */ }

        if (playheadDrawSimple) {
          playheadCtx.globalAlpha = 0.9;
          playheadCtx.strokeStyle = `hsl(${(hue + 45).toFixed(0)}, 100%, 70%)`;
          playheadCtx.lineWidth = playheadLineW;
          playheadCtx.shadowColor = 'transparent';
          playheadCtx.shadowBlur = 0;
          playheadCtx.beginPath();
          playheadCtx.moveTo(playheadX, gridArea.y);
          playheadCtx.lineTo(playheadX, gridArea.y + gridArea.h);
          playheadCtx.stroke();
          playheadCtx.globalAlpha = 1.0;
        } else {

          const __spriteGetStart = __phMark ? performance.now() : 0;
          const composite = getPlayheadCompositeSprite({
            gradientWidth: spriteGradientWidth,
            height: spriteHeight,
            hue,
            trailLineCount,
            gap,
            mainLineW: playheadLineW,
            trailW0,
            trailWStep,
          });
          if (__spriteGetStart) {
            try { __phMark('drawgrid.playhead.spriteGet', performance.now() - __spriteGetStart); } catch {}
          }
          if (composite) {
            const originX = Number.isFinite(composite.__dgOriginX)
              ? composite.__dgOriginX
              : (composite.width / 2);
            // If our cached sprite dims are already "close enough", avoid per-frame scaling.
            // Scaling a tall glow sprite is surprisingly expensive during pan/zoom.
            const dstH = (Math.abs(gridArea.h - spriteHeight) <= 8) ? spriteHeight : gridArea.h;
            const dstY = gridArea.y + (gridArea.h - dstH) * 0.5;
            const __imgStart = __phMark ? performance.now() : 0;
            playheadCtx.drawImage(
              composite,
              playheadX - originX,
              dstY,
              composite.width,
              dstH
            );
            if (__imgStart) {
              try { __phMark('drawgrid.playhead.drawImage', performance.now() - __imgStart); } catch {}
            }
          }
        }

        playheadCtx.restore();
        };
        const drawPlayhead = () => {
          R.resetCtx(playheadCtx);
          __dgWithLogicalSpace(playheadCtx, __drawPlayheadInner);
        };
        if (playheadCtx === playheadFrontCtx) {
          drawPlayhead();
        } else {
          R.withOverlayClip(playheadCtx, gridArea, false, drawPlayhead);
        }
      }
        } catch (e) { /* fail silently */ }
        if (__playheadStart) {
          const __playheadDt = performance.now() - __playheadStart;
          try { window.__PerfFrameProf?.mark?.('drawgrid.overlay.playhead', __playheadDt); } catch {}
        }
      } else {
      const info = getLoopInfo();
      if (info) {
        localLastPhase = info.phase01;
      }
    }

    // Debug overlay
    if (allowOverlayDrawHeavy && window.DEBUG_DRAWGRID === 1) {
      overlayCompositeNeeded = true;
      markFlashLayerActive();
      fctx.save();
      fctx.strokeStyle = 'red';
      fctx.lineWidth = 1;
      const debugSurface = getActiveFlashCanvas();
      const dbgW = debugSurface?.width ?? cssW;
      const dbgH = debugSurface?.height ?? cssH;
      fctx.strokeRect(0, 0, dbgW, dbgH);
      fctx.fillStyle = 'red';
      fctx.font = '12px monospace';
      const pxScale = dbgW ? (paint.width / dbgW).toFixed(2) : 'n/a';
      fctx.fillText(`boardScale: ${boardScale.toFixed(2)}`, 5, 15);
      fctx.fillText(`w x h: ${dbgW} x ${dbgH}`, 5, 30);
      fctx.fillText(`pixelScale: ${pxScale}`, 5, 45);
      if (__dgFpsValue) {
        fctx.fillText(`fps: ${__dgFpsValue.toFixed(1)}`, 5, 60);
      }
      fctx.restore();
    }

    if (DG_SINGLE_CANVAS && canDrawAnything && panel.__dgSingleCompositeDirty) {
      if (drawing || __dgSkipSwapsDuringDrag) {
        // Defer composite while the user is actively drawing; otherwise it can
        // overwrite the live front-buffer stroke with stale back content.
        __dgNeedsUIRefresh = true;
      } else {
      const __compositeStart = (__perfOn && typeof performance !== 'undefined' && performance.now)
        ? performance.now()
        : 0;
      compositeSingleCanvas();
      panel.__dgSingleCompositeDirty = false;
      if (__perfOn && __compositeStart) {
        try { window.__PerfFrameProf?.mark?.('drawgrid.draw.composite', performance.now() - __compositeStart); } catch {}
      }
      }
    }

    if (__dgFrameProfileStart !== null) {
      const totalDt = performance.now() - __dgFrameProfileStart;
      if (totalDt > DG_FRAME_SLOW_THRESHOLD_MS) {
        console.log('[DG][frame][slow]', {
          dtMs: Number(totalDt.toFixed(2)),
          frame: panel.__dgFrame | 0,
          allowOverlayDraw,
          allowParticleDraw,
          cssW,
          cssH,
        });
      }
    }

    dgf('end', { f: panel.__dgFrame|0 });
    // Continue while visible / active.
    ensureRenderLoopRunning();
    } finally {
      endPerf();
      if (__perfOn && __rafStart) {
        try { window.__PerfFrameProf.mark('perf.raf.drawgrid', performance.now() - __rafStart); } catch {}
      }
    }
  }
  renderLoop.__perfRafTag = 'perf.raf.drawgrid';
  rafId = requestAnimationFrame(renderLoop);

  function applyInstrumentFromState(value, { emitEvents = true } = {}) {
    const resolved = (typeof value === 'string') ? value.trim() : '';
    if (!resolved) return false;
    const prev = panel.dataset.instrument || '';
    const changed = prev !== resolved;
    panel.dataset.instrument = resolved;
    panel.dataset.instrumentPersisted = '1';
    if (changed && emitEvents) {
      try { panel.dispatchEvent(new CustomEvent('toy-instrument', { detail: { value: resolved }, bubbles: true })); } catch {}
      try { panel.dispatchEvent(new CustomEvent('toy:instrument', { detail: { name: resolved, value: resolved }, bubbles: true })); } catch {}
    }
    return changed;
  }

  function captureState() {
    try {
      const serializeSetArr = (arr) => Array.isArray(arr) ? arr.map(s => Array.from(s || [])) : [];
      const serializeNodes = (arr) => Array.isArray(arr) ? arr.map(s => Array.from(s || [])) : [];
      const normPt = (p) => {
        try {
          const nx = (gridArea.w > 0) ? (p.x - gridArea.x) / gridArea.w : 0;
          const gh = Math.max(1, gridArea.h - topPad);
          const ny = gh > 0 ? (p.y - (gridArea.y + topPad)) / gh : 0;
          return { nx, ny };
        } catch { return { nx: 0, ny: 0 }; }
      };
      return {
        steps: cols | 0,
        autotune: !!autoTune,
        instrument: panel.dataset.instrument || undefined,
        strokes: (strokes || []).map(s => ({
          ptsN: Array.isArray(s.pts) ? s.pts.map(normPt) : [],
          color: s.color,
          isSpecial: !!s.isSpecial,
          generatorId: (typeof s.generatorId === 'number') ? s.generatorId : undefined,
          overlayColorize: !!s.overlayColorize,
        })),
        nodes: {
          active: (currentMap?.active && Array.isArray(currentMap.active)) ? currentMap.active.slice() : Array(cols).fill(false),
          disabled: serializeSetArr(persistentDisabled || []),
          list: serializeNodes(currentMap?.nodes || []),
          groups: (nodeGroupMap || []).map(m => m instanceof Map ? Array.from(m.entries()) : []),
        },
        manualOverrides: Array.isArray(manualOverrides) ? manualOverrides.map(s => Array.from(s || [])) : [],
      };
    } catch (e) {
      return { steps: cols | 0, autotune: !!autoTune };
    }
  }

  function restoreFromState(state) {
    const prevRestoring = isRestoring;
    isRestoring = true;
    if (state && typeof state.instrument === 'string') {
      applyInstrumentFromState(state.instrument, { emitEvents: true });
    }
    const hasStrokes = Array.isArray(state?.strokes) && state.strokes.length > 0;
    const hasActiveNodes = Array.isArray(state?.nodes?.active) && state.nodes.active.some(Boolean);
    const hasNodeList = Array.isArray(state?.nodes?.list) && state.nodes.list.some(arr => Array.isArray(arr) && arr.length > 0);
    try {
      const stats = {
        strokes: Array.isArray(state?.strokes) ? state.strokes.length : 0,
        nodeCount: computeSerializedNodeStats(state?.nodes?.list, state?.nodes?.disabled).nodeCount,
        activeCols: Array.isArray(state?.nodes?.active) ? state.nodes.active.filter(Boolean).length : 0,
      };
      const stack = (new Error('restore-state')).stack?.split('\n').slice(0, 6).join('\n');
      dgTraceLog('[drawgrid][RESTORE] requested', { panelId: panel.id, stats, stack });
    } catch {}
    updateHydrateInboundFromState(state, { reason: 'restoreFromState', panelId: panel?.id });
    if (!hasStrokes && !hasActiveNodes && !hasNodeList) {
      isRestoring = prevRestoring;
      return;
    }
    try {
      R.clearCanvas(pctx);
      emitDG('paint-clear', { reason: 'restore-state' });
      R.clearCanvas(nctx);
      const flashSurface = getActiveFlashCanvas();
      const __flashDpr = __dgGetCanvasDprFromCss(flashSurface, cssW, paintDpr);
      R.resetCtx(fctx);
      __dgWithLogicalSpaceDpr(R, fctx, __flashDpr, () => {
        const { x, y, w, h } = R.getOverlayClearRect({
          canvas: flashSurface,
          pad: R.getOverlayClearPad(),
          allowFull: !!panel.__dgFlashOverlayOutOfGrid,
          gridArea,
        });
        fctx.clearRect(x, y, w, h);
        emitDG('overlay-clear', { reason: 'restore-state' });
      });

      const denormPt = (nx, ny) => {
        const gh = Math.max(1, gridArea.h - topPad);
        return {
          x: gridArea.x + nx * gridArea.w,
          y: gridArea.y + topPad + ny * gh,
        };
      };

      strokes = (state?.strokes || []).map(s => {
        const ptsN = Array.isArray(s.ptsN) ? s.ptsN.map(p => ({
          nx: Math.max(0, Math.min(1, Number(p?.nx) || 0)),
          ny: Math.max(0, Math.min(1, Number(p?.ny) || 0)),
        })) : null;
        return {
          pts: (s.ptsN || []).map(p => denormPt(p.nx || 0, p.ny || 0)),
          __ptsN: ptsN,
          color: s.color,
          isSpecial: !!s.isSpecial,
          generatorId: (typeof s.generatorId === 'number') ? s.generatorId : undefined,
          overlayColorize: !!s.overlayColorize,
        };
      });

      FD.markRegenSource('restore-state');
      FD.markRegenSource('randomize');
      regenerateMapFromStrokes();
      currentMap = normalizeMapColumns(currentMap, cols);

      __dgWithLogicalSpace(pctx, () => {
        R.clearCanvas(pctx);
        for (const s of strokes) drawFullStroke(pctx, s, { skipReset: true, skipTransform: true });
      });

      __hydrationJustApplied = true;
      __dgHydrationPendingRedraw = true;
      HY.scheduleHydrationLayoutRetry(panel, () => layout(true));
      setTimeout(() => { __hydrationJustApplied = false; }, 32);

      // IMPORTANT:
      // On refresh, zoom/overview boot can briefly report a *scaled* DOM rect (see debug: rectW/rectH)
      // while cssW/cssH are already correct. In that window, the single-canvas composite can miss a
      // guaranteed "final" swap, leaving the user seeing an empty body (grid hidden / stroke scale wrong)
      // until an interaction triggers a redraw.
      //
      // So: after hydration/restore, force a full draw + composite and a front swap deterministically.
      try {
        markStaticDirty('restore-from-state');
      } catch {}
      try {
        panel.__dgSingleCompositeDirty = true;
      } catch {}
      __dgNeedsUIRefresh = true;
      __dgFrontSwapNextDraw = true;
      __dgForceFullDrawNext = true;
      __dgForceFullDrawFrames = Math.max(__dgForceFullDrawFrames || 0, 8);

      ensurePostCommitRedraw('restoreFromState');
      try {
        if (typeof requestFrontSwap === 'function') {
          requestFrontSwap(useFrontBuffers);
        }
      } catch {}

      // Deterministically stabilize restore across the "overview settling" window.
      try { schedulePostRestoreStabilize('restoreFromState'); } catch {}
      emitDrawgridUpdate({ activityOnly: false });
      markStaticDirty('external-state-change');
  } catch (e) {
      emitDrawgridUpdate({ activityOnly: false });
    } finally {
      isRestoring = prevRestoring;
      __dgNeedsUIRefresh = true;
      __dgStableFramesAfterCommit = 0;
      try {
        const hasStrokes = Array.isArray(strokes) && strokes.length > 0;
        const hasNodes = Array.isArray(currentMap?.nodes)
          ? currentMap.nodes.some(set => set && set.size > 0)
          : false;
        try {
          updateHydrateInboundFromState(captureState(), { reason: 'restore-from-state-applied', panelId: panel?.id });
        } catch {}

        if (hasStrokes || hasNodes) {
          schedulePersistState({ source: 'restore-from-state' });
        }
      } catch {
        // Ignore persist errors during hydration; keep prior local save intact.
      }
    }
  }

  // After hydration/restore, the app can spend a few frames "settling" overview/zoom/layout.
  // If we only resnap once, we can lock in a wrong basis (grid hidden / stroke scale wrong)
  // until the next interaction (camera move) forces a resnap. So: stabilize deterministically.
  let __dgPostRestoreStabilizeRAF = 0;
  function cancelPostRestoreStabilize() {
    if (__dgPostRestoreStabilizeRAF) {
      try { cancelAnimationFrame(__dgPostRestoreStabilizeRAF); } catch {}
      __dgPostRestoreStabilizeRAF = 0;
    }
  }
  function schedulePostRestoreStabilize(tag = 'post-restore') {
    cancelPostRestoreStabilize();
    let framesLeft = 12;     // hard cap: don't loop forever
    let stable = 0;          // need 2 stable frames in a row
    let lastKey = null;
    const step = () => {
      __dgPostRestoreStabilizeRAF = 0;
      if (!panel?.isConnected) return;
      try {
        // Force layout + redraw even if culling currently thinks we're not visible.
        // (This mirrors the "camera move fixes it" behavior, but deterministically.)
        try { layout(true); } catch {}
        try {
          const hasStrokes = Array.isArray(strokes) && strokes.length > 0;
          const hasNodes = Array.isArray(currentMap?.nodes)
            ? currentMap.nodes.some(set => set && set.size > 0)
            : false;
          const hasAnyPaint = ((__dgPaintRev | 0) > 0) || hasOverlayStrokesCached();
          const ghostNonEmpty = panel && panel.__dgGhostLayerEmpty === false;
          // IMPORTANT: stabilize pass can run right after a gesture (pan/zoom) ends.
          // A blank toy may still have a live ghost trail; never let a resnap trigger the
          // "resnap-empty -> clearDrawgridInternal" path in that case.
          const preservePaintIfNoStrokes = (!hasStrokes && !hasNodes) && (ghostGuideAutoActive || ghostNonEmpty || !hasAnyPaint);
          if (typeof window !== 'undefined' && window.__DG_GHOST_TRACE) {
            dgGhostTrace('post-restore:stabilize-resnap', {
              preservePaintIfNoStrokes,
              hasStrokes,
              hasNodes,
              hasAnyPaint,
              ghostNonEmpty,
              ghostAutoActive: ghostGuideAutoActive,
            });
          }
          resnapAndRedraw(true, { preservePaintIfNoStrokes });
        } catch {}
      } catch {}

      const key = `${Math.round(cssW)}x${Math.round(cssH)}:${Math.round(gridArea.w)}x${Math.round(gridArea.h)}`;
      if (key === lastKey) stable++;
      else { stable = 0; lastKey = key; }

      framesLeft--;
      if (stable >= 2) return;
      if (framesLeft <= 0) return;
      __dgPostRestoreStabilizeRAF = requestAnimationFrame(step);
    };

    // Give the DOM at least one frame to apply any pending transforms before we start stabilizing.
    __dgPostRestoreStabilizeRAF = requestAnimationFrame(step);
  }

  function clearDrawgridInternal(options = {}) {
    const opts = (options && typeof options === 'object') ? options : {};
    const user = !!opts.user;
    const reason = typeof opts.reason === 'string' ? opts.reason : 'api.clear';
    const guardActive = !!DG_HYDRATE.guardActive;
    const inboundNonEmpty = inboundWasNonEmpty();
    // If a programmatic clear lands on a toy that already has strokes/nodes,
    // veto it unless detail.user === true. This prevents unintended wipes.
    if (!opts.user) {
      const hasStrokes = Array.isArray(strokes) && strokes.length > 0;
      const hasActiveCols = currentMap?.active?.some(Boolean);
      if (hasStrokes || hasActiveCols) {
        dgTraceWarn?.('[drawgrid][CLEAR][VETO] programmatic clear blocked on non-empty toy', {
          reason,
          hasStrokes,
          hasActiveCols
        });
        return false;
      }
    }
    // If we're already empty and the ghost guide is currently sweeping, avoid a redundant
    // clear that would stop/restart the guide and cut its trail mid-path.
    if (!user) {
      const alreadyEmpty = !(Array.isArray(strokes) && strokes.length > 0) && !(currentMap?.active?.some(Boolean));
      if (alreadyEmpty && ghostGuideRunning) {
        dgGhostTrace('clear:no-op', {
          id: panel?.id || null,
          reason,
          running: ghostGuideRunning,
          autoActive: ghostGuideAutoActive,
          stack: __dgGhostMaybeStack('DG clearDrawgridInternal:no-op'),
        });
        // Still ensure the empty-state guide is active.
        if (!ghostGuideAutoActive) {
          startAutoGhostGuide({ immediate: true, reason: 'clear:no-op:ensure-empty' });
        }
        return true;
      }
    }
    let stackSnippet = null;
    try {
      stackSnippet = (new Error('clear-call')).stack?.split('\n').slice(0, 6).join('\n');
    } catch {}
    const clearLog = {
      reason,
      user,
      guardActive,
      pendingUserClear: DG_HYDRATE.pendingUserClear,
      inboundNonEmpty,
      stack: stackSnippet,
    };
    if (!user && (guardActive || inboundNonEmpty)) {
      dgTraceWarn('[drawgrid][CLEAR][VETO] blocked programmatic clear', clearLog);
      return false;
    }
    if (user) {
      dgTraceLog('[drawgrid][CLEAR] user', clearLog);
      DG_HYDRATE.pendingUserClear = true;
      markUserChange('user-clear', { reason });
    } else {
      dgTraceWarn('[drawgrid][CLEAR] programmatic', clearLog);
    }
    const makeFlowCtx = () => ({
      panel,
      paint,
      backCanvas,
      flashCanvas,
      flashBackCanvas,
      activeFlashCanvas: (typeof getActiveFlashCanvas === 'function') ? getActiveFlashCanvas() : null,
      strokes,
      usingBackBuffers,
      paintRev: __dgPaintRev,
      compositeDirty: panel.__dgSingleCompositeDirty,
      hasOverlayStrokesCached,
    });
    FD.flowState('clear:start', makeFlowCtx());
    R.clearCanvas(pctx);
    // Clear both paint buffers to prevent stale composites.
    try { if (backCtx && pctx !== backCtx) R.clearCanvas(backCtx); } catch {}
    try { if (frontCtx && pctx !== frontCtx) R.clearCanvas(frontCtx); } catch {}
    emitDG('paint-clear', { reason: 'pre-redraw' });
    R.clearCanvas(nctx);
    const flashSurface = getActiveFlashCanvas();
    const __flashDpr = __dgGetCanvasDprFromCss(flashSurface, cssW, paintDpr);
    R.resetCtx(fctx);
    __dgWithLogicalSpaceDpr(R, fctx, __flashDpr, () => {
      const { x, y, w, h } = R.getOverlayClearRect({
        canvas: flashSurface,
        pad: R.getOverlayClearPad(),
        allowFull: !!panel.__dgFlashOverlayOutOfGrid,
        gridArea,
      });
      fctx.clearRect(x, y, w, h);
      emitDG('overlay-clear', { reason: 'pre-redraw' });
    });
    try {
      if (flashBackCtx && flashBackCtx !== fctx) {
        R.resetCtx(flashBackCtx);
        R.withLogicalSpace(flashBackCtx, () => {
          const { x, y, w, h } = R.getOverlayClearRect({
            canvas: flashBackCtx.canvas,
            pad: R.getOverlayClearPad(),
            allowFull: !!panel.__dgFlashOverlayOutOfGrid,
            gridArea,
          });
          flashBackCtx.clearRect(x, y, w, h);
        });
      }
      if (flashFrontCtx && flashFrontCtx !== fctx) {
        R.resetCtx(flashFrontCtx);
        R.withLogicalSpace(flashFrontCtx, () => {
          const { x, y, w, h } = R.getOverlayClearRect({
            canvas: flashFrontCtx.canvas,
            pad: R.getOverlayClearPad(),
            allowFull: !!panel.__dgFlashOverlayOutOfGrid,
            gridArea,
          });
          flashFrontCtx.clearRect(x, y, w, h);
        });
      }
    } catch {}
    try { markFlashLayerCleared(); } catch {}
    panel.__dgFlashOverlayOutOfGrid = false;
    __dgOverlayStrokeListCache = { paintRev: -1, len: 0, special: [], colorized: [], outOfGrid: false };
    __dgOverlayStrokeCache = { value: false, len: 0, ts: 0 };
    strokes = [];
    prevStrokeCount = 0;
    manualOverrides = Array.from({ length: cols }, () => new Set());
    persistentDisabled = Array.from({ length: cols }, () => new Set());
    const emptyMap = {active:Array(cols).fill(false),nodes:Array.from({length:cols},()=>new Set()), disabled:Array.from({length:cols},()=>new Set())};
    currentMap = emptyMap;
    emitDrawgridUpdate({ activityOnly: false });
    drawGrid();
    nextDrawTarget = null; // Disarm any pending line draw
    updateGeneratorButtons(); // Refresh button state to "Draw"
    // IMPORTANT: if a transient programmatic clear lands while the guide is sweeping,
    // preserve its trail to avoid visible cut-outs.
    stopAutoGhostGuide({ immediate: false, reason: 'clear:end', preserveTrail: true });
    // Restart/ensure the empty-state guide.
    if (!ghostGuideAutoActive) {
      startAutoGhostGuide({ immediate: true, reason: 'clear:empty' });
    }
    drawLabelState.hasDrawnFirstLine = false;
    updateDrawLabel(true);
    noteToggleEffects = [];
    __dgMarkSingleCanvasDirty(panel);
    if (DG_SINGLE_CANVAS && isPanelVisible) {
      try { compositeSingleCanvas(); } catch {}
      panel.__dgSingleCompositeDirty = false;
    }
    FD.flowState('clear:end', makeFlowCtx());
    return true;
  }

  const api = {
    panel,
    startGhostGuide,
    stopGhostGuide,
    __inboundNonEmpty: () => inboundWasNonEmpty(),
    clear: clearDrawgridInternal,
    getState: captureState,
    hasActiveNotes: () => {
      try {
        return !!(currentMap?.active && currentMap.active.some(Boolean));
      } catch { return false; }
    },
    restoreState: restoreFromState,
    setState: (st={})=>{
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!panel.isConnected) return;
          isRestoring = true;
          const fallbackHydrationState = getFallbackHydrationState();
          try {
            const stats = {
              strokes: Array.isArray(st?.strokes) ? st.strokes.length : 0,
              nodeCount: computeSerializedNodeStats(st?.nodes?.list, st?.nodes?.disabled).nodeCount,
              activeCols: Array.isArray(st?.nodes?.active) ? st.nodes.active.filter(Boolean).length : 0,
            };
            const stack = (new Error('set-state')).stack?.split('\n').slice(0, 6).join('\n');
            dgTraceLog('[drawgrid][SETSTATE] requested', { panelId: panel.id, stats, stack });
          } catch {}
          const guardStrokesCandidate = Array.isArray(st?.strokes) && st.strokes.length > 0
            ? st.strokes
            : (Array.isArray(fallbackHydrationState?.strokes) ? fallbackHydrationState.strokes : []);
          const guardNodesListCandidate = Array.isArray(st?.nodes?.list) && st.nodes.list.length > 0
            ? st.nodes.list
            : (fallbackHydrationState?.nodes?.list || []);
          const guardNodesActiveCandidate = Array.isArray(st?.nodes?.active) && st.nodes.active.length > 0
            ? st.nodes.active
            : (fallbackHydrationState?.nodes?.active || []);
          const guardNodesDisabledCandidate = Array.isArray(st?.nodes?.disabled) && st.nodes.disabled.length > 0
            ? st.nodes.disabled
            : (fallbackHydrationState?.nodes?.disabled || []);
          updateHydrateInboundFromState({
            strokes: guardStrokesCandidate,
            nodes: {
              list: guardNodesListCandidate,
              active: guardNodesActiveCandidate,
              disabled: guardNodesDisabledCandidate,
            },
          }, { reason: 'setState-pre', panelId: panel?.id });
          if (typeof st?.instrument === 'string') {
            applyInstrumentFromState(st.instrument, { emitEvents: true });
          }
          try{
            // Steps first
            if (typeof st.steps === 'number' && (st.steps===8 || st.steps===16)){
              if ((st.steps|0) !== cols){
                cols = st.steps|0;
                currentCols = cols;
                panel.dataset.steps = String(cols);
                flashes = new Float32Array(cols);
                persistentDisabled = Array.from({ length: cols }, () => new Set());
                manualOverrides = Array.from({ length: cols }, () => new Set());
                // Force layout for new resolution
                resnapAndRedraw(true);
              }
            }
            // Ensure geometry is current before de-normalizing
            try{ layout(true); }catch{}
            if (typeof st.autotune !== 'undefined') {
              autoTune = !!st.autotune;
              try{
                const btn = panel.querySelector('.drawgrid-autotune');
                if (btn){ btn.textContent = `Auto-tune: ${autoTune ? 'On' : 'Off'}`; btn.setAttribute('aria-pressed', String(autoTune)); }
              }catch{}
            }
            // Restore strokes (fallback to persisted paint data if external state omits it)
            const hasIncomingStrokes = Object.prototype.hasOwnProperty.call(st, 'strokes');
            const incomingStrokes = Array.isArray(st.strokes) ? st.strokes : null;
            const fallbackStrokes = (!hasIncomingStrokes && Array.isArray(fallbackHydrationState?.strokes) && fallbackHydrationState.strokes.length > 0)
              ? fallbackHydrationState.strokes
              : null;
            const strokeSource = (incomingStrokes && incomingStrokes.length > 0) ? incomingStrokes : fallbackStrokes;
            if (strokeSource) {
              strokes = [];
              for (const s of strokeSource){
                let pts = [];
                if (Array.isArray(s?.ptsN)){
                  const gh = Math.max(1, gridArea.h - topPad);
                  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
                  pts = s.ptsN.map(np=>({
                    x: gridArea.x + clamp(Number(np?.nx)||0, 0, 1) * gridArea.w,
                    y: (gridArea.y + topPad) + clamp(Number(np?.ny)||0, 0, 1) * gh
                  }));
                } else if (Array.isArray(s?.pts)) {
                  // Legacy raw points fallback
                  pts = s.pts.map(p=>({ x: Number(p.x)||0, y: Number(p.y)||0 }));
                }
                const ptsN = Array.isArray(s?.ptsN) ? s.ptsN.map(np => ({
                  nx: Math.max(0, Math.min(1, Number(np?.nx) || 0)),
                  ny: Math.max(0, Math.min(1, Number(np?.ny) || 0)),
                })) : null;
                const stroke = {
                  pts,
                  __ptsN: ptsN,
                  color: s?.color || STROKE_COLORS[0],
                  isSpecial: !!s?.isSpecial,
                  generatorId: (typeof s?.generatorId==='number') ? s.generatorId : undefined,
                  overlayColorize: !!s?.overlayColorize,
                };
                strokes.push(stroke);
              }
              clearAndRedrawFromStrokes(null, 'setState-strokes');
            } else if (hasIncomingStrokes && Array.isArray(st.strokes)) {
              const hasFallback = Array.isArray(fallbackHydrationState?.strokes) && fallbackHydrationState.strokes.length > 0;
              if (!hasFallback) {
                strokes = [];
                clearAndRedrawFromStrokes(null, 'setState-strokes-empty');
              }
            }

            // Restore node masks if provided
            if (st.nodes && typeof st.nodes==='object'){
              try{
                const act = Array.isArray(st.nodes.active) ? st.nodes.active.slice(0, cols) : null;
                const dis = Array.isArray(st.nodes.disabled) ? st.nodes.disabled.slice(0, cols).map(a => new Set(a || [])) : null;
                const list = Array.isArray(st.nodes.list) ? st.nodes.list.slice(0, cols).map(a => new Set(a || [])) : null;
                const groups = Array.isArray(st.nodes.groups) ? st.nodes.groups.map(g => new Map(g || [])) : null;

                // If a node list is present in the saved state, it is the source of truth.
                if (list) {
                    if (!currentMap) {
                        // If strokes were not restored, currentMap is null. Build it from saved node list.
                        currentMap = { active: Array(cols).fill(false), nodes: list, disabled: Array.from({length:cols},()=>new Set()) };
                    } else {
                        // If strokes were restored, currentMap exists. Overwrite its nodes with the saved list.
                        currentMap.nodes = list;
                    }
                }

                if (currentMap && (act || dis || groups)) {
                    if (groups) nodeGroupMap = groups;
                    for (let c = 0; c < cols; c++) {
                        if (act && act[c] !== undefined) currentMap.active[c] = !!act[c];
                        if (dis && dis[c] !== undefined) currentMap.disabled[c] = dis[c];
                    }
                }

                  persistentDisabled = currentMap.disabled;
                  __dgBumpNodesRev('setState-nodes');

                  drawGrid();
                  drawNodes(currentMap.nodes);
                  try{ 
                    emitDrawgridUpdate({ activityOnly: false });
                  }catch{}
              } catch(e){ }
            }
            if (Array.isArray(st.manualOverrides)){
              try{ manualOverrides = st.manualOverrides.slice(0, cols).map(a=> new Set(a||[])); }catch{}
            }
            // Refresh UI affordances
            try { (panel.__dgUpdateButtons || updateGeneratorButtons)(); } catch{}
            // After all state is applied and layout is stable, sync the dropdown.
            try {
              const stepsSel = panel.querySelector('.drawgrid-steps');
              if (stepsSel) stepsSel.value = String(cols);
            } catch {}
            if (currentMap){ 
              try{
                emitDrawgridUpdate({ activityOnly: false });
              }catch{}
            }
            __hydrationJustApplied = true;
            __dgHydrationPendingRedraw = true;
            HY.scheduleHydrationLayoutRetry(panel, () => layout(true));
            setTimeout(() => { __hydrationJustApplied = false; }, 32);

            // IMPORTANT:
            // Chained toys typically apply their saved content via setState() (not restoreFromState()).
            // During refresh/boot, zoom/overview settling can briefly report a scaled DOM rect.
            // If we miss a guaranteed composite+swap after applying state, the user can see an
            // empty body (no grid) and/or strokes appear incorrectly scaled until interaction.
            // Mirror the restoreFromState post-hydration forcing here.
            try {
              markStaticDirty('set-state');
            } catch {}
            try {
              panel.__dgSingleCompositeDirty = true;
            } catch {}
            __dgNeedsUIRefresh = true;
            __dgFrontSwapNextDraw = true;
            __dgForceFullDrawNext = true;
            __dgForceFullDrawFrames = Math.max(__dgForceFullDrawFrames || 0, 8);
            ensurePostCommitRedraw('setState');
            try {
              if (typeof requestFrontSwap === 'function') {
                requestFrontSwap(useFrontBuffers);
              }
            } catch {}
            // Chained toys restore via setState() -- stabilize the same way as restoreFromState().
            try { schedulePostRestoreStabilize('setState'); } catch {}
          }catch(e){ }
          isRestoring = false;
          // Re-check after hydration completes
          scheduleGhostIfEmpty({ initialDelay: 0 });
          try {
            updateHydrateInboundFromState(captureState(), { reason: 'setState-applied', panelId: panel?.id });
          } catch {}
          const strokeCount = Array.isArray(strokes) ? strokes.length : 0;
          const { nodeCount: postNodeCount } = computeCurrentMapNodeStats(currentMap?.nodes, currentMap?.disabled);
          const guardBlocksPostSetState =
            DG_HYDRATE.guardActive &&
            !DG_HYDRATE.seenUserChange &&
            inboundWasNonEmpty() &&
            strokeCount === 0 &&
            postNodeCount === 0;
          if (guardBlocksPostSetState) {
            dgTraceLog('[drawgrid][persist-guard] skip post-setState persist (guard active & snapshot empty)', {
              inbound: { ...DG_HYDRATE.inbound },
              strokeCount,
              nodeCount: postNodeCount,
              seenUserChange: DG_HYDRATE.seenUserChange,
              lastPersistNonEmpty: DG_HYDRATE.lastPersistNonEmpty,
            });
          } else {
            schedulePersistState({ source: 'setState-complete' });
          }
          try { dgTraceLog('[drawgrid] SETSTATE complete', panel.id); } catch {}
        });
      });
    }
  };

  try {
    panel.__dgPerfWarmup = () => {
      try { layout(true); } catch {}
      try { clearAndRedrawFromStrokes(null, 'perf-warmup'); } catch {}
    };
  } catch {}

  // Add some CSS for the new buttons
  const style = document.createElement('style');
  style.textContent = `
      .toy-panel[data-toy="drawgrid"] .drawgrid-generator-buttons {
          position: absolute;
          left: -115px; /* Position outside the panel */
          top: 50%;
          transform: translateY(-50%);
          display: none; /* Hidden by default */
          flex-direction: column;
          gap: 10px;
          z-index: 1;
      }
      .toy-panel[data-toy="drawgrid"].toy-zoomed .drawgrid-generator-buttons {
          display: flex; /* Visible only in advanced mode */
      }
      .toy-panel[data-toy="drawgrid"] .c-btn.active .c-btn-glow {
          opacity: 1;
          filter: blur(2.5px) brightness(1.6);
      }
      .toy-panel[data-toy="drawgrid"] .c-btn.active .c-btn-core::before {
          filter: brightness(1.8);
          transform: translate(-50%, -50%) scale(1.1);
      }
  `;
  panel.appendChild(style);

  panel.addEventListener('toy-clear', (event) => {
    // Ignore clears that were dispatched on other panels (defensive guard)
    if (event?.target !== panel) return;

    const detail = (event && typeof event === 'object') ? (event.detail || {}) : {};
    // Treat clears as programmatic unless explicitly flagged as user: true
    const user = detail.user === true || event?.isTrusted === true ||
      (detail.user == null && detail.reason == null);
    const reason = typeof detail.reason === 'string' ? detail.reason : 'toy-clear';
    api.clear({ user, reason });
  });

  // When we change strokes programmatically (eg Random) we must invalidate overlay caches
  // and force a redraw; otherwise (especially while playing / with front buffers) we can
  // show only the backing line until another event (eg Play toggle) triggers a full refresh.
  function __dgAfterProgrammaticVisualChange(reason) {
    try {
      const snap = __dgEnsureLayerSizes('programmatic-visual');
      if (!snap) {
        try { layout(true); } catch {}
        try { __dgEnsureLayerSizes('programmatic-visual:layout'); } catch {}
      }
    } catch {}
    try { markPaintDirty(); } catch {}
    try { __dgOverlayStrokeListCache.paintRev = -1; __dgOverlayStrokeListCache.len = -1; } catch {}
    try { panel.__dgSingleCompositeDirty = true; } catch {}
    try { __dgNeedsUIRefresh = true; } catch {}
    try { __dgFrontSwapNextDraw = true; } catch {}
    try { __dgForceFullDrawNext = true; } catch {}
    try { __dgForceFullDrawFrames = Math.max(__dgForceFullDrawFrames || 0, 2); } catch {}
    try { markStaticDirty(reason || 'programmatic-visual'); } catch {}
    try { ensurePostCommitRedraw(reason || 'programmatic-visual'); } catch {}
    try { if (typeof requestFrontSwap === 'function') requestFrontSwap(useFrontBuffers); } catch {}
  }

  function handleToyRandomEvent(e, kind) {
    try {
      if (e && e.__dgHandled) return;
      if (e) e.__dgHandled = true;
    } catch {}
    if (typeof window !== 'undefined' && window.__DG_DEBUG_DRAWFLOW) {
      console.log('[DG][flow] handleToyRandomEvent', {
        kind,
        panelId: panel?.id || null,
        phase: e?.eventPhase ?? null,
        targetId: e?.target?.id || null,
        hasDetail: !!e?.detail,
      });
    }
    if (typeof window !== 'undefined' && window.__DG_DEBUG_DRAWFLOW_EVENTS) {
      FD.flowLog(`event:${kind}`, {
        panelId: panel?.id || null,
        detail: e?.detail || null,
        phase: e?.eventPhase ?? null,
        targetId: e?.target?.id || null,
      });
    }
    if (typeof window !== 'undefined' && window.__DG_DEBUG_DRAWFLOW) {
      console.log('[DG][flow] handleToyRandomEvent:call', {
        kind,
        panelId: panel?.id || null,
        hasRandomize: typeof RNG?.handleRandomizeLine === 'function',
        hasBlocks: typeof RNG?.handleRandomizeBlocks === 'function',
        hasNotes: typeof RNG?.handleRandomizeNotes === 'function',
      });
    }
    try {
      try { ensureSizeReady({ force: true }); } catch {}
      try { layout(true); } catch {}
      try { __dgEnsureLayerSizes('random:pre', { force: true }); } catch {}
      try { pctx = (typeof getActivePaintCtx === 'function') ? getActivePaintCtx() : pctx; } catch {}
      try { if (!usingBackBuffers) ensureBackVisualsFreshFromFront?.(); } catch {}
      if (typeof window !== 'undefined' && window.__DG_RANDOM_TRACE) {
        try {
          const pCanvas = pctx?.canvas || null;
          const payload = {
            panelId: panel?.id || null,
            kind,
            cssW,
            cssH,
            paintDpr,
            usingBackBuffers,
            pctxRole: pCanvas?.getAttribute?.('data-role') || null,
            pctxSize: pCanvas ? { w: pCanvas.width, h: pCanvas.height } : null,
            frontCtx: frontCtx?.canvas ? { role: frontCtx.canvas.getAttribute?.('data-role') || null, w: frontCtx.canvas.width, h: frontCtx.canvas.height } : null,
            backCtx: backCtx?.canvas ? { role: backCtx.canvas.getAttribute?.('data-role') || null, w: backCtx.canvas.width, h: backCtx.canvas.height } : null,
          };
          if (window.__DG_RANDOM_TRACE_VERBOSE) {
            const snap = __dgGetLayerSizingSnapshot?.();
            const flashCanvasNow = fctx?.canvas || null;
            const paintRect = pCanvas?.getBoundingClientRect?.();
            const flashRect = flashCanvasNow?.getBoundingClientRect?.();
            const wrapRect = wrap?.getBoundingClientRect?.();
            const layersRect = layersRoot?.getBoundingClientRect?.();
            payload.DG_SINGLE_CANVAS = DG_SINGLE_CANVAS;
            payload.DG_SINGLE_CANVAS_OVERLAYS = DG_SINGLE_CANVAS_OVERLAYS;
            payload.gridArea = gridArea ? { x: gridArea.x, y: gridArea.y, w: gridArea.w, h: gridArea.h } : null;
            payload.cw = cw;
            payload.ch = ch;
            payload.paintRect = paintRect ? { w: paintRect.width, h: paintRect.height } : null;
            payload.flashRect = flashRect ? { w: flashRect.width, h: flashRect.height } : null;
            payload.wrapRect = wrapRect ? { w: wrapRect.width, h: wrapRect.height } : null;
            payload.layersRect = layersRect ? { w: layersRect.width, h: layersRect.height } : null;
            payload.flashDisplay = flashCanvasNow?.style?.display || null;
            payload.paintDisplay = pCanvas?.style?.display || null;
            payload.pctxSize = pCanvas ? { w: pCanvas.width, h: pCanvas.height, cssW: pCanvas.style?.width || null, cssH: pCanvas.style?.height || null } : null;
            payload.frontCtx = frontCtx?.canvas ? { role: frontCtx.canvas.getAttribute?.('data-role') || null, w: frontCtx.canvas.width, h: frontCtx.canvas.height, cssW: frontCtx.canvas.style?.width || null, cssH: frontCtx.canvas.style?.height || null } : null;
            payload.backCtx = backCtx?.canvas ? { role: backCtx.canvas.getAttribute?.('data-role') || null, w: backCtx.canvas.width, h: backCtx.canvas.height, cssW: backCtx.canvas.style?.width || null, cssH: backCtx.canvas.style?.height || null } : null;
            payload.snap = snap;
          }
          console.log('[DG][random][pre]', JSON.stringify(payload));
        } catch {}
      }
      try { __dgEnsureLayerSizes('random'); } catch {}
      if (kind === 'toy-random') RNG.handleRandomizeLine();
      else if (kind === 'toy-random-blocks') RNG.handleRandomizeBlocks();
      else if (kind === 'toy-random-notes') RNG.handleRandomizeNotes();
      __dgAfterProgrammaticVisualChange(kind);
      if (typeof window !== 'undefined' && window.__DG_RANDOM_TRACE) {
        try {
          const pCanvas = pctx?.canvas || null;
          const payload = {
            panelId: panel?.id || null,
            kind,
            cssW,
            cssH,
            paintDpr,
            usingBackBuffers,
            pctxRole: pCanvas?.getAttribute?.('data-role') || null,
            pctxSize: pCanvas ? { w: pCanvas.width, h: pCanvas.height } : null,
            frontCtx: frontCtx?.canvas ? { role: frontCtx.canvas.getAttribute?.('data-role') || null, w: frontCtx.canvas.width, h: frontCtx.canvas.height } : null,
            backCtx: backCtx?.canvas ? { role: backCtx.canvas.getAttribute?.('data-role') || null, w: backCtx.canvas.width, h: backCtx.canvas.height } : null,
          };
          if (window.__DG_RANDOM_TRACE_VERBOSE) {
            const snap = __dgGetLayerSizingSnapshot?.();
            const flashCanvasNow = fctx?.canvas || null;
            const paintRect = pCanvas?.getBoundingClientRect?.();
            const flashRect = flashCanvasNow?.getBoundingClientRect?.();
            const wrapRect = wrap?.getBoundingClientRect?.();
            const layersRect = layersRoot?.getBoundingClientRect?.();
            payload.DG_SINGLE_CANVAS = DG_SINGLE_CANVAS;
            payload.DG_SINGLE_CANVAS_OVERLAYS = DG_SINGLE_CANVAS_OVERLAYS;
            payload.gridArea = gridArea ? { x: gridArea.x, y: gridArea.y, w: gridArea.w, h: gridArea.h } : null;
            payload.cw = cw;
            payload.ch = ch;
            payload.paintRect = paintRect ? { w: paintRect.width, h: paintRect.height } : null;
            payload.flashRect = flashRect ? { w: flashRect.width, h: flashRect.height } : null;
            payload.wrapRect = wrapRect ? { w: wrapRect.width, h: wrapRect.height } : null;
            payload.layersRect = layersRect ? { w: layersRect.width, h: layersRect.height } : null;
            payload.flashDisplay = flashCanvasNow?.style?.display || null;
            payload.paintDisplay = pCanvas?.style?.display || null;
            payload.pctxSize = pCanvas ? { w: pCanvas.width, h: pCanvas.height, cssW: pCanvas.style?.width || null, cssH: pCanvas.style?.height || null } : null;
            payload.frontCtx = frontCtx?.canvas ? { role: frontCtx.canvas.getAttribute?.('data-role') || null, w: frontCtx.canvas.width, h: frontCtx.canvas.height, cssW: frontCtx.canvas.style?.width || null, cssH: frontCtx.canvas.style?.height || null } : null;
            payload.backCtx = backCtx?.canvas ? { role: backCtx.canvas.getAttribute?.('data-role') || null, w: backCtx.canvas.width, h: backCtx.canvas.height, cssW: backCtx.canvas.style?.width || null, cssH: backCtx.canvas.style?.height || null } : null;
            payload.snap = snap;
          }
          console.log('[DG][random][post]', JSON.stringify(payload));
        } catch {}
      }
      if (typeof window !== 'undefined' && window.__DG_DEBUG_DRAWFLOW) {
        console.log('[DG][flow] handleToyRandomEvent:done', {
          kind,
          panelId: panel?.id || null,
        });
      }
    } catch (err) {
      if (typeof window !== 'undefined' && window.__DG_DEBUG_DRAWFLOW) {
        console.warn('[DG][flow] handleToyRandomEvent:error', { kind, err });
      }
    }
  }
  panel.addEventListener('toy-random', (e) => handleToyRandomEvent(e, 'toy-random'), true);
  panel.addEventListener('toy-random-blocks', (e) => handleToyRandomEvent(e, 'toy-random-blocks'), true);
  panel.addEventListener('toy-random-notes', (e) => handleToyRandomEvent(e, 'toy-random-notes'), true);


  const persistedState = loadPersistedState();
  if (persistedState) {
    try { layout(true); } catch {}
    try { restoreFromState(persistedState); } catch (err) {
      if (DG_DEBUG) DG.warn('restoreFromState failed', err);
    }
  }

  // The ResizeObserver only fires on *changes*. We must call layout() once
  // manually to render the initial state. requestAnimationFrame ensures
  // the browser has finished its own layout calculations first.
  requestAnimationFrame(() => resnapAndRedraw(false));

  let ghostGuideAnimFrame = null;
  let ghostGuideLoopId = null;
  let ghostGuideAutoActive = false;
  let ghostGuideRunning = false;
  let ghostFadeRAF = 0;
  const GHOST_SWEEP_DURATION = 2000;
  const GHOST_SWEEP_PAUSE = 1000;
  // Extra tracing to diagnose "restart mid-path" / unexpected clears.
  let __dgGhostAutoSeq = 0;
  let __dgGhostSweepSeq = 0;
  let __dgGhostLastAutoReason = null;
  let __dgGhostLastStopReason = null;
  let __dgGhostLastSweepReason = null;

  function stopGhostGuide({ immediate = false, preserveTrail = false, reason = null } = {}) {
    const __ghostCtx = (usingBackBuffers ? ghostBackCtx : ghostFrontCtx) || ghostCtx;
    if (ghostGuideAnimFrame) {
      cancelAnimationFrame(ghostGuideAnimFrame);
      ghostGuideAnimFrame = null;
    }
    ghostGuideRunning = false;
    if (ghostFadeRAF) {
      cancelAnimationFrame(ghostFadeRAF);
      ghostFadeRAF = 0;
    }
    // Record explicit caller reason (best-effort) for debug.
    if (reason) {
      __dgGhostLastStopReason = String(reason);
    }
    try {
      if (typeof window !== 'undefined' && window.__DG_GHOST_TRACE) {
        const stack = __dgGhostMaybeStack('DG stopGhostGuide');
        dgGhostTrace('stop:enter', {
          id: panel?.id || null,
          immediate,
          preserveTrail,
          ghostGuideRunning,
          usingBackBuffers,
          ghostLayerEmpty: panel?.__dgGhostLayerEmpty ?? null,
          autoActive: ghostGuideAutoActive,
          loopId: !!ghostGuideLoopId,
          animFrame: !!ghostGuideAnimFrame,
          lastAutoReason: __dgGhostLastAutoReason,
          stopReason: reason || null,
          lastStopReason: __dgGhostLastStopReason,
          lastSweepReason: __dgGhostLastSweepReason,
          stack,
        });
      }
    } catch {}

    // If we're about to start a new sweep, we want to stop the animation without clearing
    // or fading the existing trail (otherwise the trail appears to "cut out" mid-path).
    if (preserveTrail) {
      return;
    }
    if (immediate) {
      const ghostSurface = getActiveGhostCanvas();
      R.resetCtx(__ghostCtx);
      R.resetCtx(__ghostCtx);
      const ghostDpr = __dgGetCanvasDprFromCss(__ghostCtx?.canvas, cssW, paintDpr);
      __dgWithLogicalSpaceDpr(R, __ghostCtx, ghostDpr, () => {
        const scale = (Number.isFinite(paintDpr) && paintDpr > 0) ? paintDpr : 1;
        const { x, y, w, h } = R.getOverlayClearRect({
          canvas: ghostSurface,
          pad: R.getOverlayClearPad() * 1.2,
          gridArea,
        });
        try {
          if (typeof window !== 'undefined' && window.__DG_GHOST_TRACE) {
            dgGhostTrace('stop:immediate-clear', {
              id: panel?.id || null,
              usingBackBuffers,
              ghostSurface: __dgElSummary(ghostSurface),
              ghostCtxCanvas: __ghostCtx?.canvas ? __dgElSummary(__ghostCtx.canvas) : null,
              clearRect: { x, y, w, h },
              cssW,
              cssH,
              paintDpr,
              ghostAutoActive: ghostGuideAutoActive,
              ghostRunning: ghostGuideRunning,
              sweepSeq: __dgGhostSweepSeq,
            });
          }
        } catch {}
        __ghostCtx.clearRect(x, y, w, h);
      });
      markGhostLayerCleared();
    }
  }

  // NOTE: We intentionally do not fade/clear the ghost trail over time.
  // The guide line should remain continuous and never "cut out" mid-path.
  // It will be cleared explicitly via stopGhostGuide({ immediate: true }) when needed.
  function fadeOutGhostTrail(step = 0) {
    const __ghostCtx = (usingBackBuffers ? ghostBackCtx : ghostFrontCtx) || ghostCtx;
    const ghostSurface = getActiveGhostCanvas();
    try {
      if (typeof window !== 'undefined' && window.__DG_GHOST_TRACE) {
        dgGhostTrace('fade:enter', {
          id: panel?.id || null,
          step,
          usingBackBuffers,
          ghostGuideRunning,
          ghostAutoActive: ghostGuideAutoActive,
          stack: __dgGhostMaybeStack('DG fadeOutGhostTrail'),
        });
      }
    } catch {}
    if (!ghostSurface) {
      ghostFadeRAF = 0;
      return;
    }
    R.resetCtx(__ghostCtx);
    R.resetCtx(__ghostCtx);
    const ghostDpr = __dgGetCanvasDprFromCss(__ghostCtx?.canvas, cssW, paintDpr);
    __dgWithLogicalSpaceDpr(R, __ghostCtx, ghostDpr, () => {
      const { x, y, w, h } = R.getOverlayClearRect({
        canvas: ghostSurface,
        pad: R.getOverlayClearPad(),
        gridArea,
      });
      __ghostCtx.globalCompositeOperation = 'destination-out';
      __ghostCtx.globalAlpha = 0.18;
      __ghostCtx.fillRect(x, y, w, h);
    });
    __ghostCtx.globalCompositeOperation = 'source-over';
    __ghostCtx.globalAlpha = 1.0;
    markGhostLayerActive();
    if (DG_GHOST_DEBUG && typeof startY === 'number' && typeof endY === 'number') {
      try {
        const from = { x: gridArea.x - 24, y: startY };
        const to = { x: gridArea.x + gridArea.w + 24, y: endY };
        const labelBand = __dgGetDrawLabelYRange?.();
        if (labelBand) R.drawGhostDebugBand(__ghostCtx, labelBand);
        R.drawGhostDebugPath(__ghostCtx, { from, to, crossY });
      } catch {}
      if (__dgOverlayStart) {
        const __dgOverlayDt = performance.now() - __dgOverlayStart;
        try { window.__PerfFrameProf?.mark?.('drawgrid.overlay', __dgOverlayDt); } catch {}
      }
    }
    if (step < 5) {
      ghostFadeRAF = requestAnimationFrame(() => fadeOutGhostTrail(step + 1));
    } else {
      ghostFadeRAF = 0;
    }
  }

function startGhostGuide({
  startX, endX,
  startY, endY,
  crossY = null,
  duration = 2000,
  wiggle = true,
  trail = true,
  trailEveryMs = 50,
  trailCount = 3,
  trailSpeed = 1.2,
} = {}) {
    try {
      if (typeof window !== 'undefined' && window.__DG_GHOST_TRACE) {
        const stack = __dgGhostMaybeStack('DG startGhostGuide');
        dgGhostTrace('start:enter', {
          id: panel?.id || null,
          usingBackBuffers,
          params: {
            startX, endX, startY, endY, crossY,
            duration, wiggle, trail, trailEveryMs, trailCount, trailSpeed,
          },
          ghostLayerEmpty: panel?.__dgGhostLayerEmpty ?? null,
          ghostGuideRunning,
          stack,
        });
      }
    } catch {}
  // IMPORTANT: when starting a new sweep, do NOT hard-clear the ghost surface.
  // We want the trail to remain continuous across layout/viewport churn.
  stopGhostGuide({ immediate: false, preserveTrail: true, reason: 'start:new-sweep' });
  if (ghostFadeRAF) {
    cancelAnimationFrame(ghostFadeRAF);
    ghostFadeRAF = 0;
  }
  const { w, h } = getLayoutSize();
  if (!w || !h) {
    layout(true);
  }
  const ghostDpr = __dgGetCanvasDprFromCss(ghostCtx?.canvas, cssW, paintDpr);

  dgGhostTrace('start', {
    startX, startY, endX, endY, crossY,
    duration,
    layout: { w: (getLayoutSize()?.w || w || 0), h: (getLayoutSize()?.h || h || 0) },
    cssW,
    cssH,
    elPanel: __dgElSummary(panel),
    elBody: __dgElSummary(body),
    elLayers: __dgElSummary(layersRoot),
    elPaint: __dgElSummary(frontCanvas),

    paintDpr,
    ghostDpr,
    ghostCanvas: ghostCtx?.canvas ? { w: ghostCtx.canvas.width, h: ghostCtx.canvas.height, cssW: ghostCtx.canvas.style?.width || null, cssH: ghostCtx.canvas.style?.height || null } : null,
  });

    const gx = gridArea.x, gy = gridArea.y, gw = gridArea.w, gh = gridArea.h;

    if (typeof startX !== 'number' || Number.isNaN(startX)) {
      startX = gx;
    }
    if (typeof endX !== 'number' || Number.isNaN(endX)) {
      endX = gx + gw;
    }
    if (startX > endX) [startX, endX] = [endX, startX];

    if (typeof startY !== 'number' || Number.isNaN(startY)) {
      startY = gy;
    }
    if (typeof endY !== 'number' || Number.isNaN(endY)) {
      endY = gy + gh;
    }

  const __gpathStatic = {
    from: { x: startX, y: startY },
    to: { x: endX, y: endY },
    crossY,
  };

  if (typeof window !== 'undefined' && window.DG_ZOOM_AUDIT && !window.__DG_FIRST_GPATH__) {
    window.__DG_FIRST_GPATH__ = true;
    const camSnapshot = getOverlayZoomSnapshot();
    console.log('[DG][GHOST][PATH]', {
      zoomScale: camSnapshot?.scale || 1,
      from: { x: startX, y: startY },
      to: { x: endX, y: endY },
      crossY,
      gridArea: gridArea && { ...gridArea },
      gridAreaLogical: { ...gridAreaLogical },
    });
  }

  const startTime = performance.now();
  let last = null;
  let lastTrail = 0;
  let lastGhostAudit = 0;
  // Cull can flicker briefly during first pan / viewport settle.
  // If we hard-stop immediately, the ghost sweep "restarts" and the trail looks like it cuts out.
  // Debounce cull before stopping the sweep.
  let culledSince = 0;
  const noiseSeed = Math.random() * 100;
  ghostGuideRunning = true;

  function frame(now) {
    if (!panel.isConnected) return;
    if (!ghostGuideRunning) return;
    if (isPanelCulled()) {
      if (!culledSince) culledSince = now;
      // Only stop if we're culled continuously for a while.
      if ((now - culledSince) > 800) {
        ghostGuideRunning = false;
        ghostGuideAnimFrame = null;
        return;
      }
    } else {
      culledSince = 0;
    }
    const ghostSurface = getActiveGhostCanvas();
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);

    if (!cw || !ch) {
      layout(true);
    }

    const gx = gridArea.x, gy = gridArea.y, gw = gridArea.w, gh = gridArea.h;
    const wiggleAmp = gh * 0.25;
    const x = startX + (endX - startX) * t;
    // Quadratic curve that bends toward the DRAW label mid-path.
    const q = (v0, v1, v2, tt) => {
      const u = 1 - tt;
      return u * u * v0 + 2 * u * tt * v1 + tt * tt * v2;
    };
    const t1 = Math.min(1, Math.max(0, t));
    const targetCrossY = (typeof crossY === 'number') ? crossY : (startY + endY) * 0.5;
    const tCurve = Math.max(0, Math.min(1, (t1 < 0.5) ? (t1 * 0.9) : (0.1 + t1 * 0.9)));
    let y = q(startY, targetCrossY, endY, tCurve);
    if (wiggle) {
      const wiggleFactor = Math.sin(t * Math.PI * 3) * Math.sin(t * Math.PI * 0.5 + noiseSeed);
      y += wiggleAmp * wiggleFactor;
    }

    const topBound = gy, bottomBound = gy + gh;
    if (y > bottomBound) y = bottomBound - (y - bottomBound);
    else if (y < topBound) y = topBound + (topBound - y);

    const __ghostDpr = __dgGetCanvasDprFromCss(ghostCtx?.canvas, cssW, paintDpr);
    try {
      const wr = wrap?.getBoundingClientRect?.();
      dgRenderScaleTrace('ghost:auto:sweep', {
        panelId: panel?.id || null,
        cssW,
        cssH,
        paintDpr,
        ghostDpr: __ghostDpr,
        gridArea: gridArea ? { x: gridArea.x, y: gridArea.y, w: gridArea.w, h: gridArea.h } : null,
        gridAreaLogical: gridAreaLogical ? { w: gridAreaLogical.w, h: gridAreaLogical.h } : null,
        wrap: wr ? { w: Math.round(wr.width), h: Math.round(wr.height) } : null,
        ghost: __dgDescribeCanvasScale(ghostCtx?.canvas, wr),
      });
    } catch {}
    R.resetCtx(ghostCtx);
    __dgWithLogicalSpaceDpr(R, ghostCtx, __ghostDpr, () => {
      const scale = (Number.isFinite(__ghostDpr) && __ghostDpr > 0) ? __ghostDpr : 1;
      const width = cssW || (ghostSurface?.width ?? 0) / scale;
      const height = cssH || (ghostSurface?.height ?? 0) / scale;
      ghostCtx.globalCompositeOperation = 'destination-out';
      ghostCtx.globalAlpha = 0.1;
      ghostCtx.fillRect(0, 0, width, height);
    });
    ghostCtx.globalCompositeOperation = 'source-over';
    ghostCtx.globalAlpha = 1.0;
    if (DG_GHOST_DEBUG) {
      try {
        const band = __dgGetDrawLabelYRange?.();
        if (band) R.drawGhostDebugBand(ghostCtx, band);
        R.drawGhostDebugPath(ghostCtx, __gpathStatic);
      } catch {}
    } else if (typeof window !== 'undefined' && window.__PERF_DG_OVERLAY_CORE_OFF) {
      try {
        const info = getLoopInfo();
        const currentPhase = Number.isFinite(info?.phase01) ? info.phase01 : null;
        if (currentPhase != null) localLastPhase = currentPhase;
      } catch {}
    }
    const camSnapshot = getOverlayZoomSnapshot();
    const z = camSnapshot.scale;

    // Disturbance radius in toy space (unchanged: big, soft "snowplow" feel).
    const baseR = DG_KNOCK.ghostTrail.radiusToy(gridArea);
    const pointerR = baseR * 1.5;
    const capR = Math.max(8, Math.min(gridAreaLogical.w, gridAreaLogical.h) * 0.25);
    const disturbanceRadius = Math.min(pointerR, capR);

    // Visual radius: match the user's drawn line thickness (thickness ≈ lineWidth).
    let visualRadius = disturbanceRadius;
    try {
      const lw = (typeof R.getLineWidth === 'function') ? R.getLineWidth() : null;
      if (Number.isFinite(lw) && lw > 0) {
        // Treat the line width as our visual thickness baseline.
        visualRadius = Math.max(2, lw);
      }
    } catch {}

    if (last) {
      R.resetCtx(ghostCtx);
      __dgWithLogicalSpaceDpr(R, ghostCtx, __ghostDpr, () => {
        ghostCtx.globalCompositeOperation = 'source-over';
        ghostCtx.globalAlpha = 0.25;
        ghostCtx.lineCap = 'round';
        ghostCtx.lineJoin = 'round';

        // Make the ghost trail roughly the same thickness as the drawn line.
        let lw = (typeof R.getLineWidth === 'function') ? R.getLineWidth() : null;
        if (!Number.isFinite(lw) || lw <= 0) {
          lw = visualRadius;
        }

        const trailWidth = Math.max(2, lw);
        ghostCtx.lineWidth = trailWidth;
        ghostCtx.strokeStyle = 'rgba(68,112,255,0.7)';
        ghostCtx.beginPath();
        ghostCtx.moveTo(last.x, last.y);
        ghostCtx.lineTo(x, y);
        ghostCtx.stroke();

        // Core dot width ≈ line thickness
        const dotR = Math.max(2, lw * 0.5);
        ghostCtx.beginPath();
        ghostCtx.arc(x, y, dotR, 0, Math.PI * 2);
        ghostCtx.fillStyle = 'rgba(68,112,255,0.85)';
        ghostCtx.fill();
      });
      markGhostLayerActive();
    }
    last = { x, y };

    // Physics still uses the larger radius so particles "feel" a fat snowplow.
    FF.pokeFieldToy('ghostTrail', x, y, disturbanceRadius, DG_KNOCK.ghostTrail.strength, {
      mode: 'plow',
      highlightMs: 900,
    });
    if (!window.__DG_FIRST_GHOST_LOGGED__) {
      window.__DG_FIRST_GHOST_LOGGED__ = true;
      drawgridLog('[DG][ghostTrail] poke', { x, y, radius: disturbanceRadius, strength: DG_KNOCK.ghostTrail.strength });
    }
    __dgLogFirstPoke(drawgridLog, 'ghostTrail', disturbanceRadius, DG_KNOCK.ghostTrail.strength);

    const logicalMin = Math.min(
      (gridAreaLogical?.w ?? 0),
      (gridAreaLogical?.h ?? 0)
    );
    const lettersRadius = Math.max(
      disturbanceRadius * 2.25,
      logicalMin * 0.2
    );
    knockLettersAt(
      x - (gridArea?.x || 0),
      y - (gridArea?.y || 0),
      { radius: lettersRadius, strength: DG_KNOCK.lettersMove.strength, source: 'ghost' }
    );
    if (DG_GHOST_DEBUG) {
      try {
        __dgWithLogicalSpaceDpr(R, ghostCtx, __ghostDpr, () => {
          ghostCtx.save();
          const pad = Math.max(20, disturbanceRadius * 3);
          ghostCtx.clearRect(x - pad, y - pad, pad * 2, pad * 2);
          ghostCtx.restore();
        });
        R.drawGhostDebugFrame(ghostCtx, {
          x,
          y,
          radius: disturbanceRadius,
          lettersRadius,
        });
        markGhostLayerActive();
      } catch {}
    }
    if (window.DG_ZOOM_AUDIT && (now - lastGhostAudit) >= 500) {
      __auditZoomSizes('ghostTrail');
      lastGhostAudit = now;
    }
    if (trail && now - lastTrail >= trailEveryMs) {
      dgField?.pulse?.(0.4 + Math.min(0.2, trailCount * 0.05));
      lastTrail = now;
    }

    if (ghostGuideRunning && t < 1) {
      ghostGuideAnimFrame = requestAnimationFrame(frame);
    } else {
      ghostGuideRunning = false;
      if (ghostFadeRAF) {
        cancelAnimationFrame(ghostFadeRAF);
      }
      ghostGuideAnimFrame = null;
    }
  }

  ghostGuideAnimFrame = requestAnimationFrame(frame);
}

function scheduleGhostIfEmpty({ initialDelay = 150 } = {}) {
  const check = () => {
    if (!panel.isConnected) return;
    if (isPanelCulled()) {
      stopAutoGhostGuide({ immediate: true, reason: 'schedule-empty:culled' });
      return;
    }
    if (isRestoring) {                 // Wait until setState() finishes
      setTimeout(check, 100);
      return;
    }
    const hasStrokes = Array.isArray(strokes) && strokes.length > 0;
    const hasNodes = Array.isArray(currentMap?.nodes)
      ? currentMap.nodes.some(set => set && set.size > 0)
      : false;

    dgGhostTrace('auto:empty-check', {
      id: panel?.id || null,
      hasStrokes,
      hasNodes,
      autoActive: ghostGuideAutoActive,
      running: ghostGuideRunning,
      animFrame: !!ghostGuideAnimFrame,
      sweepSeq: __dgGhostSweepSeq,
    });
    if (!hasStrokes && !hasNodes) {
      // IMPORTANT: do not restart while already active; restarting hard-clears the trail
      // and causes the ghost sweep to "jump back" mid-path.
      if (!ghostGuideAutoActive) {
        startAutoGhostGuide({ immediate: true, reason: 'schedule-empty:empty' });
      }
      updateDrawLabel(true);
    } else {
      // If content exists, ensure the ghost is fully stopped/cleared.
      stopAutoGhostGuide({ immediate: true, reason: 'schedule-empty:has-content' });
      updateDrawLabel(false);
    }
  };
  setTimeout(check, initialDelay);
}

function runAutoGhostGuideSweep() {
  if (!ghostGuideAutoActive) return;
  // IMPORTANT: never start a new sweep while one is already running.
  // Starting a new sweep calls startGhostGuide(), which stops the current one with
  // immediate:true (hard clear) and cuts the trail mid-path.
  if (ghostGuideAnimFrame || ghostGuideRunning) {
    dgGhostTrace('auto:sweep:skip-active', {
      ghostGuideAutoActive,
      ghostGuideRunning,
      ghostGuideAnimFrame: !!ghostGuideAnimFrame,
      sweepSeq: __dgGhostSweepSeq,
      lastSweepReason: __dgGhostLastSweepReason,
    });
    return;
  }
  const ghostDpr = __dgGetCanvasDprFromCss(ghostCtx?.canvas, cssW, paintDpr);

  const w = gridArea?.w ?? 0;
  const h = gridArea?.h ?? 0;
  // Guard against tiny layouts
  if (!w || !h || w <= 48 || h <= 48) {
    dgGhostTrace('auto:sweep:skip-tiny', {
      id: panel?.id || null,
      w,
      h,
      cssW,
      cssH,
      paintDpr,
      ghostDpr,
      sweepSeq: __dgGhostSweepSeq,
    });
    return;
  }

  // Use left->right off-screen randomized Y path
  const gpath = __dgComputeGhostSweepLR();
  const { safeMinY = gridArea?.y ?? 0, safeMaxY = (gridArea?.y ?? 0) + (gridArea?.h ?? 0) } = gpath;
  const clampY = (v) => {
    if (!Number.isFinite(v)) return safeMinY;
    return Math.max(safeMinY, Math.min(safeMaxY, v));
  };
  const startX = gpath.from.x;
  const startY = clampY(gpath.from.y);
  const endX = gpath.to.x;
  const endY = clampY(gpath.to.y);

  __dgGhostSweepSeq++;
  __dgGhostLastSweepReason = __dgGhostLastAutoReason || __dgGhostLastSweepReason;
  if (DG_GHOST_DEBUG) {
    try {
      const labelBand = __dgGetDrawLabelYRange?.();
      if (labelBand) R.drawGhostDebugBand(ghostCtx, labelBand);
      R.drawGhostDebugPath(ghostCtx, { from: gpath.from, to: gpath.to, crossY: gpath.crossY });
    } catch {}
  }

  dgGhostTrace('auto:sweep', {
    sweepSeq: __dgGhostSweepSeq,
    startX, startY, endX, endY, crossY: gpath.crossY,
    cssW,
    cssH,
    elPanel: __dgElSummary(panel),
    elBody: __dgElSummary(body),
    elLayers: __dgElSummary(layersRoot),
    elPaint: __dgElSummary(frontCanvas),

    paintDpr,
    ghostDpr,
    gridArea: gridArea ? { x: gridArea.x, y: gridArea.y, w: gridArea.w, h: gridArea.h } : null,
    ghostCanvas: ghostCtx?.canvas ? { w: ghostCtx.canvas.width, h: ghostCtx.canvas.height, cssW: ghostCtx.canvas.style?.width || null, cssH: ghostCtx.canvas.style?.height || null } : null,
    autoActive: ghostGuideAutoActive,
    running: ghostGuideRunning,
    stack: __dgGhostMaybeStack('DG runAutoGhostGuideSweep'),
  });

  startGhostGuide({
    startX, endX, startY, endY, crossY: gpath.crossY,
    duration: GHOST_SWEEP_DURATION,
    wiggle: true,
    trail: true,
    trailEveryMs: 50,
    trailCount: 3,
    trailSpeed: 1.2,
  });
}

  function startAutoGhostGuide({ immediate = false, reason = 'unknown' } = {}) {
    if (ghostGuideAutoActive) return;
    __dgGhostAutoSeq++;
    __dgGhostLastAutoReason = reason;
    dgGhostTrace('auto:start', {
      id: panel?.id || null,
      seq: __dgGhostAutoSeq,
      immediate,
      reason,
      hasStrokes: Array.isArray(strokes) ? strokes.length : null,
      hasNodes: Array.isArray(currentMap?.nodes) ? currentMap.nodes.some(set => set && set.size > 0) : null,
      stack: __dgGhostMaybeStack('DG startAutoGhostGuide'),
    });
    ghostGuideAutoActive = true;
    syncLetterFade({ immediate });
    runAutoGhostGuideSweep();
    const interval = GHOST_SWEEP_DURATION + GHOST_SWEEP_PAUSE;
    ghostGuideLoopId = setInterval(() => {
      if (!ghostGuideAutoActive) return;
      runAutoGhostGuideSweep();
    }, interval);
  }

  function stopAutoGhostGuide({ immediate = false, preserveTrail = false, reason = 'unknown' } = {}) {
    const wasActive = ghostGuideAutoActive || ghostGuideLoopId !== null || !!ghostGuideAnimFrame;
    __dgGhostLastStopReason = reason;
    dgGhostTrace('auto:stop', {
      id: panel?.id || null,
      immediate,
      preserveTrail,
      reason,
      wasActive,
      autoActive: ghostGuideAutoActive,
      loopId: !!ghostGuideLoopId,
      animFrame: !!ghostGuideAnimFrame,
      running: ghostGuideRunning,
      sweepSeq: __dgGhostSweepSeq,
      stack: __dgGhostMaybeStack('DG stopAutoGhostGuide'),
    });
    ghostGuideAutoActive = false;
    if (ghostGuideLoopId) {
      clearInterval(ghostGuideLoopId);
      ghostGuideLoopId = null;
    }
    stopGhostGuide({ immediate, preserveTrail, reason: 'api.stopGhostGuide' });
    if (wasActive) {
      syncLetterFade({ immediate });
    }
  }

  panel.startGhostGuide = startGhostGuide;
  panel.stopGhostGuide = stopGhostGuide;

  panel.addEventListener('toy-remove', () => {
    destroyDrawLabelOverlay(drawLabelState);
    tutorialHighlightMode = 'none';
    stopTutorialHighlightLoop();
    noteToggleEffects = [];
    nextDrawTarget = null;
    previewGid = null;
    stopAutoGhostGuide({ immediate: true, reason: 'toy-remove' });
    try { dgField?.destroy?.(); } catch {}
    panel.__drawParticles = null;
    try { panel.removeEventListener('toy-instrument', handleInstrumentPersist); } catch {}
    if (typeof unsubscribeZoom === 'function') {
      try { unsubscribeZoom(); } catch {}
    }
    if (typeof unsubscribeFrameStart === 'function') {
      try { unsubscribeFrameStart(); } catch {}
      unsubscribeFrameStart = null;
    }
    if (storageKey && typeof window !== 'undefined') {
      try { window.removeEventListener('beforeunload', persistBeforeUnload); } catch {}
    }
    persistStateNow({ source: 'toy-remove' });
    try { delete panel.__getDrawgridPersistedState; } catch {}
    if (panel.__dgVisibilityObserver) {
      try { panel.__dgVisibilityObserver.disconnect(); } catch {}
      try { delete panel.__dgVisibilityObserver; } catch {}
    }
  }, { once: true });

  panel.addEventListener('tutorial:highlight-notes', (event) => {
    const allowGuide = !!event?.detail?.allowGuide;
    if (event?.detail?.active && (isTutorialActive() || allowGuide)) {
      tutorialHighlightOverride = allowGuide && !isTutorialActive();
      tutorialHighlightMode = 'notes';
      startTutorialHighlightLoop();
    } else if (tutorialHighlightMode === 'notes') {
      tutorialHighlightMode = 'none';
      tutorialHighlightOverride = false;
      stopTutorialHighlightLoop();
    }
  });

  panel.addEventListener('tutorial:highlight-drag', (event) => {
    const allowGuide = !!event?.detail?.allowGuide;
    if (event?.detail?.active && (isTutorialActive() || allowGuide)) {
      tutorialHighlightOverride = allowGuide && !isTutorialActive();
      tutorialHighlightMode = 'drag';
      startTutorialHighlightLoop();
    } else if (tutorialHighlightMode === 'drag') {
      tutorialHighlightMode = 'none';
      tutorialHighlightOverride = false;
      stopTutorialHighlightLoop();
    }
  });

  panel.addEventListener('drawgrid:update', (e) => {
    const nodes = e?.detail?.map?.nodes;
    const hasAny = Array.isArray(nodes) && nodes.some(set => set && set.size > 0);
    dgGhostTrace('update:event', {
      id: panel?.id || null,
      hasAny,
      autoActive: ghostGuideAutoActive,
      running: ghostGuideRunning,
      animFrame: !!ghostGuideAnimFrame,
      sweepSeq: __dgGhostSweepSeq,
    });
    // IMPORTANT:
    // drawgrid:update can fire very frequently (layout commits, viewport settles, etc).
    // We must NOT stop+clear the ghost layer every time we see an "empty" update, or the
    // ghost trail will look like it "cuts out" / restarts mid-sweep (especially during first pan).
    if (hasAny) {
      // Content exists -> ensure auto-ghost is stopped, but don't spam-stop on every update.
      if (ghostGuideAutoActive || ghostGuideRunning) {
        stopAutoGhostGuide({ immediate: false, reason: 'drawgrid:update:hasAny' });
      }
    } else {
      // IMPORTANT: do not thrash stop/start while empty; that restarts the sweep and hard-clears trails.
      if (!ghostGuideAutoActive) {
        startAutoGhostGuide({ immediate: true, reason: 'drawgrid:update:empty' });
      }
    }
  });

  // Boot must wait until we have a real, stable size.
  // If we attempt layout/draw while size is 0 (common on refresh), the grid can end up
  // permanently missing and the ghost guide will bake in the wrong scale.
  (function __dgBootDrawOnceWhenSized() {
    try { __dgEnsureLayerSizes('resnap'); } catch {}

    requestAnimationFrame(() => {
      try {
        if (!panel.isConnected) return;
        const sized = ensureSizeReady({ force: true });
        if (!sized) {
          __dgBootDrawOnceWhenSized();
          return;
        }

        layout(true);
        drawGrid();
        if (currentMap?.nodes) {
          drawNodes(currentMap.nodes);
        }

        // Start ghost guide only once we've drawn at the correct basis.
        // Don't hard-clear the trail here; boot/layout can call this after the guide has already started.
        if (!ghostGuideAutoActive) {
          startAutoGhostGuide({ immediate: true, reason: 'boot:sized' });
        }
        __dgNeedsUIRefresh = true;
        __dgStableFramesAfterCommit = 0;

        // IMPORTANT:
        // On refresh/boot, zoom/overview settling can briefly report a scaled DOM rect.
        // If we miss a guaranteed composite+swap after first layout, the user can see an
        // empty body (grid hidden) and/or strokes appear incorrectly scaled until interaction.
        // Force a deterministic full draw + composite + front swap once on boot.
        try { markStaticDirty('boot'); } catch {}
        try { panel.__dgSingleCompositeDirty = true; } catch {}
        __dgFrontSwapNextDraw = true;
        __dgForceFullDrawNext = true;
        __dgForceFullDrawFrames = Math.max(__dgForceFullDrawFrames || 0, 4);
        ensurePostCommitRedraw('boot');
        try {
          if (typeof requestFrontSwap === 'function') {
            requestFrontSwap(useFrontBuffers);
          }
        } catch {}
      } catch {}
    });
  })();

  scheduleGhostIfEmpty({ initialDelay: 150 });

  try {
    setTimeout(() => {
      try {
        window.Persistence?.markDirty?.();
        window.Persistence?.flushAutosaveNow?.();
      } catch {}
    }, 0);
  } catch {}

  try { panel.dispatchEvent(new CustomEvent('drawgrid:ready', { bubbles: true })); } catch {}
  return api;
}










