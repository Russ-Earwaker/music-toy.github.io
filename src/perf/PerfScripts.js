// src/perf/PerfScripts.js
// Deterministic camera / overview scripts for repeatable perf tests.

import { getCommittedState, setGestureTransform, commitGesture } from '../zoom/ZoomCoordinator.js';
import { getViewportElement, getViewportTransform, screenToWorld } from '../board-viewport.js';
import { overviewMode } from '../overview-mode.js';

function lerp(a, b, t) { return a + (b - a) * t; }

export function makePanZoomScript({
  base = null,
  panPx = 2200,
  zoomMin = 0.45,
  zoomMax = 1.15,
  targetSelector = '.toy-panel',
  boundsPadding = 0.15,
  // phases in ms
  idleMs = 3000,
  panMs = 9000,
  zoomMs = 9000,
  overviewToggles = 6,
  overviewSpanMs = 9000,
}) {
  const s0 = base || getCommittedState();
  let start = { x: s0.x, y: s0.y, scale: s0.scale };
  let panRadius = panPx;
  let boundsResolved = false;
  let boundsFound = false;
  let centerWorld = null;
  let panRadiusWorld = panPx;
  let layoutCache = null;
  let layoutCacheValid = false;

  // precompute overview toggle times (deterministic)
  const panDur = Math.max(0, Number(panMs) || 0);
  const zoomDur = Math.max(0, Number(zoomMs) || 0);
  const idleDur = Math.max(0, Number(idleMs) || 0);
  const overviewDur = Math.max(0, Number(overviewSpanMs) || 0);

  const overviewStart = idleDur + panDur + zoomDur;
  const toggleEvery = (overviewToggles > 0 && overviewDur > 0) ? (overviewDur / overviewToggles) : 0;

  const invalidateLayoutCache = () => { layoutCacheValid = false; };
  try {
    window.addEventListener('resize', invalidateLayoutCache, { passive: true });
    window.addEventListener('overview:transition', invalidateLayoutCache, { passive: true });
  } catch {}

  function getLayoutCache() {
    if (layoutCacheValid && layoutCache) return layoutCache;
    const stage = document.querySelector('main#board, #board, #world, .world, .canvas-world');
    const stageRect = stage?.getBoundingClientRect?.();
    const viewEl = getViewportElement?.() || document.documentElement;
    const viewRect = viewEl?.getBoundingClientRect?.();
    if (!stageRect || !viewRect) return null;
    const live = getViewportTransform?.() || {};
    const committed = getCommittedState?.() || {};
    const tx = Number.isFinite(live.tx) ? live.tx : (Number.isFinite(committed.x) ? committed.x : 0);
    const ty = Number.isFinite(live.ty) ? live.ty : (Number.isFinite(committed.y) ? committed.y : 0);
    const viewCx = (viewRect.left ?? 0) + (viewRect.width ?? window.innerWidth) * 0.5;
    const viewCy = (viewRect.top ?? 0) + (viewRect.height ?? window.innerHeight) * 0.5;
    layoutCache = {
      viewCx,
      viewCy,
      layoutLeftBase: stageRect.left - tx,
      layoutTopBase: stageRect.top - ty,
    };
    layoutCacheValid = true;
    return layoutCache;
  }

  function setGesturing(on) {
    try { document.body.classList.toggle('is-gesturing', !!on); } catch {}
    try { window.__GESTURE_ACTIVE = !!on; } catch {}
  }

  function resolveTargetBounds() {
    if (!targetSelector) return null;
    const __perfOn = !!(window.__PerfFrameProf && typeof performance !== 'undefined' && performance.now);
    const t0 = __perfOn ? performance.now() : 0;
    const panels = document.querySelectorAll(targetSelector);
    if (__perfOn) {
      window.__PerfFrameProf.mark('perf.bounds.query', performance.now() - t0);
    }
    if (!panels || panels.length === 0) return null;
    const t1 = __perfOn ? performance.now() : 0;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    panels.forEach((panel) => {
      try {
        const left = parseFloat(panel?.style?.left || '');
        const top = parseFloat(panel?.style?.top || '');
        const width = Number.isFinite(panel?.offsetWidth) ? panel.offsetWidth : NaN;
        const height = Number.isFinite(panel?.offsetHeight) ? panel.offsetHeight : NaN;
        if (Number.isFinite(left) && Number.isFinite(top) && Number.isFinite(width) && Number.isFinite(height)) {
          minX = Math.min(minX, left);
          minY = Math.min(minY, top);
          maxX = Math.max(maxX, left + width);
          maxY = Math.max(maxY, top + height);
          return;
        }
        const rect = panel.getBoundingClientRect?.();
        if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.top)) return;
        const tl = screenToWorld({ x: rect.left, y: rect.top });
        const br = screenToWorld({ x: rect.right, y: rect.bottom });
        if (!Number.isFinite(tl.x) || !Number.isFinite(tl.y) || !Number.isFinite(br.x) || !Number.isFinite(br.y)) return;
        minX = Math.min(minX, tl.x, br.x);
        minY = Math.min(minY, tl.y, br.y);
        maxX = Math.max(maxX, tl.x, br.x);
        maxY = Math.max(maxY, tl.y, br.y);
      } catch {}
    });
    if (__perfOn) {
      window.__PerfFrameProf.mark('perf.bounds.compute', performance.now() - t1);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null;
    const centerX = (minX + maxX) * 0.5;
    const centerY = (minY + maxY) * 0.5;
    const halfW = Math.max(1, (maxX - minX) * 0.5);
    const halfH = Math.max(1, (maxY - minY) * 0.5);
    return { centerX, centerY, halfW, halfH, minX, minY, maxX, maxY };
  }

  function worldToTranslate(worldX, worldY, scale) {
    const __perfOn = !!(window.__PerfFrameProf && typeof performance !== 'undefined' && performance.now);
    const t0 = __perfOn ? performance.now() : 0;
    const cached = getLayoutCache();
    const live = getViewportTransform?.() || {};
    const committed = getCommittedState?.() || {};
    const tx = Number.isFinite(live.tx) ? live.tx : (Number.isFinite(committed.x) ? committed.x : 0);
    const ty = Number.isFinite(live.ty) ? live.ty : (Number.isFinite(committed.y) ? committed.y : 0);
    const viewCx = cached?.viewCx ?? ((window.innerWidth || 0) * 0.5);
    const viewCy = cached?.viewCy ?? ((window.innerHeight || 0) * 0.5);
    const safeScale = Number.isFinite(scale) && Math.abs(scale) > 1e-6 ? scale : 1;
    const layoutLeft = cached ? cached.layoutLeftBase : 0;
    const layoutTop = cached ? cached.layoutTopBase : 0;
    if (__perfOn) {
      window.__PerfFrameProf.mark('perf.worldToTranslate', performance.now() - t0);
    }
    return {
      x: viewCx - layoutLeft - worldX * safeScale,
      y: viewCy - layoutTop - worldY * safeScale,
    };
  }

  return function step(tMs /*, dtMs, progress */) {
    if (!boundsResolved) {
      const __perfOn = !!(window.__PerfFrameProf && typeof performance !== 'undefined' && performance.now);
      const t0 = __perfOn ? performance.now() : 0;
      const bounds = resolveTargetBounds();
      if (__perfOn) {
        window.__PerfFrameProf.mark('perf.bounds.total', performance.now() - t0);
      }
      if (bounds) {
        boundsResolved = true;
        boundsFound = true;
        const pad = Math.max(0, Number(boundsPadding) || 0);
        const maxHalf = Math.max(bounds.halfW, bounds.halfH);
        const padded = Math.max(200, maxHalf * (1 + pad));
        panRadiusWorld = Math.max(120, Math.min(panRadiusWorld || padded, Math.min(bounds.halfW, bounds.halfH) * (1 - pad)));
        centerWorld = { x: bounds.centerX, y: bounds.centerY };
        const initial = worldToTranslate(centerWorld.x, centerWorld.y, start.scale);
        start = { x: initial.x, y: initial.y, scale: start.scale };
        try {
          window.__PERF_CAM_BOUNDS = {
            selector: targetSelector || null,
            minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY,
            centerX: bounds.centerX, centerY: bounds.centerY,
            startX: start.x, startY: start.y,
            panRadius: panRadiusWorld,
          };
        } catch {}
      } else if (tMs >= (idleDur + panDur + zoomDur)) {
        boundsResolved = true;
      }
    }
    if (boundsFound && !step.__centered && tMs < idleDur) {
      step.__centered = true;
      const __perfOn = !!(window.__PerfFrameProf && typeof performance !== 'undefined' && performance.now);
      const t0 = __perfOn ? performance.now() : 0;
      try { setGestureTransform({ x: start.x, y: start.y, scale: start.scale }); } catch {}
      if (__perfOn) {
        window.__PerfFrameProf.mark('perf.gesture.set', performance.now() - t0);
      }
    }
    // Phase 1: idle (do nothing)
    if (tMs < idleDur) {
      setGesturing(false);
      return;
    }

    // Phase 2: pan (sinusoidal path)
    if (panDur > 0 && tMs < idleDur + panDur) {
      setGesturing(true);
      const u = (tMs - idleDur) / panDur; // 0..1
      const angle = u * Math.PI * 2;
      const center = centerWorld || { x: start.x, y: start.y };
      const wX = center.x + Math.cos(angle) * panRadiusWorld;
      const wY = center.y + Math.sin(angle * 0.9) * panRadiusWorld;
      const __perfOn = !!(window.__PerfFrameProf && typeof performance !== 'undefined' && performance.now);
      const t0 = __perfOn ? performance.now() : 0;
      const { x, y } = worldToTranslate(wX, wY, start.scale);
      setGestureTransform({ x, y, scale: start.scale });
      if (__perfOn) {
        window.__PerfFrameProf.mark('perf.gesture.pan', performance.now() - t0);
      }
      return;
    }

    // Phase 3: zoom in/out while gently panning
    if (zoomDur > 0 && tMs < idleDur + panDur + zoomDur) {
      setGesturing(true);
      const u = (tMs - (idleDur + panDur)) / zoomDur;
      const wobble = (Math.sin(u * Math.PI * 2) * 0.5 + 0.5); // 0..1
      const scale = lerp(zoomMin, zoomMax, wobble);
      const center = centerWorld || { x: start.x, y: start.y };
      const wX = center.x + Math.cos(u * Math.PI * 2) * (panRadiusWorld * 0.35);
      const wY = center.y + Math.sin(u * Math.PI * 2) * (panRadiusWorld * 0.25);
      const __perfOn = !!(window.__PerfFrameProf && typeof performance !== 'undefined' && performance.now);
      const t0 = __perfOn ? performance.now() : 0;
      const { x, y } = worldToTranslate(wX, wY, scale);
      setGestureTransform({ x, y, scale });
      if (__perfOn) {
        window.__PerfFrameProf.mark('perf.gesture.zoom', performance.now() - t0);
      }
      return;
    }

    // Phase 4: overview toggle spam
    if (overviewToggles > 0 && toggleEvery > 0 && tMs < overviewStart + overviewDur) {
      setGesturing(false);
      const k = Math.floor((tMs - overviewStart) / toggleEvery);
      // toggle on integer boundary using a stable latch on the function object
      if (step.__lastToggleK !== k) {
        step.__lastToggleK = k;
        try { overviewMode.toggle(); } catch {}
      }
      return;
    }

    // End: commit any gesture state once
    if (!step.__didCommit) {
      step.__didCommit = true;
      try { commitGesture(); } catch {}
    }
    setGesturing(false);
  };
}

