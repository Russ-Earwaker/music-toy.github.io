// src/instrument-map.js — per‑toy instrument routing (<=300 lines)
import { getInstrumentNames } from './audio-samples.js';

/** Map of toyId -> instrument name */
const TOY_INST = new Map();

/** utility */
const byScoreDesc = (a,b)=> b[1]-a[1];

function names(){ try{ return getInstrumentNames() || []; }catch{ return []; } }

/** naive classifier for instrument names */
function classify(name){
  const n = (name||'').toLowerCase();
  if (/kick|bd\b|bass\s*drum/.test(n)) return 'kick';
  if (/snare|rim|clap/.test(n)) return 'snare';
  if (/hat|hh\b|ride|cym/.test(n)) return 'hat';
  if (/perc|hit|stab|tom|impact|punch/.test(n)) return 'perc';
  if (/lead|saw|pluck|arp|mono|synth/.test(n)) return 'lead';
  if (/pad|string|choir|atmo|wash/.test(n)) return 'pad';
  if (/bass\b/.test(n)) return 'bass';
  if (/key|piano|ep|bell/.test(n)) return 'keys';
  return 'other';
}

/** pick a sensible default for a role from available names */
function pickForRole(role){
  const all = names();
  if (!all.length) return null;
  const scored = all.map(n => {
    const cat = classify(n);
    let s = 0;
    switch(role){
      case 'percussion': s = (cat==='hat'?5:0) + (cat==='snare'?4:0) + (cat==='kick'?3:0) + (cat==='perc'?2:0); break;
      case 'lead':       s = (cat==='lead'?6:0) + (cat==='keys'?4:0) + (cat==='pad'?2:0); break;
      case 'pad':        s = (cat==='pad'?6:0) + (cat==='keys'?3:0) + (cat==='lead'?1:0); break;
      case 'bass':       s = (cat==='bass'?6:0) + (cat==='lead'?2:0); break;
      case 'perform':    s = (cat==='lead'?6:0) + (cat==='keys'?5:0) + (cat==='perc'?2:0); break;
      default:           s = (cat==='lead'?3:0) + (cat==='pad'?2:0) + (cat==='perc'?1:0);
    }
    // demote anything that literally says 'punch' unless explicitly percussion
    if (/punch/i.test(n) && role!=='percussion') s -= 3;
    return [n, s];
  }).sort(byScoreDesc);
  return scored[0]?.[1] > 0 ? scored[0][0] : all[0];
}

function roleOf(id){
  try{
    const el = document.querySelector(`.toy-panel[data-toyid="${id}"], .toy-panel[data-toy="${id}"]`);
    return (el?.dataset?.role || 'lead').toLowerCase();
  }catch{ return 'lead'; }
}

export function setToyInstrument(id, name){ if (id && name) TOY_INST.set(id, name); }
export function getToyInstrument(id){
  if (!id) return names()[0] || null;
  if (TOY_INST.has(id)) return TOY_INST.get(id);
  const role = roleOf(id);
  const pick = pickForRole(role) || names()[0] || null;
  if (pick) TOY_INST.set(id, pick);
  return pick;
}

// Keep mapping updated if user changes the instrument from UI
window.addEventListener('toy-instrument', (ev)=>{
  try{
    const { toyId, value } = ev.detail || {};
    if (toyId && value) setToyInstrument(toyId, value);
  }catch{}
});

// Also (re)seed defaults once samples are ready
window.addEventListener('samples-ready', ()=>{
  try{
    document.querySelectorAll('.toy-panel').forEach(el => {
      const id = el.dataset.toyid || el.dataset.toy;
      if (id && !TOY_INST.has(id)){
        const pick = pickForRole((el.dataset.role||'').toLowerCase());
        if (pick) TOY_INST.set(id, pick);
      }
    });
  }catch{}
});
