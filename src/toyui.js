// src/toyui.js — panel chrome + events (<=300 lines)
import { zoomInPanel, zoomOutPanel } from './zoom-overlay.js';
import { getInstrumentNames } from './audio-samples.js';
import { resolveGridSamples, resolveBouncerSamples, resolveRipplerSamples, resolveWheelSamples } from './theme-manager.js';

const $ = (sel, root=document)=> root.querySelector(sel);

function ensureHeader(panel, titleText){
  let header = panel.querySelector('.toy-header');
  if (!header){
    header = document.createElement('div'); header.className = 'toy-header';
    const left = document.createElement('div'); left.className = 'toy-title'; left.textContent = titleText || (panel.id || panel.dataset.toy || 'Toy');
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

function wireAdvanced(panel, btn){
  if (btn.__wired) return; btn.__wired = true;
  btn.addEventListener('click', (e)=>{
    e.preventDefault();
    const pid = panel.id || panel.dataset.toy || '(no-id)';
    console.log('[ADV][toyui] Advanced clicked for panel:', pid, panel);
    try {
      panel.classList.add('adv-debug-pulse'); setTimeout(()=>panel.classList.remove('adv-debug-pulse'), 600);
      import('./zoom-overlay.js').then(m=>{
        console.log('[ADV][toyui] zoom-overlay module loaded:', !!m);
        if (m && typeof m.zoomInPanel === 'function') { console.log('[ADV][toyui] calling m.zoomInPanel'); m.zoomInPanel(panel); }
        else if (typeof zoomInPanel === 'function') { console.log('[ADV][toyui] calling global zoomInPanel'); zoomInPanel(panel); }
        else { console.warn('[ADV][toyui] no zoomInPanel function found'); }
      });
    } catch (err) {
      console.error('[ADV][toyui] import failed, trying global zoomInPanel', err);
      try { zoomInPanel(panel); } catch (e2) { console.error('[ADV][toyui] global zoomInPanel failed', e2); }
    }
  });
}

function wireRandom(panel, btn){
  if (btn.__wired) return; btn.__wired = true;
  btn.addEventListener('click', (e)=>{
    e.preventDefault();
    const pid = panel.id || panel.dataset.toy || '(no-id)';
    console.log('[ADV][toyui] Advanced clicked for panel:', pid, panel);
    try {
      panel.classList.add('adv-debug-pulse'); setTimeout(()=>panel.classList.remove('adv-debug-pulse'), 600);
      import('./zoom-overlay.js').then(m=>{
        console.log('[ADV][toyui] zoom-overlay module loaded:', !!m);
        if (m && typeof m.zoomInPanel === 'function') { console.log('[ADV][toyui] calling m.zoomInPanel'); m.zoomInPanel(panel); }
        else if (typeof zoomInPanel === 'function') { console.log('[ADV][toyui] calling global zoomInPanel'); zoomInPanel(panel); }
        else { console.warn('[ADV][toyui] no zoomInPanel function found'); }
      });
    } catch (err) {
      console.error('[ADV][toyui] import failed, trying global zoomInPanel', err);
      try { zoomInPanel(panel); } catch (e2) { console.error('[ADV][toyui] global zoomInPanel failed', e2); }
    }
  });
}

function wireClear(panel, btn){
  if (btn.__wired) return; btn.__wired = true;
  btn.addEventListener('click', (e)=>{
    e.preventDefault();
    const pid = panel.id || panel.dataset.toy || '(no-id)';
    console.log('[ADV][toyui] Advanced clicked for panel:', pid, panel);
    try {
      panel.classList.add('adv-debug-pulse'); setTimeout(()=>panel.classList.remove('adv-debug-pulse'), 600);
      import('./zoom-overlay.js').then(m=>{
        console.log('[ADV][toyui] zoom-overlay module loaded:', !!m);
        if (m && typeof m.zoomInPanel === 'function') { console.log('[ADV][toyui] calling m.zoomInPanel'); m.zoomInPanel(panel); }
        else if (typeof zoomInPanel === 'function') { console.log('[ADV][toyui] calling global zoomInPanel'); zoomInPanel(panel); }
        else { console.warn('[ADV][toyui] no zoomInPanel function found'); }
      });
    } catch (err) {
      console.error('[ADV][toyui] import failed, trying global zoomInPanel', err);
      try { zoomInPanel(panel); } catch (e2) { console.error('[ADV][toyui] global zoomInPanel failed', e2); }
    }
  });
}


function buildInstrumentSelect(panel, toyKind){
  // Build once
  let sel = panel.querySelector('select.toy-instrument');
  if (!sel){
    sel = document.createElement('select'); sel.className = 'toy-instrument'; sel.title = 'Instrument';
    // hidden in standard; shown only in Advanced via CSS
    const header = panel.querySelector('.toy-controls-right') || ensureHeader(panel).querySelector('.toy-controls-right');
    header.appendChild(sel);
  }
  // Populate options from theme for this toy
  let list = getInstrumentNames();
  try{
    if (toyKind==='loopgrid') list = resolveGridSamples();
    else if (toyKind==='bouncer') list = resolveBouncerSamples();
    else if (toyKind && toyKind.includes('wheel')) list = resolveWheelSamples();
    else if (toyKind==='rippler') list = resolveRipplerSamples();
  }catch(e){}
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

  let adv = right.querySelector('[data-adv]'); if (!adv){ adv = btn('Advanced'); adv.setAttribute('data-adv','1'); right.prepend(adv); }
  wireAdvanced(panel, adv);

  let rnd = right.querySelector('[data-random]'); if (!rnd){ rnd = btn('Random'); rnd.setAttribute('data-random','1'); right.appendChild(rnd); }
  wireRandom(panel, rnd);

  let clr = right.querySelector('[data-clear]'); if (!clr){ clr = btn('Clear'); clr.setAttribute('data-clear','1'); right.appendChild(clr); }
  wireClear(panel, clr);

  // Volume (mute + slider)
  let volWrap = footer.querySelector('.toy-volwrap'); if (!volWrap){ volWrap = document.createElement('div'); volWrap.className='toy-volwrap'; footer.appendChild(volWrap); }
  if (!volWrap.querySelector('button[title="Mute"]')){
    const mute = document.createElement('button'); mute.className='toy-mute'; mute.title='Mute'; mute.textContent='🔇';
    const range = document.createElement('input'); range.type='range'; range.min='0'; range.max='100'; range.step='1'; range.value='100';
    volWrap.append(mute, range);
  }

  // Instrument select (Advanced-only via CSS)
  const sel = buildInstrumentSelect(panel, toyKind);

  // Default instrument
  const fromTheme = (sel && sel.value) || defaultInstrument || panel.dataset.instrument;
  if (fromTheme) panel.dataset.instrument = fromTheme;

  return { header, footer, body: panel.querySelector('.toy-body'), instrument: panel.dataset.instrument || fromTheme || 'tone' };
}
