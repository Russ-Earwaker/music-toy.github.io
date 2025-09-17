// src/bouncer-render.js
const __DBG = (globalThis.BOUNCER_DBG_LEVEL|0)||0; const __d=(lvl,...a)=>{ if(__DBG>=lvl) console.log(...a); };
// Encapsulates the Bouncer draw loop to keep bouncer.main.js concise.
import { drawBlock } from './toyhelpers.js';
import { isRunning } from './audio-core.js';

export function createBouncerDraw(env){
  const {
    panel, canvas, ctx, sizing, resizeCanvasForDPR, renderScale, physW, physH, EDGE,
    ensureEdgeControllers, edgeControllers, blockSize, blocks, handle,
    particles, drawEdgeBondLines, ensureAudioContext, noteList,
    drawEdgeDecorations, edgeFlash,
    stepBouncer, buildStateForStep, applyFromStep,
    getBall, lockPhysWorld, getAim, spawnBallFrom,
    velFrom, ballR, updateLaunchBaseline
  } = env;

  let lastCssW = 0, lastCssH = 0;
  const ballTrail = []; let lastBallPos = null; let teleportGuard = false;
  const sparks = [];
  // Local state for flash animations, to survive state rebuilds from the physics engine.
  const blockFlashes = [];
  const edgeFlashes = [];
  let wasActiveInChain = false;

  let prevNow = 0;
  let lastBeat = -1; let lastBar = -1;
  let didInit = false;

  function draw(){
    // Always ensure backing store matches CSS size for crisp rendering
    try{ resizeCanvasForDPR(canvas, ctx); }catch{}
    // Track CSS size (optional diagnostics)
    const cssW = Math.max(1, Math.round(canvas.clientWidth || 0));
    const cssH = Math.max(1, Math.round(canvas.clientHeight || 0));
    lastCssW = cssW; lastCssH = cssH;

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
      // Decay local flash values for animation. The physics step sets flash to 1.0 on hit.
      for (let i = 0; i < (blocks?.length || 0); i++) { blockFlashes[i] = Math.max(0, (blockFlashes[i] || 0) - 0.08); }
      for (let i = 0; i < (edgeControllers?.length || 0); i++) { edgeFlashes[i] = Math.max(0, (edgeFlashes[i] || 0) - 0.08); }

      // Check if in advanced/zoomed view for showing note labels
      const isAdv = !!canvas.closest('.toy-zoomed');

      // Draw with the 'button' style and the corrected color/animation logic
      if (blocks) {
        blocks.forEach((b, i) => {
          if (!b) return;
          drawBlock(ctx, b, {
            variant: 'button', active: b.active !== false, flash: blockFlashes[i] || 0,
            noteLabel: isAdv ? (noteList[b.noteIndex] || '') : null, showArrows: isAdv,
          });
        });
      }
      if (edgeControllers) {
        edgeControllers.forEach((c, i) => {
          if (!c) return;
          drawBlock(ctx, c, {
            variant: 'button', active: c.active !== false, flash: edgeFlashes[i] || 0,
            noteLabel: isAdv ? (noteList[c.noteIndex] || '') : null, showArrows: isAdv,
          });
        });
      }
    }catch(e){ console.error('[bouncer-render] draw blocks failed:', e); }

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
      } else {
        // If no ball, clear the trail
        if (ballTrail.length > 0) ballTrail.length = 0;
        lastBallPos = null;
      }
      // step sparks
      for (let i=sparks.length-1;i>=0;i--){
        const s = sparks[i]; s.x += s.vx; s.y += s.vy; s.life -= 1;
        if (s.life<=0) sparks.splice(i,1);
      }
    }catch{}

    // Draw neon trail and sparks
    try{
      const b = getBall ? getBall() : env.ball;
      if (b && !teleportGuard && ballTrail.length > 1) {
        ctx.beginPath();
        ctx.moveTo(ballTrail[0].x, ballTrail[0].y);
        for (let i = 1; i < ballTrail.length; i++) {
          ctx.lineTo(ballTrail[i].x, ballTrail[i].y);
        }

        // Create a gradient that spans the entire trail
        const first = ballTrail[0];
        const last = ballTrail[ballTrail.length - 1];
        const grad = ctx.createLinearGradient(first.x, first.y, last.x, last.y);

        // Blue at the tail (start of array), green at the ball (end of array)
        grad.addColorStop(0, 'rgba(0,120,255,0.0)'); // Transparent Blue at tail
        grad.addColorStop(1, 'rgba(0,255,200,0.85)'); // Green at head (ball)

        ctx.strokeStyle = grad;
        ctx.lineWidth = b.r * 2; // Same width as the ball
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
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
        // The main draw loop handles the visual decay of edge flashes.
        const f = edgeFlash;
        f.top = Math.max(0, f.top - 0.12);
        f.bot = Math.max(0, f.bot - 0.12);
        f.left = Math.max(0, f.left - 0.12);
        f.right = Math.max(0, f.right - 0.12);
      }
    }catch{}

    // Step physics if this toy is active in a chain.
    try {
        const ac = ensureAudioContext();
        const now = ac ? ac.currentTime : 0;
        const S = buildStateForStep(now, prevNow);

        // Only step physics if the toy is active in the chain.
        const isActiveInChain = panel.dataset.chainActive === 'true';
        if (isActiveInChain) {
            stepBouncer(S);
        }

        // Apply any state changes from the physics step.
        applyFromStep(S);

        // After the physics step, capture any flash events it generated and store
        // them in our local animation state arrays.
        if (S.blocks) {
            S.blocks.forEach((b_step, i) => {
                if (b_step && b_step.flash > 0) {
                    blockFlashes[i] = b_step.flash;
                    b_step.flash = 0; // Consume the flash event
                }
            });
        }
        if (S.edgeControllers) {
            S.edgeControllers.forEach((c_step, i) => {
                if (c_step && c_step.flash > 0) {
                    edgeFlashes[i] = c_step.flash;
                    c_step.flash = 0; // Consume the flash event
                }
            });
        }
        prevNow = now;
    } catch(e) { console.warn('[bouncer-render] step failed', e); }

    requestAnimationFrame(draw);
  }

  return draw;
}
