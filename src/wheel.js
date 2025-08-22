// src/wheel.js — unified with generic toy UI/frames
// 16 spokes (16ths). Higher pitch = farther from center (0..11 semitones).
// Starts empty. Click to add/delete. Drag moves nearest handle.
// Uses toyui.js (header: Zoom / Random / Reset / Mute) + toyhelpers-sizing.js for sizing.

import { resizeCanvasForDPR, clamp } from './utils.js';
import { initToyUI } from './toyui.js';
import { initToySizing } from './toyhelpers-sizing.js';
import { randomizeWheel } from './wheel-random.js';

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const STEPS = 16, SEMIS = 12;

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

  // Generic header & controls
  const ui = initToyUI(panel, {
    toyName: title,
    defaultInstrument,
    onRandom: () => doRandom(),
    onReset: () => doReset()
  });

  // Canvas in body
  const canvas = document.createElement('canvas');
  canvas.className = 'wheel-canvas';
  canvas.style.display = 'block';
  (panel.querySelector?.('.toy-body') || panel).appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Sizing (consistent with Rippler): squareFromWidth + proper zoom
  const sizing = initToySizing(panel, canvas, ctx, { squareFromWidth: true });

  // World size helpers (use canvas size, which already excludes header)
  const worldW = ()=> (canvas.clientWidth  || panel.clientWidth  || 356);
  const worldH = ()=> (canvas.clientHeight || panel.clientHeight || 260);

  // Model
  const handles = Array(STEPS).fill(null); // per-step semitone or null
  let baseMidi = 60;   // C4
  let playing = true;
  let step = 0;
  let lastTime = performance.now();
  let phase = 0;

  // Geometry (with top/bottom padding to avoid touching header)
  function radii(){
    const s = Math.min(worldW(), worldH());
    const padTop = Math.max(12, s*0.06);
    const padBottom = Math.max(12, s*0.06);
    const usableH = Math.max(40, worldH() - (padTop + padBottom));
    const baseRout = s*0.46;
    const rscale = Math.min(1, (usableH/2) / baseRout);
    const Rmin = s*0.18 * rscale;
    const Rmax = s*0.44 * rscale;
    const Rout = s*0.46 * rscale;
    const cx = worldW()/2;
    const cy = padTop + usableH/2;
    return { cx, cy, Rmin, Rmax, Rout };
  }
  const spokeAngle = (i)=> (-Math.PI/2 + (i/STEPS)*Math.PI*2); // 0 at 12 o'clock, clockwise

  function angleToSpokeFromAtan(ang){
    const TWO = Math.PI*2;
    while (ang < 0) ang += TWO;
    while (ang >= TWO) ang -= TWO;
    let diff = ang + Math.PI/2; if (diff >= TWO) diff -= TWO;
    return Math.round((diff / TWO) * STEPS) % STEPS;
  }

  function handlePos(i){
    const v = handles[i]; if (v == null) return null;
    const { cx, cy, Rmin, Rmax } = radii();
    const t = v/(SEMIS-1);
    const r = Rmin + t*(Rmax - Rmin);
    const a = spokeAngle(i);
    return { x: cx + Math.cos(a)*r, y: cy + Math.sin(a)*r, r, a };
  }

  function nearestHandle(x, y, maxPx=18){
    let best=null, bestD=maxPx;
    for (let i=0;i<STEPS;i++){
      const p = handlePos(i); if (!p) continue;
      const d = Math.hypot(p.x-x, p.y-y);
      if (d < bestD){ bestD=d; best={spoke:i, ...p, d}; }
    }
    return best;
  }

  function posToSpokeSemi(x, y){
    const { cx, cy, Rmin, Rmax } = radii();
    const dx = x - cx, dy = y - cy;
    const ang = Math.atan2(dy, dx); // screen-down y; matches draw
    const spoke = angleToSpokeFromAtan(ang);
    const dist = Math.hypot(dx, dy);
    const t = clamp((dist - Rmin)/(Rmax - Rmin), 0, 1);
    const semi = Math.round(t*(SEMIS-1));
    return { spoke, semi, dist };
  }

  // Interaction (click to add/delete; drag moves nearest existing handle)
  let drag = null; // { startX, startY, wasOnHandle, moved }
  canvas.addEventListener('pointerdown', (e)=>{
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const near = nearestHandle(x, y, 16);
    if (near){
      drag = { startX:x, startY:y, wasOnHandle:true, moved:false };
    } else {
      const { cx, cy, Rmin, Rmax } = radii();
      const dist = Math.hypot(x-cx, y-cy);
      if (dist >= Rmin - 6 && dist <= Rmax + 6){
        const { spoke, semi } = posToSpokeSemi(x, y);
        handles[spoke] = semi;
        drag = { startX:x, startY:y, wasOnHandle:false, moved:false };
      } else {
        drag = null;
      }
    }
    if (drag){ canvas.setPointerCapture?.(e.pointerId); e.preventDefault(); }
  });
  window.addEventListener('pointermove', (e)=>{
    if (!drag) return;
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (Math.abs(x-drag.startX)>2 || Math.abs(y-drag.startY)>2) drag.moved = true;
    const near = nearestHandle(x, y, 64);
    if (near){
      const { semi } = posToSpokeSemi(x, y);
      handles[near.spoke] = semi;
    }
  }, true);
  window.addEventListener('pointerup', (e)=>{
    if (!drag) return;
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (drag.wasOnHandle && !drag.moved){
      const near = nearestHandle(x, y, 18);
      if (near) handles[near.spoke] = null;
    }
    drag = null;
    canvas.releasePointerCapture?.(e.pointerId);
  }, true);
  window.addEventListener('pointercancel', ()=>{ drag=null; }, true);
  // Random / Reset (musical)
  function doRandom(){
    const pr = Number(panel?.dataset?.priority || '1') || 1;
    const toyId = (panel?.dataset?.toy || 'wheel').toLowerCase();
    randomizeWheel(handles, { toyId, priority: pr });
  }
  function doReset(){ for (let i=0;i<STEPS;i++) handles[i] = null; }

  panel.addEventListener('toy-random', doRandom);
  panel.addEventListener('toy-reset', doReset);

  // Draw
  function draw(){
    resizeCanvasForDPR(canvas, ctx);
    const W = canvas.width, H = canvas.height;
    const { cx, cy, Rmin, Rout } = radii();

    // bg
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = '#0d1117'; ctx.fillRect(0,0,W,H);

    // spokes
    ctx.strokeStyle = '#252b36'; ctx.lineWidth = 2;
    for (let i=0;i<STEPS;i++){
      const a = spokeAngle(i);
      const x1 = cx + Math.cos(a)*Rmin, y1 = cy + Math.sin(a)*Rmin;
      const x2 = cx + Math.cos(a)*Rout, y2 = cy + Math.sin(a)*Rout;
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    }

    // connection loop through active handles
    const pts = [];
    for (let i=0;i<STEPS;i++){ const p = handlePos(i); if (p) pts.push({i, x:p.x, y:p.y}); }
    if (pts.length > 1){
      ctx.strokeStyle = '#394150'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (let k=1;k<pts.length;k++){ ctx.lineTo(pts[k].x, pts[k].y); }
      ctx.lineTo(pts[0].x, pts[0].y);
      ctx.stroke();
    }

    // handles (highlight current step)
    for (let i=0;i<STEPS;i++){
      const p = handlePos(i); if (!p) continue;
      const isNow = (i === step);
      ctx.fillStyle = isNow ? '#f4932f' : '#e6e8ef';
      ctx.beginPath(); ctx.arc(p.x|0, p.y|0, isNow?7:5, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#11151d'; ctx.lineWidth = 1; ctx.stroke();
    }
  }

  // Timing loop
  function tick(dt){
    const bpm = getBpm ? getBpm() : 120;
    const stepDur = (60/bpm)/4; // 16th
    phase += dt/1000/stepDur;
    while (phase >= 1){
      phase -= 1;
      const semi = handles[step];
      if (semi != null){
        const midi = baseMidi + semi;
        const name = midiName(midi);
        const vel = 0.9;
        if (typeof onNote === 'function') { try { onNote(midi, name, vel); } catch {} }
      }
      step = (step + 1) % STEPS;
    }
  }

  function loop(now){
    const dt = Math.min(100, now - lastTime); lastTime = now;
    if (playing) tick(dt);
    draw(); requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Zoom + keys
  panel.dataset.toy = 'wheel';
  panel.addEventListener('toy-zoom', (e)=> sizing.setZoom?.(!!e?.detail?.zoomed));
  panel.tabIndex = 0;
  panel.addEventListener('keydown', (e)=>{
    if (e.key === 'ArrowUp'){ baseMidi += 12; e.preventDefault(); }
    else if (e.key === 'ArrowDown'){ baseMidi -= 12; e.preventDefault(); }
  });

  // Public API (match other toys)
  return {
    element: canvas,
    setInstrument: ui.setInstrument,
    get instrument(){ return ui.instrument; },
    reset: doReset,
    onLoop: ()=>{} // no-op; timing handled internally
  };
}
