import './mobile-viewport.js';
import './fullscreen.js';
// --- Module Imports ---
import './debug.js';
import './advanced-controls-toggle.js';
import { initializeBouncer } from './bouncer-init.js';
import './header-buttons-delegate.js';
import './rippler-init.js';
import './tutorial.js';
import './ui-highlights.js';
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
import { installIOSAudioUnlock } from './ios-audio-unlock.js';
import { installAudioDiagnostics } from './audio-diagnostics.js';
import { DEFAULT_BPM, NUM_STEPS, ensureAudioContext, getLoopInfo, setBpm, start, isRunning } from './audio-core.js';
import { buildGrid } from './grid-core.js';
import { buildDrumGrid } from './drum-core.js';
import { tryRestoreOnBoot, startAutosave } from './persistence.js';

installIOSAudioUnlock();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installAudioDiagnostics, { once: true });
} else {
  installAudioDiagnostics();
}
// Ensure at least one non-passive gesture listener exists for iOS unlock
window.addEventListener('touchstart', ()=>{}, { capture: true, passive: false });

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
  const hasExternalButtons = ['loopgrid', 'loopgrid-drum', 'bouncer', 'rippler', 'chordwheel', 'drawgrid'].includes(toyKind);

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

const SPAWN_PADDING = 36;

function pickPositive(...values) {
    for (const value of values) {
        const num = Number(value);
        if (Number.isFinite(num) && num > 0) return num;
    }
    return 1;
}

function getPanelLocalExtents(panel, { fallbackWidth, fallbackHeight } = {}) {
    let extents = null;
    try {
        extents = getVisualExtents(panel);
    } catch {
        extents = null;
    }
    const rect = panel.getBoundingClientRect?.();

    const fallbackWidthValue = pickPositive(
        fallbackWidth,
        panel.offsetWidth,
        rect?.width,
        parseFloat(panel.style.width),
        380
    );
    const fallbackHeightValue = pickPositive(
        fallbackHeight,
        panel.offsetHeight,
        rect?.height,
        parseFloat(panel.style.height),
        320
    );

    let localLeft = Number.isFinite(extents?.left) ? extents.left : 0;
    let localTop = Number.isFinite(extents?.top) ? extents.top : 0;
    let localRight = Number.isFinite(extents?.right) ? extents.right : localLeft + fallbackWidthValue;
    let localBottom = Number.isFinite(extents?.bottom) ? extents.bottom : localTop + fallbackHeightValue;

    if (!Number.isFinite(localRight)) localRight = localLeft + fallbackWidthValue;
    if (!Number.isFinite(localBottom)) localBottom = localTop + fallbackHeightValue;

    const width = Math.max(1, localRight - localLeft);
    const height = Math.max(1, localBottom - localTop);

    return { left: localLeft, top: localTop, right: localRight, bottom: localBottom, width, height };
}

function getPanelPosition(panel) {
    const styleLeft = parseFloat(panel.style.left);
    const styleTop = parseFloat(panel.style.top);
    if (Number.isFinite(styleLeft) && Number.isFinite(styleTop)) {
        return { left: styleLeft, top: styleTop };
    }
    const fallbackLeft = Number.isFinite(styleLeft) ? styleLeft : panel.offsetLeft;
    const fallbackTop = Number.isFinite(styleTop) ? styleTop : panel.offsetTop;
    if (Number.isFinite(fallbackLeft) && Number.isFinite(fallbackTop)) {
        return { left: fallbackLeft, top: fallbackTop };
    }
    const panelRect = panel.getBoundingClientRect?.();
    const parentRect = panel.parentElement?.getBoundingClientRect?.();
    if (panelRect && parentRect) {
        return {
            left: panelRect.left - parentRect.left,
            top: panelRect.top - parentRect.top,
        };
    }
    return { left: 0, top: 0 };
}

function buildBoundsFromLocal(local, left, top, padding = 0) {
    return {
        left: left + local.left - padding,
        right: left + local.right + padding,
        top: top + local.top - padding,
        bottom: top + local.bottom + padding,
        width: local.width + padding * 2,
        height: local.height + padding * 2,
    };
}

