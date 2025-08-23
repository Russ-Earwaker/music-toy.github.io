// src/startup-intensity.js — boot intensity + visual + toggles
import { startIntensityMonitor } from './intensity.js';
import { startIntensityVisual } from './visual-bg.js';
import { startAutoMix, setAutoMixEnabled, isAutoMixEnabled } from './auto-mix.js';
import { setPoliteRandomEnabled, isPoliteRandomEnabled } from './polite-random.js';

function persist(key, val){ try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
function load(key, def){ try { const v = localStorage.getItem(key); return (v!=null)?JSON.parse(v):def; } catch { return def; } }

function makeToggle(label, key, initial, onChange){
  const el = document.createElement('label');
  el.style.fontSize='12px'; el.style.color='#cbd1df'; el.style.cursor='pointer';
  el.style.marginRight='12px'; el.style.userSelect='none';
  const box = document.createElement('input'); box.type='checkbox'; box.checked = !!initial;
  box.style.verticalAlign='middle';
  box.addEventListener('change', ()=>{ onChange(box.checked); persist(key, box.checked); });
  el.appendChild(box);
  el.appendChild(document.createTextNode(' ' + label));
  return el;
}

function ensureMiniToolbar(){
  let bar = document.getElementById('intensity-mini-toolbar');
  if (!bar){
    bar = document.createElement('div');
    bar.id = 'intensity-mini-toolbar';
    Object.assign(bar.style, {
      position:'fixed', right:'10px', bottom:'10px', zIndex:'10000',
      background:'#0b0f14dd', border:'1px solid #232a36', borderRadius:'10px',
      padding:'6px 10px', backdropFilter:'blur(4px)'
    });
    document.body.appendChild(bar);
  }
  return bar;
}

function boot(){
  console.log('[intensity] starting…');
  startIntensityMonitor();
  startIntensityVisual();
  startAutoMix();

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
  console.log('[intensity] ready');
}

if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot);
else boot();
