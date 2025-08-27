// src/wheel.js — 16‑spoke on/off wheel with Grid-style cubes
import { resizeCanvasForDPR } from './utils.js';
import { initToyUI } from './toyui.js';
import { initToySizing } from './toyhelpers-sizing.js';
import { ensureAudioContext, getLoopInfo } from './audio-core.js';
import { randomizeWheel } from './wheel-random.js';
import { drawBlocksSection } from './ripplesynth-blocks.js';

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

  // Header & controls
  const ui = initToyUI(panel, {
    toyName: title,
    defaultInstrument,
    onRandom: () => doRandom(),
    onReset: () => doReset()
  });

  // Canvas
  const canvas = document.createElement('canvas');
  canvas.className = 'wheel-canvas';
  canvas.style.display = 'block';
  try { canvas.style.setProperty('width','100%','important'); canvas.style.setProperty('height','100%','important'); } catch {}
  (panel.querySelector?.('.toy-body') || panel).appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Sizing
  const sizing = initToySizing(panel, canvas, ctx, { squareFromWidth: true });

  // Model
  let active = Array.from({length:STEPS}, ()=> false);
  let semiOffsets = Array.from({length:STEPS}, ()=> 0);
  let baseMidi = 60; // C4
  let playing = true;
  let __lastRandSig = null;
  let flashUntil = new Float32Array(STEPS).fill(0);

  function doReset(){ active = Array.from({length:STEPS}, ()=> false); }

  function doRandom(){
    try{
      const tries = 4;
      for (let attempt=0; attempt<tries; attempt++){
        const handles = Array.from({length:STEPS}, ()=> null);
        const prio = 1 + Math.random()*0.001*attempt; // tiny jitter to impact density selection
        randomizeWheel(handles, { toyId:'wheel', priority: prio });
        const pattern = handles.map(h=> (h==null?0:1)).join('');
        if (pattern !== __lastRandSig || attempt === tries-1){
          for (let i=0;i<STEPS;i++){
            const h = handles[i];
            active[i] = (h!=null);
            semiOffsets[i] = (h!=null ? (h|0) : 0);
          }
          __lastRandSig = pattern;
          // small post-jitter: flip up to 2 steps randomly to avoid overly-regular 011 pattern
          const idxs = [...Array(STEPS).keys()]; for (let r=idxs.length-1;r>0;r--){ const j=(Math.random()* (r+1))|0; const t=idxs[r]; idxs[r]=idxs[j]; idxs[j]=t; }
          let flips = 0; for (let k=0;k<idxs.length && flips<2;k++){ const ii = idxs[k]; if (Math.random()<0.25){ active[ii] = !active[ii]; flips++; } }
          break;
        }
      }
    }catch(e){
      for (let i=0;i<STEPS;i++){ active[i] = (i%4===0); semiOffsets[i] = 0; }
    }
  }

  // Transport helpers
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

  // Geometry (device-pixel space)
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

  // Input
  canvas.addEventListener('pointerdown', (e)=>{
    const p = local(e);
    const i = hitSpokeButton(p.x, p.y);
    if (i >= 0){
      active[i] = !active[i];
      if (active[i] && !semiOffsets[i]){ semiOffsets[i] = (semiOffsets[(i+STEPS-1)%STEPS]||0); }
      e.preventDefault(); e.stopPropagation();
    }
  }, { passive:false });

  // Draw
  let lastTime = performance.now(), lastStep = -1, step = 0;
  function draw(){
    const cs = resizeCanvasForDPR(canvas, ctx);
    const W = cs.width, H = cs.height;
    const { cx, cy, Rmin, Rout } = radii();
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = '#0d1117'; ctx.fillRect(0,0,W,H);

    const { stepIdx } = currentStepFromLoop();
    const blocks = [];
    const TARGET_S = Math.round(42 * (sizing?.scale || 1));
    const arc = Math.max(12, Math.floor((2*Math.PI*Rout/ STEPS) * 0.7));
    const sBtn = Math.max(12, Math.min(TARGET_S, arc));

    for (let i=0;i<STEPS;i++){
      const a = spokeAngle(i);
      const x1 = cx + Math.cos(a)*Rmin, y1 = cy + Math.sin(a)*Rmin;
      const x2 = cx + Math.cos(a)*Rout, y2 = cy + Math.sin(a)*Rout;

      ctx.strokeStyle = (i === stepIdx) ? '#a8b3cf' : '#252b36';
      ctx.lineWidth = (i === stepIdx) ? 3 : 2;
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();

      const pad = EDGE_WHEEL + sBtn*0.5;
      const bxC = Math.max(pad, Math.min(W - pad, x2));
      const byC = Math.max(pad, Math.min(H - pad, y2));
      const bx = Math.round(bxC - sBtn/2);
      const by = Math.round(byC - sBtn/2);
      blocks.push({ x: bx, y: by, w: sBtn, h: sBtn, active: !!active[i], noteIndex: 0, flashEnd: flashUntil[i], flashDur: 0.12 });
    }
    const nowSec = (performance.now()/1000);
    drawBlocksSection(ctx, blocks, 0, 0, null, 1, null, sizing, null, null, nowSec);
  }

  // Trigger on steps
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
  requestAnimationFrame(loop);

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
