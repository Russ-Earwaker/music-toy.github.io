// --- Module Imports ---
import './bouncer-init.js';
import './header-buttons-delegate.js';
import './rippler-init.js';
import { initDrawGrid } from './drawgrid-init.js';
import { applyStackingOrder } from './stacking-manager.js';

import './toy-audio.js';
import './toy-layout-manager.js';
import './zoom-overlay.js';
import { initAudioAssets } from './audio-samples.js';
import { DEFAULT_BPM, NUM_STEPS, ensureAudioContext, getLoopInfo, setBpm, start, isRunning } from './audio-core.js';
import { createLoopIndicator } from './loopindicator.js';
import { buildGrid } from './drum-core.js';

/**
 * Calculates the visual extents of a panel's content, including any
 * absolutely positioned child buttons that stick out.
 * @param {HTMLElement} panel The panel element.
 * @returns {{left: number, right: number}} The leftmost and rightmost pixel coordinates relative to the panel's content box edge.
 */
function getVisualExtents(panel) {
  const panelWidth = panel.offsetWidth;
  const panelHeight = panel.offsetHeight;
  let minX = 0, maxX = panelWidth;
  let minY = 0, maxY = panelHeight;

  if (panel.dataset.toy === 'loopgrid') {
    const externalButtons = panel.querySelectorAll(':scope > .loopgrid-mode-btn');
    externalButtons.forEach(btn => {
      const left = parseFloat(btn.style.left) || 0;
      const top = parseFloat(btn.style.top) || 0;
      const btnSize = parseFloat(btn.style.getPropertyValue('--c-btn-size')) || 0;
      const right = left + btnSize;
      const bottom = top + btnSize;
      
      if (left < minX) minX = left;
      if (right > maxX) maxX = right;
      if (top < minY) minY = top;
      if (bottom > maxY) maxY = bottom;
    });
  }
  
  return { left: minX, right: maxX, top: minY, bottom: maxY };
}

/**
 * Post-processes the layout of toy panels to prevent overlaps.
 * This runs after `organizeBoard()` and correctly spaces toys by accounting for
 * their full visual width, including margins and external buttons.
 */
function addGapAfterOrganize() {
  const GAP = 36; // The desired visual space between toys.
  const panels = Array.from(document.querySelectorAll('#board > .toy-panel'));
  if (panels.length < 1) return;

  // Sort panels by their visual position (top, then left) to process them in order.
  panels.sort((a, b) => {
    const topA = parseFloat(a.style.top) || 0;
    const topB = parseFloat(b.style.top) || 0;
    if (topA !== topB) return topA - topB;
    return 0; // Fallback to DOM order if tops are identical
  });

  let lastTop = -Infinity;
  let xCursor = 0; // Tracks the start of the next available horizontal space
  let yCursor = 0; // Tracks the start of the next available vertical space
  let rowMaxVisualHeight = 0; // Tracks the max height of the current row

  for (const panel of panels) {
    const currentTop = parseFloat(panel.style.top) || 0;
    const { left: visualLeftOffset, right: visualRightOffset, top: visualTopOffset, bottom: visualBottomOffset } = getVisualExtents(panel);
    const visualWidth = visualRightOffset - visualLeftOffset;
    const visualHeight = visualBottomOffset - visualTopOffset;

    if (currentTop > lastTop) { // New row detected
      xCursor = 0; // Reset for the new row.
      yCursor += rowMaxVisualHeight; // Move y-cursor down by the height of the previous row
      rowMaxVisualHeight = 0; // Reset max height for the new row
    }

    // Calculate the panel's `left` style property.
    // We need to shift the panel to the right so that its leftmost visual part
    // (which could be an external button with a negative `left` style)
    // starts at the cursor.
    panel.style.left = (xCursor - visualLeftOffset) + 'px';

    // Calculate and apply the panel's `top` style property.
    panel.style.top = (yCursor - visualTopOffset) + 'px';

    // Advance the x-cursor for the next panel in the row.
    xCursor += visualWidth + GAP;
    
    // Update the maximum visual height for the current row.
    rowMaxVisualHeight = Math.max(rowMaxVisualHeight, visualHeight + GAP);

    lastTop = currentTop;
  }
}

// Expose layout functions to be callable from other scripts (like topbar.js)
window.applyStackingOrder = applyStackingOrder;
window.addGapAfterOrganize = addGapAfterOrganize;

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
  panels.forEach(p => buildGrid(p, 8));
}
function bootDrawGrids(){
  const panels = Array.from(document.querySelectorAll('.toy-panel[data-toy="drawgrid"]'));
  panels.forEach(initDrawGrid);
}
function getSequencedToys() {
  // Find all panels that have been initialized with a step function.
  return Array.from(document.querySelectorAll('.toy-panel')).filter(p => typeof p.__sequencerStep === 'function');
}
function scheduler(toys){
  const lastCol = new Map(); // Use a map to track last column per toy
  function step(){
    const info = getLoopInfo();
    toys.forEach(toy => {
      const steps = parseInt(toy.dataset.steps, 10) || NUM_STEPS;
      const col = Math.floor(info.phase01 * steps) % steps;
      if (col !== lastCol.get(toy.id)) {
        lastCol.set(toy.id, col);
        try { toy.__sequencerStep(col); } catch (e) { console.warn(`Sequencer step failed for ${toy.id}`, e); }
      }
    });
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
  createLoopIndicator('#topbar');
  // Initialize loopgrids (this attaches __sequencerStep to them)
  bootGrids();
  bootDrawGrids();
  // The theme system will run and may set its own instruments.
  try{ window.ThemeBoot && window.ThemeBoot.wireAll && window.ThemeBoot.wireAll(); }catch{}
  scheduler(getSequencedToys());
  try{ window.setBoardScale && window.setBoardScale(1); }catch{}
  // Arrange panels if available
  try{ window.organizeBoard && window.organizeBoard(); }catch{}
  // After organizing, apply our stacking order to ensure buttons are visible.
  try{ applyStackingOrder(); }catch{}
  // After all positioning, run our gap-fixer to prevent overlaps.
  try{ addGapAfterOrganize(); }catch{}

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
