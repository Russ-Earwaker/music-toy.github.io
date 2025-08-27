import { makeEdgeControllers, drawEdgeBondLines, handleEdgeControllerEdit, mapControllersByEdge, randomizeControllers, drawEdgeDecorations } from './bouncer-edges.js';
import { stepBouncer } from './bouncer-step.js';
import { noteList, resizeCanvasForDPR } from './utils.js';
import { ensureAudioContext, getLoopInfo } from './audio-core.js';
import { triggerInstrument } from './audio-samples.js';
import { initToyUI } from './toyui.js';
import { initToySizing } from './toyhelpers-sizing.js';
import { randomizeRects, EDGE_PAD as EDGE, hitRect, whichThirdRect, drawThirdsGuides } from './toyhelpers.js';
import { drawBlocksSection } from './ripplesynth-blocks.js';
// board scale via rect baseline (rippler-style)

import { createImpactFX } from './bouncer-impact.js';
import { getPoliteDensityForToy } from './polite-random.js';
import { buildPentatonicPalette, processVisQ as processVisQBouncer } from './bouncer-actions.js';

const noteValue = (list, idx)=> list[Math.max(0, Math.min(list.length-1, (idx|0)))];
const BOUNCER_BARS_PER_LIFE = 1;
const MAX_SPEED = 700, LAUNCH_K = 0.9;
const BASE_BLOCK_SIZE = 44, BASE_CANNON_R = 10, BASE_BALL_R = 7;