function boundsOverlap(a, b) {
    return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

function ensurePanelSpawnPlacement(panel, {
    baseLeft,
    baseTop,
    fallbackWidth,
    fallbackHeight,
    skipIfMoved = false,
    padding = SPAWN_PADDING,
    maxAttempts = 400,
} = {}) {
    if (!panel?.isConnected) return null;
    const board = panel.parentElement;
    if (!board) return null;

    // Force layout to ensure measurements are up to date.
    void panel.offsetWidth;

    const currentPos = getPanelPosition(panel);
    const basePosition = {
        left: Number.isFinite(baseLeft) ? baseLeft : currentPos.left,
        top: Number.isFinite(baseTop) ? baseTop : currentPos.top,
    };

    if (skipIfMoved) {
        const storedLeft = Number(panel.dataset.spawnAutoLeft);
        const storedTop = Number(panel.dataset.spawnAutoTop);
        if (Number.isFinite(storedLeft) && Number.isFinite(storedTop)) {
            const deltaLeft = Math.abs(currentPos.left - storedLeft);
            const deltaTop = Math.abs(currentPos.top - storedTop);
            if (deltaLeft > 1 || deltaTop > 1) {
                return { left: currentPos.left, top: currentPos.top, changed: false, skipped: true };
            }
        }
    }

    const localExtents = getPanelLocalExtents(panel, { fallbackWidth, fallbackHeight });
    const boardRect = board.getBoundingClientRect?.();
    const maxX = Math.max(board.scrollWidth || 0, board.offsetWidth || 0, boardRect?.width || 0) + 2000;
    const maxY = Math.max(board.scrollHeight || 0, board.offsetHeight || 0, boardRect?.height || 0) + 2000;

    const existingBounds = Array.from(board.querySelectorAll(':scope > .toy-panel'))
        .filter(other => other !== panel)
        .map(other => {
            const otherPos = getPanelPosition(other);
            const otherLocal = getPanelLocalExtents(other);
            return buildBoundsFromLocal(otherLocal, otherPos.left, otherPos.top, padding);
        })
        .filter(Boolean);

    const overlapsAt = (left, top) => {
        const bounds = buildBoundsFromLocal(localExtents, left, top, padding);
        return existingBounds.some(other => boundsOverlap(bounds, other));
    };

    let candidateLeft = Math.max(0, basePosition.left);
    let candidateTop = Math.max(0, basePosition.top);

    if (!overlapsAt(candidateLeft, candidateTop)) {
        const changed = Math.abs(candidateLeft - currentPos.left) > 1 || Math.abs(candidateTop - currentPos.top) > 1;
        if (changed) {
            panel.style.left = `${Math.round(candidateLeft)}px`;
            panel.style.top = `${Math.round(candidateTop)}px`;
        }
        panel.dataset.spawnAutoManaged = 'true';
        panel.dataset.spawnAutoLeft = String(Math.round(candidateLeft));
        panel.dataset.spawnAutoTop = String(Math.round(candidateTop));
        return { left: candidateLeft, top: candidateTop, changed };
    }

    const stepX = Math.max(48, Math.round(localExtents.width / 2));
    const stepY = Math.max(48, Math.round(localExtents.height / 2));
    const halfStepX = Math.max(32, Math.round(stepX / 2));
    const halfStepY = Math.max(32, Math.round(stepY / 2));

    const queue = [];
    const visited = new Set();

    const enqueue = (left, top) => {
        const clampedLeft = Math.max(0, Math.min(Math.round(left), maxX));
        const clampedTop = Math.max(0, Math.min(Math.round(top), maxY));
        const key = `${clampedLeft}|${clampedTop}`;
        if (!visited.has(key)) {
            visited.add(key);
            queue.push({ left: clampedLeft, top: clampedTop });
        }
    };

    enqueue(candidateLeft, candidateTop);

    let best = null;
    let iterations = 0;

    while (queue.length && iterations < maxAttempts) {
        iterations++;
        const current = queue.shift();
        const hasCollision = overlapsAt(current.left, current.top);
        if (!hasCollision) {
            best = current;
            break;
        }

        const neighbors = [
            [current.left + stepX, current.top],
            [current.left - stepX, current.top],
            [current.left, current.top + stepY],
            [current.left, current.top - stepY],
            [current.left + stepX, current.top + stepY],
            [current.left - stepX, current.top + stepY],
            [current.left + halfStepX, current.top],
            [current.left - halfStepX, current.top],
            [current.left, current.top + halfStepY],
            [current.left, current.top - halfStepY],
        ];

        for (const [nx, ny] of neighbors) {
            if (nx >= 0 && ny >= 0) enqueue(nx, ny);
        }
    }

    if (best) {
        panel.style.left = `${Math.round(best.left)}px`;
        panel.style.top = `${Math.round(best.top)}px`;
        panel.dataset.spawnAutoManaged = 'true';
        panel.dataset.spawnAutoLeft = String(Math.round(best.left));
        panel.dataset.spawnAutoTop = String(Math.round(best.top));
        return { left: best.left, top: best.top, changed: true };
    }

    panel.dataset.spawnAutoManaged = 'true';
    panel.dataset.spawnAutoLeft = String(Math.round(currentPos.left));
    panel.dataset.spawnAutoTop = String(Math.round(currentPos.top));
    return { left: currentPos.left, top: currentPos.top, changed: false };
}

let chainCanvas, chainCtx;

// Cached layout data so drawChains() avoids DOM reads per frame
let g_boardClientWidth = 0;
let g_boardClientHeight = 0;

/**
 * @typedef {Object} Edge
 * @property {string} id
 * @property {string} fromToyId
 * @property {string} toToyId
 * @property {'default'} type
 * @property {number} p1x
 * @property {number} p1y
 * @property {number} p2x
 * @property {number} p2y
 * @property {number} [flashUntilMs]
 */

/** @type {Map<string, Edge>} */
const g_chainEdges = new Map();
/** @type {Map<string, Set<string>>} */
const g_edgesByToyId = new Map();
/** Legacy segment list (kept for any consumers still expecting g_chainSegments). */
const g_chainSegments = [];
/** @type {Map<string, {toId: string, until: number}>} */
const g_pulsingConnectors = new Map();

// Drag-time state for connector updates
let g_chainDragToyId = null;
let g_chainDragLastUpdateTime = 0;
// Tracks last known board-space position for each toy we drag (left/top from style).
const g_chainToyLastPos = new Map(); // toyId -> { left, top }

// Aim for ~60fps max during drag; further throttling is done by the browser's pointermove rate.
const CHAIN_DRAG_UPDATE_INTERVAL_MS = 16;

// Chain / scheduler debug controls.
// CHAIN_DEBUG: master flag – turn this off to silence all chain/scheduler logs.
const CHAIN_DEBUG = false;
// Log phase timings that take longer than this in ms.
const CHAIN_DEBUG_LOG_THRESHOLD_MS = 1;
// Log whole-frame cost if it exceeds this in ms (we'll also rate-limit logs).
const CHAIN_DEBUG_FRAME_THRESHOLD_MS = 0.0;

// Feature flags so we can selectively disable suspected work during perf debugging.
// Flip these to false one at a time to see which block removes the slowdown.
const CHAIN_FEATURE_ENABLE_SCHEDULER      = true; // master toggle for chain work in scheduler()
const CHAIN_FEATURE_ENABLE_MARK_ACTIVE    = true; // DOM scan + data-chain-active flags
const CHAIN_FEATURE_ENABLE_SEQUENCER      = true; // __sequencerStep + border pulses
const CHAIN_FEATURE_ENABLE_CONNECTOR_DRAW = true; // drawChains() canvas connectors
// Rendering resolution multiplier for the chain canvas.
// 1.0 = full resolution (heaviest)
// 0.5 = half resolution in each dimension (~4x fewer pixels)
// 0.25 = quarter resolution in each dimension (~16x fewer pixels)
const CHAIN_CANVAS_RESOLUTION_SCALE = 0.5;


console.log('[MAIN] module start');
  // --- Adaptive outline style: scales with zoom, but never below min px on screen ---
  (function installAdaptiveOutlineCSS(){
    const style = document.createElement('style');
    style.textContent = `
      :root{
        --toy-outline-w: 3px;          /* base pre-zoom width */
        --toy-outline-pulse-w: 8px;    /* pulse peak pre-zoom width */
        --toy-outline-color: hsl(222, 100%, 80%);
      }
      /* NORMAL MODE — full-frame outline visible */
      .toy-panel.toy-playing{
        outline: none;
        box-shadow:
          var(--toy-panel-shadow, 0 8px 24px rgba(0, 0, 0, 0.35)),
          0 0 var(--toy-outline-glow-base, 10px) hsla(222, 100%, 85%, 0.9),
          0 0 0 var(--toy-outline-w) var(--toy-outline-color);
      }
      @keyframes playingPulseAdaptive {
        0% {
          box-shadow:
            var(--toy-panel-shadow, 0 8px 24px rgba(0, 0, 0, 0.35)),
            0 0 var(--toy-outline-glow-base, 10px) hsla(222, 100%, 85%, 0.9),
            0 0 0 var(--toy-outline-w) var(--toy-outline-color);
        }
        50% {
          box-shadow:
            var(--toy-panel-shadow, 0 8px 24px rgba(0, 0, 0, 0.35)),
            0 0 var(--toy-outline-glow-pulse, 28px) hsla(222, 100%, 92%, 0.95),
            0 0 0 var(--toy-outline-pulse-w) var(--toy-outline-color);
        }
        100% {
          box-shadow:
            var(--toy-panel-shadow, 0 8px 24px rgba(0, 0, 0, 0.35)),
            0 0 var(--toy-outline-glow-base, 10px) hsla(222, 100%, 85%, 0.9),
            0 0 0 var(--toy-outline-w) var(--toy-outline-color);
        }
      }
      /* Normal view: force the outer border to animate */
      .toy-panel:not(.overview-outline).toy-playing-pulse{
        animation: playingPulseAdaptive 0.3s ease-out;
      }
      /* OVERVIEW — suppress full-frame outline so only body overlay shows */
      .toy-panel.overview-outline.toy-playing{
        box-shadow: var(--toy-panel-shadow, 0 8px 24px rgba(0, 0, 0, 0.35));
      }
      .toy-panel.overview-outline.toy-playing-pulse{
        animation: none !important;
      }
    `;
    document.head.appendChild(style);
  })();
  // --- Body-only outline for overview (used when header/footer are hidden) ---
  (function installBodyOutlineCSS(){
    const style = document.createElement('style');
    style.textContent = `
      /* Overlay hugging .toy-body */
      .toy-body-outline {
        position: absolute;
        left: 0; top: 0; width: 0; height: 0;
        pointer-events: none;
        border-radius: 8px;
        opacity: 0;
        z-index: 51; /* above toy content; buttons are 52 */

        /* Two-layer effect:
           1) outer glow   -> 0 0 blur color
           2) hard outline -> 0 0 0 spread color  */
        box-shadow:
          0 0 var(--toy-outline-glow-base, 10px) hsla(222, 100%, 85%, 0.9),
          0 0 0 var(--toy-outline-w) var(--toy-outline-color);
      }

      /* Show the body-hugging outline only in OVERVIEW */
      .toy-panel.overview-outline.toy-playing > .toy-body-outline {
        opacity: 1;
      }

      /* Visible in OVERVIEW only */
      .toy-panel.overview-outline.toy-playing > .toy-body-outline,
      .toy-panel.overview-outline.toy-playing-pulse > .toy-body-outline {
        opacity: 1;
      }

      @keyframes playingPulseBodyAdaptive {
        0% {
          box-shadow:
            0 0 var(--toy-outline-glow-base, 10px) hsla(222, 100%, 85%, 0.9),
            0 0 0 var(--toy-outline-w) var(--toy-outline-color);
        }
        50% {
          box-shadow:
            0 0 var(--toy-outline-glow-pulse, 28px) hsla(222, 100%, 92%, 0.95),
            0 0 0 var(--toy-outline-pulse-w) var(--toy-outline-color);
        }
        100% {
          box-shadow:
            0 0 var(--toy-outline-glow-base, 10px) hsla(222, 100%, 85%, 0.9),
            0 0 0 var(--toy-outline-w) var(--toy-outline-color);
        }
      }
      /* Animate overlay pulse only in OVERVIEW */
      .toy-panel.overview-outline.toy-playing-pulse > .toy-body-outline {
        animation: playingPulseBodyAdaptive 0.3s ease-out;
      }
    `;
    document.head.appendChild(style);
  })();
const BOARD_BOOT_CLASS = 'board--booting';
const boardBootRoot = document.getElementById('board');
if (boardBootRoot) {
  boardBootRoot.classList.add(BOARD_BOOT_CLASS);
}
const CSV_PATH = './assets/samples/samples.csv'; // optional
const $ = (sel, root=document)=> root.querySelector(sel);
function bootTopbar(){
  const playBtn = $('#play'), stopBtn = $('#stop'), bpmInput = $('#bpm');
  playBtn?.addEventListener('click', ()=>{
    ensureAudioContext();
    start();
    try {
      const panels = Array.from(document.querySelectorAll('.toy-panel[id]'));
      const roots = panels.filter(el => !el.dataset.chainParent);
      console.log('[chain] play → roots', roots.map(r => r.id));
      const visited = new Set();
      for (const root of roots) {
        startToyAndDescendants(root, visited);
      }
    } catch (err) {
      console.warn('[chain] play cascade failed', err);
    }
    // Globally mark all toys as "playing" (steady outer highlight even if empty)
    try {
      document.querySelectorAll('.toy-panel').forEach(p => p.classList.add('toy-playing'));
    } catch {}
  });
  stopBtn?.addEventListener('click', ()=>{
    try { ensureAudioContext().suspend(); } catch {}
    // Clear all highlight state when paused
    try {
      document.querySelectorAll('.toy-panel').forEach(p => {
        p.classList.remove('toy-playing', 'toy-playing-pulse');
      });
    } catch {}
  });
  bpmInput?.addEventListener('change', (e)=> setBpm(Number(e.target.value)||DEFAULT_BPM));
}
function bootGrids(){
  const simplePanels = Array.from(document.querySelectorAll('.toy-panel[data-toy="loopgrid"]'));
  simplePanels.forEach(p => buildGrid(p, 8));
  const drumPanels = Array.from(document.querySelectorAll('.toy-panel[data-toy="loopgrid-drum"]'));
  drumPanels.forEach(p => buildDrumGrid(p, 8));
}
// --- Body-outline manager: keeps an outline hugging .toy-body only when header/footer are hidden ---
// Treat element as "hidden" if any of these is true.
function __elHidden(el){
  if (!el) return true;
  const cs = getComputedStyle(el);
  // Treat as "hidden" ONLY if removed from layout or explicitly hidden.
  return (
    cs.display === 'none' ||
    cs.visibility === 'hidden' ||
    el.offsetParent === null || // not in layout flow
    el.offsetHeight === 0 ||
    el.clientHeight === 0
  );
}
function syncBodyOutline(panel){
    if (!panel || !panel.isConnected) return;
    let overlay = panel.querySelector(':scope > .toy-body-outline');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'toy-body-outline';
      panel.appendChild(overlay);
    }

    const header = panel.querySelector(':scope > .toy-header');
    const footer = panel.querySelector(':scope > .toy-footer');
    const body = panel.querySelector(':scope > .toy-body');

    const hdrHidden = __elHidden(header);
    const ftrHidden = __elHidden(footer);
    const bodyShown = !!body && getComputedStyle(body).display !== 'none';

    // Consider this "overview" if body is visible but header+footer are hidden
    const isOverviewLike = bodyShown && hdrHidden && ftrHidden;

    panel.classList.toggle('overview-outline', isOverviewLike);

    // Defensive: if either header or footer is visible, make sure we’re not suppressing the outer outline
    if (!isOverviewLike && panel.classList.contains('overview-outline')) {
      panel.classList.remove('overview-outline');
    }

    if (body) {
      const bodyTop = body.offsetTop;
      const bodyLeft = body.offsetLeft;
      const bodyW = body.offsetWidth;
      const bodyH = body.offsetHeight;

      overlay.style.left = `${bodyLeft}px`;
      overlay.style.top = `${bodyTop}px`;
      overlay.style.width = `${bodyW}px`;
      overlay.style.height = `${bodyH}px`;

      // Mirror toy body radius so the glow matches perfectly
      const br = getComputedStyle(body).borderRadius || '8px';
      overlay.style.borderRadius = br;
      overlay.style.opacity = '';
    } else {
      overlay.style.left = '0px';
      overlay.style.top = '0px';
      overlay.style.width = '0px';
      overlay.style.height = '0px';
      overlay.style.opacity = '0';
    }
}

