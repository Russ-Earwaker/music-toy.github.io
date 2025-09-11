// src/ensure-advanced.js — Advanced opener + instrument select (CSV display_name only)
let __advPreventUntil = 0;
function msNow(){ return Date.now ? Date.now() : (new Date()).getTime(); }

async function loadInstrumentEntries(){
  // Always prefer CSV so we can use display_name
  try{
    const url = './assets/samples/samples.csv';
    const res = await fetch(url);
    if (res && res.ok){
      const txt = await res.text();
      const lines = txt.split(/\r?\n/).filter(Boolean);
      if (!lines.length) return [];
      const header = lines.shift().split(',').map(s=>s.trim());
      const idIdx   = header.findIndex(h=>/^(id|name|instrument_id|instrument)$/i.test(h));
      const dispIdx = header.findIndex(h=>/^(display\s*_?name|display|label|title)$/i.test(h));
      const out = [];
      for (const line of lines){
        const cells = line.split(',');
        const display = (cells[dispIdx]||'').trim();
            if (!display) continue;
            // Generate the unique ID from the display name to match the audio engine.
            const id = display.toLowerCase().replace(/[\s-]+/g, '_');
            out.push({ id, display });
      }
      return out;
    }
  }catch{}

  // Last resort: fall back to module ids (sanitized to look nicer)
  try{
    const mod = await import('./audio-samples.js');
    if (mod && typeof mod.getInstrumentNames === 'function'){
      const ids = await mod.getInstrumentNames();
      return (ids||[]).map(id=>({ id, display: String(id||'').replace(/^([a-z]{1,2})-/, '').replace(/_/g,' ') }));
    }
  }catch{}
  return [];
}

function buildInstrumentSelect(panel){
  let sel = panel.querySelector('select.toy-instrument');
  let header = panel.querySelector('.toy-header');
  if (!header){
    header = document.createElement('div'); header.className='toy-header';
    const left = document.createElement('div'); left.className='toy-title';
    left.textContent = panel.id || panel.dataset.toy || 'Toy';
    const right = document.createElement('div'); right.className='toy-controls-right';
    header.append(left, right); panel.prepend(header);
  }
  let right = header.querySelector('.toy-controls-right');
  if (!right){ right = document.createElement('div'); right.className='toy-controls-right'; header.appendChild(right); }

  if (!sel){
    sel = document.createElement('select'); sel.className='toy-instrument'; sel.title='Instrument';
    // Visibility is controlled by CSS (.toy-zoomed .toy-instrument)
    right.appendChild(sel);
  }

  function toTitleCase(str){
    try{ return String(str||'').replace(/[_-]/g,' ').replace(/\w\S*/g, t=> t[0].toUpperCase()+t.slice(1).toLowerCase()); }catch{ return String(str||''); }
  }

  const fill = async ()=>{
    const entries = await loadInstrumentEntries();
    // Dedup strictly by display label
    const byLabel = new Map();
    for (const ent of entries){
      const label = String(ent.display||'').trim();
      const id = String(ent.id||'').trim();
      if (!label || !id) continue;
      if (!byLabel.has(label)) byLabel.set(label, id);
    }
    const list = Array.from(byLabel.entries()).sort((a,b)=> a[0].localeCompare(b[0]));
    const cur = (panel.dataset.instrument||'').toLowerCase();
    sel.innerHTML='';
    for (const [label, id] of list){
      const opt = document.createElement('option');
      opt.value = String(id||'').toLowerCase(); // normalize id for stable matching
      opt.textContent = label; // text shows CSV display_name only
      sel.appendChild(opt);
    }
    if (cur){
      // ensure current instrument exists in options
      const exists = Array.from(sel.options).some(o=> String(o.value).toLowerCase() === cur);
      if (!exists){
        const opt = document.createElement('option');
        opt.value = cur;
        opt.textContent = toTitleCase(cur);
        sel.appendChild(opt);
      }
      // try exact match; if not present, try relaxed variants
      sel.value = cur;
      if (sel.value !== cur){
        const relax = cur.replace(/[\s_-]+/g,'');
        for (const o of sel.options){ if (String(o.value).replace(/[\s_-]+/g,'') === relax){ sel.value = o.value; break; } }
      }
    }
  };
  fill();

  sel.addEventListener('change', ()=>{
    const value = sel.value;
    panel.dataset.instrument = value;
    try{ panel.dispatchEvent(new CustomEvent('toy-instrument', { detail:{ value }, bubbles:true })); }catch{}
    try{ panel.dispatchEvent(new CustomEvent('toy:instrument',  { detail:{ name:value, value }, bubbles:true })); }catch{}
  });

  if (!panel.__selRefreshed){
    panel.__selRefreshed = true;
    document.addEventListener('samples-ready', ()=>{ try{ fill(); }catch{} }, { passive:true });
  }
  return sel;
}

function wireAdvanced(panel, btn){
  if (!btn || btn.__wired) return; btn.__wired = true;
  const open = ()=>{
    if (window.__overlayOpen) return;
    if (msNow() < __advPreventUntil) return;
    import('./zoom-overlay.js').then(mod=>{
      const fn = (mod && mod.zoomInPanel) || window.zoomInPanel;
      if (typeof fn === 'function') fn(panel);
    }).catch(()=>{});
  };
  btn.addEventListener('pointerdown', (e)=>{ e.preventDefault(); e.stopPropagation(); open(); }, { capture:true });
  btn.addEventListener('click',       (e)=>{ e.preventDefault(); e.stopPropagation(); }, { capture:true });
}

function ensureAdvancedButtons(){
  document.querySelectorAll('.toy-panel').forEach(panel=>{
    let header = panel.querySelector('.toy-header');
    if (!header){
      header = document.createElement('div'); header.className='toy-header';
      const left = document.createElement('div'); left.className='toy-title';
      left.textContent = panel.id || panel.dataset.toy || 'Toy';
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

function boot(){ ensureAdvancedButtons(); }
document.addEventListener('DOMContentLoaded', boot);
if (document.readyState!=='loading') boot();

if (!window.__advGlobalCapture){
  window.__advGlobalCapture = true;
  document.addEventListener('pointerdown', (e)=>{
    if (window.__overlayOpen) return;
    if (msNow() < __advPreventUntil) return;
    const b = e.target.closest && e.target.closest('[data-adv]'); if (!b) return;
    const p = b.closest && b.closest('.toy-panel'); if (!p) return;
    e.preventDefault(); e.stopPropagation();
    import('./zoom-overlay.js').then(m=>{ if (m && m.zoomInPanel) m.zoomInPanel(p); }).catch(()=>{ try{ window.zoomInPanel && window.zoomInPanel(p); }catch{} });
  }, true);
}

try{
  document.addEventListener('adv:prevent', (e)=>{
    const ms = (e && e.detail && e.detail.ms) || 600;
    __advPreventUntil = msNow() + ms;
  });
}catch{}
