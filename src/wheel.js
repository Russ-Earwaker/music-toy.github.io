// src/wheel.js — 16‑spoke on/off wheel with Grid-style cubes
import { resizeCanvasForDPR } from './utils.js';
import { initToyUI } from './toyui.js';
import { initToySizing } from './toyhelpers-sizing.js';
import { ensureAudioContext, getLoopInfo } from './audio-core.js';
import { randomizeWheel } from './wheel-random.js';
import { drawBlocksSection } from './ripplesynth-blocks.js';
import { cubeGapPx, handleMaxRadius, spokePointAt, semiToRadius, radiusToSemi, handlePos, hitHandle } from './wheel-handles.js';

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const STEPS = 16;
function midiName(m){ const n=((m%12)+12)%12, o=Math.floor(m/12)-1; return NOTE_NAMES[n]+o; }

export function buildWheel(selector, opts = {}){
  const {
    defaultInstrument = 'slap bass guitar',
    title = 'Wheel',
    onNote = null,
    getBpm = ()=> (window.musictoyBpm || 120)
  } = opts;

  const shell = (typeof selector === 'string') ? document.querySelector(selector) : selector;
  if (!shell){ console.warn('[wheel] missing', selector); return null; }
  const panel = shell?.closest?.('.toy-panel') || shell;

  const ui = initToyUI(panel, {
    toyName: title,
    defaultInstrument,
    onRandom: () => doRandom({activate:true}),
    onReset: () => doReset()
  });

  const canvas = document.createElement('canvas');
  canvas.className = 'wheel-canvas';
  canvas.style.display = 'block';
  try { canvas.style.setProperty('width','100%','important'); canvas.style.setProperty('height','100%','important'); } catch {}
  (panel.querySelector?.('.toy-body') || panel).appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const sizing = initToySizing(panel, canvas, ctx, { squareFromWidth: true });

  let active = Array.from({length:STEPS}, ()=> false);
  let semiOffsets = Array.from({length:STEPS}, ()=> 0);
  let baseMidi = 60; // C4
  let playing = true;
  let __lastRandSig = null;
  let flashUntil = new Float32Array(STEPS).fill(0);

  let dragIndex = -1;
  let dragActive = false;
  function doReset(){ active = Array.from({length:STEPS}, ()=> false); }

  function doRandom(opts = {}){
    try{
      const tries = 4;
      for (let attempt=0; attempt<tries; attempt++){
        const handles = Array.from({length:STEPS}, ()=> null);
        const prio = 1 + Math.random()*0.001*attempt; // tiny jitter to impact density selection
        randomizeWheel(handles, { toyId:'wheel', priority: prio });
        // Fill nulls so every spoke has a pitch (for 'deactivated but already in tune')
        if (handles.some(h => h == null)){
          // find first non-null
          let firstIdx = handles.findIndex(h => h != null);
          if (firstIdx === -1){
            // nothing assigned: seed all to 0
            for (let i=0;i<STEPS;i++) handles[i] = 0;
          } else {
            // backward fill leading nulls with the first known value
            for (let i=firstIdx-1; i>=0; i--){ if (handles[i]==null) handles[i] = handles[i+1]; }
            // forward fill remaining nulls with previous known
            for (let i=firstIdx+1; i<STEPS; i++){ if (handles[i]==null) handles[i] = handles[i-1]; }
          }
        }

        const pattern = handles.map(h=> (h==null?0:1)).join('');
        if (pattern !== __lastRandSig || attempt === tries-1){
          for (let i=0;i<STEPS;i++){
            const h = handles[i];
            active[i] = !!(opts && opts.activate && h!=null);
            semiOffsets[i] = (h!=null ? (h|0) : (semiOffsets[i]||0));
          }
          __lastRandSig = pattern;
          const idxs = [...Array(STEPS).keys()]; for (let r=idxs.length-1;r>0;r--){ const j=(Math.random()* (r+1))|0; const t=idxs[r]; idxs[r]=idxs[j]; idxs[j]=t; }
          if (opts && opts.activate){ let flips = 0; for (let k=0;k<idxs.length && flips<2;k++){ const ii = idxs[k]; if (Math.random()<0.25){ active[ii] = !active[ii]; flips++; } } }
          break;
        }
      }
    }catch(e){
      for (let i=0;i<STEPS;i++){ /* keep all off by default */ active[i] = false; semiOffsets[i] = 0; }
    }
  }

  function currentStepFromLoop(){
    try{
      const ac = ensureAudioContext();
      const info = (typeof getLoopInfo==='function') ? getLoopInfo() : null;
      const bpm = (typeof getBpm==='function') ? getBpm() : 120;
      const barLen = (info && info.barLen) ? info.barLen : ((60/bpm)*4);
      const loopStart = (info && 'loopStartTime' in info) ? info.loopStartTime : ac.currentTime;
      const t = ((ac.currentTime - loopStart) % barLen + barLen) % barLen;
      const stepDur = barLen / STEPS;
      const stepIdx = Math.floor(t / stepDur);
      const phase = (t - stepIdx*stepDur) / stepDur;
      return { stepIdx, phase01: phase, barLen };
    }catch(e){ return { stepIdx:0, phase01:0, barLen:1 }; }
  }

  const EDGE_WHEEL = 10;
  const worldW = ()=> canvas.width|0;
  const worldH = ()=> canvas.height|0;
  const spokeAngle = (i)=> (-Math.PI/2 + (i/STEPS)*Math.PI*2);
  function radii(){
    const W = worldW(), H = worldH();
    const s = Math.min(W, H);
    const Rmin = s*0.22, Rout = s*0.42, Rbtn = Math.max(10, s*0.045);
    const cx = W/2, cy = H/2;
    return { cx, cy, Rmin, Rout, Rbtn };
  }
  function spokeEnd(i){
    const { cx, cy, Rout } = radii(); const a = spokeAngle(i);
    return { x: cx + Math.cos(a)*Rout, y: cy + Math.sin(a)*Rout };
  }
  function local(ev){
    const r = canvas.getBoundingClientRect();
    const sx = (r.width ? canvas.width/r.width : 1);
    const sy = (r.height? canvas.height/r.height: 1);
    return { x: (ev.clientX - r.left)*sx, y: (ev.clientY - r.top)*sy };
  }
  function hitSpokeButton(x,y){
    const { Rbtn } = radii();
    let best=-1, bestD=Rbtn*1.3;
    for (let i=0;i<STEPS;i++){
      const p = spokeEnd(i);
      const d = Math.hypot(x-p.x, y-p.y);
      if (d < bestD){ best=i; bestD=d; }
    }
    return best;
  }

  canvas.addEventListener('pointermove', (e)=>{
    if (!dragActive) return;
    const p = local(e);
    const { cx, cy } = radii();
    const r = Math.hypot(p.x - cx, p.y - cy);
    const rad = radii(); const Rinner = Math.max(0, rad.Rmin*0.7); const semi = radiusToSemi(r, Rinner, handleMaxRadius(rad));
    if (dragIndex >= 0){
      semiOffsets[dragIndex] = semi;
      active[dragIndex] = true;
    }
    e.preventDefault(); e.stopPropagation();
  }, { passive:false });
  window.addEventListener('pointerup', ()=>{ dragActive = false; dragIndex=-1; }, { passive:true });
  canvas.addEventListener('pointerdown', (e)=>{
    
    const isAdvanced = panel.classList.contains('toy-zoomed');
    let pt = local(e);
if (isAdvanced){
      const __rad = radii(); const __radInner = { ...__rad, Rmin: Math.max(0, __rad.Rmin*0.7) }; const hi = hitHandle(pt.x, pt.y, semiOffsets, __radInner, spokeAngle);
      if (hi >= 0){
        dragIndex = hi; dragActive = true;
        e.preventDefault(); e.stopPropagation();
        return;
      }
    }
const p = local(e);
    const i = hitSpokeButton(p.x, p.y);
    if (i >= 0){
      active[i] = !active[i];
      if (active[i] && !semiOffsets[i]){ semiOffsets[i] = (semiOffsets[(i+STEPS-1)%STEPS]||0); }
      e.preventDefault(); e.stopPropagation();
    }
  }, { passive:false });

  let lastTime = performance.now(), lastStep = -1, step = 0;
  function draw(){
    
    const cs = resizeCanvasForDPR(canvas, ctx);
    const W = cs.width, H = cs.height;
    const rad = radii(); const { cx, cy, Rmin, Rout, Rbtn } = rad;
    const Rinner = Math.max(0, Rmin * 0.7);
    const radInner = { ...rad, Rmin: Rinner };
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = '#0d1117'; ctx.fillRect(0,0,W,H);

    const { stepIdx, phase01 } = currentStepFromLoop();
    const blocks = [];
    const TARGET_S = Math.round(42 * (sizing?.scale || 1));
    const arc = Math.max(12, Math.floor((2*Math.PI*Rout/ STEPS) * 0.7));
    const sBtn = Math.max(12, Math.min(TARGET_S, arc));

    const zoomed = panel.classList.contains('toy-zoomed');

    const gap = cubeGapPx(worldW(), worldH());
    const spokeEndR = Math.max(Rmin, handleMaxRadius(rad)); // where spoke visually ends
    const cubeCenterR = Rout; // where cube centers aim for (clamped later)

    const loopPts = [];
    for (let i=0;i<STEPS;i++){
      const a = spokeAngle(i);
      const p1 = spokePointAt(i, Rinner, rad, spokeAngle);
      const p2 = spokePointAt(i, spokeEndR, rad, spokeAngle);

      ctx.strokeStyle = (i === stepIdx) ? '#a8b3cf' : '#252b36';
      ctx.lineWidth = (i === stepIdx) ? 3 : 2;
      ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.stroke();
      // semitone ticks along the spoke (12 stops)
      const ticks = 12;
      for (let k=0;k<ticks;k++){
        const rr = semiToRadius(k, Rinner, handleMaxRadius(rad));
        const tp = spokePointAt(i, rr, rad, spokeAngle);
        const nx = -Math.sin(a), ny = Math.cos(a);
        const half = Math.max(2, sBtn*0.10);
        ctx.beginPath();
        ctx.moveTo(tp.x - nx*half, tp.y - ny*half);
        ctx.lineTo(tp.x + nx*half, tp.y + ny*half);
        ctx.strokeStyle = '#2a3040';
        ctx.lineWidth = 1;
        ctx.stroke();
      }


      const hp = handlePos(i, semiOffsets, radInner, spokeAngle);
      ctx.beginPath();
      ctx.arc(hp.x, hp.y, Math.max(4, sBtn*0.18), 0, Math.PI*2);
      if (zoomed){
        ctx.fillStyle = active[i] ? '#8fb3ff' : '#39404f';
        ctx.strokeStyle = active[i] ? '#a8b3cf' : '#252b36';
      } else {
        ctx.fillStyle = '#2b313f';
        ctx.strokeStyle = '#252b36';
      }
      ctx.lineWidth = 2;
      ctx.fill(); ctx.stroke();

      if (active[i]) loopPts.push({x:hp.x, y:hp.y});
      
      const cx2 = cx + Math.cos(a)*cubeCenterR;
      const cy2 = cy + Math.sin(a)*cubeCenterR;
      const pad = EDGE_WHEEL + sBtn*0.5;
      const bxC = Math.max(pad, Math.min(W - pad, cx2));
      const byC = Math.max(pad, Math.min(H - pad, cy2));
      const bx = Math.round(bxC - sBtn/2);
      const by = Math.round(byC - sBtn/2);
      blocks.push({ x: bx, y: by, w: sBtn, h: sBtn, active: !!active[i], noteIndex: (baseMidi + (semiOffsets[i]|0)) % 12, showLabelForce: (dragActive && (i===dragIndex)), labelOverride: midiName(baseMidi + (semiOffsets[i]|0)), flashEnd: flashUntil[i], flashDur: 0.12 , hideArrows:true});
    }

    if (loopPts.length >= 2){
      ctx.strokeStyle = '#44516b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(loopPts[0].x, loopPts[0].y);
      for (let i=1;i<loopPts.length;i++) ctx.lineTo(loopPts[i].x, loopPts[i].y);
      ctx.closePath();
      ctx.stroke();
    }

    const handA = spokeAngle(stepIdx + phase01);
    const handR = spokeEndR + Math.max(4, sBtn*0.1);
    ctx.strokeStyle = '#e6e8ef';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(handA)*handR, cy + Math.sin(handA)*handR);
    ctx.stroke();

    const nowSec = (performance.now()/1000);
    drawBlocksSection(ctx, blocks, 0, 0, null, 1, NOTE_NAMES, sizing, null, null, nowSec);
}

  function tick(){
    const { stepIdx } = currentStepFromLoop();
    if (stepIdx !== lastStep){
      step = stepIdx; lastStep = stepIdx;
      if (playing && active[step]){
        try { const midi = baseMidi + (semiOffsets[step]|0); const name = midiName(midi); if (typeof onNote==='function') onNote(midi, name, 0.9); } catch{}
        try { flashUntil[step] = (performance.now()/1000) + 0.12; } catch {}
      }
    }
  }

  function loop(now){
    const dt = Math.min(100, now - lastTime); lastTime = now;
    draw(); tick(); requestAnimationFrame(loop);
  }

  // Boot: assign pitches but keep all spokes deactivated
  try {
    doRandom({activate:false});
    for (let __i=0; __i<STEPS; __i++){ active[__i] = false; }
  } catch {}

  requestAnimationFrame(loop);

  // Guard: if samples become ready and wheel hasn't populated yet, randomize once
  try {
    window.addEventListener('samples-ready', ()=>{
      try { if (!active.some(Boolean)) doRandom({activate:false}); } catch {}
    });
  } catch {}

  panel.tabIndex = 0;
  panel.addEventListener('keydown', (e)=>{
    if (e.key === 'ArrowUp'){ baseMidi += 12; e.preventDefault(); }
    else if (e.key === 'ArrowDown'){ baseMidi -= 12; e.preventDefault(); }
  });

  function setPlaying(v){ playing = !!v; }
  function getState(){ return { active:[...active], baseMidi, offsets:[...semiOffsets] }; }
  function setState(s){
    try{
      if (s && s.active) active = s.active.slice(0,STEPS);
      if (s && s.offsets) semiOffsets = s.offsets.slice(0,STEPS);
      if (s && s.baseMidi!=null) baseMidi = s.baseMidi|0;
    }catch{}
  }

  const api = {
    element: canvas,
    setInstrument: ui.setInstrument,
    get instrument(){ return ui.instrument; },
    reset: doReset,
    onLoop: ()=>{ lastStep = -1; step = 0; },
    setPlaying, getState, setState
  };
  try{ panel.__wheelInst = api; }catch{}
  return api;
}