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
  // The theme system will run and may set its own instruments.
  try{ window.ThemeBoot && window.ThemeBoot.wireAll && window.ThemeBoot.wireAll(); }catch{}
  scheduler(grids);
  try{ window.setBoardScale && window.setBoardScale(1); }catch{}
  // Arrange panels if available
  try{ window.organizeBoard && window.organizeBoard(); }catch{}

  // After a short delay to let all other boot scripts (like the theme manager)
  // finish, forcefully set the instruments for the drum toys to our desired defaults.
  // This ensures our settings take precedence over the theme system.
  setTimeout(() => {
    const panels = Array.from(document.querySelectorAll('.toy-panel[data-toy="loopgrid"]'));
    const defaultInstruments = ['djembe_bass', 'djembe_tone', 'djembe_slap', 'hand_clap'];
    panels.forEach((p, i) => {
      const instrument = defaultInstruments[i % defaultInstruments.length];
      if (instrument) {
        p.dispatchEvent(new CustomEvent('toy-instrument', { detail: { value: instrument }, bubbles: true }));
        p.dispatchEvent(new CustomEvent('toy:instrument', { detail: { name: instrument, value: instrument }, bubbles: true }));
      }
    });
  }, 100);
}
if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
