// src/drawgrid-init.js
import { initToyUI } from './toyui.js';
import { triggerInstrument } from './audio-samples.js';
import { createDrawGrid } from './drawgrid.js';

export function initDrawGrid(panel){
  const ui = initToyUI(panel, {
    toyName: 'Drawing Grid',
    defaultInstrument: 'Acoustic Guitar'
  });

  const toy = createDrawGrid(panel, { toyId: 'drawgrid-1', bpm: 120, baseMidi: 60 });

  // Route toy:note to audio
  panel.addEventListener('toy:note', (e) => {
    const { midi } = e.detail;
    const NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const name = NAMES[midi % 12];
    const octave = Math.floor(midi/12) - 1;
    const noteName = `${name}${octave}`;
    const header = panel.querySelector('.toy-header');
    const select = header && header.querySelector('select.inst-select');
    const instrument = (select && select.value) || 'Acoustic Guitar';
    try { triggerInstrument(instrument, noteName, undefined, 'drawgrid-1'); } catch {}
  });

  // Always show Eraser (both modes)
  addEraserButton(panel, toy);

  // Auto-Tune toggle: Advanced only (default ON)
  addAutoTuneButton(panel, toy);

  // After samples load, prefer Acoustic Guitar if available
  document.addEventListener('samples-ready', ()=>{
    try{
      const sel = panel.querySelector('select.inst-select');
      if (!sel) return;
      const wants = Array.from(sel.options).find(o=>/acoustic\s*guitar/i.test(o.value) || /acoustic\s*guitar/i.test(o.textContent));
      if (wants) sel.value = wants.value;
    }catch{}
  });
}

function isAdvanced(panel){
  return panel.classList.contains('toy-zoomed') || !!panel.closest('#zoom-overlay');
}

function addEraserButton(panel, toy){
  const header = panel.querySelector('.toy-header');
  const right = (header && header.querySelector('.toy-controls-right')) || header;
  if (!right) return;
  const btn = document.createElement('button');
  btn.type='button';
  btn.className='toy-btn';
  Object.assign(btn.style,{ padding:'6px 10px', border:'1px solid #252b36', borderRadius:'10px', background:'#0d1117', color:'#e6e8ef', cursor:'pointer' });
  let erase = panel.classList.contains('eraser-on');
  function refresh(){ btn.textContent = erase ? 'Draw' : 'Eraser'; panel.classList.toggle('eraser-on', erase); }
  btn.addEventListener('click', (e)=>{ e.stopPropagation(); erase=!erase; toy.setMode(erase?'erase':'draw'); refresh(); });
  refresh();
  right.appendChild(btn);
}

function addAutoTuneButton(panel, toy){
  const header = panel.querySelector('.toy-header');
  const right = (header && header.querySelector('.toy-controls-right')) || header;
  if (!right) return;
  const btn = document.createElement('button');
  btn.type='button';
  btn.className='toy-btn';
  Object.assign(btn.style,{ padding:'6px 10px', border:'1px solid #252b36', borderRadius:'10px', background:'#0d1117', color:'#e6e8ef', cursor:'pointer' });
  function refresh(){
    btn.textContent = toy.getAutoTune?.() ? 'Auto‑Tune: On' : 'Auto‑Tune: Off';
    btn.style.display = isAdvanced(panel) ? 'inline-flex' : 'none';
  }
  btn.addEventListener('click', (e)=>{ e.stopPropagation(); toy.setAutoTune?.(!toy.getAutoTune?.()); refresh(); });
  right.appendChild(btn);
  refresh();
  new MutationObserver(refresh).observe(panel, { attributes:true, attributeFilter:['class'] });
}


/* ---- auto-boot for drawgrid panels ---- */
function bootDrawGrid(){
  try{
    const panels = document.querySelectorAll('.toy-panel[data-toy="drawgrid"]');
    panels.forEach(p => { try{ initDrawGrid(p); }catch(e){ console.warn('drawgrid init failed', e); } });
  }catch{}
}
if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', bootDrawGrid); }
else { bootDrawGrid(); }
