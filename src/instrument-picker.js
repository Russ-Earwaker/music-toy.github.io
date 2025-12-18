// src/instrument-picker.js
// Full-screen instrument picker overlay with categories and preview.

import { loadInstrumentEntries } from './instrument-catalog.js';
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
  bodyWrap.style.display = 'grid';
  bodyWrap.style.gridTemplateColumns = '220px 1fr';
  bodyWrap.style.gap = '16px';
  bodyWrap.style.alignItems = 'start';

  const filters = el('div','inst-filters');
  filters.style.display = 'flex';
  filters.style.flexDirection = 'column';
  filters.style.gap = '12px';
  filters.style.alignSelf = 'stretch';
  const grid = el('div','inst-grid');
  grid.style.maxHeight = '70vh';
  grid.style.overflowY = 'auto';
  grid.style.paddingRight = '6px';
  bodyWrap.append(filters, grid);
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
function makeFilterSection(title){
  const wrap = el('div','inst-filter-section');
  const heading = el('div','inst-filter-title', title);
  heading.style.fontWeight = '600';
  heading.style.marginBottom = '6px';
  const buttons = el('div','inst-filter-buttons');
  buttons.style.display = 'flex';
  buttons.style.flexWrap = 'wrap';
  buttons.style.gap = '8px';
  wrap.append(heading, buttons);
  return { wrap, buttons };
}

