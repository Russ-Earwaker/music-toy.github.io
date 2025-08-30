// src/bouncer-render.js
// Encapsulates the Bouncer draw loop to keep bouncer.main.js concise.

export function createBouncerDraw(env){
  const {
    canvas, ctx, sizing, resizeCanvasForDPR, renderScale, physW, physH, EDGE,
    ensureEdgeControllers, edgeControllers, blockSize, blocks, handle,
    particles, drawEdgeBondLines, ensureAudioContext, noteList, drawBlocksSection,
    drawEdgeDecorations, edgeFlash,
    stepBouncer, buildStateForStep, applyFromStep, updateLaunchBaseline,
    getBall, lockPhysWorld, getAim
  } = env;

  let lastCssW = 0, lastCssH = 0;
  const ballTrail = []; let lastBallPos = null; let teleportGuard = false;
  const sparks = [];
  let prevNow = 0;
  let lastBeat = -1; let lastBar = -1;
  let didInit = false;

  function draw(){
    // Size canvas for DPR if CSS size changed
    const cssW = Math.max(1, Math.round(canvas.clientWidth || 0));
    const cssH = Math.max(1, Math.round(canvas.clientHeight || 0));
    if (cssW !== lastCssW || cssH !== lastCssH){
      try{ resizeCanvasForDPR(canvas, ctx); }catch{}
      lastCssW = cssW; lastCssH = cssH;
    }

    // First-frame init: lock world and set launch baseline
    if (!didInit){
      try{ lockPhysWorld && lockPhysWorld(); }catch{}
      try{ updateLaunchBaseline && updateLaunchBaseline(physW, physH, EDGE); }catch{}
      didInit = true;
    }

    // Reset transform and apply world→render scale
    try{ ctx.setTransform(1,0,0,1,0,0); }catch{}
    try{ ctx.clearRect(0,0,canvas.width,canvas.height); }catch{}
    const rs = renderScale();
    try{ ctx.scale((rs.sx||1), (rs.sy||1)); }catch{}
    try{ ctx.translate(rs.tx||0, rs.ty||0); }catch{}

    const w = physW(), h = physH();
    // On-beat pulse (quarter notes)
    try{
      if (typeof getLoopInfo === 'function'){
        const li = getLoopInfo();
        const beatIdx = Math.floor(li.now / Math.max(0.001, li.beatLen));
        if (beatIdx !== lastBeat){ lastBeat = beatIdx; particles && particles.onBeat && particles.onBeat(handle.x, handle.y); }
      }
    }catch{}


    // Maintain edge controllers for current world size and size them like floating cubes
    try{ ensureEdgeControllers(w, h); }catch{}
    try{ for (const c of edgeControllers){ if (c){ c.w = blockSize(); c.h = blockSize(); } } }catch{}

    // Background particles
    try{
      particles && particles.step(1/60, getBall ? getBall() : env.ball);
      particles && particles.draw(ctx);
    }catch{}

    // Edge bond decorations
    try{ drawEdgeBondLines(ctx, w, h, EDGE, edgeControllers); }catch{}

    // Aim line (neon) and spawn ring
    try{
      const A = getAim ? getAim() : null;
      if (A && A.active){
        ctx.beginPath(); ctx.moveTo(A.sx, A.sy); ctx.lineTo(A.cx, A.cy);
        const g = ctx.createLinearGradient(A.sx,A.sy,A.cx,A.cy);
        g.addColorStop(0, 'rgba(0,255,200,0.85)'); g.addColorStop(1, 'rgba(0,120,255,0.85)');
        ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.setLineDash([8,5]); ctx.stroke(); ctx.setLineDash([]);
        // spawn ring
        ctx.beginPath(); ctx.arc(A.sx, A.sy, Math.max(6, 10), 0, Math.PI*2);
        ctx.strokeStyle = 'rgba(0,255,200,0.9)'; ctx.lineWidth = 2; ctx.stroke();
      }
    }catch{}

    // Draw blocks + edge controllers
    try{
      const ac2 = ensureAudioContext();
      const now2 = (ac2 ? ac2.currentTime : 0);
      drawBlocksSection(ctx, blocks, 0, 0, null, 1, noteList, sizing, null, null, now2);
      drawBlocksSection(ctx, edgeControllers, 0, 0, null, 1, noteList, sizing, null, null, now2);
    }catch{}

    // Update trail points & sparks
    try{
      const b = getBall ? getBall() : env.ball;
      if (b){
        if (lastBallPos && (Math.abs(b.x-lastBallPos.x)>50 || Math.abs(b.y-lastBallPos.y)>50)){
          teleportGuard = true; ballTrail.length = 0;
        } else { teleportGuard = false; }
        ballTrail.push({x:b.x, y:b.y});
        if (ballTrail.length>24) ballTrail.shift();
        lastBallPos = {x:b.x,y:b.y};
        // occasional sparks
        if (Math.random() < 0.4){
          sparks.push({ x:b.x, y:b.y, vx:(Math.random()-0.5)*2, vy:(Math.random()-0.5)*2, life: 12 });
        }
      }
      // step sparks
      for (let i=sparks.length-1;i>=0;i--){
        const s = sparks[i]; s.x += s.vx; s.y += s.vy; s.life -= 1;
        if (s.life<=0) sparks.splice(i,1);
      }
    }catch{}

    // Draw neon trail and sparks
    try{
      if (!teleportGuard && ballTrail.length>1){
        for (let i=1;i<ballTrail.length;i++){
          const a = i/(ballTrail.length-1);
          const x0=ballTrail[i-1].x, y0=ballTrail[i-1].y, x1=ballTrail[i].x, y1=ballTrail[i].y;
          const g=ctx.createLinearGradient(x0,y0,x1,y1);
          g.addColorStop(0,'rgba(0,255,200,'+(0.05+0.25*a)+')');
          g.addColorStop(1,'rgba(0,120,255,'+(0.05+0.25*a)+')');
          ctx.strokeStyle=g; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y1); ctx.stroke();
        }
      }
      // sparks
      for (const s of sparks){
        ctx.globalAlpha = Math.max(0, s.life/12);
        ctx.beginPath(); ctx.arc(s.x, s.y, 1.6, 0, Math.PI*2); ctx.fillStyle='rgba(0,255,220,0.9)'; ctx.fill();
      }
      ctx.globalAlpha = 1;
    }catch{}

    // Always draw handle ring
    try{
      if (handle){ ctx.beginPath(); ctx.arc(handle.x, handle.y, 7, 0, Math.PI*2); ctx.strokeStyle='rgba(0,255,200,0.4)'; ctx.lineWidth=1; ctx.stroke(); }
    }catch{}

    // Draw ball
    try{
      const b = getBall ? getBall() : env.ball;
      if (b){
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r || 6, 0, Math.PI*2);
        ctx.globalAlpha = 0.98;
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }catch{}

    // Edge decorations and flash overlay
    try{ drawEdgeDecorations(ctx, edgeControllers, EDGE, physW(), physH()); }catch{}
    try{
      if (edgeFlash){
        const f = edgeFlash; const lw = Math.max(1, EDGE*0.6);
        ctx.save(); ctx.lineWidth = lw; ctx.strokeStyle = 'rgba(255,180,0,1)';
        if (f.top>0){ ctx.globalAlpha = f.top; ctx.beginPath(); ctx.moveTo(EDGE, EDGE); ctx.lineTo(w-EDGE, EDGE); ctx.stroke(); f.top = Math.max(0, f.top - 0.12); }
        if (f.bot>0){ ctx.globalAlpha = f.bot; ctx.beginPath(); ctx.moveTo(EDGE, h-EDGE); ctx.lineTo(w-EDGE, h-EDGE); ctx.stroke(); f.bot = Math.max(0, f.bot - 0.12); }
        if (f.left>0){ ctx.globalAlpha = f.left; ctx.beginPath(); ctx.moveTo(EDGE, EDGE); ctx.lineTo(EDGE, h-EDGE); ctx.stroke(); f.left = Math.max(0, f.left - 0.12); }
        if (f.right>0){ ctx.globalAlpha = f.right; ctx.beginPath(); ctx.moveTo(w-EDGE, EDGE); ctx.lineTo(w-EDGE, h-EDGE); ctx.stroke(); f.right = Math.max(0, f.right - 0.12); }
        ctx.restore(); ctx.globalAlpha=1;
      }
    }catch{}

    // Step physics & schedule next frame
    try{
      const ac = ensureAudioContext(); 
      const now = (ac ? ac.currentTime : 0);
      const S = buildStateForStep(now, prevNow);
      stepBouncer(S);
      applyFromStep && applyFromStep(S);
      prevNow = now;
    }catch{}

    requestAnimationFrame(draw);
  }

  return draw;
}
