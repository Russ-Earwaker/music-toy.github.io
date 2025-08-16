// src/ripplesynth-input.js
// Handles pointer input for the Rippler toy (placement, move, drag).
// Exposes flags on cfg.state: draggingBlock, draggingGenerator, generatorDragEnded, dragIndex

export function makePointerHandlers(cfg) {
  const { canvas, vw, vh, EDGE, blocks, ripples, generatorRef, clamp, getCanvasPos } = cfg;
  cfg.state = cfg.state || {};
  cfg.state.draggingBlock = null;
  cfg.state.dragIndex = -1;
  cfg.state.draggingGenerator = false;
  cfg.state.generatorDragEnded = false;

  let capturedId = null;

  const HANDLE_HIT_PAD = 24; // generous padding to make grabbing the generator easy

  function posFromEvent(e) {
    const el = (e.currentTarget && e.currentTarget.getBoundingClientRect) ? e.currentTarget : canvas;
    return getCanvasPos(el, e);
  }

  function nearGenerator(p){
    const gx = generatorRef.x, gy = generatorRef.y;
    const r = (generatorRef.r || 12) + HANDLE_HIT_PAD;
    const dx = p.x - gx, dy = p.y - gy;
    return (dx*dx + dy*dy) <= r*r;
  }

  function findHitBlock(p) {
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return i;
    }
    return -1;
  }

  function pointerDown(e) {
    const p = posFromEvent(e);

    // First-time placement
    if (!generatorRef.placed && e.isTrusted) {
      generatorRef.place(p.x, p.y);
      try { if (canvas.setPointerCapture) { canvas.setPointerCapture(e.pointerId); capturedId = e.pointerId; } } catch {}
      return;
    }

    // Generator drag if clicking near the generator (easier than pixel-perfect on a small handle)
    if (generatorRef.placed && nearGenerator(p)) {
      cfg.state.draggingGenerator = true;
      cfg.state.generatorDragEnded = false;
      if (Array.isArray(ripples)) ripples.length = 0; // hide ripples while dragging
      try { if (canvas.setPointerCapture) { canvas.setPointerCapture(e.pointerId); capturedId = e.pointerId; } } catch {}
      return;
    }

    // Otherwise, start block drag if a block is hit
    const idx = findHitBlock(p);
    if (idx >= 0) {
      cfg.state.draggingBlock = { index: idx, offX: p.x - blocks[idx].x, offY: p.y - blocks[idx].y };
      cfg.state.dragIndex = idx;
      try { if (canvas.setPointerCapture) { canvas.setPointerCapture(e.pointerId); capturedId = e.pointerId; } } catch {}
      return;
    }

    // Empty-space click re-places generator (only if far from generator)
    if (generatorRef.placed && !nearGenerator(p)) {
      const nx = clamp(p.x, EDGE, vw() - EDGE);
      const ny = clamp(p.y, EDGE, vh() - EDGE);
      generatorRef.set(nx, ny);
      if (Array.isArray(ripples)) ripples.length = 0;
      cfg.state.generatorDragEnded = true; // trigger a clean re-sync on pointerup
      return;
    }
  }

  function pointerMove(e) {
    const p = posFromEvent(e);

    if (cfg.state.draggingGenerator) {
      generatorRef.set(clamp(p.x, EDGE, vw() - EDGE), clamp(p.y, EDGE, vh() - EDGE));
      return;
    }

    const db = cfg.state.draggingBlock;
    if (db) {
      const b = blocks[db.index];
      const newX = clamp(p.x - db.offX, EDGE, vw() - EDGE - b.w);
      const newY = clamp(p.y - db.offY, EDGE, vh() - EDGE - b.h);
      b.x = newX; b.y = newY;
      // keep spring target synced to avoid snap-back
      b.rx = newX; b.ry = newY;
      b.vx = 0; b.vy = 0;
      return;
    }
  }

  function pointerUp(e) {
    if (cfg.state.draggingGenerator) {
      cfg.state.draggingGenerator = false;
      cfg.state.generatorDragEnded = true;
    }
    cfg.state.draggingBlock = null;
    cfg.state.dragIndex = -1;
    if (capturedId != null && canvas.hasPointerCapture) {
      try { if (canvas.hasPointerCapture(capturedId)) canvas.releasePointerCapture(capturedId); } catch {}
    }
    capturedId = null;
  }

  return { pointerDown, pointerMove, pointerUp };
}
