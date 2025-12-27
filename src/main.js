import './mobile-viewport.js';
import './fullscreen.js';
// --- Module Imports ---
import './debug.js';
import './scene-manager.js';
import './perf/perf-lab.js';
import './perf/perf-gesture-autotune.js';
import './advanced-controls-toggle.js';
import './toy-visibility.js';
import { onZoomChange, namedZoomListener } from './zoom/ZoomCoordinator.js';
import { initializeBouncer } from './bouncer-init.js';
import './header-buttons-delegate.js';
import './rippler-init.js';
import './tutorial.js';
import { startParticleStream } from './tutorial-fx.js';
import './ui-highlights.js';
import { updateParticleQualityFromFps } from './particles/ParticleQuality.js';
// import { createBouncer } from './bouncer.main.js'; // This is now handled by bouncer-init.js
import './debug-reflow.js';
import { initDrawGrid } from './drawgrid-init.js';
import { createChordWheel } from './chordwheel.js';
import { createRippleSynth } from './ripplesynth.js';
import { applyStackingOrder } from './stacking-manager.js';
import { getViewportTransform, getViewportElement, screenToWorld } from './board-viewport.js';

import './toy-audio.js';
import './toy-layout-manager.js';
import './zoom-overlay.js';
import './toy-spawner.js';
import './board-tap-dots.js';
import { initAudioAssets } from './audio-samples.js';
import { loadInstrumentEntries as loadInstrumentCatalog } from './instrument-catalog.js';
import { collectUsedInstruments, getSoundThemeKey, pickInstrumentForToy } from './sound-theme.js';
import { installIOSAudioUnlock } from './ios-audio-unlock.js';
import { installAudioDiagnostics } from './audio-diagnostics.js';
import { makeDebugLogger } from './debug-flags.js';
import { DEFAULT_BPM, NUM_STEPS, ensureAudioContext, getLoopInfo, setBpm, start, isRunning } from './audio-core.js';
import { buildGrid } from './grid-core.js';
import { buildDrumGrid } from './drum-core.js';
import { tryRestoreOnBoot, startAutosave } from './persistence.js';
import { initBoardAnchor, tickBoardAnchor } from './board-anchor.js';

const mainLog = makeDebugLogger('mt_debug_logs', 'log');

installIOSAudioUnlock();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installAudioDiagnostics, { once: true });
} else {
  installAudioDiagnostics();
}
// Ensure at least one non-passive gesture listener exists for iOS unlock
window.addEventListener('touchstart', ()=>{}, { capture: true, passive: false });

// Track zoom gesture state globally so visual systems can throttle without affecting audio timing.
(function setupZoomGestureFlag(){
  try {
    onZoomChange(namedZoomListener('main:gesture-flag', (payload = {}) => {
      const { phase, gesturing, mode } = payload;
      const active =
        !!gesturing ||
        phase === 'progress' ||
        phase === 'freeze' ||
        phase === 'recompute' ||
        phase === 'begin' ||
        phase === 'prepare';
      if (active) {
        window.__mtZoomGesturing = true;
      } else if (phase === 'done' || phase === 'commit' || phase === 'swap' || phase === 'idle' || mode === 'idle') {
        window.__mtZoomGesturing = false;
      }
    }));
  } catch {}
})();

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

    let candidateLeft = basePosition.left;
    let candidateTop = basePosition.top;

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
        const qLeft = Math.round(left);
        const qTop = Math.round(top);
        const key = `${qLeft}|${qTop}`;
        if (!visited.has(key)) {
            visited.add(key);
            queue.push({ left: qLeft, top: qTop });
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

        for (const [nx, ny] of neighbors) enqueue(nx, ny);
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
let g_chainCanvasWorldLeft = 0;
let g_chainCanvasWorldTop = 0;

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
// Overview drag state (when shield is non-interactive)
let g_overviewPanelDrag = null;
// Track the most recent chained panel for post-zoom debug logs.
let g_lastChainedDebugPanel = null;

// --- Chain position observer (keeps connectors synced even when drag path bypasses our pointer hooks) ---
let g_chainPosObserver = null;
let g_chainPosDirtyToyIds = new Set();
let g_chainPosFlushRaf = 0;
let g_chainPosLastFlushMs = 0;

// Keep this fairly light; we only need "feels live" while dragging.
const CHAIN_POS_OBS_MIN_INTERVAL_MS = 16;

function installChainPositionObserver() {
  if (window.__CHAIN_POS_OBS_INSTALLED__) return;
  window.__CHAIN_POS_OBS_INSTALLED__ = true;

  const board = document.getElementById('board');
  if (!board || typeof MutationObserver === 'undefined') return;

  const flush = () => {
    g_chainPosFlushRaf = 0;
    if (!CHAIN_FEATURE_ENABLE_CONNECTOR_DRAW) {
      g_chainPosDirtyToyIds.clear();
      return;
    }

    const now = performance.now();
    if (now - g_chainPosLastFlushMs < CHAIN_POS_OBS_MIN_INTERVAL_MS) {
      // Re-schedule if we’re being spammed.
      g_chainPosFlushRaf = requestAnimationFrame(flush);
      return;
    }
    g_chainPosLastFlushMs = now;

    try {
      for (const toyId of g_chainPosDirtyToyIds) {
        updateChainSegmentsForToy(toyId);
      }
      g_chainPosDirtyToyIds.clear();
      scheduleChainRedraw();
    } catch (err) {
      // Keep silent unless debugging.
      if (CHAIN_DEBUG) console.warn('[CHAIN][pos-obs] flush failed', err);
      g_chainPosDirtyToyIds.clear();
    }
  };

  g_chainPosObserver = new MutationObserver((mutations) => {
    // Only care when focus editing or overview — basically anytime connectors might be visible.
    // (This keeps us from doing work in totally irrelevant states.)
    const boardEl = document.getElementById('board');
    const overviewActive =
      !!(window.__overviewMode?.isActive?.() ||
         boardEl?.classList?.contains('board-overview') ||
         document.body?.classList?.contains('overview-mode'));

    const focusEditActive =
      (typeof isFocusEditingEnabled === 'function' && isFocusEditingEnabled()) ||
      (typeof isActivelyEditingToy === 'function' && isActivelyEditingToy());
    if (!overviewActive && !focusEditActive) return;

    for (const m of mutations) {
      const el = m.target;
      if (!el || !el.classList || !el.classList.contains('toy-panel')) continue;
      if (!el.id) continue;

      // Only bother if this toy actually participates in chains.
      if (!g_edgesByToyId || !g_edgesByToyId.has(el.id)) continue;

      g_chainPosDirtyToyIds.add(el.id);
    }

    if (g_chainPosDirtyToyIds.size > 0 && !g_chainPosFlushRaf) {
      g_chainPosFlushRaf = requestAnimationFrame(flush);
    }
  });

  g_chainPosObserver.observe(board, {
    attributes: true,
    attributeFilter: ['style'],
    subtree: true,
  });
}

// Aim for ~60fps max during drag; further throttling is done by the browser's pointermove rate.
const CHAIN_DRAG_UPDATE_INTERVAL_MS = 24;

// Chain / scheduler debug controls.
// CHAIN_DEBUG: master flag - turn this off to silence all chain/scheduler logs.
const CHAIN_DEBUG = false;
const CHAIN_OV_DBG = false; // locked off; re-enable manually if deep OV debugging is needed.
// Log phase timings that take longer than this in ms.
const CHAIN_DEBUG_LOG_THRESHOLD_MS = 1;
// Log whole-frame cost if it exceeds this in ms (we'll also rate-limit logs).
const CHAIN_DEBUG_FRAME_THRESHOLD_MS = 0.0;
// Standard gap between chained toys (world-space px), matching normal spawn spacing expectations.
const CHAIN_SPAWN_GAP = 60;

// Feature flags so we can selectively disable suspected work during perf debugging.
// Flip these to false one at a time to see which block removes the slowdown.
const CHAIN_FEATURE_ENABLE_SCHEDULER      = true;  // master toggle for chain work in scheduler()
const CHAIN_FEATURE_ENABLE_MARK_ACTIVE    = true;  // DOM scan + data-chain-active flags
const CHAIN_FEATURE_ENABLE_SEQUENCER      = true;  // __sequencerStep + border pulses
const CHAIN_FEATURE_ENABLE_CONNECTOR_DRAW = true; // drawChains() canvas connectors
// Rendering resolution multiplier for the chain canvas.
// 1.0 = full resolution (heaviest)
// 0.5 = half resolution in each dimension (~4x fewer pixels)
// 0.25 = quarter resolution in each dimension (~16x fewer pixels)
const CHAIN_CANVAS_RESOLUTION_SCALE = 0.35;

function dbgOvEv(tag, e, panelId) {
  try {
    const t = e?.target;
    console.log(tag, {
      panelId,
      type: e?.type,
      button: e?.button,
      pointerType: e?.pointerType,
      target: t ? (t.className || t.tagName) : null,
      isChainBtn: !!(t && t.closest && t.closest('.toy-chain-btn')),
      defaultPrevented: !!e?.defaultPrevented,
    });
  } catch {}
}

function dbgPanelRect(panel, tag) {
  try {
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    const cs = getComputedStyle(panel);
    console.log('[OVDBG][panelRect]', tag, {
      id: panel.id,
      styleLeft: panel.style.left,
      styleTop: panel.style.top,
      computedPos: cs.position,
      computedLeft: cs.left,
      computedTop: cs.top,
      rect: {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height)
      }
    });
  } catch {}
}

// --- Toy Focus Management ----------------------------------------------------
let g_focusedToyId = null;
const focusScaleAnimations = new WeakMap();
const isFocusManagedPanel = (panel) => {
  return panel?.classList?.contains('toy-panel') && panel.dataset.focusSkip !== '1';
};

const FOCUS_PREF_KEY = 'prefs:focusEditingEnabled';
const FOCUS_LAST_ID_KEY = 'prefs:lastFocusedToyId';
let g_suppressBootFocus = false;
let g_isRestoringSnapshot = false;
let g_restoringFocusId = null;
const readStoredFocusEditingEnabled = () => {
  const unlocked = (typeof window !== 'undefined' && window.__enableSmallScreenEditingToggle === true);
  if (!unlocked) return false;
  try {
    const raw = localStorage.getItem(FOCUS_PREF_KEY);
    if (raw === '0') return false;
    if (raw === '1') return true;
  } catch {}
  return false; // default off
};

try {
  // Default ON so focus centering issues are visible; set localStorage.FOCUS_DBG='0' to silence.
  if (localStorage.getItem('FOCUS_DBG') === null) {
    localStorage.setItem('FOCUS_DBG', '1');
  }
  window.__focusDebug = localStorage.getItem('FOCUS_DBG') === '1';
} catch {}

