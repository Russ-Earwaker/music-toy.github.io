// src/grid.js — robust step grid with polite random + intensity hookup
import { resizeCanvasForDPR, noteList, clamp } from './utils.js';
import { NUM_STEPS } from './audio-core.js';
import { triggerInstrument } from './audio-samples.js';
import { initToyUI } from './toyui.js';
import { drawTileLabelAndArrows } from './ui-tiles.js';
import { initToySizing, drawNoteStripsAndLabel, NOTE_BTN_H, whichThirdRect, drawThirdsGuides } from './toyhelpers.js';
import { gateTriggerForToy } from './toy-audio.js';
import { getPoliteDensity } from './polite-random.js';

function nextGridId(){
  try {
    const g = (typeof window!=='undefined' && window.__gridIds__) || (window.__gridIds__ = { n:0 });
    return 'grid-' + (++g.n);
  } catch {
    return `grid-${Math.floor(Math.random()*1e6)}`;
  }
}

export function buildGrid(selector, numSteps = NUM_STEPS, { defaultInstrument='tone', title='LoopGrid' } = {}){
  try{ console.log('[grid] build start', selector); }catch{}
  const shell = (typeof selector === 'string') ? document.querySelector(selector) : selector;
  if (!shell){ console.warn('[grid] missing', selector); return null; }

  const panel = shell.closest?.('.toy-panel') || shell;
  const toyId = panel.dataset.toy || nextGridId();
  panel.dataset.toy = toyId;
  if (!panel.id) panel.id = 'panel-' + toyId;

  const ui = initToyUI(panel, { toyName: title, defaultInstrument });

  // Ensure a content body exists for drawing
  let body = panel.querySelector('.toy-body');
  if (!body){
    body = document.createElement('div');
    body.className = 'toy-body';
    // Keep consistent padding with your styles
    body.style.position = 'relative';
    body.style.padding = '10px';
    panel.appendChild(body);
  }
  const gatedTrigger = gateTriggerForToy(toyId, triggerInstrument);

  const canvas = document.createElement('canvas');
  canvas.className = 'grid-canvas';
  canvas.style.display = 'block';
  body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  try{ console.log('[grid] canvas created', {panel, toyId}); }catch{}

  const sizing = initToySizing(panel, canvas, ctx);
  const worldW = ()=> (sizing?.vw?.() || body.clientWidth || 356);
  const worldH = ()=> (sizing?.vh?.() || body.clientHeight || 240);

  const c4Index = Math.max(0, noteList.indexOf('C4'));
  let currentCol = -1;
  const steps = Array.from({length:numSteps}, ()=>({ active:false, flash:0, noteIndex:c4Index }));

  function layout(){
    const pad = 10;
    const w = worldW(), h = worldH();
    resizeCanvasForDPR(canvas, ctx);
    const gridTop = NOTE_BTN_H + pad*1.2;
    const cellW = Math.max(24, Math.floor((w - pad*2) / steps.length));
    const cellH = Math.floor((h - gridTop - pad*1.5));
    return { pad, w, h, gridTop, cellW, cellH };
  }

  function draw(){
    const L = layout();
    const { w, h, pad, gridTop, cellW, cellH } = L;
    ctx.clearRect(0,0,w,h);
    // DEBUG draw probe: light tint to confirm paint (remove later)
    ctx.fillStyle = 'rgba(0,128,255,0.05)';
    ctx.fillRect(0,0,w,h);
    if (!window.__gridLoggedOnce){ window.__gridLoggedOnce = true; try {
      const r = canvas.getBoundingClientRect();
      console.log('[grid] draw', {w, h});
      console.log('[grid] rect', r);
    } catch{} }
    canvas.style.background = 'rgba(0,128,255,0.08)';

    // Guard: if panel hasn't laid out yet, assign a minimum drawing area
    const minW = Math.max(200, w || 0);
    const minH = Math.max(140, h || 0);
    if (minW !== w || minH !== h){
      resizeCanvasForDPR(canvas, minW, minH);
    }


    // Background guides + note strips
    const headerBounds = { x: 0, y: 0, w, h };
    drawNoteStripsAndLabel(ctx, headerBounds, ui.instrument);

    // Cells
    for (let i=0;i<steps.length;i++){
      const x = pad + i * cellW;
      const y = gridTop;
      const s = steps[i];

      // Cell background
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(x+1, y, cellW-2, cellH);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x+0.5, y+0.5, cellW-1, cellH-1);

      // Active fill
      if (s.active){
        const hue = 200;
        const a = 0.55; // make clearly visible
        ctx.fillStyle = `hsla(${hue},70%,52%,${a})`;
        ctx.fillRect(x+3, y+3, cellW-6, cellH-6);
        ctx.strokeStyle = `hsla(${hue},80%,70%,0.9)`;
        ctx.lineWidth = 2;
        ctx.strokeRect(x+2.5, y+2.5, cellW-5, cellH-5);
      }

      // Note label+arrows at the top of each cell
      const r = { x, y: y- NOTE_BTN_H, w: cellW, h: NOTE_BTN_H };
      const label = noteList[s.noteIndex] || '?';
      drawTileLabelAndArrows(ctx, r, { label, active: s.active, zoomed: panel.classList.contains('toy-zoomed') });
    }

    // Playhead overlay
    if (currentCol >= 0){
      const xph = pad + currentCol * cellW;
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(xph, gridTop, cellW, cellH);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(xph+1, gridTop+1, cellW-2, cellH-2);
    }

    // Thirds guides overlay (tap areas)
    drawThirdsGuides(ctx, { x:0, y:gridTop, w, h: cellH });
  }

  function ping(i){
    const s = steps[i]; if (!s) return;
    s.flash = 1;
    // decay later
    setTimeout(()=>{ s.flash = Math.max(0, s.flash - 0.5); }, 60);
    setTimeout(()=>{ s.flash = Math.max(0, s.flash - 0.5); }, 120);
  }

  function setNoteIndex(i, delta){
    const s = steps[i]; if (!s) return;
    const N = noteList.length;
    let ni = (s.noteIndex + delta + N) % N;
    s.noteIndex = ni;
  }

  function toggle(i){ const s = steps[i]; if (s) s.active = !s.active; }

  function whichCell(pt){
    const L = layout();
    const { pad, gridTop, cellW, cellH } = L;
    if (pt.y < gridTop) return null;
    const i = Math.floor((pt.x - pad) / cellW);
    if (i < 0 || i >= steps.length) return null;
    const x = pad + i * cellW;
    const y = gridTop;
    return { i, rect: { x, y, w: cellW, h: cellH } };
  }

  function onPointer(ev){
    const bounds = canvas.getBoundingClientRect();
    const x = (ev.clientX - bounds.left);
    const y = (ev.clientY - bounds.top);
    const hit = whichCell({ x, y });
    if (!hit) return;
    const { i, rect } = hit;
    const where = whichThirdRect(rect, y);
    if (where === 'up') setNoteIndex(i, +1);
    else if (where === 'toggle') toggle(i);
    else if (where === 'down') setNoteIndex(i, -1);
    draw();
  }

  canvas.addEventListener('click', onPointer);

  function clear(){
    for (const s of steps){ s.active=false; s.flash=0; s.noteIndex=c4Index; }
    draw();
  }

  function doRandom({ baseDensity=1, priority=1 } = {}){
    // Respect global polite density
    const density = getPoliteDensity(baseDensity, priority);
    const N = steps.length;
    // default: ~35% fill at density=1
    const target = Math.max(1, Math.round(N * 0.35 * density));
    for (const s of steps){ s.active = false; }
    // choose positions spaced apart
    const chosen = new Set();
    while (chosen.size < target){
      const idx = Math.floor(Math.random() * N);
      chosen.add(idx);
    }
    // minor pentatonic-ish offsets around C4
    const scale = [0, 3, 5, 7, 10];
    try{ console.log('[grid] random target', target); }catch{}
    for (const idx of chosen){
      const oct = (Math.random() < 0.6) ? 0 : (Math.random() < 0.5 ? 1 : -1);
      const off = scale[ Math.floor(Math.random()*scale.length) ];
      const base = c4Index + off + (12 * oct);
      steps[idx].active = true;
      steps[idx].noteIndex = clamp(base, 0, noteList.length-1);
    }
    draw();
  }


  // Listen to toyui toolbar events
  panel.addEventListener('toy-random', ()=>{
    const pr = Number(panel.dataset.priority || '1') || 1;
    doRandom({ baseDensity: 1, priority: pr });
  });
  panel.addEventListener('toy-reset', clear);

  // Hook random/clear buttons if present in the panel (non-destructive)
  try {
    const randBtn = panel.querySelector('[data-random]');
    if (randBtn){
      randBtn.addEventListener('click', ()=>{
        const pr = Number(panel.dataset.priority || '1') || 1;
        doRandom({ baseDensity: 1, priority: pr });
      });
    }
    const clearBtn = panel.querySelector('[data-clear]');
    if (clearBtn) clearBtn.addEventListener('click', clear);
  } catch {}

  function markPlayingColumn(i){
    currentCol = i;
    const s = steps[i]; if (!s) return;
    ping(i);
    if (s.active){
      const noteName = noteList[s.noteIndex] || 'C4';
      gatedTrigger(ui.instrument, noteName);
    }
    draw();
  }

  // initial draw
  draw();
  requestAnimationFrame(draw);
  window.addEventListener('resize', draw);
  panel.addEventListener('toy-zoom', draw);
  try{ console.log('[grid] init complete', toyId); }catch{}

  return {
    toyId,
    element: canvas,
    steps,
    setInstrument: ui.setInstrument,
    get instrument(){ return ui.instrument; },
    markPlayingColumn,
    ping,
    reset: clear,
    doRandom
  };
}

export const markPlayingColumn = (grid, i)=> grid?.markPlayingColumn?.(i);
