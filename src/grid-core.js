// src/grid-core.js — grid core + instrument sync (<=300 lines)
import { triggerInstrument } from './audio-samples.js';
import { triggerNoteForToy } from './audio-trigger.js';
import { setToyInstrument } from './instrument-map.js';

export function markPlayingColumn(panel, colIndex){
  try{ panel.dispatchEvent(new CustomEvent('loopgrid:playcol', { detail:{ col: colIndex }, bubbles:true })); }catch{}
}

export function buildGrid(panel){
  if (typeof panel === 'string') panel = document.querySelector(panel);
  if (!panel || !(panel instanceof Element)) return null;
  panel.dataset.toy = panel.dataset.toy || 'loopgrid';

  const init = (panel.dataset.instrument||'').toLowerCase();
  if (init === 'djimbe') panel.dataset.instrument = 'djembe_bass';
  if (!panel.dataset.instrument) panel.dataset.instrument = 'djembe_bass';
  try{ setToyInstrument(panel.dataset.toyid || panel.id || 'drum', panel.dataset.instrument); }catch{}

  function setInstrument(name){
    if (!name) return;
    const id = String(name).toLowerCase();
    panel.dataset.instrument = id;
    try{ setToyInstrument(panel.dataset.toyid || panel.id || 'drum', id); }catch{}
  }
  panel.addEventListener('toy-instrument', (e)=> setInstrument(e && e.detail && e.detail.value));
  panel.addEventListener('toy:instrument', (e)=> setInstrument((e && e.detail && (e.detail.name || e.detail.value))));

  panel.__playCurrent = ()=>{
    const toyId = panel.dataset.toyid||panel.id||'grid';
    try{ triggerNoteForToy(toyId, 60, 1.0); }
    catch{ const inst = panel.dataset.instrument || 'tone'; triggerInstrument(inst, 'C4', undefined, toyId); }
  };

  return { markPlayingColumn: (col)=> markPlayingColumn(panel, col) };
}
