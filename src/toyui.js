// src/toyui.js — ES module export + window fallback + auto-init
// Builds header (title, Advanced, Random, Clear, Instrument) and a volume bar.
// Instrument selector is hidden in standard view and shown only in Advanced.

import { getInstrumentNames } from './audio-samples.js';
import { zoomInPanel, zoomOutPanel } from './zoom-overlay.js';

function makeBtn(label, title){
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'toy-btn';
  b.title = title || label;
  Object.assign(b.style, {
    padding:'6px 10px', border:'1px solid #252b36', borderRadius:'10px',
    background:'#0d1117', color:'#e6e8ef', cursor:'pointer'
  });
  b.textContent = label;
  return b;
}

export function initToyUI(panel, {
  toyName = 'Toy',
  defaultInstrument = 'tone',
  onRandom = null,
  onReset = null
} = {}){
  // Normalize IDs
  const idBase = (panel?.dataset?.toy || panel?.dataset?.toyid || toyName || 'toy').toLowerCase();
  panel.dataset.toy = idBase;
  panel.dataset.toyid = idBase;

  // Header container
  let header = panel.querySelector('.toy-header');
  if (header) header.textContent = '';
  if (!header){
    header = document.createElement('div');
    header.className = 'toy-header';
    Object.assign(header.style, {
      display:'flex', alignItems:'center', justifyContent:'space-between',
      gap:'10px', padding:'8px 10px', position:'relative', zIndex:'20'
    });
    // Do NOT stopPropagation on header: board needs pointerdown on it to drag toys.
    panel.prepend(header);
  }

  // Left: title + Advanced
  const left = document.createElement('div');
  Object.assign(left.style, { display:'flex', alignItems:'center', gap:'8px' });
  const titleEl = document.createElement('div');
  titleEl.textContent = toyName;
  Object.assign(titleEl.style, { fontWeight:'600', color:'#e6e8ef' });
  const advBtn = makeBtn('Advanced', 'Open advanced edit');
  // Prevent drag-start when clicking the button itself
  advBtn.addEventListener('pointerdown', e=> e.stopPropagation());
  function setAdvLabel(){ advBtn.textContent = panel.classList.contains('toy-zoomed') ? 'Exit' : 'Advanced'; }
  advBtn.addEventListener('click', ()=>{
    const inZoom = panel.classList.contains('toy-zoomed') || !!panel.closest('#zoom-overlay');
    if (inZoom) { try{ zoomOutPanel(panel); }catch{} } else { zoomInPanel(panel, ()=>{ try{ zoomOutPanel(panel); }catch{} }); }
    setTimeout(setAdvLabel, 0);
  });
  setTimeout(setAdvLabel, 0);
  left.append(titleEl, advBtn);
  header.appendChild(left);

  // Right: Random / Clear / Instrument (instrument only in Advanced)
  const right = document.createElement('div');
  Object.assign(right.style, { display:'flex', alignItems:'center', gap:'8px' });

  const randBtn  = makeBtn('Random', 'Randomize pattern');
  const clearBtn = makeBtn('Clear',  'Clear pattern');
  randBtn.addEventListener('pointerdown', e=> e.stopPropagation());
  clearBtn.addEventListener('pointerdown', e=> e.stopPropagation());
  randBtn.addEventListener('click', (e)=>{
    e.stopPropagation();
    if (typeof onRandom === 'function'){ try{ onRandom(); }catch{} }
    try{ panel.dispatchEvent(new CustomEvent('toy-random', { bubbles:true })); }catch{}
  });
  clearBtn.addEventListener('click', (e)=>{
    e.stopPropagation();
    if (typeof onReset === 'function'){ try{ onReset(); }catch{} }
    try{ panel.dispatchEvent(new CustomEvent('toy-reset', { bubbles:true })); }catch{}
  });

  const instWrap = document.createElement('div');
  Object.assign(instWrap.style, { display:'none', alignItems:'center', gap:'6px' });
  const instSel = document.createElement('select');
  instSel.className = 'toy-instrument';
  Object.assign(instSel.style, { background:'#0d1117', color:'#e6e8ef', border:'1px solid #252b36', borderRadius:'8px', padding:'4px 6px' });
  instSel.addEventListener('pointerdown', e=> e.stopPropagation());
  try {
    const names = (getInstrumentNames && getInstrumentNames()) || [];
    names.forEach(n => { const opt = document.createElement('option'); opt.value = n; opt.textContent = n; instSel.appendChild(opt); });
  } catch {}
  instSel.value = defaultInstrument;
  instSel.addEventListener('change', ()=>{
    try{ panel.dispatchEvent(new CustomEvent('toy-instrument', { detail:{ value: instSel.value }, bubbles:true })); }catch{}
  });

  instWrap.appendChild(instSel);
  const isGridToy = /grid/.test(idBase);
right.className = 'toy-controls-right';
right.append(randBtn, clearBtn, instWrap);
header.appendChild(right);
// Safety: if right-side controls vanished (e.g., DOM moved), rebuild them
  function ensureRightControls(){
    const rightNow = header.querySelector('.toy-controls-right');
    if (!rightNow){
      const r = document.createElement('div');
      r.className = 'toy-controls-right';
      Object.assign(r.style, { display:'flex', alignItems:'center', gap:'8px' });
      const rb = makeBtn('Random','Randomize pattern'); rb.addEventListener('pointerdown', e=> e.stopPropagation());
      const cb = makeBtn('Clear','Clear pattern'); cb.addEventListener('pointerdown', e=> e.stopPropagation());
      rb.addEventListener('click', (e)=>{ e.stopPropagation(); try{ panel.dispatchEvent(new CustomEvent('toy-random', { bubbles:true })); }catch{} });
      cb.addEventListener('click', (e)=>{ e.stopPropagation(); try{ panel.dispatchEvent(new CustomEvent('toy-reset', { bubbles:true })); }catch{} });
      r.append(rb, cb, instWrap);
      header.appendChild(r);
    }
  }
  panel.addEventListener('toy-zoom', ensureRightControls);


  // Volume (single instance, absolute under the body)
  let volWrap = panel.querySelector('.toy-volwrap');
  if (!volWrap){
    volWrap = document.createElement('div');
    volWrap.className = 'toy-volwrap';
    panel.appendChild(volWrap);
  }
  try {
    const dups = panel.querySelectorAll('.toy-volwrap');
    dups.forEach(el => { if (el !== volWrap) el.remove(); });
  } catch {}
  volWrap.innerHTML = '';
  Object.assign(volWrap.style, {
    position:'absolute', zIndex:'10',
    display:'flex', alignItems:'center', gap:'10px',
    left:'0', right:'0', bottom:'0', top:'auto',
    height:'44px', maxHeight:'44px',
    padding:'6px 10px',
    background:'rgba(13,17,23,0.92)', border:'1px solid #252b36', borderRadius:'12px',
    boxShadow:'0 10px 24px rgba(0,0,0,0.35)', backdropFilter:'blur(6px)',
    userSelect:'none'
  });

  const muteBtn = document.createElement('button');
  muteBtn.type = 'button';
  muteBtn.title = 'Mute';
  muteBtn.innerHTML = "<svg viewBox='0 0 24 24' width='18' height='18' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M11 5L6 9H3v6h3l5 4V5z'/><path d='M23 9l-6 6M17 9l6 6'/></svg>";
  Object.assign(muteBtn.style, { width:'32px', height:'32px', display:'grid', placeItems:'center', background:'transparent', color:'#e6e8ef', border:'none', borderRadius:'8px', cursor:'pointer' });
  muteBtn.addEventListener('pointerdown', e=> e.stopPropagation());
  // Mute click: toggle aria-pressed, zero/restore slider, and dispatch events
  muteBtn.addEventListener('click', (e)=>{
    e.stopPropagation();
    const toyId = idBase;
    const isPressed = muteBtn.getAttribute('aria-pressed') === 'true';
    const rng = vol;
    let last = Math.max(0, Math.min(100, parseInt(rng.dataset._preMute||rng.value,10)||100));
    if (!isPressed){
      muteBtn.setAttribute('aria-pressed','true');
      rng.dataset._preMute = String(last);
      rng.value = '0';
      rng.dispatchEvent(new Event('input', { bubbles:true }));
      try{ window.dispatchEvent(new CustomEvent('toy-mute', { detail: { toyId, muted: true } })); }catch{}
    } else {
      muteBtn.setAttribute('aria-pressed','false');
      const restore = parseInt(rng.dataset._preMute||last,10)||last||100;
      rng.value = String(restore);
      rng.dispatchEvent(new Event('input', { bubbles:true }));
      try{ window.dispatchEvent(new CustomEvent('toy-mute', { detail: { toyId, muted: false } })); }catch{}
    }
  });

  const vol = document.createElement('input');
  vol.type = 'range'; vol.min = '0'; vol.max = '100'; vol.step = '1'; vol.value = '100';
  Object.assign(vol.style, { flex:'1', height:'8px', borderRadius:'999px', appearance:'none', background:'#394150' });
  vol.addEventListener('pointerdown', e=> e.stopPropagation());

  function updateVolBg(){
    const pct = Math.max(0, Math.min(100, (parseInt(vol.value,10)||0)));
    vol.style.background = `linear-gradient(to right, #6adf7a 0% ${pct}%, #394150 ${pct}% 100%)`;
  }
  vol.addEventListener('input', ()=>{
    const v = Math.max(0, Math.min(1, (parseInt(vol.value,10)||0)/100));
    updateVolBg();
    try{ window.dispatchEvent(new CustomEvent('toy-volume', { detail: { toyId: idBase, value: v } })); }catch{}
  });
  updateVolBg();

  volWrap.append(muteBtn, vol);
  // Clean up any stray mute SVGs/buttons outside the canonical volume wrap
  try {
    const allMuteButtons = panel.querySelectorAll('button[title="Mute"]');
    allMuteButtons.forEach(btn => { if (!btn.closest('.toy-volwrap')) btn.remove(); });
    const allSvgs = panel.querySelectorAll('svg');
    allSvgs.forEach(sv => {
      const html = (sv.outerHTML || '').toLowerCase();
      if (html.includes("m11 5l6 9h3v6h3l5 4v5z".toLowerCase()) || html.includes("m11 5l6 9h3v6h3l5 4v5z")) {
        if (!sv.closest('.toy-volwrap')) {
          const maybeBtn = sv.closest('button'); 
          if (maybeBtn && !maybeBtn.closest('.toy-volwrap')) maybeBtn.remove();
          else sv.remove();
        }
      }
    });
  } catch {}


  // Clean up any stray mute buttons outside the volume wrap
  try {
    const stray = panel.querySelectorAll('button[title="Mute"]');
    stray.forEach(btn => { if (!btn.closest('.toy-volwrap')) btn.remove(); });
  } catch {}


  function positionVolume(){
    try{
      const inOverlay = !!panel.closest('#zoom-overlay');
      if (inOverlay){
        volWrap.style.top = 'auto';
        volWrap.style.bottom = '0';
        volWrap.style.left = '0';
        volWrap.style.right = '0';
        volWrap.style.pointerEvents = 'auto';
        return;
      }
      const bodyEl = panel.querySelector('.toy-body') || panel;
      const canvas = bodyEl.querySelector('canvas');
      let topCss = (bodyEl.offsetTop || 0);
      if (canvas){
        topCss += (canvas.offsetTop || 0) + (canvas.clientHeight || 0);
      } else {
        topCss += (bodyEl.clientHeight || 0);
      }
      volWrap.style.bottom = 'auto';
      volWrap.style.top = Math.max(0, Math.round(topCss)) + 'px';
      volWrap.style.left = '0';
      volWrap.style.right = '0';
      volWrap.style.pointerEvents = 'auto';
    }catch{}
  }
  positionVolume();
  window.addEventListener('resize', positionVolume);
  try{ panel.addEventListener('toy-zoom', positionVolume); }catch{}

  // Advanced-only UI (instrument)
  function syncAdvancedUI(){
    const isGridToy = /grid/.test(idBase);
    function updateRightActions(){
      const zoomed = panel.classList.contains('toy-zoomed');
      const buttons = Array.from(header.querySelectorAll('button'));
      const otherHasRandom = buttons.some(b => (b!==randBtn) && /random/i.test(b.textContent||''));
      const otherHasClear  = buttons.some(b => (b!==clearBtn) && /clear/i.test(b.textContent||''));
      randBtn.style.display  = otherHasRandom ? 'none' : '';
      clearBtn.style.display = otherHasClear  ? 'none' : '';
    }

    const zoomed = panel.classList.contains('toy-zoomed');
    instWrap.style.display = zoomed ? 'flex' : 'none';
    try{ updateRightActions(); }catch{}
    try{ updateRightActions(); }catch{}
  }
  syncAdvancedUI();
  try {
    panel.addEventListener('toy-zoom', (e)=>{ try{ setAdvLabel(); }catch{};
      const z = !!(e?.detail?.zoomed);
      panel.classList.toggle('toy-zoomed', z);
      syncAdvancedUI();
      positionVolume();
      try{ (typeof updateRightActions==='function') && updateRightActions(); }catch{}
      try{ updateRightActions(); }catch{}
    });
  } catch {}

  return {
    setInstrument: (name)=>{ instSel.value = name; },
    get instrument(){ return instSel.value; }
  };
}

// Auto-init any panel that didn't call initToyUI itself
function __autoInitToyUI(){
  try{
    const panels = document.querySelectorAll('.toy-panel');
    panels.forEach(p => {
      if (!p.querySelector('.toy-header')){
        const name = p.dataset.toyid || p.dataset.toy || 'Toy';
        const instr = p.dataset.instrument || 'tone';
        try { initToyUI(p, { toyName: name, defaultInstrument: instr }); } catch {}
      }
    });
  }catch{}
}

try{
  if (typeof window !== 'undefined'){
    window.initToyUI = initToyUI;
    if (document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', __autoInitToyUI);
    } else {
      __autoInitToyUI();
    }
    setTimeout(__autoInitToyUI, 200);
  }
}catch{}
