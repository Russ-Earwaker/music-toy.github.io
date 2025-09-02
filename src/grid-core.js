// src/grid-core.js — minimal grid core (<=300 lines)
import { triggerInstrument } from './audio-samples.js';
import { setToyInstrument } from './instrument-map.js';

export function markPlayingColumn(panel, colIndex){
  try{
    const ev = new CustomEvent('loopgrid:playcol', { detail:{ col: colIndex }, bubbles:true });
    panel.dispatchEvent(ev);
  }catch{}
}

export function buildGrid(panel){
  if (typeof panel === 'string') panel = document.querySelector(panel);
  if (!panel || !(panel instanceof Element)) return null;
  panel.dataset.toy = panel.dataset.toy || 'loopgrid';

  // normalise initial instrument and sync instrument-map
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
  panel.addEventListener('toy-instrument', (e)=> setInstrument(e?.detail?.value));
  panel.addEventListener('toy:instrument', (e)=> setInstrument(e?.detail?.name || e?.detail?.value));

  // expose play API for drum pad and scheduler
  panel.__playCurrent = ()=>{
    const inst = panel.dataset.instrument || 'tone';
    triggerInstrument(inst, 'C4', undefined, panel.dataset.toyid||panel.id||'grid');
  };

  return { markPlayingColumn: (col)=> markPlayingColumn(panel, col) };
}
