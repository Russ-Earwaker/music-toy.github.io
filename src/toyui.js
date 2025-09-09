// src/toyui.js — panel chrome + events (<=300 lines)
import { zoomInPanel, zoomOutPanel } from './zoom-overlay.js';
import { getInstrumentNames } from './audio-samples.js';
import { installVolumeUI } from './volume-ui.js';
import { openInstrumentPicker } from './instrument-picker.js';

const $ = (sel, root=document)=> root.querySelector(sel);

function ensureHeader(panel, titleText){
  let header = panel.querySelector('.toy-header');
  if (!header){
    header = document.createElement('div'); header.className = 'toy-header';
    const left = document.createElement('div'); left.className = 'toy-title'; left.textContent = titleText || (panel.id || panel.dataset.toy || 'Toy'); left.setAttribute('data-drag-handle', '1');
    const right = document.createElement('div'); right.className = 'toy-controls-right';
    header.append(left, right); panel.prepend(header);
  }
  return header;
}

function ensureBody(panel){
  if (!panel.querySelector('.toy-body')){
    const body = document.createElement('div'); body.className='toy-body'; panel.appendChild(body);
  }
}

function ensureFooter(panel){
  let footer = panel.querySelector('.toy-footer');
  if (!footer){ footer = document.createElement('div'); footer.className='toy-footer'; panel.appendChild(footer); }
  return footer;
}

function btn(label){ const b=document.createElement('button'); b.type='button'; b.className='toy-btn'; b.textContent=label; return b; }

function buildInstrumentSelect(panel){
  let sel = panel.querySelector('select.toy-instrument');
  const header = ensureHeader(panel);
  const right = header.querySelector('.toy-controls-right');

  if (!sel){
    sel = document.createElement('select'); sel.className = 'toy-instrument'; sel.title = 'Instrument';
    // shown only in Advanced via CSS
    right.appendChild(sel);
  }

  // (Population handled by ensure-advanced.js after samples-ready)
  // We only wire the change event here.
  if (!sel.__wired){
    sel.__wired = true;
    sel.addEventListener('change', ()=>{
      const value = sel.value;
      panel.dataset.instrument = value;
      try{ panel.dispatchEvent(new CustomEvent('toy-instrument', { detail:{ value }, bubbles:true })); }catch(e){}
      try{ panel.dispatchEvent(new CustomEvent('toy:instrument', { detail:{ name:value, value }, bubbles:true })); }catch(e){}
    });
  }
  return sel;
}

