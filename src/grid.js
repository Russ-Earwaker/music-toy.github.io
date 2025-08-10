// src/grid.js (safe for <section id="gridX"> inside a .toy-panel)
import { resizeCanvasForDPR } from './utils.js';
import { NUM_STEPS } from './audio.js';
import { initToyUI } from './toyui.js';
import { drawBlock, drawNoteStripsAndLabel, hitTopStrip, hitBottomStrip } from './toyhelpers.js';

export function buildGrid(selector, numSteps = NUM_STEPS, { defaultInstrument='Tone (Sine)', title='' } = {}){
  const shell = (typeof selector === 'string') ? document.querySelector(selector) : selector;
  if (!shell){ console.warn('[grid] missing panel', selector); return null; }

  // Find the nearest .toy-panel to host the header controls
  const panel = shell.closest('.toy-panel') || shell;

  // Ensure a header exists on the panel (initToyUI will also create one if missing)
  let header = panel.querySelector('.toy-header');
  if (!header){
    header = document.createElement('div');
    header.className = 'toy-header';
    panel.prepend(header);
  }

  // Ensure the canvas lives inside the section (shell)
  let canvas = shell.querySelector('canvas.grid-canvas');
  if (!canvas){
    canvas = document.createElement('canvas');
    canvas.className = 'grid-canvas';
    canvas.style.width = '100%';
    canvas.style.height = '120px';
    shell.appendChild(canvas);
  }
  const ctx = canvas.getContext('2d');

  // Header UI goes on the panel's header; hide add/delete
  const ui = initToyUI(panel, {
    defaultInstrument,
    addText: '',
    delText: '',
    hintAdd: '',
    hintDelete: '',
    showAdd: false,
    showDelete: false
  });

  // Optional title
  if (title){
    const chip = document.createElement('span');
    chip.textContent = title;
    chip.style.marginLeft = '8px';
    chip.style.opacity = '0.7';
    panel.querySelector('.toy-header')?.appendChild(chip);
  }

  // State
  const steps = new Array(numSteps).fill(null).map(()=>({ active:false, noteIndex: 48, flash:0 })); // C4-ish
  let currentStep = -1;

  // Note naming
  const N = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const idxToName = (i)=>{ const n=((i%12)+12)%12; const o=Math.floor(i/12)-1; return `${N[n]}${o}`; };

  // Sizing
  function ensureSized(){ if (!canvas._vw || !canvas._vh) resizeCanvasForDPR(canvas, ctx); }
  const doResize = ()=> resizeCanvasForDPR(canvas, ctx);
  window.addEventListener('resize', doResize);
  requestAnimationFrame(doResize);

  function cellRect(i){
    const vw = canvas._vw ?? canvas.width, vh = canvas._vh ?? canvas.height;
    const pad = 8, gap = 6;
    const h = Math.min(72, vh - pad*2);     // cap height (bigger squares)
    const w = h;                             // squares
    const totalWidth = numSteps * w + (numSteps - 1) * gap;
    const startX = Math.max(pad, Math.floor((vw - totalWidth) / 2));
    const x = startX + i * (w + gap);
    const y = Math.floor((vh - h)/2);
    return { x, y, w, h };
  }

  // Input
  canvas.addEventListener('pointerdown', (e)=>{
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const scaleX = (canvas.width / canvas.clientWidth) || 1;
    const scaleY = (canvas.height / canvas.clientHeight) || 1;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top)  * scaleY;

    let hit = -1, r;
    for (let i=0;i<numSteps;i++){
      r = cellRect(i);
      if (px>=r.x && px<=r.x+r.w && py>=r.y && py<=r.y+r.h){ hit = i; break; }
    }
    if (hit<0) return;

    const p = { x:px, y:py };
    if (hitTopStrip(p, r)){ steps[hit].noteIndex = Math.min(87, steps[hit].noteIndex+1); draw(); return; }
    if (hitBottomStrip(p, r)){ steps[hit].noteIndex = Math.max(0, steps[hit].noteIndex-1); draw(); return; }

    steps[hit].active = !steps[hit].active;
    draw();
  });

  function draw(){
    ensureSized();
    const vw = canvas._vw ?? canvas.width, vh = canvas._vh ?? canvas.height;
    ctx.clearRect(0,0,vw,vh);

    for (let i=0;i<numSteps;i++){
      const r = cellRect(i);
      // playhead strip
      if (i===currentStep){
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(r.x-3, 0, r.w+6, vh);
      }
      const block = { x:r.x, y:r.y, w:r.w, h:r.h, noteIndex: steps[i].noteIndex };
      const activePulse = steps[i].flash>0 || (i===currentStep && steps[i].active);
      const base = steps[i].active ? '#ff8c00' : '#000000';
      drawBlock(ctx, block, { baseColor: base, active: activePulse });
      drawNoteStripsAndLabel(ctx, block, '');
      // current column outline for tracking (even if inactive)
      if (i===currentStep){
        ctx.save();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
        ctx.restore();
      }
      // vibrant center label (keeps arrow strips visible)
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = idxToName(steps[i].noteIndex);
      const size = Math.floor(Math.min(r.w, r.h) * 0.44);
      ctx.font = `${size}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`;
      ctx.fillStyle = steps[i].active ? '#000000' : '#ffffff';
      ctx.fillText(label, r.x + r.w/2, r.y + r.h/2 + 0.5);
      // orange border when inactive for clarity
      if (!steps[i].active){
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ff8c00';
        ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      }
      ctx.restore();
      if (steps[i].flash>0) steps[i].flash = Math.max(0, steps[i].flash - 0.06);
    }
    requestAnimationFrame(draw);
  }
  draw();

  function markPlayingColumn(i){ currentStep = i; }
  function ping(i){ if (i>=0 && i<numSteps) steps[i].flash = 1.0; }
  function reset(){ steps.forEach(s => s.active=false); currentStep = -1; }

  return {
    element: canvas,
    steps,
    get instrument(){ return ui.instrument; },
    setInstrument: ui.setInstrument,
    markPlayingColumn,
    ping,
    reset,
    getNoteName: (i)=> idxToName(steps[i]?.noteIndex ?? 48)
  };
}

export const markPlayingColumn = (grid, i)=> grid?.markPlayingColumn?.(i);