// Pan/zoom with periodic commits during gesture (stress commit path).
export function makePanZoomCommitSpamScript({
  base = null,
  panPx = 2200,
  zoomMin = 0.45,
  zoomMax = 1.15,
  targetSelector = '.toy-panel',
  boundsPadding = 0.15,
  // phases in ms
  idleMs = 3000,
  panMs = 9000,
  zoomMs = 9000,
  overviewToggles = 6,
  overviewSpanMs = 9000,
  commitEveryMs = 250,
  commitDelayMs = 80,
  commitMinGapMs = 0,
} = {}) {
  const s0 = base || getCommittedState();
  let start = { x: s0.x, y: s0.y, scale: s0.scale };
  let panRadius = panPx;
  let boundsResolved = false;
  let boundsFound = false;
  let centerWorld = null;
  let panRadiusWorld = panPx;
  let layoutCache = null;
  let layoutCacheValid = false;

  const panDur = Math.max(0, Number(panMs) || 0);
  const zoomDur = Math.max(0, Number(zoomMs) || 0);
  const idleDur = Math.max(0, Number(idleMs) || 0);
  const overviewDur = Math.max(0, Number(overviewSpanMs) || 0);
  const commitEvery = Math.max(50, Number(commitEveryMs) || 250);
  const commitGap = Math.max(0, Number(commitMinGapMs) || 0);

  const overviewStart = idleDur + panDur + zoomDur;
  const toggleEvery = (overviewToggles > 0 && overviewDur > 0) ? (overviewDur / overviewToggles) : 0;

  function setGesturing(on) {
    try { document.body.classList.toggle('is-gesturing', !!on); } catch {}
    try { window.__GESTURE_ACTIVE = !!on; } catch {}
  }

  const invalidateLayoutCache = () => { layoutCacheValid = false; };
  try {
    window.addEventListener('resize', invalidateLayoutCache, { passive: true });
    window.addEventListener('overview:transition', invalidateLayoutCache, { passive: true });
  } catch {}

  function getLayoutCache() {
    if (layoutCacheValid && layoutCache) return layoutCache;
    const stage = document.querySelector('main#board, #board, #world, .world, .canvas-world');
    const stageRect = stage?.getBoundingClientRect?.();
    const viewEl = getViewportElement?.() || document.documentElement;
    const viewRect = viewEl?.getBoundingClientRect?.();
    if (!stageRect || !viewRect) return null;
    const live = getViewportTransform?.() || {};
    const committed = getCommittedState?.() || {};
    const tx = Number.isFinite(live.tx) ? live.tx : (Number.isFinite(committed.x) ? committed.x : 0);
    const ty = Number.isFinite(live.ty) ? live.ty : (Number.isFinite(committed.y) ? committed.y : 0);
    const viewCx = (viewRect.left ?? 0) + (viewRect.width ?? window.innerWidth) * 0.5;
    const viewCy = (viewRect.top ?? 0) + (viewRect.height ?? window.innerHeight) * 0.5;
    layoutCache = {
      viewCx,
      viewCy,
      layoutLeftBase: stageRect.left - tx,
      layoutTopBase: stageRect.top - ty,
    };
    layoutCacheValid = true;
    return layoutCache;
  }

  function resolveTargetBounds() {
    if (!targetSelector) return null;
    const panels = document.querySelectorAll(targetSelector);
    if (!panels || panels.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    panels.forEach((panel) => {
      try {
        const left = parseFloat(panel?.style?.left || '');
        const top = parseFloat(panel?.style?.top || '');
        const width = Number.isFinite(panel?.offsetWidth) ? panel.offsetWidth : NaN;
        const height = Number.isFinite(panel?.offsetHeight) ? panel.offsetHeight : NaN;
        if (Number.isFinite(left) && Number.isFinite(top) && Number.isFinite(width) && Number.isFinite(height)) {
          minX = Math.min(minX, left);
          minY = Math.min(minY, top);
          maxX = Math.max(maxX, left + width);
          maxY = Math.max(maxY, top + height);
          return;
        }
        const rect = panel.getBoundingClientRect?.();
        if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.top)) return;
        const tl = screenToWorld({ x: rect.left, y: rect.top });
        const br = screenToWorld({ x: rect.right, y: rect.bottom });
        if (!Number.isFinite(tl.x) || !Number.isFinite(tl.y) || !Number.isFinite(br.x) || !Number.isFinite(br.y)) return;
        minX = Math.min(minX, tl.x, br.x);
        minY = Math.min(minY, tl.y, br.y);
        maxX = Math.max(maxX, tl.x, br.x);
        maxY = Math.max(maxY, tl.y, br.y);
      } catch {}
    });
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null;
    const centerX = (minX + maxX) * 0.5;
    const centerY = (minY + maxY) * 0.5;
    const halfW = Math.max(1, (maxX - minX) * 0.5);
    const halfH = Math.max(1, (maxY - minY) * 0.5);
    return { centerX, centerY, halfW, halfH, minX, minY, maxX, maxY };
  }

  function worldToTranslate(worldX, worldY, scale) {
    const cached = getLayoutCache();
    const live = getViewportTransform?.() || {};
    const committed = getCommittedState?.() || {};
    const tx = Number.isFinite(live.tx) ? live.tx : (Number.isFinite(committed.x) ? committed.x : 0);
    const ty = Number.isFinite(live.ty) ? live.ty : (Number.isFinite(committed.y) ? committed.y : 0);
    const viewCx = cached?.viewCx ?? ((window.innerWidth || 0) * 0.5);
    const viewCy = cached?.viewCy ?? ((window.innerHeight || 0) * 0.5);
    const safeScale = Number.isFinite(scale) && Math.abs(scale) > 1e-6 ? scale : 1;
    const layoutLeft = cached ? cached.layoutLeftBase : 0;
    const layoutTop = cached ? cached.layoutTopBase : 0;
    return {
      x: viewCx - layoutLeft - worldX * safeScale,
      y: viewCy - layoutTop - worldY * safeScale,
    };
  }

  return function step(tMs /*, dtMs, progress */) {
    if (!boundsResolved) {
      const bounds = resolveTargetBounds();
      if (bounds) {
        boundsResolved = true;
        boundsFound = true;
        const pad = Math.max(0, Number(boundsPadding) || 0);
        const maxHalf = Math.max(bounds.halfW, bounds.halfH);
        const padded = Math.max(200, maxHalf * (1 + pad));
        panRadiusWorld = Math.max(120, Math.min(panRadiusWorld || padded, Math.min(bounds.halfW, bounds.halfH) * (1 - pad)));
        centerWorld = { x: bounds.centerX, y: bounds.centerY };
        const initial = worldToTranslate(centerWorld.x, centerWorld.y, start.scale);
        start = { x: initial.x, y: initial.y, scale: start.scale };
        try {
          window.__PERF_CAM_BOUNDS = {
            selector: targetSelector || null,
            minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY,
            centerX: bounds.centerX, centerY: bounds.centerY,
            startX: start.x, startY: start.y,
            panRadius: panRadiusWorld,
          };
        } catch {}
      } else if (tMs >= (idleDur + panDur + zoomDur)) {
        boundsResolved = true;
      }
    }
    if (boundsFound && !step.__centered && tMs < idleDur) {
      step.__centered = true;
      try { setGestureTransform({ x: start.x, y: start.y, scale: start.scale }); } catch {}
    }
    const commitK = Math.floor(tMs / commitEvery);
    const shouldCommitNow = () => {
      if (commitGap <= 0) return true;
      if (!step.__lastCommitAtMs && step.__lastCommitAtMs !== 0) {
        step.__lastCommitAtMs = tMs;
        return true;
      }
      if ((tMs - step.__lastCommitAtMs) >= commitGap) {
        step.__lastCommitAtMs = tMs;
        return true;
      }
      return false;
    };

    if (tMs < idleDur) {
      setGesturing(false);
      return;
    }

    if (panDur > 0 && tMs < idleDur + panDur) {
      setGesturing(true);
      const u = (tMs - idleDur) / panDur;
      const angle = u * Math.PI * 2;
      const center = centerWorld || { x: start.x, y: start.y };
      const wX = center.x + Math.cos(angle) * panRadiusWorld;
      const wY = center.y + Math.sin(angle * 0.9) * panRadiusWorld;
      const { x, y } = worldToTranslate(wX, wY, start.scale);
      setGestureTransform({ x, y, scale: start.scale });
      if (step.__lastCommitK !== commitK) {
        step.__lastCommitK = commitK;
        if (shouldCommitNow()) {
          try { commitGesture({ x, y, scale: start.scale }, { delayMs: commitDelayMs }); } catch {}
        }
      }
      return;
    }

    if (zoomDur > 0 && tMs < idleDur + panDur + zoomDur) {
      setGesturing(true);
      const u = (tMs - (idleDur + panDur)) / zoomDur;
      const wobble = (Math.sin(u * Math.PI * 2) * 0.5 + 0.5);
      const scale = lerp(zoomMin, zoomMax, wobble);
      const center = centerWorld || { x: start.x, y: start.y };
      const wX = center.x + Math.cos(u * Math.PI * 2) * (panRadiusWorld * 0.35);
      const wY = center.y + Math.sin(u * Math.PI * 2) * (panRadiusWorld * 0.25);
      const { x, y } = worldToTranslate(wX, wY, scale);
      setGestureTransform({ x, y, scale });
      if (step.__lastCommitK !== commitK) {
        step.__lastCommitK = commitK;
        if (shouldCommitNow()) {
          try { commitGesture({ x, y, scale }, { delayMs: commitDelayMs }); } catch {}
        }
      }
      return;
    }

    if (overviewToggles > 0 && toggleEvery > 0 && tMs < overviewStart + overviewDur) {
      setGesturing(false);
      const k = Math.floor((tMs - overviewStart) / toggleEvery);
      if (step.__lastToggleK !== k) {
        step.__lastToggleK = k;
        try { overviewMode.toggle(); } catch {}
      }
      return;
    }

    if (!step.__didCommit) {
      step.__didCommit = true;
      try { commitGesture(); } catch {}
    }
    setGesturing(false);
  };
}

