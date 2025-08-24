// src/dev-hud.js — Developer-only HUD for intensity, auto-mix, and polite random
// Toggle with Ctrl+Shift+I or add ?debug=1 to the URL. Not shown to end-users.
let hud, list, enabled=false;

function makeHud(){
  if (hud) return hud;
  hud = document.createElement('div');
  hud.id = 'dev-hud';
  Object.assign(hud.style, {
    position:'fixed', left:'12px', bottom:'12px', zIndex:'9999',
    background:'rgba(0,0,0,0.65)', color:'#fff', backdropFilter:'blur(6px)',
    padding:'10px 12px', borderRadius:'12px', font:'12px/1.4 system-ui, sans-serif',
    maxWidth:'50vw', maxHeight:'40vh', overflow:'auto', whiteSpace:'pre-wrap'
  });
  const title = document.createElement('div');
  title.textContent = 'DEV HUD — Intensity / Auto‑mix / Polite';
  title.style.fontWeight = '700';
  title.style.marginBottom = '6px';
  list = document.createElement('div');
  list.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  hud.appendChild(title); hud.appendChild(list);

  // Controls row
  const ctrls = document.createElement('div');
  ctrls.style.display='flex'; ctrls.style.gap='8px'; ctrls.style.marginTop='8px';

  const btnReloadSamples = document.createElement('button');
  btnReloadSamples.textContent = 'Reload Samples';
  Object.assign(btnReloadSamples.style, { padding:'6px 10px', borderRadius:'8px', border:'1px solid #252b36', background:'#0d1117', color:'#e6e8ef', cursor:'pointer' });
  btnReloadSamples.addEventListener('click', ()=>{
    try { window.dispatchEvent(new CustomEvent('dev-reload-samples')); } catch {}
  });

  const btnHardReload = document.createElement('button');
  btnHardReload.textContent = 'Hard Reload (clear cache)';
  Object.assign(btnHardReload.style, { padding:'6px 10px', borderRadius:'8px', border:'1px solid #252b36', background:'#0d1117', color:'#e6e8ef', cursor:'pointer' });
  btnHardReload.addEventListener('click', async ()=>{
    try {
      // Clear SW caches
      if (window.caches && caches.keys) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      // Unregister service workers
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations){
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
    } catch {}
    // Force a reload; adding cache-buster to URL to bypass any intermediaries
    try {
      const u = new URL(location.href);
      u.searchParams.set('__hard', String(Date.now()));
      location.replace(u.toString());
    } catch {
      location.reload();
    }
  });

  ctrls.appendChild(btnReloadSamples);
  ctrls.appendChild(btnHardReload);
  hud.appendChild(ctrls);

  const toys = document.createElement('div'); toys.id = 'dev-hud-toys'; toys.style.marginTop = '6px'; hud.appendChild(toys);
  document.body.appendChild(hud);
  return hud;
}

function setEnabled(v){
  enabled = !!v;
  if (enabled){ makeHud().style.display = 'block'; render(); }
  else if (hud) hud.style.display = 'none';
}
export function isHudEnabled(){ return enabled; }
export function toggleHud(){ setEnabled(!enabled); }

const state = {
  intens:{}, global:0,
  auto:{}, // id -> gain
  lastPolite:[] // recent events
};

function render(){
  if (!enabled || !hud) return;
  const per = Object.entries(state.intens).map(([k,v]) => `${k.padEnd(10)}  I:${v.toFixed(2)}  A:${(state.auto[k]??1).toFixed(2)}`).join('\n');
  const events = state.lastPolite.slice(-6).map(e=>`• ${e.toy||'?'} dens=${e.density?.toFixed?.(2)} (base=${e.base?.toFixed?.(2)}, pr=${e.priority})`).join('\n');

  // Render per-toy priority sliders (dev only)
  try {
    const toysEl = document.getElementById('dev-hud-toys');
    if (toysEl){
      const panels = Array.from(document.querySelectorAll('.toy-panel[data-toy]'));
      toysEl.innerHTML = '';
      panels.forEach(p => {
        const id = (p.dataset.toy||'').toLowerCase();
        const row = document.createElement('div');
        row.style.display='flex'; row.style.alignItems='center'; row.style.gap='6px'; row.style.marginTop='4px';
        const label = document.createElement('span'); label.textContent = id || '(toy)'; label.style.minWidth='80px';
        const input = document.createElement('input'); input.type='range'; input.min='0.5'; input.max='2'; input.step='0.1';
        const cur = Number(p.dataset.priority || localStorage.getItem('pr:'+id) || '1') || 1;
        input.value = String(cur);
        const val = document.createElement('span'); val.textContent = 'Priority '+cur.toFixed(1);
        input.addEventListener('input', ()=>{ val.textContent = 'Priority '+Number(input.value).toFixed(1); });
        input.addEventListener('change', ()=>{ p.dataset.priority = input.value; try{ localStorage.setItem('pr:'+id, input.value);}catch{} });
        row.appendChild(label); row.appendChild(input); row.appendChild(val);
        toysEl.appendChild(row);
      });
    }
  } catch {}

  list.textContent =
`Global Intensity: ${state.global.toFixed(2)}
${per || '(no toys)'}

Polite events:
${events || '(none yet)'}\n`;
}

window.addEventListener('intensity-update', (e)=>{
  try {
    state.intens = e.detail.perToy || {};
    state.global = e.detail.global || 0;
    render();
  } catch {}
});

window.addEventListener('auto-mix-update', (e)=>{
  try { state.auto = e.detail.perToy || state.auto; render(); } catch {}
});

window.addEventListener('polite-random-used', (e)=>{
  try { state.lastPolite.push(e.detail || {}); render(); } catch {}
});

// Keyboard toggle
window.addEventListener('keydown', (e)=>{
  if (e.key.toLowerCase() === 'i' && e.ctrlKey && e.shiftKey){
    toggleHud();
    e.preventDefault();
  }
});

// Query param toggle
try {
  const u = new URL(location.href);
  if (u.searchParams.get('debug') === '1') setEnabled(true);
} catch {}
