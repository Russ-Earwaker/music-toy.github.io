  const canvas = (host.querySelector && (host.querySelector('.rippler-canvas') || host.querySelector('canvas'))) || (function(){
    const c = document.createElement('canvas');
    c.className = 'rippler-canvas';
  const ctx = canvas.getContext('2d', { alpha:false });
  const ui = initToyUI(shell, { toyName: 'Rippler', defaultInstrument: 'kalimba' });

  // --- Sizing ---
  const sizing = initToySizing(shell, canvas, ctx, { squareFromWidth: true });
  const vw = sizing.vw, vh = sizing.vh;

  // --- World ---
  function makeBlocks(n=5){
    const s = BASE_BLOCK_SIZE;
    const arr = [];
    for (let i=0;i<n;i++){
      arr.push({ x: EDGE+10, y: EDGE+10, w: s, h: s, noteIndex: randomPent(), activeFlash: 0, flashAt: null, cooldownUntil: 0 });
    }
    return arr;
  }
  let blocks = makeBlocks(5);
  randomizeRects(blocks, vw(), vh(), EDGE);

  // Generator (user-placed ripple center)
  let generator = null; // { x,y, anchorTime:number, nextTime:number|null }

  // Ripples (for visuals only)
  const ripples = []; // { startTime:number, firedFor:Set<number> }
  let lastLoopStartTime = 0;
  let gridEpoch = null; // stable quantization origin (first loop start)
  let lastQueuedTime = -1; // for de-dup only

  // Recording membership & scheduler state
  let enrolled = new Set();         // blocks included in the recorded loop
  let rejoinNextLoop = new Set();   // blocks to rejoin on next loop after drag
  let scheduledThisLoop = new Set();// which blocks have been scheduled for the current loop
  let currentLoopRippleStart = null;// start time of the ripple for this loop
  const LOOKAHEAD = 0.02;           // seconds of scheduling lookahead

    const p = getCanvasPos(canvas, e);

    // If no generator: place immediately (ignore blocks)
    if (!generator){
      generator = { x: clamp(p.x, EDGE, vw()-EDGE), y: clamp(p.y, EDGE, vh()-EDGE), anchorTime: 0, nextTime: null };
    const p = getCanvasPos(canvas, e);
    if (draggingGen && generator){
      generator.x = clamp(p.x - dragOff.x, EDGE, vw()-EDGE);
      generator.y = clamp(p.y - dragOff.y, EDGE, vh()-EDGE);
      ripples.length = 0; // clear while moving
      e.preventDefault(); return;
    }
    if (draggingBlock){
      draggingBlock.x = clamp(p.x - dragOff.x, EDGE, vw()-EDGE - draggingBlock.w);
      draggingBlock.y = clamp(p.y - dragOff.y, EDGE, vh()-EDGE - draggingBlock.h);
      e.preventDefault(); return;
    }
  }

  function pointerUp(){
    if (draggingGen && generator){
  canvas.addEventListener('pointerdown', pointerDown);
  window.addEventListener('pointermove', pointerMove);
  window.addEventListener('pointerup', pointerUp);
  window.addEventListener('pointercancel', pointerUp);
  window.addEventListener('blur', pointerUp);

  // --- Draw & visuals ---
  let lastDrawTime = 0;
  function draw(){
    resizeCanvasForDPR(canvas, ctx);
    ctx.clearRect(0,0,vw(),vh());
    ctx.fillStyle = '#0b0f15';
    ctx.fillRect(0,0,vw(),vh());
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.strokeRect(0.5,0.5,vw()-1,vh()-1);

    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    for (let i = ripples.length-1; i>=0; i--){
      const rp = ripples[i];
      const radius = Math.max(0, (now - rp.startTime) * speed);
      const cornerMax = Math.max(
        Math.hypot(cx - 0,    cy - 0),
        Math.hypot(cx - vw(), cy - 0),
        Math.hypot(cx - 0,    cy - vh()),
        Math.hypot(cx - vw(), cy - vh())
      );
      if (radius > cornerMax + 50){ ripples.splice(i,1); continue; }
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI*2); ctx.stroke();
    }
    ctx.restore();

    // Visual hits using crossing-time; if the block is being dragged, also trigger on-the-fly hit
    for (const rp of ripples){
      const r0 = Math.max(0, (prev - rp.startTime) * speed);
      const r1 = Math.max(0, (now  - rp.startTime) * speed);
      for (let bi=0; bi<blocks.length; bi++){
        const b = blocks[bi];
        const bx = b.x + b.w/2, by = b.y + b.h/2;
        const dist = Math.hypot(bx - cx, by - cy);
        const band = Math.max(8, Math.min(b.w, b.h) * 0.25);
        const crossed = (dist + band >= r0) && (dist - band <= r1);
        if (crossed){
          if (!rp.firedFor) rp.firedFor = new Set();
          if (!rp.firedFor.has(bi)){
            rp.firedFor.add(bi);
            b.cooldownUntil = now + HIT_COOLDOWN;
            // visual flash is now synced to audio, not ripple-crossing
            // Live-hit if not enrolled (e.g., just released) or currently dragging
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.35 * b.activeFlash) + ')';
        ctx.lineWidth = 2 + 3 * b.activeFlash;
        ctx.strokeRect(b.x - 2*b.activeFlash, b.y - 2*b.activeFlash, b.w + 4*b.activeFlash, b.h + 4*b.activeFlash);
        ctx.restore();
        b.activeFlash = Math.max(0, b.activeFlash - 0.06);
      }
    }

    
    // Anchor marker
    if (generator){
      ctx.save();
      ctx.strokeStyle = '#ffd95e';
      ctx.fillStyle = 'rgba(255,217,94,0.20)';
      ctx.lineWidth = 2;
      // ring
      ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      // crosshair
      ctx.beginPath();
      ctx.moveTo(cx-8, cy); ctx.lineTo(cx+8, cy);
      ctx.moveTo(cx, cy-8); ctx.lineTo(cx, cy+8);
      ctx.stroke();
      ctx.restore();
    }
// Debug overlay
    if (DEBUG){
      ctx.save();
      ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      const lines = [
        'now: ' + now.toFixed(3),
        'loopStart: ' + (lastLoopStartTime? lastLoopStartTime.toFixed(3) : '—'),
        'epoch: ' + (gridEpoch!=null ? gridEpoch.toFixed(3) : '—'),
        'anchor: ' + (generator && generator.anchorTime ? generator.anchorTime.toFixed(3) : '—'),
        'nextTime: ' + (generator && generator.nextTime != null ? generator.nextTime.toFixed(3) : '—'),
        'loopRippleStart: ' + (currentLoopRippleStart!=null ? currentLoopRippleStart.toFixed(3) : '—'),
      ];
      for (let i=0;i<lines.length;i++) ctx.fillText(lines[i], 8, 14 + i*14);
      ctx.restore();
    }

    // Determine current loop start from anchor and roll state
    const t0 = getCurrentLoopStart(now);
    if (t0 != null){
      // If we've entered a new loop (or just placed), reset per-loop scheduling
      if (currentLoopRippleStart == null || Math.abs(t0 - currentLoopRippleStart) > 1e-4){
        currentLoopRippleStart = t0;
        scheduledThisLoop.clear();
        if (rejoinNextLoop.size){ rejoinNextLoop.forEach(i => enrolled.add(i)); rejoinNextLoop.clear(); }
        // enqueue visual ripple (one per loop)
        if (Math.abs((lastQueuedTime ?? -1) - t0) > 1e-4) enqueueRippleAt(t0);
      }
      // Keep nextTime in sync for overlay
      generator.nextTime = t0 + (NUM_STEPS * stepSeconds());
      // JIT schedule from the recorded loop
      scheduleDueHits(now);
    }
lastDrawTime = now;
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  // --- Panel events ---
  panel.addEventListener('toy-zoom', (e)=>{
    const ratio = sizing.setZoom(!!(e?.detail?.zoomed));
    if (ratio !== 1){
      blocks.forEach(b => { b.x *= ratio; b.y *= ratio; b.w *= ratio; b.h *= ratio; });
      if (generator){ generator.x *= ratio; generator.y *= ratio; }
      recalcBlockPhases();
    }
  });

  panel.addEventListener('toy-random', ()=>{
    randomizeRects(blocks, vw(), vh(), EDGE);
    for (const b of blocks){ b.noteIndex = randomPent(); b.activeFlash = 0; b.flashAt = null; }
    // Keep the generator + anchor; just update the recording to match new geometry
    recalcBlockPhases();
    enrolled = new Set(blocks.map((_,i)=>i));
    rejoinNextLoop.clear();
    scheduledThisLoop.clear();
    canvas.removeEventListener('pointerdown', pointerDown);
    window.removeEventListener('pointermove', pointerMove);
    window.removeEventListener('pointerup', pointerUp);
    window.removeEventListener('pointercancel', pointerUp);
    window.removeEventListener('blur', pointerUp);
  }

  return { onLoop, reset, setInstrument, destroy };
}