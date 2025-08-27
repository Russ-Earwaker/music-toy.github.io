// src/toyui.js — header controls for toys (Zoom, Random, Reset, Mute + per‑toy volume)
import './toy-audio.js';
import { getInstrumentNames } from './audio-samples.js';
import { zoomInPanel, zoomOutPanel } from './zoom-overlay.js';

const DEBUG = (typeof localStorage !== 'undefined' && localStorage.toyuiDebug === '1');
const dbg = (...args)=>{ if (DEBUG) { try { console.log('[toyui]', ...args); } catch{} } };

const ICONS = {
  volume: `<svg viewBox='0 0 24 24' aria-hidden='true' width='18' height='18' style='display:block'><path fill='currentColor' d='M3 10v4h4l5 4V6L7 10H3z'/><path fill='currentColor' d='M16.5 12a4.5 4.5 0 0 0-2.5-4.03v8.06A4.5 4.5 0 0 0 16.5 12z'/></svg>`,
  mute:   `<svg viewBox='0 0 24 24' aria-hidden='true' width='18' height='18' style='display:block'><path fill='currentColor' d='M3 10v4h4l5 4V6L7 10H3z'/><path stroke='currentColor' stroke-width='2' stroke-linecap='round' d='M19 5l-3 3'/><path stroke='currentColor' stroke-width='2' stroke-linecap='round' d='M16 8l3 3'/></svg>`
};

