// --- Module Imports ---
import './debug.js';
import { initializeBouncer } from './bouncer-init.js';
import './header-buttons-delegate.js';
import './rippler-init.js';
import './tutorial.js';
// import { createBouncer } from './bouncer.main.js'; // This is now handled by bouncer-init.js
import { initDrawGrid } from './drawgrid-init.js';
import { createChordWheel } from './chordwheel.js';
import { createRippleSynth } from './ripplesynth.js';
import { applyStackingOrder } from './stacking-manager.js';

import './toy-audio.js';
import './toy-layout-manager.js';
import './zoom-overlay.js';
import './toy-spawner.js';
import { initAudioAssets } from './audio-samples.js';
import { loadInstrumentEntries as loadInstrumentCatalog } from './instrument-catalog.js';
import { DEFAULT_BPM, NUM_STEPS, ensureAudioContext, getLoopInfo, setBpm, start, isRunning } from './audio-core.js';
import { createLoopIndicator } from './loopindicator.js';
import { buildGrid } from './grid-core.js';
import { tryRestoreOnBoot, startAutosave } from './persistence.js';
import { startIntensityVisual } from './visual-bg.js';

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
    'bouncer': initializeBouncer,
    'drawgrid': initDrawGrid,
    'loopgrid': buildGrid,
    'chordwheel': createChordWheel,
    'rippler': (panel) => {
        try {
            if (!panel.__toyInstance) {
                panel.__toyInstance = createRippleSynth(panel);
            }
        } catch (err) {
            console.warn('[initializeNewToy] rippler failed', err);
        }
    },
};

const toyCatalog = [
    { type: 'loopgrid', name: 'Simple Rhythm', description: 'Layer drum patterns and melodies with an 8x12 step matrix.', size: { width: 380, height: 420 } },
    { type: 'bouncer', name: 'Bouncer', description: 'Bounce melodic balls inside a square arena.', size: { width: 420, height: 420 } },
    { type: 'rippler', name: 'Rippler', description: 'Evolving pads driven by ripple collisions.', size: { width: 420, height: 420 } },
    { type: 'drawgrid', name: 'Draw Grid', description: 'Sketch freehand rhythms that become notes.', size: { width: 420, height: 460 } },
    { type: 'chordwheel', name: 'Chord Wheel', description: 'Play circle-of-fifths chord progressions instantly.', size: { width: 460, height: 420 } },
];

function getToyCatalog() {
    return toyCatalog.map(entry => ({ ...entry }));
}

function doesChainHaveActiveNotes(headId) {
    let current = document.getElementById(headId);
    if (!current) return false;
    let sanity = 100;
    do {
        if (current.dataset.toy === 'loopgrid') {
            const state = current.__gridState;
            if (state && state.steps && state.steps.some(s => s)) {
                return true;
            }
        }
        if (current.dataset.toy === 'drawgrid') {
            const toy = current.__drawToy;
            if (toy && typeof toy.getState === 'function') {
                const state = toy.getState();
                if (state?.nodes?.active?.some(a => a)) {
                    return true;
                }
            }
        }
        if (current.dataset.toy === 'chordwheel') {
            if (current.__chordwheelHasActive) {
                return true;
            }
            const stepStates = current.__chordwheelStepStates;
            if (Array.isArray(stepStates) && stepStates.some(s => s !== -1)) {
                return true;
            }
        }
        const nextId = current.dataset.nextToyId;
        if (!nextId) break;
        current = document.getElementById(nextId);
    } while (current && current.id !== headId && sanity-- > 0);
    return false;
}

