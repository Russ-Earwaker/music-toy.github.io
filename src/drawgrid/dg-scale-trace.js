// src/drawgrid/dg-scale-trace.js
// DrawGrid scale/trace helpers (debug-only, opt-in via console flags).
import { makeDebugLogger } from '../debug-flags.js';

const drawgridLog = makeDebugLogger('mt_debug_logs', 'log');

// --- Non-spammy canvas scale trace -------------------------------------------
let __dgScaleTraceArmed = false;
let __dgScaleTraceLastSig = '';
let __dgScaleTraceLastMismatchSig = '';
let __dgScaleSigMap = null;
let __dgNodeScaleSigLast = '';
let __dgRenderScaleSigLast = '';

export function dgScaleTrace(tag, data = null) {
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

export function __dgStableStringify(obj) {
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

export function __dgMaybeTraceStack(flagName, label) {
  try {
    if (typeof window === 'undefined' || !window[flagName]) return null;
    const e = new Error(label);
    return { stack: String(e.stack || '') };
  } catch {
    return null;
  }
}

export function dgNodeScaleTrace(tag, payload) {
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

export function dgRenderScaleTrace(tag, payload) {
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

export function __dgDescribeCanvasScale(el, wrapRect) {
  try {
    if (!el || !el.getBoundingClientRect) return null;
    const r = el.getBoundingClientRect();
    const ww = wrapRect?.width || 0;
    const wh = wrapRect?.height || 0;
    const rectW = r?.width || 0;
    const rectH = r?.height || 0;
    const ratioW = (ww > 0 && rectW > 0) ? rectW / ww : null;
    const ratioH = (wh > 0 && rectH > 0) ? rectH / wh : null;
    // "effective DPR" based on rect, not cssW (catches "rect drift" bugs).
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

export function __dgDescribeDomPath(el, stopEl, maxDepth = 8) {
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

export function __dgGetCanvasSizingSnapshot(canvas) {
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

    // If we cannot compute ratios, do not report mismatch.
    if (!Number.isFinite(pw) || !Number.isFinite(ph) || !Number.isFinite(nw) || !Number.isFinite(nh)) {
      return null;
    }

    // A "scaled smaller" bug should show up as nodes ratio < paint ratio (or generally ratios diverging).
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
      // Playhead is a frequent "got out of sync" canary; include if present.
      playhead: playhead ? { rectW: playhead?.rectW, rectH: playhead?.rectH, ratioW: playhead?.ratioW, ratioH: playhead?.ratioH } : null,
    };
  } catch {
    return null;
  }
}

export function __dgEmitScaleMismatchIfChanged(sigPayload) {
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

export function __dgGhostMaybeStack(label = 'DG ghost trace') {
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

export function dgCanvasScaleTrace(tag, data = null) {
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
export function __dgTraceCanvasScaleSnapshot(reason, panelId, roles) {
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