function computeLaunchVelocity(hx, hy, px, py, worldW, worldH, getLoopInfo, speedFactor){
  const dx = (px - hx), dy = (py - hy);
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx / dist, ny = dy / dist;

  // Approximate frames per second
  const FPS = 60;

  // Target: cross the diagonal in ~1 bar at 100% speed
  const w = Math.max(1, worldW()) - EDGE*2, h = Math.max(1, worldH()) - EDGE*2;
  const diag = Math.max(1, Math.hypot(w, h));
  let barLen = 1.0;
  try { const li = (typeof getLoopInfo==='function') ? getLoopInfo() : null; if (li && li.barLen) barLen = li.barLen; } catch{}

  // Pixels per frame to traverse diag in 1 bar
  const basePPF = diag / (FPS * barLen);

  // Drag factor (short drags still move, long drags a bit faster but clamped)
  const dragK = Math.min(1, Math.max(0.1, dist / (diag*0.6)));

  // User speed factor (0.2..1.6) and friendly clamp (ppf band)
  const sf = Math.max(0.2, Math.min(1.6, speedFactor || 1));
  let desiredPPF = Math.min(8.0, Math.max(0.4, basePPF * sf * (0.6 + 0.6*dragK)));
  desiredPPF *= 4.0; // global speed boost x4

  return { vx: nx * desiredPPF, vy: ny * desiredPPF };
}
export function createBouncer(selector){
  const shell = (typeof selector==='string') ? document.querySelector(selector) : selector; if (!shell) return null;
  const panel = shell.closest('.toy-panel') || shell;
  const ui = initToyUI(panel, { toyName: 'Bouncer', defaultInstrument: 'Retro Square' }) || {};
  let instrument = ui.instrument; panel.addEventListener('toy-instrument', (e)=>{ instrument = (e?.detail?.value)||instrument; });
  let speedFactor = parseFloat((panel?.dataset?.speed)||'0.60'); // 0.60 = calmer default
  const toyId = (panel?.dataset?.toy || 'bouncer').toLowerCase();

  const host = panel.querySelector('.toy-body') || panel;
  const canvas = document.createElement('canvas'); canvas.style.width='100%'; canvas.style.display='block';canvas.style.height='100%'; host.appendChild(canvas);
  try{ canvas.removeAttribute('data-lock-scale'); canvas.style.transform=''; }catch{};
  const ctx = canvas.getContext('2d', { alpha:false });
  const sizing = initToySizing(panel, canvas, ctx, { squareFromWidth: true });

  // Speed control (UI)
        // Speed control dock (appears only in zoom), placed under the canvas so it never overlaps play space
  const hostForDock = panel.querySelector('.toy-body') || panel;
  const spDock = document.createElement('div');
  Object.assign(spDock.style, {
    display: 'none', width: '100%', marginTop: '8px',
    display: 'none', justifyContent: 'flex-end', alignItems: 'center', gap: '8px',
    pointerEvents: 'auto'
  });
  const spLabel = document.createElement('span'); spLabel.textContent='Speed'; spLabel.style.fontSize='12px'; spLabel.style.opacity='0.8';
  const spVal = document.createElement('span'); spVal.style.fontSize='12px'; spVal.style.opacity='0.7';
  const sp = document.createElement('input'); sp.type='range'; sp.min='0.2'; sp.max='1.6'; sp.step='0.05'; sp.value=String(speedFactor); sp.style.width='140px';
  ;['pointerdown','pointermove','pointerup','click','mousedown','mouseup'].forEach(t=> sp.addEventListener(t, ev=> ev.stopPropagation()));
  spVal.textContent = `${Math.round(speedFactor*100)}%`;
  sp.addEventListener('input', ()=>{ speedFactor = Math.max(0.2, Math.min(1.6, parseFloat(sp.value)||1)); spVal.textContent = `${Math.round(speedFactor*100)}%`; panel.dataset.speed = String(speedFactor); });
  spDock.append(spLabel, sp, spVal);
  try { hostForDock.appendChild(spDock); } catch {}
  const updateSpeedVisibility = ()=>{ const zoomed = (sizing?.scale||1) > 1.01; spDock.style.display = zoomed ? 'flex' : 'none'; };
  // Update on zoom, both immediately and in next frame to absorb scale updates
  panel.addEventListener('toy-zoom', (ev)=>{ try{ sizing.setZoom(ev?.detail?.zoomed); }catch{} });
  // Initialize once
  updateSpeedVisibility();

  const worldW = ()=> Math.max(1, Math.floor(canvas.getBoundingClientRect().width||canvas.clientWidth||0));
  const worldH = ()=> Math.max(1, Math.floor(canvas.getBoundingClientRect().height||canvas.clientHeight||0));
  const blockSize = ()=> Math.round(BASE_BLOCK_SIZE * (sizing.scale||1));
  const cannonR  = ()=> Math.round(BASE_CANNON_R  * (sizing.scale||1));
  const ballR    = ()=> Math.round(BASE_BALL_R    * (sizing.scale||1));

  // interaction state
  let handle = { x: worldW()*0.22, y: worldH()*0.5 };
  let draggingHandle=false, dragStart=null, dragCurr=null;
  let draggingBlock=false, dragBlockRef=null, dragOffset={dx:0,dy:0};
  let zoomDragCand=null, zoomDragStart=null, zoomTapT=null;
  let tapCand=null, tapStart=null, tapMoved=false;
  let lastLaunch=null, launchPhase=0, nextLaunchAt=null, prevNow=0, ball=null;
  let visQ = []; const fx = createImpactFX(); let lastScale = sizing.scale||1;

  // edge controllers + flash
  let edgeControllers = []; const edgeFlash = { left:0, right:0, top:0, bot:0 };
  function flashEdge(which){ const m = mapControllersByEdge(edgeControllers), c = m && m[which]; if (!c || !c.active) return; if (edgeFlash[which]!==undefined) edgeFlash[which]=1.0; }

  // blocks
  const N_BLOCKS = 4;
  let blocks = Array.from({length:N_BLOCKS}, ()=>({ x:EDGE, y:EDGE, w:blockSize(), h:blockSize(), noteIndex:0, active:true, flash:0, lastHitAT:0 }));

  // seed positions + palette
  (function seed(){
    const w=worldW(), h=worldH(); const bx=Math.round(w*0.2), by=Math.round(h*0.2), bw=Math.round(w*0.6), bh=Math.round(h*0.6);
    const pal = buildPentatonicPalette(noteList, 'C4', 'minor', 1);
    for (let i=0;i<blocks.length;i++) blocks[i].noteIndex = pal[i % pal.length];
    randomizeRects(blocks, {x:bx,y:by,w:bw,h:bh}, EDGE);
  })();

  function ensureEdgeControllers(w,h){
    if (!edgeControllers.length){
      edgeControllers = makeEdgeControllers(w, h, blockSize(), EDGE, noteList);
    }else{
      const s=blockSize(), half=s/2; const map=mapControllersByEdge(edgeControllers);
      if (map.left ){ map.left .x=EDGE;        map.left .y=h/2-half; map.left .w=s; map.left .h=s; }
      if (map.right){ map.right.x=w-EDGE-s;   map.right.y=h/2-half; map.right.w=s; map.right.h=s; }
      if (map.top  ){ map.top  .x=w/2-half;   map.top  .y=EDGE;     map.top  .w=s; map.top  .h=s; }
      if (map.bot  ){ map.bot  .x=w/2-half;   map.bot  .y=h-EDGE-s; map.bot  .w=s; map.bot  .h=s; }
    }
  }

  // toy controls
  function doRandom(){
    const pr = Number(panel?.dataset?.priority || '1') || 1;
    const density = getPoliteDensityForToy(toyId, 1, pr);
    const N = blocks.length;
    const w=worldW(), h=worldH(), baseBW=Math.round(w*0.6), baseBH=Math.round(h*0.6);
    const K = Math.max(1, Math.min(N, Math.round(1 + density * (N - 1))));
    const areaScale = 0.5 + 0.5 * density; const bw=Math.max(EDGE*4, Math.round(baseBW*areaScale)), bh=Math.max(EDGE*4, Math.round(baseBH*areaScale));
    const bx = Math.round((w-bw)/2), by = Math.round((h-bh)/2);
    randomizeRects(blocks, {x:bx,y:by,w:bw,h:bh}, EDGE);
    const picks=[]; if (K>=N){ for(let i=0;i<N;i++) picks.push(i); }else{ const step=N/K; let pos=0; for(let i=0;i<K;i++){ picks.push(Math.round(pos)%N); pos+=step; } const uniq=Array.from(new Set(picks)); while(uniq.length<K){ const r = Math.floor(Math.random()*N); if(!uniq.includes(r)) uniq.push(r); } picks.length=0; picks.push(...uniq); }
    for (let i=0;i<N;i++) blocks[i].active=false; for (const i of picks) if(blocks[i]) blocks[i].active=true;
    randomizeControllers(edgeControllers, noteList);
  }
  function doReset(){ ball=null; lastLaunch=null; for(const b of blocks){ b.flash=0; b.lastHitAT=0; } if(edgeControllers){ for(const c of edgeControllers){ c.flash=0; c.lastHitAT=0; } } }
  panel.addEventListener('toy-random', doRandom);
  panel.addEventListener('toy-reset', doReset);
  panel.addEventListener('toy-clear', doReset);
  panel.addEventListener('toy-zoom', (e)=>{ sizing.setZoom && sizing.setZoom(!!e.detail.zoomed); const s=sizing.scale||1; rescaleAll(s/lastScale); lastScale=s; });

  function rescaleAll(f){
    if (!f || f===1) return;
    for (const b of blocks){ b.x=Math.round(b.x*f); b.y=Math.round(b.y*f); b.w=blockSize(); b.h=blockSize(); }
    handle.x=Math.round(handle.x*f); handle.y=Math.round(handle.y*f);
    if (ball){ ball.x*=f; ball.y*=f; ball.vx*=f; ball.vy*=f; ball.r=ballR(); }
    if (lastLaunch){ lastLaunch.vx*=f; lastLaunch.vy*=f; }
  }

  // interactions (tap-to-toggle in standard view; thirds edit in zoom)
  function localPoint(evt){ const r=canvas.getBoundingClientRect(); return { x: evt.clientX - r.left, y: evt.clientY - r.top }; }
  
  canvas.addEventListener('pointerdown', (e)=>{
    const p = localPoint(e);
    const zoomed = (sizing?.scale || 1) > 1.01;
    const hit = blocks.find(b => hitRect(p, b));
    const hitCtrl = edgeControllers.find(b => hitRect(p, b));
    if (zoomed){
      if (hit && !hit.fixed){
        zoomDragCand = hit; zoomDragStart = { x:p.x, y:p.y }; zoomTapT = whichThirdRect(hit, p.y);
        try { canvas.setPointerCapture(e.pointerId); } catch {}
        e.preventDefault(); return;
      }
      if (hitCtrl){
        const beforeI = hitCtrl.noteIndex, beforeO = hitCtrl.oct || 4;
        const ok = handleEdgeControllerEdit(hitCtrl, p.y, whichThirdRect, noteList);
        if (ok && (hitCtrl.noteIndex !== beforeI || (hitCtrl.oct||4)!==beforeO)){
          const ac = ensureAudioContext(); const now = (ac?ac.currentTime:0);
          const nm = noteValue(noteList, hitCtrl.noteIndex);
          try { triggerInstrument(instrument, nm, now+0.0005, toyId); } catch {}
        }
        return;
      }
          if (hit && !hit.fixed){ tapCand = hit; tapStart = { x:p.x, y:p.y }; tapMoved=false; dragBlockRef = hit; dragOffset = { dx: p.x - hit.x, dy: p.y - hit.y }; return; }
    } else {
      if (hit && !hit.fixed){
        tapCand = hit; tapStart = { x:p.x, y:p.y }; tapMoved = false;
        dragBlockRef = hit; dragOffset = { dx: p.x - hit.x, dy: p.y - hit.y };
        try { canvas.setPointerCapture(e.pointerId); } catch {}
        e.preventDefault(); return;
      }
      if (hitCtrl){
        hitCtrl.active = !hitCtrl.active;
        const ac = ensureAudioContext(); const now = (ac?ac.currentTime:0)+0.0005;
        if (hitCtrl.active){
          const nm = noteValue(noteList, hitCtrl.noteIndex|0);
          try { triggerInstrument(instrument, nm, now, toyId); } catch {}
        }
        try { canvas.setPointerCapture(e.pointerId); } catch {}
        e.preventDefault(); return;
      }
    }
    handle.x = p.x; handle.y = p.y;
    draggingHandle = true; dragStart = { x: handle.x, y: handle.y }; dragCurr = p;
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    e.preventDefault();
  });
canvas.addEventListener('pointermove', (e)=>{
    const p=localPoint(e);
    if (draggingHandle){ dragCurr=p; return; }
    if (!draggingBlock && tapCand){ const dx=p.x-tapStart.x, dy=p.y-tapStart.y; if ((dx*dx+dy*dy)>16){ draggingBlock=true; tapMoved=true; } if (draggingBlock && dragBlockRef){ dragBlockRef.x=Math.round(p.x-dragOffset.dx); dragBlockRef.y=Math.round(p.y-dragOffset.dy); } return; }
    if (draggingBlock && dragBlockRef){ dragBlockRef.x=Math.round(p.x-dragOffset.dx); dragBlockRef.y=Math.round(p.y-dragOffset.dy); return; }
  });
  function endDrag(e){
if (draggingHandle){
      // compute launch from handle to current pointer
      const hsx = handle.x, hsy = handle.y;
      const px = (dragCurr?.x ?? hsx), py = (dragCurr?.y ?? hsy);
      const vel = computeLaunchVelocity(hsx, hsy, px, py, worldW, worldH, getLoopInfo, speedFactor);
      const vx = vel.vx, vy = vel.vy;
      lastLaunch = { x: hsx, y: hsy, vx, vy, r: ballR() };
      try{
        const ac = ensureAudioContext(); const li = (typeof getLoopInfo==='function') ? getLoopInfo() : null;
        if (li && li.barLen){ const grid = li.barLen/16; const rel = Math.max(0, (ac?ac.currentTime:0) - li.loopStartTime); const k = Math.ceil((rel+1e-6)/grid); nextLaunchAt = li.loopStartTime + k*grid; }
        else { nextLaunchAt = (ac?ac.currentTime:0) + 0.02; }
}catch{}
      draggingHandle=false; dragCurr=dragStart=null; try{ if(e&&e.pointerId!=null) canvas.releasePointerCapture(e.pointerId);}catch{} return;
    }
    if (draggingBlock){ draggingBlock=false; dragBlockRef=null; tapCand=null; tapStart=null; tapMoved=false; try{ if(e&&e.pointerId!=null) canvas.releasePointerCapture(e.pointerId);}catch{} return; }
    if (tapCand && !tapMoved){ tapCand.active = !tapCand.active; const ac=ensureAudioContext(); const now=(ac?ac.currentTime:0)+0.0005; if (tapCand.active){ const nm=noteValue(noteList, tapCand.noteIndex|0); try{ triggerInstrument(instrument, nm, now, toyId);}catch{} } tapCand=null; tapStart=null; tapMoved=false; dragBlockRef=null; try{ if(e&&e.pointerId!=null) canvas.releasePointerCapture(e.pointerId);}catch{} return; }
    if (zoomDragCand){ const p=localPoint(e); const t=whichThirdRect(zoomDragCand, p.y); if (t==='toggle'){ zoomDragCand.active=!zoomDragCand.active; } else { if (t==='up'){ zoomDragCand.noteIndex=Math.min(noteList.length-1,(zoomDragCand.noteIndex|0)+1); } else if (t==='down'){ zoomDragCand.noteIndex=Math.max(0,(zoomDragCand.noteIndex|0)-1); } const ac=ensureAudioContext(); const now=(ac?ac.currentTime:0); const nm=noteValue(noteList, zoomDragCand.noteIndex|0); try{ triggerInstrument(instrument, nm, now+0.0005, toyId);}catch{} } zoomDragCand=null; try{ if(e&&e.pointerId!=null) canvas.releasePointerCapture(e.pointerId);}catch{} return; }
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  window.addEventListener('pointerup', endDrag, true);

  function spawnBallFrom(L){ const o={x:L.x,y:L.y,vx:L.vx,vy:L.vy,r:L.r}; ball=o; fx.onLaunch(L.x,L.y); return o; }
  function setNextLaunchAt(t){ nextLaunchAt=t; }
  function setBallOut(o){ ball=o; }

  // draw loop
  function draw(){
    const sNow=sizing.scale||1; if (sNow!==lastScale){ rescaleAll(sNow/lastScale); lastScale=sNow; }
    const cs=resizeCanvasForDPR(canvas, ctx), w=cs.width, h=cs.height;
    ctx.fillStyle='#0b0f16'; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.lineWidth=2; ctx.strokeRect(EDGE,EDGE,w-EDGE*2,h-EDGE*2);

    ensureEdgeControllers(w,h);
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
      edgeFlash, mapControllersByEdge, ensureAudioContext, noteValue, noteList, instrument, fx,
      lastLaunch, nextLaunchAt, lastAT: prevNow, flashEdge, handle, spawnBallFrom, getLoopInfo,
      triggerInstrument: (i,n,t)=>triggerInstrument(i,n,t,'bouncer', toyId),
      BOUNCER_BARS_PER_LIFE, setNextLaunchAt, setBallOut, visQ
    };
    stepBouncer(S); visQ = S.visQ || visQ; prevNow = now;
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  function onLoop(_loopStart){} // no-op
  return { onLoop, reset: doReset, setInstrument: (n)=>{ instrument = n || instrument; }, element: canvas };
}