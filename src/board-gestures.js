// src/board-gestures.js
import { setGestureTransform, commitGesture, getZoomState } from './zoom/ZoomCoordinator.js';

(function () {
  const layer = document.getElementById('boardGestureLayer');
  const viewport = document.querySelector('.board-viewport');
  const stage = document.querySelector('main#board, #board, #world, .world, .canvas-world');
  if (!layer || !viewport) return;

  const SCALE_MIN = 0.3;
  const SCALE_MAX = 4.0;

  const activePointers = new Map();
  let dragging = false;
  let dragStart = null;
  let pinchState = null;
  let capturedPointerId = null;

  function clampScale(v) {
    if (!Number.isFinite(v)) return SCALE_MIN;
    return Math.min(SCALE_MAX, Math.max(SCALE_MIN, v));
  }

  function getPinchDist() {
    const pointers = Array.from(activePointers.values());
    if (pointers.length < 2) return 0;
    const dx = pointers[0].x - pointers[1].x;
    const dy = pointers[0].y - pointers[1].y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function getMidpoint() {
    const pointers = Array.from(activePointers.values());
    if (pointers.length === 0) return { x: 0, y: 0 };
    if (pointers.length === 1) {
      return { x: pointers[0].x, y: pointers[0].y };
    }
    const x = (pointers[0].x + pointers[1].x) / 2;
    const y = (pointers[0].y + pointers[1].y) / 2;
    return { x, y };
  }

  function beginDrag(e) {
    const zoom = getZoomState();
    dragging = true;
    dragStart = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      baseX: zoom.targetX ?? zoom.currentX ?? 0,
      baseY: zoom.targetY ?? zoom.currentY ?? 0,
      scale: zoom.targetScale ?? zoom.currentScale ?? 1,
    };
    layer.style.pointerEvents = 'auto';
    try {
      layer.setPointerCapture(e.pointerId);
      capturedPointerId = e.pointerId;
    } catch {}
  }

  function beginPinch() {
    const dist = getPinchDist();
    if (dist <= 0) return;
    const midpoint = getMidpoint();
    const zoom = getZoomState();
    const baseScale = zoom.targetScale ?? zoom.currentScale ?? 1;
    const baseX = zoom.targetX ?? zoom.currentX ?? 0;
    const baseY = zoom.targetY ?? zoom.currentY ?? 0;
    const rect = stage?.getBoundingClientRect();
    const layoutLeft = rect ? rect.left - baseX : 0;
    const layoutTop = rect ? rect.top - baseY : 0;

    if (capturedPointerId !== null) {
      try { layer.releasePointerCapture(capturedPointerId); } catch {}
      capturedPointerId = null;
    }
    layer.style.pointerEvents = 'none';
    dragging = false;
    dragStart = null;

    pinchState = {
      baseScale,
      baseX,
      baseY,
      baseDist: dist,
      layoutLeft,
      layoutTop,
    };
  }

  function endGesture(e) {
    const zoom = getZoomState();
    // [DIAG] Tag this gesture so other modules can correlate.
    const GID = (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).toUpperCase();
    const T0 = performance?.now?.() ?? Date.now();
    window.__LAST_POINTERUP_DIAG__ = { gid: GID, t0: T0 };

    console.debug('[DIAG][pointerup] commitGesture start', { GID, T0, zoom });
    commitGesture(
      {
        scale: clampScale(zoom.targetScale ?? zoom.currentScale ?? 1),
        x: zoom.targetX ?? zoom.currentX ?? 0,
        y: zoom.targetY ?? zoom.currentY ?? 0,
      },
      { delayMs: 60 }
    );
    console.debug('[DIAG][pointerup] commitGesture queued', { GID, delayMs: 60 });
    if (dragging) {
      dragging = false;
      dragStart = null;
    }
    layer.style.pointerEvents = 'none';
    if (capturedPointerId !== null) {
      try { layer.releasePointerCapture(capturedPointerId); } catch {}
      capturedPointerId = null;
    }
    pinchState = null;
  }

  function onDown(e) {
    if (e.target.closest('.toy-panel, button, a, input, select, textarea')) {
      return;
    }
    if (window.__tutorialZoomLock) {
      e.preventDefault();
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size > 1) {
      e.preventDefault();
      dragging = false;
      dragStart = null;
      beginPinch();
      return;
    }

    e.preventDefault();
    beginDrag(e);
  }

  function onMove(e) {
    if (!activePointers.has(e.pointerId)) return;

    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size > 1) {
      if (!pinchState) beginPinch();
      if (!pinchState || pinchState.baseDist <= 0) return;
      e.preventDefault();

      const { baseScale, baseX, baseY, baseDist, layoutLeft, layoutTop } = pinchState;
      const newDist = getPinchDist();
      if (newDist <= 0) return;
      const midpoint = getMidpoint();
      const factor = newDist / baseDist;
      const nextScale = clampScale(baseScale * factor);
      const sx = nextScale / baseScale;
      const px = midpoint.x;
      const py = midpoint.y;
      const nextX = (px - layoutLeft) * (1 - sx) + sx * baseX;
      const nextY = (py - layoutTop) * (1 - sx) + sx * baseY;
      setGestureTransform({ scale: nextScale, x: nextX, y: nextY });
      return;
    }

    if (!dragging || !dragStart) return;
    e.preventDefault();
    const dx = e.clientX - dragStart.pointerX;
    const dy = e.clientY - dragStart.pointerY;
    const nextX = dragStart.baseX + dx;
    const nextY = dragStart.baseY + dy;
    setGestureTransform({ scale: dragStart.scale, x: nextX, y: nextY });
  }

  function onUp(e) {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.delete(e.pointerId);

    if (activePointers.size >= 2) {
      if (!pinchState) beginPinch();
      return;
    }

    endGesture(e);
  }

  viewport.addEventListener('pointerdown', onDown, { passive: false });
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp, { passive: false });
  window.addEventListener('pointercancel', onUp, { passive: false });
})();
