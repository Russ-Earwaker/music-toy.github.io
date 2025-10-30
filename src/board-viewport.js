// src/board-viewport.js — pan & zoom coordinator bridge (clean, <=300 lines)
import { overviewMode } from './overview-mode.js';
import {
  attachWorldElement,
  setGestureTransform,
  commitGesture,
  getZoomState,
  onZoomChange,
} from './zoom/ZoomCoordinator.js';
import { WheelZoomLerper } from './zoom/WheelZoomLerper.js';

(function () {
  if (window.__boardViewport) return;
  window.__boardViewport = true;

  const stage = document.querySelector('main#board, #board, #world, .world, .canvas-world');
  if (!stage) return;

  attachWorldElement(stage);

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
      if (scale < overviewMode.state.zoomThreshold) {
        overviewMode.enter();
      } else {
        overviewMode.exit(false);
      }
    }
  });

  const lerper = new WheelZoomLerper((nextScale, nextX, nextY) => {
    applyTransform({ scale: nextScale, x: nextX, y: nextY });
  });

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
  window.setBoardScale = (sc) => {
    const scaleValue = clampScale(Number(sc) || 1);
    const rect = stage.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    zoomAt(centerX, centerY, scaleValue / scale, { commit: true, delayMs: 0 });
    scheduleNotify({ ...getZoomState(), committed: true });
  };
  window.resetBoardView = () => {
    applyTransform({ scale: 1, x: 0, y: 0 }, { commit: true, delayMs: 0 });
    scheduleNotify({ ...getZoomState(), committed: true });
  };

  window.centerBoardOnElement = (el, desiredScale = scale) => {
    if (!el || !stage) return;
    const targetScale = clampScale(Number(desiredScale) || scale);
    const boardRect = stage.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const currentScale = scale || 1;

    const anchorXWorld =
      (elRect.left - boardRect.left + elRect.width / 2) / currentScale;
    const anchorYWorld =
      (elRect.top - boardRect.top + elRect.height / 2) / currentScale;

    const nextX = window.innerWidth / 2 - anchorXWorld * targetScale;
    const nextY = window.innerHeight / 2 - anchorYWorld * targetScale;

    applyTransform({ scale: targetScale, x: nextX, y: nextY }, { commit: true, delayMs: 0 });
    scheduleNotify({ ...getZoomState(), committed: true });
  };

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
