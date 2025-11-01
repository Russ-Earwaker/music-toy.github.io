// src/board-viewport.js — pan & zoom coordinator bridge (clean, <=300 lines)
import { overviewMode } from './overview-mode.js';
import {
  attachWorldElement,
  setGestureTransform,
  commitGesture,
  getZoomState,
  onZoomChange,
  getTransformOrder,
} from './zoom/ZoomCoordinator.js';
import { WheelZoomLerper } from './zoom/WheelZoomLerper.js';

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
  console.debug('[board-viewport] transform order =', ORDER);

  const SCALE_MIN = 0.3;
  const SCALE_MAX = 4.0;
  const SCALE_EVENT_EPSILON = 1e-4;
  const SCALE_NOTIFY_EPSILON = 1e-4;

  let scale = 1;
  let x = 0;
  let y = 0;

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

  window.__boardScale = scale;
  window.__boardX = x;
  window.__boardY = y;

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

  function applyTransform(
    { scale: nextScale = scale, x: nextX = x, y: nextY = y } = {},
    { commit = false, delayMs } = {}
  ) {
    scale = clampScale(nextScale);
    x = Number.isFinite(nextX) ? nextX : x;
    y = Number.isFinite(nextY) ? nextY : y;

    setGestureTransform({ scale, x, y });
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

  onZoomChange((z) => {
    const currentScale = z.currentScale ?? scale;
    const currentX = z.currentX ?? x;
    const currentY = z.currentY ?? y;

    stage.style.setProperty('--bv-scale', String(currentScale));
    window.__boardScale = currentScale;
    window.__boardX = currentX;
    window.__boardY = currentY;

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

    if (z.committed) {
      scale = currentScale;
      x = currentX;
      y = currentY;
      persist();
      scheduleNotify({ ...z });
      const ov = overviewMode?.state;
      if (ov?.transitioning) {
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
    }
  });

  const lerper = new WheelZoomLerper((nextScale, nextX, nextY) => {
    applyTransform({ scale: nextScale, x: nextX, y: nextY });
  });
  // When any lerp settles, commit so downstream listeners see the final transform.
  lerper.onSettle = (settleScale, settleX, settleY) => {
    commitGesture({ scale: settleScale, x: settleX, y: settleY }, { delayMs: 60 });
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
          console.debug('[center settle]', { dx, dy, settleScale, settleX, settleY });
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
      console.debug?.('[getWorldCenter:style]', { id: panel?.id, left, top, w, h, wx, wy });
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
    console.debug?.('[getWorldCenter:rect]', dbg);
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

  window.centerBoardOnWorldPoint = (xWorld, yWorld, desiredScale = scale) => {
    if (!Number.isFinite(xWorld) || !Number.isFinite(yWorld)) return;
    cancelWheelCommit();
    const targetScale = clampScale(Number(desiredScale) || scale);
    const container = stage.closest('.board-viewport') || document.documentElement;
    const viewW = container.clientWidth || window.innerWidth;
    const viewH = container.clientHeight || window.innerHeight;
    const viewCx = viewW * 0.5;
    const viewCy = viewH * 0.5;
    const { layoutLeft, layoutTop } = getLayoutOffset();
    const nextX = viewCx - layoutLeft - xWorld * targetScale;
    const nextY = viewCy - layoutTop - yWorld * targetScale;
    if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return;
    const projected = worldToScreen(xWorld, yWorld, targetScale, nextX, nextY);
    console.debug('[center target]', {
      order: ORDER,
      world: { x: xWorld, y: yWorld },
      view: { cx: viewCx, cy: viewCy },
      next: { scale: targetScale, x: nextX, y: nextY },
      projected: { x: projected.x + layoutLeft, y: projected.y + layoutTop }
    });
    drawCrosshairAtWorld(xWorld, yWorld);
    animateTo(targetScale, nextX, nextY);
    const focusEl = window.__lastFocusEl;
    setTimeout(() => {
      if (focusEl?.isConnected) nudgeCenterIfOff(focusEl, targetScale);
    }, 0);
  };

  window.centerBoardOnElement = (el, desiredScale = scale) => {
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
    window.__boardScale = initial.currentScale ?? initial.targetScale ?? scale;
    window.__boardX = initial.currentX ?? initial.targetX ?? x;
    window.__boardY = initial.currentY ?? initial.targetY ?? y;
    stage.style.setProperty('--bv-scale', String(window.__boardScale));
  }
})();
