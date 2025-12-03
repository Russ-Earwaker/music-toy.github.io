// src/board-viewport.js — pan & zoom coordinator bridge (clean, <=300 lines)
import { overviewMode } from './overview-mode.js';
import { makeDebugLogger } from './debug-flags.js';
import {
  attachWorldElement,
  setGestureTransform,
  commitGesture,
  getZoomState,
  onZoomChange,
  getTransformOrder,
} from './zoom/ZoomCoordinator.js';
import { WheelZoomLerper } from './zoom/WheelZoomLerper.js';

const viewportLog = makeDebugLogger('mt_debug_logs');

let __liveViewportTransform = { scale: 1, tx: 0, ty: 0 };
export function getViewportTransform() {
  return { ...__liveViewportTransform };
}

export function getViewportState() {
  return getViewportTransform();
}

export function getViewportScale() {
  const state = getViewportTransform();
  return Number.isFinite(state?.scale) ? state.scale : 1;
}

export function screenToWorld(point = { x: 0, y: 0 }) {
  const { scale = 1, tx = 0, ty = 0 } = getViewportState() || {};
  const safeScale = Number.isFinite(scale) && Math.abs(scale) > 1e-6 ? scale : 1;
  const translateX = Number.isFinite(tx) ? tx : 0;
  const translateY = Number.isFinite(ty) ? ty : 0;
  const screenX = Number.isFinite(point?.x) ? point.x : 0;
  const screenY = Number.isFinite(point?.y) ? point.y : 0;
  return {
    x: (screenX - translateX) / safeScale,
    y: (screenY - translateY) / safeScale,
  };
}

export function worldToScreen(point = { x: 0, y: 0 }) {
  const { scale = 1, tx = 0, ty = 0 } = getViewportState() || {};
  const safeScale = Number.isFinite(scale) && Math.abs(scale) > 1e-6 ? scale : 1;
  const translateX = Number.isFinite(tx) ? tx : 0;
  const translateY = Number.isFinite(ty) ? ty : 0;
  const worldX = Number.isFinite(point?.x) ? point.x : 0;
  const worldY = Number.isFinite(point?.y) ? point.y : 0;
  return {
    x: worldX * safeScale + translateX,
    y: worldY * safeScale + translateY,
  };
}

export function worldToToy(pointWorld = { x: 0, y: 0 }, toyWorldOrigin = { x: 0, y: 0 }) {
  const originX = Number.isFinite(toyWorldOrigin?.x) ? toyWorldOrigin.x : 0;
  const originY = Number.isFinite(toyWorldOrigin?.y) ? toyWorldOrigin.y : 0;
  return {
    x: Number.isFinite(pointWorld?.x) ? pointWorld.x - originX : -originX,
    y: Number.isFinite(pointWorld?.y) ? pointWorld.y - originY : -originY,
  };
}

export function toyToWorld(pointToy = { x: 0, y: 0 }, toyWorldOrigin = { x: 0, y: 0 }) {
  const originX = Number.isFinite(toyWorldOrigin?.x) ? toyWorldOrigin.x : 0;
  const originY = Number.isFinite(toyWorldOrigin?.y) ? toyWorldOrigin.y : 0;
  return {
    x: Number.isFinite(pointToy?.x) ? pointToy.x + originX : originX,
    y: Number.isFinite(pointToy?.y) ? pointToy.y + originY : originY,
  };
}

