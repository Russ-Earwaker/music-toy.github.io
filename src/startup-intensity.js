// src/startup-intensity.js — boot glue for intensity, visual bg, auto-mix, and polite random toggles
import { startIntensityMonitor } from './intensity.js';
import { startIntensityVisual } from './visual-bg.js';
import { startAutoMix, setAutoMixEnabled, isAutoMixEnabled } from './auto-mix.js';
import { setPoliteRandomEnabled } from './polite-random.js';

function persist(key, val){
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}
function load(key, def){
  try { const v = localStorage.getItem(key); return (v!=null) ? JSON.parse(v) : def; } catch { return def; }
}

function makeToggle(label, key, initial, onChange){
  const el = document.createElement('label');
  el.className = 'mini-toggle';
  const input = document.createElement('input'); input.type = 'checkbox'; input.checked = !!initial;
  const span = document.createElement('span'); span.textContent = ' ' + label;
  el.appendChild(input); el.appendChild(span);
  input.addEventListener('change', ()=>{ onChange(input.checked); persist(key, !!input.checked); });
  return el;
}

function ensureMiniToolbar(){
  let bar = document.querySelector('#mix-toolbar');
  if (!bar){
    bar = document.createElement('div');
    bar.id = 'mix-toolbar';
    Object.assign(bar.style, {
      position:'fixed', right:'12px', bottom:'12px', zIndex:'10',
      background:'rgba(0,0,0,0.35)', color:'#fff', backdropFilter:'blur(6px)',
      padding:'8px 10px', borderRadius:'10px', font: '14px/1.2 system-ui, sans-serif'
    });
    document.body.appendChild(bar);
  }
  return bar;
}

function boot(){
  startIntensityMonitor();
  startIntensityVisual();
  startAutoMix();

  const autoOn = load('autoMix', true);
  setAutoMixEnabled(autoOn);
  const politeOn = load('politeRandom', true);
  setPoliteRandomEnabled(politeOn);

  const bar = ensureMiniToolbar();
  bar.replaceChildren(
    makeToggle('Auto‑mix', 'autoMix', autoOn, setAutoMixEnabled),
    document.createTextNode(' \u00A0 '),
    makeToggle('Polite random', 'politeRandom', politeOn, setPoliteRandomEnabled)
  );
}

if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot);
else boot();