export function initToyUI(panel, {
  toyName = 'Toy',
  defaultInstrument = 'tone',
  onRandom = null,
  onReset = null
} = {}){
  const idBase = (panel?.dataset?.toy || toyName || 'toy').toLowerCase();
  const getToyId = ()=> { try { return (panel?.dataset?.toy || idBase).toLowerCase(); } catch { return idBase; } };
  // Normalise identifiers
  panel.dataset.toy = getToyId();
  panel.dataset.toyid = panel.dataset.toy;

  // Ensure header
  let header = panel.querySelector('.toy-header');
  if (header) header.textContent = '';
  if (!header){
    header = document.createElement('div');
    header.className = 'toy-header';
    Object.assign(header.style, { display:'flex', alignItems:'center', justifyContent:'space-between', gap:'10px', padding:'8px 10px' });
    panel.prepend(header);
  }

  function makeBtn(txt, title){
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toy-btn';
    if (txt && txt.indexOf('<') === -1) b.textContent = txt; else b.innerHTML = txt || '';
    b.title = title || txt || '';
    Object.assign(b.style, { padding:'6px 10px', border:'1px solid #252b36', borderRadius:'10px', background:'#0d1117', color:'#e6e8ef', cursor:'pointer' });
    b.addEventListener('pointerdown', ev => ev.stopPropagation(), { capture:true });
    return b;
  }

  // Left: Zoom + name
  const left = document.createElement('div');
  left.className = 'toy-controls toy-controls-left';
  Object.assign(left.style, { display:'flex', alignItems:'center', gap:'8px' });
  const zoomBtn = makeBtn('Advanced', 'Advanced Edit Mode');
  const nameEl  = document.createElement('span'); nameEl.textContent = toyName; nameEl.style.opacity='.85';
  left.append(zoomBtn, nameEl);
  header.appendChild(left);

  // Right: Random & Reset + instrument (visible in zoom only)
  const right = document.createElement('div');
  right.className = 'toy-controls toy-controls-right';
  Object.assign(right.style, { display:'flex', alignItems:'center', gap:'8px' });

  const randBtn  = makeBtn('Random', 'Randomize pattern');
  const resetBtn = makeBtn('Clear',  'Clear pattern');

  const instWrap = document.createElement('div'); instWrap.style.display='none'; instWrap.style.alignItems='center'; instWrap.style.gap='6px';
  const instSel = document.createElement('select');
  instSel.className = 'toy-instrument';
  instSel.style.background='#0d1117'; instSel.style.color='#e6e8ef';
  ;['pointerdown','mousedown','touchstart','click'].forEach(evt => instSel.addEventListener(evt, ev => ev.stopPropagation(), { capture:true }));
  instSel.addEventListener('change', ()=> panel.dispatchEvent(new CustomEvent('toy-instrument', { detail: { value: instSel.value } })));
  instSel.style.border='1px solid #252b36'; instSel.style.borderRadius='8px'; instSel.style.padding='4px 6px';

  function rebuildInstruments(){
    const names = getInstrumentNames();
    instSel.innerHTML='';
    names.forEach(n => { const o=document.createElement('option'); o.value=o.textContent=n; instSel.appendChild(o); });
  }
  try{ rebuildInstruments(); applyDefaultInstrument(); }catch{}
  window.addEventListener('samples-ready', ()=>{ rebuildInstruments(); applyDefaultInstrument(); });
  instWrap.append(instSel);

// Apply default instrument once (or when list first appears)
let __instInitialised = false;

function applyDefaultInstrument(){
  try{
    const opts = Array.from(instSel.options).map(o=>o.value);
    if (!__instInitialised && defaultInstrument){
      const match = opts.find(n => n.toLowerCase() === String(defaultInstrument).toLowerCase()) || opts.find(n => /kalimba/i.test(n));
      if (match) defaultInstrument = match;
      if (match && opts.includes(defaultInstrument)){
        instSel.value = defaultInstrument;
        panel.dispatchEvent(new CustomEvent('toy-instrument', { detail: { value: instSel.value, toyId: getToyId() } }));
        __instInitialised = true;
      }
    }
  } catch {}
}

// Reassert default instrument on zoom (some flows repopulate selects)
function enforceDefaultOnZoom(){
  try{
    const names = getInstrumentNames();
    if (!names || !names.length) return;
    if (defaultInstrument){
      const match = names.find(n => n.toLowerCase() === String(defaultInstrument).toLowerCase()) || names.find(n => /kalimba/i.test(n));
      if (match){ defaultInstrument = match; }
      const before = instSel.value;
      if (instSel.value !== defaultInstrument){
        instSel.value = defaultInstrument;
        if (instSel.value !== before) panel.dispatchEvent(new CustomEvent('toy-instrument', { detail: { value: instSel.value, toyId: getToyId() } }));
      }
    }
  } catch {}
}

right.append(randBtn, resetBtn, instWrap);
  header.appendChild(right);

  // Overlay for zoom
  let overlay = document.querySelector('.toy-overlay');
  if (!overlay){
    overlay = document.createElement('div');
    overlay.className = 'toy-overlay';
    Object.assign(overlay.style, { display:'none', pointerEvents:'none', position:'fixed', left:'0', top:'0', right:'0', bottom:'0' });
    document.body.appendChild(overlay);
  }
  overlay.addEventListener('click', ()=> setZoom(false));

  
  // Volume bar (Mute + horizontal slider) along the bottom
  const volWrap = document.createElement('div');
  volWrap.className = 'toy-volwrap';
  Object.assign(volWrap.style, {
    position:'absolute', zIndex:'5', pointerEvents:'auto',
    display:'flex', alignItems:'center', gap:'10px',
    left:'0', right:'0', top:'100%',
    padding:'8px 10px',
    background:'rgba(13,17,23,0.92)', border:'1px solid #252b36', borderRadius:'12px',
    boxShadow:'0 10px 24px rgba(0,0,0,0.35)', backdropFilter:'blur(6px)', userSelect:'none'
  });

  const muteBtn = makeBtn(ICONS.volume, 'Mute'); muteBtn.dataset.action='mute';
  Object.assign(muteBtn.style, { width:'28px', height:'28px', padding:'4px', display:'grid', placeItems:'center' });

  const vol = document.createElement('input');
  vol.type='range'; vol.min='0'; vol.max='100'; vol.value='100'; vol.step='1';
  vol.className='toy-volrange';
  Object.assign(vol.style, {
    flex:'1 1 auto', height:'8px', margin:'0', padding:'0', appearance:'none',
    background:'#394150',
    borderRadius:'4px'
  });
  function updateVolBg(){ const pct = Math.max(0, Math.min(100, parseInt(vol.value,10)||0)); vol.style.background = `linear-gradient(to right, #6adf7a 0% ${pct}%, #394150 ${pct}% 100%)`; }
  vol.addEventListener('input', ()=>{
    const v = Math.max(0, Math.min(1, (parseInt(vol.value,10)||0)/100)); updateVolBg();
    try{ window.dispatchEvent(new CustomEvent('toy-volume', { detail: { toyId: getToyId(), value: v } })); }catch{}
  });
  updateVolBg();
  vol.addEventListener('pointerdown', ev => ev.stopPropagation(), { capture:true });

  volWrap.append(muteBtn, vol);

  const bodyEl = panel.querySelector('.toy-body') || panel;
  bodyEl.appendChild(volWrap);

  function positionVolume(){
    // already bottom-aligned, but keep width synced if needed
  }
  positionVolume();
  window.addEventListener('resize', positionVolume);
  panel.addEventListener('toy-zoom', positionVolume);

// Zoom state
  let zoomed = false;
  function setZoom(z){
    dbg('setZoom call', { to: !!z });
    zoomed = !!z;
    instWrap.style.display = zoomed ? 'flex' : 'none';
    panel.classList.toggle('toy-zoomed', zoomed);
    panel.classList.toggle('toy-unzoomed', !zoomed);
    if (zoomed){ zoomInPanel(panel, ()=> setZoom(false)); } else { zoomOutPanel(panel); }
    panel.dispatchEvent(new CustomEvent('toy-zoom', { detail: { zoomed } }));
    if (zoomed) enforceDefaultOnZoom();
  }
  setZoom(false);
  zoomBtn.addEventListener('click', ()=> setZoom(!zoomed));

  // Random/Reset dispatch
  randBtn.addEventListener('click', ()=>{ panel.dispatchEvent(new CustomEvent('toy-random', { bubbles:true })); onRandom && onRandom(); });
  resetBtn.addEventListener('click', ()=>{ panel.dispatchEvent(new CustomEvent('toy-reset', { bubbles:true })); onReset && onReset(); });

  // Mute flag + dispatch
  let muted = false;
  function setMuted(m){
    muted = !!m;
    try { muteBtn.setAttribute('aria-pressed', muted ? 'true' : 'false'); } catch{}
    try { muteBtn.innerHTML = muted ? ICONS.mute : ICONS.volume; } catch{}
    try { muteBtn.style.color = muted ? '#7b8193' : '#ffffff'; muteBtn.classList.toggle('muted', muted); } catch{}
    try { window.dispatchEvent(new CustomEvent('toy-mute', { detail: { toyId: getToyId(), muted } })); } catch{}
  }
  muteBtn.addEventListener('click', ()=> setMuted(!muted));

  // Public API (minimal)
  return {
    get instrument(){ return instSel.value; },
    setInstrument: (name)=>{ instSel.value = name; },
    setZoom,
    get muted(){ return muted; },
    setMuted
  };
}