const readStoredLastFocusedId = () => {
  try {
    const raw = localStorage.getItem(FOCUS_LAST_ID_KEY);
    if (raw === 'none') return null;
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  } catch {}
  return null;
};

function isFocusEditingEnabled() {
  if (typeof window !== 'undefined' && typeof window.__focusEditingEnabled === 'boolean') {
    return window.__focusEditingEnabled;
  }
  return readStoredFocusEditingEnabled();
}

function resetFocusClasses() {
  document.querySelectorAll('.toy-panel').forEach((p) => {
    if (!isFocusManagedPanel(p)) return;
    p.classList.remove('toy-focused', 'toy-unfocused');
    p.style.pointerEvents = 'auto';
    const body = p.querySelector('.toy-body');
    if (body) body.style.pointerEvents = '';
  });
}

function normalizeFocusDom() {
  try {
    const dbg = (window.__focusDebug || localStorage.getItem('FOCUS_DBG') === '1');
    if (dbg) console.log('[focus] normalize DOM');
  } catch {}
  document.querySelectorAll('.toy-panel').forEach((p) => {
    if (!isFocusManagedPanel(p)) return;
    p.classList.remove('toy-focused', 'toy-unfocused');
    p.style.pointerEvents = 'auto';
    const body = p.querySelector('.toy-body');
    if (body) body.style.pointerEvents = '';
  });
}

function applyToyDetailLevel(level = 'high') {
  const detail = level === 'low' ? 'low' : 'high';
  window.__toyDetailLevel = detail;
  const body = document.body;
  if (body) {
    body.dataset.toyDetail = detail;
    body.classList.toggle('toy-detail-low', detail === 'low');
    body.classList.toggle('toy-detail-high', detail === 'high');
  }
  try {
    window.dispatchEvent(new CustomEvent('toys:detail-level', { detail: { level: detail } }));
  } catch {}
  const flipFn = detail === 'low' ? 'flipToLowDetailToys' : 'flipToHighDetailToys';
  try {
    const fn = window?.[flipFn];
    if (typeof fn === 'function') fn();
  } catch {}
  return detail;
}

function setFocusEditingEnabled(enabled, { apply = true } = {}) {
  const prev = isFocusEditingEnabled();
  const flag = !!enabled;
  window.__focusEditingEnabled = flag;
  try { localStorage.setItem(FOCUS_PREF_KEY, flag ? '1' : '0'); } catch {}

  if (apply) {
    if (!flag) {
      setToyFocus(null, { center: false });
    } else if (window.gFocusedToy) {
      setToyFocus(window.gFocusedToy, { center: false });
    } else {
      // No active focus yet: present the low-detail overview state immediately.
      setToyFocus(null, { center: false, unfocusAll: true });
    }
    if (flag !== prev) {
      applyToyDetailLevel(flag ? 'low' : 'high');
    }
    try { window.dispatchEvent(new CustomEvent('focus:editing-toggle', { detail: { enabled: flag } })); } catch {}
  }
  return flag;
}

// Initialize the global flag and expose helpers for other modules.
setFocusEditingEnabled(isFocusEditingEnabled(), { apply: false });
window.isFocusEditingEnabled = isFocusEditingEnabled;
window.setFocusEditingEnabled = (enabled) => setFocusEditingEnabled(enabled);
window.setToyDetailLevel = applyToyDetailLevel;
window.getToyDetailLevel = () => window.__toyDetailLevel || 'high';
applyToyDetailLevel(isFocusEditingEnabled() ? 'low' : 'high');

function getPanelScale(panel) {
  try {
    const t = getComputedStyle(panel).transform;
    if (!t || t === 'none') return 1;
    if (t.startsWith('matrix3d(')) {
      const parts = t.slice(9, -1).split(',');
      const sx = parseFloat(parts[0]) || 1;
      const sy = parseFloat(parts[5]) || 1;
      return (Math.abs(sx) + Math.abs(sy)) * 0.5;
    }
    if (t.startsWith('matrix(')) {
      const parts = t.slice(7, -1).split(',');
      const sx = parseFloat(parts[0]) || 1;
      const sy = parseFloat(parts[3]) || 1;
      return (Math.abs(sx) + Math.abs(sy)) * 0.5;
    }
  } catch {}
  return 1;
}

function animateFocusScale(panel, fromScale, toScale) {
  if (!panel || typeof panel.animate !== 'function') return;
  const currentAnim = focusScaleAnimations.get(panel);
  currentAnim?.cancel?.();

  if (!Number.isFinite(fromScale)) fromScale = toScale;
  if (!Number.isFinite(toScale)) return;
  if (Math.abs(toScale - fromScale) < 0.001) {
    focusScaleAnimations.delete(panel);
    return;
  }

  const midScale = toScale * (toScale > fromScale ? 1.2 : 0.8);
  const anim = panel.animate(
    [
      { transform: `scale(${fromScale})` },
      { transform: `scale(${midScale})`, offset: 0.8 },
      { transform: `scale(${toScale})` },
    ],
    {
      duration: 1000,
      easing: 'cubic-bezier(0.2, 0.9, 0.2, 1)',
      fill: 'forwards',
    }
  );
  focusScaleAnimations.set(panel, anim);
  anim.finished.then(() => {
    if (focusScaleAnimations.get(panel) === anim) {
      focusScaleAnimations.delete(panel);
      anim.cancel();
    }
  }).catch(() => {});
}

window.clearToyFocus = () => setToyFocus(null);
function setToyFocus(panel, { center = true, unfocusAll } = {}) { // default center=true
  const effectiveUnfocusAll = (typeof unfocusAll === 'boolean')
    ? unfocusAll
    : (!panel && isFocusEditingEnabled()); // default: when clearing focus, keep toys in low-detail/unfocused state

  const allowRestoreFocus = panel && g_restoringFocusId && panel.id === g_restoringFocusId;
  if (panel && (g_suppressBootFocus || g_isRestoringSnapshot) && !allowRestoreFocus) {
    try {
      const dbg = (window.__focusDebug || localStorage.getItem('FOCUS_DBG') === '1');
      if (dbg) console.log('[focus] setToyFocus suppressed due to boot/restoring guard', panel.id);
    } catch {}
    return;
  }
  if (!isFocusEditingEnabled()) {
    g_focusedToyId = null;
    window.__toyFocused = false;
    window.gFocusedToy = null;
    resetFocusClasses();
    try { localStorage.setItem(FOCUS_LAST_ID_KEY, 'none'); } catch {}
    try { window.dispatchEvent(new CustomEvent('focus:change', { detail: { hasFocus: false } })); } catch {}
    return;
  }

  if (panel && (!panel.isConnected || !isFocusManagedPanel(panel))) {
    g_focusedToyId = null;
    window.__toyFocused = false;
    window.gFocusedToy = null;
    return;
  }

  g_focusedToyId = panel ? panel.id : null;
  window.__toyFocused = !!panel;
  window.gFocusedToy = panel;
  try {
    if (g_focusedToyId) {
      localStorage.setItem(FOCUS_LAST_ID_KEY, g_focusedToyId);
    } else {
      localStorage.setItem(FOCUS_LAST_ID_KEY, 'none');
    }
    const dbg = (window.__focusDebug || localStorage.getItem('FOCUS_DBG') === '1');
    if (dbg) console.log('[focus] setToyFocus', { id: g_focusedToyId, center, unfocusAll: effectiveUnfocusAll });
  } catch {}

  document.querySelectorAll('.toy-panel').forEach((p) => {
    if (!isFocusManagedPanel(p)) return;
    const isFocus = p === panel;
    const desiredUnfocus = panel ? !isFocus : !!effectiveUnfocusAll;
    const wasFocused = p.classList.contains('toy-focused');
    const wasUnfocused = p.classList.contains('toy-unfocused');
    const needsUpdate = (wasFocused !== isFocus) || (wasUnfocused !== desiredUnfocus) || effectiveUnfocusAll;

    if (needsUpdate) {
      p.classList.toggle('toy-focused', isFocus);
      p.classList.toggle('toy-unfocused', desiredUnfocus);

      const spawnHint = Number.parseFloat(p.dataset.spawnScaleHint);
      const startScale = Number.isFinite(spawnHint) ? spawnHint : getPanelScale(p);
      const targetScale = isFocus ? 1.0 : 0.75;
      animateFocusScale(p, startScale, targetScale);
      if (Number.isFinite(spawnHint)) {
        delete p.dataset.spawnScaleHint;
      }
    }

    const body = p.querySelector('.toy-body');
    if (!isFocus && desiredUnfocus) {
      p.style.pointerEvents = 'auto'; // allow dragging via panel
      if (body) body.style.pointerEvents = 'none';
    } else {
      // Keep controls clickable while focused; dragging is already blocked by the global focus guard.
      p.style.pointerEvents = 'auto';
      if (body) body.style.pointerEvents = '';
    }
  });

  if (panel && center && !g_suppressBootFocus) {
    requestAnimationFrame(() => {
      const guide = document.querySelector('.guide-launcher');
      const spawner = document.querySelector('.toy-spawner-dock');
      const guideRight = guide ? guide.getBoundingClientRect().right : 0;
      const spawnerLeft = spawner ? spawner.getBoundingClientRect().left : window.innerWidth;
      const centerX = (guideRight + spawnerLeft) / 2;
      const centerFracX = centerX / window.innerWidth;
      try {
        if (window.__focusDebug || localStorage.getItem('FOCUS_DBG') === '1') {
          console.log('[focus] center request', {
            id: panel.id,
            centerFracX,
            scaleTarget: 1.0,
            camLock: typeof window.__camTweenLock === 'boolean' ? window.__camTweenLock : '(unknown)',
          });
        }
      } catch {}
      window.centerBoardOnElementSlow?.(panel, 1.0, { centerFracX });
    });
  }
  
  
  window.dispatchEvent(new CustomEvent('focus:change', { detail: { hasFocus: !!panel } }));
}

function restoreFocusFromStorage() {
  const enabled = isFocusEditingEnabled();
  if (!enabled) return;
  const lastId = readStoredLastFocusedId();
  g_restoringFocusId = lastId || null;
  g_suppressBootFocus = true;
  if (lastId) {
    const el = document.getElementById(lastId);
    if (el) {
      setToyFocus(el, { center: false });
    }
  }
  const clearFocus = () => setToyFocus(null, { center: false, unfocusAll: true });
  // If no stored focus or element missing, ensure unfocused low-detail state.
  if (!lastId || !document.getElementById(lastId)) {
    clearFocus();
    const raf = window.requestAnimationFrame?.bind(window) ?? ((fn) => setTimeout(fn, 16));
    raf(() => setTimeout(clearFocus, 0));
  }
  setTimeout(() => {
    g_restoringFocusId = null;
    g_suppressBootFocus = false;
  }, 800);
}