export function initToyUI(panel, { toyName, defaultInstrument }={}){
  if (!panel) return null;
  const toyKind = String(panel.dataset.toy||'').toLowerCase();
  const header = ensureHeader(panel, toyName);
  ensureBody(panel);
  const footer = ensureFooter(panel);

  // Centrally install the volume UI for every toy.
  installVolumeUI(footer);

  // Controls
  const right = header.querySelector('.toy-controls-right');

  // Advanced / Close buttons (CSS toggles visibility)
  if (!right.querySelector('[data-action="advanced"]')) {
    const advBtn = btn('Advanced'); advBtn.dataset.action = 'advanced';
    right.prepend(advBtn);
  }
  if (!right.querySelector('[data-action="close-advanced"]')) {
    const closeBtn = btn('Close'); closeBtn.dataset.action = 'close-advanced';
    right.prepend(closeBtn);
  }

  // Random / Clear buttons (delegated elsewhere)
  if (!right.querySelector('[data-action="random"]')) {
    const b = btn('Random'); // Default label
    b.dataset.action='random';
    right.appendChild(b);

    // For loopgrid, the "Random" button has a different label in advanced mode.
    if (toyKind === 'loopgrid') {
      const updateLabel = () => {
        const isAdvanced = panel.classList.contains('toy-zoomed');
        b.textContent = isAdvanced ? 'Random Cubes' : 'Random';
      };
      updateLabel(); // Set initial text
      panel.addEventListener('toy-zoom', updateLabel); // Update on zoom change
    }
  }
  if (!right.querySelector('[data-action="clear"]'))  { const b = btn('Clear');  b.dataset.action='clear';  right.appendChild(b); }

  // Drum-specific "Random Notes" button
  if (toyKind === 'loopgrid' && !right.querySelector('[data-action="random-notes"]')) {
    const b = btn('Random Notes'); b.dataset.action='random-notes'; right.appendChild(b);
  }

  // Rippler advanced-only buttons: Random Notes + Random Blocks
  if (toyKind === 'rippler') {
    if (!right.querySelector('[data-action="random-notes"]')) {
      const b = btn('Random Notes'); b.dataset.action='random-notes'; right.appendChild(b);
    }
    if (!right.querySelector('[data-action="random-blocks"]')) {
      const b = btn('Random Blocks'); b.dataset.action='random-blocks'; right.appendChild(b);
    }
  }

  // Bouncer has special button logic to swap "Random" for two more specific buttons in advanced mode.
  if (toyKind === 'bouncer') {
    const randomBtn = right.querySelector('[data-action="random"]');

    // Ensure the advanced-only buttons exist.
    let randomNotesBtn = right.querySelector('[data-action="random-notes"]');
    if (!randomNotesBtn) {
      randomNotesBtn = btn('Random Notes'); randomNotesBtn.dataset.action = 'random-notes'; right.appendChild(randomNotesBtn);
    }
    let randomCubesBtn = right.querySelector('[data-action="random-cubes"]');
    if (!randomCubesBtn) {
      randomCubesBtn = btn('Random Cubes'); randomCubesBtn.dataset.action = 'random-cubes'; right.appendChild(randomCubesBtn);
    }

    // This function explicitly sets the visibility of the buttons based on the view mode.
    // This is more robust than relying purely on CSS.
    const updateVisibility = () => {
      const isAdvanced = panel.classList.contains('toy-zoomed');
      // The main "Random" button is visible in standard view, hidden in advanced.
      if (randomBtn) {
        randomBtn.style.display = isAdvanced ? 'none' : 'inline-block';
      }
      // The specific "Random Notes" and "Random Cubes" buttons are visible in advanced, hidden in standard.
      // We set display explicitly to 'inline-block' to override any conflicting CSS rules.
      if (randomNotesBtn) randomNotesBtn.style.display = isAdvanced ? 'inline-block' : 'none';
      if (randomCubesBtn) randomCubesBtn.style.display = isAdvanced ? 'inline-block' : 'none';
    }
    updateVisibility(); // Set initial state
    panel.addEventListener('toy-zoom', updateVisibility); // Update on view change
  }

  // Instrument select (header, hidden in standard)
  const sel = buildInstrumentSelect(panel);
  // Replace select with a button that opens the picker (keep select for fallback/state only)
  let instBtn = right.querySelector('.toy-inst-btn');
  if (!instBtn){
    instBtn = document.createElement('button'); instBtn.type='button'; instBtn.className='toy-btn toy-inst-btn'; instBtn.textContent='Instrument…';
    right.appendChild(instBtn);
  }
  instBtn.addEventListener('click', async ()=>{
    try{
      const chosen = await openInstrumentPicker({ panel, toyId: (panel.dataset.toyid || panel.dataset.toy || panel.id || 'master') });
      if (!chosen){
        try{ const h = panel.querySelector('.toy-header'); if (h){ h.classList.remove('pulse-accept'); h.classList.add('pulse-cancel'); setTimeout(()=> h.classList.remove('pulse-cancel'), 650); } }catch{}
        return; // cancelled
      }
      const val = String(chosen||'').toLowerCase();
      // Update UI select to contain and select it
      let has = Array.from(sel.options).some(o=> String(o.value).toLowerCase() === val);
      if (!has){ const o=document.createElement('option'); o.value=val; o.textContent=val.replace(/[_-]/g,' ').replace(/\w\S*/g, t=> t[0].toUpperCase()+t.slice(1).toLowerCase()); sel.appendChild(o); }
      sel.value = val;
      // Apply to toy
      panel.dataset.instrument = val;
      try{ panel.dispatchEvent(new CustomEvent('toy-instrument', { detail:{ value: val }, bubbles:true })); }catch{}
      try{ panel.dispatchEvent(new CustomEvent('toy:instrument', { detail:{ name: val, value: val }, bubbles:true })); }catch{}
      try{ const h = panel.querySelector('.toy-header'); if (h){ h.classList.remove('pulse-cancel'); h.classList.add('pulse-accept'); setTimeout(()=> h.classList.remove('pulse-accept'), 650); } }catch{}
    }catch{}
  });

  // Keep select in sync when instrument changes elsewhere
  panel.addEventListener('toy-instrument', (e) => {
    const instrumentName = (e?.detail?.value||'').toLowerCase();
    if (!instrumentName) return;
    // Ensure option exists
    const has = Array.from(sel.options).some(o=> String(o.value).toLowerCase() === instrumentName);
    if (!has){
      const opt = document.createElement('option');
      opt.value = instrumentName;
      opt.textContent = instrumentName.replace(/[_-]/g,' ').replace(/\w\S*/g, t=> t[0].toUpperCase()+t.slice(1).toLowerCase());
      sel.appendChild(opt);
    }
    if (sel.value !== instrumentName) sel.value = instrumentName;
  });
  panel.addEventListener('toy:instrument', (e) => {
    const instrumentName = ((e?.detail?.name || e?.detail?.value)||'').toLowerCase();
    if (!instrumentName) return;
    const has = Array.from(sel.options).some(o=> String(o.value).toLowerCase() === instrumentName);
    if (!has){
      const opt = document.createElement('option');
      opt.value = instrumentName;
      opt.textContent = instrumentName.replace(/[_-]/g,' ').replace(/\w\S*/g, t=> t[0].toUpperCase()+t.slice(1).toLowerCase());
      sel.appendChild(opt);
    }
    if (sel.value !== instrumentName) sel.value = instrumentName;
  });

  // SAFER initial instrument resolution:
  // Prefer existing dataset (e.g., theme), then explicit default, and only then current select value.
  const cur = (panel.dataset.instrument || '').toLowerCase();
  const selVal = (sel && sel.value) ? String(sel.value).toLowerCase() : '';
  const initialInstrument = cur || (defaultInstrument ? String(defaultInstrument).toLowerCase() : '') || selVal || 'tone';

  // Apply initial instrument without letting an empty/unmatched select overwrite the theme
  if (initialInstrument) {
    panel.dataset.instrument = initialInstrument;
    // Notify toy code once; listeners will keep UI in sync
    try{ panel.dispatchEvent(new CustomEvent('toy-instrument', { detail: { value: initialInstrument }, bubbles: true })); }catch{}
    try{ panel.dispatchEvent(new CustomEvent('toy:instrument',  { detail: { name: initialInstrument, value: initialInstrument }, bubbles: true })); }catch{}
  }

  return { header, footer, body: panel.querySelector('.toy-body'), instrument: panel.dataset.instrument || initialInstrument || 'tone' };
}
