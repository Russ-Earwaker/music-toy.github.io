// src/instrument-picker.js
// Full-screen instrument picker overlay with categories and preview.

import { loadInstrumentEntries, categorize } from './instrument-catalog.js';
import { ensureAudioContext, setToyVolume, getToyVolume } from './audio-core.js';
import { triggerInstrument } from './audio-samples.js';

function el(tag, cls, text){ const e=document.createElement(tag); if(cls) e.className=cls; if(text) e.textContent=text; return e; }

function buildOverlay(){
  let ov = document.getElementById('inst-picker');
  if (ov) return ov;
  ov = el('div','inst-picker'); ov.id='inst-picker';
  const backdrop = el('div','inst-picker-backdrop');
  const host = el('div','inst-host');
  // Build a proper panel using existing toy styles
  const panel = el('div','toy-panel inst-panel');
  panel.dataset.focusSkip = '1'; // treat picker as standalone, not part of toy focus ring
  const header = el('div','toy-header');
  const title = el('div','toy-title'); title.textContent = 'Choose Instrument';
  const right = el('div','toy-controls-right');
  header.append(title, right);
  const body = el('div','toy-body');
  const bodyWrap = el('div','inst-body');
  const tabs = el('div','inst-tabs');
  const grid = el('div','inst-grid');
  bodyWrap.append(tabs, grid);
  body.appendChild(bodyWrap);
  const footer = el('div','inst-picker-footer');
  const okBtn = el('button','toy-btn inst-ok','✓');
  const cancelBtn = el('button','toy-btn inst-cancel','✕');
  footer.append(cancelBtn, okBtn);
  panel.append(header, body, footer);
  host.appendChild(panel);
  ov.append(backdrop, host);
  document.body.appendChild(ov);
  return ov;
}

function titleCase(s){ return String(s||'').replace(/[_-]/g,' ').replace(/\w\S*/g, t=> t[0].toUpperCase()+t.slice(1).toLowerCase()); }