function enforceFocusState({ forceUnfocusAll = false } = {}) {
  if (g_restoringFocusId) return;
  normalizeFocusDom();
  if (!isFocusEditingEnabled()) return;
  if (forceUnfocusAll) {
    setToyFocus(null, { center: false, unfocusAll: true });
    return;
  }
  const lastId = readStoredLastFocusedId();
  if (lastId) {
    const el = document.getElementById(lastId);
    if (el) {
      setToyFocus(el, { center: false });
      return;
    }
  }
  setToyFocus(null, { center: false, unfocusAll: true });
}


mainLog('[MAIN] module start');
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

// Global FPS HUD (debug)
// Flip this to false if you want to hide it again.
const ENABLE_FPS_HUD = true;

let __fpsHudEl = null;
let __fpsLastTs = 0;
let __fpsFrames = 0;
let __fpsValue = 0;

function initFpsHud() {
  if (!ENABLE_FPS_HUD) return;

  const host = document.getElementById('topbar') || boardBootRoot || document.body;
  if (!host || __fpsHudEl) return;

  const el = document.createElement('div');
  el.id = 'mt-fps-hud';
  Object.assign(el.style, {
    position: 'fixed',
    right: '8px',
    top: '8px',
    padding: '4px 8px',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    fontSize: '11px',
    background: 'rgba(0,0,0,0.6)',
    color: '#0f0',
    borderRadius: '4px',
    zIndex: '99999',
    pointerEvents: 'none',
  });
  el.textContent = 'FPS: --';
  host.appendChild(el);
  __fpsHudEl = el;

  const raf = (window.requestAnimationFrame?.bind(window)) ||
              (cb => setTimeout(() => cb(performance?.now?.() ?? Date.now()), 16));

  function tick(now) {
    if (!__fpsLastTs) {
      __fpsLastTs = now;
      __fpsFrames = 0;
    }

    __fpsFrames++;
    const elapsed = now - __fpsLastTs;

    if (elapsed >= 500) { // update roughly twice per second
      __fpsValue = (__fpsFrames * 1000) / elapsed;
      __fpsFrames = 0;
      __fpsLastTs = now;

      // Update HUD text
      if (__fpsHudEl) {
        __fpsHudEl.textContent = `FPS: ${__fpsValue.toFixed(1)}`;
      }

      // Expose FPS globally for any legacy uses (e.g. drawgrid tuning).
      try {
        window.__dgFpsValue = __fpsValue;
      } catch (err) {
        // ignore
      }

      // Feed the shared particle quality system.
      try {
        updateParticleQualityFromFps(__fpsValue);
      } catch (err) {
        // ignore – debug-only feature should never crash the app
      }
    }

    raf(tick);
  }

  raf(tick);
}
const CSV_PATH = './samples.csv'; // optional
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
try { window.__syncAllBodyOutlines = syncAllBodyOutlines; } catch {}
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

const EXPERIMENTAL_TOYS = ['bouncer', 'rippler', 'loopgrid-drum', 'chordwheel'];
const EXPERIMENTAL_PREF_KEY = 'prefs:enable-experimental-toys';

const toyCatalog = [
    { type: 'drawgrid', name: 'Draw Line', description: 'Sketch out freehand lines that become notes.', size: { width: 420, height: 460 } },
    { type: 'loopgrid', name: 'Simple Rhythm', description: 'Layer drum patterns and melodies with an 8x12 step matrix.', size: { width: 420, height: 420 } },
    { type: 'bouncer', name: 'Bouncer', description: 'Bounce melodic balls inside a square arena.', size: { width: 420, height: 420 }, disabled: true },
    { type: 'rippler', name: 'Rippler', description: 'Evolving pads driven by ripple collisions.', size: { width: 420, height: 420 }, disabled: true },
    { type: 'loopgrid-drum', name: 'Drum Kit', description: 'Tap a responsive pad while sequencing the 8-step cube grid.', size: { width: 380, height: 420 }, disabled: true },
    { type: 'chordwheel', name: 'Chord Wheel', description: 'Play circle-of-fifths chord progressions instantly.', size: { width: 460, height: 420 }, disabled: true },
];

function isExperimentalEnabled() {
    try {
        return localStorage.getItem(EXPERIMENTAL_PREF_KEY) === '1';
    } catch (err) {
        console.warn('[toys] experimental toggle read failed', err);
        return false;
    }
}

function setExperimentalEnabled(enabled) {
    try {
        localStorage.setItem(EXPERIMENTAL_PREF_KEY, enabled ? '1' : '0');
    } catch (err) {
        console.warn('[toys] experimental toggle write failed', err);
    }
    try {
        window.ToySpawner?.configure?.({ getCatalog: () => getToyCatalog() });
    } catch (err) {
        console.warn('[toys] refresh spawner catalog failed', err);
    }
}

