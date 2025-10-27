// src/startup-intensity.js — boot intensity + visual + toggles
import { startIntensityMonitor } from './intensity.js';
import { enable as startAutoMix, disable as stopAutoMix } from './auto-mix.js';
import { setPoliteRandomEnabled, isPoliteRandomEnabled } from './polite-random.js';

function persist(key, val){ try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
function load(key, def){ try { const v = localStorage.getItem(key); return (v!=null)?JSON.parse(v):def; } catch { return def; } }

function makeToggle(label, key, initial, onChange){
  const el = document.createElement('label');
  el.style.fontSize='12px'; el.style.color='#cbd1df'; el.style.cursor='pointer';
  el.style.marginRight='12px'; el.style.userSelect='none';
  const box = document.createElement('input'); box.type='checkbox'; box.checked = !!initial;
  box.style.verticalAlign='middle';
  box.addEventListener('change', ()=>{ const v = !!box.checked; try{ onChange(v); }catch{} persist(key, v); });
  el.append(box, document.createTextNode(' '+label));
  return el;
}

function ensureMiniToolbar(){
  let bar = document.getElementById('mini-toolbar');
  if (!bar){
    bar = document.createElement('div');
    bar.id = 'mini-toolbar';
    Object.assign(bar.style, {
      position:'fixed', left:'8px', bottom:'8px', zIndex:10000,
      background:'rgba(13,17,23,0.92)', color:'#e6e8ef',
      border:'1px solid #2a3142', borderRadius:'8px', padding:'6px 8px',
      font:'12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
    });
    document.body.appendChild(bar);
  }
  return bar;
}

function isAutoMixEnabled(){ try { return !!window.autoMix?.enabled; } catch { return true; } }
function setAutoMixEnabled(on){ try { on ? startAutoMix() : stopAutoMix(); } catch {} }

export function boot(){
  startIntensityMonitor();

  // restore toggles
  const autoOn = load('autoMix', true);
  setAutoMixEnabled(autoOn);

  const politeOn = load('politeRandom', true);
  setPoliteRandomEnabled(politeOn);

  const bar = ensureMiniToolbar();
  bar.replaceChildren(
    makeToggle('Auto‑mix', 'autoMix', isAutoMixEnabled(), setAutoMixEnabled),
    document.createTextNode(' \u00A0 '),
    makeToggle('Polite random', 'politeRandom', isPoliteRandomEnabled(), setPoliteRandomEnabled)
  );

}

if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot);
else boot();
