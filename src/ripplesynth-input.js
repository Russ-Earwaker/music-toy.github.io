// src/ripplesynth-input.js
// Handles pointer input for the Rippler toy (placement, move, drag).
// Exposes flags on cfg.state: draggingBlock, draggingGenerator, generatorDragEnded, dragIndex
// Now supports dynamic block rects via cfg.getBlockRects() and updates via cfg.onBlockDrag(index, newX, newY).

export function makePointerHandlers(cfg) {
  const { canvas, vw, vh, EDGE, blocks = [], ripples, generatorRef, clamp, getCanvasPos } = cfg;
  const getRects = typeof cfg.getBlockRects === 'function' ? cfg.getBlockRects : (() => blocks);
  const onBlockDrag = typeof cfg.onBlockDrag === 'function' ? cfg.onBlockDrag : (() => {});
  const onBlockGrab = typeof cfg.onBlockGrab === 'function' ? cfg.onBlockGrab : (() => {});
  const onBlockDrop = typeof cfg.onBlockDrop === 'function' ? cfg.onBlockDrop : (() => {});

  cfg.state = cfg.state || {};
  cfg.state.draggingBlock = null;   // { index, offX, offY }
  cfg.state.dragIndex = -1;
  cfg.state.draggingGenerator = false;
  cfg.state.generatorDragEnded = false;

  let capturedId = null;

  const HANDLE_HIT_PAD = 18; // slightly tighter to avoid stealing block clicks

  function posFromEvent(e){
    return getCanvasPos(canvas, e);
  }

  function nearGenerator(p){
    const gx = generatorRef.x, gy = generatorRef.y;
    const r = Math.max(10, (generatorRef.r || 12) + (cfg.handlePad || 6));
    return Math.hypot(p.x - gx, p.y - gy) <= r + HANDLE_HIT_PAD;
  }

  function findHitBlock(p){
    const rects = getRects() || [];
    for (let i = rects.length - 1; i >= 0; i--) {
      const b = rects[i];
      const x = b.x, y = b.y, w = b.w ?? b.size, h = b.h ?? b.size;
      if (p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h) return i;
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
    // Only if we're NOT clicking a block
    const hitIx = findHitBlock(p);
    if (generatorRef.placed && hitIx < 0 && nearGenerator(p)) {
      cfg.state.draggingGenerator = true;
      cfg.state.generatorDragEnded = false;
      if (Array.isArray(ripples)) ripples.length = 0; // hide ripples while dragging
      try { if (canvas.setPointerCapture) { canvas.setPointerCapture(e.pointerId); capturedId = e.pointerId; } } catch {}
      return;
    }

    // Otherwise, start block drag if a block is hit
    if (hitIx >= 0) {
      onBlockGrab(hitIx);
      const rects = getRects();
      const b = rects[hitIx];
      cfg.state.draggingBlock = { index: hitIx, offX: p.x - b.x, offY: p.y - b.y };
      cfg.state.dragIndex = hitIx;
      try { if (canvas.setPointerCapture) { canvas.setPointerCapture(e.pointerId); capturedId = e.pointerId; } } catch {}
      return;
    }

    // Empty-space click re-places generator (only if far from generator and not on a block)
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
      const rects = getRects();
      const b = rects[db.index];
      const newX = clamp(p.x - db.offX, EDGE, vw() - EDGE - (b.w ?? b.size));
      const newY = clamp(p.y - db.offY, EDGE, vh() - EDGE - (b.h ?? b.size));
      onBlockDrag(db.index, newX, newY);
      return;
    }
  }

  function pointerUp(e) {
    const wasDraggingBlock = !!cfg.state.draggingBlock; const wasIndex = wasDraggingBlock ? cfg.state.draggingBlock.index : -1;
    if (cfg.state.draggingGenerator) {
      cfg.state.draggingGenerator = false;
      cfg.state.generatorDragEnded = true;
    }
    cfg.state.draggingBlock = null;
    if (wasDraggingBlock && wasIndex>=0) onBlockDrop(wasIndex);
    cfg.state.dragIndex = -1;
    if (capturedId != null && canvas.hasPointerCapture) {
      try { if (canvas.hasPointerCapture(capturedId)) canvas.releasePointerCapture(capturedId); } catch {}
    }
    capturedId = null;
  }

  return { pointerDown, pointerMove, pointerUp };
}