// Overview-only script: no pan/zoom, just toggles at a fixed cadence.
export function makeOverviewSpamScript({
  idleMs = 2000,
  toggles = 10,
  spanMs = 12000,
} = {}) {
  const idleDur = Math.max(0, Number(idleMs) || 0);
  const n = Math.max(0, Number(toggles) || 0);
  const dur = Math.max(0, Number(spanMs) || 0);
  const every = (n > 0 && dur > 0) ? (dur / n) : 0;
  return function step(tMs) {
    if (tMs < idleDur) return;
    if (n <= 0 || every <= 0) return;
    const k = Math.floor((tMs - idleDur) / every);
    if (k < 0 || k > n) return;
    if (step.__lastK !== k) {
      step.__lastK = k;
      try { overviewMode.toggle(); } catch {}
    }
  };
}

// Single overview toggle: on once, then off once after a delay.
export function makeOverviewOnceScript({
  idleMs = 2000,
  onMs = 6000,
} = {}) {
  return function step(tMs) {
    if (tMs < idleMs) return;
    if (!step.__didOn) {
      step.__didOn = true;
      try { (overviewMode.enable?.() ?? overviewMode.toggle?.()); } catch {}
      return;
    }
    if (!step.__didOff && tMs > idleMs + onMs) {
      step.__didOff = true;
      try { (overviewMode.disable?.() ?? overviewMode.toggle?.()); } catch {}
    }
  };
}

