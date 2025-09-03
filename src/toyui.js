// src/toyui.js — panel chrome + events (<=300 lines)
import { zoomInPanel, zoomOutPanel } from './zoom-overlay.js';
import { getInstrumentNames } from './audio-samples.js';
import { installVolumeUI } from './volume-ui.js';

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
  if (!right.querySelector('[data-action="random"]')) { const b = btn('Random'); b.dataset.action='random'; right.appendChild(b); }
  if (!right.querySelector('[data-action="clear"]'))  { const b = btn('Clear');  b.dataset.action='clear';  right.appendChild(b); }

  // Drum-specific "Random Notes" button
  if (toyKind === 'loopgrid' && !right.querySelector('[data-action="random-notes"]')) {
    const b = btn('Random Notes'); b.dataset.action='random-notes'; right.appendChild(b);
  }

  // Instrument select (header, hidden in standard)
  const sel = buildInstrumentSelect(panel);

  // Keep select in sync when instrument changes elsewhere
  panel.addEventListener('toy-instrument', (e) => {
    const instrumentName = e?.detail?.value;
    if (instrumentName && sel.value !== instrumentName) {
      sel.value = instrumentName;
    }
  });
  panel.addEventListener('toy:instrument', (e) => {
    const instrumentName = (e?.detail?.name || e?.detail?.value);
    if (instrumentName && sel.value !== instrumentName) {
      sel.value = instrumentName;
    }
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
