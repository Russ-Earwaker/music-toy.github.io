// src/grid.js — clean rebuild
import { resizeCanvasForDPR } from './utils.js';
import { NUM_STEPS, ensureAudioContext, triggerInstrument } from './audio.js';
import { initToyUI } from './toyui.js';

export function buildGrid(selector, numSteps = NUM_STEPS, { defaultInstrument='tone', title='' } = {}){
  const shell = (typeof selector === 'string') ? document.querySelector(selector) : selector;
  if (!shell){ console.warn('[grid] missing', selector); return null; }

  const panel = shell.closest('.toy-panel') || shell;

  // Header controls
  const ui = initToyUI(panel, { toyName: 'LoopGrid', defaultInstrument });

  // Canvas
  let canvas = shell.querySelector('canvas.grid-canvas');
  if (!canvas){
    canvas = document.createElement('canvas');
    canvas.className = 'grid-canvas';
    shell.appendChild(canvas);
  }
  const ctx = canvas.getContext('2d', { alpha: false });

  // State
  const steps = new Array(numSteps).fill(null).map(()=>({ active:false, noteIndex:48, flash:0 })); // C4-ish
  let zoomed = false;
  let currentStep = -1;

  // Note helpers
  const N = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const idxToName = (i)=>{ const n=((i%12)+12)%12; const o=Math.floor(i/12)-1; return `${N[n]}${o}`; };

  // Layout helpers
  function desiredCanvasSize(){
    const pad = 6, gap = zoomed ? 6 : 2, base = zoomed ? 72 : 36;
    const w = base;
    const widthPx  = pad*2 + numSteps * w + (numSteps - 1) * gap;
    const heightPx = pad*2 + base;
    return { widthPx, heightPx, pad, gap, base };
  }
  function cellRect(i){
    const { pad, gap, base } = desiredCanvasSize();
    const w = base, h = base;
    const startX = pad;
    const x = startX + i * (w + gap);
    const y = pad;
    return { x, y, w, h };
  }

  // Events from header
  panel.addEventListener('toy-zoom', (e)=>{ zoomed = !!(e?.detail?.zoomed); if (!zoomed){ try{ panel.style.width=''; panel.style.removeProperty('width'); }catch{} } draw(); });
  panel.addEventListener('toy-random', ()=>{ steps.forEach(s=>{ s.active = Math.random() < 0.35; s.flash = s.active ? 1.0 : 0; }); draw(); });
  panel.addEventListener('toy-reset',  ()=>{ steps.forEach(s=>{ s.active = false; s.flash = 0; }); draw(); });

  // Input
  canvas.addEventListener('pointerdown', (e)=>{
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const scaleX = (canvas.width / canvas.clientWidth) || 1;
    const scaleY = (canvas.height / canvas.clientHeight) || 1;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top)  * scaleY;

    let hit = -1, r;
    // draw vertical strip behind the active column for clarity
    if (currentStep >= 0){
      const { pad, heightPx } = (function(){ const ds=desiredCanvasSize(); return { pad:6, heightPx: ds.heightPx }; })();
      const rcs = cellRect(currentStep);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(rcs.x - 2, 0, rcs.w + 4, heightPx);
    }

    for (let i=0;i<numSteps;i++){
      r = cellRect(i);
      if (px>=r.x && px<=r.x+r.w && py>=r.y && py<=r.y+r.h){ hit = i; break; }
    }
    if (hit < 0) return;
    r = cellRect(hit);

    if (zoomed){
      const dpr = window.devicePixelRatio || 1;
      const btnH = Math.max(Math.floor(r.h * 0.38), Math.floor(22 * dpr));
      if (py <= r.y + btnH){
        steps[hit].noteIndex = Math.min(87, steps[hit].noteIndex+1);
        steps[hit].active = true; steps[hit].flash = 1.0; auditionStep(hit); draw(); return;
      }
      if (py >= r.y + r.h - btnH){
        steps[hit].noteIndex = Math.max(0, steps[hit].noteIndex-1);
        steps[hit].active = true; steps[hit].flash = 1.0; auditionStep(hit); draw(); return;
      }
      steps[hit].active = !steps[hit].active;
      if (steps[hit].active){ steps[hit].flash = 1.0; auditionStep(hit); }
      draw(); return;
    } else {
      steps[hit].active = !steps[hit].active;
      if (steps[hit].active){ steps[hit].flash = 1.0; auditionStep(hit); }
      draw(); return;
    }
  });

  function auditionStep(i){
    try{
      const ac = ensureAudioContext();
      const when = ac.currentTime + 0.001;
      const n = steps[i]?.noteIndex ?? 48;
      const nn = `${N[((n%12)+12)%12]}${Math.floor(n/12)-1}`;
      const inst = ui?.instrument || 'tone';
      triggerInstrument(inst, nn, when);
    }catch{}
  }

  function draw(){
    // Fit canvas size to nodes both directions
    const { widthPx, heightPx } = desiredCanvasSize();
    const wantW = widthPx + 'px', wantH = heightPx + 'px';
    let changed=false;
    if (canvas.style.width !== wantW){ canvas.style.width = wantW; changed = true; }
    if (canvas.style.height !== wantH){ canvas.style.height = wantH; changed = true; }
    if (changed) resizeCanvasForDPR(canvas, ctx);

    const vw = canvas._vw ?? canvas.width, vh = canvas._vh ?? canvas.height;
    ctx.clearRect(0,0,vw,vh);

    // draw vertical strip behind the active column for clarity
    if (currentStep >= 0){
      const { pad, heightPx } = (function(){ const ds=desiredCanvasSize(); return { pad:6, heightPx: ds.heightPx }; })();
      const rcs = cellRect(currentStep);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(rcs.x - 2, 0, rcs.w + 4, heightPx);
    }

    for (let i=0;i<numSteps;i++){
      const r = cellRect(i);

      // background
      ctx.fillStyle = steps[i].active ? '#ff8c00' : '#2a3140';
      ctx.fillRect(r.x, r.y, r.w, r.h);

      // flash overlay
      if (steps[i].flash>0){
        ctx.fillStyle = `rgba(255,255,255,${(0.20*steps[i].flash).toFixed(3)})`;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        steps[i].flash = Math.max(0, steps[i].flash - 0.06);
      }

      // zoomed arrows + label
      if (zoomed){
        const dpr = canvas._dpr || 1;
        const stripH = Math.max(Math.floor(r.h*0.38), Math.floor(22 * dpr));
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(r.x, r.y, r.w, stripH);
        ctx.fillRect(r.x, r.y + r.h - stripH, r.w, stripH);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.font = `${Math.floor(stripH*0.7)}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`;
        ctx.fillText('▲', r.x + r.w/2, r.y + Math.floor(stripH*0.52));
        ctx.fillText('▼', r.x + r.w/2, r.y + r.h - Math.floor(stripH*0.48));
        ctx.fillStyle = steps[i].active ? '#0b0f14' : '#d7dbe7';
        ctx.font = `${Math.floor(r.h*0.42)}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`;
        ctx.fillText(idxToName(steps[i].noteIndex), r.x + r.w/2, r.y + r.h/2 + 0.5*dpr);
      }

      // current column outline
      if (i===currentStep){
        ctx.save();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
        ctx.restore();
      }
    }

    requestAnimationFrame(draw);
  }

  function markPlayingColumn(i){ currentStep = i; }
  function ping(i){ steps[i] && (steps[i].flash = 1.0); }
  function reset(){ steps.forEach(s=> s.flash = 0); currentStep = -1; }

  // Kick it off
  draw();

  return {
    element: canvas,
    steps,
    get instrument(){ return ui.instrument; },
    get muted(){ return ui.muted; },
    setInstrument: ui.setInstrument,
    markPlayingColumn,
    ping,
    reset,
    getNoteName: (i)=> idxToName(steps[i]?.noteIndex ?? 48)
  };
}

export const markPlayingColumn = (grid, i)=> grid?.markPlayingColumn?.(i);