function getToyCatalog() {
    const experimentalOn = isExperimentalEnabled();
    return toyCatalog.map((entry) => {
        if (EXPERIMENTAL_TOYS.includes(entry.type)) {
            return { ...entry, disabled: entry.disabled && !experimentalOn };
        }
        return { ...entry };
    });
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

function lockChainButton(panel, { hasChild = true } = {}) {
    if (!panel) return;
    const btn = panel.querySelector('.toy-chain-btn');
    const core = btn?.querySelector('.c-btn-core');
    if (CHAIN_DEBUG) {
        console.log('[chain][btn] lockChainButton', {
            panel: panel.id,
            hasChild,
            btn: !!btn,
            core: !!core,
            next: panel.dataset.nextToyId,
            chainHasChild: panel.dataset.chainHasChild,
            prev: panel.dataset.prevToyId,
            btnDisabledAttr: btn?.getAttribute?.('data-chaindisabled') || null,
            btnHasDisabledClass: btn?.classList?.contains?.('toy-chain-btn-disabled') || false,
            btnComputedIcon: core ? getComputedStyle(core).getPropertyValue('--c-btn-icon-url') : null,
        });
    }
    if (hasChild) {
        panel.dataset.chainHasChild = '1';
        btn?.setAttribute?.('data-chaindisabled', '1');
        btn?.classList?.add?.('toy-chain-btn-disabled');
        if (btn) btn.style.pointerEvents = 'none';
        if (core) {
            core.style.setProperty('--c-btn-icon-url', `url('/assets/UI/T_ButtonEmpty.png')`);
        }
    } else {
        delete panel.dataset.chainHasChild;
        btn?.removeAttribute?.('data-chaindisabled');
        btn?.classList?.remove?.('toy-chain-btn-disabled');
        if (btn) btn.style.pointerEvents = 'auto';
        if (core) {
            core.style.setProperty('--c-btn-icon-url', `url('/assets/UI/T_ButtonExtend.png')`);
        }
    }
}

function removeChainEdgesForToy(toyId) {
    if (!toyId || !g_edgesByToyId || !g_chainEdges) return;
    const edgeIdSet = g_edgesByToyId.get(toyId);
    if (!edgeIdSet || edgeIdSet.size === 0) return;

    for (const edgeId of Array.from(edgeIdSet)) {
        const edge = g_chainEdges.get(edgeId);
        if (edge) {
            const { fromToyId, toToyId } = edge;
            // Remove edge from main map
            g_chainEdges.delete(edgeId);
            // Remove references from adjacency index
            const fromSet = g_edgesByToyId.get(fromToyId);
            if (fromSet) fromSet.delete(edgeId);
            const toSet = g_edgesByToyId.get(toToyId);
            if (toSet) toSet.delete(edgeId);
        }
    }
    g_edgesByToyId.delete(toyId);
    g_chainRedrawPendingFull = true;
    scheduleChainRedraw();
}

function updateAllChainUIs() {
    // Normalize child flags from DOM links so refresh/restore can't lose them.
    const panels = Array.from(document.querySelectorAll('.toy-panel[id]'));
    panels.forEach(p => {
        const hasKnownChild = (() => {
            if (p.dataset.nextToyId) return true;
            if (p.dataset.chainHasChild === '1') return true;
            // Check if any panel points to this one
            return panels.some(el => (el.dataset.prevToyId || el.dataset.chainParent) === p.id);
        })();
        if (hasKnownChild) {
            p.dataset.chainHasChild = '1';
            p.setAttribute('data-chaindisabled', '1');
        } else {
            delete p.dataset.chainHasChild;
            p.removeAttribute('data-chaindisabled');
        }
    });

    // Precompute which toys are referenced as children so we can still
    // lock the "+" button even if a parent lost its `data-next-toy-id`
    // during restore. This prevents the icon from flipping back to the
    // enabled state after a page refresh.
    const parentHasChild = new Set();
    document.querySelectorAll('.toy-panel[id]').forEach(child => {
        const parentId = child.dataset.prevToyId || child.dataset.chainParent;
        if (parentId) parentHasChild.add(parentId);
    });

    const allToys = Array.from(document.querySelectorAll('.toy-panel[data-toy]'));
    allToys.forEach(toy => {
        const instBtn = toy.querySelector('.toy-inst-btn');
        if (instBtn) {
            const isChild = !!toy.dataset.prevToyId;
            instBtn.style.display = isChild ? 'none' : '';
        }
        const chainBtn = toy.querySelector('.toy-chain-btn');
        if (chainBtn) {
            const hasOutgoing = (() => {
                if (toy.dataset.nextToyId) return true;
                if (toy.dataset.chainHasChild === '1') return true;
                if (parentHasChild.has(toy.id)) return true; // restored child still points at us
                // Fallback to edge model in case datasets are late/cleared.
                for (const edge of g_chainEdges.values()) {
                    if (edge.fromToyId === toy.id) return true;
                }
                return false;
            })(); // only disable when this toy already points to another
            const core = chainBtn.querySelector('.c-btn-core');
            if (core) {
            const icon = hasOutgoing ? 'T_ButtonEmpty.png' : 'T_ButtonExtend.png';
            core.style.setProperty('--c-btn-icon-url', `url('/assets/UI/${icon}')`);
            }
            if (hasOutgoing) {
                chainBtn.setAttribute('data-chaindisabled', '1');
            } else {
                chainBtn.removeAttribute('data-chaindisabled');
            }
            chainBtn.style.pointerEvents = hasOutgoing ? 'none' : 'auto';
            // Keep the icon visible even when locked by an existing outgoing link.
            chainBtn.classList.remove('toy-chain-btn-disabled');
            // Normalize the flag so future refreshes know this parent has a child
            if (hasOutgoing) {
                lockChainButton(toy, { hasChild: true });
            } else {
                lockChainButton(toy, { hasChild: false });
            }
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

const g_outlineSyncQueue = new Set();
let g_outlineSyncRaf = 0;
// Pulse bookkeeping (avoid per-pulse timeouts)
const g_pulseUntil = new Map(); // panelId -> untilMs

function queueBodyOutlineSync(panel) {
  if (!panel || !panel.isConnected) return;
  g_outlineSyncQueue.add(panel);
  if (g_outlineSyncRaf) return;
  g_outlineSyncRaf = requestAnimationFrame(() => {
    g_outlineSyncRaf = 0;
    for (const p of g_outlineSyncQueue) {
      try { syncBodyOutline(p); } catch {}
    }
    g_outlineSyncQueue.clear();
  });
}

function pulseToyBorder(panel, durationMs = 320) {
  if (!panel || !panel.isConnected) return;
  if (window.__PERF_DISABLE_PULSES) return;

  window.__PERF_PULSE_COUNT = (window.__PERF_PULSE_COUNT || 0) + 1;
  panel.classList.add('toy-playing');
  panel.classList.add('toy-playing-pulse');

  const until = performance.now() + durationMs;
  g_pulseUntil.set(panel.id, until);

  // Keep overlay geometry aligned, but do it batched.
  window.__PERF_OUTLINE_SYNC_COUNT = (window.__PERF_OUTLINE_SYNC_COUNT || 0) + 1;
  try { queueBodyOutlineSync(panel); } catch {}
}

function serviceToyPulses(nowMs) {
  if (g_pulseUntil.size === 0) return;
  for (const [id, until] of g_pulseUntil.entries()) {
    if (until > nowMs) continue;
    const panel = document.getElementById(id);
    if (panel) panel.classList.remove('toy-playing-pulse');
    g_pulseUntil.delete(id);
  }
}

function initToyChaining(panel) {
    if (!panel || !panel.isConnected) return;
    if (panel.dataset.tutorial === "true" || panel.classList?.contains("tutorial-panel")) {
        return;
    }
    // Guard: prevent duplicate chain buttons/listeners on the same panel.
    if (panel.dataset.chainInit === '1') return;
    panel.dataset.chainInit = '1';
    // Idempotency + dedupe: init can run more than once (refresh/restore/overview refreshDecorations).
    // We must never leave duplicate buttons behind.
    const existingBtns = Array.from(panel.querySelectorAll('.toy-chain-btn'));
    let extendBtn = existingBtns[0] || null;
    if (existingBtns.length > 1) {
        // Keep the first, remove the rest
        for (let i = 1; i < existingBtns.length; i++) {
            try { existingBtns[i].remove(); } catch {}
        }
    }
    // If a chained toy was cloned with a fixed height, clear it so focus changes
    // can collapse header/footer space correctly.
    if (panel.dataset.chainParent && panel.style.height) {
        panel.style.height = '';
    }

    if (!extendBtn) {
        extendBtn = document.createElement('button');
        extendBtn.className = 'c-btn toy-chain-btn';
        extendBtn.title = 'Extend with a new toy';
        extendBtn.style.setProperty('--c-btn-size', '65px');
        extendBtn.innerHTML = `<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core"></div>`;
    }
    // Force stable positioning regardless of overview layout changes
    // Alignment requirement: left edge of button touches right edge of the toy
    extendBtn.style.position = 'absolute';
    extendBtn.style.left = '100%';
    extendBtn.style.right = 'auto';
    extendBtn.style.zIndex = '10050';  // must be above ov-shield / drag surfaces
    
    const core = extendBtn.querySelector('.c-btn-core');
    if (core) {
        core.style.setProperty('--c-btn-icon-url', `url('/assets/UI/T_ButtonExtend.png')`);
    }
    // Ensure the button is vertically centered on the toy body, not the whole panel
    const updateChainBtnPos = () => {
      try {
        const body = panel.querySelector('.toy-body');
        if (!body) return;
        // Position via absolute top in panel coords so it matches the connector Y
        const targetTop = (body.offsetTop || 0) + (body.offsetHeight || 0) / 2;
        extendBtn.style.top = `${targetTop}px`;
        // No X translation: left edge touches panel edge; only center vertically.
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

    if (CHAIN_DEBUG) {
      console.log('[chain][initToyChaining] attach', {
        panel: panel.id,
        hasExisting: !!panel.querySelector(':scope > .toy-chain-btn'),
        chainInitFlag: panel.dataset.chainInit
      });
    }
    panel.appendChild(extendBtn);
    panel.style.overflow = 'visible'; // Ensure the button is not clipped by the panel's bounds.

    // Hover fallback: in some focus-edit/unfocused states CSS :hover can be suppressed by pointer-event guards.
    // We mirror the hover state with a class so the button still highlights reliably.
    if (!extendBtn.__hoverWired) {
      extendBtn.__hoverWired = true;

      extendBtn.addEventListener('pointerenter', () => {
        if (extendBtn.getAttribute('data-chaindisabled') === '1' || extendBtn.classList.contains('toy-chain-btn-disabled')) return;
        extendBtn.classList.add('is-hover');
      }, { passive: true });

      extendBtn.addEventListener('pointerleave', () => {
        extendBtn.classList.remove('is-hover');
      }, { passive: true });

      // Safety: clear if capture ends oddly.
      extendBtn.addEventListener('pointerup', () => {
        extendBtn.classList.remove('is-hover');
      }, { passive: true });

      extendBtn.addEventListener('pointercancel', () => {
        extendBtn.classList.remove('is-hover');
      }, { passive: true });
    }

    // Ensure the initial icon/disable state is correct even before the global sync runs.
    const syncChainBtnImmediate = () => {
        const btn = extendBtn;
        const hasChild = !!panel.dataset.nextToyId ||
            panel.dataset.chainHasChild === '1' ||
            Array.from(document.querySelectorAll('.toy-panel[id]')).some(el => (el.dataset.prevToyId || el.dataset.chainParent) === panel.id);
        const coreEl = btn.querySelector('.c-btn-core');
        if (coreEl) {
            const icon = hasChild ? 'T_ButtonEmpty.png' : 'T_ButtonExtend.png';
            coreEl.style.setProperty('--c-btn-icon-url', `url('../assets/UI/${icon}')`);
        }
        if (hasChild) {
            btn.setAttribute('data-chaindisabled', '1');
            btn.style.pointerEvents = 'none';
        } else {
            btn.removeAttribute('data-chaindisabled');
            btn.style.pointerEvents = 'auto';
        }
    };
    syncChainBtnImmediate();
    requestAnimationFrame(syncChainBtnImmediate);

    // Sync initial icon/enable state with existing chain status.
    try { updateAllChainUIs(); } catch {}

    extendBtn.addEventListener('pointerdown', (e) => {
        if (typeof e.button === 'number' && e.button !== 0) return;
        // Chain button must win the interaction on first click.
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        try { e.target?.releasePointerCapture?.(e.pointerId); } catch {}

        try {
          if (CHAIN_OV_DBG) {
            const board = document.getElementById('board');
            const overviewActive =
              !!(window.__overviewMode?.isActive?.() ||
                 board?.classList?.contains('board-overview') ||
                 document.body?.classList?.contains('overview-mode'));

            const btn = extendBtn;
            const shield = panel.querySelector('.ov-shield');
            const btnCS = btn ? getComputedStyle(btn) : null;
            const shieldCS = shield ? getComputedStyle(shield) : null;

            console.log('[CHAIN][ov][extendBtn:pointerdown]', {
              overviewActive,
              panelId: panel.id,
              target: e.target?.className || e.target?.tagName,
              pointerType: e.pointerType,
              button: e.button,
              btn_pe: btnCS?.pointerEvents,
              btn_z: btnCS?.zIndex,
              shield_exists: !!shield,
              shield_pe: shieldCS?.pointerEvents,
              shield_z: shieldCS?.zIndex,
            });
            try {
              const x = e.clientX, y = e.clientY;
              const el = document.elementFromPoint(x, y);
              const path = (typeof e.composedPath === 'function') ? e.composedPath() : [];
              console.log('[CHAIN][ov][hitTest]', {
                x, y,
                elementFromPoint: el ? (el.className || el.tagName) : null,
                elementFromPoint_id: el?.id || null,
                elementFromPoint_pe: el ? getComputedStyle(el).pointerEvents : null,
                composedPathTop: path.slice(0, 6).map(n => n?.className || n?.tagName),
              });
            } catch {}
          }
        } catch {}
        if (CHAIN_OV_DBG) {
          dbgOvEv('[OVDBG][chainBtn:pointerdown]', e, panel.id);
          console.log('[CHAIN][ov][extendBtn:gate]', {
            panelId: panel.id,
            chainDisabled: extendBtn.dataset.chainDisabled,
            nextToyId: panel.dataset.nextToyId || null,
            chainHasChild: panel.dataset.chainHasChild || null,
          });
        }
        if (extendBtn.dataset.chainDisabled === '1' || panel.dataset.nextToyId) {
            return;
        }
        const tStart = performance.now();
        if (CHAIN_OV_DBG) {
          dbgPanelRect(panel, 'before-chain-create');
        }

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
        // Hint the focus animator to scale in on first focus.
        newPanel.dataset.spawnScaleHint = '0.75';
        
        if (sourcePanel.dataset.instrument) {
            newPanel.dataset.instrument = sourcePanel.dataset.instrument;
            if (sourcePanel.dataset.instrumentPersisted) {
                newPanel.dataset.instrumentPersisted = sourcePanel.dataset.instrumentPersisted;
            }
        }

        const board = document.getElementById('board');
        const boardScale = window.__boardScale || 1;
        let sourceWidth = sourcePanel.offsetWidth || (sourcePanel.getBoundingClientRect().width / boardScale);
        let sourceHeight = sourcePanel.offsetHeight || (sourcePanel.getBoundingClientRect().height / boardScale);

        newPanel.style.width = `${sourceWidth}px`;
        // Height is only needed during the initial placement. Drop it after boot
        // so chained toys can collapse their headers/footers when unfocused.
        newPanel.style.height = `${sourceHeight}px`;
        newPanel.style.position = 'absolute';
        // Cache "normal mode" placement (board/world coords).
        // IMPORTANT: In overview, getBoundingClientRect() is in SCREEN space under a different zoom.
        // So prefer the panel's existing world-space left/top if available.
        let srcLeft = parseFloat(sourcePanel.style.left);
        let srcTop  = parseFloat(sourcePanel.style.top);

        const overviewActive =
            !!(window.__overviewMode?.isActive?.() ||
               document.querySelector('#board')?.classList?.contains('board-overview') ||
               document.body?.classList?.contains('overview-mode'));

        if (overviewActive) {
            const ovState = window.__overviewMode?.state;
            const snap = ovState?.positions?.get?.(sourcePanel.id);
            if (snap && Number.isFinite(snap.left) && Number.isFinite(snap.top)) {
                srcLeft = snap.left;
                srcTop = snap.top;
                if (Number.isFinite(snap.width) && snap.width > 0) sourceWidth = snap.width;
                if (Number.isFinite(snap.height) && snap.height > 0) sourceHeight = snap.height;
            }
        }

        if (!Number.isFinite(srcLeft) || !Number.isFinite(srcTop)) {
            // Fallback: derive from rects (best-effort)
            const sourceRect = sourcePanel.getBoundingClientRect();
            const boardRect = board?.getBoundingClientRect?.();
            const boardScale = window.__boardScale || 1;
            if (boardRect) {
              srcLeft = (sourceRect.left - boardRect.left) / boardScale;
              srcTop  = (sourceRect.top - boardRect.top) / boardScale;
            } else {
              srcLeft = sourceRect.left / boardScale;
              srcTop  = sourceRect.top / boardScale;
            }
        }

        const normalLeft = srcLeft + sourceWidth + CHAIN_SPAWN_GAP;
        const normalTop  = srcTop;

        newPanel.style.left = `${normalLeft}px`;
        newPanel.style.top  = `${normalTop}px`;

        // If Overview is active, register this panel's normal position so it restores correctly on exit,
        // and ensure overview decorations get applied.
        const overviewActiveAtCreate = overviewActive;
        const oldNextId = sourcePanel.dataset.nextToyId || null;

        // Lock the chain immediately to avoid multi-click races before async init completes.
        sourcePanel.dataset.nextToyId = newPanel.id;
        newPanel.dataset.prevToyId = sourcePanel.id;
        lockChainButton(sourcePanel, { hasChild: true });

        if (overviewActive) {
            try {
                // Ensure this new toy has a saved "pre-overview" position so it won't snap on zoom-in.
                const st = window.__overviewMode?.state;
                if (st?.positions?.set) {
                    st.positions.set(newPanel.id, {
                        left: normalLeft,
                        top: normalTop,
                        width: sourceWidth,
                        height: sourceHeight
                    });
                }
                if (typeof localStorage !== 'undefined' && localStorage.getItem('OV_NUDGE_DBG') === '1') {
                    console.log('[OV_NUDGE][chain-create]', {
                        parent: sourcePanel.id,
                        child: newPanel.id,
                        parentTop: sourcePanel.style.top,
                        parentBodyOffset: sourcePanel.querySelector('.toy-body')?.offsetTop || 0,
                        childTop: newPanel.style.top,
                        childBodyOffset: newPanel.querySelector('.toy-body')?.offsetTop || 0
                    });
                }
            } catch (err) {
                console.warn('[chain][overview] failed to register new panel in overview positions', err);
            }

            // Add an immediate input shield so the new toy can't be interacted with in overview
            // (overview-mode will also add/relocate this later).
            try {
                if (!newPanel.querySelector('.ov-shield')) {
                    const shield = document.createElement('div');
                    shield.className = 'ov-shield';
                    newPanel.appendChild(shield);
                }
            } catch {}
        }

        board.appendChild(newPanel);
        // Place the new panel immediately using the standard gap, avoiding later snap adjustments.
        const initialPlacement = ensurePanelSpawnPlacement(newPanel, {
            baseLeft: normalLeft,
            baseTop: normalTop,
            fallbackWidth: sourceWidth,
            fallbackHeight: sourceHeight,
        });
        syncOverviewPosition(newPanel);
        if (!overviewActiveAtCreate && initialPlacement?.changed) {
            try { persistToyPosition(newPanel); } catch (err) { console.warn('[chain] persistToyPosition failed', err); }
        }
        delete newPanel.dataset.spawnAutoManaged;
        delete newPanel.dataset.spawnAutoLeft;
        delete newPanel.dataset.spawnAutoTop;
        g_lastChainedDebugPanel = newPanel;
        if (CHAIN_OV_DBG) {
          dbgPanelRect(newPanel, 'after-chain-create');
        }

        // Defer the rest of the initialization to the next event loop cycle.
        // This gives the browser time to calculate the new panel's layout,
        // which is crucial for the toy's internal canvases to be sized correctly.
        setTimeout(() => {
            if (!newPanel.isConnected) return; // Guard against panel being removed before init

            initializeNewToy(newPanel);
            initToyChaining(newPanel); // Give the new toy its own extend button
            // If Overview is active, apply overview decorations to include this newly created toy
            // (shield, collapsed header/footer behavior, outline sync, etc.)
            try {
                if (window.__overviewMode?.isActive?.()) {
                    window.__overviewMode.refreshDecorations?.();
                }
            } catch (err) {
                console.warn('[chain][overview] refreshDecorations failed', err);
            }
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

            // Always log detailed state for debugging when creating chain links.
            const btn = sourcePanel.querySelector('.toy-chain-btn');
            const core = btn?.querySelector('.c-btn-core');
            console.log('[chain][new-child]', {
              parent: sourcePanel.id,
              child: newPanel.id,
              oldNextId: oldNextId || null,
              chainHasChild: sourcePanel.dataset.chainHasChild || null,
              btnDisabledAttr: btn?.getAttribute('data-chaindisabled') || null,
              btnHasDisabledClass: btn?.classList?.contains?.('toy-chain-btn-disabled') || false,
              btnComputedIcon: core ? getComputedStyle(core).getPropertyValue('--c-btn-icon-url') : null,
            });

            // Immediately swap the source "+" texture to the empty state now that it has an outgoing link.
            const sourceChainCore = sourcePanel.querySelector('.toy-chain-btn .c-btn-core');
            if (sourceChainCore) {
                sourceChainCore.style.setProperty('--c-btn-icon-url', `url('/assets/UI/T_ButtonEmpty.png')`);
                // Force the pseudo-element to update after styles apply
                requestAnimationFrame(() => {
                    sourceChainCore.style.setProperty('--c-btn-icon-url', `url('/assets/UI/T_ButtonEmpty.png')`);
                });
            }
            // Lock the source button right away so the user sees it disable without waiting
            const sourceChainBtn = sourcePanel.querySelector('.toy-chain-btn');
            if (sourceChainBtn) {
                sourceChainBtn.setAttribute('data-chaindisabled', '1');
                sourceChainBtn.style.pointerEvents = 'none';
                sourceChainBtn.classList.add('toy-chain-btn-disabled');
                // Nudge a repaint to avoid blank icons when chaining immediately after refresh
                sourceChainBtn.getBoundingClientRect();
            }

            if (oldNextId) {
                const oldNextPanel = document.getElementById(oldNextId);
                newPanel.dataset.nextToyId = oldNextId;
                if (oldNextPanel) oldNextPanel.dataset.prevToyId = newPanel.id;
            }

            const finalizePlacement = () => {
                // If this toy was created while overview was active, skip auto-placement and auto-focus
                // to avoid post-create snapping when zooming back in.
                if (overviewActiveAtCreate) {
                    newPanel.style.height = '';
                    try {
                        persistToyPosition(newPanel);
                    } catch (err) {
                        console.warn('[chain] persistToyPosition failed', err);
                    }
                    syncOverviewPosition(newPanel);
                    updateChains();
                    updateAllChainUIs();
                    delete newPanel.dataset.spawnAutoManaged;
                    delete newPanel.dataset.spawnAutoLeft;
                    delete newPanel.dataset.spawnAutoTop;
                    return;
                }

                // Let the layout return to natural height so unfocused chained toys
                // don't retain the old header/footer space.
                newPanel.style.height = '';

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
                // Always focus the newly created toy, even if the source toy was unfocused.
                const focusNew = () => {
                    if (newPanel.isConnected && !g_isRestoringSnapshot && !g_suppressBootFocus) {
                        setToyFocus(newPanel, { center: true });
                    }
                };
                focusNew();
                // Reinforce once more on the next frame to override any existing focus state.
                raf(() => focusNew());
            };

            const raf = window.requestAnimationFrame?.bind(window) ?? ((fn) => setTimeout(fn, 16));
            raf(() => raf(finalizePlacement));
        }, 0);
        try {
            const dt = performance.now() - tStart;
            console.log('[CHAIN][perf] chained toy created in', dt.toFixed(1), 'ms');
        } catch {}
    }, true);
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

function isPanelCenterOffscreen(panel) {
    if (!panel || typeof panel.getBoundingClientRect !== 'function') return false;
    const viewport = panel.closest?.('.board-viewport') || document.querySelector('.board-viewport') || document.documentElement;
    if (!viewport) return false;
    const rect = panel.getBoundingClientRect();
    const viewRect = viewport.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    return cx < viewRect.left || cx > viewRect.right || cy < viewRect.top || cy > viewRect.bottom;
}

function hintOffscreenSpawn(panel) {
    if (!panel || !panel.isConnected) return;
    const origin = document.querySelector('.toy-spawner-toggle') || document.querySelector('.toy-spawner-dock');
    if (!origin || !origin.isConnected) return;
    try {
        startParticleStream(origin, panel, {
            layer: 'front',
            skipBurst: true,
            durationMs: 1000,
            suppressGuideTapAck: true, // Visual hint only; don't mark guide as tapped
        });
    } catch (err) {
        console.warn('[createToyPanelAt] offscreen hint failed', err);
    }
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

function syncOverviewPosition(panel) {
    try {
        if (!panel) return;
        if (!window.__overviewMode?.isActive?.()) return;
        const st = window.__overviewMode?.state;
        if (!st?.positions?.set) return;
        const id = panel.id || panel.dataset.toyid || panel.dataset.toy;
        if (!id) return;
        const cs = getComputedStyle(panel);
        let left = parseFloat(panel.style.left || cs.left || '0');
        let top = parseFloat(panel.style.top || cs.top || '0');
        if (!Number.isFinite(left)) left = 0;
        if (!Number.isFinite(top)) top = 0;
        const delta = parseFloat(panel.dataset?.ovBodyDelta || '0') || 0;
        const baseTop = parseFloat(panel.dataset?.ovBaseTop || '');
        const storedTop = Number.isFinite(baseTop) ? baseTop : (top - delta);
        const width = Number.isFinite(panel.offsetWidth) ? panel.offsetWidth : parseFloat(cs.width || '0') || 0;
        const height = Number.isFinite(panel.offsetHeight) ? panel.offsetHeight : parseFloat(cs.height || '0') || 0;
        st.positions.set(id, { left, top: storedTop, width, height });
    } catch {}
}

function createToyPanelAt(toyType, { centerX, centerY, instrument, autoCenter } = {}) {
    const type = String(toyType || '').toLowerCase();
    if (!type || !toyInitializers[type]) {
        console.warn('[createToyPanelAt] unknown toy type', toyType);
        return null;
    }
    const board = document.getElementById('board');
    if (!board) return null;
    const shouldHintOffscreen = !!autoCenter;
    let chosenInstrument = instrument;
    if (!chosenInstrument) {
        const theme = getSoundThemeKey?.() || '';
        const used = collectUsedInstruments();
        const picked = pickInstrumentForToy(type, { theme, usedIds: used });
        if (picked) chosenInstrument = picked;
    }

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

    if (chosenInstrument) {
        panel.dataset.instrument = chosenInstrument;
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
    // Hint the focus animator to scale in like a focus transition on first render.
    panel.dataset.spawnScaleHint = '0.75';

    const initialPlacement = ensurePanelSpawnPlacement(panel, {
        baseLeft: left,
        baseTop: top,
        fallbackWidth: width,
        fallbackHeight: height,
    });
    if (initialPlacement?.changed) {
        // The helper already wrote the updated position to the style attributes.
    }
    syncOverviewPosition(panel);
    persistToyPosition(panel);

    setTimeout(() => {
        if (!panel.isConnected) return;
        try { initializeNewToy(panel); } catch (err) { console.warn('[createToyPanelAt] init failed', err); }
        try { initToyChaining(panel); } catch (err) { console.warn('[createToyPanelAt] chain init failed', err); }

        const finalizePlacement = () => {
            const followUp = ensurePanelSpawnPlacement(panel, {
                fallbackWidth: width,
                fallbackHeight: height,
                skipIfMoved: true,
            });
            if (followUp?.changed) {
                persistToyPosition(panel);
            }
            syncOverviewPosition(panel);
            try { updateChains(); updateAllChainUIs(); } catch (err) { console.warn('[createToyPanelAt] chain update failed', err); }
            try { applyStackingOrder(); } catch (err) { console.warn('[createToyPanelAt] stacking failed', err); }
            try { window.Persistence?.markDirty?.(); } catch (err) { console.warn('[createToyPanelAt] mark dirty failed', err); }
            delete panel.dataset.spawnAutoManaged;
            delete panel.dataset.spawnAutoLeft;
            delete panel.dataset.spawnAutoTop;
            const overviewActive = !!(window.__overviewMode?.isActive?.() ||
                document.querySelector('#board')?.classList?.contains('board-overview') ||
                document.body?.classList?.contains('overview-mode'));
            if (panel.isConnected && !overviewActive) {
                setToyFocus(panel, { center: true });
            }
            if (shouldHintOffscreen) {
                const rafCheck = window.requestAnimationFrame?.bind(window) ?? ((fn) => setTimeout(fn, 16));
                rafCheck(() => {
                    if (panel.isConnected && isPanelCenterOffscreen(panel)) {
                        hintOffscreenSpawn(panel);
                    }
                });
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
            // Break the outgoing link entirely; do NOT auto-bridge to the next toy.
            delete prev.dataset.nextToyId;
            // Recompute child flag for the previous node, ignoring the panel being deleted
            const stillHasChild = Array.from(document.querySelectorAll('.toy-panel[id]')).some(el =>
                el.id !== panelId && (el.dataset.prevToyId || el.dataset.chainParent) === prev.id
            );
            lockChainButton(prev, { hasChild: stillHasChild });
        }
    }
    if (nextId) {
        const next = document.getElementById(nextId);
        if (next) {
            // Clear upstream pointer so the next toy stands alone.
            if (next.dataset.prevToyId === panelId) delete next.dataset.prevToyId;
            if (next.dataset.chainParent === panelId) delete next.dataset.chainParent;
        }
    }

    delete panel.dataset.prevToyId;
    delete panel.dataset.nextToyId;

    panel.remove();

    // Remove any chain connectors involving this toy
    try {
        removeChainEdgesForToy(panelId);
    } catch (err) {
        console.warn('[destroyToyPanel] edge cleanup failed', err);
    }

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
        enableExperimentalToys: () => setExperimentalEnabled(true),
        disableExperimentalToys: () => setExperimentalEnabled(false),
        isExperimentalToysEnabled: () => isExperimentalEnabled(),
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

function getChainAnchor(panel, side = 'right') {
  // Board-space coordinates of where the connector should start/end, accounting for scale transforms.
  const left = (parseFloat(panel.style.left) || 0);
  const top  = (parseFloat(panel.style.top)  || 0);
  const scale = panel.classList?.contains('toy-unfocused') ? 0.75 : 1;
  const panelW = panel.offsetWidth || 0;
  const panelH = panel.offsetHeight || 0;
  const cx = left + panelW * 0.5;
  const cy = top  + panelH * 0.5;
  const halfW = (panelW * 0.5) * scale;
  const halfH = (panelH * 0.5) * scale;

  const body = panel.querySelector('.toy-body');
  let bodyOffsetY = 0;
  if (body) {
    const bodyTop = body.offsetTop || 0;
    const bodyH   = body.offsetHeight || panelH || 0;
    bodyOffsetY = (bodyTop + bodyH * 0.5) - (panelH * 0.5);
  }

  const x = side === 'left' ? (cx - halfW) : (cx + halfW);
  const y = cy + bodyOffsetY * scale;
  return { x, y };
}

function getConnectorAnchorPoints(fromPanel, toPanel) {
  if (!fromPanel || !toPanel) return null;
  const a1 = getChainAnchor(fromPanel, 'right');
  const a2 = getChainAnchor(toPanel, 'left');
  return { a1, a2 };
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

function drawChains(forceFull = false) {
  if (window.__PERF_DISABLE_CHAINS) return;
  if (!CHAIN_FEATURE_ENABLE_CONNECTOR_DRAW) return;
  if (!chainCanvas || !chainCtx) return;

  const width = g_boardClientWidth || 0;
  const height = g_boardClientHeight || 0;
  const { scale = 1, tx = 0, ty = 0 } = getViewportTransform() || {};
  const safeScale = (Number.isFinite(scale) && Math.abs(scale) > 1e-6) ? scale : 1;

  // Track the world-space rect covered by the chain canvas so we can reposition it
  // when the camera pans, even if the viewport size stays the same.
  const prevWorldLeft = g_chainCanvasWorldLeft;
  const prevWorldTop  = g_chainCanvasWorldTop;

  // Position the chain canvas in WORLD space so that after board transform
  // it exactly covers the visible viewport.
  const tl = screenToWorld({ x: 0, y: 0 });
  const worldLeft = tl.x;
  const worldTop  = tl.y;

  // Canvas CSS size in WORLD units so that after scaling it matches viewport pixels.
  const worldW = width / safeScale;
  const worldH = height / safeScale;
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
  const sizeChanged = forceFull || canvasW !== worldW || canvasH !== worldH;
  const positionChanged = worldLeft !== prevWorldLeft || worldTop !== prevWorldTop;

  if (sizeChanged) {
    const tResizeStart = performance.now();

    chainCanvas.width = worldW * dpr;
    chainCanvas.height = worldH * dpr;
    tAfterResize = performance.now();

    if (CHAIN_DEBUG) {
      console.log('[CHAIN][perf][resize] chainCanvas resized', 'board=', width, 'x', height, 'canvas=', chainCanvas.width, 'x', chainCanvas.height, 'cost=', (tAfterResize - tResizeStart).toFixed(2), 'ms')
    }
  } else {
    tAfterResize = performance.now();
  }

  // Always update the canvas positioning if either the size or world origin changed.
  if (sizeChanged || positionChanged) {
    chainCanvas.style.left = `${worldLeft}px`;
    chainCanvas.style.top = `${worldTop}px`;
    chainCanvas.style.width = `${worldW}px`;
    chainCanvas.style.height = `${worldH}px`;
    g_chainCanvasWorldLeft = worldLeft;
    g_chainCanvasWorldTop = worldTop;
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
  chainCtx.setTransform(dpr, 0, 0, dpr, -worldLeft * dpr, -worldTop * dpr);

  const now = performance.now();
  // You can tweak these to taste. Thicker curves = slightly more GPU work.
  const baseWidth = 4;
  const pulseExtraWidth = 2;

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
    const handleLength = Math.max(28, dist * 0.25); // horizontal-only handles

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
let g_chainRedrawPendingFull = false;
let g_chainRedrawTimer = 0;
function scheduleChainRedraw() {
    if (window.__PERF_DISABLE_CHAINS) return;
    if (!chainCanvas || !chainCtx) return;
    if (g_chainRedrawScheduled) {
        g_chainRedrawPendingFull = true;
        return;
    }
    g_chainRedrawScheduled = true;

    const raf = window.requestAnimationFrame?.bind(window) ?? (fn => setTimeout(fn, 16));
    raf(() => {
        g_chainRedrawScheduled = false;
        const doFull = g_chainRedrawPendingFull;
        g_chainRedrawPendingFull = false;
        try {
            drawChains(doFull);
        } catch (err) {
        console.warn('[CHAIN] scheduleChainRedraw failed', err);
    }
  });
}

// Keep chain connectors in sync with camera pans/zooms by redrawing on viewport changes.
(function setupChainViewportSync(){
  try {
    const handler = (payload = {}) => {
      if (!CHAIN_FEATURE_ENABLE_CONNECTOR_DRAW) return;
      // Always redraw once per frame; scheduleChainRedraw is already throttled.
      scheduleChainRedraw();
    };
    handler.__zcName = 'chain-viewport-sync';
    onZoomChange(namedZoomListener('main:zoom-handler', handler));
  } catch (err) {
    if (CHAIN_DEBUG) {
      console.warn('[CHAIN] viewport sync init failed', err);
    }
  }
})();
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
          g_chainRedrawPendingFull = true;
          scheduleChainRedraw();
      }
  } catch (err) {
      if (CHAIN_DEBUG) {
          console.warn('[CHAIN][perf] rebuildChainSegments/draw failed', err);
      }
  }
  try { updateAllChainUIs(); } catch {}
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
  window.addEventListener('overview:transition', (e) => {
    // When exiting overview, any active pulse should jump back to the full panel outline.
    // Force-restart the pulse animation so the box-shadow is recalculated on the outer frame.
    if (e?.detail?.active === false) {
      const pulsePanels = Array.from(document.querySelectorAll('.toy-panel.toy-playing-pulse'));
      pulsePanels.forEach((panel) => {
        panel.classList.remove('toy-playing-pulse');
        try { panel.offsetWidth; } catch {}
        panel.classList.add('toy-playing-pulse');
      });
    }
  }, { passive: true });
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
  const prevActiveToyIds = new Set();
  let prevHadActiveToys = false;

  function step(){
    const frameStart = performance.now();
    // Clear expired pulse classes without timers
    try { serviceToyPulses(frameStart); } catch {}

    // Keep outline-related CSS vars synced with zoom; heavy geometry sync happens on demand.
    try {
      window.__updateOutlineScaleIfNeeded && window.__updateOutlineScaleIfNeeded();
    } catch {}

    const info = getLoopInfo();

    const running = isRunning();

    // Screen-space "home" anchor: gradient + particle landmark.
    // Keep this cheap and frame-synced by piggybacking on the main scheduler rAF.
    try { tickBoardAnchor({ nowMs: frameStart, loopInfo: info, running }); } catch {}
    const hasChains = g_chainState && g_chainState.size > 0;

    if (CHAIN_FEATURE_ENABLE_SCHEDULER && running && hasChains){
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
      const hasActiveToys = activeToyIds.size > 0;

      const activeChanged = (() => {
        if (hasActiveToys !== prevHadActiveToys) return true;
        if (activeToyIds.size !== prevActiveToyIds.size) return true;
        for (const id of activeToyIds) {
          if (!prevActiveToyIds.has(id)) return true;
        }
        return false;
      })();

      if (CHAIN_FEATURE_ENABLE_MARK_ACTIVE && hasActiveToys && activeChanged) {
        document.querySelectorAll('.toy-panel[id]').forEach(toy => {
          const isActive = activeToyIds.has(toy.id);
          const current = toy.dataset.chainActive === 'true';

          // If this toy just lost chain focus, drop any lingering pulse so the flash
          // doesn't bleed into the next active link.
          if (current && !isActive) {
            try { g_pulseUntil.delete(toy.id); } catch {}
            try { toy.classList.remove('toy-playing-pulse'); } catch {}
            try { toy.__pulseHighlight = 0; toy.__pulseRearm = false; } catch {}
          }

          if (current !== isActive) {
            toy.dataset.chainActive = isActive ? 'true' : 'false';
          }
        });

        prevActiveToyIds.clear();
        for (const id of activeToyIds) prevActiveToyIds.add(id);
        prevHadActiveToys = hasActiveToys;
      }
      const tActiveEnd = performance.now();
      if (CHAIN_DEBUG && (tActiveEnd - tActiveStart) > CHAIN_DEBUG_LOG_THRESHOLD_MS) {
        console.log('[CHAIN][perf] mark-active', (tActiveEnd - tActiveStart).toFixed(2), 'ms', 'activeToyCount=', activeToyIds.size);
      }

      // --- Phase C: per-toy sequencer stepping for active chain links ---
      const tStepStart = performance.now();
      if (CHAIN_FEATURE_ENABLE_SEQUENCER && hasActiveToys) {
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

    } else if (!running) {
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
  const viewport = getViewportElement();
  if (viewport) {
    g_boardClientWidth = viewport.clientWidth || 0;
    g_boardClientHeight = viewport.clientHeight || 0;
  }
  // console.log('[viewport] element=', viewport, 'client=', g_boardClientWidth, g_boardClientHeight);

  // Start global FPS HUD once the board exists
  try {
    initFpsHud();
  } catch (err) {
    console.warn('[FPS] init failed', err);
  }

  window.addEventListener('focus:change', () => {
    const duration = 1000; // ms, same as focus animation
    const startTime = performance.now();

    function animateConnectors(now) {
        const elapsed = now - startTime;
        
        try {
            rebuildChainSegments();
            g_chainRedrawPendingFull = true;
            scheduleChainRedraw();
        } catch(e) {
            if (CHAIN_DEBUG) console.warn('[CHAIN] animation frame rebuild failed', e);
        }

        if (elapsed < duration) {
            requestAnimationFrame(animateConnectors);
        } else {
            // One final redraw for perfect alignment at the end.
            try {
                rebuildChainSegments();
                g_chainRedrawPendingFull = true;
                scheduleChainRedraw();
            } catch(e) {
                if (CHAIN_DEBUG) console.warn('[CHAIN] final animation frame rebuild failed', e);
            }
        }
    }
    requestAnimationFrame(animateConnectors);
  });

  // Hide fullscreen button while FPS HUD sits in the top-right
  try {
    const fsBtn = document.getElementById('fullscreenBtn');
    if (fsBtn) fsBtn.style.display = 'none';
  } catch {}

  window.addEventListener('resize', () => {
    const vp = getViewportElement();
    if (!vp) return;

    // Cache viewport client size for the chain canvas (NOT the board size)
    g_boardClientWidth = vp.clientWidth || 0;
    g_boardClientHeight = vp.clientHeight || 0;

    // Rebuild connector geometry + redraw once, event-driven, off the hot path
    if (CHAIN_FEATURE_ENABLE_CONNECTOR_DRAW) {
      try {
        rebuildChainSegments();
        g_chainRedrawPendingFull = true;
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
      g_chainRedrawPendingFull = true;
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
      mainLog('[AUDIO] samples loaded');
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

        // IMPORTANT: initialise viewport size immediately so drawChains() doesn't early-out.
        try {
          const vp = getViewportElement();
          g_boardClientWidth = vp?.clientWidth || 0;
          g_boardClientHeight = vp?.clientHeight || 0;
        } catch {}
        try {
            updateChains();
            // Force one draw pass now that size is known.
            g_chainRedrawPendingFull = true;
            scheduleChainRedraw();
        } catch (err) {
            if (CHAIN_DEBUG) {
                console.warn('[CHAIN] initial updateChains failed', err);
            }
        }
    }

    // Screen-space "home" anchor (can be disabled via window.__MT_ANCHOR_DISABLED or localStorage.mt_anchor_enabled='0')
    try { initBoardAnchor(); } catch (err) { console.warn('[ANCHOR] init failed', err); }

    bootTopbar();
    let restored = false;
    try{
      g_isRestoringSnapshot = true;
      restored = !!tryRestoreOnBoot();
    }catch{} finally {
      g_isRestoringSnapshot = false;
    }
    bootGrids();
    bootDrawGrids();
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="refresh"], .btn-refresh, [data-refresh]');
      if (btn) {
        try { window.Persistence?.flushBeforeRefresh?.(); } catch {}
        try { mainLog('[MAIN] refresh requested -> flushed autosave'); } catch {}
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
    // Run a couple of follow-up syncs after layout settles (fonts/DOM can land late)
    requestAnimationFrame(() => { try { syncAllBodyOutlines(); } catch {} });
    setTimeout(() => { try { syncAllBodyOutlines(); } catch {} }, 160);
    // If overview was restored on load, reapply its decorations once toys exist.
    requestAnimationFrame(() => {
      try {
        if (overviewMode?.isActive?.()) {
          overviewMode.refreshDecorations?.();
          syncAllBodyOutlines();
        }
      } catch {}
    });
    updateAllChainUIs(); // Set initial instrument button visibility
    requestAnimationFrame(() => updateAllChainUIs()); // After any late-restored links land
    setTimeout(() => { try { updateAllChainUIs(); } catch {} }, 400); // Final pass after async inits settle
    setTimeout(() => { try { updateAllChainUIs(); } catch {} }, 900); // One more pass to cover late restores

    try { restoreFocusFromStorage(); } catch {}
  // Reassert focus state after any late restores to avoid stray persisted classes.
  setTimeout(() => { try { enforceFocusState(); } catch {} }, 120);
  setTimeout(() => { try { enforceFocusState(); } catch {} }, 380);

    const handleChainLinkedButtonState = (e) => {
      const parentId = e?.detail?.parent || e?.detail?.parentId;
      if (!parentId) return;
      const parent = document.getElementById(parentId);
      if (!parent) return;
      lockChainButton(parent, { hasChild: true });
      // Log the state right when the event fires to diagnose refresh issues
      try {
        const btn = parent.querySelector('.toy-chain-btn');
        const core = btn?.querySelector('.c-btn-core');
        console.log('[chain][event:linked]', {
          parent: parent.id,
          chainHasChild: parent.dataset.chainHasChild || null,
          btnDisabledAttr: btn?.getAttribute('data-chaindisabled') || null,
          btnHasDisabledClass: btn?.classList?.contains?.('toy-chain-btn-disabled') || false,
          btnComputedIcon: core ? getComputedStyle(core).getPropertyValue('--c-btn-icon-url') : null,
        });
      } catch {}
    };

    document.addEventListener('chain:linked', handleChainLinkedButtonState, true);
    document.addEventListener('chain:linked', () => {
      try {
        // Defer to the next frame so the new child is in the DOM and datasets are set.
        const raf = window.requestAnimationFrame?.bind(window) ?? (fn => setTimeout(fn, 16));
        raf(() => updateAllChainUIs());
      } catch {}
    }, true);
    document.addEventListener('chain:unlinked', () => { try { updateAllChainUIs(); } catch {} }, true);
    try {
      rebuildChainSegments();
      g_chainRedrawPendingFull = true;
      scheduleChainRedraw();
    } catch (err) {
      if (CHAIN_DEBUG) {
        console.warn('[CHAIN] initial redraw failed', err);
      }
    }
    /*
    if (!g_focusedToyId) {
      const firstPanel = document.querySelector('.toy-panel');
      if (firstPanel) {
        setToyFocus(firstPanel, { center: false });
      }
    }
    */

    // On load, if no toys are on screen, snap to the nearest one.
    const allPanels = Array.from(document.querySelectorAll('.toy-panel'));
    if (allPanels.length > 0 && !g_focusedToyId && !window.__toyFocused && !isFocusEditingEnabled() && !g_suppressBootFocus && !g_isRestoringSnapshot) {
      const allOffscreen = allPanels.every(isPanelCenterOffscreen);
      if (allOffscreen) {
        const viewportCenter = window.getViewportCenterWorld && window.getViewportCenterWorld();
        if (viewportCenter) {
          let closestPanel = null;
          let minDistance = Infinity;
          allPanels.forEach(panel => {
            const panelCenter = window.getWorldCenter && window.getWorldCenter(panel);
            if (panelCenter) {
              const dx = panelCenter.x - viewportCenter.x;
              const dy = panelCenter.y - viewportCenter.y;
              const distance = Math.sqrt(dx * dx + dy * dy);
              if (distance < minDistance) {
                minDistance = distance;
                closestPanel = panel;
              }
            }
          });
          if (closestPanel) {
            window.centerBoardOnElementSlow && window.centerBoardOnElementSlow(closestPanel);
          }
        }
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
      g_chainRedrawPendingFull = true;
      scheduleChainRedraw();
    } catch (err) {
      if (CHAIN_DEBUG) {
        console.warn('[CHAIN] overview:transition redraw failed', err);
      }
    }
  }, { passive: true });
  // After overview commit, run a delayed rebuild to catch any late layout/scale snaps.
  window.addEventListener('overview:change', () => {
    const raf = window.requestAnimationFrame?.bind(window) ?? ((fn) => setTimeout(fn, 16));
    raf(() => {
      try {
        rebuildChainSegments();
        g_chainRedrawPendingFull = true;
        scheduleChainRedraw();
      } catch (err) {
        if (CHAIN_DEBUG) {
          console.warn('[CHAIN] overview:change redraw failed', err);
        }
      }
      if (CHAIN_OV_DBG && g_lastChainedDebugPanel) {
        if (g_lastChainedDebugPanel.isConnected) {
          dbgPanelRect(g_lastChainedDebugPanel, 'after-zoom-settled');
        }
        g_lastChainedDebugPanel = null;
      } else if (g_lastChainedDebugPanel && !g_lastChainedDebugPanel.isConnected) {
        g_lastChainedDebugPanel = null;
      }
    });
  }, { passive: true });

  function isActivelyEditingToy() {
    try {
      if (typeof window !== 'undefined') {
        if (window.__focusEditingActive === true) return true;
        if (window.__isFocusEditing === true) return true;
      }
      const body = document.body;
      if (!body) return false;
      return body.classList.contains('toy-editing') ||
             body.classList.contains('focused-editing') ||
             body.classList.contains('toy-focus-editing') ||
             body.classList.contains('focus-editing');
    } catch {
      return false;
    }
  }

  function handleOverviewPanelMove(e) {
    const st = g_overviewPanelDrag;
    if (!st) return;
    if (st.pointerId != null && typeof e.pointerId === 'number' && e.pointerId !== st.pointerId) return;
    const scale = window.__boardScale || 1;
    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    const nx = st.startLeft + dx / Math.max(scale, 0.0001);
    const ny = st.startTop + dy / Math.max(scale, 0.0001);
    st.panel.style.left = `${nx}px`;
    st.panel.style.top = `${ny}px`;

    try {
      window.ToySpawner?.updatePanelDrag?.({ clientX: e.clientX, clientY: e.clientY });
    } catch (err) { console.warn('[main] ToySpawner.updatePanelDrag failed', err); }

    if (CHAIN_OV_DBG) {
      console.log('[OVDBG][overviewDragMove]', {
        panelId: st.panel.id,
        nx,
        ny,
        pointerType: e.pointerType
      });
    }
  }

  function endOverviewPanelDrag(e) {
    const st = g_overviewPanelDrag;
    if (!st) return;
    if (st.pointerId != null && typeof e.pointerId === 'number' && e.pointerId !== st.pointerId) return;
    try { st.panel.releasePointerCapture?.(st.pointerId); } catch {}
    window.removeEventListener('pointermove', handleOverviewPanelMove, true);
    window.removeEventListener('pointerup', endOverviewPanelDrag, true);
    window.removeEventListener('pointercancel', endOverviewPanelDrag, true);

    try {
      const wasDeleted = window.ToySpawner?.endPanelDrag?.({
        clientX: e.clientX,
        clientY: e.clientY,
        pointerId: e.pointerId,
        canceled: e.type === 'pointercancel'
      });
      // If the toy was deleted, the panel element is gone. Bail out.
      if (wasDeleted) return;
    } catch(err) { console.warn('[main] ToySpawner.endPanelDrag failed', err); }

    g_overviewPanelDrag = null;
  }

  // Overview-mode: click-anywhere drag for toy panels (except chain button).
  // In normal view: drag uses header. In overview: drag uses whole panel.
  function handleOverviewPointerDown(e) {
    if (e.target?.closest?.('.toy-chain-btn')) return;
    const board = document.getElementById('board');
    const overviewActive =
      !!(window.__overviewMode?.isActive?.() ||
         board?.classList?.contains('board-overview') ||
         document.body?.classList?.contains('overview-mode'));
    if (!overviewActive) return;
    if (isActivelyEditingToy()) return;

    const panel = e.target?.closest?.('.toy-panel');
    if (!panel) return;

    // Left click / primary only
    if (typeof e.button === 'number' && e.button !== 0) return;

    if (CHAIN_OV_DBG) {
      console.log('[OVDBG][overviewDragStart]', {
        panelId: panel.id,
        target: e.target?.className || e.target?.tagName,
        button: e.button,
        pointerType: e.pointerType
      });
    }

    try {
      window.ToySpawner?.beginPanelDrag?.({ panel, pointerId: e.pointerId });
    } catch(err) { console.warn('[main] ToySpawner.beginPanelDrag failed', err); }

    const startLeft = parseFloat(panel.style.left);
    const startTop = parseFloat(panel.style.top);
    g_overviewPanelDrag = {
      panel,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: Number.isFinite(startLeft) ? startLeft : 0,
      startTop: Number.isFinite(startTop) ? startTop : 0,
      pointerId: typeof e.pointerId === 'number' ? e.pointerId : null
    };

    try { panel.setPointerCapture?.(g_overviewPanelDrag.pointerId); } catch {}

    window.addEventListener('pointermove', handleOverviewPanelMove, true);
    window.addEventListener('pointerup', endOverviewPanelDrag, true);
    window.addEventListener('pointercancel', endOverviewPanelDrag, true);
  }

  if (!window.__OV_DRAG_INSTALLED__) {
    window.__OV_DRAG_INSTALLED__ = true;
    document.addEventListener('pointerdown', handleOverviewPointerDown, true);
  }

  function handleChainPanelPointerDown(e) {
    const panel = e.target && e.target.closest ? e.target.closest('.toy-panel') : null;
    if (!panel) return;
    const panelId = panel.id;
    if (typeof e.button === 'number' && e.button !== 0) return;

    if (e.target && e.target.closest && e.target.closest('.toy-chain-btn')) {
      if (CHAIN_OV_DBG) {
        dbgOvEv('[OVDBG][panel:pointerdown][skip:chainBtn]', e, panelId);
      }
      return;
    }

    const board = document.getElementById('board');
    const overviewActive =
      !!(window.__overviewMode?.isActive?.() ||
         board?.classList?.contains('board-overview') ||
         document.body?.classList?.contains('overview-mode'));

    if (!overviewActive) {
      // In focus-edit mode, unfocused toys hide their headers, but they can still be dragged.
      // Allow chain tracking to arm on the whole panel in that state so connectors update while moving.
      const allowPanelDragInFocusEdit =
        isFocusEditingEnabled() && panel.classList.contains('toy-unfocused');

      if (!allowPanelDragInFocusEdit) {
        const header = panel.querySelector('.toy-header');
        const inHeader = header && (header === e.target || header.contains(e.target));
        if (!inHeader) return;
      }
    }

    try {
      if (CHAIN_OV_DBG) {
        console.log('[CHAIN][ov][panel:pointerdown]', {
          overviewActive,
          panelId: panel.id,
          target: e.target?.className || e.target?.tagName,
        });
        dbgOvEv('[OVDBG][panel:pointerdown]', e, panelId);
      }
    } catch {}

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
  }

  function handleChainPanelPointerMove(e) {
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
  }

  function handleChainPanelPointerUp() {
    if (!g_chainDragToyId) return; // not dragging a toy
    const toyId = g_chainDragToyId;
    g_chainDragToyId = null;
    g_chainDragLastUpdateTime = 0;
    g_chainToyLastPos.delete(toyId);
    if (!CHAIN_FEATURE_ENABLE_CONNECTOR_DRAW) return;

    try {
      rebuildChainSegments();
      g_chainRedrawPendingFull = true;
      scheduleChainRedraw();
    } catch (err) {
      if (CHAIN_DEBUG) {
        console.warn('[CHAIN] pointerup final redraw failed', err);
      }
    }
  }

  if (!window.__CHAIN_DRAG_INIT__) {
    window.__CHAIN_DRAG_INIT__ = true;
    document.addEventListener('pointerdown', handleChainPanelPointerDown, true);
    document.addEventListener('pointermove', handleChainPanelPointerMove, true);
    document.addEventListener('pointerup', handleChainPanelPointerUp, true);
    document.addEventListener('pointercancel', handleChainPanelPointerUp, true);
    try { installChainPositionObserver(); } catch {}
  }

  // Tap-to-focus: focusing an unfocused toy shrinks the rest and recenters the camera.
  // Focus on pointerup (tap release) to allow click+hold dragging of unfocused toys.
  let pendingFocus = null;
  let pendingFocusPos = null;
  let pendingFocusId = null;
  const FOCUS_MOVE_THRESH_SQ = 9; // 3px tolerance

  document.addEventListener('pointerdown', (e) => {
    // If the press originated on a chain "+" button, don't queue focus for the source toy.
    if (e.target && e.target.closest && e.target.closest('.toy-chain-btn')) return;
    const panel = e.target && e.target.closest ? e.target.closest('.toy-panel') : null;
    if (!panel || !isFocusManagedPanel(panel)) return;
    if (panel.classList.contains('toy-unfocused')) {
      pendingFocus = panel;
      pendingFocusPos = { x: e.clientX, y: e.clientY };
      pendingFocusId = e.pointerId;
    } else {
      pendingFocus = null;
      pendingFocusPos = null;
      pendingFocusId = null;
    }
  }, true);

  document.addEventListener('pointermove', (e) => {
    if (!pendingFocus || pendingFocusId !== e.pointerId || !pendingFocusPos) return;
    const dx = e.clientX - pendingFocusPos.x;
    const dy = e.clientY - pendingFocusPos.y;
    if ((dx * dx + dy * dy) > FOCUS_MOVE_THRESH_SQ) {
      pendingFocus = null;
      pendingFocusPos = null;
      pendingFocusId = null;
    }
  }, true);

  document.addEventListener('pointerup', (e) => {
    if (pendingFocus && pendingFocusId === e.pointerId) {
      if (pendingFocus.classList.contains('toy-focused')) {
        setToyFocus(null);
      } else {
        setToyFocus(pendingFocus, { center: true });
      }
    }
    pendingFocus = null;
    pendingFocusPos = null;
    pendingFocusId = null;
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