function advanceChain(headId) {
    const activeToyId = g_chainState.get(headId);
    if (!activeToyId) {
        g_chainState.set(headId, headId);
        return;
    }
    const activeToy = document.getElementById(activeToyId);
    if (!activeToy) {
        g_chainState.set(headId, headId);
        return;
    }

    let shouldPulse = true;
    const toyType = activeToy.dataset.toy;
    if (toyType === 'loopgrid' || toyType === 'drawgrid' || toyType === 'chordwheel') {
        // For step-driven toys, only pulse the connector if the chain has active notes.
        shouldPulse = doesChainHaveActiveNotes(headId);
    }

    const nextToyId = activeToy.dataset.nextToyId;
    const nextToy = nextToyId ? document.getElementById(nextToyId) : null;

    if (nextToy) {
        if (shouldPulse) triggerConnectorPulse(activeToyId, nextToyId);
        g_chainState.set(headId, nextToyId);
    } else {
        if (shouldPulse) triggerConnectorPulse(activeToyId, headId);
        g_chainState.set(headId, headId); // Loop back to head
    }
}

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

function updateAllChainUIs() {
    const allToys = Array.from(document.querySelectorAll('.toy-panel[data-toy]'));
    allToys.forEach(toy => {
        const instBtn = toy.querySelector('.toy-inst-btn');
        if (instBtn) {
            const isChild = !!toy.dataset.prevToyId;
            instBtn.style.display = isChild ? 'none' : '';
        }
    });
}

function triggerConnectorPulse(fromId, toId) {
    g_pulsingConnectors.set(fromId, { toId, pulse: 1.0 });
}

function initToyChaining(panel) {
    if (!panel) return;
    if (panel.dataset.tutorial === "true" || panel.classList?.contains("tutorial-panel")) {
        return;
    }

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
    panel.style.overflow = 'visible'; // Ensure the button is not clipped by the panel's bounds.

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
            updateAllChainUIs();
        }, 0);
    });
}

function pickToyPanelSize(type) {
    const board = document.getElementById('board');
    if (board) {
        const sample = board.querySelector(`:scope > .toy-panel[data-toy="${type}"]`);
        if (sample) {
            const width = Math.max(240, sample.offsetWidth || parseFloat(sample.style.width) || 380);
            const height = Math.max(200, sample.offsetHeight || parseFloat(sample.style.height) || 320);
            return { width, height };
        }
    }
    const fallback = toyCatalog.find(entry => entry.type === type)?.size;
    if (fallback) {
        return {
            width: Math.max(240, Number(fallback.width) || 380),
            height: Math.max(200, Number(fallback.height) || 320),
        };
    }
    return { width: 380, height: 320 };
}

function persistToyPosition(panel) {
    try {
        const key = 'toyPositions';
        const map = JSON.parse(localStorage.getItem(key) || '{}');
        map[panel.id] = { left: panel.style.left, top: panel.style.top };
        localStorage.setItem(key, JSON.stringify(map));
    } catch (err) {
        console.warn('[createToyPanelAt] persist failed', err);
    }
}

function createToyPanelAt(toyType, { centerX, centerY, instrument } = {}) {
    const type = String(toyType || '').toLowerCase();
    if (!type || !toyInitializers[type]) {
        console.warn('[createToyPanelAt] unknown toy type', toyType);
        return null;
    }
    const board = document.getElementById('board');
    if (!board) return null;

    const panel = document.createElement('section');
    panel.className = 'toy-panel';
    panel.dataset.toy = type;
    const idSuffix = Math.random().toString(36).slice(2, 8);
    panel.id = `${type}-${Date.now()}-${idSuffix}`;
    panel.style.position = 'absolute';

    if (instrument) panel.dataset.instrument = instrument;

    const { width, height } = pickToyPanelSize(type);
    if (Number.isFinite(width) && width > 0) panel.style.width = `${Math.round(width)}px`;

    const left = Number.isFinite(centerX) ? Math.max(0, centerX - (width || 0) / 2) : 0;
    const top = Number.isFinite(centerY) ? Math.max(0, centerY - (height || 0) / 2) : 0;

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;

    board.appendChild(panel);
    persistToyPosition(panel);

    setTimeout(() => {
        if (!panel.isConnected) return;
        try { initializeNewToy(panel); } catch (err) { console.warn('[createToyPanelAt] init failed', err); }
        try { initToyChaining(panel); } catch (err) { console.warn('[createToyPanelAt] chain init failed', err); }

        document.querySelectorAll('.toy-panel.toy-focused').forEach(p => {
            if (p !== panel) p.classList.remove('toy-focused');
        });
        panel.classList.add('toy-focused');

        try { updateChains(); updateAllChainUIs(); } catch (err) { console.warn('[createToyPanelAt] chain update failed', err); }
        try { applyStackingOrder(); } catch (err) { console.warn('[createToyPanelAt] stacking failed', err); }
        try { window.Persistence?.markDirty?.(); } catch (err) { console.warn('[createToyPanelAt] mark dirty failed', err); }
    }, 0);

    return panel;
}

