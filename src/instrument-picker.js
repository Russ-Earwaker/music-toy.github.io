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
  const catNames = Array.from(cats.keys()).filter(n=> n !== 'All');

  let current = (panel?.dataset?.instrument||'').toLowerCase();
  let selected = current || '';

  // Build tabs + grid
  const tgtId = String(toyId || panel?.dataset?.toy || panel?.dataset?.toyid || panel?.id || 'master').toLowerCase();
  let activeCat = catNames[0] || '';

  function renderTabs(){
    tabs.innerHTML='';
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

  function renderGrid(){
    grid.innerHTML='';
    const list = (cats.get(activeCat)||[]);
    list.forEach(e=>{
      const b = el('button','inst-item', e.display);
      const disp = String(e.display||'').toLowerCase();
      const id   = String(e.id||'').toLowerCase();
      const synth= String(e.synth||'').toLowerCase().replace(/_/g,'-');
      const hasFn = (k)=>{ try{ return !!(window.AudioDebug && typeof window.AudioDebug.has==='function' && window.AudioDebug.has(k)); }catch{ return false; } };
      // Prefer synth (tone engine) when available; otherwise prefer a real buffer key
      let key = (synth || id || disp || '').trim();
      if (!synth){
        if (hasFn(disp)) key = disp;
        else if (hasFn(id)) key = id;
      }
      b.dataset.value = key;
      if (b.dataset.value === selected) b.classList.add('selected');
      b.addEventListener('click', (ev)=>{
        ev.stopPropagation();
        b.classList.add('tapping'); setTimeout(()=> b.classList.remove('tapping'), 120);
        b.classList.add('flash'); setTimeout(()=> b.classList.remove('flash'), 180);
        try{ ensureAudioContext(); triggerInstrument(b.dataset.value, 'C4', undefined, tgtId); }catch{}
        selected = b.dataset.value; highlight(b);
      });
      grid.appendChild(b);
    });
  }

  renderTabs();
  renderGrid();

  // Wire controls
  // Volume ducking: reduce other toys to 20% while picker is open.
  // Make this robust to nested/rapid openings by tracking per-id duck counts.
  const duckState = (window.__instDuck ||= { count: new Map(), store: new Map(), openCount: 0 });
  const duckedThisOpen = new Set();
  duckState.openCount = (duckState.openCount || 0) + 1;
  try{
    document.querySelectorAll('.toy-panel').forEach(p=>{
      const id = String(p.dataset.toyid || p.dataset.toy || p.id || '').toLowerCase();
      const kind = String(p.dataset.toy || '').toLowerCase();
      if (!id || id === tgtId) return;
      const curVol = getToyVolume ? getToyVolume(id) : 1;
      if (!duckState.count.get(id)) {
        duckState.store.set(id, curVol);
        duckState.count.set(id, 1);
      } else {
        duckState.count.set(id, (duckState.count.get(id) || 0) + 1);
      }
      duckedThisOpen.add(id);
      try{ setToyVolume && setToyVolume(id, Math.max(0, Math.min(1, curVol * 0.2))); }catch{}

      // Also duck the shared kind bus (e.g., 'loopgrid') in case the panel uses it
      if (kind && kind !== tgtId) {
        const kVol = getToyVolume ? getToyVolume(kind) : 1;
        const key = `__kind__:${kind}`;
        if (!duckState.count.get(key)) {
          duckState.store.set(key, kVol);
          duckState.count.set(key, 1);
        } else {
          duckState.count.set(key, (duckState.count.get(key) || 0) + 1);
        }
        duckedThisOpen.add(key);
        try{ setToyVolume && setToyVolume(kind, Math.max(0, Math.min(1, kVol * 0.2))); }catch{}
      }
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
            // Kind keys are prefixed; restore actual key accordingly
            const actual = id.startsWith('__kind__:') ? id.slice('__kind__:'.length) : id;
            try{ setToyVolume && setToyVolume(actual, v); }catch{}
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
            const actual = id.startsWith('__kind__:') ? id.slice('__kind__:'.length) : id;
            try{ setToyVolume && setToyVolume(actual, v); }catch{}
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
