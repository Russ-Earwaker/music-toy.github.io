// src/grid.js — step grid with zoom-only cube controls (top=up, mid=toggle, bot=down)
import { resizeCanvasForDPR, noteList } from './utils.js';
import { NUM_STEPS } from './audio-core.js';
import { initToyUI } from './toyui.js';
import { drawTileLabelAndArrows } from './ui-tiles.js';
import { initToySizing, drawNoteStripsAndLabel, NOTE_BTN_H, whichThirdRect, drawThirdsGuides } from './toyhelpers.js';

function nextGridId(){ try { const g = (typeof window!=='undefined'?window:globalThis); g.__GRID_ID_COUNTER = (g.__GRID_ID_COUNTER|0) + 1; return `grid-${g.__GRID_ID_COUNTER}`; } catch { return `grid-${Math.floor(Math.random()*1e6)}`; } }

export function buildGrid(selector, numSteps = NUM_STEPS, { defaultInstrument='tone', title='LoopGrid' } = {}){
  const shell = (typeof selector === 'string') ? document.querySelector(selector) : selector;
  if (!shell){ console.warn('[grid] missing', selector); return null; }

  const panel = shell.closest?.('.toy-panel') || shell;
  const ui = initToyUI(panel, { toyName: title, defaultInstrument });
  /*__GRID_TOYID_INSERTED__*/
  let toyId = (panel && panel.dataset && panel.dataset.toy) ? String(panel.dataset.toy).toLowerCase() : '';
  if (!toyId || /^(grid|loopgrid)(?:-\d+)?$/.test(toyId)) {
    toyId = nextGridId();
    if (panel && panel.dataset) panel.dataset.toy = toyId;
  } else {
    if (panel && panel.dataset) panel.dataset.toy = toyId;
  }
const canvas = document.createElement('canvas');
  canvas.className = 'grid-canvas';
  canvas.style.display = 'block';
  shell.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const sizing = initToySizing(panel, canvas, ctx);
  function worldW(){ return panel.clientWidth  || 356; }
  function worldH(){ return panel.clientHeight || 280; }

  const c4Index = Math.max(0, noteList.indexOf('C4')) || 36;
  const steps = Array.from({length:numSteps}, ()=>({ active:false, flash:0, noteIndex:c4Index }));

  function layout(){
    const pad = 10;
    const w = worldW(), h = worldH();
    const boxW = Math.max(24, (w - pad*2) / numSteps - 6);
    const boxH = Math.max(40, Math.min(90, h - pad*2 - NOTE_BTN_H));
    const y = pad + NOTE_BTN_H;
    for (let i=0;i<numSteps;i++){
      const x = pad + i * (boxW + 6);
      steps[i]._rect = { x, y, w: boxW, h: boxH };
    }
  }

  function draw(){
    resizeCanvasForDPR(canvas, ctx);
    layout();

    const now = performance.now()/1000;
    const w = worldW(), h = worldH();

    // background strips/label at top
    drawNoteStripsAndLabel(ctx, panel, 0, 0, w, NOTE_BTN_H, ui.instrument || defaultInstrument);

    // draw steps
    for (let i=0;i<steps.length;i++){
      const s = steps[i];
      const r = s._rect;
      // block base
      ctx.save();
      ctx.beginPath();
      const rad = 8 * (sizing.scale || 1);
      ctx.fillStyle = s.active ? '#f4932f' : '#293042';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      if (s.flash>0){
        ctx.globalAlpha = Math.min(1, s.flash);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.globalAlpha = 1;
        s.flash = Math.max(0, s.flash - 0.06);
      }

      // zoom-only thirds boundaries
      if (panel.classList.contains('toy-zoomed')){ drawThirdsGuides(ctx, r); }
      // zoom-only thirds boundaries
      if (panel.classList.contains('toy-zoomed')){ drawThirdsGuides(ctx, r); }

      // outline
      ctx.strokeStyle = '#11151d'; ctx.lineWidth = 2; ctx.strokeRect(r.x+0.5, r.y+0.5, r.w-1, r.h-1);
            const label = noteList[(s.noteIndex % noteList.length + noteList.length) % noteList.length] || '';
      drawTileLabelAndArrows(ctx, r, { label, active: s.active, zoomed: panel.classList.contains('toy-zoomed') });
ctx.restore();
    }

    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  /* unified via whichThirdRect in toyhelpers */
  function whichThird(r, y){
    const t1 = r.y + r.h/3, t2 = r.y + 2*r.h/3;
    if (y < t1) return 'up';
    if (y < t2) return 'toggle';
    return 'down';
  }

  canvas.addEventListener('pointerdown', (e)=>{
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    for (let i=0;i<steps.length;i++){
      const r = steps[i]._rect; if (!r) continue;
      if (px>=r.x && px<=r.x+r.w && py>=r.y && py<=r.y+r.h){
        if (panel.classList.contains('toy-zoomed')){
          const third = whichThirdRect(r, py);
          if (third==='up') steps[i].noteIndex = Math.min(noteList.length-1, steps[i].noteIndex+1);
          else if (third==='down') steps[i].noteIndex = Math.max(0, steps[i].noteIndex-1);
          else steps[i].active = !steps[i].active;
        } else {
          steps[i].active = !steps[i].active;
        }
        steps[i].flash = 0.4;
        break;
      }
    }
  });

  function markPlayingColumn(i){ if (i>=0 && i<steps.length) { steps[i].flash = 0.6; } }
  function ping(i){ if (i>=0 && i<steps.length) { steps[i].flash = 1.0; } }
  function reset(){ for (const s of steps){ s.active=false; s.flash=0; s.noteIndex=c4Index; } }

  return {
    toyId,
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