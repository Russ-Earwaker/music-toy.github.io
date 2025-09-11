// src/presets.js
// Simple presets: build snapshots and apply via persistence.

import { applySnapshot, markDirty } from './persistence.js';

const PRESETS = {
  three_drums_wheel: {
    name: '3 Drums + Wheel',
    build: ()=>({
      schemaVersion: 1,
      themeId: undefined,
      transport: { bpm: 120 },
      toys: [
        { id:'grid1', type:'loopgrid', ui:{}, state:{ steps:Array(8).fill(false), noteIndices:Array(8).fill(12), instrument:'Djimbe' } },
        { id:'grid2', type:'loopgrid', ui:{}, state:{ steps:Array(8).fill(false), noteIndices:Array(8).fill(12), instrument:'Djimbe' } },
        { id:'grid3', type:'loopgrid', ui:{}, state:{ steps:Array(8).fill(false), noteIndices:Array(8).fill(12), instrument:'Djimbe' } },
        { id:'chord1', type:'chordwheel', ui:{}, state:{} },
      ]
    })
  },
  two_drums_bouncer: {
    name: '2 Drums + Bouncer',
    build: ()=>({
      schemaVersion: 1,
      transport: { bpm: 115 },
      toys: [
        { id:'grid1', type:'loopgrid', ui:{}, state:{ steps:Array(8).fill(false), noteIndices:Array(8).fill(12), instrument:'Djimbe' } },
        { id:'grid2', type:'loopgrid', ui:{}, state:{ steps:Array(8).fill(false), noteIndices:Array(8).fill(12), instrument:'Djimbe' } },
        { id:'toy-b1', type:'bouncer', ui:{}, state:{ instrument:'retro_square' } },
      ]
    })
  },
  all_toys: {
    name: 'All Toys',
    build: ()=>({
      schemaVersion: 1,
      transport: { bpm: 120 },
      toys: [
        { id:'grid1', type:'loopgrid', ui:{}, state:{ steps:Array(8).fill(false), noteIndices:Array(8).fill(12), instrument:'Djimbe' } },
        { id:'grid2', type:'loopgrid', ui:{}, state:{ steps:Array(8).fill(false), noteIndices:Array(8).fill(12), instrument:'Djimbe' } },
        { id:'grid3', type:'loopgrid', ui:{}, state:{ steps:Array(8).fill(false), noteIndices:Array(8).fill(12), instrument:'Djimbe' } },
        { id:'grid4', type:'loopgrid', ui:{}, state:{ steps:Array(8).fill(false), noteIndices:Array(8).fill(12), instrument:'Djimbe' } },
        { id:'toy-b1', type:'bouncer', ui:{}, state:{ instrument:'retro_square' } },
        { id:'toy-r1', type:'rippler', ui:{}, state:{ instrument:'PanFlute' } },
        { id:'chord1', type:'chordwheel', ui:{}, state:{} },
        { id:'drawgrid1', type:'drawgrid', ui:{}, state:{} },
      ]
    })
  }
};

export function listPresets(){
  return Object.keys(PRESETS).map(k => ({ key:k, name: PRESETS[k].name }));
}

export function applyPreset(key){
  const def = PRESETS[key];
  if (!def) return false;
  try{
    const snap = def.build();
    // Hide panels not part of the preset; show included ones
    const include = new Set((snap.toys||[]).map(t => t.id));
    document.querySelectorAll('#board > .toy-panel').forEach(p => {
      p.style.display = include.has(p.id) ? '' : 'none';
    });
    const ok = applySnapshot(snap);
    // Organize visible panels for a clean layout
    try { window.organizeBoard?.(); } catch {}
    try { window.applyStackingOrder?.(); } catch {}
    try { window.addGapAfterOrganize?.(); } catch {}
    try { markDirty(); } catch {}
    return ok;
  }catch(e){ console.warn('[presets] apply failed', e); return false; }
}