// DrawGrid random-notes spam while playing.
// Dispatches `toy-random-notes` to all drawgrid panels at a fixed cadence.
// Optionally runs with a seeded Math.random to make the pattern repeatable.
export function makeDrawgridRandomNotesScript({
  everyMs = 900,
  seed = 1337,
  useSeededRandom = true,
} = {}) {
  const every = Math.max(50, Number(everyMs) || 900);
  let lastK = -1;

  return function step(tMs) {
    const k = Math.floor((tMs) / every);
    if (k === lastK) return;
    lastK = k;

    const panels = document.querySelectorAll('.toy-panel[data-toy="drawgrid"]');
    if (!panels || panels.length === 0) return;

    if (useSeededRandom) {
      const prev = Math.random;
      let s = (seed + k * 1013904223) >>> 0;
      Math.random = () => {
        // LCG (Numerical Recipes)
        s = (1664525 * s + 1013904223) >>> 0;
        return s / 4294967296;
      };
      try {
        panels.forEach((panel) => {
          try { panel.dispatchEvent(new CustomEvent('toy-random-notes', { bubbles: true })); } catch {}
        });
      } finally {
        Math.random = prev;
      }
    } else {
      panels.forEach((panel) => {
        try { panel.dispatchEvent(new CustomEvent('toy-random-notes', { bubbles: true })); } catch {}
      });
    }
  };
}

