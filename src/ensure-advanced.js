// src/ensure-advanced.js — ensure Advanced button + ALL-instruments select (<300 lines)
import { getInstrumentNames } from './audio-samples.js';

function labelizeInstrument(name){
  if (!name) return '';
  let s = String(name);
  s = s.replace(/^(c-|s-|t-)/,'');
  s = s.replace(/_/g,' ');
  return s;
}

function buildInstrumentSelect(panel){
  let sel = panel.querySelector('select.toy-instrument');
  // Ensure header and right-controls container
  let header = panel.querySelector('.toy-header');
  if (!header){
    header = document.createElement('div'); header.className='toy-header';
    const left = document.createElement('div'); left.className='toy-title'; left.textContent = panel.id || panel.dataset.toy || 'Toy';
    const right = document.createElement('div'); right.className='toy-controls-right';
    header.append(left, right); panel.prepend(header);
  }
  let right = header.querySelector('.toy-controls-right');
  if (!right){ right = document.createElement('div'); right.className='toy-controls-right'; header.appendChild(right); }

  if (!sel){
    sel = document.createElement('select');
    sel.className='toy-instrument'; sel.title='Instrument'; sel.style.display='none';
    right.appendChild(sel);
  }

  const fill = ()=>{
    const ids = (typeof getInstrumentNames==='function') ? (getInstrumentNames()||[]) : [];
    const cur = (panel.dataset.instrument||'').toLowerCase();
    // build label->id map preferring ids without c-/s-/t- prefix
    const map = new Map();
    for (const id of ids){
      const label = labelizeInstrument(id);
      if (!map.has(label)){
        map.set(label, id);
      }else{
        const chosen = map.get(label);
        const pref = /^(c-|s-|t-)/.test(chosen);
        const candPref = /^(c-|s-|t-)/.test(id);
        if (pref && !candPref) map.set(label, id);
      }
    }
    // render sorted by label
    const entries = Array.from(map.entries()).sort((a,b)=> a[0].localeCompare(b[0]));
    sel.innerHTML='';
    for (const [label,id] of entries){
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = label;
      sel.appendChild(opt);
    }
    if (cur){ sel.value = cur; }
  };
  fill();

  sel.addEventListener('change', ()=>{
    const value = sel.value;
    panel.dataset.instrument = value;
    try{ panel.dispatchEvent(new CustomEvent('toy-instrument', { detail:{ value }, bubbles:true })); }catch{}
    try{ panel.dispatchEvent(new CustomEvent('toy:instrument', { detail:{ name:value, value }, bubbles:true })); }catch{}
  });

  // Refresh when samples decode
  if (!panel.__instrumentSelRefresher){
    panel.__instrumentSelRefresher = true;
    document.addEventListener('samples-ready', ()=>{ try{ fill(); }catch{}; }, { passive:true });
  }

  return sel;
}

function wireAdvanced(panel, btn){
  if (!btn || btn.__wired) return; btn.__wired = true;
  const open = ()=>{
    import('./zoom-overlay.js').then(mod=>{
      if (window.__overlayOpen) return; const fn = (mod && mod.zoomInPanel) || window.zoomInPanel; if (typeof fn === 'function') fn(panel);
    }).catch(()=>{});
  };
  btn.addEventListener('pointerdown', (e)=>{ e.preventDefault(); e.stopPropagation(); open(); }, { capture:true });
  btn.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); open(); }, { capture:true });
}

function ensureAdvancedButtons(){
  document.querySelectorAll('.toy-panel').forEach(panel=>{
    let header = panel.querySelector('.toy-header');
    if (!header){
      header = document.createElement('div'); header.className='toy-header';
      const left = document.createElement('div'); left.className='toy-title'; left.textContent = panel.id || panel.dataset.toy || 'Toy';
      const right = document.createElement('div'); right.className='toy-controls-right';
      header.append(left, right); panel.prepend(header);
    }
    let right = header.querySelector('.toy-controls-right');
    if (!right){ right = document.createElement('div'); right.className='toy-controls-right'; header.appendChild(right); }

    let btn = right.querySelector('[data-adv]');
    if (!btn){
      btn = document.createElement('button'); btn.type='button'; btn.className='toy-btn toy-btn-adv';
      btn.textContent='Advanced'; btn.setAttribute('data-adv','1'); btn.tabIndex=0;
      right.prepend(btn);
      try{ console.log('[ADV][ensure] inserted Advanced for', panel.id || panel.dataset.toy); }catch{}
    }
    buildInstrumentSelect(panel);
    wireAdvanced(panel, btn);
  });
}

function boot(){
  ensureAdvancedButtons();
}
document.addEventListener('DOMContentLoaded', boot);
if (document.readyState!=='loading') boot();

// Fallback global capture opener
if (!window.__advGlobalCapture){
  window.__advGlobalCapture = true;
  document.addEventListener('pointerdown', (e)=>{
    const b = e.target.closest('[data-adv]'); if (!b) return;
    const p = b.closest('.toy-panel'); if (!p) return;
    e.preventDefault(); e.stopPropagation();
    import('./zoom-overlay.js').then(m=>{ if (m && m.zoomInPanel) m.zoomInPanel(p); }).catch(()=>{ try{ window.zoomInPanel && window.zoomInPanel(p); }catch{} });
  }, true);
}
