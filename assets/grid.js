// src/grid.js (safe for <section id="gridX"> inside a .toy-panel)
import { resizeCanvasForDPR } from './utils.js';
import { NUM_STEPS, ensureAudioContext, triggerInstrument } from './audio.js';
import { initToyUI } from './toyui.js';
import { drawBlock, drawNoteStripsAndLabel, hitTopStrip, hitBottomStrip } from './toyhelpers.js';

export function buildGrid(selector, numSteps = NUM_STEPS, { defaultInstrument='tone', title='' } = {}){
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
  panel.addEventListener('toy-zoom', (e)=>{ zoomed = !!(e?.detail?.zoomed); draw(); });
  panel.addEventListener('toy-random', ()=>{ steps.forEach(s=>{ s.active = Math.random() < 0.35; s.flash = s.active ? 1.0 : 0; }); draw(); });
  panel.addEventListener('toy-reset', ()=>{ steps.forEach(s=>{ s.active=false; s.flash=0; }); draw(); });


  // Optional title
  if (title){
    const chip = document.createElement('span');
    chip.textContent = title;
    chip.style.marginLeft = '8px';
    chip.style.opacity = '0.7';
    panel.querySelector('.toy-header')?.appendChild(chip);
  }

  
  function auditionStep(i){
    try{
      const ac = ensureAudioContext();
      const when = ac.currentTime + 0.001;
      const n = steps[i]?.noteIndex ?? 48;
      const N = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
      const nn = `${N[((n%12)+12)%12]}${Math.floor(n/12)-1}`;
      const inst = ui?.instrument || 'tone';
      triggerInstrument(inst, nn, when);
    }catch(e){}
  }
// State
  const steps = new Array(numSteps).fill(null).map(()=>({ active:false, noteIndex: 48, flash:0 })); // C4-ish
  let zoomed = false;
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
    const pad = 6;
    const gap = zoomed ? 6 : 0;
    // base square size
    const baseH = zoomed ? 72 : 36;
    const h = Math.min(baseH, vh - pad*2);
    const w = h;
    const totalWidth = numSteps * w + (numSteps - 1) * gap;
    const startX = Math.max(pad, Math.floor((vw - totalWidth) / 2));
    const x = startX + i * (w + gap);
    const y = pad;
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
    if (hit < 0) return;
    r = cellRect(hit);

    if (zoomed){
      const dpr = window.devicePixelRatio || 1;
      const btnH = Math.max(Math.floor(r.h * 0.38), Math.floor(22 * dpr));
      if (py <= r.y + btnH){
        steps[hit].noteIndex = Math.min(87, steps[hit].noteIndex+1);
        steps[hit].active = true; steps[hit].flash = 1.0; auditionStep(hit);
        draw(); return;
      }
      if (py >= r.y + r.h - btnH){
        steps[hit].noteIndex = Math.max(0, steps[hit].noteIndex-1);
        steps[hit].active = true; steps[hit].flash = 1.0; auditionStep(hit);
        draw(); return;
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
;

  function draw(){
    // Fit canvas to nodes (both directions)
    const pad = 6; const gap = zoomed ? 6 : 0; const baseH = zoomed ? 72 : 36; const h = baseH; const w = h;
    const desiredH = (h + pad*2) + 'px';
    const desiredW = (numSteps * w + (numSteps - 1) * gap + pad*2) + 'px';
    if (canvas.style.height !== desiredH || canvas.style.width !== desiredW){
      canvas.style.height = desiredH; canvas.style.width = desiredW;
      canvas.style.minWidth = desiredW; canvas.style.maxWidth = desiredW;
      canvas.style.alignSelf = 'flex-start';
      resizeCanvasForDPR(canvas, ctx);
    } else { ensureSized(); }
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
      if (zoomed){
        const dpr = canvas._dpr || 1;
        const stripH = Math.max(Math.floor(block.h*0.38), Math.floor(22 * dpr));
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(block.x, block.y, block.w, stripH);
        ctx.fillRect(block.x, block.y + block.h - stripH, block.w, stripH);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.font = `${Math.floor(stripH*0.7)}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`;
        ctx.fillText('▲', block.x + block.w/2, block.y + Math.floor(stripH*0.52));
        ctx.fillText('▼', block.x + block.w/2, block.y + block.h - Math.floor(stripH*0.48));
        ctx.fillStyle = steps[i].active ? '#0b0f14' : '#d7dbe7';
        ctx.font = `${Math.floor(block.h*0.42)}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`;
        ctx.fillText(idxToName(steps[i].noteIndex), block.x + block.w/2, block.y + block.h/2 + 0.5*dpr);
      }
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
      if (!zoomed){
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = idxToName(steps[i].noteIndex);
        const size = Math.floor(Math.min(block.w, block.h) * 0.44);
        ctx.font = `${size}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`;
        ctx.fillStyle = steps[i].active ? '#000000' : '#ffffff';
        ctx.fillText(label, block.x + block.w/2, block.y + block.h/2 + 0.5);
        if (!steps[i].active){
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#ff8c00';
          ctx.strokeRect(block.x + 1, block.y + 1, block.w - 2, block.h - 2);
        }
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
    get muted(){ return ui.muted; },
    setInstrument: ui.setInstrument,
    markPlayingColumn,
    ping,
    reset,
    getNoteName: (i)=> idxToName(steps[i]?.noteIndex ?? 48)
  };
}

export const markPlayingColumn = (grid, i)=> grid?.markPlayingColumn?.(i);
