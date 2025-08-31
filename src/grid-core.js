import { resizeCanvasForDPR, noteList, clamp } from './utils.js';
import { NUM_STEPS } from './audio-core.js';
import { triggerInstrument } from './audio-samples.js';
import { initToyUI } from './toyui.js';
import { drawTileLabelAndArrows } from './ui-tiles.js';
import { drawNoteStripsAndLabel, whichThirdRect, drawThirdsGuides, drawBlock, NOTE_BTN_H } from './toyhelpers.js';
import { initToySizing } from './toyhelpers-sizing.js';
import { getPoliteDensity } from './polite-random.js';
import { gateTriggerForToy } from './toy-audio.js';
import { attachGridRedrawObservers } from './grid-observers.js';
import { attachZoomNotesButton } from './grid-ui-extras.js';
const BASE_BLOCK_SIZE_LOCAL = 42;
function nextGridId(){
  try {
    const g = (typeof window!=='undefined' && window.__gridIds__) || (window.__gridIds__ = { n:0 });
    return 'grid-' + (++g.n);
  } catch {
    return `grid-${Math.floor(Math.random()*1e6)}`;
  }
}
export function buildGrid(selector, numSteps = NUM_STEPS, { defaultInstrument='tone', title='LoopGrid' } = {}){

  const shell = document.querySelector(selector);

  const panel = shell.closest?.('.toy-panel') || shell;
  let toyId = (panel && panel.dataset && panel.dataset.toyid) ? String(panel.dataset.toyid) : null;
  if (!toyId){
    const kind = (panel && panel.dataset && panel.dataset.toy ? String(panel.dataset.toy) : 'grid').toLowerCase();
    const g = (window.__gridIds__ = window.__gridIds__ || { n: 0 });
    toyId = `${kind}-${++g.n}`;
    try { panel.dataset.toyid = toyId; } catch {}
  }
  toyId = String(toyId).toLowerCase();
  panel.dataset.toy = toyId;
  try{ panel.dataset.steps = String(numSteps||NUM_STEPS); }catch{}
  if (!panel.id) panel.id = 'panel-' + toyId;
  const ui = initToyUI(panel, { toyName: title, defaultInstrument });
  let body = panel.querySelector('.toy-body');
  if (!body){
    body = document.createElement('div');
    body.className = 'toy-body';
    body.style.position = 'relative';
    body.style.padding = '10px';
    panel.appendChild(body);
  }
  const right = panel.querySelector('.toy-controls-right');
  if (!body){
    body = document.createElement('div');
    body.className = 'toy-body';
    body.style.position = 'relative';
    body.style.padding = '10px';
    panel.appendChild(body);
  }
  const gatedTrigger = gateTriggerForToy(toyId, triggerInstrument);
  const canvas = document.createElement('canvas');
  try{ canvas.removeAttribute('data-lock-scale'); canvas.style.transform=''; }catch{};
  canvas.style.display = 'block';
  canvas.className = 'grid-canvas';
  canvas.style.display = 'block';canvas.style.width='100%';canvas.style.height='100%';canvas.style.maxHeight='100%';
  panel.classList.add('toy-unzoomed');
  body.style.paddingTop = '6px';
  body.style.paddingBottom = '6px';
  body.appendChild(canvas);
  attachGridRedrawObservers(panel, body, draw, ()=>paintedOnce);

const ctx = canvas.getContext('2d');
  let __lastCssH = -1;

  const sizing = initToySizing(panel, canvas, ctx, { squareFromWidth: false });
  /* sizing init hook */
  try { sizing.setZoom(panel.classList.contains('toy-zoomed')); } catch {}
  const worldW = ()=> ((canvas.getBoundingClientRect?.().width|0) || canvas.clientWidth || sizing?.vw?.() || body.clientWidth || 356);
  const worldH = ()=> ((canvas.getBoundingClientRect?.().height|0) || canvas.clientHeight || sizing?.vh?.() || body.clientHeight || 240);
  const c4Index = Math.max(0, noteList.indexOf('C4'));
  let currentCol = -1;
  let paintedOnce = false;
  let randBtnRef;
  let notesBtnRef;
  function squareSize(){
    const scale = (sizing && typeof sizing.scale==='number') ? sizing.scale : 1;
    const BASE = 42; // matches other toys at zoom=1
    return Math.max(20, Math.round(BASE * scale));
  }
  function squareGap(){ return Math.max(8, Math.round(squareSize() * 0.40)); }
  const steps = Array.from({length:NUM_STEPS}, ()=>({ active:false, flash:0, noteIndex:c4Index }));
  function layout(){
    const pad = 10;
    const w = worldW(), h = worldH();
    const gridTop = 6;
    const zoomed = panel.classList.contains('toy-zoomed');
    const cellW = Math.max(20, Math.floor((w - pad*2) / steps.length));
    const cellH = Math.max(24, Math.floor(h - gridTop - 6));
    return { pad, w, h, gridTop, cellW, cellH, isZoomed: zoomed };
  }
  function blockRectForIndex(i, L){
    const { pad, gridTop, cellW, cellH } = L;
    const MARGIN = 2;
    const target = Math.round(BASE_BLOCK_SIZE_LOCAL * ( (typeof sizing?.scale==='number' ? sizing.scale : 1) ));
    let s = Math.min(cellW, cellH) - MARGIN*2;
    if (!L.isZoomed) s = Math.min(s, target); // in advanced, fill cell
    const xCell = pad + i * cellW;
    const yCell = gridTop;
    const bx = Math.floor(xCell + (cellW - s)/2);
    const by = Math.floor(yCell + (cellH - s)/2);
    return { x: bx, y: by, w: s, h: s };
  }
function draw(){
    try { ctx.setTransform(1,0,0,1,0,0); } catch {}
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    const isZoomedNow = panel.classList.contains('toy-zoomed');
    const TARGET_S = Math.round(BASE_BLOCK_SIZE_LOCAL * (sizing?.scale || 1));
    const MARGIN = 2;
    const pad = 10;
    const containerW = (canvas.getBoundingClientRect?.().width || 0) || canvas.clientWidth || panel.clientWidth || body.clientWidth || 0;
    const stepsLen = steps.length || 1;
    const cellW = Math.max(20, Math.floor((containerW - pad*2) / stepsLen));
    const squareFromW = Math.max(16, cellW - MARGIN*2);
    const square = isZoomedNow ? squareFromW : Math.min(TARGET_S, squareFromW);
    const desiredH = 6 + square + 6;
    const scaleNow = (typeof sizing?.scale === 'number') ? sizing.scale : 1;
    const desiredBaseH = Math.max(1, Math.round(desiredH / (scaleNow || 1)));
    try { if (__lastCssH !== desiredBaseH) { if (!isZoomedNow) { sizing.setContentCssSize?.({ h: desiredBaseH }); } __lastCssH = desiredBaseH; } } catch {}
    const __s = resizeCanvasForDPR(canvas, ctx);
    const w = __s.width, h = __s.height;
    const L = {
      pad, w, h,
      gridTop: 6,
      cellW: Math.max(20, Math.floor((w - pad*2) / steps.length)),
      cellH: Math.max(24, Math.floor(h - 6 - 6)),
      isZoomed: isZoomedNow
    };
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (!window.__gridLoggedOnce){
      window.__gridLoggedOnce = true;
      try {
        const r = canvas.getBoundingClientRect();

      } catch {}
    }
        for (let i=0;i<steps.length;i++){
      const s = steps[i];
      const b = blockRectForIndex(i, L);
            { const __pulse = Math.max(0, Math.min(1, (s.flash||0)));
        const __scl = __pulse>0 ? (1 + 0.14*__pulse) : 1;
        const __cx = b.x + b.w/2, __cy = b.y + b.h/2;
        ctx.save(); ctx.translate(__cx, __cy); ctx.scale(__scl, __scl); ctx.translate(-__cx, -__cy);
        drawBlock(ctx, b, {      baseColor: s.active ? '#f4932f' : '#293042',      active: !!s.active,      noteLabel: L.isZoomed ? (noteList && s.noteIndex!=null ? String(noteList[s.noteIndex % noteList.length]||'') : '') : null,      showArrows: L.isZoomed,
      variant: L.isZoomed ? 'block' : 'button'
    });
            ctx.restore(); }
ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1; ctx.strokeRect(b.x+0.5,b.y+0.5,b.w-1,b.h-1); ctx.restore();
    if (s.flash && s.flash > 0){ ctx.save(); ctx.globalAlpha = Math.min(0.35, 0.25 * s.flash); ctx.fillStyle = '#ffffff'; ctx.fillRect(b.x, b.y, b.w, b.h); ctx.restore(); }
    if (L.isZoomed){
      const label = noteList[s.noteIndex] || '?';
      drawTileLabelAndArrows(ctx, b, { label, active: !!s.active, zoomed: true });
    }
  }
    if (currentCol >= 0){
      const br = blockRectForIndex(currentCol, L);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(br.x, br.y, br.w, br.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(br.x+1, br.y+1, br.w-2, br.h-2);
    }
}
  function ping(i){
    const s = steps[i]; if (!s) return;
    s.flash = 1;
    setTimeout(()=>{ s.flash = Math.max(0, s.flash - 0.5); }, 60);
    setTimeout(()=>{ s.flash = Math.max(0, s.flash - 0.5); }, 120);
  }
  function setNoteIndex(i, delta){
    const s = steps[i]; if (!s) return;
    const N = noteList.length;
    let ni = s.noteIndex + delta;
    if (ni < 0) ni = 0; else if (ni >= N) ni = N - 1;
    s.noteIndex = ni;
  }
  function toggle(i){ const s = steps[i]; if (s) s.active = !s.active; }
  function whichCell(pt){
    const isZoomedNow = panel.classList.contains('toy-zoomed');
    const MARGIN = 2;
    const pad = 10;
    const b = canvas.getBoundingClientRect();
    const w = Math.max(1, (b.width|0));
    const h = Math.max(1, (b.height|0));
    const stepsLen = steps.length || 1;
    const cellW = Math.max(20, Math.floor((w - pad*2) / stepsLen));
    const gridTop = 6;
    const cellH = Math.max(24, Math.floor(h - 6 - 6)); // match draw()
    const i = Math.floor((pt.x - pad) / cellW);
    if (i < 0 || i >= stepsLen) return null;
    const rect = blockRectForIndex(i, { pad, gridTop, cellW, cellH, isZoomed: isZoomedNow });
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
      toggle(i);
      try{ ping(i); }catch{}
      // (disabled) no immediate audio preview on click; wait for sequencer
    }
    draw();
  }
  canvas.addEventListener('pointerdown', onPointer);
  function clear(){
    for (const s of steps){ s.active=false; s.flash=0; s.noteIndex=c4Index; }
    draw();
  }
  function doRandomBeat({ baseDensity=1, priority=1 } = {}){
  const density = getPoliteDensity(baseDensity, priority);
  const N = steps.length;
  const target = Math.max(1, Math.round(N * 0.35 * density));
  for (const s of steps){ s.active = false; }
  const chosen = new Set();
  while (chosen.size < target){
    chosen.add(Math.floor(Math.random() * N));
  }
  for (const idx of chosen){ steps[idx].active = true; }
  draw();
}
function doRandomNotes(){
  const scale = [0, 3, 5, 7, 10]; // minor pentatonic offsets
  for (const s of steps){
    const oct = (Math.random() < 0.6) ? 0 : (Math.random() < 0.5 ? 1 : -1);
    const off = scale[Math.floor(Math.random()*scale.length)];
    const base = c4Index + off + (12 * oct);
    s.noteIndex = clamp(base, 0, noteList.length-1);
  }
  draw();
}
    attachZoomNotesButton(panel, ()=> doRandomNotes());
  panel.addEventListener('toy-random', ()=>{
    const pr = Number(panel.dataset.priority || '1') || 1;
    doRandomBeat({ baseDensity: 1, priority: pr });
  });
  panel.addEventListener('toy-reset', clear);
  try {
    if (randBtn){
      randBtn.addEventListener('click', ()=>{
        const pr = Number(panel.dataset.priority || '1') || 1;
        doRandomBeat({ baseDensity: 1, priority: pr });
      });
    }
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
  draw();
  requestAnimationFrame(draw);
  window.addEventListener('resize', draw);
  panel.addEventListener('toy-zoom', (ev)=>{ try { sizing.setZoom(ev?.detail?.zoomed); } catch {} draw(); });
  
  try { draw(); } catch {}
  try { requestAnimationFrame(()=> draw()); } catch {}
  try { setTimeout(draw, 50); } catch {}
  /*__initdraw__*/
return {
    toyId,
    element: canvas,
    steps,
    setInstrument: ui.setInstrument,
    get instrument(){ return ui.instrument; },
    markPlayingColumn,
    ping,
    reset: clear,
    doRandomBeat,
    doRandomNotes
  };
}
try { window.markPlayingColumn = (grid, i)=> grid?.markPlayingColumn?.(i); } catch {}
try { window.buildGrid = buildGrid; } catch {}
export const markPlayingColumn = (grid, i) => (grid?.markPlayingColumn?.(i));