// src/grid.js — robust step grid with polite random + intensity hookup
import { resizeCanvasForDPR, noteList, clamp } from './utils.js';
import { NUM_STEPS } from './audio-core.js';
import { triggerInstrument } from './audio-samples.js';
import { initToyUI } from './toyui.js';
import { drawTileLabelAndArrows } from './ui-tiles.js';
import { initToySizing, drawNoteStripsAndLabel, NOTE_BTN_H, whichThirdRect, drawThirdsGuides, drawBlock } from './toyhelpers.js';
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
  panel.classList.add('toy-unzoomed');
  body.style.paddingTop = '6px';
  body.style.paddingBottom = '6px';
  body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  try{ console.log('[grid] canvas created', {panel, toyId}); }catch{}

  const sizing = initToySizing(panel, canvas, ctx);
  /* sizing init hook */
  try { sizing.setZoom(panel.classList.contains('toy-zoomed')); } catch {}
  const worldW = ()=> (canvas.clientWidth || sizing?.vw?.() || body.clientWidth || 356);
  const worldH = ()=> (canvas.clientHeight || sizing?.vh?.() || body.clientHeight || 240);

  const c4Index = Math.max(0, noteList.indexOf('C4'));
  let currentCol = -1;
  // Explicit square size & spacing (keeps visuals consistent across toys)
  function squareSize(){
    const scale = (sizing && typeof sizing.scale==='number') ? sizing.scale : 1;
    const BASE = 42; // matches other toys at zoom=1
    return Math.max(20, Math.round(BASE * scale));
  }
  function squareGap(){ return Math.max(8, Math.round(squareSize() * 0.40)); }

  const steps = Array.from({length:numSteps}, ()=>({ active:false, flash:0, noteIndex:c4Index }));

  function layout(){
    const pad = 10;
    const w = worldW(), h = worldH();
    resizeCanvasForDPR(canvas, ctx);
    const isZoomed = panel.classList.contains('toy-zoomed');
    const gridTop = 6;
    const cellW = Math.max(20, Math.floor((w - pad*2) / steps.length));
    const cellH = Math.max(24, Math.floor(h - gridTop - 6));
    return { pad, w, h, gridTop, cellW, cellH, isZoomed };
  }

  
  function blockRectForIndex(i){
    const L = layout();
    const { pad, gridTop, cellW, cellH } = L;
    const margin = 4;
    const s = Math.max(16, Math.min(cellW, cellH) - margin*2);
    const xCell = pad + i * cellW;
    const yCell = gridTop;
    const bx = Math.floor(xCell + (cellW - s)/2);
    const by = Math.floor(yCell + (cellH - s)/2);
    return { x: bx, y: by, w: s, h: s };
  }

function draw(){
    let L = layout();
    let { w, h, pad, gridTop, cellH, isZoomed, s, gap } = L;

    ctx.clearRect(0,0,canvas.width,canvas.height);
ctx.clearRect(0,0,canvas.width,canvas.height);
            if (!window.__gridLoggedOnce){ window.__gridLoggedOnce = true; try {
      const r = canvas.getBoundingClientRect();
      console.log('[grid] draw', {w, h});
      console.log('[grid] rect', r);
    } catch{} }


    // Background guides + note strips
    
    
    // Cells
        for (let i=0;i<steps.length;i++){
      const s = steps[i];
      const b = blockRectForIndex(i);
      // Use shared cube visual
      drawBlock(ctx, b, {
      baseColor: s.active ? '#f4932f' : '#293042',
      active: !!s.active,
      noteLabel: null,
      showArrows: false,
      variant: isZoomed ? 'block' : 'button'
    });
    // flash overlay on click
    if (s.flash && s.flash > 0){ ctx.save(); ctx.globalAlpha = Math.min(0.35, 0.25 * s.flash); ctx.fillStyle = '#ffffff'; ctx.fillRect(b.x, b.y, b.w, b.h); ctx.restore(); }
    if (isZoomed){
      const label = noteList[s.noteIndex] || '?';
      drawTileLabelAndArrows(ctx, b, { label, active: !!s.active, zoomed: true });
    }
  }

  // Playhead overlay (match square height)
    if (currentCol >= 0){
      const br = blockRectForIndex(currentCol);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(br.x, br.y, br.w, br.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(br.x+1, br.y+1, br.w-2, br.h-2);
    }
    // Thirds guides overlay (tap areas) only in zoom
    if (panel.classList.contains('toy-zoomed')){
      const { w, gridTop, cellH } = layout();
      drawThirdsGuides(ctx, { x:0, y:gridTop, w, h: cellH });
    }
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
    const { pad, s, gap } = layout();
    const stepW = s + gap;
    const i = Math.floor((pt.x - pad + gap*0.5) / stepW);
    if (i < 0 || i >= steps.length) return null;
    const rect = blockRectForIndex(i);
    if (pt.x < rect.x || pt.x > rect.x + rect.w || pt.y < rect.y || pt.y > rect.y + rect.h) return null;
    return { i, rect };
  }

  function onPointer(ev){
    const bounds = canvas.getBoundingClientRect();
    const x = (ev.clientX - bounds.left);
    const y = (ev.clientY - bounds.top);
    const hit = whichCell({ x, y });
    if (!hit) return;
    const { i, rect } = hit;
    if (panel.classList.contains('toy-zoomed')){
      const where = whichThirdRect(rect, y);
      if (where === 'up') setNoteIndex(i, +1);
      else if (where === 'toggle') toggle(i);
      else if (where === 'down') setNoteIndex(i, -1);
    } else {
      // standard mode: toggle-only + flash
      toggle(i);
      try{ ping(i); }catch{}
    }
    draw();
  }

  canvas.addEventListener('pointerdown', onPointer);

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
  panel.addEventListener('toy-zoom', (ev)=>{ try { sizing.setZoom(ev?.detail?.zoomed); } catch {} draw(); });
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
