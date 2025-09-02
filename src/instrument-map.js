// src/instrument-map.js (<=300 lines)
// Keep a mapping from toy id -> chosen instrument name; seed sensible defaults.
import { getInstrumentNames } from './audio-samples.js';
const TOY_INST = new Map();
const names = ()=> { try{ return getInstrumentNames()||[]; }catch{ return []; } };

export function setToyInstrument(id, name){ if (id && name) TOY_INST.set(id, name); }
export function getToyInstrument(id){
  if (!id) return names()[0] || null;
  if (TOY_INST.has(id)) return TOY_INST.get(id);
  const pick = names()[0] || null; if (pick) TOY_INST.set(id, pick); return pick;
}

// seed after samples ready
window.addEventListener('samples-ready', ()=>{
  try{
    document.querySelectorAll('.toy-panel').forEach(el=>{
      const id = el.dataset.toyid || el.dataset.toy;
      if (id && !TOY_INST.has(id)) TOY_INST.set(id, names()[0]||'tone');
    });
  }catch{}
});


// Keep map in sync with UI selections
document.addEventListener('toy:instrument', (e)=>{
  try{
    const el = e.target && e.target.closest && e.target.closest('.toy-panel');
    const id = el && (el.dataset.toyid || el.id || el.dataset.toy);
    const name = (e.detail && (e.detail.name || e.detail.value)) || null;
    if (id && name) setToyInstrument(id, name);
  }catch{}
}, true);
