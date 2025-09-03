// src/toyui.js — panel chrome + events (<=300 lines)
import { zoomInPanel, zoomOutPanel } from './zoom-overlay.js';
import { getInstrumentNames } from './audio-samples.js';

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
  let body = panel.querySelector('.toy-body');
  if (!body){ body = document.createElement('div'); body.className = 'toy-body'; panel.appendChild(body); }
  return body;
}
function ensureFooter(panel){
  let footer = panel.querySelector('.toy-footer');
  if (!footer){ footer = document.createElement('div'); footer.className = 'toy-footer'; panel.appendChild(footer); }
  return footer;
}

function btn(label){ const b=document.createElement('button'); b.type='button'; b.className='toy-btn'; b.textContent=label; return b; }

function buildInstrumentSelect(panel, toyKind){
  // Build once
  let sel = panel.querySelector('select.toy-instrument');
  if (!sel){
    sel = document.createElement('select'); sel.className = 'toy-instrument'; sel.title = 'Instrument';
    // hidden in standard; shown only in Advanced via CSS
    const header = panel.querySelector('.toy-controls-right') || ensureHeader(panel).querySelector('.toy-controls-right');
    header.appendChild(sel);
  }
  // Populate with all available instruments. Theme-based filtering is disabled
  // to ensure all options are always visible.
  let list = getInstrumentNames();
  const cur = sel.value || panel.dataset.instrument || '';
  sel.innerHTML = '';
  list.forEach(name=>{ const opt=document.createElement('option'); opt.value=name; opt.textContent=name.split('_').join(' '); sel.appendChild(opt); });
  if (cur) sel.value = cur;
  sel.addEventListener('change', ()=>{
    const value = sel.value;
    panel.dataset.instrument = value;
    try{ panel.dispatchEvent(new CustomEvent('toy-instrument', { detail:{ value }, bubbles:true })); }catch(e){}
    try{ panel.dispatchEvent(new CustomEvent('toy:instrument', { detail:{ name:value, value }, bubbles:true })); }catch(e){}
  });
  return sel;
}

export function initToyUI(panel, { toyName, defaultInstrument }={}){
  if (!panel) return null;
  const toyKind = String(panel.dataset.toy||'').toLowerCase();
  const header = ensureHeader(panel, toyName);
  ensureBody(panel);
  const footer = ensureFooter(panel);

  // Controls
  const right = header.querySelector('.toy-controls-right');

  // Add "Advanced" and "Close" buttons, CSS will toggle visibility.
  if (!right.querySelector('[data-action="advanced"]')) {
    const advBtn = btn('Advanced'); advBtn.dataset.action = 'advanced';
    right.prepend(advBtn);
  }
  if (!right.querySelector('[data-action="close-advanced"]')) {
    const closeBtn = btn('Close'); closeBtn.dataset.action = 'close-advanced';
    right.prepend(closeBtn);
  }
  // Note: Button wiring is handled globally by `header-buttons-delegate.js`

  let rnd = right.querySelector('[data-action="random"]'); if (!rnd){ rnd = btn('Random'); rnd.dataset.action = 'random'; right.appendChild(rnd); }
  // Note: Button wiring is handled globally by `header-buttons-delegate.js`

  let clr = right.querySelector('[data-action="clear"]'); if (!clr){ clr = btn('Clear'); clr.dataset.action = 'clear'; right.appendChild(clr); }
  // Note: Button wiring is handled globally by `header-buttons-delegate.js`

  // Drum-specific "Random Notes" button
  if (toyKind === 'loopgrid' && !right.querySelector('[data-action="random-notes"]')) {
    const rndNotesBtn = btn('Rnd Notes'); rndNotesBtn.dataset.action = 'random-notes';
    right.appendChild(rndNotesBtn);
  }
  // Note: Button wiring is handled globally by `header-buttons-delegate.js`

  // Volume (mute + slider)
  let volWrap = footer.querySelector('.toy-volwrap'); if (!volWrap){ volWrap = document.createElement('div'); volWrap.className='toy-volwrap'; footer.appendChild(volWrap); }
  if (!volWrap.querySelector('button[title="Mute"]')){
    const mute = document.createElement('button'); mute.className='toy-mute'; mute.title='Mute'; mute.textContent='🔇'; mute.setAttribute('aria-pressed', 'false');
    const range = document.createElement('input'); range.type='range'; range.min='0'; range.max='100'; range.step='1'; range.value='100';
    volWrap.append(mute, range);
  }

  // Instrument select (Advanced-only via CSS)
  const sel = buildInstrumentSelect(panel, toyKind);

  // Default instrument
  const initialInstrument = (sel && sel.value) || defaultInstrument || panel.dataset.instrument;
  if (initialInstrument) {
    panel.dataset.instrument = initialInstrument;
    // Dispatch event so the toy's core logic can update the audio system.
    // This makes the boot process more robust, ensuring an instrument is
    // always set, even before the main theme system runs.
    panel.dispatchEvent(new CustomEvent('toy-instrument', { detail: { value: initialInstrument }, bubbles: true }));
  }

  return { header, footer, body: panel.querySelector('.toy-body'), instrument: panel.dataset.instrument || initialInstrument || 'tone' };
}