export async function openInstrumentPicker({ panel, toyId }){
  const ov = buildOverlay();
  const host = ov.querySelector('.inst-host');
  const filters = ov.querySelector('.inst-filters');
  const grid = ov.querySelector('.inst-grid');
  const okBtn = ov.querySelector('.inst-ok');
  const cancelBtn = ov.querySelector('.inst-cancel');
  const backdrop = ov.querySelector('.inst-picker-backdrop');
  const footer = ov.querySelector('.inst-picker-footer');

  // Load entries and build categories
  const entries = await loadInstrumentEntries();

  const normalizeId = (val)=> String(val || '').trim().toLowerCase().replace(/_/g, '-');
  const getEntryKey = (entry)=>{
    if (!entry) return '';
    const id = String(entry.id || '').trim();
    if (id) return id;
    const synth = String(entry.synth || '').trim();
    return synth ? synth.toLowerCase().replace(/_/g, '-') : '';
  };
  const current = String(panel?.dataset?.instrument || '').trim();
  let selected = current || '';

  // Build filter lists
  const tgtId = String(toyId || panel?.dataset?.toy || panel?.dataset?.toyid || panel?.id || 'master').toLowerCase();
  const allThemes = Array.from(new Set(entries.flatMap(e=> (e.themes||[]).filter(Boolean)))).sort((a,b)=> a.localeCompare(b));
  const allTypes = Array.from(new Set(entries.map(e=> String(e.type||'Other').trim() || 'Other'))).sort((a,b)=> a.localeCompare(b));
  const selectedThemes = new Set();
  const selectedTypes = new Set();
  const toyKind = String(panel?.dataset?.toy || '').toLowerCase();
  let initialSelectionRevealPending = Boolean(selected);

  const isRecommendedForToy = (entry)=>{
    if (!toyKind) return false;
    if (!entry || !Array.isArray(entry.recommendedToys)) return false;
    return entry.recommendedToys.some(t=> t === toyKind);
  };

  const themeSection = makeFilterSection('Theme');
  const typeSection = makeFilterSection('Instrument Type');
  filters.innerHTML = '';
  filters.append(themeSection.wrap, typeSection.wrap);

  function highlight(btn){
    grid.querySelectorAll('.inst-item.selected').forEach(n=>{
      n.classList.remove('selected');
      if (n.dataset.recommended === '1') {
        n.style.border = '1px solid rgba(34,211,238,0.8)';
      }
    });
    if (btn){
      btn.classList.add('selected');
      if (btn.dataset.recommended === '1') {
        btn.style.border = '2px solid #ffffff';
      }
    }
  }

  function renderFilters(){
    const renderButtons = (buttonsEl, items, selectedSet)=>{
      buttonsEl.innerHTML='';
      items.forEach(name=>{
        const label = titleCase(name);
        const b = el('button','inst-filter-btn', label);
        b.style.padding = '6px 10px';
        b.style.borderRadius = '10px';
        b.style.border = '1px solid var(--inst-filter-border, #1f2937)';
        b.style.background = selectedSet.has(name)
          ? 'var(--inst-filter-active-bg, #2563eb)'
          : 'var(--inst-filter-bg, #111827)';
        b.style.color = 'var(--inst-filter-text, #ffffff)';
        b.style.cursor = 'pointer';
        b.style.boxShadow = '0 0 0 1px rgba(255,255,255,0.05) inset';
        b.dataset.value = name;
        if (selectedSet.has(name)) b.classList.add('active');
        b.addEventListener('click', ()=>{
          if (selectedSet.has(name)) selectedSet.delete(name);
          else selectedSet.add(name);
          renderFilters();
          renderGrid();
        });
        buttonsEl.appendChild(b);
      });
    };
    renderButtons(themeSection.buttons, allThemes, selectedThemes);
    renderButtons(typeSection.buttons, allTypes, selectedTypes);
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
    const filtered = entries.filter(e=>{
      const themeOk = selectedThemes.size === 0 || (e.themes||[]).some(t=> selectedThemes.has(t));
      const typeOk = selectedTypes.size === 0 || selectedTypes.has(String(e.type||'Other').trim() || 'Other');
      return themeOk && typeOk;
    }).sort((a,b)=>{
      const aReco = isRecommendedForToy(a);
      const bReco = isRecommendedForToy(b);
      if (aReco !== bReco) return aReco ? -1 : 1;
      return a.display.localeCompare(b.display);
    });
    const list = filtered;
    const normalizedSelected = normalizeId(selected);
    let matchBtn = null;
    list.forEach(e=>{
      const b = el('button','inst-item', e.display);
      const key = getEntryKey(e);
      b.dataset.value = key;
      const recommended = Array.isArray(e.recommendedToys) && e.recommendedToys.some(t=> t === toyKind);
      b.dataset.recommended = recommended ? '1' : '0';
      if (recommended){
        b.style.position = 'relative';
        b.style.background = 'linear-gradient(135deg, rgba(34,211,238,0.18), rgba(37,99,235,0.18))';
        b.style.border = '1px solid rgba(34,211,238,0.8)';
        b.style.color = '#ffffff';
        const star = el('div','inst-reco-star','*');
        star.style.position = 'absolute';
        star.style.top = '6px';
        star.style.right = '8px';
        star.style.color = '#22d3ee';
        star.style.fontWeight = '700';
        b.appendChild(star);
      }

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

  renderFilters();
  renderGrid();

  // Recommended legend in footer
  if (footer && !footer.querySelector('.inst-reco-note')){
    footer.style.display = 'flex';
    footer.style.alignItems = 'center';
    footer.style.gap = '12px';
    footer.style.justifyContent = 'space-between';
    const note = el('div','inst-reco-note');
    const star = document.createElement('span');
    star.textContent = '*';
    star.style.color = '#22d3ee';
    star.style.marginRight = '6px';
    const txt = document.createElement('span');
    txt.textContent = 'recommended';
    txt.style.color = '#ffffff';
    note.style.display = 'flex';
    note.style.alignItems = 'center';
    note.append(star, txt);
    footer.prepend(note);
  }

  // Block background zoom/pan while picker is open; allow grid scrolling.
  const wheelBlocker = (e)=>{
    const inGrid = e.target && e.target.closest && e.target.closest('.inst-grid');
    if (inGrid){
      e.stopPropagation(); // let default scrolling happen inside the grid
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  };
  host?.addEventListener('wheel', wheelBlocker, { passive: false });

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
    try{ host?.removeEventListener('wheel', wheelBlocker, { passive: false }); }catch{}
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