function destroyToyPanel(panelOrId) {
    const panel = typeof panelOrId === 'string' ? document.getElementById(panelOrId) : panelOrId;
    if (!panel) return false;
    if (!panel.classList || !panel.classList.contains('toy-panel')) return false;
    const board = document.getElementById('board');
    if (!board || !board.contains(panel)) return false;

    const panelId = panel.id;
    const prevId = panel.dataset.prevToyId || '';
    const nextId = panel.dataset.nextToyId || '';

    try { panel.dispatchEvent(new CustomEvent('toy-remove', { bubbles: true })); } catch (err) { console.warn('[destroyToyPanel] dispatch toy-remove failed', err); }
    try { panel.dispatchEvent(new CustomEvent('toy:remove', { detail: { panel }, bubbles: true })); } catch (err) { console.warn('[destroyToyPanel] dispatch toy:remove failed', err); }

    if (prevId) {
        const prev = document.getElementById(prevId);
        if (prev) {
            if (nextId) {
                prev.dataset.nextToyId = nextId;
            } else {
                delete prev.dataset.nextToyId;
            }
        }
    }
    if (nextId) {
        const next = document.getElementById(nextId);
        if (next) {
            if (prevId) {
                next.dataset.prevToyId = prevId;
            } else {
                delete next.dataset.prevToyId;
            }
        }
    }

    delete panel.dataset.prevToyId;
    delete panel.dataset.nextToyId;

    panel.remove();

    try {
        const key = 'toyPositions';
        const raw = localStorage.getItem(key);
        if (raw) {
            const map = JSON.parse(raw) || {};
            if (panelId && map[panelId]) {
                delete map[panelId];
                localStorage.setItem(key, JSON.stringify(map));
            }
        }
    } catch (err) {
        console.warn('[destroyToyPanel] persist cleanup failed', err);
    }

    if (panelId) {
        g_pulsingConnectors.delete(panelId);
        for (const [fromId, info] of Array.from(g_pulsingConnectors.entries())) {
            if (info?.toId === panelId) {
                g_pulsingConnectors.delete(fromId);
            }
        }
        g_chainState.delete(panelId);
        for (const [headId, activeId] of Array.from(g_chainState.entries())) {
            if (activeId === panelId) {
                g_chainState.set(headId, headId);
            }
        }
    }

    try { updateChains(); } catch (err) { console.warn('[destroyToyPanel] chain update failed', err); }
    try { updateAllChainUIs(); } catch (err) { console.warn('[destroyToyPanel] chain UI update failed', err); }
    try { drawChains(); } catch (err) { console.warn('[destroyToyPanel] draw chains failed', err); }
    try { applyStackingOrder(); } catch (err) { console.warn('[destroyToyPanel] stacking failed', err); }
    try { window.Persistence?.markDirty?.(); } catch (err) { console.warn('[destroyToyPanel] mark dirty failed', err); }

    return true;
}

try {
    window.MusicToyFactory = Object.assign(window.MusicToyFactory || {}, {
        create: createToyPanelAt,
        destroy: destroyToyPanel,
        getCatalog: () => getToyCatalog(),
    });
    if (window.ToySpawner && typeof window.ToySpawner.configure === 'function') {
        window.ToySpawner.configure({
            getCatalog: () => getToyCatalog(),
            create: createToyPanelAt,
            remove: destroyToyPanel,
        });
    }
} catch (err) {
    console.warn('[MusicToyFactory] registration failed', err);
}