export async function openInstrumentPicker({ panel, toyId }){
  const ov = buildOverlay();
  const tabs = ov.querySelector('.inst-tabs');
  const grid = ov.querySelector('.inst-grid');
  const okBtn = ov.querySelector('.inst-ok');
  const cancelBtn = ov.querySelector('.inst-cancel');
  const backdrop = ov.querySelector('.inst-picker-backdrop');

  // Load entries and build categories
  const entries = await loadInstrumentEntries();
  const cats = categorize(entries);
  const catNames = Array.from(cats.keys());

  const normalizeId = (val)=> String(val || '').trim().toLowerCase().replace(/_/g, '-');
  const getEntryKey = (entry)=>{
    if (!entry) return '';
    const id = String(entry.id || '').trim();
    if (id) return id;
    const synth = String(entry.synth || '').trim();
    return synth ? synth.toLowerCase().replace(/_/g, '-') : '';
  };
  const findCategoryForInstrument = (instrumentId)=>{
    const target = normalizeId(instrumentId);
    if (!target) return null;
    const themeHits = [];
    const typeHits = [];
    for (const [cat, list] of cats.entries()){
      const has = list.some(entry => normalizeId(getEntryKey(entry)) === target);
      if (!has) continue;
      if (cat.startsWith('Theme: ')) themeHits.push(cat);
      else if (cat !== 'All') typeHits.push(cat);
    }
    if (themeHits.length) return themeHits[0];
    if (typeHits.length) return typeHits[0];
    return cats.has('All') ? 'All' : null;
  };

  const current = String(panel?.dataset?.instrument || '').trim();
  let selected = current || '';

  // Build tabs + grid
  const tgtId = String(toyId || panel?.dataset?.toy || panel?.dataset?.toyid || panel?.id || 'master').toLowerCase();
  const initialCat = findCategoryForInstrument(selected);
  let activeCat = (initialCat && catNames.includes(initialCat)) ? initialCat : (catNames.includes('All') ? 'All' : (catNames[0] || ''));
  let initialSelectionRevealPending = Boolean(initialCat);

  function renderTabs(){
    tabs.innerHTML='';
    if (activeCat && !catNames.includes(activeCat) && catNames.length){
      activeCat = catNames[0];
    }
    catNames.forEach(name=>{
      const t = el('button','inst-tab', name);
      if (name===activeCat) t.classList.add('selected');
      t.addEventListener('click', ()=>{ activeCat=name; renderTabs(); renderGrid(); });
      tabs.appendChild(t);
    });
  }

  function highlight(btn){
    grid.querySelectorAll('.inst-item.selected').forEach(n=> n.classList.remove('selected'));
    if (btn) btn.classList.add('selected');
  }

  function ensureSelectedVisible(btn){
    if (!initialSelectionRevealPending || !btn) return;
    initialSelectionRevealPending = false;
    requestAnimationFrame(()=> {
      try{
        btn.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
      }catch{}
    });
  }

  function renderGrid(){
    grid.innerHTML='';
    const list = cats.get(activeCat) || cats.get('All') || [];
    const normalizedSelected = normalizeId(selected);
    let matchBtn = null;
    list.forEach(e=>{
      const b = el('button','inst-item', e.display);
      const key = getEntryKey(e);
      b.dataset.value = key;

      if (!matchBtn && normalizedSelected && normalizeId(key) === normalizedSelected) {
        matchBtn = b;
      }
      b.addEventListener('click', (ev)=>{
        ev.stopPropagation();
        b.classList.add('tapping'); setTimeout(()=> b.classList.remove('tapping'), 120);
        b.classList.add('flash'); setTimeout(()=> b.classList.remove('flash'), 180);
        try{ ensureAudioContext(); triggerInstrument(b.dataset.value, 'C4', undefined, tgtId); }catch{}
        selected = b.dataset.value; highlight(b);
      });
      grid.appendChild(b);
    });
    if (matchBtn){
      highlight(matchBtn);
      ensureSelectedVisible(matchBtn);
    } else if (initialSelectionRevealPending){
      initialSelectionRevealPending = false;
    }
  }

  renderTabs();
  renderGrid();

  // Wire controls
  // Volume ducking: reduce other toys to ~20% while picker is open.
  // Robust to nested/rapid openings via ref-count map; chooses one key per panel (prefer panel.id, else toy kind).
  const duckState = (window.__instDuck ||= { count: new Map(), store: new Map(), openCount: 0 });
  const duckedThisOpen = new Set();
  duckState.openCount = (duckState.openCount || 0) + 1;
  try{
    const currentId = String(panel.id || panel.dataset.toyid || panel.dataset.toy || '').toLowerCase();
    const keysToDuck = new Set();
    document.querySelectorAll('.toy-panel').forEach(p=>{
      const pid  = String(p.id || '').toLowerCase();
      const kind = String(p.dataset.toy || '').toLowerCase();
      const key = pid || kind;
      if (!key) return;
      if (key === currentId) return; // don't duck the toy we are editing
      keysToDuck.add(key);
    });
    keysToDuck.forEach(id=>{
      const curVol = getToyVolume ? getToyVolume(id) : 1;
      if (!duckState.count.get(id)) {
        duckState.store.set(id, curVol);
        duckState.count.set(id, 1);
      } else {
        duckState.count.set(id, (duckState.count.get(id) || 0) + 1);
      }
      duckedThisOpen.add(id);
      try{
        const newVol = Math.max(0, Math.min(1, curVol * 0.2));
        setToyVolume && setToyVolume(id, newVol);
        console.info('[inst-picker] duck', id, 'from', curVol, 'to', newVol);
      }catch{}
    });
  }catch{}

  function close(result){
    ov.classList.remove('open');
    window.setTimeout(()=>{ ov.style.display='none'; }, 120);
    // Restore volumes using ref-counted ducking
    try{
      duckedThisOpen.forEach((id)=>{
        const n = (duckState.count.get(id) || 0) - 1;
        if (n <= 0){
          duckState.count.delete(id);
          const v = duckState.store.get(id);
          duckState.store.delete(id);
          if (typeof v === 'number') {
            try{ setToyVolume && setToyVolume(id, v); console.info('[inst-picker] restore', id, 'to', v); }catch{}
          }
        } else {
          duckState.count.set(id, n);
        }
      });
      // If no picker remains open, hard-restore any lingering ducked ids
      duckState.openCount = Math.max(0, (duckState.openCount || 1) - 1);
      if (duckState.openCount === 0){
        duckState.count.forEach((_, id)=>{
          const v = duckState.store.get(id);
          if (typeof v === 'number') {
            try{ setToyVolume && setToyVolume(id, v); console.info('[inst-picker] final restore', id, 'to', v); }catch{}
          }
        });
        duckState.count.clear();
        duckState.store.clear();
      }
    }catch{}
    resolve && resolve(result);
  }
  let resolve;
  const p = new Promise(r=> resolve=r);
  okBtn.onclick = ()=> close(selected||current||null);
  cancelBtn.onclick = ()=> close(null);
  backdrop.onclick = ()=> close(null);

  // Open
  ov.style.display='block';
  requestAnimationFrame(()=> ov.classList.add('open'));
  return p;
}
