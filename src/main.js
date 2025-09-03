// --- Module Imports ---
import './bouncer-init.js';
import './mute-wire.js';
import './header-buttons-delegate.js';
import './rippler-init.js';
import './toy-audio.js';
import './toy-layout-manager.js';
import './zoom-overlay.js';
import { initAudioAssets } from './audio-samples.js';
import { DEFAULT_BPM, NUM_STEPS, ensureAudioContext, getLoopInfo, setBpm, start, isRunning } from './audio-core.js';
import { createLoopIndicator } from './loopindicator.js';
import { buildGrid } from './grid-core.js';

console.log('[MAIN] module start');
const CSV_PATH = './assets/samples/samples.csv'; // optional
const $ = (sel, root=document)=> root.querySelector(sel);
function bootTopbar(){
  const playBtn = $('#play'), stopBtn = $('#stop'), bpmInput = $('#bpm');
  playBtn?.addEventListener('click', ()=>{ ensureAudioContext(); start(); });
  stopBtn?.addEventListener('click', ()=>{ try{ ensureAudioContext().suspend(); }catch{} });
  bpmInput?.addEventListener('change', (e)=> setBpm(Number(e.target.value)||DEFAULT_BPM));
}

// Define a hook for the theme system to call. This allows the theme manager
// to set the correct default instrument for each drum toy. We accept the
// instrumentId provided by the theme, as it aligns with our desired defaults.
window.assignGridInstrument = (index, instrumentId) => {
  const panels = Array.from(document.querySelectorAll('.toy-panel[data-toy="loopgrid"]'));
  const panel = panels[index];
  if (panel && instrumentId) {
    // Dispatch the 'toy-instrument' event that the UI and core logic listen for.
    panel.dispatchEvent(new CustomEvent('toy-instrument', { detail: { value: instrumentId }, bubbles: true }));
  }
}
function bootGrids(){
  const panels = Array.from(document.querySelectorAll('.toy-panel[data-toy="loopgrid"]'));
  return panels.map(p => buildGrid(p, 8)).filter(Boolean);
}
function scheduler(grids){
  let lastCol=-1;
  function step(){
    const info = getLoopInfo();
    const col = Math.floor(info.phase01 * NUM_STEPS) % NUM_STEPS;
    if (col !== lastCol){
      lastCol = col;
      grids.forEach(g => { try { g.__sequencerStep(col); } catch {} });
    }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
async function boot(){
  // Await audio assets before setting up toys that might use them.
  // This prevents a race condition where toys try to play samples before they are loaded.
  try {
    await initAudioAssets(CSV_PATH);
    console.log('[AUDIO] samples loaded');
  } catch(e) {
    console.warn('[AUDIO] init failed', e);
  }

  bootTopbar();
  createLoopIndicator('body');
  const grids = bootGrids();
  // The theme system is now used to set default instruments via our hook.
  // The instrument list filtering will be undone by a change in toyui.js.
  try{ window.ThemeBoot && window.ThemeBoot.wireAll && window.ThemeBoot.wireAll(); }catch{}
  scheduler(grids);
  try{ window.setBoardScale && window.setBoardScale(1); }catch{}
  // Arrange panels if available
  try{ window.organizeBoard && window.organizeBoard(); }catch{}
}
if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
