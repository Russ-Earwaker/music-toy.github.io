// src/ripplesynth-input.js (rebuild)
export function makePointerHandlers(cfg) {
  const { canvas, vw, vh, EDGE, blocks, ripples, generatorRef, clamp, getCanvasPos } = cfg;
  cfg.state = cfg.state || {};
  let capturedId = null;

  function posFromEvent(e) {
    const el = (e.currentTarget && e.currentTarget.getBoundingClientRect) ? e.currentTarget : canvas;
    const r = el.getBoundingClientRect();
    const cx = (e.touches?.[0]?.clientX ?? e.clientX);
    const cy = (e.touches?.[0]?.clientY ?? e.clientY);
    return { x: cx - r.left, y: cy - r.top };
  }

  function findHitBlock(p) {
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return b;
    }
    return null;
  }

  function nearGenerator(p, r = 20){
    const dx = p.x - generatorRef.x, dy = p.y - generatorRef.y;
    return (dx*dx + dy*dy) <= r*r;
  }

  function addRippleAt(x,y){
    ripples.push({ startTime: performance.now()*0.001, speed: 120, x, y, fired: new Set() });
  }

  function pointerDown(e){
    // suppress click-through after zoom if needed
    const p = posFromEvent(e);
    cfg.state.dragOff = { x:0, y:0 };
    let drag = null;

    // Place/move generator
    if (!generatorRef.x && !generatorRef.y && (generatorRef.placed === undefined || generatorRef.placed === false)){
      generatorRef.place(clamp(p.x, EDGE, vw()-EDGE), clamp(p.y, EDGE, vh()-EDGE));
      return;
    }

    const hit = findHitBlock(p);
    if (hit){
      drag = hit;
      cfg.state.dragOff.x = p.x - hit.x;
      cfg.state.dragOff.y = p.y - hit.y;
    } else if (nearGenerator(p, 16)) {
      drag = { __generator: true, w: 0, h: 0 };
      cfg.state.dragOff.x = p.x - generatorRef.x;
      cfg.state.dragOff.y = p.y - generatorRef.y;
    } else {
      // move generator to click and start fresh ripple
      generatorRef.place(clamp(p.x, EDGE, vw()-EDGE), clamp(p.y, EDGE, vh()-EDGE));
      return;
    }

    cfg.state.draggingBlock = drag;
    if (canvas.setPointerCapture && e.pointerId != null) {
      try { canvas.setPointerCapture(e.pointerId); capturedId = e.pointerId; } catch {}
    }
  }

  function pointerMove(e){
    if (!cfg.state.draggingBlock) return;
    const p = posFromEvent(e);
    const b = cfg.state.draggingBlock;
    if (b.__generator){
      // stop ongoing ripples while moving
      ripples.length = 0;
      const nx = clamp(p.x - cfg.state.dragOff.x, EDGE, vw() - EDGE);
      const ny = clamp(p.y - cfg.state.dragOff.y, EDGE, vh() - EDGE);
      generatorRef.set(nx, ny);
    } else {
      b.x = clamp(p.x - cfg.state.dragOff.x, EDGE, vw() - EDGE - b.w);
      b.y = clamp(p.y - cfg.state.dragOff.y, EDGE, vh() - EDGE - b.h);
      // update its rest to current so it doesn't spring back while dragging
      b.rx = b.x; b.ry = b.y;
    }
  }

  function pointerUp(e){
    cfg.state.draggingBlock = null;
    if (capturedId != null && canvas.hasPointerCapture){
      try { if (canvas.hasPointerCapture(capturedId)) canvas.releasePointerCapture(capturedId); } catch {}
    }
    capturedId = null;
  }

  return { pointerDown, pointerMove, pointerUp };
}