// DrawGrid randomise notes ONCE (deterministic optional).
// Fires `toy-random-notes` a single time after a short delay so panels exist.
export function makeDrawgridRandomiseOnceScript({
  atMs = 250,
  seed = 1337,
  useSeededRandom = true,
} = {}) {
  const fireAt = Math.max(0, Number(atMs) || 0);

  return function step(tMs) {
    if (step.__didFire) return;
    if (tMs < fireAt) return;
    step.__didFire = true;

    const panels = document.querySelectorAll('.toy-panel[data-toy="drawgrid"]');
    if (!panels || panels.length === 0) return;
    const __perfOn = !!(window.__PerfFrameProf && typeof performance !== 'undefined' && performance.now);
    const t0 = __perfOn ? performance.now() : 0;

    if (useSeededRandom) {
      const prev = Math.random;
      let s = (seed >>> 0);
      Math.random = () => {
        s = (1664525 * s + 1013904223) >>> 0;
        return s / 4294967296;
      };
      try {
        panels.forEach((panel) => {
          try { panel.dispatchEvent(new CustomEvent('toy-random-notes', { bubbles: true })); } catch {}
        });
      } finally {
        Math.random = prev;
      }
    } else {
      panels.forEach((panel) => {
        try { panel.dispatchEvent(new CustomEvent('toy-random-notes', { bubbles: true })); } catch {}
      });
    }
    if (__perfOn) {
      window.__PerfFrameProf.mark('perf.drawgrid.randomOnce', performance.now() - t0);
    }
  };
}
