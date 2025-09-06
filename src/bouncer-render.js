// src/bouncer-render.js
const __DBG = (globalThis.BOUNCER_DBG_LEVEL|0)||0; const __d=(lvl,...a)=>{ if(__DBG>=lvl) console.log(...a); };
// Encapsulates the Bouncer draw loop to keep bouncer.main.js concise.
import { drawBlock } from './toyhelpers.js';

export function createBouncerDraw(env){
  const {
    canvas, ctx, sizing, resizeCanvasForDPR, renderScale, physW, physH, EDGE,
    ensureEdgeControllers, edgeControllers, blockSize, blocks, handle,
    particles, drawEdgeBondLines, ensureAudioContext, noteList,
    drawEdgeDecorations, edgeFlash,
    stepBouncer, buildStateForStep, applyFromStep, updateLaunchBaseline,
    getBall, lockPhysWorld, getAim, spawnBallFrom
  } = env;

  let lastCssW = 0, lastCssH = 0;
  const ballTrail = []; let lastBallPos = null; let teleportGuard = false;
  const sparks = [];
  // Local state for flash animations, to survive state rebuilds from the physics engine.
  const blockFlashes = [];
  const edgeFlashes = [];

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
      // Ensure S.ball mirrors the live ball just before step (belt-and-braces)
      try {
        const liveBall = getBall ? getBall() : null;
        if (liveBall) S.ball = liveBall;
        if (liveBall && !(window.__BR_seen)) {
          window.__BR_seen = true;
          if ((globalThis.BOUNCER_DBG_LEVEL|0)>=2) console.log('[bouncer-render] first-seen ball pre-step');
        }
        if (window && window.BOUNCER_LOOP_DBG) {
          window.__BR_dbg = (window.__BR_dbg||0) + 1;
          if((globalThis.BOUNCER_DBG_LEVEL|0)>=3) console.log('[bouncer-render] pre-step hasBall=', !!S.ball, 'pre ll:', !!S.lastLaunch, 'nla:', S.nextLaunchAt);
      try{ if (!S.ball && !S.lastLaunch && window && window.BOUNCER_AUTOSPAWN===true) { const ac= S.ensureAudioContext? S.ensureAudioContext(): null; const now= ac?ac.currentTime:0; if (!S.__autoSpawnAt) S.__autoSpawnAt = now + 0.6; if (now >= S.__autoSpawnAt && typeof S.spawnBallFrom==='function'){   const cx = Math.max(S.EDGE+S.ballR()+4, Math.min(S.worldW()-S.EDGE-S.ballR()-4, S.worldW()/2));   const cy = Math.max(S.EDGE+S.ballR()+4, Math.min(S.worldH()-S.EDGE-S.ballR()-4, S.worldH()/2));   S.spawnBallFrom({ x:cx, y:cy, vx: 3.9, vy: 2.6, r: S.ballR() });   console.log('[bouncer-render] AUTOSPAWN'); } } }catch(e){}
        }
      } catch(e){}

      // Fallback: if there's no live ball but we have a lastLaunch,
      // and we're past nextLaunchAt (or it was never set), re-spawn once.
      try {
        const ac2 = ensureAudioContext ? ensureAudioContext() : null;
        const now2 = ac2 ? ac2.currentTime : 0;
        if (!S.ball && S.lastLaunch && (S.nextLaunchAt==null || now2 >= (S.nextLaunchAt - 0.01))) {
          if (typeof spawnBallFrom === 'function') {
            spawnBallFrom(S.lastLaunch);
            S.__justSpawnedUntil = now2 + 0.15;
            if ((globalThis.BOUNCER_DBG_LEVEL|0)>=2) console.log('[bouncer-render] fallback spawn fired');
          }
        }
      } catch(e) { try{console.warn('[bouncer-render] fallback spawn error', e);}catch{} }


      // Loop recorder: detect new bar and let main decide record/replay
      try {
        if (S && typeof S.getLoopInfo==='function' && S.visQ && S.visQ.loopRec && typeof S.onNewBar==='function'){
          const li = S.getLoopInfo();
          const anchor = (S.visQ.loopRec && S.visQ.loopRec.anchorStartTime) ? S.visQ.loopRec.anchorStartTime : li.loopStartTime;
          const k  = Math.floor(Math.max(0, (li.now - anchor) / li.barLen));
          if (S.visQ.loopRec.lastBarIndex !== k){
            S.onNewBar(li, k);
          }
        }
      } catch(e) { try{ if ((globalThis.BOUNCER_DBG_LEVEL|0)>=2) console.warn('[bouncer-render] onNewBar error', e);}catch{} }

      // Loop recorder: schedule replay once per bar (robust timing)
      try {
        if (window && window.BOUNCER_LOOP_DBG) {
          const _lr = S.visQ && S.visQ.loopRec;
          if (_lr) { if ((globalThis.BOUNCER_DBG_LEVEL|0)>=2) console.log('[bouncer-rec] pre', 'mode=', _lr.mode, 'patLen=', (_lr.pattern?_lr.pattern.length:0), 'scheduled=', _lr.scheduledBarIndex); }
          else if((globalThis.BOUNCER_DBG_LEVEL|0)>=2) console.log('[bouncer-rec] pre', 'no lr');
        }
        const lr = S.visQ && S.visQ.loopRec;
        if (lr && lr.mode === 'replay' && typeof S.getLoopInfo==='function'){
          const li = S.getLoopInfo();
          const nowT = li.now;
          const anchor = (lr && lr.anchorStartTime) ? lr.anchorStartTime : li.loopStartTime;
          const k = Math.floor(Math.max(0, (nowT - anchor) / li.barLen));
          if (Array.isArray(lr.pattern) && lr.pattern.length>0){
            const base = anchor + k*li.barLen;
            const baseNext = base + li.barLen;
            // base computed above; reused here
            // baseNext computed above; reused here
            const beatDur = li.barLen / 4;
            if ((globalThis.BOUNCER_DBG_LEVEL|0)>=2) console.log('[bouncer-rec] about to schedule bar', k, 'base', base.toFixed(3), 'nowT', nowT.toFixed(3));

// Just-in-time scheduling with short lookahead so state changes can cancel playback
const LOOKAHEAD = 0.03; // seconds — reduce overlap risk without starving scheduling
// Reset per-bar scheduled set and schedule entire bar deterministically when bar advances
if (lr.scheduledBarIndex !== k){
  lr.scheduledBarIndex = k;
  if (!lr.scheduledKeys || typeof lr.scheduledKeys.clear !== 'function') lr.scheduledKeys = new Set();
  else lr.scheduledKeys.clear();
  if ((globalThis.BOUNCER_DBG_LEVEL|0) >= 2) console.log('[bouncer-rec] new bar', k, 'mode', lr.mode, 'patLen', lr.pattern?.length||0);
  const __seen = new Set();
  const __evs = (Array.isArray(lr.pattern)?lr.pattern:[]).filter(ev=>{
    const keySeen = ev && ev.note ? (ev.note + '@' + (Math.round(((ev.offset||0))*16)/16)) : '';
    if (__seen.has(keySeen)) return false; __seen.add(keySeen); return true; });
  for (const ev of __evs){
    if (!ev || !ev.note) continue;
    const offBeats = Math.max(0, ev.offset||0);
    let when = base + offBeats * beatDur;
    if (when < nowT - 0.01) when = baseNext + offBeats * beatDur;
    const key = k + '|' + ev.note + '|' + (Math.round(offBeats*16)/16);
    if (!lr.scheduledKeys.has(key)){
      try { S.triggerInstrumentRaw ? S.triggerInstrumentRaw(S.instrument, ev.note, when) : S.triggerInstrument(S.instrument, ev.note, when); }
      catch(e){ try{ if ((globalThis.BOUNCER_DBG_LEVEL|0)>=2) console.warn('[bouncer-replay] schedule fail', e); }catch{} }
      lr.scheduledKeys.add(key);
    }
  }
}

          }
        }
      }catch(e){}
      stepBouncer(S);
      applyFromStep && applyFromStep(S);

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
    }catch{}

    requestAnimationFrame(draw);
  }

  return draw;
}