function syncAllBodyOutlines(){
  document.querySelectorAll('.toy-panel').forEach(syncBodyOutline);
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
    'loopgrid-drum': buildDrumGrid,
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
    { type: 'drawgrid', name: 'Draw Line', description: 'Sketch out freehand lines that become notes.', size: { width: 420, height: 460 } },
    { type: 'loopgrid', name: 'Simple Rhythm', description: 'Layer drum patterns and melodies with an 8x12 step matrix.', size: { width: 420, height: 420 } },
    { type: 'bouncer', name: 'Bouncer', description: 'Bounce melodic balls inside a square arena.', size: { width: 420, height: 420 } },
    { type: 'rippler', name: 'Rippler', description: 'Evolving pads driven by ripple collisions.', size: { width: 420, height: 420 } },
    { type: 'loopgrid-drum', name: 'Drum Kit', description: 'Tap a responsive pad while sequencing the 8-step cube grid.', size: { width: 380, height: 420 }, disabled: true },
    { type: 'chordwheel', name: 'Chord Wheel', description: 'Play circle-of-fifths chord progressions instantly.', size: { width: 460, height: 420 }, disabled: true },
];

function getToyCatalog() {
    return toyCatalog.map(entry => ({ ...entry }));
}

function doesChainHaveActiveNotes(headId) {
    let current = document.getElementById(headId);
    if (!current) return false;
    let sanity = 100;
    do {
        if (current.dataset.toy === 'loopgrid' || current.dataset.toy === 'loopgrid-drum') {
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

function getChildrenOf(parentId) {
    if (!parentId) return [];
    return Array.from(document.querySelectorAll('.toy-panel[id]')).filter(el => el.dataset.chainParent === parentId);
}

// Returns true if the given panel has any notes at the specified column.
function panelHasNotesAtColumn(panel, col){
  if (!panel || !Number.isFinite(col)) return false;
  const type = panel.dataset?.toy;

  if (type === 'loopgrid' || type === 'loopgrid-drum'){
    const steps = panel.__gridState?.steps;
    return Array.isArray(steps) && !!steps[col];
  }

  if (type === 'drawgrid'){
    try {
      const st = panel.__drawToy?.getState?.();
      const active = st?.nodes?.active;
      return Array.isArray(active) && !!active[col];
    } catch {}
    return false;
  }

  if (type === 'chordwheel'){
    const s = panel.__chordwheelStepStates;
    return Array.isArray(s) && s[col] !== -1;
  }

  return false;
}

function startToy(panelEl) {
    if (!panelEl) return;
    try {
        const api = panelEl.__toyApi || panelEl.__drawToy || panelEl.__toy || panelEl.__toyInstance || null;
        if (api && typeof api.start === 'function') {
            api.start();
        } else {
            panelEl.dispatchEvent(new CustomEvent('toy:start', { bubbles: false }));
        }
        console.log('[chain] startToy', panelEl.id);
    } catch (e) {
        console.warn('[chain] startToy failed', panelEl?.id, e);
    }
}

function startToyAndDescendants(panelEl, visited = new Set()) {
    if (!panelEl || visited.has(panelEl.id)) return;
    visited.add(panelEl.id);
    startToy(panelEl);
    const kids = getChildrenOf(panelEl.id);
    for (const child of kids) {
        startToyAndDescendants(child, visited);
    }
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
    if (toyType === 'loopgrid' || toyType === 'loopgrid-drum' || toyType === 'drawgrid' || toyType === 'chordwheel') {
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

const DRAWGRID_BOOT_DEBUG = false;

function initializeNewToy(panel) {
    const toyType = panel.dataset.toy;
    const initFn = toyInitializers[toyType];
    if (initFn) {
        try {
            initFn(panel);
            let shouldDispatchClear = true;
            if (toyType === 'drawgrid') {
                try {
                    const inboundNonEmpty = typeof panel.__drawToy?.__inboundNonEmpty === 'function'
                        ? !!panel.__drawToy.__inboundNonEmpty()
                        : false;
                    if (inboundNonEmpty) {
                        shouldDispatchClear = false;
                        if (DRAWGRID_BOOT_DEBUG) {
                            console.log('[boot] skip toy-clear for drawgrid (inbound non-empty)', {
                                panelId: panel.id,
                                inboundNonEmpty,
                            });
                        }
                    }
                } catch (err) {
                    if (DRAWGRID_BOOT_DEBUG) {
                        console.warn('[boot] drawgrid inbound check failed', err);
                    }
                }
            }
            if (panel.__restoringFromSnapshot) {
                shouldDispatchClear = false;
            }
            delete panel.__restoringFromSnapshot;
            // After init, dispatch a 'toy-clear' event explicitly scoped to THIS panel only.
            // Mark it as programmatic so drawgrid veto/guards don't treat it as a user action.
            if (shouldDispatchClear) {
                panel.dispatchEvent(new CustomEvent('toy-clear', {
                    bubbles: false,
                    detail: { user: false, reason: 'spawn-init' }
                }));
            }
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
    // Keep the toy border pulse behaviour as before.
    const panel = document.getElementById(fromId);
    if (panel) {
        pulseToyBorder(panel);
    }

    const now = performance.now();
    const durationMs = 150;
    g_pulsingConnectors.set(fromId, { toId, until: now + durationMs });

    // Mark matching edges as "flashing" using the Edge model.
    const edgeIdSet = g_edgesByToyId.get(fromId);
    if (edgeIdSet && edgeIdSet.size > 0) {
        for (const edgeId of edgeIdSet) {
            const edge = g_chainEdges.get(edgeId);
            if (!edge || edge.toToyId !== toId) continue;
            edge.flashUntilMs = now + durationMs;
        }
    }

    if (!CHAIN_FEATURE_ENABLE_CONNECTOR_DRAW) return;

    // Redraw once at flash start.
    try {
        scheduleChainRedraw();
    } catch (err) {
        console.warn('[CHAIN] pulse redraw failed (start)', err);
    }

    // And once at flash end to restore normal appearance.
    setTimeout(() => {
        if (!CHAIN_FEATURE_ENABLE_CONNECTOR_DRAW) return;

        const expireNow = performance.now();
        const edgeIdSet2 = g_edgesByToyId.get(fromId);
        if (edgeIdSet2 && edgeIdSet2.size > 0) {
            for (const edgeId of edgeIdSet2) {
                const edge = g_chainEdges.get(edgeId);
                if (!edge || edge.toToyId !== toId) continue;

                // Only clear if this pulse window has actually expired.
                if (typeof edge.flashUntilMs === 'number' && edge.flashUntilMs <= expireNow) {
                    edge.flashUntilMs = 0;
                }
            }
        }

        const pulseInfo = g_pulsingConnectors.get(fromId);
        if (pulseInfo && pulseInfo.toId === toId && pulseInfo.until <= expireNow) {
            g_pulsingConnectors.delete(fromId);
        }

        try {
            scheduleChainRedraw();
        } catch (err) {
            console.warn('[CHAIN] pulse redraw failed (end)', err);
        }
    }, durationMs);
}

// Unified border pulse helper for both modes
function pulseToyBorder(panel, durationMs = 320) {
  if (!panel || !panel.isConnected) return;
  // Ensure base playing outline is present
  panel.classList.add('toy-playing');
  // Trigger the pulse animation
  panel.classList.add('toy-playing-pulse');
  setTimeout(() => panel.classList.remove('toy-playing-pulse'), durationMs);
  // Keep overlay geometry aligned even if pulse happens mid-layout change
  try { syncBodyOutline(panel); } catch {}
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
    // Ensure the button is vertically centered on the toy body, not the whole panel
    const updateChainBtnPos = () => {
      try {
        const body = panel.querySelector('.toy-body');
        if (!body) return;
        // Position via absolute top in panel coords so it matches the connector Y
        const targetTop = (body.offsetTop || 0) + (body.offsetHeight || 0) / 2;
        extendBtn.style.top = `${targetTop}px`;
        extendBtn.style.transform = 'translateY(-50%)';
      } catch {}
    };
    // Run on attach + whenever layout/size changes
    const ro = new ResizeObserver(updateChainBtnPos);
    ro.observe(panel);
    if (panel.querySelector('.toy-body')) ro.observe(panel.querySelector('.toy-body'));
    window.addEventListener('overview:transition', updateChainBtnPos, { passive: true });
    window.addEventListener('resize', updateChainBtnPos, { passive: true });
    requestAnimationFrame(updateChainBtnPos);

    panel.appendChild(extendBtn);
    panel.style.overflow = 'visible'; // Ensure the button is not clipped by the panel's bounds.

    extendBtn.addEventListener('pointerdown', (e) => {
        const tStart = performance.now();
        e.preventDefault();
        e.stopImmediatePropagation?.();
        e.stopPropagation();

        const sourcePanel = panel;
        const toyType = sourcePanel.dataset.toy;
        if (!toyType || !toyInitializers[toyType]) return;

        const newPanel = document.createElement('div');
        newPanel.className = 'toy-panel';
        newPanel.dataset.toy = toyType;
        // --- Ensure brand new identity & no inherited persistence hints
        newPanel.id = `toy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        try { delete newPanel.dataset.toyid; } catch {}
        newPanel.dataset.toyid = newPanel.id;
        // drawgrid uses panel.id as its key; make that explicit too
        newPanel.dataset.chainParent = sourcePanel.id;
        try {
            document.dispatchEvent(new CustomEvent('chain:linked', { detail: { parent: sourcePanel.id, child: newPanel.id, phase: 'create' } }));
            console.log('[chain] new child', { parent: panel.id, child: newPanel.id });
        } catch {}
        
        if (sourcePanel.dataset.instrument) {
            newPanel.dataset.instrument = sourcePanel.dataset.instrument;
            if (sourcePanel.dataset.instrumentPersisted) {
                newPanel.dataset.instrumentPersisted = sourcePanel.dataset.instrumentPersisted;
            }
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
            const enqueueClear = (typeof queueMicrotask === 'function')
                ? queueMicrotask
                : ((fn) => {
                    try {
                        Promise.resolve().then(fn);
                    } catch {
                        setTimeout(fn, 0);
                    }
                });
            enqueueClear(() => {
                try {
                    const drawToy = newPanel.__drawToy;
                    if (drawToy && typeof drawToy.clear === 'function') {
                        // Programmatic, not user-initiated
                        drawToy.clear({ user: false, reason: 'spawn-enqueue-clear' });
                    } else {
                        // Keep it scoped to this panel and mark as programmatic
                        newPanel.dispatchEvent(new CustomEvent('toy-clear', {
                            bubbles: false,
                            detail: { user: false, reason: 'spawn-enqueue-clear' }
                        }));
                    }
                } catch {
                    // Best-effort clear; ignore failures so chaining still works.
                }
            });

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

            const finalizePlacement = () => {
                const followUp = ensurePanelSpawnPlacement(newPanel, {
                    fallbackWidth: sourceRect.width / boardScale,
                    fallbackHeight: sourceRect.height / boardScale,
                    skipIfMoved: true,
                    // Chained toys don’t need a huge search radius; keep this tight
                    maxAttempts: 120,
                });

                // Always persist at least once for chained toys so their position is saved,
                // regardless of whether the helper actually moved them.
                try {
                    persistToyPosition(newPanel);
                } catch (err) {
                    console.warn('[chain] persistToyPosition failed', err);
                }

                updateChains();
                updateAllChainUIs();
                delete newPanel.dataset.spawnAutoManaged;
                delete newPanel.dataset.spawnAutoLeft;
                delete newPanel.dataset.spawnAutoTop;
            };

            const raf = window.requestAnimationFrame?.bind(window) ?? ((fn) => setTimeout(fn, 16));
            raf(() => raf(finalizePlacement));
        }, 0);
        try {
            const dt = performance.now() - tStart;
            console.log('[CHAIN][perf] chained toy created in', dt.toFixed(1), 'ms');
        } catch {}
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

function createToyPanelAt(toyType, { centerX, centerY, instrument, autoCenter } = {}) {
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
    // Stable, unique id composed of type + timestamp + short random.
    // This id is used by drawgrid persistence; ensure it exists before init.
    if (!panel.id) {
      panel.id = `${type}-${Date.now()}-${idSuffix}`;
    }
    panel.style.position = 'absolute';

    if (instrument) {
        panel.dataset.instrument = instrument;
        panel.dataset.instrumentPersisted = '1';
    }

    const { width, height } = pickToyPanelSize(type);
    if (Number.isFinite(width) && width > 0) panel.style.width = `${Math.round(width)}px`;

    // If no drop point provided, try to spawn to the right of the focused/toy under focus
    if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
      const ref = document.querySelector('.toy-panel.toy-focused') || document.querySelector(':scope > .toy-panel');
      if (ref) {
        const rx = parseFloat(ref.style.left) || 0;
        const ry = parseFloat(ref.style.top)  || 0;
        const rw = ref.offsetWidth  || ref.clientWidth || 360;
        const rh = ref.offsetHeight || ref.clientHeight || 300;
        const GAP = 24;
        centerX = rx + rw + GAP + (width || rw) / 2;
        centerY = ry + (height || rh) / 2;
      }
    }

    const left = Number.isFinite(centerX) ? Math.max(0, centerX - (width || 0) / 2) : 0;
    const top = Number.isFinite(centerY) ? Math.max(0, centerY - (height || 0) / 2) : 0;

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;

    board.appendChild(panel);

    const initialPlacement = ensurePanelSpawnPlacement(panel, {
        baseLeft: left,
        baseTop: top,
        fallbackWidth: width,
        fallbackHeight: height,
    });
    if (initialPlacement?.changed) {
        // The helper already wrote the updated position to the style attributes.
    }
    persistToyPosition(panel);

    const shouldAutoCenterCamera = !!autoCenter;

    setTimeout(() => {
        if (!panel.isConnected) return;
        try { initializeNewToy(panel); } catch (err) { console.warn('[createToyPanelAt] init failed', err); }
        try { initToyChaining(panel); } catch (err) { console.warn('[createToyPanelAt] chain init failed', err); }

        document.querySelectorAll('.toy-panel.toy-focused').forEach(p => {
            if (p !== panel) p.classList.remove('toy-focused');
        });
        panel.classList.add('toy-focused');

        const finalizePlacement = () => {
            const followUp = ensurePanelSpawnPlacement(panel, {
                fallbackWidth: width,
                fallbackHeight: height,
                skipIfMoved: true,
            });
            if (followUp?.changed) {
                persistToyPosition(panel);
            }
            try { updateChains(); updateAllChainUIs(); } catch (err) { console.warn('[createToyPanelAt] chain update failed', err); }
            try { applyStackingOrder(); } catch (err) { console.warn('[createToyPanelAt] stacking failed', err); }
            try { window.Persistence?.markDirty?.(); } catch (err) { console.warn('[createToyPanelAt] mark dirty failed', err); }
            delete panel.dataset.spawnAutoManaged;
            delete panel.dataset.spawnAutoLeft;
            delete panel.dataset.spawnAutoTop;
            if (shouldAutoCenterCamera && panel.isConnected) {
                try {
                    window.centerBoardOnElement?.(panel);
                } catch (err) {
                    console.warn('[createToyPanelAt] auto-center failed', err);
                }
            }
        };

        const raf = window.requestAnimationFrame?.bind(window) ?? ((fn) => setTimeout(fn, 16));
        raf(() => raf(finalizePlacement));
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
        g_chainState.delete(panelId);
        for (const [headId, activeId] of Array.from(g_chainState.entries())) {
            if (activeId === panelId) {
                g_chainState.set(headId, headId);
            }
        }
    }

    try { updateChains(); } catch (err) { console.warn('[destroyToyPanel] chain update failed', err); }
    try { updateAllChainUIs(); } catch (err) { console.warn('[destroyToyPanel] chain UI update failed', err); }
    try { scheduleChainRedraw(); } catch (err) { console.warn('[destroyToyPanel] draw chains failed', err); }
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
    .toy-chain-btn { position: absolute; right: -65px; transform: translateY(-50%); z-index: 52; }
`;
document.head.appendChild(chainBtnStyle);

function getChainAnchor(panel) {
  // Board-space coordinates of where the connector should start (right edge center of toy body)
  const left = (parseFloat(panel.style.left) || 0);
  const top  = (parseFloat(panel.style.top)  || 0);
  const body = panel.querySelector('.toy-body');
  if (body) {
    const bodyTop = body.offsetTop || 0;
    const bodyH   = body.offsetHeight || panel.offsetHeight || 0;
    const cx = left + panel.offsetWidth; // start at toy's right edge, independent of button
    const cy = top + bodyTop + (bodyH / 2);
    return { x: cx, y: cy };
  }
  // Fallback to panel center if body missing
  return {
    x: left + panel.offsetWidth,
    y: top + (panel.offsetHeight / 2)
  };
}

function getConnectorAnchorPoints(fromPanel, toPanel) {
  if (!fromPanel || !toPanel) return null;
  const a1 = getChainAnchor(fromPanel);
  const left = parseFloat(toPanel.style.left) || 0;
  const top = parseFloat(toPanel.style.top) || 0;
  const body = toPanel.querySelector('.toy-body');
  const a2y = body ? top + body.offsetTop + (body.offsetHeight / 2) : top + (toPanel.offsetHeight / 2);
  return { a1, a2: { x: left, y: a2y } };
}

function rebuildChainSegments() {
  // New edge model + adjacency index.
  g_chainEdges.clear();
  g_edgesByToyId.clear();

  const board = document.getElementById('board');
  if (!board || !g_chainState || g_chainState.size === 0) return;

  for (const headId of g_chainState.keys()) {
    let current = document.getElementById(headId);
    const visited = new Set();

    while (current && !visited.has(current.id)) {
      visited.add(current.id);

      const nextId = current.dataset.nextToyId;
      if (!nextId) break;
      const next = document.getElementById(nextId);
      if (!next) break;

      const anchors = getConnectorAnchorPoints(current, next);
      if (!anchors) {
        current = next;
        continue;
      }

      const { a1, a2 } = anchors;

      const edgeId = `${current.id}__${nextId}`;

      /** @type {Edge} */
      const edge = {
        id: edgeId,
        fromToyId: current.id,
        toToyId: nextId,
        type: 'default',
        p1x: a1.x - 1,
        p1y: a1.y,
        p2x: a2.x,
        p2y: a2.y
      };

      g_chainEdges.set(edgeId, edge);

      // Adjacency index – useful for future detach/reattach UX.
      let fromSet = g_edgesByToyId.get(current.id);
      if (!fromSet) {
        fromSet = new Set();
        g_edgesByToyId.set(current.id, fromSet);
      }
      fromSet.add(edgeId);

      let toSet = g_edgesByToyId.get(nextId);
      if (!toSet) {
        toSet = new Set();
        g_edgesByToyId.set(nextId, toSet);
      }
      toSet.add(edgeId);

      current = next;
    }
  }
}

function drawChains() {
  if (!CHAIN_FEATURE_ENABLE_CONNECTOR_DRAW) return;
  if (!chainCanvas || !chainCtx) return;

  const width = g_boardClientWidth || 0;
  const height = g_boardClientHeight || 0;
  const edgeCount = g_chainEdges ? g_chainEdges.size : 0;

  if (!width || !height) return;

  const tStart = performance.now();

  // Use a lower-resolution backing buffer for the chain canvas to reduce GPU cost.
  // We still draw in board coordinates, but the internal pixel density is scaled down.
  const devicePixelRatioForChains = window.devicePixelRatio || 1;
  const dpr = devicePixelRatioForChains * CHAIN_CANVAS_RESOLUTION_SCALE;
  const canvasW = chainCanvas.width / dpr;
  const canvasH = chainCanvas.height / dpr;

  // --- Phase 1: resize canvas if board viewport changed ---
  let tAfterResize = tStart;
  if (canvasW !== width || canvasH !== height) {
    const tResizeStart = performance.now();

    chainCanvas.width = width * dpr;
    chainCanvas.height = height * dpr;
    chainCanvas.style.left = '0px';
    chainCanvas.style.top = '0px';
    chainCanvas.style.width = `${width}px`;
    chainCanvas.style.height = `${height}px`;

    tAfterResize = performance.now();

    if (CHAIN_DEBUG) {
      console.log('[CHAIN][perf][resize] chainCanvas resized', 'board=', width, 'x', height, 'canvas=', chainCanvas.width, 'x', chainCanvas.height, 'cost=', (tAfterResize - tResizeStart).toFixed(2), 'ms')
    }
  } else {
    tAfterResize = performance.now();
  }

  // --- Phase 2: clear the canvas ---
  chainCtx.setTransform(1, 0, 0, 1, 0, 0);
  const tClearStart = performance.now();
  chainCtx.clearRect(0, 0, chainCanvas.width, chainCanvas.height);
  const tAfterClear = performance.now();

  if (!edgeCount) {
    if (CHAIN_DEBUG) {
      const total = tAfterClear - tStart;
      const resizeCost = tAfterResize - tStart;
      const clearCost = tAfterClear - tClearStart;
      if (total > CHAIN_DEBUG_LOG_THRESHOLD_MS) {
        console.log('[CHAIN][perf] drawChains(empty)', 'total=', total.toFixed(2), 'ms', 'resize=', resizeCost.toFixed(2), 'ms', 'clear=', clearCost.toFixed(2), 'ms', 'edges=', edgeCount)
      }
    }
    return;
  }

  // --- Phase 3: draw all edges ---
  chainCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const now = performance.now();
  // You can tweak these to taste. Thicker curves = slightly more GPU work.
  const baseWidth = 6;
  const pulseExtraWidth = 3;

  let connectorCount = 0;
  const tEdgesStart = performance.now();

  for (const edge of g_chainEdges.values()) {
    const { fromToyId, toToyId, p1x, p1y, p2x, p2y } = edge;

    if (!Number.isFinite(p1x) || !Number.isFinite(p1y) ||
        !Number.isFinite(p2x) || !Number.isFinite(p2y)) {
      continue;
    }

    const pulseInfo = g_pulsingConnectors.get(fromToyId);
    const isPulsing = !!(pulseInfo && pulseInfo.toId === toToyId && pulseInfo.until > now);
    const lineWidth = baseWidth + (isPulsing ? pulseExtraWidth : 0);

    const dx = p2x - p1x;
    const dy = p2y - p1y;
    const dist = Math.hypot(dx, dy) || 1;
    const handleLength = Math.max(40, dist * 0.33); // horizontal-only handles

    const c1x = p1x + handleLength;
    const c1y = p1y;
    const c2x = p2x - handleLength;
    const c2y = p2y;

    chainCtx.lineWidth = (lineWidth * 3);
    chainCtx.beginPath();
    chainCtx.moveTo(p1x, p1y);
    chainCtx.bezierCurveTo(c1x, c1y, c2x, c2y, p2x, p2y);
    chainCtx.lineCap = 'round';
    chainCtx.strokeStyle = isPulsing
      ? 'hsl(222, 100%, 95%)'
      : 'hsl(222, 100%, 80%)';
    chainCtx.stroke();

    connectorCount++;
  }

  const tAfterEdges = performance.now();

  if (CHAIN_DEBUG && connectorCount > 0 && g_chainState.size > 0) {
    console.log('[CHAIN][perf][detail] drawChains connectors=', connectorCount, 'heads=', g_chainState.size)
  }

  if (CHAIN_DEBUG) {
    const total = tAfterEdges - tStart;
    const resizeCost = tAfterResize - tStart;
    const clearCost = tAfterClear - tClearStart;
    const edgesCost = tAfterEdges - tEdgesStart;

    if (total > CHAIN_DEBUG_LOG_THRESHOLD_MS) {
      console.log(
        '[CHAIN][perf] drawChains',
        'total=', total.toFixed(2), 'ms',
        'resize=', resizeCost.toFixed(2), 'ms',
        'clear=', clearCost.toFixed(2), 'ms',
        'edges=', edgesCost.toFixed(2), 'ms',
        'edgeCount=', edgeCount
      )
    } else {
      console.log(
        '[CHAIN][drag] drawChains',
        'total=', total.toFixed(2), 'ms',
        'resize=', resizeCost.toFixed(2), 'ms',
        'clear=', clearCost.toFixed(2), 'ms',
        'edges=', edgesCost.toFixed(2), 'ms',
        'edgeCount=', edgeCount
      )
    }
  }
}

// Shift connector geometry only for segments touching a specific toy by applying
// the toy's movement delta. This avoids layout reads during drag.
function updateChainSegmentsForToy(toyId) {
  if (!toyId) return;
  if (!CHAIN_FEATURE_ENABLE_CONNECTOR_DRAW) return;

  const panel = document.getElementById(toyId);
  if (!panel || !panel.isConnected) return;

  // Use style.left/top so we don't force a reflow via offsetLeft/offsetTop.
  const left = parseFloat(panel.style.left);
  const top = parseFloat(panel.style.top);

  if (!Number.isFinite(left) || !Number.isFinite(top)) {
    if (CHAIN_DEBUG) {
      console.warn('[CHAIN][drag] updateChainSegmentsForToy: invalid left/top for', toyId, {
        left: panel.style.left,
        top: panel.style.top
      });
    }
    return;
  }

  const prev = g_chainToyLastPos.get(toyId) || { left, top };
  const dx = left - prev.left;
  const dy = top - prev.top;

  if (CHAIN_DEBUG) {
    console.log('[CHAIN][drag] updateChainSegmentsForToy', toyId, {
      left, top, prevLeft: prev.left, prevTop: prev.top, dx, dy
    });
  }

  // No movement since last update → nothing to do.
  if (dx === 0 && dy === 0) return;

  // Legacy geometry (for any remaining users of g_chainSegments).
  if (g_chainSegments && g_chainSegments.length > 0) {
    let touchedSegments = 0;
    for (const seg of g_chainSegments) {
      if (seg.fromId === toyId) {
        seg.p1x += dx;
        seg.p1y += dy;
        touchedSegments++;
      }
      if (seg.toId === toyId) {
        seg.p2x += dx;
        seg.p2y += dy;
        touchedSegments++;
      }
    }
    if (CHAIN_DEBUG && touchedSegments > 0) {
      console.log('[CHAIN][drag] updated legacy segments for', toyId, 'count=', touchedSegments);
    }
  }

  // New edge geometry used by drawChains(): update only edges attached to this toy.
  const edgeIdSet = g_edgesByToyId.get(toyId);
  if (edgeIdSet && edgeIdSet.size > 0) {
    let touchedEdges = 0;
    for (const edgeId of edgeIdSet) {
      const edge = g_chainEdges.get(edgeId);
      if (!edge) continue;

      if (edge.fromToyId === toyId) {
        edge.p1x += dx;
        edge.p1y += dy;
        touchedEdges++;
      }
      if (edge.toToyId === toyId) {
        edge.p2x += dx;
        edge.p2y += dy;
        touchedEdges++;
      }
    }
    if (CHAIN_DEBUG && touchedEdges > 0) {
      console.log('[CHAIN][drag] updated edges for', toyId, 'count=', touchedEdges);
    }
  } else if (CHAIN_DEBUG) {
    console.log('[CHAIN][drag] no edges found for', toyId);
  }

  g_chainToyLastPos.set(toyId, { left, top });
}
// Throttled "redraw once on the next frame" helper for chain connectors.
let g_chainRedrawScheduled = false;
function scheduleChainRedraw() {
    if (!chainCanvas || !chainCtx) return;
    if (g_chainRedrawScheduled) return;
    g_chainRedrawScheduled = true;

    const raf = window.requestAnimationFrame?.bind(window) ?? (fn => setTimeout(fn, 16));
    raf(() => {
        g_chainRedrawScheduled = false;
        try {
            drawChains();
        } catch (err) {
            console.warn('[CHAIN] scheduleChainRedraw failed', err);
        }
    });
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

    // Rebuild cached connector geometry whenever chain heads change and redraw once.
    try {
        rebuildChainSegments();
        if (CHAIN_FEATURE_ENABLE_CONNECTOR_DRAW) {
            scheduleChainRedraw();
        }
    } catch (err) {
        if (CHAIN_DEBUG) {
            console.warn('[CHAIN][perf] rebuildChainSegments/draw failed', err);
        }
    }
}

try {
    window.updateChains = updateChains;
    window.updateAllChainUIs = updateAllChainUIs;
} catch {}

  // --- Adaptive outline variable updater ---
  (function installOutlineScaler(){
    let lastScale = -1;
    const root = document.documentElement;

    function updateOutlineVars(scale){
      // Keep outline constant in *screen px* regardless of zoom.
      // Dialed up for stronger presence and flash.
      const BASE_W_PX   = 7.0;   // was ~6
      const PULSE_W_PX  = 17.0;  // was ~15

      // Glow halo around the outline (screen px)
      const GLOW_BASE_BLUR  = 10.0;
      const GLOW_PULSE_BLUR = 28.0;

      const MIN_SCREEN_PX = 2.5; // never thinner than this visually

      const basePreZoom  = Math.max(MIN_SCREEN_PX, BASE_W_PX);
      const pulsePreZoom = Math.max(basePreZoom * 1.6, PULSE_W_PX);

      root.style.setProperty('--toy-outline-w', `${basePreZoom}px`);
      root.style.setProperty('--toy-outline-pulse-w', `${pulsePreZoom}px`);
      root.style.setProperty('--toy-outline-glow-base', `${GLOW_BASE_BLUR}px`);
      root.style.setProperty('--toy-outline-glow-pulse', `${GLOW_PULSE_BLUR}px`);
    }

    // initial
    updateOutlineVars(window.__boardScale || 1);

    // update on zoom/overview transitions + window resize
    window.addEventListener('overview:transition', () => updateOutlineVars(window.__boardScale || 1), { passive: true });
    window.addEventListener('overview:transition', () => { try { syncAllBodyOutlines(); } catch {} }, { passive: true });
    window.addEventListener('resize', () => updateOutlineVars(window.__boardScale || 1), { passive: true });
    window.addEventListener('resize', () => { try { syncAllBodyOutlines(); } catch {} }, { passive: true });

    // also piggyback on the main rAF loop to catch any scale changes
    window.__updateOutlineScaleIfNeeded = function(){
      const scale = window.__boardScale || 1;
      if (scale !== lastScale){
        lastScale = scale;
        updateOutlineVars(scale);
      }
    };
  })();
function scheduler(){
  let lastPhase = 0;
  const lastCol = new Map();
  let lastPerfLog = 0;

  function step(){
    const frameStart = performance.now();

    // Keep outline-related CSS vars synced with zoom; heavy geometry sync happens on demand.
    try {
      window.__updateOutlineScaleIfNeeded && window.__updateOutlineScaleIfNeeded();
    } catch {}

    const info = getLoopInfo();

    if (CHAIN_FEATURE_ENABLE_SCHEDULER && isRunning()){
      // --- Phase: advance chains on bar wrap ---
      const phaseJustWrapped = info.phase01 < lastPhase && lastPhase > 0.9;
      lastPhase = info.phase01;

      if (phaseJustWrapped) {
        const tAdvanceStart = performance.now();
        for (const [headId] of g_chainState.entries()) {
          const activeToy = document.getElementById(g_chainState.get(headId));
          // Bouncers and Ripplers manage their own advancement via the 'chain:next' event.
          // All other toys (like loopgrid) advance on the global bar clock.
          if (activeToy && activeToy.dataset.toy !== 'bouncer' && activeToy.dataset.toy !== 'rippler') {
            advanceChain(headId);
          }
        }
        const tAdvanceEnd = performance.now();
        if (CHAIN_DEBUG && (tAdvanceEnd - tAdvanceStart) > CHAIN_DEBUG_LOG_THRESHOLD_MS) {
          console.log('[CHAIN][perf] advanceChain batch', (tAdvanceEnd - tAdvanceStart).toFixed(2), 'ms', 'heads=', g_chainState.size);
        }
      }

      // --- Phase A: chain-active flags ---
      const tActiveStart = performance.now();
      const activeToyIds = new Set(g_chainState.values());

      if (CHAIN_FEATURE_ENABLE_MARK_ACTIVE) {
        if (activeToyIds.size > 0) {
          document.querySelectorAll('.toy-panel[id]').forEach(toy => {
            const isActive = activeToyIds.has(toy.id);
            const current = toy.dataset.chainActive === 'true';
            if (current !== isActive) {
              toy.dataset.chainActive = isActive ? 'true' : 'false';
            }
          });
        } else {
          // No active toys in any chain: clear flags in one cheap pass.
          document.querySelectorAll('.toy-panel[data-chain-active="true"]').forEach(toy => {
            delete toy.dataset.chainActive;
          });
        }
      }
      const tActiveEnd = performance.now();
      if (CHAIN_DEBUG && (tActiveEnd - tActiveStart) > CHAIN_DEBUG_LOG_THRESHOLD_MS) {
        console.log('[CHAIN][perf] mark-active', (tActiveEnd - tActiveStart).toFixed(2), 'ms', 'activeToyCount=', activeToyIds.size);
      }

      // --- Phase B: find sequenced toys (DOM scan) ---
      const tSeqStart = performance.now();
      let sequencedToys = [];
      if (CHAIN_FEATURE_ENABLE_SEQUENCER) {
        sequencedToys = getSequencedToys(); // querySelectorAll('.toy-panel') + filter
      }
      const tSeqEnd = performance.now();
      if (CHAIN_DEBUG && CHAIN_FEATURE_ENABLE_SEQUENCER && (tSeqEnd - tSeqStart) > CHAIN_DEBUG_LOG_THRESHOLD_MS) {
        console.log('[CHAIN][perf] getSequencedToys', (tSeqEnd - tSeqStart).toFixed(2), 'ms', 'count=', sequencedToys.length);
      }
      // (existing behaviour: the actual stepping loop below uses activeToyIds, not sequencedToys)

      // --- Phase C: per-toy sequencer stepping for active chain links ---
      const tStepStart = performance.now();
      if (CHAIN_FEATURE_ENABLE_SEQUENCER) {
        for (const activeToyId of activeToyIds) {
          const toy = document.getElementById(activeToyId);
          if (toy && typeof toy.__sequencerStep === 'function') {
            const steps = parseInt(toy.dataset.steps, 10) || NUM_STEPS;
            const col = Math.floor(info.phase01 * steps) % steps;
            if (col !== lastCol.get(toy.id)) {
              lastCol.set(toy.id, col);
              try {
                toy.__sequencerStep(col);
              } catch (e) {
                console.warn(`Sequencer step failed for ${toy.id}`, e);
              }
              // If this toy actually has notes at this column, flash the normal-mode border
              if (panelHasNotesAtColumn(toy, col)) {
                pulseToyBorder(toy);
              }
            }
          }
        }
      }
      const tStepEnd = performance.now();
      if (CHAIN_DEBUG && CHAIN_FEATURE_ENABLE_SEQUENCER && (tStepEnd - tStepStart) > CHAIN_DEBUG_LOG_THRESHOLD_MS) {
        console.log('[CHAIN][perf] sequencerStep batch', (tStepEnd - tStepStart).toFixed(2), 'ms', 'activeToyCount=', activeToyIds.size);
      }

    } else {
      // Transport paused — ensure no steady highlight is shown
      try {
        document.querySelectorAll('.toy-panel').forEach(p => {
          p.classList.remove('toy-playing', 'toy-playing-pulse');
        });
      } catch {}
    }

    // --- Whole-frame cost ---
    const now = performance.now();
    const frameCost = now - frameStart;

    if (CHAIN_DEBUG && frameCost > CHAIN_DEBUG_FRAME_THRESHOLD_MS && (now - lastPerfLog) > 250) {
      lastPerfLog = now;

      // How many edges exist, and are connectors visually enabled?
      const edgeCount = g_chainEdges ? g_chainEdges.size : 0;
      const connectorsOn = !!CHAIN_FEATURE_ENABLE_CONNECTOR_DRAW;

      console.log(
        '[SCHED][perf] frame',
        frameCost.toFixed(2), 'ms',
        'edges=', edgeCount,
        'connectorsOn=', connectorsOn
      );
    }

    // Connectors are now updated on-demand, not every frame.
    requestAnimationFrame(step);
  }

  updateChains();
  requestAnimationFrame(step);
}

// --- Volume slider fill helper ---
function initToyVolumeSliders() {
  const sliders = document.querySelectorAll('.toy-volwrap input[type="range"]');
  sliders.forEach((slider) => {
    const updateFill = () => {
      const min = slider.min ? parseFloat(slider.min) : 0;
      const max = slider.max ? parseFloat(slider.max) : 100;
      const val = slider.value ? parseFloat(slider.value) : 0;
      const pct = (max > min) ? ((val - min) / (max - min)) : 0;
      slider.style.setProperty('--vol-fill-pct', `${Math.max(0, Math.min(1, pct)) * 100}%`);
    };
    slider.removeEventListener('input', slider.__volFillHandler || (() => {}));
    slider.__volFillHandler = updateFill;
    slider.addEventListener('input', updateFill);
    updateFill();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initToyVolumeSliders);
} else {
  initToyVolumeSliders();
}

async function boot(){
  const board = document.getElementById('board');
  if (board) {
    g_boardClientWidth = board.clientWidth || 0;
    g_boardClientHeight = board.clientHeight || 0;
  }

  window.addEventListener('resize', () => {
    const b = document.getElementById('board');
    if (!b) return;

    // Cache board client size for the chain canvas
    g_boardClientWidth = b.clientWidth || 0;
    g_boardClientHeight = b.clientHeight || 0;

    // Rebuild connector geometry + redraw once, event-driven, off the hot path
    if (CHAIN_FEATURE_ENABLE_CONNECTOR_DRAW) {
      try {
        rebuildChainSegments();
        scheduleChainRedraw();
      } catch (err) {
        if (CHAIN_DEBUG) {
          console.warn('[CHAIN] resize redraw failed', err);
        }
      }
    }
  }, { passive: true });

  // Overview / camera transitions can hide headers / footers and change the toy-body vertical center.
  // Treat this as a major layout change for connectors and rebuild geometry once.
  window.addEventListener('overview:transition', () => {
    if (!CHAIN_FEATURE_ENABLE_CONNECTOR_DRAW) return;

    try {
      rebuildChainSegments();
      scheduleChainRedraw();
    } catch (err) {
      if (CHAIN_DEBUG) {
        console.warn('[CHAIN] overview:transition redraw failed', err);
      }
    }
  }, { passive: true });
  try {
    try {
      await initAudioAssets(CSV_PATH);
      await loadInstrumentCatalog();
      console.log('[AUDIO] samples loaded');
    } catch(e) {
      console.warn('[AUDIO] init failed', e);
    }

    if (board && !document.getElementById('chain-canvas')) {
        chainCanvas = document.createElement('canvas');
        chainCanvas.id = 'chain-canvas';
        Object.assign(chainCanvas.style, {
            position: 'absolute',
            top: '0', left: '0', // width/height are set dynamically in drawChains
            pointerEvents: 'none',
            zIndex: '0' // Sit behind toy panels and buttons
        });
        board.prepend(chainCanvas);
        chainCtx = chainCanvas.getContext('2d');
        try {
            updateChains();
        } catch (err) {
            if (CHAIN_DEBUG) {
                console.warn('[CHAIN] initial updateChains failed', err);
            }
        }
    }

    bootTopbar();
    let restored = false;
    try{ restored = !!tryRestoreOnBoot(); }catch{}
    bootGrids();
    bootDrawGrids();
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="refresh"], .btn-refresh, [data-refresh]');
      if (btn) {
        try { window.Persistence?.flushBeforeRefresh?.(); } catch {}
        try { console.log('[MAIN] refresh requested -> flushed autosave'); } catch {}
      }
    }, true);
    // Delegate CLEAR button -> treat as user intent so drawgrid honors it
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="clear"], .btn-clear, [data-clear]');
      if (!btn) return;
      const panel = btn.closest('.toy-panel');
      if (!panel) return;

      try {
        const dg = panel.__drawToy;
        if (dg && typeof dg.clear === 'function') {
          dg.clear({ user: true, reason: 'user-clear-button' });
        } else {
          panel.dispatchEvent(new CustomEvent('toy-clear', {
            bubbles: false,
            detail: { user: true, reason: 'user-clear-button' }
          }));
        }
      } catch (err) {
        console.warn('[MAIN] clear dispatch failed', err);
      }
    }, true);
    document.querySelectorAll('.toy-panel').forEach(initToyChaining);
    // Initial sync once toys are present
    try { syncAllBodyOutlines(); } catch {}
    updateAllChainUIs(); // Set initial instrument button visibility
    try {
      rebuildChainSegments();
      scheduleChainRedraw();
    } catch (err) {
      if (CHAIN_DEBUG) {
        console.warn('[CHAIN] initial redraw failed', err);
      }
    }

  // Add event listener for grid-based chain activation
  document.addEventListener('chain:wakeup', (e) => {
    const panel = e.target.closest('.toy-panel');
    const toyType = panel?.dataset.toy;
    if (!panel || (toyType !== 'loopgrid' && toyType !== 'loopgrid-drum' && toyType !== 'drawgrid')) return;

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
    if (!panel || (toyType !== 'loopgrid' && toyType !== 'loopgrid-drum' && toyType !== 'drawgrid')) return;

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
      nextToy.dataset.instrumentPersisted = '1';
      nextToy.dispatchEvent(new CustomEvent('toy-instrument', { detail: { value: instrument }, bubbles: true }));
      nextToy.dispatchEvent(new CustomEvent('toy:instrument', { detail: { name: instrument, value: instrument }, bubbles: true }));
      current = nextToy;
    }
  });

  window.addEventListener('overview:transition', () => {
    try {
      rebuildChainSegments();
      scheduleChainRedraw();
    } catch (err) {
      if (CHAIN_DEBUG) {
        console.warn('[CHAIN] overview:transition redraw failed', err);
      }
    }
  }, { passive: true });

  // Start tracking drag when pressing down on a toy panel
  document.addEventListener('pointerdown', (e) => {
    const panel = e.target && e.target.closest ? e.target.closest('.toy-panel') : null;
    if (!panel) return;

    g_chainDragToyId = panel.id;
    g_chainDragLastUpdateTime = performance.now();

    // Seed last-pos cache for delta-based segment updates.
    const left = parseFloat(panel.style.left);
    const top = parseFloat(panel.style.top);
    if (Number.isFinite(left) && Number.isFinite(top)) {
      g_chainToyLastPos.set(panel.id, { left, top });
    } else {
      g_chainToyLastPos.set(panel.id, { left: 0, top: 0 });
    }

    if (CHAIN_DEBUG) {
      console.log('[CHAIN][drag] pointerdown on panel', panel.id, {
        left: panel.style.left,
        top: panel.style.top
      });
    }
  }, true);

  // While dragging, update only the segments connected to the dragged toy at a throttled rate
  document.addEventListener('pointermove', (e) => {
    if (!g_chainDragToyId) return;
    if (!CHAIN_FEATURE_ENABLE_CONNECTOR_DRAW) return;

    const now = performance.now();
    const dt = now - g_chainDragLastUpdateTime;

    if (dt < CHAIN_DRAG_UPDATE_INTERVAL_MS) {
      if (CHAIN_DEBUG) {
        // Very light log; comment out if too noisy.
        // console.log('[CHAIN][drag] pointermove skipped (throttle)', { dt });
      }
      return;
    }
    g_chainDragLastUpdateTime = now;

    let t0 = 0;
    if (CHAIN_DEBUG) {
      t0 = performance.now();
    }

    try {
      updateChainSegmentsForToy(g_chainDragToyId);
      scheduleChainRedraw();
    } catch (err) {
      if (CHAIN_DEBUG) {
        console.warn('[CHAIN] pointermove throttled redraw failed', err);
      }
    }

    if (CHAIN_DEBUG) {
      const t1 = performance.now();
      const jsTime = t1 - t0;

      let edgeCount = 0;
      if (g_edgesByToyId && g_edgesByToyId.has(g_chainDragToyId)) {
        const set = g_edgesByToyId.get(g_chainDragToyId);
        edgeCount = set ? set.size : 0;
      }

      console.log(
        '[CHAIN][perf][drag] JS',
        jsTime.toFixed(3),
        'ms for toy',
        g_chainDragToyId,
        'edges=',
        edgeCount,
        'dt=',
        dt.toFixed(1)
      );
    }
  }, true);

  // On drag end, do a final precise rebuild and clear drag state
  document.addEventListener('pointerup', () => {
    if (!g_chainDragToyId) return; // not dragging a toy
    const toyId = g_chainDragToyId;
    g_chainDragToyId = null;
    g_chainDragLastUpdateTime = 0;
    g_chainToyLastPos.delete(toyId);
    if (!CHAIN_FEATURE_ENABLE_CONNECTOR_DRAW) return;

    try {
      rebuildChainSegments();
      scheduleChainRedraw();
    } catch (err) {
      if (CHAIN_DEBUG) {
        console.warn('[CHAIN] pointerup final redraw failed', err);
      }
    }
  }, true);

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
    try{ window.UIHighlights?.onAppBoot?.({ restored, hasSavedPositions }); }catch{}
    try{ board?.classList.remove(BOARD_BOOT_CLASS); }catch{}
    try{ startAutosave(2000); }catch{}
  } finally {
    try{ board?.classList.remove(BOARD_BOOT_CLASS); }catch{}
  }
}
if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