const chainBtnStyle = document.createElement('style');
chainBtnStyle.textContent = `
    .toy-chain-btn { position: absolute; top: 50%; right: -65px; transform: translateY(-50%); z-index: 52; }
`;
document.head.appendChild(chainBtnStyle);

function drawChains() {
    if (!chainCanvas || !chainCtx) return;
    const board = document.getElementById('board');
    if (!board) return;

    // --- New logic to calculate content bounds ---
    // This correctly handles toys positioned with negative coordinates (e.g., moved to the left).
    const toys = Array.from(board.querySelectorAll(':scope > .toy-panel'));
    let minX = 0, minY = 0, maxX = board.clientWidth, maxY = board.clientHeight;

    if (toys.length > 0) {
        minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
        for (const toy of toys) {
            // Use parseFloat on style.left/top, as offsetLeft/Top don't handle negative positions.
            const left = parseFloat(toy.style.left) || 0;
            const top = parseFloat(toy.style.top) || 0;
            const width = toy.offsetWidth;
            const height = toy.offsetHeight;

            minX = Math.min(minX, left);
            minY = Math.min(minY, top);
            maxX = Math.max(maxX, left + width + 65); // Add buffer for chain button
            maxY = Math.max(maxY, top + height);
        }
        // Ensure bounds are at least the size of the viewport.
        minX = Math.min(minX, 0);
        minY = Math.min(minY, 0);
        maxX = Math.max(maxX, board.clientWidth);
        maxY = Math.max(maxY, board.clientHeight);
    }

    const dpr = window.devicePixelRatio || 1;
    const canvasX = minX;
    const canvasY = minY;
    const canvasW = maxX - minX;
    const canvasH = maxY - minY;

    // Ensure the canvas element size and backing store match the calculated bounds.
    if (chainCanvas.style.left !== `${canvasX}px` || chainCanvas.style.top !== `${canvasY}px` || chainCanvas.style.width !== `${canvasW}px` || chainCanvas.style.height !== `${canvasH}px` || chainCanvas.width !== canvasW * dpr || chainCanvas.height !== canvasH * dpr) {
        chainCanvas.style.left = `${canvasX}px`;
        chainCanvas.style.top = `${canvasY}px`;
        chainCanvas.style.width = `${canvasW}px`;
        chainCanvas.style.height = `${canvasH}px`;
        chainCanvas.width = canvasW * dpr;
        chainCanvas.height = canvasH * dpr;
    }

    // Clear entire canvas bitmap. clearRect is not affected by transforms.
    chainCtx.clearRect(0, 0, chainCanvas.width, chainCanvas.height);

    // Set transform to draw in board coordinates, accounting for canvas offset.
    chainCtx.setTransform(dpr, 0, 0, dpr, -canvasX * dpr, -canvasY * dpr);

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

            // Use parseFloat(style.left/top) for coordinates to match the bounding box calculation.
            const p1x = (parseFloat(current.style.left) || 0) + current.offsetWidth + 32.5;
            const p1y = (parseFloat(current.style.top) || 0) + current.offsetHeight / 2;
            const p2x = (parseFloat(next.style.left) || 0);
            const p2y = (parseFloat(next.style.top) || 0) + next.offsetHeight / 2;

            chainCtx.beginPath();
            chainCtx.moveTo(p1x, p1y);
            const controlPointOffset = Math.max(40, Math.abs(p2x - p1x) * 0.4);
            chainCtx.bezierCurveTo(p1x + controlPointOffset, p1y, p2x - controlPointOffset, p2y, p2x, p2y);

            const pulseInfo = g_pulsingConnectors.get(current.id);
            const isPulsing = pulseInfo && pulseInfo.toId === nextId;
            const pulseAmount = isPulsing ? pulseInfo.pulse : 0;

            const baseWidth = 10;
            const pulseWidth = 15 * pulseAmount;
            chainCtx.lineWidth = baseWidth + pulseWidth;
            chainCtx.lineCap = 'round'; // Use rounded ends to seamlessly meet the circular buttons.
            chainCtx.strokeStyle = `hsl(222, 100%, ${80 + 15 * pulseAmount}%)`;
            chainCtx.stroke();

            // "Erase" the part of the line that is under the button by punching a transparent hole.
            const buttonRadius = 32.5;
            chainCtx.save();
            chainCtx.globalCompositeOperation = 'destination-out';
            chainCtx.beginPath();
            chainCtx.arc(p1x, p1y, buttonRadius, 0, Math.PI * 2);
            chainCtx.fillStyle = '#000'; // Color doesn't matter for destination-out
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
          for (const [headId] of g_chainState.entries()) {
              const activeToy = document.getElementById(g_chainState.get(headId));
              // Bouncers and Ripplers manage their own advancement via the 'chain:next' event.
              // All other toys (like loopgrid) advance on the global bar clock.
              if (activeToy && activeToy.dataset.toy !== 'bouncer' && activeToy.dataset.toy !== 'rippler') { advanceChain(headId); }
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
  startIntensityVisual();
  let restored = false;
  try{ restored = !!tryRestoreOnBoot(); }catch{}
  bootGrids();
  bootDrawGrids();
  document.querySelectorAll('.toy-panel').forEach(initToyChaining);
  updateAllChainUIs(); // Set initial instrument button visibility

  // Add event listener for grid-based chain activation
  document.addEventListener('chain:wakeup', (e) => {
    const panel = e.target.closest('.toy-panel');
    const toyType = panel?.dataset.toy;
    if (!panel || (toyType !== 'loopgrid' && toyType !== 'drawgrid')) return;

    const head = findChainHead(panel);
    if (!head) return;

    // If the chain now has notes, mark it.
    if (doesChainHaveActiveNotes(head.id)) {
        head.dataset.chainHasNotes = 'true';
    }
  });

  document.addEventListener('chain:checkdormant', (e) => {
    const panel = e.target.closest('.toy-panel');
    const toyType = panel?.dataset.toy;
    if (!panel || (toyType !== 'loopgrid' && toyType !== 'drawgrid')) return;

    const head = findChainHead(panel);
    if (!head) return;

    // If the chain no longer has notes, unmark it.
    if (!doesChainHaveActiveNotes(head.id)) {
        delete head.dataset.chainHasNotes;
    }
  });

  // Add event listener for bouncer-driven chain advancement
  document.addEventListener('chain:next', (e) => {
    const panel = e.target.closest('.toy-panel');
    if (!panel) return;

    // Only toys that manage their own lifecycle should fire this event.
    if (panel.dataset.toy !== 'bouncer' && panel.dataset.toy !== 'rippler') return;

    const head = findChainHead(panel);
    if (!head) return;

    const headId = head.id;
    const activeToyId = g_chainState.get(headId);

    // Only advance if the event is from the currently active toy in the chain
    if (activeToyId !== panel.id) return;
    advanceChain(headId);
  });

  // Add event listener for toys to request becoming the active link in a chain.
  document.addEventListener('chain:set-active', (e) => {
    const panel = e.target.closest('.toy-panel');
    if (!panel) return;

    const head = findChainHead(panel);
    if (!head) return;

    g_chainState.set(head.id, panel.id);
  });

  // Add event listener for instrument propagation down chains
  document.addEventListener('toy-instrument', (e) => {
    const sourcePanel = e.target.closest('.toy-panel');
    // Only propagate from chain heads (or standalone toys)
    if (!sourcePanel || sourcePanel.dataset.prevToyId) {
      return;
    }

    const instrument = e.detail.value;
    let current = sourcePanel;
    while (current && current.dataset.nextToyId) {
      const nextToy = document.getElementById(current.dataset.nextToyId);
      if (!nextToy) break;

      nextToy.dataset.instrument = instrument;
      nextToy.dispatchEvent(new CustomEvent('toy-instrument', { detail: { value: instrument }, bubbles: true }));
      nextToy.dispatchEvent(new CustomEvent('toy:instrument', { detail: { name: instrument, value: instrument }, bubbles: true }));
      current = nextToy;
    }
  });

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

