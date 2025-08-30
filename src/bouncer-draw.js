// Extracted draw() from bouncer.main.js (behavior-preserving)
export function createDraw(deps){
  const {
    canvas, ctx, sizing,
    state,
    helpers
  } = deps;
  const { lastCanvasW, lastCanvasH } = state;
  const {
    resizeCanvasForDPR, rescaleAll, ensureEdgeControllers,
    blockSize, ballR, drawBlocksSection, processVisQBouncer,
    ensureAudioContext, createImpactFX, makeEdgeControllers,
    mapControllersByEdge, drawEdgeBondLines, drawEdgeDecorations,
    EDGE, noteList, stepBouncer, getLoopInfo, triggerInstrument
  } = helpers;

  // Original draw body follows, minimally adapted: we reference state.* and helpers.*

function draw(){
    const sNow = sizing.scale || 1;
    // Ignore pure zoom scale for world coordinates; only respond to actual CSS size changes below
    lastScale = sNow;

    // Use CSS px for world/draw; map device buffer via DPR transform
    const cssW = Math.max(1, Math.round(canvas.clientWidth || 0));
    const cssH = Math.max(1, Math.round(canvas.clientHeight || 0));

    const cs = resizeCanvasForDPR(canvas, ctx);
    const sx = (cs.width / cssW), sy = (cs.height / cssH);
    try { ctx.setTransform(sx, 0, 0, sy, 0, 0); } catch {}

    if (!lastCanvasW) { lastCanvasW = cssW; lastCanvasH = cssH; }
    const kx = (cssW && lastCanvasW ? cssW/lastCanvasW : 1);
    const ky = (cssH && lastCanvasH ? cssH/lastCanvasH : 1);
    if (Math.abs(kx-1) > 0.001 || Math.abs(ky-1) > 0.001){ rescaleAll(kx, ky); lastCanvasW = cssW; lastCanvasH = cssH; }

    const w = cssW, h = cssH;
    ctx.fillStyle='#0b0f16'; ctx.fillRect(0,0,w,h);
ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.lineWidth=2; ctx.strokeRect(EDGE,EDGE,w-EDGE*2,h-EDGE*2);

    ensureEdgeControllers(w,h);
    for (const c of edgeControllers){ if (c){ c.w=blockSize(); c.h=blockSize(); } }
    drawEdgeBondLines(ctx, w, h, EDGE, edgeControllers);
    const ac2=ensureAudioContext(); const now2=(ac2?ac2.currentTime:0);
    drawBlocksSection(ctx, edgeControllers, 0, 0, null, 1, noteList, sizing, null, null, now2);
    drawEdgeDecorations(ctx, edgeControllers, EDGE, w, h);
    for (const c of edgeControllers){ if (c.flash>0){ c.flash*=0.85; if (c.flash<0.03) c.flash=0; } }

    for (const b of blocks){ b.w=blockSize(); b.h=blockSize(); }
    const ac=ensureAudioContext(); const now=(ac?ac.currentTime:0);
    processVisQBouncer({ visQ, fx }, now, blocks, fx, flashEdge);
    for (const b of blocks){ b.flash=Math.max(0, b.flash-0.06); }
    { const s = blockSize(); for (const b of blocks){ b.w = s; b.h = s; } }
    drawBlocksSection(ctx, blocks, 0, 0, null, 1, noteList, sizing, null, null, now);

    fx.draw(ctx);

    ctx.beginPath(); ctx.arc(handle.x, handle.y, cannonR(), 0, Math.PI*2);
    ctx.fillStyle='rgba(255,255,255,0.15)'; ctx.fill(); ctx.strokeStyle='rgba(255,255,255,0.25)'; ctx.stroke();
    if (draggingHandle && dragStart && dragCurr){ ctx.beginPath(); ctx.moveTo(handle.x,handle.y); ctx.lineTo(dragCurr.x,dragCurr.y); ctx.strokeStyle='rgba(255,255,255,0.25)'; ctx.lineWidth=2; ctx.stroke(); }

    if (ball){ ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI*2); ctx.fillStyle='white'; ctx.globalAlpha=0.9; ctx.fill(); ctx.globalAlpha=1; }

    const S = {
      ball, blocks, edgeControllers, EDGE, worldW, worldH, ballR, blockSize,
      edgeFlash, ensureAudioContext, noteValue, noteList, instrument, fx,
      lastLaunch, nextLaunchAt, lastAT: prevNow, flashEdge, handle, spawnBallFrom, getLoopInfo,
      triggerInstrument: (i,n,t)=>triggerInstrument(i,n,t,'bouncer', toyId),
      BOUNCER_BARS_PER_LIFE, setNextLaunchAt, setBallOut, visQ
    };
    stepBouncer(S); visQ = S.visQ || visQ; prevNow = now;
    requestAnimationFrame(draw);
  }
}
