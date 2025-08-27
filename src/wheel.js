// src/wheel.js — 16‑spoke on/off wheel (<=300 lines)
// Standard view: toggle spokes via end buttons. Advanced keeps instrument + zoom.
// Triggers 1 bar loop synced to audio-core epoch.

import { resizeCanvasForDPR, clamp } from './utils.js';
import { initToyUI } from './toyui.js';
import { initToySizing } from './toyhelpers-sizing.js';
import { ensureAudioContext, getLoopInfo } from './audio-core.js';
import { addWheelToSequence } from './wheel-sequencer.js';

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const STEPS = 16;

function midiName(m){ const n = ((m%12)+12)%12, o = Math.floor(m/12)-1; return NOTE_NAMES[n] + o; }

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

  // "+ Next" sequencing button (prototype)
  try{
    const header = panel.querySelector('.toy-controls.toy-controls-right');
    const nextBtn = document.createElement('button');
    nextBtn.type='button'; nextBtn.className='toy-btn'; nextBtn.textContent='+';
    nextBtn.title='Duplicate this toy and play in sequence';
    Object.assign(nextBtn.style,{padding:'6px 10px',border:'1px solid #252b36',borderRadius:'10px',background:'#0d1117',color:'#e6e8ef',cursor:'pointer'});
    nextBtn.addEventListener('click', (e)=>{ e.stopPropagation(); addWheelToSequence(panel); });
    header && header.prepend(nextBtn);
  }catch{}

  // Canvas
  const canvas = document.createElement('canvas');
  canvas.className = 'wheel-canvas';
  canvas.style.display = 'block';
  try { canvas.style.setProperty('width','100%','important'); canvas.style.setProperty('height','100%','important'); } catch {}
  (panel.querySelector?.('.toy-body') || panel).appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Sizing (square)
  const sizing = initToySizing(panel, canvas, ctx, { squareFromWidth: true });

  // World size helpers (exclude header)
  const worldW = ()=> ((canvas.getBoundingClientRect?.().width|0) || canvas.clientWidth || panel.clientWidth  || 356);
  const worldH = ()=> ((canvas.getBoundingClientRect?.().height|0) || canvas.clientHeight || panel.clientHeight || 260);

  // Model: on/off per spoke
  let active = Array.from({length:STEPS}, ()=> false);
  let baseMidi = 60; // C4 root
  let playing = true; // gated by sequencer

  function doReset(){ active = Array.from({length:STEPS}, ()=> false); }
  function doRandom(){
    const want = Math.round(STEPS * 0.5); // simple density
    active = active.map((_,i)=> (i%4===0) || (Math.random() < (want/STEPS)));
  }

  // Loop sync helpers
  function currentStepFromLoop(){
    try{
      const ac = ensureAudioContext();
      const info = getLoopInfo ? getLoopInfo() : null;
      const barLen = info?.barLen || ((60/ (typeof getBpm==='function' ? getBpm() : 120)) * 4);
      const loopStart = info?.loopStartTime ?? ac.currentTime;
      const t = ((ac.currentTime - loopStart) % barLen + barLen) % barLen;
      const stepDur = barLen / STEPS;
      const stepIdx = Math.floor(t / stepDur);
      const phase = (t - stepIdx*stepDur) / stepDur;
      return { stepIdx, phase01: phase, barLen };
    }catch{ return { stepIdx:0, phase01:0, barLen:1 }; }
  }

  function radii(){
    const w = worldW(), h = worldH();
    const padTop = 6, usableH = Math.max(0, h - padTop);
    const s = Math.min(w, usableH);
    const rscale = Math.max(0.88, Math.min(1.12, s/Math.max(1,s))); // ~1
    const Rmin = s*0.22*rscale, Rout = s*0.46*rscale, Rbtn = s*0.055*rscale;
    const cx = w/2, cy = padTop + usableH/2;
    return { cx, cy, Rmin, Rout, Rbtn };
  }
  const spokeAngle = (i)=> (-Math.PI/2 + (i/STEPS)*Math.PI*2);

  // Hit testing for end buttons
  function spokeEnd(i){
    const { cx, cy, Rout } = radii();
    const a = spokeAngle(i);
    return { x: cx + Math.cos(a)*Rout, y: cy + Math.sin(a)*Rout };
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

  // Input: toggle buttons only
  function local(ev){ const r = canvas.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
  canvas.addEventListener('pointerdown', (e)=>{
    const p = local(e);
    const i = hitSpokeButton(p.x, p.y);
    if (i >= 0){ active[i] = !active[i]; e.preventDefault(); e.stopPropagation(); }
  }, { passive:false });

  // Draw -----------------------------------------------------------------
  let lastTime = performance.now(), lastStep = -1, step = 0;
  function draw(){
    resizeCanvasForDPR(canvas, ctx);
    const W = canvas.width, H = canvas.height;
    const { cx, cy, Rmin, Rout, Rbtn } = radii();
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = '#0d1117'; ctx.fillRect(0,0,W,H);

    // spokes + step highlight
    const { stepIdx } = currentStepFromLoop();
    for (let i=0;i<STEPS;i++){
      const a = spokeAngle(i);
      const x1 = cx + Math.cos(a)*Rmin, y1 = cy + Math.sin(a)*Rmin;
      const x2 = cx + Math.cos(a)*Rout, y2 = cy + Math.sin(a)*Rout;
      ctx.strokeStyle = (i === stepIdx) ? '#a8b3cf' : '#252b36';
      ctx.lineWidth = (i === stepIdx) ? 3 : 2;
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();

      // end button
      const on = !!active[i];
      ctx.beginPath(); ctx.arc(x2, y2, Rbtn, 0, Math.PI*2);
      ctx.fillStyle = on ? '#4caf50' : '#1a1f29';
      ctx.fill();
      ctx.strokeStyle = on ? '#6adf7a' : '#394150'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }

  // Trigger at step boundaries
  function tick(){
    const { stepIdx } = currentStepFromLoop();
    if (stepIdx !== lastStep){
      step = stepIdx; lastStep = stepIdx;
      if (playing && active[step]){
        try { const midi = baseMidi; const name = midiName(midi); if (typeof onNote==='function') onNote(midi, name, 0.9); } catch{}
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
  function getState(){ return { active:[...active], baseMidi }; }
  function setState(s){ try{ if (s?.active) active = s.active.slice(0,STEPS); if (s?.baseMidi!=null) baseMidi = s.baseMidi|0; }catch{} }

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
