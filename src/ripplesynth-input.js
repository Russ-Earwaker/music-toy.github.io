// src/ripplesynth-input.js
// Handles pointer input for the Rippler toy (placement, move, drag).

export function makePointerHandlers(cfg) {
  const { canvas, vw, vh, EDGE, blocks, ripples, generatorRef, clamp, getCanvasPos } = cfg;
  cfg.state = cfg.state || {};
  let capturedId = null;

  function posFromEvent(e) {
    const el = (e.currentTarget && e.currentTarget.getBoundingClientRect)
      ? e.currentTarget
      : canvas;
    return getCanvasPos(el, e);
  }

  function findHitBlock(p) {
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
        return b;
      }
    }
    return null;
  }

  function nearGenerator(p, r = (generatorRef.r || 12) + 6) {
    if (!generatorRef.exists || !generatorRef.exists()) return false;
    const dx = p.x - generatorRef.x, dy = p.y - generatorRef.y;
    return (dx * dx + dy * dy) <= r * r;
  }

  function pointerDown(e) {
    const p = posFromEvent(e);
    cfg.state.dragOff = { x: 0, y: 0 };
    let drag = null;

    const hit = findHitBlock(p);

    if (!generatorRef.exists || !generatorRef.exists()) {
      // First placement
      if (typeof generatorRef.place === 'function') {
        generatorRef.place(
          clamp(p.x, EDGE, vw() - EDGE),
          clamp(p.y, EDGE, vh() - EDGE)
        );
      } else if (typeof generatorRef.set === 'function') {
        generatorRef.set(
          clamp(p.x, EDGE, vw() - EDGE),
          clamp(p.y, EDGE, vh() - EDGE)
        );
      }
      // Core will detect placement change and spawn ripple.
    } else if (hit) {
      drag = hit;
      cfg.state.dragOff.x = p.x - hit.x;
      cfg.state.dragOff.y = p.y - hit.y;
    } else if (nearGenerator(p)) {
      drag = { __generator: true, w: 0, h: 0 };
      cfg.state.dragOff.x = p.x - generatorRef.x;
      cfg.state.dragOff.y = p.y - generatorRef.y;
    } else {
      // Move generator to click; core will clear ripples and spawn a fresh one
      if (typeof generatorRef.set === 'function') {
        generatorRef.set(
          clamp(p.x, EDGE, vw() - EDGE),
          clamp(p.y, EDGE, vh() - EDGE)
        );
      }
    }

    cfg.state.draggingBlock = drag;
    if (canvas.setPointerCapture && e.pointerId != null) {
      try { canvas.setPointerCapture(e.pointerId); capturedId = e.pointerId; } catch {}
    }
  }

  function pointerMove(e) {
    if (!cfg.state.draggingBlock) return;
    const p = posFromEvent(e);
    const b = cfg.state.draggingBlock;

    if (b.__generator) {
      // Stop ongoing ripples while moving generator
      ripples.length = 0;
      const nx = clamp(p.x - cfg.state.dragOff.x, EDGE, vw() - EDGE);
      const ny = clamp(p.y - cfg.state.dragOff.y, EDGE, vh() - EDGE);
      if (typeof generatorRef.set === 'function') generatorRef.set(nx, ny);
    } else {
      b.x = clamp(p.x - cfg.state.dragOff.x, EDGE, vw() - EDGE - b.w);
    b.y = clamp(p.y - cfg.state.dragOff.y, EDGE, vh() - EDGE - b.h);
    // keep rest synced while dragging so there is no drift
    b.rx = b.x; b.ry = b.y; b.vx = 0; b.vy = 0;
    }
  }

  function pointerUp(e) {
    cfg.state.draggingBlock = null;
    if (capturedId != null && canvas.hasPointerCapture) {
      try { if (canvas.hasPointerCapture(capturedId)) canvas.releasePointerCapture(capturedId); } catch {}
    }
    capturedId = null;
  }

  return { pointerDown, pointerMove, pointerUp };
}
