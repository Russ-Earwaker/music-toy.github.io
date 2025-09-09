// src/chordwheel-init.js — mounts the Chord Wheel toy
import { createChordWheel } from './chordwheel.js';
import { initToyUI } from './toyui.js';

function bootChordWheels(){
  document.querySelectorAll('.toy-panel[data-toy="chordwheel"]').forEach(panel=>{
    if (panel.__toyInstance) return;
    try{
      createChordWheel(panel);
      panel.__chordwheelBootOK = true;
    }catch(e){
      panel.__chordwheelBootOK = false;
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
