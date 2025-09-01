// src/drawgrid-init.js
// Boots the Drawing Grid toy, adds Eraser (always) and Auto‑Tune (Advanced only). Idempotent per panel.

import { createDrawGrid } from './drawgrid.js';

export function initDrawGrid(panel){
  if (panel.__drawgridInit) return panel.__drawToy;
  const toy = createDrawGrid(panel, { toyId: panel.id || 'drawgrid-1', bpm: 120, baseMidi: 60 });
  panel.__drawgridInit = true;
  panel.__drawToy = toy;

  const header = panel.querySelector('.toy-header');
  const right = (header && header.querySelector('.toy-controls-right')) || header;

  // Eraser (always)
  if (right && !panel.__eraserBtn){
    const btn = document.createElement('button');
    btn.type='button'; btn.className='toy-btn';
    btn.textContent = panel.classList.contains('eraser-on') ? 'Draw' : 'Eraser';
    btn.addEventListener('click', (e)=>{ e.stopPropagation(); const on = !panel.classList.contains('eraser-on'); panel.classList.toggle('eraser-on', on); btn.textContent = on?'Draw':'Eraser'; toy.setMode(on?'erase':'draw'); });
    right.appendChild(btn);
    panel.__eraserBtn = btn;
  }

  // Auto‑Tune toggle (Advanced only)
  if (right && !panel.__autoBtn){
    const autoBtn = document.createElement('button');
    autoBtn.type='button'; autoBtn.className='toy-btn adv-only';
    function inAdv(){ return panel.classList.contains('toy-zoomed') || !!panel.closest('#zoom-overlay'); }
    function refresh(){ autoBtn.textContent = toy.getAutoTune?.() ? 'Auto‑Tune: On' : 'Auto‑Tune: Off'; autoBtn.style.display = inAdv()? 'inline-flex':'none'; }
    autoBtn.addEventListener('click', (e)=>{ e.stopPropagation(); toy.setAutoTune?.(!toy.getAutoTune?.()); refresh(); });
    right.appendChild(autoBtn);
    new MutationObserver(refresh).observe(panel, { attributes:true, attributeFilter:['class'] });
    refresh();
    panel.__autoBtn = autoBtn;
  }

  return toy;
}

// Auto‑boot all drawgrid panels
function boot(){ document.querySelectorAll('.toy-panel[data-toy="drawgrid"]').forEach(initDrawGrid); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
