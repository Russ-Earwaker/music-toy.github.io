import './ui-drum-controls.js';
import './drum-tiles-visual.js';
import './ensure-advanced.js';
import './zoom-overlay.js'; // ensure global [data-adv] delegate is installed
console.log('[MAIN] module start');
import { initAudioAssets } from './audio-samples.js';
try { initAudioAssets('./assets/samples/samples.csv').then(()=>console.log('[AUDIO] samples loaded')); } catch(e){ console.warn('[AUDIO] init failed', e); }
// src/main.js — clean boot (<=300 lines)
import { DEFAULT_BPM, NUM_STEPS, ensureAudioContext, getLoopInfo, setBpm, start, isRunning } from './audio-core.js';
import { createLoopIndicator } from './loopindicator.js';
import { buildGrid } from './grid.js';
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
      grids.forEach(g=>{ try{ g.markPlayingColumn(col); }catch{} });
    }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
async function boot(){
  bootTopbar();
  createLoopIndicator('body');
  // optional theme wire hook guarded
  try{ window.ThemeBoot && window.ThemeBoot.wireAll && window.ThemeBoot.wireAll(); }catch{}
  const grids = bootGrids();
  scheduler(grids);
  try{ window.setBoardScale && window.setBoardScale(1); }catch{}
  // Arrange panels if available
  try{ window.organizeBoard && window.organizeBoard(); }catch{}
}
if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
else boot();