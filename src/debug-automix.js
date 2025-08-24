// src/debug-automix.js — overlay showing per‑toy Auto‑mix (DOM‑driven list)
import { getToyVolume, isToyMuted } from './audio-core.js';
import { getAutoMixTarget } from './auto-mix.js';

function panels(){
  return Array.from(document.querySelectorAll('.toy-panel'));
}
function toyIdOf(el){
  return (el?.dataset?.toyid || el?.dataset?.toy || '').toLowerCase() || null;
}
function zoomActive(){
  return panels().some(el => el.classList.contains('toy-zoomed') || el.dataset.zoomed === 'true');
}

const el = document.createElement('div');
el.style.position = 'fixed';
el.style.right = '8px';
el.style.top = '8px';
el.style.zIndex = '9999';
el.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
el.style.fontSize = '12px';
el.style.background = 'rgba(13,17,23,0.92)';
el.style.border = '1px solid #2a3142';
el.style.borderRadius = '8px';
el.style.padding = '8px 10px';
el.style.color = '#e6e8ef';
el.style.pointerEvents = 'none';
el.style.minWidth = '240px';
el.style.maxHeight = '45vh';
el.style.overflow = 'auto';
el.innerHTML = '<div id="hdr" style="opacity:0.7;margin-bottom:4px">Auto‑mix</div><div id="rows"></div>';
document.body.appendChild(el);

const hdr = el.querySelector('#hdr');
const rows = el.querySelector('#rows');
const fmt = (n)=> (Math.round(n*100)/100).toFixed(2);

function render(){
  const zs = zoomActive();
  hdr.textContent = zs ? 'Auto‑mix (ZOOM focus)' : 'Auto‑mix';
  let html = '';
  const list = panels().map(toyIdOf).filter(Boolean);
  for (const id of list){
    const v = getToyVolume(id);
    const t = getAutoMixTarget(id);
    const muted = isToyMuted(id);
    let g = v * t;
    if (muted) g = 0;
    const bar = Math.max(0, Math.min(1, g));
    const w = Math.round(100*bar);
    html += `
      <div style="display:flex;align-items:center;gap:8px;margin:2px 0">
        <div style="width:84px;opacity:0.8">${id}</div>
        <div style="flex:1;height:6px;background:#202735;border-radius:3px;overflow:hidden">
          <div style="width:${w}%;height:100%;background:${muted?'#7b8193':'#5bd4a4'}"></div>
        </div>
        <div style="width:120px;text-align:right;opacity:${muted?0.6:1}">v=${fmt(v)} t=${fmt(t)} g=${fmt(g)}</div>
      </div>`;
  }
  rows.innerHTML = html || '<div style="opacity:.7">No toys</div>';
}

const timer = setInterval(render, 100);
try { window.debugAutoMix = { stop(){ clearInterval(timer); }, render }; } catch {}
render();