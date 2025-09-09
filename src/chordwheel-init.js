// src/chordwheel-init.js — mounts the Chord Wheel toy
import { createChordWheel } from './chordwheel.js';
import { initToyUI } from './toyui.js';

function bootChordWheels(){
  document.querySelectorAll('.toy-panel[data-toy="chordwheel"]').forEach(panel=>{
    // Use a specific flag to prevent this boot script from running twice on the same panel.
    // This is crucial because the MutationObserver can trigger this function multiple times.
    if (panel.__chordwheel_booted) return;
    panel.__chordwheel_booted = true; // Set flag immediately.
    try{
      createChordWheel(panel);
    }catch(e){
      panel.__chordwheel_booted = false; // Revert on failure so it can be tried again.
      console.error('[chordwheel-init] failed', panel && (panel.id||panel.dataset.toy)||'?', e && (e.stack||e));
    }
  });
}

if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', bootChordWheels);
else bootChordWheels();

try{
  const board = document.getElementById('board') || document.body;
  const obs = new MutationObserver(()=> bootChordWheels());
  obs.observe(board, { childList:true, subtree:true });

}catch(e){ console.warn('[chordwheel-init] observer failed', e); }
