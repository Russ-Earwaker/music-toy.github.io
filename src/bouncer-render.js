// src/bouncer-render.js
// Encapsulates the Bouncer draw loop to keep bouncer.main.js concise.

export function createBouncerDraw(env){
  const {
    canvas, ctx, sizing, resizeCanvasForDPR, renderScale, physW, physH, EDGE,
    ensureEdgeControllers, edgeControllers, blockSize, blocks, handle,
    particles, drawEdgeBondLines, ensureAudioContext, noteList, drawBlocksSection,
    drawEdgeDecorations,
    stepBouncer, buildStateForStep, applyFromStep, updateLaunchBaseline,
    getBall, lockPhysWorld
  } = env;

  let lastCssW = 0, lastCssH = 0;
  const ballTrail = [];
  let prevNow = 0;
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

    // Reset transform and apply world→render scale then zoom
    try{ ctx.setTransform(1,0,0,1,0,0); }catch{}
    try{ ctx.clearRect(0,0,canvas.width,canvas.height); }catch{}
    const rs = renderScale();
    const z  = 1;
    try{ ctx.scale((rs.sx||1), (rs.sy||1)); }catch{}
    try{ ctx.translate(rs.tx||0, rs.ty||0); }catch{}

    const w = physW(), h = physH();

    // Maintain edge controllers for current world size
    try{ ensureEdgeControllers(w, h); }catch{}

    // Harmonize edge controller size to match floating cubes
    try{
      for (const c of edgeControllers){
        if (c){ c.w = blockSize(); c.h = blockSize(); }
      }
    }catch{}

    // Background particles
    try{
      particles && particles.step(1/60, getBall ? getBall() : env.ball);
      particles && particles.draw(ctx);
    }catch{}

    // Decorative bonds along the edge
    try{ drawEdgeBondLines(ctx, w, h, EDGE, edgeControllers); }catch{}

    // Draw blocks + edge controllers
    try{
      const ac2 = ensureAudioContext();
      const now2 = (ac2 ? ac2.currentTime : 0);
      drawBlocksSection(ctx, blocks, 0, 0, null, 1, noteList, sizing, null, null, now2);
      drawBlocksSection(ctx, edgeControllers, 0, 0, null, 1, noteList, sizing, null, null, now2);
    }catch{}

    // Draw aim line
    try{
      const A = env.getAim ? env.getAim() : null;
      if (A && A.active){
        ctx.beginPath(); ctx.moveTo(A.sx, A.sy); ctx.lineTo(A.cx, A.cy);
        ctx.globalAlpha = 0.7; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5; ctx.setLineDash([5,4]); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
    }catch{}

    // Draw handle (ball source)
    try{
      if (handle){
        const rH = Math.max(4, 6);
        ctx.beginPath();
        ctx.arc(handle.x, handle.y, rH, 0, Math.PI*2);
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }catch{}

    // Update trail
    try{
      const b = getBall ? getBall() : env.ball;
      if (b){ ballTrail.push({x:b.x, y:b.y}); if (ballTrail.length>48) ballTrail.shift(); }
    }catch{}

    // Draw trail
    try{
      if (ballTrail.length>1){
        ctx.beginPath();
        for (let i=1;i<ballTrail.length;i++){
          const a=i/(ballTrail.length-1);
          ctx.globalAlpha = 0.15 + 0.35*a;
          ctx.moveTo(ballTrail[i-1].x, ballTrail[i-1].y);
          ctx.lineTo(ballTrail[i].x, ballTrail[i].y);
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth=1; ctx.stroke(); ctx.globalAlpha = 1;
      }
    }catch{}

    // Draw ball
    try{
      const b = getBall ? getBall() : env.ball;
      if (b){
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r || 6, 0, Math.PI*2);
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }catch{}

    // Edge decorations
    

    // Edge flash overlay
    try{
      if (edgeFlash){
        const w = physW(), h = physH();
        const f = edgeFlash;
        const lw = Math.max(1, EDGE*0.6);
        ctx.save();
        ctx.lineWidth = lw;
        ctx.strokeStyle = 'rgba(255,140,0,0.85)';
        if (f.top>0){ ctx.globalAlpha = f.top; ctx.beginPath(); ctx.moveTo(EDGE, EDGE); ctx.lineTo(w-EDGE, EDGE); ctx.stroke(); f.top = Math.max(0, f.top - 0.08); }
        if (f.bot>0){ ctx.globalAlpha = f.bot; ctx.beginPath(); ctx.moveTo(EDGE, h-EDGE); ctx.lineTo(w-EDGE, h-EDGE); ctx.stroke(); f.bot = Math.max(0, f.bot - 0.08); }
        if (f.left>0){ ctx.globalAlpha = f.left; ctx.beginPath(); ctx.moveTo(EDGE, EDGE); ctx.lineTo(EDGE, h-EDGE); ctx.stroke(); f.left = Math.max(0, f.left - 0.08); }
        if (f.right>0){ ctx.globalAlpha = f.right; ctx.beginPath(); ctx.moveTo(w-EDGE, EDGE); ctx.lineTo(w-EDGE, h-EDGE); ctx.stroke(); f.right = Math.max(0, f.right - 0.08); }
        ctx.restore(); ctx.globalAlpha=1;
      }
    }catch{}
    
    // Continue
    

    // Step physics & schedule
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
