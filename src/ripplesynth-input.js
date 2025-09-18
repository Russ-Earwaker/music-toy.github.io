// src/ripplesynth-input.js
console.log('[Rippler] Input module loaded (v-preview-gen)');
// Handles pointer input for the Rippler toy (placement, move, drag).
// Exposes flags on cfg.state: draggingBlock, draggingGenerator, generatorDragEnded, dragIndex
// Now supports dynamic block rects via cfg.getBlockRects() and updates via cfg.onBlockDrag(index, newX, newY).

export function makePointerHandlers(cfg) {
  const { canvas, vw, vh, EDGE, blocks = [], ripples, generatorRef, clamp, getCanvasPos } = cfg;
  const _clamp = (typeof clamp === 'function') ? clamp : ((v,min,max)=> Math.max(min, Math.min(max, v)));
  const getRects = typeof cfg.getBlockRects === 'function' ? cfg.getBlockRects : (() => blocks);
  const onBlockDrag = typeof cfg.onBlockDrag === 'function' ? cfg.onBlockDrag : (() => {});
  const onBlockTap  = typeof cfg.onBlockTap  === 'function' ? cfg.onBlockTap  : (() => {});
  const onBlockTapStd  = typeof cfg.onBlockTapStd  === 'function' ? cfg.onBlockTapStd  : (() => {});
  const isZoomed    = typeof cfg.isZoomed    === 'function' ? cfg.isZoomed    : (()=>false);
  const onBlockGrab = typeof cfg.onBlockGrab === 'function' ? cfg.onBlockGrab : (() => {});
  const onBlockDrop = typeof cfg.onBlockDrop === 'function' ? cfg.onBlockDrop : (() => {});

  cfg.state = cfg.state || {};
  cfg.state.draggingBlock = null;   // { index, offX, offY }
  cfg.state.dragIndex = -1;
  cfg.state.draggingGenerator = false;
  cfg.state.generatorDragEnded = false;
  cfg.state.draggingPreviewGenerator = false;

  let capturedId = null;

  // tap/drag thresholds
  const HOLD_DELAY_MS = 220; const DRAG_THRESHOLD = 12;
  let tapCand = null; // { index, x, y, t }

  const HANDLE_HIT_PAD = 18; // slightly tighter to avoid stealing block clicks

  const _getPos = (typeof getCanvasPos === 'function')
    ? (e)=> getCanvasPos(canvas, e)
    : (e)=>{ const r = canvas.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1; return { x:(e.clientX - r.left)*dpr, y:(e.clientY - r.top)*dpr }; };
  function posFromEvent(e){ return _getPos(e); }

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
    const hitIx = findHitBlock(p);

    // First-time placement: only on empty space (not on a block)
    if (!generatorRef.placed && e.isTrusted) {
      if (hitIx < 0) {
        const isChained = cfg.isChained ? cfg.isChained() : false;
        const transportIsRunning = (typeof cfg.isRunning === 'function') ? cfg.isRunning() : true;
        if (isChained && transportIsRunning) {
            // If running, place a preview instead of the real one.
            if (cfg.setPreviewGenerator) {
                cfg.setPreviewGenerator(p);
            }
            cfg.state.draggingPreviewGenerator = true;
        } else {
            // If not running, place the real generator immediately.
            generatorRef.place(p.x, p.y);
        }
        try { if (canvas.setPointerCapture) { canvas.setPointerCapture(e.pointerId); capturedId = e.pointerId; } } catch {}
      } else {
        // Allow dragging blocks even before a generator is placed
        const rects = getRects();
        const b = rects[hitIx];
        tapCand = { index: hitIx, x: p.x, y: p.y, t: performance.now() };
        try { if (canvas.setPointerCapture) { canvas.setPointerCapture(e.pointerId); capturedId = e.pointerId; } } catch {}
      }
      return;
    }

    // If clicking near generator and not on a block, start generator drag
    if (generatorRef.placed && hitIx < 0 && nearGenerator(p)) {
      const isActive = cfg.isActiveInChain ? cfg.isActiveInChain() : false;
      const isChained = cfg.isChained ? cfg.isChained() : false;
      const transportIsRunning = (typeof cfg.isRunning === 'function') ? cfg.isRunning() : true;

      if (isChained && transportIsRunning) {
        if (cfg.setPreviewGenerator) {
          // Initialize preview at the point of click to start the drag.
          cfg.setPreviewGenerator(p);
        }
        cfg.state.draggingPreviewGenerator = true;
      } else {
        // Default behavior: drag the real generator.
        cfg.state.draggingGenerator = true;
        cfg.state.generatorDragEnded = false;
        if (Array.isArray(ripples)) ripples.length = 0; // hide ripples while dragging
      }
      try { if (canvas.setPointerCapture) { canvas.setPointerCapture(e.pointerId); capturedId = e.pointerId; } } catch {}
      return;
    }

    // Block interaction (tap or drag begins)
    if (hitIx >= 0) {
      const rects = getRects();
      const b = rects[hitIx];
      tapCand = { index: hitIx, x: p.x, y: p.y, t: performance.now() };
      try { if (canvas.setPointerCapture) { canvas.setPointerCapture(e.pointerId); capturedId = e.pointerId; } } catch {}
      return;
    }

    // Empty-space click re-places generator (only if not on a block and far from generator)
    if (generatorRef.placed && hitIx < 0 && !nearGenerator(p)) {
      const isActive = cfg.isActiveInChain ? cfg.isActiveInChain() : false;
      const isChained = cfg.isChained ? cfg.isChained() : false;
      const transportIsRunning = (typeof cfg.isRunning === 'function') ? cfg.isRunning() : true;

      if (isChained && transportIsRunning) {
        if (cfg.setPreviewGenerator) {
          cfg.setPreviewGenerator(p);
        }
        cfg.state.draggingPreviewGenerator = true;
        try { if (canvas.setPointerCapture) { canvas.setPointerCapture(e.pointerId); capturedId = e.pointerId; } } catch {}
      } else {
        // Default behavior: move the real generator.
        const nx = _clamp(p.x, EDGE, vw() - EDGE);
        const ny = _clamp(p.y, EDGE, vh() - EDGE);
        generatorRef.set(nx, ny);
        if (Array.isArray(ripples)) ripples.length = 0;
        cfg.state.generatorDragEnded = true; // trigger a clean re-sync on pointerup
      }
      return;
    }
}

  function pointerMove(e) {
    const p = posFromEvent(e);

    if (cfg.state.draggingPreviewGenerator) {
      if (cfg.setPreviewGenerator) { cfg.setPreviewGenerator(p); }
      return;
    }

    if (cfg.state.draggingGenerator) {
      generatorRef.set(_clamp(p.x, EDGE, vw() - EDGE), _clamp(p.y, EDGE, vh() - EDGE));
      return;
    }

    if (tapCand) {
      const dt = performance.now() - tapCand.t; const dx = Math.abs(p.x - tapCand.x), dy = Math.abs(p.y - tapCand.y);
      if (dt >= HOLD_DELAY_MS || dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
        const rects = getRects(); const b = rects[tapCand.index];
        cfg.state.draggingBlock = { index: tapCand.index, offX: p.x - b.x, offY: p.y - b.y };
        cfg.state.dragIndex = tapCand.index;
        onBlockGrab(tapCand.index);
        tapCand = null;
      }
    }

    const db = cfg.state.draggingBlock;
    if (db) {
      const rects = getRects();
      const b = rects[db.index];
      const newX = _clamp(p.x - db.offX, EDGE, vw() - EDGE - (b.w ?? b.size));
      const newY = _clamp(p.y - db.offY, EDGE, vh() - EDGE - (b.h ?? b.size));
      onBlockDrag(db.index, newX, newY);
      return;
    }
  }

  function pointerUp(e) {
    const wasDraggingBlock = !!cfg.state.draggingBlock; const wasIndex = wasDraggingBlock ? cfg.state.draggingBlock.index : -1; const localTap = tapCand; tapCand = null;
    if (cfg.state.draggingPreviewGenerator) {
      cfg.state.draggingPreviewGenerator = false;
    }
    if (cfg.state.draggingGenerator) {
      cfg.state.draggingGenerator = false;
      cfg.state.generatorDragEnded = true;
    }
    cfg.state.draggingBlock = null;
    if (wasDraggingBlock && wasIndex>=0) onBlockDrop(wasIndex);
    cfg.state.dragIndex = -1;
    if (!wasDraggingBlock && localTap) {
      const p = getCanvasPos(canvas, e);
      if (isZoomed()) onBlockTap(localTap.index, p); else onBlockTapStd(localTap.index, p);
    }
    if (capturedId != null && canvas.hasPointerCapture) {
      try { if (canvas.hasPointerCapture(capturedId)) canvas.releasePointerCapture(capturedId); } catch {}
    }
    capturedId = null;
  }

  return { pointerDown, pointerMove, pointerUp };
}
