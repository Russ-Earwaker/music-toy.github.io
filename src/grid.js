// src/grid.js — add internal bottom safe area; dark column glow; click-safe header from toyui
import { NUM_STEPS } from './audio.js';
import { initToyUI } from './toyui.js';

function dprResize(canvas, desiredHeightPx){
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const cssW = canvas.clientWidth || canvas.parentElement.clientWidth || 600;
  const cssH = desiredHeightPx;
  canvas.width  = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width  = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas._vw = canvas.width;
  canvas._vh = canvas.height;
  canvas._dpr = dpr;
}

export function buildGrid(selector, numSteps = NUM_STEPS, { defaultInstrument='tone' } = {}){
  const shell = (typeof selector === 'string') ? document.querySelector(selector) : selector;
  if (!shell){ console.warn('[grid] missing', selector); return null; }

  let canvas = shell.querySelector('canvas.grid-canvas');
  if (!canvas){
    canvas = document.createElement('canvas');
    canvas.className = 'grid-canvas';
    shell.appendChild(canvas);
  }
  const ctx = canvas.getContext('2d');

  const ui = initToyUI(shell, { defaultInstrument, onRandom: ()=> randomize(), onReset: ()=> reset() });

  const steps = new Array(numSteps).fill(null).map(()=>({ active:false, noteIndex: 48, flash:0 }));
  let currentStep = -1;
  const NOTE = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const idxToName = (i)=>{ const n=((i%12)+12)%12; const o=Math.floor(i/12)-1; return `${NOTE[n]}${o}`; };

  let zoomed = false;
  shell.addEventListener('toy-zoom', (e)=>{ zoomed = !!e.detail?.zoomed; layoutAndDraw(); });

  // Reserve explicit bottom safe area inside the canvas
  const BOTTOM_SAFE_CSS = 32;

  function layoutAndDraw(){
    const baseH = zoomed ? 190 : 140; // taller base
    dprResize(canvas, baseH + BOTTOM_SAFE_CSS);
    draw();
  }
  window.addEventListener('resize', layoutAndDraw);
  setTimeout(layoutAndDraw, 0);

  function cellRect(i){
    const pad = 8, gap = 6;
    const vw = canvas._vw, vh = canvas._vh, dpr = canvas._dpr || 1;
    const innerW = vw - pad*2*dpr;
    const w = Math.floor((innerW - (numSteps-1)*gap*dpr) / numSteps);
    const h = zoomed ? Math.floor(w*0.9) : w;
    // place cells with top gap small, and bottom reserved
    const usableH = vh - (BOTTOM_SAFE_CSS*dpr);
    const x = Math.floor(pad*dpr + i*(w + gap*dpr));
    const y = Math.max(4*dpr, Math.floor((usableH - h)/2));
    return { x, y, w, h };
  }

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

    if (!zoomed){
      steps[hit].active = !steps[hit].active;
    } else {
      const topStripH = Math.max(6, Math.floor(r.h*0.16));
      const bottomStripH = topStripH;
      if (py <= r.y + topStripH) { steps[hit].noteIndex = Math.min(87, steps[hit].noteIndex+1); }
      else if (py >= r.y + r.h - bottomStripH) { steps[hit].noteIndex = Math.max(0, steps[hit].noteIndex-1); }
      else { steps[hit].active = !steps[hit].active; }
    }
    draw();
  });

  function randomize(){
    for (let i=0;i<numSteps;i++){
      steps[i].active = Math.random() < 0.45;
      if (zoomed){
        const d = (Math.random()<0.5?-1:1) * Math.floor(Math.random()*3);
        steps[i].noteIndex = Math.max(0, Math.min(87, steps[i].noteIndex + d));
      }
    }
    draw();
  }

  function drawColumnGlow(columnRect){
    const { x, w } = columnRect;
    const vw = canvas._vw, vh = canvas._vh;
    const grad = ctx.createLinearGradient(x - w*0.8, 0, x + w*1.8, 0);
    grad.addColorStop(0.0, 'rgba(255,255,255,0.00)');
    grad.addColorStop(0.25,'rgba(255,255,255,0.05)');
    grad.addColorStop(0.50,'rgba(255,255,255,0.09)');
    grad.addColorStop(0.75,'rgba(255,255,255,0.05)');
    grad.addColorStop(1.0, 'rgba(255,255,255,0.00)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - w, 0, w*3, vh);
  }

  function draw(){
    const vw = canvas._vw, vh = canvas._vh, dpr = canvas._dpr || 1;
    ctx.clearRect(0,0,vw,vh);

    if (currentStep >= 0){
      const currentRect = cellRect(currentStep);
      drawColumnGlow(currentRect);
    }

    for (let i=0;i<numSteps;i++){
      const r = cellRect(i);
      const base = steps[i].active ? '#ff8c00' : '#0d1117';
      const stroke = steps[i].active ? '#0b0f14' : '#2b313b';
      const active = steps[i].flash>0 || (i===currentStep && steps[i].active);

      ctx.save();
      // block
      ctx.fillStyle = base;
      roundRect(ctx, r.x, r.y, r.w, r.h, Math.floor(r.w*0.12));
      ctx.fill();
      // inner bevel
      ctx.strokeStyle = stroke;
      ctx.lineWidth = Math.max(1, Math.floor(1*dpr));
      roundRect(ctx, r.x+1*dpr, r.y+1*dpr, r.w-2*dpr, r.h-2*dpr, Math.floor(r.w*0.10));
      ctx.stroke();
      // pulse overlay
      if (active){
        const a = steps[i].flash>0 ? 0.18*steps[i].flash : 0.10;
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        roundRect(ctx, r.x, r.y, r.w, r.h, Math.floor(r.w*0.12));
        ctx.fill();
      }
      // zoomed pitch strips + label
      if (zoomed){
        const stripH = Math.max(6, Math.floor(r.h*0.16));
        ctx.fillStyle = 'rgba(255,255,255,.08)';
        ctx.fillRect(r.x, r.y, r.w, stripH);
        ctx.fillRect(r.x, r.y + r.h - stripH, r.w, stripH);

        ctx.fillStyle = steps[i].active ? '#0b0f14' : '#d7dbe7';
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.font = `${Math.floor(r.h*0.40)}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`;
        ctx.fillText(idxToName(steps[i].noteIndex), r.x + r.w/2, r.y + r.h/2 + 0.5*dpr);
      }
      ctx.restore();

      if (steps[i].flash>0) steps[i].flash = Math.max(0, steps[i].flash - 0.06);
    }
    requestAnimationFrame(draw);
  }
  draw();

  function roundRect(ctx, x, y, w, h, r){
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y, x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x, y+h, r);
    ctx.arcTo(x, y+h, x, y, r);
    ctx.arcTo(x, y, x+w, y, r);
    ctx.closePath();
  }

  function reset(){ steps.forEach(s=> s.active=false); currentStep=-1; draw(); }
  function _markPlayingColumn(i){ currentStep = i; }
  function ping(i){ if (i>=0 && i<numSteps) steps[i].flash = 1.0; }

  return {
    element: canvas,
    steps,
    channel: ui.channel,
    get instrument(){ return ui.instrument; },
    setInstrument: ui.setInstrument,
    markPlayingColumn: _markPlayingColumn,
    ping, reset,
    getNoteName: (i)=> idxToName(steps[i]?.noteIndex ?? 48)
  };
}

// Export wrapper used by main.js
export function markPlayingColumn(grid, i){
  grid?.markPlayingColumn?.(i);
}
