// --- Module Imports ---
import './bouncer-init.js';
import './header-buttons-delegate.js';
import './rippler-init.js';
import { createBouncer } from './bouncer.main.js';
import { initDrawGrid } from './drawgrid-init.js';
import { createChordWheel } from './chordwheel.js';
import { applyStackingOrder } from './stacking-manager.js';

import './toy-audio.js';
import './toy-layout-manager.js';
import './zoom-overlay.js';
import { initAudioAssets } from './audio-samples.js';
import { loadInstrumentEntries as loadInstrumentCatalog } from './instrument-catalog.js';
import { DEFAULT_BPM, NUM_STEPS, ensureAudioContext, getLoopInfo, setBpm, start, isRunning } from './audio-core.js';
import { createLoopIndicator } from './loopindicator.js';
import { buildGrid } from './grid-core.js';
import { tryRestoreOnBoot, startAutosave } from './persistence.js';

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

  const toyKind = panel.dataset.toy;
  const hasExternalButtons = ['loopgrid', 'bouncer', 'rippler', 'chordwheel', 'drawgrid'].includes(toyKind);

  if (hasExternalButtons) {
    // These are the large 'Edit'/'Close' buttons positioned outside the panel.
    const externalButtons = panel.querySelectorAll(':scope > .toy-mode-btn');
    externalButtons.forEach(btn => {
      const btnSize = parseFloat(btn.style.getPropertyValue('--c-btn-size')) || 0;
      let btnLeft, btnRight;

      // Check for 'left' style property to calculate horizontal extents.
      if (btn.style.left) {
        btnLeft = parseFloat(btn.style.left); // e.g., -48px
        btnRight = btnLeft + btnSize;
        if (btnLeft < minX) minX = btnLeft;
        if (btnRight > maxX) maxX = btnRight;
      }
      
      // Check for 'top' style property to calculate vertical extents.
      const top = parseFloat(btn.style.top) || 0;
      const bottom = top + btnSize;
      
      if (btnLeft < minX) minX = btnLeft;
      if (btnRight > maxX) maxX = btnRight;
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
    const leftA = parseFloat(a.style.left) || 0; // Add secondary sort for stability
    const leftB = parseFloat(b.style.left) || 0;
    return leftA - leftB;
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

    if (Math.abs(currentTop - lastTop) > 1) { // New row detected (use a small tolerance)
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

let chainCanvas, chainCtx;
const g_pulsingConnectors = new Map(); // fromId -> { toId, pulse: 1.0 }


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
  panels.forEach(p => initDrawGrid(p));
}
function getSequencedToys() {
  // Find all panels that have been initialized with a step function.
  return Array.from(document.querySelectorAll('.toy-panel')).filter(p => typeof p.__sequencerStep === 'function');
}

const toyInitializers = {
    'bouncer': createBouncer,
    'drawgrid': initDrawGrid,
    'loopgrid': buildGrid,
    'chordwheel': createChordWheel,
};

function initializeNewToy(panel) {
    const toyType = panel.dataset.toy;
    const initFn = toyInitializers[toyType];
    if (initFn) {
        try {
            initFn(panel);
            // After init, dispatch a 'toy-clear' event to reset its state.
            panel.dispatchEvent(new CustomEvent('toy-clear', { bubbles: true }));
        } catch (e) {
            console.error(`Failed to initialize new toy of type "${toyType}"`, e);
        }
    }
}

function triggerConnectorPulse(fromId, toId) {
    g_pulsingConnectors.set(fromId, { toId, pulse: 1.0 });
}

function initToyChaining(panel) {
    const extendBtn = document.createElement('button');
    extendBtn.className = 'c-btn toy-chain-btn';
    extendBtn.title = 'Extend with a new toy';
    extendBtn.style.setProperty('--c-btn-size', '65px');
    extendBtn.innerHTML = `<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core"></div>`;
    
    const core = extendBtn.querySelector('.c-btn-core');
    if (core) {
        core.style.setProperty('--c-btn-icon-url', `url('../assets/UI/T_ButtonExtend.png')`);
    }

    panel.appendChild(extendBtn);

    extendBtn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();

        const sourcePanel = panel;
        const toyType = sourcePanel.dataset.toy;
        if (!toyType || !toyInitializers[toyType]) return;

        const newPanel = document.createElement('div');
        newPanel.className = 'toy-panel';
        newPanel.dataset.toy = toyType;
        newPanel.id = `${toyType}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        
        if (sourcePanel.dataset.instrument) {
            newPanel.dataset.instrument = sourcePanel.dataset.instrument;
        }

        const board = document.getElementById('board');
        const sourceRect = sourcePanel.getBoundingClientRect();
        const boardRect = board.getBoundingClientRect();
        const boardScale = window.__boardScale || 1;

        newPanel.style.width = `${sourceRect.width / boardScale}px`;
        newPanel.style.height = `${sourceRect.height / boardScale}px`;
        newPanel.style.position = 'absolute';
        newPanel.style.left = `${(sourceRect.right - boardRect.left) / boardScale + 30}px`;
        newPanel.style.top = `${(sourceRect.top - boardRect.top) / boardScale}px`;

        board.appendChild(newPanel);

        // Defer the rest of the initialization to the next event loop cycle.
        // This gives the browser time to calculate the new panel's layout,
        // which is crucial for the toy's internal canvases to be sized correctly.
        setTimeout(() => {
            if (!newPanel.isConnected) return; // Guard against panel being removed before init

            initializeNewToy(newPanel);
            initToyChaining(newPanel); // Give the new toy its own extend button

            const oldNextId = sourcePanel.dataset.nextToyId;
            sourcePanel.dataset.nextToyId = newPanel.id;
            newPanel.dataset.prevToyId = sourcePanel.id;

            if (oldNextId) {
                const oldNextPanel = document.getElementById(oldNextId);
                newPanel.dataset.nextToyId = oldNextId;
                if (oldNextPanel) oldNextPanel.dataset.prevToyId = newPanel.id;
            }

            document.querySelectorAll('.toy-panel.toy-focused').forEach(p => p.classList.remove('toy-focused'));
            newPanel.classList.add('toy-focused');

            updateChains();
        }, 0);
    });
}

const chainBtnStyle = document.createElement('style');
chainBtnStyle.textContent = `
    .toy-chain-btn { position: absolute; top: 50%; right: -32px; transform: translateY(-50%); z-index: 52; }
`;
document.head.appendChild(chainBtnStyle);

function drawChains() {
    if (!chainCanvas || !chainCtx) return;
    const board = document.getElementById('board');
    if (!board) return;

    const dpr = window.devicePixelRatio || 1;
    // Use scrollWidth/Height to cover the entire pannable area.
    const w = board.scrollWidth;
    const h = board.scrollHeight;

    // Ensure the canvas element size and backing store match the board's scrollable area.
    if (chainCanvas.style.width !== `${w}px` || chainCanvas.style.height !== `${h}px` || chainCanvas.width !== w * dpr || chainCanvas.height !== h * dpr) {
        chainCanvas.style.width = `${w}px`;
        chainCanvas.style.height = `${h}px`;
        chainCanvas.width = w * dpr;
        chainCanvas.height = h * dpr;
        chainCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    chainCtx.clearRect(0, 0, w, h);

    // Decay existing pulses
    for (const [fromId, pulseInfo] of g_pulsingConnectors.entries()) {
        pulseInfo.pulse -= 0.05; // decay rate
        if (pulseInfo.pulse <= 0) {
            g_pulsingConnectors.delete(fromId);
        }
    }

    for (const headId of g_chainState.keys()) {
        let current = document.getElementById(headId);
        while (current) {
            const nextId = current.dataset.nextToyId;
            if (!nextId) break;
            const next = document.getElementById(nextId);
            if (!next) break;

            // The button is centered on the right edge of the panel.
            const p1x = current.offsetLeft + current.offsetWidth;
            const p1y = current.offsetTop + current.offsetHeight / 2;

            // The connection on the next toy is on the opposite (left) side.
            const p2x = next.offsetLeft;
            const p2y = next.offsetTop + next.offsetHeight / 2;

            chainCtx.beginPath();
            chainCtx.moveTo(p1x, p1y);

            const dx = p2x - p1x;
            const controlPointOffset = Math.max(40, Math.abs(dx) * 0.4);

            chainCtx.bezierCurveTo(p1x + controlPointOffset, p1y, p2x - controlPointOffset, p2y, p2x, p2y);

            const pulseInfo = g_pulsingConnectors.get(current.id);
            const isPulsing = pulseInfo && pulseInfo.toId === nextId;
            const pulseAmount = isPulsing ? pulseInfo.pulse : 0;

            const baseWidth = 10;
            const pulseWidth = 15 * pulseAmount;
            chainCtx.lineWidth = baseWidth + pulseWidth;
            chainCtx.strokeStyle = `hsl(222, 100%, ${80 + 15 * pulseAmount}%)`;
            chainCtx.stroke();

            // Erase a circle from the line where the source button is,
            // creating the illusion of the line emerging from behind it.
            chainCtx.save();
            chainCtx.globalCompositeOperation = 'destination-out';
            chainCtx.beginPath();
            chainCtx.arc(p1x, p1y, 32.5, 0, Math.PI * 2); // 32.5 is half of the 65px button size
            chainCtx.fill();
            chainCtx.restore();

            current = next;
        }
    }
}
const g_chainState = new Map();

function findChainHead(toy) {
    if (!toy) return null;
    let current = toy;
    let sanity = 100;
    while (current && current.dataset.prevToyId && sanity-- > 0) {
        const prev = document.getElementById(current.dataset.prevToyId);
        if (!prev || prev === current) break;
        current = prev;
    }
    return current;
}

function updateChains() {
    const allToys = getSequencedToys();
    const seenHeads = new Set();

    allToys.forEach(toy => {
        const head = findChainHead(toy);
        if (head && !seenHeads.has(head.id)) {
            seenHeads.add(head.id);
            if (!g_chainState.has(head.id)) {
                g_chainState.set(head.id, head.id);
            }
        }
    });

    for (const headId of g_chainState.keys()) {
        if (!document.getElementById(headId)) {
            g_chainState.delete(headId);
        }
    }
}

function scheduler(){
  let lastPhase = 0;
  const lastCol = new Map();
  function step(){
    const info = getLoopInfo();
    if (isRunning()){
      const phaseJustWrapped = info.phase01 < lastPhase && lastPhase > 0.9;
      lastPhase = info.phase01;

      if (phaseJustWrapped) {
          for (const [headId, activeToyId] of g_chainState.entries()) {
              const activeToy = document.getElementById(activeToyId);
              if (activeToy) {
                  const nextToyId = activeToy.dataset.nextToyId;
                  const nextToy = nextToyId ? document.getElementById(nextToyId) : null;
                  if (nextToy) {
                      triggerConnectorPulse(activeToyId, nextToyId);
                      g_chainState.set(headId, nextToyId);
                  } else {
                      const headToy = document.getElementById(headId);
                      if (headToy && headToy.id !== activeToyId) {
                          triggerConnectorPulse(activeToyId, headId);
                      }
                      g_chainState.set(headId, headId); // Loop back to head
                  }
              } else {
                  g_chainState.set(headId, headId);
              }
          }
      }

      const activeToyIds = new Set(g_chainState.values());

      // Update data-chain-active on all sequenced toys
      getSequencedToys().forEach(toy => {
          toy.dataset.chainActive = activeToyIds.has(toy.id) ? 'true' : 'false';
      });

      for (const activeToyId of activeToyIds) {
          const toy = document.getElementById(activeToyId);
          if (toy && typeof toy.__sequencerStep === 'function') {
              const steps = parseInt(toy.dataset.steps, 10) || NUM_STEPS;
              const col = Math.floor(info.phase01 * steps) % steps;
              if (col !== lastCol.get(toy.id)) {
                  lastCol.set(toy.id, col);
                  try { toy.__sequencerStep(col); } catch (e) { console.warn(`Sequencer step failed for ${toy.id}`, e); }
              }
          }
      }
    }
    drawChains();
    requestAnimationFrame(step);
  }
  updateChains();
  requestAnimationFrame(step);
}
async function boot(){
  try {
    await initAudioAssets(CSV_PATH);
    await loadInstrumentCatalog();
    console.log('[AUDIO] samples loaded');
  } catch(e) {
    console.warn('[AUDIO] init failed', e);
  }

  const board = document.getElementById('board');
  if (board && !document.getElementById('chain-canvas')) {
      chainCanvas = document.createElement('canvas');
      chainCanvas.id = 'chain-canvas';
      Object.assign(chainCanvas.style, {
          position: 'absolute',
          top: '0', left: '0', // width/height are set dynamically in drawChains
          pointerEvents: 'none',
          zIndex: '1' // Behind toy panels, but in front of any z-index:0 background
      });
      board.prepend(chainCanvas);
      chainCtx = chainCanvas.getContext('2d');
  }

  bootTopbar();
  createLoopIndicator('#topbar');
  let restored = false;
  try{ restored = !!tryRestoreOnBoot(); }catch{}
  bootGrids();
  bootDrawGrids();
  document.querySelectorAll('.toy-panel').forEach(initToyChaining);
  try{ window.ThemeBoot && window.ThemeBoot.wireAll && window.ThemeBoot.wireAll(); }catch{}
  try{ tryRestoreOnBoot(); }catch{}
  scheduler();
  let hasSavedPositions = false; try { hasSavedPositions = !!localStorage.getItem('toyPositions'); } catch {}
  if (!restored && !hasSavedPositions){
    try{ window.organizeBoard && window.organizeBoard(); }catch{}
    try{ applyStackingOrder(); }catch{}
    try{ addGapAfterOrganize(); }catch{}
  } else {
    try{ applyStackingOrder(); }catch{}
  }
  try{ startAutosave(2000); }catch{}
}
if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
