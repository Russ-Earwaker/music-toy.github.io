// src/grid.js — unified sizing/zoom + simple step grid (clean, C4 defaults)
import { resizeCanvasForDPR, noteList } from './utils.js';
import { NUM_STEPS, ensureAudioContext, triggerInstrument } from './audio.js';
import { initToyUI } from './toyui.js';
import { initToySizing, drawNoteStripsAndLabel, NOTE_BTN_H } from './toyhelpers.js';

export function buildGrid(selector, numSteps = NUM_STEPS, { defaultInstrument='tone', title='LoopGrid' } = {}){
  const shell = (typeof selector === 'string') ? document.querySelector(selector) : selector;
  if (!shell){ console.warn('[grid] missing', selector); return null; }

  const panel = shell.closest?.('.toy-panel') || shell;
  const ui = initToyUI(panel, { toyName: title, defaultInstrument });

  // Canvas
  const canvas = document.createElement('canvas');
  canvas.className = 'grid-canvas';
  canvas.style.display = 'block';
  canvas.style.touchAction = 'none';
  const ctx = canvas.getContext('2d', { alpha: false });
  const body = panel.querySelector?.('.toy-body') || panel;
  body.appendChild(canvas);

  // Shared sizing/zoom: width-driven; aspect ties height to width
  const sizing = initToySizing(panel, canvas, ctx, { squareFromWidth: false, aspectFrom: (w)=> Math.round(Math.max(80, w*0.22)) });
  const vw = sizing.vw, vh = sizing.vh;

  // Model (default all steps to C4)
  const c4Index = (noteList.indexOf('C4') >= 0 ? noteList.indexOf('C4') : 60) % noteList.length;
  const steps = new Array(numSteps).fill(0).map(()=>(
    { active:false, flash:0, noteIndex: c4Index }
  ));
  let currentStep = -1;

  function layout(){
    const w = vw(), h = vh();
    const pad = 6;
    const innerW = w - pad*2;
    const innerH = h - pad*2;
    const colW = innerW / numSteps;
    return { pad, innerW, innerH, colW, w, h };
  }

  function draw(){
    resizeCanvasForDPR(canvas, ctx);
    const { w, h, pad, innerH, colW } = layout();

    // bg
    ctx.fillStyle = '#0b0f15';
    ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.strokeRect(0.5,0.5,w-1,h-1);

    // playing column strip
    if (currentStep >= 0){
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      const x = pad + currentStep * colW;
      ctx.fillRect(x, pad, colW, innerH);
    }

    // steps
    for (let i=0;i<numSteps;i++){
      const s = steps[i];
      const x = pad + i * colW + 3;
      const wBox = colW - 6;
      const hBox = Math.min(innerH - 6, wBox);
      const y = pad + 3 + Math.max(0, ((innerH - 6) - hBox) / 2);

      // fill
      ctx.fillStyle = s.active ? '#ff8c00' : '#1e2a38';
      ctx.fillRect(x,y,wBox,hBox);

      // flash overlay
      if (s.flash > 0){
        ctx.fillStyle = `rgba(255,255,255,${0.35*Math.min(1,s.flash)})`;
        ctx.fillRect(x,y,wBox,hBox);
        s.flash = Math.max(0, s.flash - 0.06);
      }

      // outline
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.strokeRect(x+0.5,y+0.5,wBox-1,hBox-1);

      // advanced zoom UI
      if (sizing.scale > 1){
        drawNoteStripsAndLabel(ctx, {x, y, w: wBox, h: hBox}, noteList[s.noteIndex % noteList.length]);
      }
    }

    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  // Events
  panel.addEventListener('toy-zoom', (e)=>{
    sizing.setZoom(!!(e?.detail?.zoomed));
  });
  panel.addEventListener('toy-random', ()=>{
    for (const s of steps){
      s.active = Math.random() < 0.4;
      s.flash = s.active ? 1.0 : 0;
      s.noteIndex = Math.floor(Math.random() * noteList.length);
    }
  });
  panel.addEventListener('toy-reset', ()=>{
    for (const s of steps){ s.active = false; s.flash = 0; s.noteIndex = c4Index; }
  });

  // Input
  canvas.addEventListener('pointerdown', (e)=>{
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const { pad, colW, innerH } = layout();
    const i = Math.max(0, Math.min(numSteps-1, Math.floor((px - pad) / colW)));
    const x = pad + i * colW + 3;
    const wBox = colW - 6;
    const hBox = Math.min(innerH - 6, wBox);
    const y = pad + 3 + Math.max(0, ((innerH - 6) - hBox) / 2);

    const within = (px >= x && px <= x + wBox && py >= y && py <= y + hBox);
    if (!within) return;
    const s = steps[i];

    if (sizing.scale > 1){
      const localY = py - y;
      if (localY <= NOTE_BTN_H){ s.noteIndex = (s.noteIndex + 1) % noteList.length; return; }
      if (localY >= hBox - NOTE_BTN_H){ s.noteIndex = (s.noteIndex - 1 + noteList.length) % noteList.length; return; }
    }
    s.active = !s.active;
    s.flash = s.active ? 1.0 : 0;
  });

  // API for scheduler
  function markPlayingColumn(i){
    currentStep = (i >= 0 && i < numSteps) ? i : -1;
    if (i >= 0 && steps[i]?.active){
      triggerInstrument(ui.instrument, noteList[steps[i].noteIndex % noteList.length], ensureAudioContext().currentTime);
      steps[i].flash = 1.0;
    }
  }
  function ping(i){ if (i>=0 && i<numSteps) steps[i].flash = 1.0; }
  function reset(){ for (const s of steps){ s.active=false; s.flash=0; s.noteIndex=c4Index; } }

  return {
    element: canvas,
    steps,
    setInstrument: ui.setInstrument,
    get instrument(){ return ui.instrument; },
    markPlayingColumn,
    ping,
    reset
  };
}

export const markPlayingColumn = (grid, i)=> grid?.markPlayingColumn?.(i);
