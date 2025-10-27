// src/board-gestures.js
(function () {
  const layer = document.getElementById('boardGestureLayer');
  const viewport = document.querySelector('.board-viewport');
  if (!layer || !viewport) return;

  let dragging = false;
  let lastX = 0, lastY = 0;
  let activePointers = new Map();
  let lastPinchDist = 0;

  function getPinchDist() {
      const pointers = Array.from(activePointers.values());
      if (pointers.length < 2) return 0;
      const dx = pointers[0].x - pointers[1].x;
      const dy = pointers[0].y - pointers[1].y;
      return Math.sqrt(dx*dx + dy*dy);
  }

  function getMidpoint() {
      const pointers = Array.from(activePointers.values());
      if (pointers.length === 0) return {x:0, y:0};
      if (pointers.length === 1) return {x: pointers[0].x, y: pointers[0].y};
      const x = (pointers[0].x + pointers[1].x) / 2;
      const y = (pointers[0].y + pointers[1].y) / 2;
      return {x, y};
  }

  function onDown(e) {
    if (e.target.closest('.toy-panel, button, a, input, select, textarea')) {
      return;
    }
    
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size > 1) {
      e.preventDefault();
      dragging = false;
      lastPinchDist = getPinchDist();
    } else {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      layer.style.pointerEvents = 'auto';
      try { layer.setPointerCapture(e.pointerId); } catch {}
    }
  }

  function onMove(e) {
    if (!activePointers.has(e.pointerId)) return;

    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size > 1) {
        const newPinchDist = getPinchDist();
        if (lastPinchDist > 0) {
            const delta = lastPinchDist - newPinchDist;
            const factor = Math.pow(1.01, -delta);
            const midpoint = getMidpoint();
            if (window.zoomAt) {
                window.zoomAt(midpoint.x, midpoint.y, factor);
            }
        }
        lastPinchDist = newPinchDist;
        return;
    }

    if (dragging) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        if (window.panBy) window.panBy(dx, dy);
    }
  }

  function onUp(e) {
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) {
        lastPinchDist = 0;
    }
    if (dragging && activePointers.size === 0) {
        dragging = false;
        layer.style.pointerEvents = 'none';
        try { layer.releasePointerCapture(e.pointerId); } catch {}
    }
  }

  viewport.addEventListener('pointerdown', onDown, false);
  window.addEventListener('pointermove', onMove, false);
  window.addEventListener('pointerup', onUp, false);
  window.addEventListener('pointercancel', onUp, false);

})();