(function () {
  if (window.__boardViewport) return;
  window.__boardViewport = true;

  const stage = document.querySelector('main#board, #board, #world, .world, .canvas-world');
  if (!stage) return;

  attachWorldElement(stage);

  const ORDER = getTransformOrder?.() || 'T_S';
  function worldToScreen(wx, wy, s, tx, ty) {
    return { x: wx * s + tx, y: wy * s + ty };
  }
  function screenToWorld(sx, sy, s, tx, ty) {
    return { x: (sx - tx) / s, y: (sy - ty) / s };
  }
  // --- tween helpers ---
  function easeInOutCubic(t){ return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2; }
  function lerp(a,b,t){ return a + (b - a) * t; }
  viewportLog('[board-viewport] transform order =', ORDER);

  const SCALE_MIN = 0.3;
  const SCALE_MAX = 4.0;
  const SCALE_EVENT_EPSILON = 1e-4;
  const SCALE_NOTIFY_EPSILON = 1e-4;

  let scale = 1;
  let x = 0;
  let y = 0;

  // Prevent re-entrant zooms while our pan+zoom tween is running
  let camTweenLock = false;
  Object.defineProperty(window, '__camTweenLock', { get: () => camTweenLock });

  try {
    const savedStr = localStorage.getItem('boardViewport') || 'null';
    const saved = JSON.parse(savedStr);
    if (saved && typeof saved === 'object') {
      const savedScale = Number(saved.scale);
      if (Number.isFinite(savedScale)) {
        scale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, savedScale));
      }
      if (Number.isFinite(saved?.x)) x = Number(saved.x);
      if (Number.isFinite(saved?.y)) y = Number(saved.y);
    }
  } catch (e) {
    console.error('[board-viewport] failed to load viewport', e);
  }

  function syncViewportSnapshot({
    scale: nextScale = scale,
    x: nextX = x,
    y: nextY = y,
  } = {}) {
    const safeScale = Number.isFinite(nextScale) ? nextScale : 1;
    const safeX = Number.isFinite(nextX) ? nextX : 0;
    const safeY = Number.isFinite(nextY) ? nextY : 0;
    __liveViewportTransform = { scale: safeScale, tx: safeX, ty: safeY };
    window.__boardScale = safeScale;
    window.__boardX = safeX;
    window.__boardY = safeY;
    try { stage?.style?.setProperty('--bv-scale', String(safeScale)); } catch {}
  }

  syncViewportSnapshot();

  let lastNotifiedScale = scale;
  let wheelCommitTimer = 0;
  function cancelWheelCommit() {
    clearTimeout(wheelCommitTimer);
    wheelCommitTimer = 0;
    try { lerper.cancel(); } catch {}
  }

  function clampScale(v) {
    if (!Number.isFinite(v)) return scale;
    return Math.min(SCALE_MAX, Math.max(SCALE_MIN, v));
  }

  function getActiveTransform() {
    const z = getZoomState();
    const baseScaleCandidate =
      Number.isFinite(z?.targetScale) ? z.targetScale :
      Number.isFinite(z?.currentScale) ? z.currentScale :
      scale;
    const baseScale = clampScale(baseScaleCandidate || scale);
    const baseX =
      Number.isFinite(z?.targetX) ? z.targetX :
      Number.isFinite(z?.currentX) ? z.currentX :
      x;
    const baseY =
      Number.isFinite(z?.targetY) ? z.targetY :
      Number.isFinite(z?.currentY) ? z.currentY :
      y;
    return { scale: baseScale, x: baseX, y: baseY };
  }

  function persist() {
    try {
      localStorage.setItem('boardViewport', JSON.stringify({ scale, x, y }));
    } catch {}
  }

  function getLayoutOffset() {
    const rect = stage.getBoundingClientRect();
    const { x: baseX, y: baseY } = getActiveTransform();
    return { layoutLeft: rect.left - baseX, layoutTop: rect.top - baseY };
  }

  function getViewportCenterWorld() {
    try {
      const { layoutLeft, layoutTop } = getLayoutOffset();
      const container = stage.closest('.board-viewport') || document.documentElement;
      const viewW = container.clientWidth || window.innerWidth;
      const viewH = container.clientHeight || window.innerHeight;
      const viewCx = viewW * 0.5;
      const viewCy = viewH * 0.5;
      const { scale: s, x: tx, y: ty } = getActiveTransform();
      if (!Number.isFinite(s) || Math.abs(s) < 1e-6) return null;
      return {
        x: (viewCx - layoutLeft - tx) / s,
        y: (viewCy - layoutTop - ty) / s,
      };
    } catch {
      return null;
    }
  }

  function applyTransform(
    { scale: nextScale = scale, x: nextX = x, y: nextY = y } = {},
    { commit = false, delayMs } = {}
  ) {
    scale = clampScale(nextScale);
    x = Number.isFinite(nextX) ? nextX : x;
    y = Number.isFinite(nextY) ? nextY : y;

    setGestureTransform({ scale, x, y });
    syncViewportSnapshot({ scale, x, y });
    if (commit) {
      commitGesture({ scale, x, y }, { delayMs });
    }
  }

  const zoomListeners = new Set();

  function notifyListeners(payload) {
    for (const fn of zoomListeners) {
      try { fn(payload); } catch (err) { console.warn('[board-viewport] zoom listener failed', err); }
    }
  }

  let pendingListenerPayload = null;
  let notifyRaf = 0;
  let lastNotifiedCommitScale = scale;
  const VIEWPORT_COMMIT_MIN_INTERVAL_MS = 120;
  let lastViewportCommitMs = 0;
  let lastViewportCommitKey = '';

  function scheduleNotify(payload) {
    const payloadScale =
      Number.isFinite(payload?.currentScale) ? payload.currentScale :
      Number.isFinite(payload?.targetScale) ? payload.targetScale :
      scale;

    if (Math.abs(payloadScale - lastNotifiedCommitScale) <= SCALE_NOTIFY_EPSILON) {
      return;
    }

    pendingListenerPayload = {
      ...payload,
      currentScale: payloadScale,
    };

    if (!notifyRaf) {
      notifyRaf = requestAnimationFrame(() => {
        notifyRaf = 0;
        if (!pendingListenerPayload) return;
        const toSend = pendingListenerPayload;
        pendingListenerPayload = null;
        lastNotifiedCommitScale = toSend.currentScale;
        notifyListeners(toSend);
      });
    }
  }

  function recomputeViewportFromZoom(z = {}) {
    const commitScale =
      Number.isFinite(z.currentScale) ? z.currentScale :
      Number.isFinite(z.targetScale) ? z.targetScale :
      scale;
    const commitX =
      Number.isFinite(z.currentX) ? z.currentX :
      Number.isFinite(z.targetX) ? z.targetX :
      x;
    const commitY =
      Number.isFinite(z.currentY) ? z.currentY :
      Number.isFinite(z.targetY) ? z.targetY :
      y;

    lastViewportCommitKey = `${commitScale}|${commitX}|${commitY}`;
    scale = commitScale;
    x = commitX;
    y = commitY;
    persist();

    scheduleNotify({
      ...z,
      committed: true,
      currentScale: commitScale,
      currentX: commitX,
      currentY: commitY,
      targetScale: Number.isFinite(z.targetScale) ? z.targetScale : commitScale,
      targetX: Number.isFinite(z.targetX) ? z.targetX : commitX,
      targetY: Number.isFinite(z.targetY) ? z.targetY : commitY,
    });

    const ov = overviewMode?.state;
    if (!ov) return;
    if (camTweenLock) {
      return;
    }
    if (ov.transitioning) {
      if (scale >= (ov.zoomReturnLevel - 1e-3)) {
        try { overviewMode.exit(false); } catch {}
        ov.transitioning = false;
      }
      return;
    }
    if (scale < ov.zoomThreshold) {
      overviewMode.enter();
    } else {
      overviewMode.exit(false);
    }
  }

  const handleZoom = (z = {}) => {
    const phase = z?.phase || null;

    const currentScale = z.currentScale ?? scale;
    const currentX = z.currentX ?? x;
    const currentY = z.currentY ?? y;

    // Keep the cheap updates on every phase so dependents stay in sync without layout reads.
    try { stage.style.setProperty('--bv-scale', String(currentScale)); } catch {}
    syncViewportSnapshot({ scale: currentScale, x: currentX, y: currentY });

    if (Math.abs(currentScale - lastNotifiedScale) > SCALE_EVENT_EPSILON) {
      lastNotifiedScale = currentScale;
      try {
        window.dispatchEvent(
          new CustomEvent('board:scale', { detail: { scale: currentScale } })
        );
      } catch (err) {
        console.warn('[board-viewport] scale event dispatch failed', err);
      }
    }

    // Lightweight path for noisy intermediate phases.
    if (phase === 'recompute' || phase === 'gesturing' || phase === 'prepare' || phase === 'begin') {
      return;
    }

    const isCommitLike = z.committed || phase === 'commit' || phase === 'done';
    if (!isCommitLike) {
      return;
    }

    // Heavy path only on commit/done.
    scale = currentScale;
    x = currentX;
    y = currentY;
    persist();
    scheduleNotify({ ...z });

    const ov = overviewMode?.state;
    if (camTweenLock) {
      // While a programmatic tween is active, suppress auto-enter/exit.
    } else if (ov?.transitioning) {
      if (scale >= (ov.zoomReturnLevel - 1e-3)) {
        try { overviewMode.exit(false); } catch {}
        ov.transitioning = false;
      }
    } else if (ov) {
      if (scale < ov.zoomThreshold) {
        overviewMode.enter();
      } else {
        overviewMode.exit(false);
      }
    }
  };
  handleZoom.__zcName = 'board-viewport';
  onZoomChange(handleZoom);

  const lerper = new WheelZoomLerper((nextScale, nextX, nextY) => {
    applyTransform({ scale: nextScale, x: nextX, y: nextY });
  });
  // When any lerp settles, commit so downstream listeners see the final transform.
  lerper.onSettle = (settleScale, settleX, settleY) => {
    commitGesture({ scale: settleScale, x: settleX, y: settleY }, { delayMs: 60 });
    if (camTweenLock) return;
    try {
      const el = window.__lastFocusEl;
      if (el?.isConnected) {
        const wc = getWorldCenter(el);
        if (wc) {
          const container = stage.closest('.board-viewport') || document.documentElement;
          const viewW = container.clientWidth || window.innerWidth;
          const viewH = container.clientHeight || window.innerHeight;
          const viewCx = Math.round(viewW * 0.5);
          const viewCy = Math.round(viewH * 0.5);
          const { px, py } = measureScreenFromWorld(wc.x, wc.y, settleScale, settleX, settleY);
          const dx = Math.round(px - viewCx);
          const dy = Math.round(py - viewCy);
          viewportLog('[center settle]', { dx, dy, settleScale, settleX, settleY });
        }
      }
    } catch {}
  };

  function zoomAt(clientX, clientY, factor, { commit = true, delayMs = 0 } = {}) {
    if (!Number.isFinite(factor) || factor === 0) return scale;
    const rect = stage.getBoundingClientRect();
    const { scale: baseScale, x: baseX, y: baseY } = getActiveTransform();
    const targetScale = clampScale(baseScale * factor);
    if (!Number.isFinite(targetScale) || targetScale === baseScale) {
      return scale;
    }

    const layoutLeft = rect.left - baseX;
    const layoutTop = rect.top - baseY;
    const sx = targetScale / baseScale;

    const px = clientX;
    const py = clientY;

    const nextX = (px - layoutLeft) * (1 - sx) + sx * baseX;
    const nextY = (py - layoutTop) * (1 - sx) + sx * baseY;

    applyTransform({ scale: targetScale, x: nextX, y: nextY }, { commit, delayMs });
    return scale;
  }

  function handleWheel(e) {
    if (window.__tutorialZoomLock) {
      e.preventDefault();
      return;
    }
    if (e.ctrlKey) return;

    e.preventDefault();
    try {
      window.dispatchEvent(new CustomEvent('board:user-zoom', {
        detail: {
          method: 'wheel',
          delta: e.deltaY,
          x: e.clientX,
          y: e.clientY,
        },
      }));
    } catch {}

    const rect = stage.getBoundingClientRect();
    const { x: baseX, y: baseY } = getActiveTransform();
    const layoutLeft = rect.left - baseX;
    const layoutTop = rect.top - baseY;

    lerper.setTargetFromWheel(e.deltaY, e.clientX, e.clientY, layoutLeft, layoutTop);

    clearTimeout(wheelCommitTimer);
    wheelCommitTimer = setTimeout(() => {
      requestAnimationFrame(() => {
        if (!lerper.state?.running) return;
        const target = lerper.state;
        commitGesture(
          { scale: target.targetScale, x: target.targetX, y: target.targetY },
          { delayMs: 60 }
        );
      });
    }, 120);
  }

  window.addEventListener('wheel', handleWheel, { passive: false });

  window.panTo = (nx, ny) => {
    const targetX = Number(nx);
    const targetY = Number(ny);
    applyTransform(
      {
        x: Number.isFinite(targetX) ? targetX : 0,
        y: Number.isFinite(targetY) ? targetY : 0,
      },
      { commit: true, delayMs: 0 }
    );
    scheduleNotify({ ...getZoomState(), committed: true });
  };
  window.panBy = (dx, dy) => {
    applyTransform({ x: x + Number(dx || 0), y: y + Number(dy || 0) });
  };
  window.zoomAt = (clientX, clientY, factor) =>
    zoomAt(clientX, clientY, factor, { commit: true, delayMs: 0 });
  function animateTo(scaleTarget, xTarget, yTarget) {
    const s = clampScale(Number(scaleTarget) || scale);
    const tx = Number.isFinite(xTarget) ? xTarget : x;
    const ty = Number.isFinite(yTarget) ? yTarget : y;
    cancelWheelCommit();
    lerper.setTarget(s, tx, ty);
  }

  window.setBoardScale = (sc) => {
    cancelWheelCommit();
    const scaleValue = clampScale(Number(sc) || 1);
    const rect = stage.getBoundingClientRect();
    const { scale: baseScale, x: baseX, y: baseY } = getActiveTransform();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const sx = scaleValue / (baseScale || 1);
    const layoutLeft = rect.left - baseX;
    const layoutTop = rect.top - baseY;
    const nextX = (centerX - layoutLeft) * (1 - sx) + sx * baseX;
    const nextY = (centerY - layoutTop) * (1 - sx) + sx * baseY;
    animateTo(scaleValue, nextX, nextY);
  };
  window.resetBoardView = () => {
    applyTransform({ scale: 1, x: 0, y: 0 }, { commit: true, delayMs: 0 });
    scheduleNotify({ ...getZoomState(), committed: true });
  };
  window.getViewportCenterWorld = getViewportCenterWorld;

  function getTargetElementForPanel(panel) {
    if (!panel) return null;
    const body = panel.querySelector?.('.toy-body');
    if (body) return body;
    return panel.querySelector?.(
      '.grid-canvas, .rippler-canvas, .bouncer-canvas, .wheel-canvas, canvas, svg'
    ) || panel;
  }

  function getPanel(el) {
    if (!el) return null;
    if (el.classList?.contains?.('toy-panel')) return el;
    return el.closest?.('.toy-panel');
  }

  function parsePx(value) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : null;
  }

  function getWorldCenter(el) {
    if (!el || !(el instanceof HTMLElement)) return null;

    const panel = getPanel(el) || el;
    const computed = panel ? getComputedStyle(panel) : null;
    const left = parsePx(panel?.style?.left ?? computed?.left);
    const top = parsePx(panel?.style?.top ?? computed?.top);
    const w = panel?.offsetWidth ?? el.offsetWidth ?? 0;
    const h = panel?.offsetHeight ?? el.offsetHeight ?? 0;
    if (Number.isFinite(left) && Number.isFinite(top)) {
      const wx = left + w * 0.5;
      const wy = top + h * 0.5;
      viewportLog('[getWorldCenter:style]', { id: panel?.id, left, top, w, h, wx, wy });
      return { x: wx, y: wy };
    }

    const targetEl = getTargetElementForPanel(panel) || panel;
    const z = getZoomState();
    const s =
      Number.isFinite(z?.currentScale) ? z.currentScale :
      Number.isFinite(z?.targetScale) ? z.targetScale :
      scale;
    const tx =
      Number.isFinite(z?.currentX) ? z.currentX :
      Number.isFinite(z?.targetX) ? z.targetX :
      x;
    const ty =
      Number.isFinite(z?.currentY) ? z.currentY :
      Number.isFinite(z?.targetY) ? z.targetY :
      y;
    if (!Number.isFinite(s) || !Number.isFinite(tx) || !Number.isFinite(ty)) return null;
    const boardRect = stage.getBoundingClientRect();
    const elRect = targetEl.getBoundingClientRect();
    const screenCx = (elRect.left - boardRect.left) + (elRect.width * 0.5);
    const screenCy = (elRect.top - boardRect.top) + (elRect.height * 0.5);
    const worldVec = screenToWorld(screenCx, screenCy, s, tx, ty);
    const wx = worldVec.x;
    const wy = worldVec.y;
    const dbg = {
      id: panel?.id,
      screenCx,
      screenCy,
      s,
      tx,
      ty,
      wx,
      wy
    };
    viewportLog('[getWorldCenter:rect]', dbg);
    return Number.isFinite(wx) && Number.isFinite(wy) ? { x: wx, y: wy } : null;
  }
  window.getWorldCenter = getWorldCenter;

  function measureScreenFromWorld(xWorld, yWorld, s = scale, tx = x, ty = y) {
    const { layoutLeft, layoutTop } = getLayoutOffset();
    const res = worldToScreen(xWorld, yWorld, s, tx, ty);
    return { px: res.x + layoutLeft, py: res.y + layoutTop };
  }

  function nudgeCenterIfOff(el, desiredScale) {
    const wc = getWorldCenter(el);
    if (!wc) return;
    const container = stage.closest('.board-viewport') || document.documentElement;
    const viewW = container.clientWidth || window.innerWidth;
    const viewH = container.clientHeight || window.innerHeight;
    const viewCx = viewW * 0.5;
    const viewCy = viewH * 0.5;
    const { layoutLeft, layoutTop } = getLayoutOffset();
    const s = clampScale(Number(desiredScale) || scale);
    const { px, py } = measureScreenFromWorld(wc.x, wc.y, s, x, y);
    const dx = px - viewCx;
    const dy = py - viewCy;
    const THRESH_PX = 6;
    if (Math.abs(dx) > THRESH_PX || Math.abs(dy) > THRESH_PX) {
      const nextX = x - dx;
      const nextY = y - dy;
      animateTo(s, nextX, nextY);
    }
  }

  // Pan & zoom together from current transform to the final "toy centered" transform.
  // The toy will *move toward* center while zooming (not locked to center mid-move).
  function zoomPanToFinal(xWorld, yWorld, targetScale, { duration = 320, easing = easeInOutCubic } = {}) {
    camTweenLock = true;
    const s1 = clampScale(Number(targetScale) || scale);
    // We'll recompute layout/view center each frame to follow any chrome/layout changes.

    const start = getActiveTransform();
    const s0 = start.scale, x0 = start.x, y0 = start.y;

    // If we’re already basically there, snap & commit.
    // We’ll compute tX/tY inside the step once we know current layout.
    if (Math.abs(s1 - s0) < 1e-4) {
      // Keep x/y as-is; a later set will lock to center if already near.
      applyTransform({ scale: s1, x: x0, y: y0 }, { commit: true, delayMs: 0 });
      camTweenLock = false;
      return Promise.resolve();
    }

    cancelWheelCommit();
    let t0 = 0;
    return new Promise((resolve) => {
      const step = (now) => {
        if (!t0) t0 = now;
        const k = Math.min(1, (now - t0) / duration);
        const e = easing(k);
        const s = lerp(s0, s1, e);
        // Recompute layout + view center this frame
        const { layoutLeft, layoutTop } = getLayoutOffset();
        const container = stage.closest('.board-viewport') || document.documentElement;
        const viewW = container.clientWidth || window.innerWidth;
        const viewH = container.clientHeight || window.innerHeight;
        const viewCx = viewW * 0.5;
        const viewCy = viewH * 0.5;
        // Final translate for THIS frame to head toward the correct final center
        const tX = viewCx - layoutLeft - xWorld * s1;
        const tY = viewCy - layoutTop  - yWorld * s1;
        if (!Number.isFinite(tX) || !Number.isFinite(tY)) {
          camTweenLock = false;
          resolve();
          return;
        }
        // Interpolate from the *current* transform toward the *final* transform
        const xLerp = lerp(x0, tX, e);
        const yLerp = lerp(y0, tY, e);
        setGestureTransform({ scale: s, x: xLerp, y: yLerp });
        if (k < 1) {
          requestAnimationFrame(step);
        } else {
          // Recompute one last time at settle to land exactly at the live layout center
          const { layoutLeft: finalLayoutLeft, layoutTop: finalLayoutTop } = getLayoutOffset();
          const finalContainer = stage.closest('.board-viewport') || document.documentElement;
          const finalViewW = finalContainer.clientWidth || window.innerWidth;
          const finalViewH = finalContainer.clientHeight || window.innerHeight;
          const finalViewCx = finalViewW * 0.5;
          const finalViewCy = finalViewH * 0.5;
          const finalX = finalViewCx - finalLayoutLeft - xWorld * s1;
          const finalY = finalViewCy - finalLayoutTop  - yWorld * s1;
          if (Number.isFinite(finalX) && Number.isFinite(finalY)) {
            commitGesture({ scale: s1, x: finalX, y: finalY }, { delayMs: 60 });
            // Hold lock one more RAF so nobody kicks a follow-up zoom on the commit
            requestAnimationFrame(() => { camTweenLock = false; resolve(); });
          } else {
            camTweenLock = false;
            resolve();
          }
        }
      };
      requestAnimationFrame(step);
    });
  }

  window.centerBoardOnWorldPoint = async (xWorld, yWorld, desiredScale = scale) => {
    if (camTweenLock) return; // ignore while an animation is in progress
    if (!Number.isFinite(xWorld) || !Number.isFinite(yWorld)) return;
    const targetScale = clampScale(Number(desiredScale) || scale);
    // One smooth move: pan & zoom together toward the final centered transform.
    await zoomPanToFinal(xWorld, yWorld, targetScale, { duration: 320, easing: easeInOutCubic });
  };

  window.centerBoardOnElement = (el, desiredScale = scale) => {
    if (camTweenLock) return;
    if (!el || !stage) return;
    window.__lastFocusEl = el;
    cancelWheelCommit();
    const targetScale = clampScale(Number(desiredScale) || scale);
    const active = getActiveTransform();
    const currentScale = active.scale || 1;

    // The viewport container that actually frames the board.
    const container = stage.closest('.board-viewport') || document.documentElement;
    const viewW = container.clientWidth || window.innerWidth;
    const viewH = container.clientHeight || window.innerHeight;
    const viewCx = viewW * 0.5;
    const viewCy = viewH * 0.5;

    // World-space center of the panel (offsets are relative to #board because board.js ensures position:relative).
  const worldCenter = getWorldCenter(el);
  const elCxWorld = worldCenter?.x ?? 0;
  const elCyWorld = worldCenter?.y ?? 0;

  const { layoutLeft, layoutTop } = getLayoutOffset();
  const nextX = viewCx - layoutLeft - elCxWorld * targetScale;
  const nextY = viewCy - layoutTop - elCyWorld * targetScale;

    // Guard against NaN/Infinity
    if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) {
      console.warn('[centerBoardOnElement] bad coords; falling back to no-op', {
        targetScale, currentScale, elCxWorld, elCyWorld, viewW, viewH
      });
      return;
    }

    animateTo(targetScale, nextX, nextY);
    setTimeout(() => {
      if (el?.isConnected) nudgeCenterIfOff(el, targetScale);
    }, 0);
  };

  const crosshairState = { raf: 0, active: false, x: 0, y: 0 };

  function drawCrosshairAtWorld(xWorld, yWorld) {
    crosshairState.x = xWorld;
    crosshairState.y = yWorld;
    crosshairState.active = true;
    if (!crosshairState.raf) {
      crosshairState.raf = requestAnimationFrame(updateCrosshair);
    }
  }

  function updateCrosshair() {
    crosshairState.raf = 0;
    if (!crosshairState.active) return;
    try {
      let el = document.getElementById('zoom-crosshair');
      if (!el) {
        el = document.createElement('div');
        el.id = 'zoom-crosshair';
        el.style.position = 'fixed';
        el.style.zIndex = '999999';
        el.style.width = '11px';
        el.style.height = '11px';
        el.style.pointerEvents = 'none';
        el.style.border = '2px solid red';
        el.style.borderRadius = '50%';
        el.style.boxSizing = 'border-box';
        document.body.appendChild(el);
      }
      const z = getZoomState?.() || {};
      const s = z.currentScale ?? z.targetScale ?? scale;
      const tx = z.currentX ?? z.targetX ?? x;
      const ty = z.currentY ?? z.targetY ?? y;
      const { layoutLeft, layoutTop } = getLayoutOffset();
      const proj = worldToScreen(crosshairState.x, crosshairState.y, s, tx, ty);
      el.style.left = Math.round(proj.x + layoutLeft - 5) + 'px';
      el.style.top = Math.round(proj.y + layoutTop - 5) + 'px';
    } catch {}
    crosshairState.raf = requestAnimationFrame(updateCrosshair);
  }

  const initial = getZoomState();
  if (
    !initial ||
    Math.abs((initial.currentScale ?? initial.targetScale) - scale) > SCALE_EVENT_EPSILON ||
    Math.abs((initial.currentX ?? initial.targetX) - x) > 0.1 ||
    Math.abs((initial.currentY ?? initial.targetY) - y) > 0.1
  ) {
    applyTransform({ scale, x, y }, { commit: true, delayMs: 0 });
  } else {
    const initialScale = initial.currentScale ?? initial.targetScale ?? scale;
    const initialX = initial.currentX ?? initial.targetX ?? x;
    const initialY = initial.currentY ?? initial.targetY ?? y;
    syncViewportSnapshot({ scale: initialScale, x: initialX, y: initialY });
  }
})();
