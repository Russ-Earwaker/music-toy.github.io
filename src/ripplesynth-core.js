import { initToyUI } from './toyui.js';
import { initToySizing, randomizeRects } from './toyhelpers.js';
import { resizeCanvasForDPR, noteList } from './utils.js';
import { ensureAudioContext, barSeconds as audioBarSeconds } from './audio-core.js';
import { triggerInstrument } from './audio-samples.js';
import { drawBlocksSection } from './ripplesynth-blocks.js';
import { makePointerHandlers } from './ripplesynth-input.js';
import { initParticles, setParticleBounds, drawParticles } from './ripplesynth-particles.js';
import { drawWaves } from './ripplesynth-waves.js';
export function createRippleSynth(selector){
  const shell = (typeof selector === 'string') ? document.querySelector(selector) : selector;
  if (!shell){ console.warn('[rippler] missing', selector); return null; }
  const panel  = shell.closest?.('.toy-panel') || shell;
  const canvas = document.createElement('canvas');
  canvas.className = 'rippler-canvas';
  canvas.style.display = 'block';
  shell.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const ui  = initToyUI(panel, { toyName: 'Rippler' });
  let currentInstrument = (ui.instrument && ui.instrument !== 'tone') ? ui.instrument : 'kalimba';
  try { ui.setInstrument(currentInstrument); } catch {}
  const sizing = initToySizing(panel, canvas, ctx, { squareFromWidth: true });
  const isZoomed = ()=> panel.classList.contains('toy-zoomed');
  panel.addEventListener('toy-zoom', (ev)=>{ try{ const z=!!(ev.detail && ev.detail.zoomed); sizing.setZoom(z); canvas.style.aspectRatio = z ? '1 / 1' : ''; setParticleBounds(canvas.width, canvas.height); }catch{} });
  const EDGE = 10;
  const W = ()=> canvas.clientWidth|0, H = ()=> canvas.clientHeight|0;
  const n2x = (nx)=>{ const z=isZoomed(); const side=z? Math.max(1, Math.min(W(),H())-EDGE*2): Math.max(1, W()-EDGE*2); const offX = z? Math.max(EDGE, (W()-side)/2): EDGE; return offX + nx*side; };
  const n2y = (ny)=>{ const z=isZoomed(); const side=z? Math.max(1, Math.min(W(),H())-EDGE*2): Math.max(1, H()-EDGE*2); const offY = z? Math.max(EDGE, (H()-side)/2): EDGE; return offY + ny*side; };
  const x2n = (x)=>{ const z=isZoomed(); const side=z? Math.max(1, Math.min(W(),H())-EDGE*2): Math.max(1, W()-EDGE*2); const offX = z? Math.max(EDGE, (W()-side)/2): EDGE; return Math.min(1, Math.max(0, (x-offX)/side)); };
  const y2n = (y)=>{ const z=isZoomed(); const side=z? Math.max(1, Math.min(W(),H())-EDGE*2): Math.max(1, H()-EDGE*2); const offY = z? Math.max(EDGE, (H()-side)/2): EDGE; return Math.min(1, Math.max(0, (y-offY)/side)); };
  const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));
  const getCanvasPos = (el, e)=>{ const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const CUBES = 8, BASE = 56 * 0.75;
  const blocks = Array.from({length:CUBES}, (_,i)=>({ nx:0.5, ny:0.5, nx0:0.5, ny0:0.5, vx:0, vy:0, flashEnd:0, flashDur:0.18, active:true, noteIndex:(noteList.indexOf('C4')>=0?noteList.indexOf('C4'):48)+i }));
    let didLayout=false;
  function layoutBlocks(){
    if (didLayout || !W() || !H()) return;
    const size = Math.round(BASE*(sizing.scale||1));
    const bounds = { x: EDGE, y: EDGE, w: Math.max(1, W()-EDGE*2), h: Math.max(1, H()-EDGE*2) };
    const rects = Array.from({length:CUBES}, ()=>({
      x: Math.round(bounds.x + Math.random()*(bounds.w - size)),
      y: Math.round(bounds.y + Math.random()*(bounds.h - size)),
      w: size, h: size
    }));
    try { randomizeRects(rects, bounds, 6); } catch {}
    for (let i=0;i<CUBES;i++){
      const r = rects[i];
      const cx = r.x + r.w/2, cy = r.y + r.h/2;
      blocks[i].nx = blocks[i].nx0 = x2n(cx);
      blocks[i].ny = blocks[i].ny0 = y2n(cy);
    }
    didLayout = true;
  }
  // Return up-to-date pixel rects for blocks (for hit-testing/drag)
  function getBlockRects(){
    const size = Math.max(20, Math.round(BASE * (sizing.scale||1)));
    const rects = [];
    for (let i=0;i<blocks.length;i++){
      const cx = n2x(blocks[i].nx), cy = n2y(blocks[i].ny);
      rects.push({ x: cx - size/2, y: cy - size/2, w: size, h: size, index: i });
    }
    return rects;
  }

  layoutBlocks();
  const generator = { nx:0.5, ny:0.5, r:10, placed:false };
  let ripples = []; // {x,y,startTime (perf), startAT (audio), speed}
  const RING_SPEED = ()=> Math.hypot(W(), H()) / (audioBarSeconds() || 2.0); // px/sec
  let particlesInit = false;
  const ac = ensureAudioContext();
  const NUM_STEPS = 8;
  const barSec = ()=> audioBarSeconds() || 2.0;
  const stepSeconds = ()=> barSec()/NUM_STEPS;
  let barStartAT = ac.currentTime, nextSlotAT = barStartAT + stepSeconds(), nextSlotIx = 1;
  let recording = true;
  const pattern = Array.from({length:NUM_STEPS}, ()=> new Set());
  const liveBlocks = new Set(); // blocks that play from ripple while dragging
  const recordOnly = new Set(); // blocks to (re)record on next ripple hit
  let skipNextBarRing = false;
  let dragMuteActive = false;
  let playbackMuted = false;
  let _genDownPos = null;
  let lastSpawnPerf = 0;
  let _wasPlacedAtDown = false;
  function randomizeAll(){
    didLayout = false; layoutBlocks();
    for (const b of blocks){ b.vx=0; b.vy=0; b.flashEnd=0; }
    blocks.forEach((b)=>{ const d=(-2+Math.floor(Math.random()*5)); b.noteIndex = Math.max(0, Math.min(noteList.length-1, (b.noteIndex|0) + d)); });
  }
  function clearPattern(){ pattern.forEach(s=> s.clear()); }
  panel.addEventListener('toy-random', randomizeAll);
  panel.addEventListener('toy-clear', (ev)=>{ try{ ev.stopImmediatePropagation(); ev.stopPropagation(); }catch{}; ripples.length=0; generator.placed=false; });
  panel.addEventListener('toy-reset', ()=>{ clearPattern(); randomizeAll(); });
  const input = makePointerHandlers({ canvas, vw:W, vh:H, EDGE, blocks:[], ripples, getBlockRects, onBlockDrag: (idx, newX, newY)=>{ const size=Math.max(20, Math.round(BASE * (sizing.scale||1))); const cx=newX+size/2, cy=newY+size/2; const nx=x2n(cx), ny=y2n(cy); const b=blocks[idx]; b.nx=nx; b.ny=ny; b.nx0=nx; b.ny0=ny; b.vx=0; b.vy=0; }, onBlockGrab: (idx)=>{ for (const s of pattern) s.delete(idx); liveBlocks.add(idx); }, onBlockDrop: (idx)=>{ liveBlocks.delete(idx); recordOnly.add(idx); },
    generatorRef: {
      get x(){ return n2x(generator.nx); }, get y(){ return n2y(generator.ny); },
      place(x,y){ this.set(x,y); },
      set(x,y){ generator.nx=x2n(x); generator.ny=y2n(y); generator.placed=true; },
      get placed(){ return generator.placed; }, set placed(v){ generator.placed=!!v; }
    },
    clamp, getCanvasPos
  });
  canvas.addEventListener('pointerdown', (e)=>{
    const gp = getCanvasPos(canvas, e);
    const gx0 = n2x(generator.nx), gy0 = n2y(generator.ny);
    const nearGen = generator.placed && !isZoomed() && (Math.hypot(gp.x-gx0, gp.y-gy0) <= Math.max(20, generator.r*(sizing.scale||1)+10));
    dragMuteActive = nearGen; playbackMuted = nearGen; if (nearGen){ ripples.length = 0; }
    _genDownPos = { x: gx0, y: gy0 };
    if (isZoomed()){
      const p = getCanvasPos(canvas, e);
      const s = Math.max(20, Math.round(BASE * (sizing.scale||1)));
      for (let i=blocks.length-1;i>=0;i--){
        const rx = n2x(blocks[i].nx) - s/2, ry = n2y(blocks[i].ny) - s/2;
        if (p.x>=rx && p.x<=rx+s && p.y>=ry && p.y<=ry+s){
          const t1=ry+s/3, t2=ry+2*s/3;
          if (p.y < t1) blocks[i].noteIndex = Math.min(noteList.length-1, blocks[i].noteIndex+1);
          else if (p.y < t2) blocks[i].active = !blocks[i].active;
          else blocks[i].noteIndex = Math.max(0, blocks[i].noteIndex-1);
          blocks[i].flashEnd = performance.now()/1000 + 0.18;
          return;
        }
      }
    }
    const wasPlaced = generator.placed; _wasPlacedAtDown = wasPlaced;
    input.pointerDown(e);
    if (!wasPlaced && generator.placed){
      pattern.forEach(s=> s.clear());
      spawnRipple(false);
      barStartAT = ac.currentTime; nextSlotAT = barStartAT + stepSeconds(); nextSlotIx = 1; recording = true;
    }
  });
  canvas.addEventListener('pointermove', input.pointerMove);
  canvas.addEventListener('pointerup', (e)=>{
    const prevDrag = dragMuteActive; dragMuteActive=false;
    input.pointerUp(e);
    const nowAT = ac.currentTime;
    if (prevDrag){
      playbackMuted=false;
      spawnRipple(false);
      barStartAT=nowAT; nextSlotAT=barStartAT+stepSeconds(); nextSlotIx=1; clearPattern(); recording=true;
    } else {
      const gx=n2x(generator.nx), gy=n2y(generator.ny);
      if (_wasPlacedAtDown && _genDownPos && Math.hypot((_genDownPos.x-gx),(_genDownPos.y-gy))>4){
        spawnRipple(false);
        barStartAT=nowAT; nextSlotAT=barStartAT+stepSeconds(); nextSlotIx=1; clearPattern(); recording=true;
      }
    }
    _genDownPos=null; _wasPlacedAtDown=false;
  });
function spawnRipple(manual=false){
    const nowAT = ac.currentTime, nowPerf = performance.now()/1000;
    if (nowPerf - lastSpawnPerf < 0.15) return; // debounce double fires
    lastSpawnPerf = nowPerf;
    const gx = n2x(generator.nx), gy = n2y(generator.ny);
    const corners = [[0,0],[W(),0],[0,H()],[W(),H()]];
    const offR = Math.max(...corners.map(([x,y])=> Math.hypot(x-gx, y-gy))) + 24;
    ripples = ripples.filter(r => ((nowPerf - r.startTime) * (r.speed||RING_SPEED())) < (r.offR||Math.hypot(W(),H())+24));
    ripples.push({ x: gx, y: gy, startAT: nowAT, startTime: nowPerf, speed: RING_SPEED(), offR, hit: new Set() });
    if (manual) skipNextBarRing = true;
  }
  function reRecordFromNow(){ clearPattern(); recording = true; barStartAT = ac.currentTime; nextSlotAT = barStartAT + stepSeconds(); nextSlotIx = 1; }

  function ringFront(nowAT){
    if (!ripples.length) return -1;
    return Math.max(0, (nowAT - (ripples[0].startAT||nowAT)) * RING_SPEED());
  }
  function handleRingHits(nowAT){ if (playbackMuted) return;
    if (!ripples.length || !generator.placed) return;
    const rMain = ripples[ripples.length-1];
    const R = Math.max(0, (nowAT - (rMain.startAT||nowAT)) * (rMain.speed||RING_SPEED()));
    const band = 9;
    const gx = n2x(generator.nx), gy = n2y(generator.ny);
    for (let i=0;i<blocks.length;i++){
      const b = blocks[i];
      if (!b.active || rMain.hit.has(i)) continue;
      const s = Math.max(20, Math.round(BASE * (sizing.scale||1)));
      const cx = n2x(b.nx), cy = n2y(b.ny);
      const dC = Math.hypot(cx - gx, cy - gy);
      const dEdge = Math.max(0, dC - Math.SQRT2*(s/2));
      if (Math.abs(dEdge - R) <= band){
        rMain.hit.add(i);
        b.flashEnd = performance.now()/1000 + 0.18;
        const ang = Math.atan2(cy - gy, cx - gx), push = 48;
        b.vx += Math.cos(ang)*push; b.vy += Math.sin(ang)*push;
        const whenAT = ac.currentTime, slotLen = stepSeconds();
          let k = Math.ceil((whenAT - barStartAT)/slotLen); if (k<0) k=0;
          const slotIx = k % NUM_STEPS;
          const name = noteList[b.noteIndex] || 'C4';
          // liveBlocks: play immediately (responsive), no record
          if (liveBlocks.has(i)) {
            triggerInstrument(currentInstrument, name, whenAT + 0.0005);
          }
          // recording / recordOnly: schedule on the quantized slot and write pattern
          if (recording || recordOnly.has(i)){
            triggerInstrument(currentInstrument, name, barStartAT + k*slotLen + 0.0005);
            const slot = pattern[slotIx];
            let existsSame=false; for (const jj of slot){ if ((noteList[blocks[jj].noteIndex]||'') === name){ existsSame=true; break; } }
            if (!existsSame) slot.add(i);
            if (recordOnly.has(i)) recordOnly.delete(i);
          }
      }
    }
  }
  function playbackTick(){
    const nowAT = ac.currentTime;
    if (nowAT >= barStartAT + barSec()){
      recordOnly.clear();
      barStartAT += barSec(); nextSlotAT = barStartAT; nextSlotIx = 0;
      if (generator.placed && !playbackMuted){ if (skipNextBarRing) skipNextBarRing=false; else spawnRipple(false); }
      recording = false;
    }
    const lookahead = 0.03;
    while (!recording && !playbackMuted && nowAT + lookahead >= nextSlotAT){
      const s = pattern[nextSlotIx];
      if (s && s.size){
        const scheduled = new Set();
        s.forEach(i=>{
          const name = noteList[blocks[i].noteIndex] || 'C4';
          if (!scheduled.has(name)){
            triggerInstrument(currentInstrument, name, nextSlotAT + 0.0005);
            scheduled.add(name);
          }
          blocks[i].flashEnd = Math.max(blocks[i].flashEnd, performance.now()/1000 + 0.12);
        });
      }
      nextSlotIx = (nextSlotIx+1) & (NUM_STEPS-1);
      nextSlotAT += stepSeconds();
    }
  }
  function springBlocks(dt){
    const K=14.0, D=0.86;
    for (const b of blocks){
      const px = n2x(b.nx), py = n2y(b.ny);
      const tx = n2x(b.nx0), ty = n2y(b.ny0);
      const ax=(tx-px)*K*dt, ay=(ty-py)*K*dt;
      b.vx=(b.vx+ax)*D; b.vy=(b.vy+ay)*D;
      b.nx = x2n(px + b.vx*dt);
      b.ny = y2n(py + b.vy*dt);
    }
  }
  function draw(){
    resizeCanvasForDPR(canvas, ctx);
    if (!didLayout) layoutBlocks();
    ctx.clearRect(0,0,W(),H());
    if (!particlesInit && canvas.width && canvas.height){
      try { initParticles(canvas.width, canvas.height, EDGE, 110); setParticleBounds(canvas.width, canvas.height); particlesInit = true; } catch {}
    }
    if (typeof window.__rpW === 'undefined'){ window.__rpW = canvas.width; window.__rpH = canvas.height; }
    if (canvas.width !== window.__rpW || canvas.height !== window.__rpH){
      window.__rpW = canvas.width; window.__rpH = canvas.height;
      try { initParticles(canvas.width, canvas.height, EDGE, 110); setParticleBounds(canvas.width, canvas.height); } catch {}
    }
    if (generator.placed){
      ctx.save();
      ctx.strokeStyle='rgba(255,255,255,0.65)'; ctx.lineWidth=1.5;
      drawWaves(ctx, n2x(generator.nx), n2y(generator.ny), performance.now()/1000, RING_SPEED(), ripples, NUM_STEPS, stepSeconds);
      ctx.restore();
    }
    drawParticles(ctx, performance.now()/1000, ripples, { x:n2x(generator.nx), y:n2y(generator.ny) });
    const size = Math.round(BASE*(sizing.scale||1));
    const blockRects = blocks.map(b=>({ ...b, x:n2x(b.nx)-size/2, y:n2y(b.ny)-size/2, w:size, h:size }));
    drawBlocksSection(ctx, blockRects, n2x(generator.nx), n2y(generator.ny), ripples, 1.0, noteList, { vw: ()=> isZoomed()? 640: 0 }, null, null, performance.now()/1000);
    if (isZoomed()){
      ctx.save(); ctx.strokeStyle='rgba(255,255,255,0.7)'; ctx.lineWidth=1;
      for (const b of blockRects){
        ctx.beginPath(); ctx.moveTo(b.x+4, b.y+b.h/3); ctx.lineTo(b.x+b.w-4, b.y+b.h/3);
        ctx.moveTo(b.x+4, b.y+2*b.h/3); ctx.lineTo(b.x+b.w-4, b.y+2*b.h/3); ctx.stroke();
        ctx.fillStyle = '#0b0f16'; ctx.font='12px ui-sans-serif, system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(noteList[Math.max(0, Math.min(noteList.length-1, b.noteIndex|0))]||'', b.x+b.w/2, b.y+b.h/2);
      }
      ctx.restore();
    }
    if (generator.placed){ ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(n2x(generator.nx), n2y(generator.ny), Math.round(generator.r*(sizing.scale||1)), 0, Math.PI*2); ctx.fill(); }
    springBlocks(1/60);
    handleRingHits(ac.currentTime);
    playbackTick();
    if (input && input.state && input.state.generatorDragEnded){
      input.state.generatorDragEnded=false;
      const nowAT = ac.currentTime; spawnRipple(true);
      barStartAT=nowAT; nextSlotAT=barStartAT+stepSeconds(); nextSlotIx=1; clearPattern(); recording=true;
    }
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
  function reset(){
    ripples.length=0; for (const b of blocks){ b.vx=b.vy=0; b.nx=b.nx0; b.ny=b.ny0; b.flashEnd=0; }
    pattern.forEach(s=> s.clear());
    barStartAT = ac.currentTime; nextSlotAT = barStartAT + stepSeconds(); nextSlotIx = 1; recording = true;
  }
  return { setInstrument: (name)=> { currentInstrument = name; try{ ui.setInstrument(name); }catch{} }, reset, element: canvas };
}