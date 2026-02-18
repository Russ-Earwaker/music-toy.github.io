import './mobile-viewport.js';
import './fullscreen.js';
// --- Module Imports ---
import './debug.js';
import './scene-manager.js';
import './perf/perf-lab.js';
import './perf/toy-update-arbiter.js';
import { installRafBoundaryFlag, traceDomWrite } from './perf/PerfTrace.js';
import './advanced-controls-toggle.js';
import './toy-visibility.js';
import { attachWorldElement } from './zoom/ZoomCoordinator.js';
import { onZoomChange, namedZoomListener } from './zoom/ZoomCoordinator.js';
import { initializeBouncer } from './bouncer-init.js';
import './header-buttons-delegate.js';
import './rippler-init.js';
import './tutorial.js';
import { startParticleStream } from './tutorial-fx.js';
import './ui-highlights.js';
import { updateParticleQualityFromFps, setActiveToyCount } from './baseMusicToy/index.js';
import { ensurePanelSpawnPlacement as ensureSharedPanelSpawnPlacement, panToSpawnedPanel } from './baseToy/spawn-placement.js';
// import { createBouncer } from './bouncer.main.js'; // This is now handled by bouncer-init.js
import './debug-reflow.js';
import { initDrawGrid } from './drawgrid/drawgrid-init.js';
import { createChordWheel } from './chordwheel.js';
import { createRippleSynth } from './ripplesynth.js';
import { applyStackingOrder } from './stacking-manager.js';
import { getViewportTransform, getViewportElement, screenToWorld } from './board-viewport.js';
import { getRect } from './layout-cache.js';

import { bumpAllToyAudioGen, bumpToyAudioGen } from './toy-audio.js';
import './toy-layout-manager.js';
import './zoom-overlay.js';
import './toy-spawner.js';
import { getArtCatalog, createArtToyAt } from './art/art-toy-factory.js';
import { createArtTriggerRouter } from './art/art-trigger-router.js';
import './board-tap-dots.js';
import { initAudioAssets, cancelScheduledToySources, triggerInstrument } from './audio-samples.js';
import { loadInstrumentEntries as loadInstrumentCatalog, getInstrumentEntries as getInstrumentCatalogEntries } from './instrument-catalog.js';
import { openInstrumentPicker } from './instrument-picker.js';
import { collectUsedInstruments, getSoundThemeKey, pickInstrumentForToy } from './sound-theme.js';
import { installIOSAudioUnlock } from './ios-audio-unlock.js';
import { installAudioDiagnostics } from './audio-diagnostics.js';
import { debugEnabled, makeDebugLogger } from './debug-flags.js';
import { DEFAULT_BPM, NUM_STEPS, ensureAudioContext, resumeAudioContextIfNeeded, getLoopInfo, setBpm, start, stop, isRunning, getToyGain } from './audio-core.js';
import { autoQualityOnFrame } from './perf/AutoQualityController.js';
import { createSequencerScheduler } from './note-scheduler.js';
import { drawBlocksSection as drawOrangeTiles } from './ui-tiles.js';
import { buildGrid } from './grid-core.js';
import { buildDrumGrid } from './drum-core.js';
import { tryRestoreOnBoot, startAutosave } from './persistence.js';
import { initBoardAnchor, tickBoardAnchor } from './board-anchor.js';

const mainLog = makeDebugLogger('mt_debug_logs', 'log');

// ---------------------------------------------------------------------------
// Art Toy: Internal Board (first pass)
// ---------------------------------------------------------------------------

const g_artInternal = {
  active: false,
  artToyId: null,
  scale: 1,
  tx: 0,
  ty: 0,
  dragging: false,
  dragStartClientX: 0,
  dragStartClientY: 0,
  dragStartTx: 0,
  dragStartTy: 0,
  _wheelRaf: 0,
  // DOM swap state (so existing board + toy dragging code keeps working)
  _swap: {
    didSwap: false,
    mainBoardEl: null,
    mainBoardPrevId: null,
    mainViewportEl: null,
    mainViewportHadClass: false,
    internalViewportEl: null,
    internalWorldEl: null,
    internalWorldPrevId: null,
  },
};
let g_lastViewportGestureTs = 0;
let g_lastArtFlashIntentTs = 0;
let g_lastArtFlashIntent = null;
function artFlashDebugEnabled() {
  try { if (window.__MT_DEBUG_ART_FLASH === true) return true; } catch {}
  try { if (localStorage.getItem('MT_DEBUG_ART_FLASH') === '1') return true; } catch {}
  return false;
}
function artFlashNow() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}
function artFlashDbg(tag, payload = {}) {
  if (!artFlashDebugEnabled()) return;
  try { console.log(`[ART][flash] ${tag}`, payload); } catch {}
}
function getArtFlashMotionSnapshot() {
  const now = artFlashNow();
  const lastGestureAgeMs = Number.isFinite(g_lastViewportGestureTs)
    ? Math.max(0, now - g_lastViewportGestureTs)
    : null;
  return {
    internal: !!g_artInternal?.active,
    zoom: !!window.__mtZoomGesturing,
    gesture: !!window.__GESTURE_ACTIVE,
    tween: !!window.__camTweenLock,
    lastGestureAgeMs: Number.isFinite(lastGestureAgeMs) ? Math.round(lastGestureAgeMs * 10) / 10 : null,
  };
}
function recordArtFlashIntent(kind, data = {}) {
  g_lastArtFlashIntentTs = artFlashNow();
  g_lastArtFlashIntent = { kind, ...data };
  try {
    window.__MT_LAST_ART_FLASH_INTENT = {
      at: g_lastArtFlashIntentTs,
      ...g_lastArtFlashIntent,
    };
  } catch {}
}
function installArtFlashMutationDebug() {
  try {
    if (window.__MT_ART_FLASH_OBSERVER_INSTALLED) return;
    window.__MT_ART_FLASH_OBSERVER_INSTALLED = true;
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type !== 'attributes' || m.attributeName !== 'class') continue;
        const el = m.target;
        if (!(el instanceof HTMLElement)) continue;
        if (!el.classList?.contains('art-toy-panel')) continue;
        if (!artFlashDebugEnabled()) continue;
        const now = artFlashNow();
        const sinceIntentMs = Number.isFinite(g_lastArtFlashIntentTs)
          ? Math.max(0, now - g_lastArtFlashIntentTs)
          : null;
        artFlashDbg('class-change', {
          id: el.id || null,
          className: el.className,
          ...getArtFlashMotionSnapshot(),
          sinceIntentMs: Number.isFinite(sinceIntentMs) ? Math.round(sinceIntentMs * 10) / 10 : null,
          lastIntent: g_lastArtFlashIntent || null,
        });
      }
    });
    obs.observe(document.body || document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
  } catch {}
}
try {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installArtFlashMutationDebug, { once: true });
  } else {
    installArtFlashMutationDebug();
  }
} catch {}
function installArtFlashViewportDebug() {
  try {
    if (window.__MT_ART_FLASH_VIEWPORT_DEBUG_INSTALLED) return;
    window.__MT_ART_FLASH_VIEWPORT_DEBUG_INSTALLED = true;
    window.addEventListener('board:gesture-commit', (e) => {
      const detail = e?.detail || {};
      artFlashDbg('viewport:gesture-commit', {
        ...getArtFlashMotionSnapshot(),
        positionChanged: !!detail.positionChanged,
        scaleChanged: !!detail.scaleChanged,
        gestureId: detail.gestureId ?? null,
      });
    });
  } catch {}
}
function installArtFlashAnimationDebug() {
  try {
    if (window.__MT_ART_FLASH_ANIM_DEBUG_INSTALLED) return;
    window.__MT_ART_FLASH_ANIM_DEBUG_INSTALLED = true;
    const onAnim = (phase, e) => {
      if (!artFlashDebugEnabled()) return;
      const target = e?.target;
      if (!(target instanceof Element)) return;
      if (!target.classList?.contains('art-toy-circle')) return;
      const panel = target.closest('.art-toy-panel');
      const now = artFlashNow();
      const sinceIntentMs = Number.isFinite(g_lastArtFlashIntentTs)
        ? Math.max(0, now - g_lastArtFlashIntentTs)
        : null;
      artFlashDbg(`anim:${phase}`, {
        animationName: e?.animationName || null,
        elapsedTime: Number.isFinite(e?.elapsedTime) ? e.elapsedTime : null,
        artId: panel?.id || null,
        panelHasFlashClass: !!panel?.classList?.contains('flash'),
        docFreeze: !!document.documentElement?.classList?.contains('zoom-commit-freeze'),
        ...getArtFlashMotionSnapshot(),
        sinceIntentMs: Number.isFinite(sinceIntentMs) ? Math.round(sinceIntentMs * 10) / 10 : null,
        lastIntent: g_lastArtFlashIntent || null,
      });
    };
    document.addEventListener('animationstart', (e) => onAnim('start', e), true);
    document.addEventListener('animationend', (e) => onAnim('end', e), true);
  } catch {}
}
function installArtFlashFreezeClassDebug() {
  try {
    if (window.__MT_ART_FLASH_FREEZE_DEBUG_INSTALLED) return;
    window.__MT_ART_FLASH_FREEZE_DEBUG_INSTALLED = true;
    const root = document.documentElement;
    if (!root) return;
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type !== 'attributes' || m.attributeName !== 'class') continue;
        if (m.target !== root) continue;
        if (!artFlashDebugEnabled()) continue;
        const now = artFlashNow();
        const sinceIntentMs = Number.isFinite(g_lastArtFlashIntentTs)
          ? Math.max(0, now - g_lastArtFlashIntentTs)
          : null;
        artFlashDbg('viewport:freeze-class', {
          hasFreeze: !!root.classList?.contains('zoom-commit-freeze'),
          className: root.className || '',
          ...getArtFlashMotionSnapshot(),
          sinceIntentMs: Number.isFinite(sinceIntentMs) ? Math.round(sinceIntentMs * 10) / 10 : null,
          lastIntent: g_lastArtFlashIntent || null,
        });
      }
    });
    obs.observe(root, { attributes: true, attributeFilter: ['class'] });
  } catch {}
}
try {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installArtFlashViewportDebug, { once: true });
    document.addEventListener('DOMContentLoaded', installArtFlashAnimationDebug, { once: true });
    document.addEventListener('DOMContentLoaded', installArtFlashFreezeClassDebug, { once: true });
  } else {
    installArtFlashViewportDebug();
    installArtFlashAnimationDebug();
    installArtFlashFreezeClassDebug();
  }
} catch {}

// ---------------------------------------------------------------------------
// Internal Board: Animation debug (gated)
// Enable with: localStorage.INTERNAL_BOARD_ANIM_DBG = "1"
// ---------------------------------------------------------------------------
function internalAnimDbgEnabled(){
  try { return localStorage.getItem('INTERNAL_BOARD_ANIM_DBG') === '1'; } catch {}
  return false;
}
function dbgInternalOverlay(tag, overlay){
  if (!internalAnimDbgEnabled()) return;
  try {
    const cs = overlay ? getComputedStyle(overlay) : null;
    console.log('[InternalBoard][ANIM]', tag, {
      hasOverlay: !!overlay,
      classes: overlay ? Array.from(overlay.classList) : [],
      display: cs?.display,
      opacity: cs?.opacity,
      transform: cs?.transform,
      transition: cs?.transition,
      transitionProperty: cs?.transitionProperty,
      transitionDuration: cs?.transitionDuration,
      transitionTiming: cs?.transitionTimingFunction,
      willChange: cs?.willChange,
      rect: overlay ? overlay.getBoundingClientRect() : null,
      bodyActive: document.body.classList.contains('internal-board-active'),
    });
  } catch (err) {
    console.warn('[InternalBoard][ANIM] dbg failed', err);
  }
}

// Perf trace support (demon hunting). Safe/no-op unless toggled in perf-lab.
installRafBoundaryFlag();

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
        g_lastViewportGestureTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        try { window.__MT_LAST_VIEWPORT_GESTURE_TS = g_lastViewportGestureTs; } catch {}
        try { clearArtDropHoverEl?.(); } catch {}
      } else if (phase === 'done' || phase === 'commit' || phase === 'swap' || phase === 'idle' || mode === 'idle') {
        window.__mtZoomGesturing = false;
        g_lastViewportGestureTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        try { window.__MT_LAST_VIEWPORT_GESTURE_TS = g_lastViewportGestureTs; } catch {}
      }
      artFlashDbg('viewport:zoom-phase', {
        phase: phase ?? null,
        mode: mode ?? null,
        gesturing: !!gesturing,
        active,
        ...getArtFlashMotionSnapshot(),
      });
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
window.resolveToyPanelOverlaps = function resolveToyPanelOverlaps({
    padding = SPAWN_PADDING,
    maxPasses = 2,
    skipIfMoved = false,
} = {}) {
    const board = document.getElementById('board');
    if (!board) return false;
    const panels = Array.from(board.querySelectorAll(':scope > .toy-panel'));
    if (!panels.length) return false;
    let movedAny = false;
    for (let pass = 0; pass < Math.max(1, maxPasses); pass++) {
        let movedThisPass = false;
        for (const panel of panels) {
            const res = ensurePanelSpawnPlacement(panel, {
                padding,
                skipIfMoved,
            });
            if (res?.changed) {
                movedThisPass = true;
                movedAny = true;
                persistToyPosition(panel);
            }
        }
        if (!movedThisPass) break;
    }
    return movedAny;
};

const SPAWN_PADDING = 40;

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
    const rect = getRect(panel);

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
    const panelRect = getRect(panel);
    const parentRect = getRect(panel.parentElement);
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
    const boardRect = getRect(board);
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

// --- Internal-board transform source of truth ---
// Internal boards are visually driven by a CSS transform on #internal-board-world.
// Using g_artInternal.{scale,tx,ty} can drift and causes large chain offsets / wrong scale.
function getInternalBoardCssTransform(worldEl = null) {
  try {
    // During identity swap the internal world is often renamed to #board.
    // So we accept an explicit worldEl (preferred) and fall back to the best guess.
    const world =
      worldEl ||
      g_artInternal?._swap?.internalWorldEl ||
      document.getElementById('internal-board-world') ||
      (g_artInternal?.active ? document.getElementById('board') : null);

    if (!world) return null;
    const cs = getComputedStyle(world);
    const tr = cs?.transform;
    if (!tr || tr === 'none') return { scale: 1, tx: 0, ty: 0, raw: tr || 'none' };

    // DOMMatrixReadOnly is supported in modern browsers; fall back to WebKitCSSMatrix if needed.
    let m = null;
    try { m = new DOMMatrixReadOnly(tr); } catch {}
    if (!m) {
      try { m = new WebKitCSSMatrix(tr); } catch {}
    }
    if (!m) return null;

    // For a 2D matrix:
    // a/d are scale (when there is no skew), e/f are translation in CSS px.
    const a = Number(m.a);
    const d = Number(m.d);
    const e = Number(m.e);
    const f = Number(m.f);
    const scale = (Number.isFinite(a) && Math.abs(a) > 1e-6) ? a : 1;
    const tx = Number.isFinite(e) ? e : 0;
    const ty = Number.isFinite(f) ? f : 0;
    return { scale, tx, ty, raw: tr, a, d, e, f, worldId: world.id || null, worldClass: world.className || null };
  } catch {
    return null;
  }
}

function chainInternalDbgEnabled(){
  try { return localStorage.getItem('CHAIN_INTERNAL_DBG') === '1'; } catch {}
  return false;
}
function chainInternalDeepDbgEnabled(){
  try { return localStorage.getItem('CHAIN_INTERNAL_DEEP_DBG') === '1'; } catch {}
  return false;
}
let g_chainInternalDeepLastLogMs = 0;
const CHAIN_INTERNAL_DEEP_MIN_INTERVAL_MS = 250; // rate-limit spam
function dbgChainInternalDeep(tag, extra = null){
  if (!chainInternalDeepDbgEnabled()) return;
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  // IMPORTANT:
  // drawChains(pre) fires every frame and can starve more valuable deep logs
  // (like getChainAnchor) if we apply a single global rate limit.
  // Allow anchor logs through even when the frame logger is busy.
  const bypassRateLimit =
    (typeof tag === 'string') &&
    (tag.startsWith('getChainAnchor') || tag.startsWith('edgeAnchors') || tag.startsWith('edgeSanity'));
  if (!bypassRateLimit) {
    if (now - g_chainInternalDeepLastLogMs < CHAIN_INTERNAL_DEEP_MIN_INTERVAL_MS) return;
    g_chainInternalDeepLastLogMs = now;
  }
  try {
    const vp = (typeof getViewportElement === 'function') ? getViewportElement() : null;
    const vpr = vp ? vp.getBoundingClientRect() : null;
    const board = document.getElementById('board');
    const cc = chainCanvas;
    const cs = cc ? getComputedStyle(cc) : null;
    console.log('[CHAIN][INTERNAL][DEEP]', tag, {
      internalActive: !!(g_artInternal && g_artInternal.active),
      artToyId: g_artInternal?.artToyId || null,
      swapDidSwap: !!g_artInternal?._swap?.didSwap,
      gArt: { scale: g_artInternal?.scale, tx: g_artInternal?.tx, ty: g_artInternal?.ty },
      viewportEl: vp ? (vp.id || vp.className) : null,
      viewportRect: vpr ? { x: vpr.x, y: vpr.y, w: vpr.width, h: vpr.height } : null,
      boardEl: board ? (board.id || board.className) : null,
      canvas: cc ? {
        parent: cc.parentElement ? (cc.parentElement.id || cc.parentElement.className) : null,
        css: { left: cs?.left, top: cs?.top, width: cs?.width, height: cs?.height, z: cs?.zIndex, display: cs?.display, opacity: cs?.opacity },
        attr: { w: cc.width, h: cc.height },
      } : null,
      extra,
    });
  } catch (err) {
    console.warn('[CHAIN][INTERNAL][DEEP] dbg failed', err);
  }
}
function dbgChainInternal(tag, extra = null){
  if (!chainInternalDbgEnabled()) return;
  try {
    const vp = getViewportElement?.();
    const board = document.getElementById('board');
    const cc = chainCanvas;
    const cs = cc ? getComputedStyle(cc) : null;
    console.log('[CHAIN][INTERNAL]', tag, {
      internalActive: !!(g_artInternal && g_artInternal.active),
      artToyId: g_artInternal?.artToyId || null,
      heads: g_chainState?.size || 0,
      edges: g_chainEdges?.size || 0,
      viewportEl: vp ? (vp.id || vp.className) : null,
      boardEl: board ? (board.id || board.className) : null,
      canvas: cc ? {
        parent: cc.parentElement ? (cc.parentElement.id || cc.parentElement.className) : null,
        css: { left: cs?.left, top: cs?.top, width: cs?.width, height: cs?.height, z: cs?.zIndex, display: cs?.display, opacity: cs?.opacity },
        attr: { w: cc.width, h: cc.height },
      } : null,
      extra,
    });
  } catch (err) {
    console.warn('[CHAIN][INTERNAL] dbg failed', err);
  }
}

// ---------------------------
// BoardContext (chains only)
// ---------------------------
// The main bug-generator so far has been "implicit board identity":
// different subsystems looking up #board/.board-viewport in different ways (and caching refs),
// plus internal-mode identity swaps. Chains must not rely on global lookups.
//
// We introduce an explicit BoardContext that tells chains:
// - which viewport element is active
// - which world element is active
// - which mode we are in ("main" vs "internal")
//
// For now we ONLY migrate chains to this abstraction.
function getActiveBoardContext() {
  const internalActive = !!(g_artInternal && g_artInternal.active);
  if (internalActive) {
    const viewportEl =
      (g_artInternal?._els?.viewport) ||
      document.getElementById('internal-board-viewport') ||
      (typeof getViewportElement === 'function' ? getViewportElement() : null) ||
      document.querySelector('.board-viewport');

    const worldEl =
      document.getElementById('internal-board-world') ||
      document.getElementById('board');

    return { key: 'internal', viewportEl, worldEl };
  }

  const viewportEl =
    (typeof getViewportElement === 'function' ? getViewportElement() : null) ||
    document.querySelector('.board-viewport');

  const worldEl = document.getElementById('board');
  return { key: 'main', viewportEl, worldEl };
}

// Chains need a per-context layer (canvas + wrapper + cached sizing) so that:
// - main caches can't leak into internal
// - internal caches can't leak back to main
// - swapping modes doesn't require fragile global invalidation hacks
const g_chainLayerByBoardKey = new Map();
function getOrCreateChainLayer(boardKey) {
  let layer = g_chainLayerByBoardKey.get(boardKey);
  if (layer) return layer;

  const canvas = document.createElement('canvas');
  canvas.className = 'chain-canvas';
  Object.assign(canvas.style, {
    position: 'absolute',
    inset: '0',
    pointerEvents: 'none',
    // IMPORTANT: this canvas is in viewport space. If its z-index is too high,
    // it will draw *over* toy UI controls (eg the chain extend button). Keep it low.
    zIndex: '0',
    display: 'block',
    opacity: '1',
    mixBlendMode: 'normal',
  });

  const ctx = canvas.getContext('2d');
  layer = {
    boardKey,
    canvas,
    ctx,
    wrapper: null,
    // per-context cached sizing & origin bookkeeping
    cache: {
      boardClientWidth: 0,
      boardClientHeight: 0,
      worldLeft: NaN,
      worldTop: NaN,
    },
  };
  g_chainLayerByBoardKey.set(boardKey, layer);
  return layer;
}

// Ensure the chain canvas is attached to the current active board.
// In internal-board mode we swap identity so `#board` points at the internal world;
// without reattaching, connectors will keep drawing onto the *old* board.
function ensureChainCanvasAttachedToActiveBoard(boardCtx = null) {
  const ctx = boardCtx || getActiveBoardContext();
  const viewport = ctx?.viewportEl;
  if (!viewport) return;

  const layer = getOrCreateChainLayer(ctx.key);

  // Prefer a stable wrapper in the viewport (avoids clipping/stacking-context weirdness).
  let wrapper = viewport.querySelector?.(':scope > .chain-canvas-wrapper') || null;
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.className = 'chain-canvas-wrapper';
    Object.assign(wrapper.style, {
      position: 'absolute',
      inset: '0',
      // Keep the connector layer underneath toy UI (controls live in the transformed world).
      // A high z-index here forces connectors above everything (because the world transform
      // creates a new stacking context, so UI controls can't out-z-index it).
      zIndex: '0',
      pointerEvents: 'none',
      isolation: 'isolate',
    });
    // Put the connector layer behind the viewport's main content.
    // (World/toys come later in DOM order so they render above.)
    try { viewport.prepend(wrapper); } catch {}
  }
  try {
    wrapper.style.zIndex = '0';
    wrapper.style.pointerEvents = 'none';
    wrapper.style.isolation = 'isolate';
  } catch {}

  layer.wrapper = wrapper;

  // Attach canvas into this context's wrapper
  if (layer.canvas.parentElement !== wrapper) {
    try { wrapper.appendChild(layer.canvas); } catch {}
    // Invalidate ONLY this context's cached sizing/origin
    layer.cache.worldLeft = NaN;
    layer.cache.worldTop = NaN;
    layer.cache.boardClientWidth = 0;
    layer.cache.boardClientHeight = 0;
  }

  // Point legacy globals at the active layer (so the rest of the chain code keeps working)
  chainCanvas = layer.canvas;
  chainCtx = layer.ctx;

  dbgChainInternal('ensureChainCanvasAttachedToActiveBoard', { boardKey: ctx.key, viewportId: viewport.id || null });
}

function clearChainCanvasHard() {
  try {
    if (!chainCanvas || !chainCtx) return;
    // Reset transform just in case; our chain canvas should always be identity.
    chainCtx.setTransform(1, 0, 0, 1, 0, 0);
    chainCtx.clearRect(0, 0, chainCanvas.width || 0, chainCanvas.height || 0);
  } catch {}
}

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
    if (!chainConnectorsEnabled()) {
      g_chainPosDirtyToyIds.clear();
      return;
    }

    const now = performance.now();
    if (now - g_chainPosLastFlushMs < CHAIN_POS_OBS_MIN_INTERVAL_MS) {
      // Re-schedule if we?re being spammed.
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
  flush.__perfRafTag = 'perf.raf.chainPosFlush';

  g_chainPosObserver = new MutationObserver((mutations) => {
    // Only care when focus editing or overview ? basically anytime connectors might be visible.
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

function chainConnectorsEnabled() {
  return !!CHAIN_FEATURE_ENABLE_CONNECTOR_DRAW && !(typeof window !== 'undefined' && window.__PERF_DISABLE_CHAIN_CONNECTORS);
}
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
    const r = getRect(panel);
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

const focusDebugEnabled = () => {
  try {
    if (debugEnabled('mt_focus_debug')) return true;
  } catch {}
  try {
    if (typeof window !== 'undefined' && window.__focusDebug) return true;
  } catch {}
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('FOCUS_DBG') === '1') return true;
  } catch {}
  return false;
};

try {
  // Default OFF; enable via window.MT_DEBUG_FLAGS.mt_focus_debug or localStorage 'mt_focus_debug'.
  if (localStorage.getItem('FOCUS_DBG') === null) {
    localStorage.setItem('FOCUS_DBG', '0');
  }
  window.__focusDebug = focusDebugEnabled();
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
    const dbg = focusDebugEnabled();
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
window.requestToyFocus = (panel, opts = {}) => {
  if (!panel || !panel.classList) return false;
  const safeOpts = (opts && typeof opts === 'object') ? opts : {};
  setToyFocus(panel, { center: false, ...safeOpts });
  return true;
};
function setToyFocus(panel, { center = true, unfocusAll } = {}) { // default center=true
  const effectiveUnfocusAll = (typeof unfocusAll === 'boolean')
    ? unfocusAll
    : (!panel && isFocusEditingEnabled()); // default: when clearing focus, keep toys in low-detail/unfocused state

  const allowRestoreFocus = panel && g_restoringFocusId && panel.id === g_restoringFocusId;
  if (panel && (g_suppressBootFocus || g_isRestoringSnapshot) && !allowRestoreFocus) {
    try {
      const dbg = focusDebugEnabled();
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
    const dbg = focusDebugEnabled();
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
    const blockEditing = isFocusEditingEnabled() && isActivelyEditingToy();
    if (!isFocus && desiredUnfocus && blockEditing) {
      p.style.pointerEvents = 'auto'; // allow dragging via panel
      if (body) body.style.pointerEvents = 'none';
    } else {
      // In normal mode, keep unfocused toys editable.
      // In focus edit mode, only block when actively editing.
      p.style.pointerEvents = 'auto';
      if (body) body.style.pointerEvents = '';
    }
  });

  if (panel && center && !g_suppressBootFocus) {
    requestAnimationFrame(() => {
      const guide = document.querySelector('.guide-launcher');
      const spawner = document.querySelector('.toy-spawner-dock');
      const guideRight = guide ? getRect(guide).right : 0;
      const spawnerLeft = spawner ? getRect(spawner).left : window.innerWidth;
      const centerX = (guideRight + spawnerLeft) / 2;
      const centerFracX = centerX / window.innerWidth;
      try {
        if (focusDebugEnabled()) {
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
      /* NORMAL MODE ? full-frame outline visible */
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
      /* OVERVIEW ? suppress full-frame outline so only body overlay shows */
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
        const nowTs = (typeof performance !== 'undefined' && typeof performance.now === 'function')
          ? performance.now()
          : Date.now();
        const emergencyActive = !!window.__DG_EMERGENCY_MODE;
        __fpsHudEl.style.color = emergencyActive ? '#ff3b30' : '#0f0';
      }

      // Expose FPS globally for any legacy uses (e.g. drawgrid tuning).
      try {
        window.__dgFpsValue = __fpsValue;
      } catch (err) {
        // ignore
      }

      // Feed the shared particle quality system with FPS and toy count.
      try {
        const toyCount = document.querySelectorAll('.toy-panel').length || 1;
        updateParticleQualityFromFps(__fpsValue, { toyCount });
      } catch (err) {
        // ignore ? debug-only feature should never crash the app
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
    // Cancel anything pending from a prior run (deferred setTimeout gates + scheduled sources)
    try { bumpAllToyAudioGen(); } catch {}

    start();
    try { document.dispatchEvent(new Event('transport:play')); } catch {}
    try {
      const panels = Array.from(document.querySelectorAll('.toy-panel[id]'));
      const roots = panels.filter(el => !el.dataset.chainParent);
      if (window.__CHAIN_DEBUG) console.log('[chain] play ? roots', roots.map(r => r.id));
      const visited = new Set();
      for (const root of roots) {
        startToyAndDescendants(root, visited);
      }
    } catch (err) {
        if (window.__CHAIN_DEBUG) console.warn('[chain] play cascade failed', err);
    }
  });
  stopBtn?.addEventListener('click', ()=>{
    try { document.dispatchEvent(new Event('transport:pause')); } catch {}

    // Invalidate any deferred scheduled triggers + pending sources first
    try { bumpAllToyAudioGen(); } catch {}

    // IMPORTANT: actually stop the transport (resets epoch/bar state + stops active nodes + suspends ctx)
    try { stop(); } catch {}

    // Clear all highlight state when paused
    try {
      document.querySelectorAll('.toy-panel').forEach(p => {
        p.classList.remove('toy-playing', 'toy-playing-pulse');
      });
    } catch {}
  });
  bpmInput?.addEventListener('change', (e)=> setBpm(Number(e.target.value)||DEFAULT_BPM));
}

// --- First-run Volume Setup overlay ---
// Shows the *actual* master volume control in an overlay panel, then animates it back to the topbar.
const LS_VOLUME_SETUP_DONE_KEY = 'rhythmake_volume_setup_done_v1';

function showVolumeSetupIfFirstRun(){
  if (document.getElementById('volume-setup-overlay')) return true;
  try {
    if (window?.localStorage?.getItem?.(LS_VOLUME_SETUP_DONE_KEY) === '1') return false;
  } catch {}

  const topbar = document.getElementById('topbar');
  const master = document.getElementById('topbar-master-volume');
  if (!topbar || !master) {
    if (!window.__volumeSetupRetryPending) {
      window.__volumeSetupRetryPending = true;
      const attempt = () => {
        window.__volumeSetupRetryPending = false;
        const tries = Number(window.__volumeSetupRetryCount || 0);
        if (tries < 8) {
          window.__volumeSetupRetryCount = tries + 1;
          showVolumeSetupIfFirstRun();
        }
      };
      requestAnimationFrame(() => setTimeout(attempt, 0));
    }
    return false;
  }

  // Build overlay
  const overlay = document.createElement('div');
  overlay.id = 'volume-setup-overlay';
  overlay.className = 'volume-setup-overlay';
  overlay.innerHTML = `
    <div class="volume-setup-backdrop"></div>
    <div class="volume-setup-panel" role="dialog" aria-modal="true" aria-label="Volume setup">
      <div class="volume-setup-title">Volume setup</div>
      <div class="volume-setup-body">
        <div class="volume-setup-slot"></div>
      </div>
      <div class="volume-setup-pads" aria-label="Tap pads">
        <canvas class="volume-setup-pad-canvas" width="540" height="120"></canvas>
      </div>
      <div class="volume-setup-actions">
        <div class="volume-setup-done">Done</div>
        <button class="c-btn volume-setup-ok" type="button" aria-label="Done">
          <div class="c-btn-outer"></div>
          <div class="c-btn-glow"></div>
          <div class="c-btn-core"></div>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const slot = overlay.querySelector('.volume-setup-slot');
  const okBtn = overlay.querySelector('.volume-setup-ok');
  const padCanvas = overlay.querySelector('.volume-setup-pad-canvas');
  if (!slot || !okBtn) {
    try { overlay.remove(); } catch {}
    return false;
  }

  // Tick-circle OK button (match Instrument menu "OK" style)
  try {
    okBtn.classList.add('inst-ok');
    const okCore = okBtn.querySelector('.c-btn-core');
    if (okCore) okCore.style.setProperty('--c-btn-icon-url', "url('./assets/UI/T_ButtonTick.png')");
    okBtn.title = 'Done';
  } catch {}

  // Insert a placeholder where the master control normally lives.
  const placeholder = document.createElement('div');
  placeholder.className = 'topbar-master-volume-placeholder';
  placeholder.style.width = `${master.offsetWidth || 0}px`;
  placeholder.style.height = `${master.offsetHeight || 0}px`;
  topbar.insertBefore(placeholder, master.nextSibling);

  // Move the real master control into the setup panel (override its fixed positioning while in setup).
  master.classList.add('is-in-setup');
  slot.appendChild(master);

  // --- Tap pads (4 orange squares like Simple Rhythm) ---
  // One-shot only: play sound + flash animation (no toggle).
  const padState = {
    sounds: [],
    hitIndex: -1,
    hitUntilMs: 0,
    raf: 0,
  };

  async function pickPadSounds(){
    let entries = [];
    try { entries = getInstrumentCatalogEntries ? getInstrumentCatalogEntries() : []; } catch {}
    if (!entries || !entries.length) {
      try { await loadInstrumentCatalog(); } catch {}
      try { entries = getInstrumentCatalogEntries ? getInstrumentCatalogEntries() : []; } catch {}
    }
    const isDrawgridReco = (e) => Array.isArray(e?.recommendedToys) && e.recommendedToys.some(t => String(t).toLowerCase() === 'drawgrid');
    let pool = (entries || []).filter(e => e && e.id && e.priority === true && isDrawgridReco(e));
    if (!pool.length) pool = (entries || []).filter(e => e && e.id && isDrawgridReco(e));
    if (!pool.length) pool = (entries || []).filter(e => e && e.id);
    // shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    const out = [];
    const used = new Set();
    for (const e of pool) {
      const id = String(e.id || '').trim();
      if (!id || used.has(id)) continue;
      used.add(id);
      out.push(id);
      if (out.length >= 4) break;
    }
    return out;
  }

  function drawPadCanvas(){
    if (!padCanvas) return;
    const ctx = padCanvas.getContext('2d');
    if (!ctx) return;
    const W = padCanvas.width|0, H = padCanvas.height|0;
    ctx.clearRect(0, 0, W, H);

    const nowMs = performance.now();
    let flashing = -1;
    let flashAmt = 0;
    if (padState.hitIndex >= 0 && nowMs < padState.hitUntilMs) {
      flashing = padState.hitIndex;
      const dur = Math.max(1, padState.hitUntilMs - padState.hitStartMs);
      const t = (nowMs - padState.hitStartMs) / dur;
      const up = 0.22;
      if (t <= up) {
        flashAmt = t / up;
      } else {
        flashAmt = 1 - (t - up) / Math.max(0.001, (1 - up));
      }
      flashAmt = Math.max(0, Math.min(1, flashAmt));
    }

    // Draw the 4 orange tiles (plain squares, no bevel), like Simple Rhythm.
    const rect = { x: 0, y: 0, w: W, h: H };
    drawOrangeTiles(ctx, rect, { active: [true,true,true,true], onCol: flashing, pad: 18 });

    // Extra flash overlay (matches the "pop" feel of Simple Rhythm)
    if (flashing >= 0 && flashAmt > 0){
      const N = 4;
      const cw = W / N;
      const pad = 14;
      const x = flashing*cw + pad;
      const y = pad;
      const w = cw - pad*2;
      const h = H - pad*2;
      ctx.save();
      ctx.globalAlpha = 0.55 * flashAmt;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x|0, y|0, w|0, h|0);
      ctx.restore();
    }

    // Labels: "tap"
    ctx.save();
    ctx.font = '800 14px/1 ui-sans-serif, system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.80)';
    const N = 4;
    const cw = W / N;
    for (let i=0;i<N;i++){
      const cx = i*cw + cw*0.5;
      const cy = H*0.5;
      ctx.fillText('TAP', cx, cy);
    }
    ctx.restore();

    if (padState.hitIndex >= 0 && nowMs < padState.hitUntilMs){
      padState.raf = requestAnimationFrame(drawPadCanvas);
    } else {
      padState.hitIndex = -1;
      padState.raf = 0;
    }
  }

  async function initPadCanvas(){
    if (!padCanvas) return;
    padState.sounds = await pickPadSounds();
    drawPadCanvas();
    padCanvas.addEventListener('click', (e) => {
      const r = padCanvas.getBoundingClientRect();
      const x = (e.clientX - r.left) / Math.max(1, r.width);
      const idx = Math.max(0, Math.min(3, Math.floor(x * 4)));
      const instrumentId = padState.sounds[idx] || padState.sounds[0] || 'tone';
      try { resumeAudioContextIfNeeded?.(); } catch {}
      try { triggerInstrument(instrumentId, 'C4', undefined, 'master'); } catch {}

      padState.hitIndex = idx;
      padState.hitUntilMs = performance.now() + 260;
      if (!padState.raf) padState.raf = requestAnimationFrame(drawPadCanvas);
    }, { passive: true });
  }

  initPadCanvas();

  // Focus the tick button for fast onboarding.
  try { okBtn.focus(); } catch {}

  okBtn.addEventListener('click', () => {
    try { window?.localStorage?.setItem?.(LS_VOLUME_SETUP_DONE_KEY, '1'); } catch {}

    // FLIP animation back to topbar placement.
    const before = master.getBoundingClientRect();

    // Put it back where it belongs.
    try {
      placeholder.parentNode?.insertBefore(master, placeholder.nextSibling);
    } catch {}
    master.classList.remove('is-in-setup');

    // Force layout so the new rect is correct.
    void master.offsetWidth;
    const after = master.getBoundingClientRect();

    const dx = before.left - after.left;
    const dy = before.top - after.top;
    master.style.transition = 'none';
    master.style.transform = `translate(${dx}px, ${dy}px)`;
    void master.offsetWidth;
    master.style.transition = 'transform 520ms cubic-bezier(0.2, 0.8, 0.2, 1)';
    master.style.transform = 'translate(0px, 0px)';

    const cleanup = () => {
      master.style.transition = '';
      master.style.transform = '';
      master.removeEventListener('transitionend', cleanup);
    };
    master.addEventListener('transitionend', cleanup);
    setTimeout(cleanup, 580);

    try { placeholder.remove(); } catch {}
    try { overlay.remove(); } catch {}
  }, { once: true });

  // Prevent clicks on backdrop from closing (explicit OK only).
  overlay.addEventListener('click', (e) => {
    const panel = overlay.querySelector('.volume-setup-panel');
    if (!panel) return;
    if (!panel.contains(e.target)) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);

  return true;
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
    const overviewActive = !!(
      window.__overviewMode?.isActive?.() ||
      document.body?.classList?.contains('overview-mode') ||
      document.getElementById('board')?.classList?.contains('board-overview')
    );
    if (!overviewActive) {
      if (panel.classList.contains('overview-outline')) {
        panel.classList.remove('overview-outline');
        const overlay = panel.querySelector(':scope > .toy-body-outline');
        if (overlay) overlay.style.opacity = '0';
      }
      return;
    }
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

    // Defensive: if either header or footer is visible, make sure we?re not suppressing the outer outline
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
  const __perfOn = !!(window.__PerfFrameProf && typeof performance !== 'undefined' && performance.now);
  if (__perfOn) {
    const t0 = performance.now();
    const panels = document.querySelectorAll('.toy-panel');
    window.__PerfFrameProf.mark('outline.syncAll.query', performance.now() - t0);
    const t1 = performance.now();
    panels.forEach(syncBodyOutline);
    window.__PerfFrameProf.mark('outline.syncAll.apply', performance.now() - t1);
    window.__PerfFrameProf.mark('outline.syncAll', performance.now() - t0);
    return;
  }
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
    { type: 'drawgrid', name: 'Draw Line', description: 'Sketch out freehand lines that become notes.', size: { width: 800, height: 760 } },
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

// ---------------------------------------------------------------------------
// Art Toys - Internal Toy Containers (first-pass: drag/drop chain into art toy)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Art Toy Random Debug
// ---------------------------------------------------------------------------
function __artRandLog(...args) {
  try {
    if (!window.__MT_DEBUG_ART_RANDOM) return;
    // eslint-disable-next-line no-console
    console.log('[ArtRand]', ...args);
  } catch {}
}

function __dumpDrawgridNotes(panel) {
  try {
    if (!panel) return null;
    const api = panel.__drawToy || panel.__toyApi;
    if (!api) return { hasApi: false };

    if (typeof api.getState === 'function') {
      const state = api.getState();
      // NOTE: DrawGrid state shapes have varied over time.
      // We support BOTH:
      //  - state.nodes.active
      //  - state.currentMap.active
      const nodesActive = state?.nodes?.active;
      if (Array.isArray(nodesActive)) {
        const activeCols = nodesActive
          .map((v, i) => (v ? i : -1))
          .filter(i => i >= 0)
          .slice(0, 10);
        return {
          hasApi: true,
          shape: 'nodes.active',
          activeCount: activeCols.length,
          sampleCols: activeCols
        };
      }

      const mapActive = state?.currentMap?.active;
      if (Array.isArray(mapActive)) {
        const activeCols = mapActive
          .map((v, i) => (v ? i : -1))
          .filter(i => i >= 0)
          .slice(0, 10);
        return {
          hasApi: true,
          shape: 'currentMap.active',
          activeCount: activeCols.length,
          sampleCols: activeCols
        };
      }

      // Unknown shape, but still useful to see top-level keys.
      try {
        const keys = state && typeof state === 'object' ? Object.keys(state).slice(0, 12) : null;
        return { hasApi: true, unknownStructure: true, keys };
      } catch {}
    }

    return { hasApi: true, unknownStructure: true };
  } catch (e) {
    return { error: String(e?.message || e) };
  }
}

function ensureArtInternalHost() {
    let host = document.getElementById('art-internal-host');
    if (host) return host;
    host = document.createElement('div');
    host.id = 'art-internal-host';
    // IMPORTANT:
    // This host must remain *layoutable* even when "hidden" so internal toys (esp drawgrid)
    // can randomise + start audio from the external view.
    // `display:none` prevents layout and breaks headless randomisation.
    host.style.display = 'block';
    host.style.position = 'absolute';
    host.style.left = '-20000px';
    host.style.top = '-20000px';
    host.style.width = '1px';
    host.style.height = '1px';
    host.style.overflow = 'visible';
    host.style.visibility = 'hidden';
    host.style.pointerEvents = 'none';
    document.body.appendChild(host);
    return host;
}

function makeInternalPanelLayoutableWhileHidden(panel) {
    if (!panel) return;
    const saveInline = (key, value) => {
        try {
            const dataKey = `__internalPrev${key}`;
            if (!(dataKey in panel.dataset)) panel.dataset[dataKey] = value ?? '';
        } catch {}
    };
    // Preserve inline styles so re-enter restores exact panel placement/sizing.
    saveInline('Display', panel.style.display);
    saveInline('Position', panel.style.position);
    saveInline('Left', panel.style.left);
    saveInline('Top', panel.style.top);
    saveInline('Width', panel.style.width);
    saveInline('Height', panel.style.height);
    saveInline('Visibility', panel.style.visibility);
    saveInline('PointerEvents', panel.style.pointerEvents);
    saveInline('Overflow', panel.style.overflow);
    saveInline('Contain', panel.style.contain);
    // Keep it measurable but not visible or interactive.
    // DO NOT use display:none (drawgrid random/audio relies on layoutable canvases).
    try {
        panel.style.display = 'block';
        panel.style.position = 'absolute';
        panel.style.left = '-20000px';
        panel.style.top = '-20000px';
        // Give it a sane footprint so canvas-based toys get real sizes.
        // (DrawGrid will then allocate proper paint buffers and randomise fully.)
        panel.style.width = panel.style.width || '420px';
        panel.style.height = panel.style.height || '260px';
        panel.style.visibility = 'hidden';
        panel.style.pointerEvents = 'none';
        panel.style.overflow = 'hidden';
        panel.style.contain = 'layout paint size';
    } catch {}
}

function restoreInternalPanelAfterHiddenLayout(panel) {
    if (!panel) return;
    const restoreInline = (key, styleProp) => {
        const dataKey = `__internalPrev${key}`;
        try {
            if (dataKey in panel.dataset) {
                panel.style[styleProp] = panel.dataset[dataKey] || '';
                delete panel.dataset[dataKey];
            }
        } catch {}
    };
    restoreInline('Display', 'display');
    restoreInline('Position', 'position');
    restoreInline('Left', 'left');
    restoreInline('Top', 'top');
    restoreInline('Width', 'width');
    restoreInline('Height', 'height');
    restoreInline('Visibility', 'visibility');
    restoreInline('PointerEvents', 'pointerEvents');
    restoreInline('Overflow', 'overflow');
    restoreInline('Contain', 'contain');

    // Backward compatibility for panels hidden before style snapshot support landed.
    try {
        if (panel.style.left === '-20000px') panel.style.left = '';
        if (panel.style.top === '-20000px') panel.style.top = '';
        if (panel.style.visibility === 'hidden') panel.style.visibility = '';
        if (panel.style.contain === 'layout paint size') panel.style.contain = '';
    } catch {}
}

function findArtToyAtClientPoint(clientX, clientY) {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    return el.closest?.('.art-toy-panel') || null;
}

function collectChainPanelsForMove(startPanel) {
    const start = (typeof startPanel === 'string') ? document.getElementById(startPanel) : startPanel;
    if (!start || !start.classList?.contains('toy-panel')) return [];

    const head = findChainHead(start) || start;
    const out = [];
    const visited = new Set();

    const visit = (panel) => {
        if (!panel || visited.has(panel.id)) return;
        visited.add(panel.id);
        out.push(panel);

        // Linear next
        const nextId = panel.dataset.nextToyId;
        if (nextId) {
            const next = document.getElementById(nextId);
            if (next && next !== panel) visit(next);
        }

        // Branching children (chainParent)
        const kids = getChildrenOf(panel.id);
        for (const child of kids) visit(child);
    };

    visit(head);
    return out;
}

function setPanelInternalToArtToy(panel, artToyId) {
    if (!panel) return;
    panel.dataset.artOwnerId = artToyId;
    panel.dataset.focusSkip = '1'; // don't let focus system try to manage hidden panels
    panel.classList.add('art-internal-toy');
    // Keep it layoutable (offscreen/invisible) so external random/play works.
    makeInternalPanelLayoutableWhileHidden(panel);
}

function moveChainIntoArtToy(startPanel, artPanel) {
    const art = (typeof artPanel === 'string') ? document.getElementById(artPanel) : artPanel;
    const start = (typeof startPanel === 'string') ? document.getElementById(startPanel) : startPanel;
    if (!art || !art.classList?.contains('art-toy-panel')) return false;
    if (!start || !start.classList?.contains('toy-panel')) return false;

    const host = ensureArtInternalHost();
    const panels = collectChainPanelsForMove(start);
    if (!panels.length) return false;

    // If any panels are already owned by a different art toy, don't move them again (for now).
    const foreignOwner = panels.find(p => p.dataset.artOwnerId && p.dataset.artOwnerId !== art.id);
    if (foreignOwner) return false;

    for (const p of panels) {
        setPanelInternalToArtToy(p, art.id);
        try { host.appendChild(p); } catch {}
    }

    // Remember membership on the art panel (used later for Internal Board mode + note routing).
    try {
        if (!art.__internalToyIds) art.__internalToyIds = new Set();
        for (const p of panels) art.__internalToyIds.add(p.id);
    } catch {}

    // Chain visuals should disappear on main board once internal.
    try { rebuildChainSegments(); } catch {}
    try { scheduleChainRedraw(true); } catch {}
    try { updateAllChainUIs(); } catch {}
    try { window.Persistence?.markDirty?.(); } catch {}
    return true;
}

// Drag-hover feedback for Art Toys (used while dragging music toys).
let g_artDropHoverEl = null;
function setArtDropHoverEl(nextEl) {
    const el = nextEl && nextEl.classList?.contains('art-toy-panel') ? nextEl : null;
    if (el === g_artDropHoverEl) return;
    artFlashDbg('drop-hover:set', {
      prevId: g_artDropHoverEl?.id || null,
      nextId: el?.id || null,
      internal: !!g_artInternal?.active,
      zoom: !!window.__mtZoomGesturing,
      gesture: !!window.__GESTURE_ACTIVE,
      tween: !!window.__camTweenLock,
    });
    try { g_artDropHoverEl?.classList?.remove('is-drop-target'); } catch {}
    g_artDropHoverEl = el;
    try { g_artDropHoverEl?.classList?.add('is-drop-target'); } catch {}
}
function clearArtDropHoverEl() {
    setArtDropHoverEl(null);
}

// Shared art trigger routing:
// normalize internal note events into one 8-slot payload contract for all art toys.
function flashInternalArtGhostForArtId(artId) {
  if (!artId) return false;
  recordArtFlashIntent('ghost:attempt', { artId });
  if (!g_artInternal?.active) {
    artFlashDbg('ghost:skip:not-internal', { artId });
    return false;
  }
  try {
    // Internal board swaps world IDs during active mode, so select by class+owner only.
    const ghost = document.querySelector(`.internal-art-anchor-ghost[data-art-toy-id="${CSS.escape(String(artId))}"]`);
    if (!ghost) {
      artFlashDbg('ghost:skip:not-found', { artId });
      return false;
    }
    const circle = ghost.querySelector('.art-toy-circle');
    if (circle) {
      // Prefer WAAPI pulse to avoid stale CSS class replay on viewport commit/unfreeze.
      try {
        circle.__artGhostFlashAnim?.cancel?.();
      } catch {}
      if (typeof circle.animate === 'function') {
        try {
          const anim = circle.animate(
            [
              { transform: 'scale(1)', filter: 'brightness(1) saturate(1)' },
              { transform: 'scale(1.03)', filter: 'brightness(2.2) saturate(1.35)' },
              { transform: 'scale(1)', filter: 'brightness(1) saturate(1)' },
            ],
            { duration: 180, easing: 'ease-out' }
          );
          circle.__artGhostFlashAnim = anim;
          const clearAnimRef = () => {
            if (circle.__artGhostFlashAnim === anim) circle.__artGhostFlashAnim = null;
          };
          anim.addEventListener('finish', clearAnimRef, { once: true });
          anim.addEventListener('cancel', clearAnimRef, { once: true });
        } catch {}
      }
    }
    // Keep CSS class clear by default so zoom commit cannot replay old flash state.
    ghost.classList.remove('flash');
    // CSS fallback path for environments without WAAPI support.
    if (!circle || typeof circle.animate !== 'function') {
      ghost.classList.remove('flash');
      void ghost.offsetWidth;
      ghost.classList.add('flash');
      try { clearTimeout(ghost.__artGhostFlashClearTimer); } catch {}
      ghost.__artGhostFlashClearTimer = setTimeout(() => {
        try { ghost.classList.remove('flash'); } catch {}
        ghost.__artGhostFlashClearTimer = 0;
      }, 240);
    }
    recordArtFlashIntent('ghost:flashed', { artId });
    artFlashDbg('ghost:flashed', { artId, ghostFound: true });
    return true;
  } catch {}
  artFlashDbg('ghost:skip:error', { artId });
  return false;
}

function resolveToyPanelByToyId(toyId) {
  if (!toyId) return null;
  const id = String(toyId);
  try {
    let panel = document.getElementById(id);
    if (!panel) {
      panel = document.querySelector(`.toy-panel[data-audiotoyid="${CSS.escape(id)}"]`)
        || document.querySelector(`.toy-panel[data-toyid="${CSS.escape(id)}"]`);
    }
    if (panel && panel.classList?.contains('toy-panel')) return panel;
  } catch {}
  return null;
}

let g_artTriggerRouter = null;
try {
  g_artTriggerRouter = createArtTriggerRouter({
    resolvePanelByToyId: resolveToyPanelByToyId,
    getActiveInternalArtToyId: () => (g_artInternal?.active ? g_artInternal?.artToyId : null),
  });
} catch {}
const g_recentArtSlotTriggers = new Map();
const ART_SLOT_TRIGGER_DEDUPE_MS = 45;

function artTriggerDbgEnabled() {
  try {
    if (window.__MT_DEBUG_ART_TRIGGER) return true;
    return localStorage.getItem('MT_DEBUG_ART_TRIGGER') === '1';
  } catch {}
  return false;
}

function artTriggerDbg(tag, data = null) {
  if (!artTriggerDbgEnabled()) return;
  try {
    // eslint-disable-next-line no-console
    console.log('[ArtTrigger]', tag, data || {});
  } catch {}
}

function handleArtTriggerVisuals(trigger) {
  if (!trigger || !trigger.artToyId) return false;
  const source = trigger.source || 'unknown';
  const artId = trigger.artToyId;
  const panelId = trigger.panelId || null;
  const internalActive = !!g_artInternal?.active;
  const sourceIsToyNote = source === 'toy:note';
  const hasSlot = Number.isFinite(Number(trigger.slotIndex));
  if (!hasSlot) {
    artTriggerDbg('drop:no-slot', {
      source,
      artId,
      panelId,
      toyId: trigger?.toyId || null,
      note: trigger?.note ?? null,
      slotIndex: trigger?.slotIndex ?? null,
      timestamp: trigger?.timestamp ?? null,
    });
    // Avoid accidental slot-0 fallback in art toys when a trigger does not
    // carry a resolvable sequence position.
    return false;
  }
  const slot = Math.trunc(Number(trigger.slotIndex)) % 8;
  // Use local receipt time for dedupe. Incoming trigger timestamps can be in
  // different units (AudioContext seconds vs performance milliseconds).
  const triggerNow = (performance?.now?.() ?? Date.now());
  const dedupeToyKey = String(trigger?.toyId || trigger?.panelId || 'unknown');
  const dedupeKey = `${artId}|${slot}|${dedupeToyKey}`;
  const lastHit = Number(g_recentArtSlotTriggers.get(dedupeKey) || 0);
  if (Number.isFinite(lastHit) && (triggerNow - lastHit) >= 0 && (triggerNow - lastHit) < ART_SLOT_TRIGGER_DEDUPE_MS) {
    artTriggerDbg('drop:dedupe', {
      source,
      artId,
      panelId,
      toyId: trigger?.toyId || null,
      slot,
      dtMs: triggerNow - lastHit,
      triggerNow,
      lastHit,
    });
    return false;
  }
  g_recentArtSlotTriggers.set(dedupeKey, triggerNow);
  artTriggerDbg('accept', {
    source,
    artId,
    panelId,
    toyId: trigger?.toyId || null,
    slot,
    note: trigger?.note ?? null,
    velocity: trigger?.velocity ?? null,
    timestamp: trigger?.timestamp ?? null,
  });

  recordArtFlashIntent('owner:attempt', { source, artId, panelId });
  artFlashDbg('owner:attempt', {
    source,
    artId,
    panelId,
    slotIndex: trigger.slotIndex,
    ...getArtFlashMotionSnapshot(),
  });

  const art = document.getElementById(artId);
  let flashed = false;

  // Keep existing behavior: toy:note is mainly an internal reliability hook.
  // External flashes continue to come from scheduler/playhead paths.
  const allowToyNoteExternal = !!window.__NOTE_SCHEDULER_ENABLED;
  const allowExternalFlash = !(sourceIsToyNote && !internalActive && !allowToyNoteExternal);
  if (allowExternalFlash) {
    try {
      if (art) {
        const payload = {
          source,
          panelId,
          toyId: trigger.toyId || null,
          artId,
          slotIndex: trigger.slotIndex,
          note: trigger.note,
          velocity: trigger.velocity,
          timestamp: trigger.timestamp,
        };
        let handled = false;
        try {
          handled = art.onArtTrigger?.(payload) === true;
        } catch {}
        if (!handled) {
          art.flash?.(payload);
        }
        flashed = true;
        recordArtFlashIntent('owner:flash-call', { source, artId, panelId });
      }
    } catch {}
  }

  if (internalActive) {
    try {
      const mirror = document.querySelector(`.internal-art-anchor-ghost[data-art-toy-id="${CSS.escape(String(artId))}"]`);
      if (mirror && mirror !== art) {
        const payload = {
          source,
          panelId,
          toyId: trigger.toyId || null,
          artId,
          slotIndex: trigger.slotIndex,
          note: trigger.note,
          velocity: trigger.velocity,
          timestamp: trigger.timestamp,
        };
        let handled = false;
        try { handled = mirror.onArtTrigger?.(payload) === true; } catch {}
        if (!handled) {
          try { mirror.flash?.(payload); } catch {}
        }
      }
    } catch {}
  }

  try { if (flashInternalArtGhostForArtId(artId)) flashed = true; } catch {}

  artFlashDbg('owner:result', {
    source,
    artId,
    panelId,
    slotIndex: trigger.slotIndex,
    flashed,
    internal: internalActive,
  });
  return flashed;
}

try {
  g_artTriggerRouter?.onTrigger?.((trigger) => {
    try { handleArtTriggerVisuals(trigger); } catch {}
  });
} catch {}

function flashOwningArtToyForPanel(panel, source = 'unknown', opts = {}) {
  if (!panel) return false;
  if (!panel?.dataset?.artOwnerId) return false;
  try {
    const payload = g_artTriggerRouter?.routeFromPanel?.(panel, { source, ...(opts || {}) });
    return !!payload;
  } catch {}
  return false;
}

function flashOwningArtToyForToyId(toyId) {
  if (!toyId) return false;
  try {
    const payload = g_artTriggerRouter?.routeFromToyId?.(toyId, { source: 'toyId' });
    return !!payload;
  } catch {}
  return false;
}

try {
    window.__mtArtToys = Object.assign(window.__mtArtToys || {}, {
        updateDropHover(clientX, clientY) {
            const targetArt = findArtToyAtClientPoint(clientX, clientY);
            setArtDropHoverEl(targetArt);
            return !!targetArt;
        },
        clearDropHover() {
            clearArtDropHoverEl();
        },
        tryPlaceChainFromPanel(panel, clientX, clientY) {
            const targetArt = findArtToyAtClientPoint(clientX, clientY);
            if (!targetArt) return false;
            const placed = moveChainIntoArtToy(panel, targetArt);
            if (placed) {
              try { targetArt.flash?.(); } catch {}
            }
            return placed;
        },
        emitTriggerFromPanel(panel, payload = {}) {
            return g_artTriggerRouter?.routeFromPanel?.(panel, payload) || null;
        },
        emitTriggerFromToyId(toyId, payload = {}) {
            return g_artTriggerRouter?.routeFromToyId?.(toyId, payload) || null;
        },
        onTrigger(listener) {
            return g_artTriggerRouter?.onTrigger?.(listener) || (() => {});
        },
        moveChainIntoArtToy,
        collectChainPanelsForMove,
    });
} catch {}

// Reliability hook:
// Some toy paths emit `toy:note` without always passing through the scheduler path.
// Route these into the shared trigger contract.
try {
  if (!window.__MT_ART_NOTE_FLASH_HOOK) {
    window.__MT_ART_NOTE_FLASH_HOOK = true;
    window.addEventListener('toy:note', (e) => {
      const d = e?.detail || {};
      const toyId = d.toyId;
      if (!toyId || toyId === 'master') return;
      const noteValue = (d.note != null) ? String(d.note).trim() : '';
      const hasNote = noteValue.length > 0;
      let slotFromDetail = null;
      for (const candidate of [d.slotIndex, d.col, d.step, d.index]) {
        const n = Number(candidate);
        if (!Number.isFinite(n)) continue;
        slotFromDetail = Math.trunc(n);
        break;
      }
      // Strict toy:note routing:
      // - must have an explicit slot index from the event payload
      // - must carry an actual note value
      // This avoids chain-handoff artifacts where fallback slot inference can
      // incorrectly fire slot 0/first line on transition.
      if (!Number.isFinite(slotFromDetail) || !hasNote) {
        artTriggerDbg('toy:note:drop:strict', {
          toyId,
          hasNote,
          note: hasNote ? noteValue : null,
          slotFromDetail: Number.isFinite(slotFromDetail) ? slotFromDetail : null,
          detail: {
            slotIndex: d.slotIndex ?? null,
            col: d.col ?? null,
            step: d.step ?? null,
            index: d.index ?? null,
            note: d.note ?? null,
            velocity: d.velocity ?? null,
            when: d.when ?? d.at ?? null,
          },
        });
        return;
      }
      artTriggerDbg('toy:note:route', {
        toyId,
        hasNote,
        note: hasNote ? noteValue : null,
        slotFromDetail: Number.isFinite(slotFromDetail) ? slotFromDetail : null,
        col: d.col ?? null,
        step: d.step ?? null,
        index: d.index ?? null,
        when: d.when ?? d.at ?? null,
      });
      artFlashDbg('toy:note', {
        toyId,
        slotIndex: Number.isFinite(slotFromDetail) ? slotFromDetail : null,
        internal: !!g_artInternal?.active,
        artToyId: g_artInternal?.artToyId || null,
        zoom: !!window.__mtZoomGesturing,
        gesture: !!window.__GESTURE_ACTIVE,
        tween: !!window.__camTweenLock,
      });
      try {
        g_artTriggerRouter?.routeFromToyId?.(toyId, {
          source: 'toy:note',
          slotIndex: Number.isFinite(slotFromDetail) ? slotFromDetail : null,
          col: d.col,
          step: d.step,
          index: d.index,
          note: hasNote ? noteValue : null,
          velocity: d.velocity,
          timestamp: d.when ?? d.at ?? null,
          meta: { instrument: d.instrument || null },
        });
      } catch {}
    });
  }
} catch {}

// ---------------------------------------------------------------------------
// Art Toy: Internal Board (first pass)
// ---------------------------------------------------------------------------

function ensureInternalBoardOverlay() {
  if (g_artInternal._els?.overlay) return g_artInternal._els;

  // NOTE: internal board DOM is created once; behaviour is driven by swap identity on enter/exit.
  const overlay = document.createElement('div');
  overlay.id = 'internal-board-overlay';

  const frame = document.createElement('div');
  frame.id = 'internal-board-frame';

  const viewport = document.createElement('div');
  viewport.id = 'internal-board-viewport';

  const world = document.createElement('div');
  world.id = 'internal-board-world';
  viewport.appendChild(world);

  const title = document.createElement('div');
  title.id = 'internal-board-title';
  title.textContent = 'Inside Art Toy';

  const exitBtn = document.createElement('button');
  exitBtn.id = 'internal-board-exit';
  exitBtn.className = 'c-btn';
  exitBtn.type = 'button';
  exitBtn.setAttribute('aria-label', 'Exit Internal View');
  exitBtn.title = 'Exit';
  exitBtn.innerHTML = '<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core"></div>';
  try {
    const exitCore = exitBtn.querySelector('.c-btn-core');
    if (exitCore) exitCore.style.setProperty('--c-btn-icon-url', "url('./assets/UI/T_ButtonExit.png')");
  } catch {}

  frame.appendChild(viewport);
  overlay.appendChild(frame);
  overlay.appendChild(exitBtn);
  document.body.appendChild(overlay);

  // -------------------------------------------------------------------------
  // Internal board camera
  // -------------------------------------------------------------------------
  // We want the internal board to feel *identical* to the main board:
  // smooth zoom, smooth toy scaling, stable dot grid.
  //
  // The main board already has a mature camera system. In internal mode we
  // "swap identity" so the internal viewport temporarily owns .board-viewport
  // and the internal world temporarily owns #board. That lets the existing
  // camera code drive the internal board.
  //
  // Therefore: DO NOT install a second camera here (double-updates cause drift/snaps).
  //
  // We only keep a tiny helper to read the current camera vars for local math
  // (eg header-drag pixel->world conversion).
  const readInternalViewportCamera = () => {
    const cs = viewport ? getComputedStyle(viewport) : null;
    const scale = cs ? parseFloat(cs.getPropertyValue('--bv-scale')) : NaN;
    const tx = cs ? parseFloat(cs.getPropertyValue('--bv-tx')) : NaN;
    const ty = cs ? parseFloat(cs.getPropertyValue('--bv-ty')) : NaN;
    return {
      scale: Number.isFinite(scale) ? scale : 1,
      tx: Number.isFinite(tx) ? tx : 0,
      ty: Number.isFinite(ty) ? ty : 0,
    };
  };

  // Seed vars for frame 0. (Once swapped, board-viewport will keep them updated.)
  try {
    if (!viewport.style.getPropertyValue('--bv-scale')) viewport.style.setProperty('--bv-scale', String(g_artInternal.scale || 1));
    if (!viewport.style.getPropertyValue('--bv-tx')) viewport.style.setProperty('--bv-tx', `${g_artInternal.tx || 0}px`);
    if (!viewport.style.getPropertyValue('--bv-ty')) viewport.style.setProperty('--bv-ty', `${g_artInternal.ty || 0}px`);
  } catch {}

  // -------------------------------------------------------------------------
  // Internal board: toy header dragging (local fix)
  // -------------------------------------------------------------------------
  // Some of the existing header-drag logic can remain bound to the main viewport.
  // This ensures internal-board toys can be dragged reliably regardless.
  const dragState = {
    active: false,
    pointerId: -1,
    panel: null,
    startClientX: 0,
    startClientY: 0,
    startLeft: 0,
    startTop: 0,
    originLeft: 0,
    originTop: 0,
    overlapping: false,
  };
  const DRAG_OVERLAP_CLASS = 'toy-overlap';
  const DRAG_OVERLAP_FLASH_CLASS = 'toy-overlap-flash';
  const DRAG_LERP_MS = 240;
  const DRAG_OVERLAP_BUFFER = 40;
  const SAFE_SEARCH_STEP = 16;
  const SAFE_SEARCH_MAX = 360;

  const isChainPanel = (panel) => {
    if (!panel?.dataset) return false;
    return !!(
      panel.dataset.chainParent ||
      panel.dataset.prevToyId ||
      panel.dataset.nextToyId ||
      panel.dataset.chainHasChild === '1'
    );
  };

  const getPanelRectForOverlap = (panel, overrideX, overrideY) => {
    const cs = getComputedStyle(panel);
    const w = Math.max(1, panel.offsetWidth || parseFloat(cs.width) || 1);
    const h = Math.max(1, panel.offsetHeight || parseFloat(cs.height) || 1);
    let x = Number.isFinite(overrideX) ? overrideX : parseFloat(panel.style.left);
    let y = Number.isFinite(overrideY) ? overrideY : parseFloat(panel.style.top);
    if (!Number.isFinite(x)) x = panel.offsetLeft || 0;
    if (!Number.isFinite(y)) y = panel.offsetTop || 0;
    return { x, y, w, h };
  };

  const rectsOverlapForDrag = (a, b, pad = 0) => {
    const ax1 = a.x - pad;
    const ay1 = a.y - pad;
    const ax2 = a.x + a.w + pad;
    const ay2 = a.y + a.h + pad;
    const bx1 = b.x - pad;
    const by1 = b.y - pad;
    const bx2 = b.x + b.w + pad;
    const by2 = b.y + b.h + pad;
    return (ax1 < bx2) && (ax2 > bx1) && (ay1 < by2) && (ay2 > by1);
  };

  const collectOtherRectsForDrag = (panel) => {
    const activeOwner = String(g_artInternal?.artToyId || '');
    const out = [];
    world.querySelectorAll(':scope > .toy-panel').forEach((other) => {
      if (other === panel) return;
      if (other.classList.contains('toy-zoomed')) return;
      const owner = String(other.dataset?.artOwnerId || '');
      if (activeOwner && owner && owner !== activeOwner) return;
      const r = getPanelRectForOverlap(other);
      if (r.w <= 0 || r.h <= 0) return;
      out.push(r);
    });
    return out;
  };

  const overlapsAnyForDrag = (rect, others) => {
    for (let i = 0; i < others.length; i++) {
      if (rectsOverlapForDrag(rect, others[i], DRAG_OVERLAP_BUFFER)) return true;
    }
    return false;
  };

  const findSafePositionForDrag = (startRect, others) => {
    if (!overlapsAnyForDrag(startRect, others)) return { x: startRect.x, y: startRect.y };
    const step = SAFE_SEARCH_STEP;
    const maxR = Math.max(step, SAFE_SEARCH_MAX);
    for (let r = step; r <= maxR; r += step) {
      for (let dx = -r; dx <= r; dx += step) {
        const top = { x: startRect.x + dx, y: startRect.y - r, w: startRect.w, h: startRect.h };
        if (!overlapsAnyForDrag(top, others)) return { x: top.x, y: top.y };
        const bot = { x: startRect.x + dx, y: startRect.y + r, w: startRect.w, h: startRect.h };
        if (!overlapsAnyForDrag(bot, others)) return { x: bot.x, y: bot.y };
      }
      for (let dy = -r + step; dy <= r - step; dy += step) {
        const left = { x: startRect.x - r, y: startRect.y + dy, w: startRect.w, h: startRect.h };
        if (!overlapsAnyForDrag(left, others)) return { x: left.x, y: left.y };
        const right = { x: startRect.x + r, y: startRect.y + dy, w: startRect.w, h: startRect.h };
        if (!overlapsAnyForDrag(right, others)) return { x: right.x, y: right.y };
      }
    }
    return null;
  };

  const setOverlapState = (panel, overlapping) => {
    if (!panel) return;
    panel.classList.toggle(DRAG_OVERLAP_CLASS, !!overlapping);
  };

  const flashOverlap = (panel) => {
    if (!panel) return;
    panel.classList.remove(DRAG_OVERLAP_CLASS);
    panel.classList.add(DRAG_OVERLAP_FLASH_CLASS);
    try { clearTimeout(panel.__overlapFlashTimer); } catch {}
    panel.__overlapFlashTimer = setTimeout(() => {
      panel.classList.remove(DRAG_OVERLAP_FLASH_CLASS);
      panel.__overlapFlashTimer = null;
    }, 420);
  };

  const lerpPanelTo = (panel, from, to, durationMs, onDone) => {
    const start = performance?.now?.() ?? Date.now();
    const dur = Math.max(60, durationMs || DRAG_LERP_MS);
    const notifyChainMove = (typeof window !== 'undefined' && typeof window.__chainNotifyPanelMoved === 'function')
      ? window.__chainNotifyPanelMoved
      : null;
    const beginChainMove = (typeof window !== 'undefined' && typeof window.__chainBeginPanelMove === 'function')
      ? window.__chainBeginPanelMove
      : null;
    const shouldNotifyChain = !!notifyChainMove && isChainPanel(panel);
    if (shouldNotifyChain && beginChainMove) {
      beginChainMove(panel, { left: from?.x, top: from?.y });
    }
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      const x = from.x + (to.x - from.x) * eased;
      const y = from.y + (to.y - from.y) * eased;
      panel.style.left = `${x}px`;
      panel.style.top = `${y}px`;
      if (shouldNotifyChain) notifyChainMove(panel);
      if (t < 1) {
        requestAnimationFrame(tick);
      } else if (typeof onDone === 'function') {
        onDone();
      }
    };
    requestAnimationFrame(tick);
  };

  const onHeaderPointerDown = (e) => {
    if (!g_artInternal.active) return;
    const header = e.target?.closest?.('.toy-header');
    if (!header) return;
    const panel = header.closest('.toy-panel');
    if (!panel) return;

    // If the pointerdown started on an interactive control, DO NOT start a drag.
    // Otherwise we suppress the click (which is exactly what you're seeing in internal-board).
    // This keeps Random/Clear/Instrument/etc working.
    const interactive = e.target?.closest?.(
      'button, a, select, input, textarea, [role="button"], [data-action], .c-btn, .toy-inst-btn'
    );
    if (interactive) return;

    // Only drag toys that are actually inside the current internal board.
    // (We mark internal toys with data-art-owner-id already.)
    const owner = panel.dataset?.artOwnerId || panel.getAttribute('data-art-owner-id');
    if (g_artInternal.artToyId && owner && owner !== g_artInternal.artToyId) return;

    dragState.active = true;
    dragState.pointerId = e.pointerId;
    dragState.panel = panel;
    dragState.startClientX = e.clientX;
    dragState.startClientY = e.clientY;
    dragState.startLeft = parseFloat(panel.style.left) || 0;
    dragState.startTop = parseFloat(panel.style.top) || 0;
    dragState.originLeft = dragState.startLeft;
    dragState.originTop = dragState.startTop;
    dragState.overlapping = false;
    setOverlapState(panel, false);

    try { header.setPointerCapture?.(e.pointerId); } catch {}
    e.preventDefault();
    e.stopPropagation();
  };

  const onHeaderPointerMove = (e) => {
    if (!g_artInternal.active) return;
    if (!dragState.active) return;
    if (e.pointerId !== dragState.pointerId) return;
    if (!dragState.panel) return;

    // Convert screen-space delta into world-space delta using current scale.
    const dxScreen = e.clientX - dragState.startClientX;
    const dyScreen = e.clientY - dragState.startClientY;
    const s = Math.max(0.001, readInternalViewportCamera().scale || 1);
    const dxWorld = dxScreen / s;
    const dyWorld = dyScreen / s;

    const nx = dragState.startLeft + dxWorld;
    const ny = dragState.startTop + dyWorld;
    dragState.panel.style.left = `${nx}px`;
    dragState.panel.style.top = `${ny}px`;
    const rect = getPanelRectForOverlap(dragState.panel, nx, ny);
    const overlap = overlapsAnyForDrag(rect, collectOtherRectsForDrag(dragState.panel));
    dragState.overlapping = overlap;
    setOverlapState(dragState.panel, overlap);

    e.preventDefault();
    e.stopPropagation();
  };

  const endHeaderDrag = (e) => {
    if (!dragState.active) return;
    if (e.pointerId !== dragState.pointerId) return;
    const panel = dragState.panel;
    const overlapping = !!dragState.overlapping;
    const origin = { x: dragState.originLeft, y: dragState.originTop };
    dragState.active = false;
    dragState.pointerId = -1;
    dragState.panel = null;
    dragState.overlapping = false;
    dragState.originLeft = 0;
    dragState.originTop = 0;
    if (panel) {
      if (overlapping) {
        const currentRect = getPanelRectForOverlap(panel);
        const others = collectOtherRectsForDrag(panel);
        const safe = findSafePositionForDrag(currentRect, others);
        const distOrigin = (currentRect.x - origin.x) ** 2 + (currentRect.y - origin.y) ** 2;
        const distSafe = safe
          ? (currentRect.x - safe.x) ** 2 + (currentRect.y - safe.y) ** 2
          : Number.POSITIVE_INFINITY;
        const target = (safe && distSafe < distOrigin) ? safe : origin;
        flashOverlap(panel);
        lerpPanelTo(panel, { x: currentRect.x, y: currentRect.y }, target, DRAG_LERP_MS, () => {
          try { updateChains(); updateAllChainUIs(); } catch {}
          try { rebuildChainSegments(); scheduleChainRedraw(true); } catch {}
          try { window.Persistence?.markDirty?.(); } catch {}
        });
      } else {
        setOverlapState(panel, false);
      }
    }
  };

  viewport.addEventListener('pointerdown', onHeaderPointerDown, { passive: false });
  viewport.addEventListener('pointermove', onHeaderPointerMove, { passive: false });
  viewport.addEventListener('pointerup', endHeaderDrag, { passive: true });
  viewport.addEventListener('pointercancel', endHeaderDrag, { passive: true });

  // Exit is animated now (scale back down to the owning art toy).
  exitBtn.addEventListener('click', () => {
    try { requestExitInternalBoard(); } catch {}
  });

  g_artInternal._els = { overlay, frame, viewport, world, exitBtn, title };
  return g_artInternal._els;
}

function getArtToyClientCenter(artToyId) {
  const el = artToyId ? document.getElementById(artToyId) : null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r || !Number.isFinite(r.left)) return null;
  return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.5 };
}

function animateInternalBoardIn(artToyId) {
  const { frame } = ensureInternalBoardOverlay();
  if (!frame) return;

  const c = getArtToyClientCenter(artToyId);
  // If we can’t resolve it (rare), fall back to center screen.
  const ox = c ? c.x : window.innerWidth * 0.5;
  const oy = c ? c.y : window.innerHeight * 0.5;

  frame.style.transformOrigin = `${ox}px ${oy}px`;

  // Enter animation: do it with inline styles so we don't depend on any CSS selector winning the cascade.
  // 1) Set start state with transitions temporarily disabled
  try {
    frame.style.transition = 'none';
    frame.style.transform = 'scale(0.02)';
    frame.style.opacity = '0';
    void frame.getBoundingClientRect(); // commit start state
  } catch {}

  // 2) Re-enable transitions and animate to end state on next frame(s)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!document.body.classList.contains('internal-board-active')) return;
      try { frame.style.transition = ''; } catch {}
      try {
        frame.style.transform = 'scale(1)';
        frame.style.opacity = '1';
      } catch {}
    });
  });
}

function animateInternalBoardOut(artToyId, onDone) {
  const { overlay } = ensureInternalBoardOverlay();
  if (!overlay) { onDone?.(); return; }

  const c = getArtToyClientCenter(artToyId);
  const ox = c ? c.x : window.innerWidth * 0.5;
  const oy = c ? c.y : window.innerHeight * 0.5;
  overlay.style.transformOrigin = `${ox}px ${oy}px`;

  // Transition to exit state.
  overlay.classList.add('is-exiting');

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    overlay.removeEventListener('transitionend', onEnd, true);
    onDone?.();
  };
  const onEnd = (e) => {
    // Only finish on the overlay's own transform/opacity transition.
    if (e.target !== overlay) return;
    if (e.propertyName !== 'transform' && e.propertyName !== 'opacity') return;
    finish();
  };
  overlay.addEventListener('transitionend', onEnd, true);

  // Safety: in case transitionend doesn't fire.
  setTimeout(finish, 900);
}

function getInternalPanelsForArtToy(artToyId) {
  if (!artToyId) return [];
  return Array.from(document.querySelectorAll(`.toy-panel[data-art-owner-id="${CSS.escape(artToyId)}"]`));
}

function isInternalBoardActiveForArtToy(artToyId) {
  try {
    return !!g_artInternal?.active && g_artInternal?.artToyId === artToyId;
  } catch {}
  return false;
}

function shouldRenderToyVisuals(panel) {
  if (!panel) return false;
  if (!g_artInternal?.active) return true;
  const activeOwner = String(g_artInternal?.artToyId || '');
  if (!activeOwner) return false;
  const owner = String(panel.dataset?.artOwnerId || '');
  return !!owner && owner === activeOwner;
}

function randomizeArtToyStateStub(artToyId, mode = 'all') {
  const artPanel = getArtToyPanelById(artToyId);
  if (!artPanel) return;
  const syncId = String(artToyId || '');
  const syncCtx = g_internalArtAnchorSync.get(syncId);
  // Internal random from the mirror can mark "mirror touched", which makes sync
  // push stale mirror state back onto source. Force source as the authority for
  // this explicit randomization action.
  if (syncCtx) {
    try {
      syncCtx.touched = 'source';
      syncCtx.touchedAt = performance.now();
    } catch {}
  }
  try {
    if (mode === 'music') {
      if (typeof artPanel.onArtRandomMusic === 'function') artPanel.onArtRandomMusic();
      // Music-only random does not change art geometry/colors.
      return;
    }
    if (typeof artPanel.onArtRandomAll === 'function') {
      artPanel.onArtRandomAll();
    } else if (typeof artPanel.onArtRandomMusic === 'function') {
      artPanel.onArtRandomMusic();
    }
    // Immediately mirror source -> internal ghost so random-all visuals update in
    // the same interaction frame even when the button was clicked on the mirror.
    if (syncCtx?.mirrorPanel && typeof artPanel.getArtToyPersistState === 'function') {
      try {
        const state = normalizeArtStateForSync(artPanel.getArtToyPersistState());
        syncCtx.mirrorPanel.applyArtToyPersistState?.(state);
      } catch {}
    }
  } catch {}
}

function collectAssociatedArtSlots(artToyId) {
  const slots = new Set();
  const panels = getInternalPanelsForArtToy(artToyId);
  for (let col = 0; col < 8; col++) {
    const hit = panels.some((p) => panelHasNotesAtColumn(p, col));
    if (hit) slots.add(col);
  }
  return Array.from(slots);
}

function syncArtToySlotsFromInternalNotes(artToyId) {
  if (!artToyId) return;
  const artPanel = getArtToyPanelById(artToyId);
  if (!artPanel) return;
  try {
    const slots = collectAssociatedArtSlots(artToyId);
    if (typeof artPanel.onArtSetActiveSlots === 'function') {
      artPanel.onArtSetActiveSlots(slots);
    }
  } catch {}
}

function randomizeToyMusic(panel, dbg = null) {
  if (!panel) return;
  const toyType = panel?.dataset?.toy;
  const hasApi = typeof panel.__toyRandomMusic === 'function';

  if (dbg) {
    __artRandLog('randomizeToyMusic:enter', {
      ...dbg,
      toyType,
      hasApi,
      isConnected: panel.isConnected,
      display: getComputedStyle(panel).display
    });
  }

  if (hasApi) {
    try {
      const t = panel?.dataset?.toy;
      if (dbg && t === 'drawgrid') {
        __artRandLog('randomizeToyMusic:before', { ...dbg, toyType: t, dump: __dumpDrawgridNotes(panel) });
      }
      panel.__toyRandomMusic();
      if (dbg && t === 'drawgrid') {
        __artRandLog('randomizeToyMusic:after', { ...dbg, toyType: t, dump: __dumpDrawgridNotes(panel) });
      }
    } catch (e) {
      if (dbg) __artRandLog('randomizeToyMusic:apiError', { ...dbg, err: String(e?.message || e) });
    }
  } else {
    try {
      const eventName =
        (toyType === 'loopgrid' || toyType === 'loopgrid-drum')
          ? 'toy-random'
          : 'toy-random-notes';

      __artRandLog('randomizeToyMusic:eventDispatch', { toyType, eventName });
      panel.dispatchEvent(new CustomEvent(eventName, { bubbles: true, composed: true }));
      if (dbg && toyType === 'drawgrid') {
        __artRandLog('randomizeToyMusic:afterEvent', { ...dbg, toyType, dump: __dumpDrawgridNotes(panel) });
      }
    } catch (e) {
      __artRandLog('randomizeToyMusic:eventError', { err: String(e?.message || e) });
    }
  }
}

// Debug helpers: capture a stable-ish snapshot of DrawGrid note state so we can prove
// exactly when/where a sequence changes.
function __artRandDumpDrawgrid(panel) {
  try {
    if (!panel || panel?.dataset?.toy !== 'drawgrid') return null;
    return __dumpDrawgridNotes(panel);
  } catch {
    return null;
  }
}
function __artRandLogDrawgrid(tag, info, panel) {
  if (!window.__MT_DEBUG_ART_RANDOM) return;
  try {
    __artRandLog(tag, {
      ...(info || {}),
      panelId: panel?.id,
      dump: __artRandDumpDrawgrid(panel),
    });
  } catch {}
}

// Global capture of random events so we can see if *anything* fires a random that touches music.
// (This is the "tell the whole story" instrumentation.)
try {
  if (window.__MT_DEBUG_ART_RANDOM && !window.__artRandEventCaptureInstalled) {
    window.__artRandEventCaptureInstalled = true;
    const handler = (e) => {
      try {
        const tgt = e?.target;
        const panel =
          (tgt?.closest?.('.toy-panel')) ||
          (tgt?.classList?.contains?.('toy-panel') ? tgt : null);
        if (!panel) return;
        const toyType = panel?.dataset?.toy || null;
        // Only dump drawgrid state; other toys are noise for this bug.
        if (toyType !== 'drawgrid') return;

        const info = {
          eventName: e.type,
          artOwnerId: panel?.dataset?.artOwnerId || panel?.dataset?.artOwnerID || null,
          isConnected: !!panel.isConnected,
          display: (() => { try { return getComputedStyle(panel).display; } catch { return '??'; } })(),
        };

        __artRandLogDrawgrid('event:capture:before', info, panel);
        requestAnimationFrame(() => {
          __artRandLogDrawgrid('event:capture:afterRaf', info, panel);
        });
      } catch {}
    };
    document.addEventListener('toy-random', handler, true);
    document.addEventListener('toy-random-notes', handler, true);
    document.addEventListener('toy-random-blocks', handler, true);
  }
} catch {}

function markPendingInternalRandom(panelOrId, which) {
  const artToyId = typeof panelOrId === 'string'
    ? panelOrId
    : (panelOrId?.id || panelOrId?.dataset?.artToyId || null);
  if (!artToyId) return;
  const artPanel = document.getElementById(artToyId);
  if (!artPanel) return;
  // pendingRandAll supports multiple modes:
  // - '1'          => apply full random-all on enter
  // - 'blocksOnly' => apply ONLY non-music random on enter (keeps notes stable)
  if (which === 'music') artPanel.dataset.pendingRandMusic = '1';
  if (which === 'all') artPanel.dataset.pendingRandAll = '1';
  if (which === 'allBlocksOnly') artPanel.dataset.pendingRandAll = 'blocksOnly';
  __artRandLog('markPending', { artToyId, which });
}

function applyPendingInternalRandomIfNeeded(artToyId) {
  if (!artToyId) return;
  if (!isInternalBoardActiveForArtToy(artToyId)) return;

  const artPanel = document.getElementById(artToyId);
  if (!artPanel) return;

  const wantMusic = artPanel.dataset.pendingRandMusic === '1';
  const pendingAllMode = artPanel.dataset.pendingRandAll || '0';
  const wantAll = pendingAllMode === '1' || pendingAllMode === 'blocksOnly';
  if (!wantMusic && !wantAll) return;

  __artRandLog('applyPending:begin', { artToyId, wantMusic, wantAll, pendingAllMode });

  // Clear flags first to avoid loops if anything throws.
  artPanel.dataset.pendingRandMusic = '0';
  artPanel.dataset.pendingRandAll = '0';

  // Wait until after internal mode has swapped board identity + had a frame to lay out.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        // IMPORTANT: When the user hit Random All from the *external* view, we already randomized
        // the music immediately so the first press is audible. If we then "random all" again
        // on enter, DrawGrid will re-roll its sequence (toy-random => RNG.handleRandomizeLine()),
        // which feels like the tune changed just by opening the toy.
        //
        // So when applying pending "all" on enter, NEVER call randomizeInternalToysForArtToy(...,'all')
        // because that re-runs music random. Instead:
        //  - DrawGrid: apply ONLY non-music random (toy-random-blocks)
        //  - Other toys: apply toy-random
        __artRandLog('applyPending:do', { artToyId, mode: wantAll ? 'all' : 'music', pendingAllMode });

        if (wantAll) {
          const panels = getInternalPanelsForArtToy(artToyId);
          for (const p of panels) {
            const toyType = p?.dataset?.toy || null;
            if (toyType === 'drawgrid') {
              // For DrawGrid, any "all" re-randomization on enter changes the tune.
              // If this pending flag came from external Random All, skip entirely.
              if (pendingAllMode === 'blocksOnly') {
                __artRandLog('applyPending:drawgridSkip', { artToyId, panelId: p.id, pendingAllMode });
                continue;
              }
              __artRandLog('applyPending:drawgridBlocksOnly', { artToyId, panelId: p.id, pendingAllMode });
              __artRandLogDrawgrid('applyPending:drawgridBlocksOnly:before', { artToyId, pendingAllMode }, p);
              try { p.dispatchEvent(new CustomEvent('toy-random-blocks', { bubbles: true, composed: true })); } catch {}
              requestAnimationFrame(() => {
                __artRandLogDrawgrid('applyPending:drawgridBlocksOnly:afterRaf', { artToyId, pendingAllMode }, p);
              });
              continue;
            }
            __artRandLog('applyPending:otherAll', { artToyId, panelId: p?.id, toyType, pendingAllMode });
            try { p.dispatchEvent(new CustomEvent('toy-random', { bubbles: true, composed: true })); } catch {}
          }
          try { window.Persistence?.markDirty?.(); } catch {}
          return;
        }

        if (wantMusic) {
          randomizeInternalToysForArtToy(artToyId, 'music', { allowDefer: false, source: 'applyPending' });
        }
      } catch {}
    });
  });
}

function getArtToyPanelById(artToyId) {
  if (!artToyId) return null;
  try {
    const el = document.getElementById(artToyId);
    if (el && el.classList && el.classList.contains('art-toy-panel')) return el;
  } catch {}
  return null;
}

function pickDefaultInternalToyKindForArtToy(artToyId) {
  // Default internal toy by Art Toy type.
  const artPanel = getArtToyPanelById(artToyId);
  const kind = artPanel?.dataset?.artToy || '';
  if (kind === 'fireworks') return 'loopgrid'; // Simple Rhythm
  if (kind === 'flashCircle') return 'drawgrid';
  return 'drawgrid';
}

function isPanelLayoutReady(panel) {
  if (!panel || !panel.isConnected) return false;
  try {
    const r = panel.getBoundingClientRect?.();
    return !!r && r.width > 4 && r.height > 4;
  } catch {}
  return false;
}

function ensureDefaultInternalToyExistsInHost(artToyId) {
  if (!artToyId) return null;
  const artPanel = getArtToyPanelById(artToyId);
  if (!artPanel) return null;
  if (artPanel.dataset?.internalBootstrapped === '1') return null;

  const host = ensureArtInternalHost();

  // Mark as bootstrapped immediately to avoid accidental double-spawn.
  try { artPanel.dataset.internalBootstrapped = '1'; } catch {}

  const kind = pickDefaultInternalToyKindForArtToy(artToyId);
  __artRandLog('ensureDefaultInternalToyExistsInHost:spawn', { artToyId, kind });
  try {
    const p = createToyPanelAt(kind, {
      centerX: 0,
      centerY: 0,
      autoCenter: false,
      allowOffscreen: true,
      skipSpawnPlacement: true,
      containerEl: host,
      artOwnerId: artToyId,
    });
    __artRandLog('ensureDefaultInternalToyExistsInHost:done', {
      artToyId,
      created: !!p,
      toyType: p?.dataset?.toy,
      panelId: p?.id,
      hostDisplay: host?.style?.display,
      panelReady: (() => {
        try {
          const p = document.getElementById(panelId);
          if (!p) return { exists: false };
          return {
            exists: true,
            isConnected: p.isConnected,
            display: (() => { try { return getComputedStyle(p).display; } catch { return '??'; } })(),
            hasToyRandomMusic: typeof p.__toyRandomMusic === 'function',
            hasDrawToy: !!p.__drawToy,
            hasToyApi: !!p.__toyApi
          };
        } catch (e) {
          return { err: String(e?.message || e) };
        }
      })()
    });
    if (p) {
      // Keep it stashed until user enters.
      p.classList.add('art-internal-toy');
      p.style.pointerEvents = 'none';
      // NOTE: don't set display:none; we want layout so randomisation works.

      // CRITICAL: initialize immediately so the *first* external Random press can:
      // - call drawgrid's headless random API
      // - start playback in the same click
      // Without this, the first press races the createToyPanelAt setTimeout(0) init.
      ensureToyPanelInitializedNow(p, 'ensureDefaultInternalToyExistsInHost');
    }
    return p || null;
  } catch (err) {
    console.warn('[InternalBoard] host default toy spawn failed', err);
    return null;
  }
}

function getInternalArtUiKeepoutRect(artToyId) {
  const home = getInternalHomeAnchorForArtToy(artToyId);
  const ax = Number.isFinite(home?.x) ? home.x : 240;
  const ay = Number.isFinite(home?.y) ? home.y : 180;
  const artType = String(getArtToyPanelById(artToyId)?.dataset?.artToy || '').toLowerCase();
  if (artType === 'lasertrails' || artType === 'lasers') {
    return {
      left: ax - 660,
      top: ay - 320,
      right: ax + 980,
      bottom: ay + 640,
    };
  }
  // Keepout region that covers the internal mirror panel plus its common control
  // footprint (header controls, volume, and art customisation area).
  return {
    left: ax - 560,
    top: ay - 180,
    right: ax + 680,
    bottom: ay + 560,
  };
}

function rectsOverlap(a, b) {
  if (!a || !b) return false;
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

function fitInternalSpawnCenterOutsideUiKeepout(artToyId, centerX, centerY, width, height, margin = 32) {
  const w = Math.max(1, Number(width) || 380);
  const h = Math.max(1, Number(height) || 320);
  const keepout = getInternalArtUiKeepoutRect(artToyId);
  const hw = w * 0.5;
  const hh = h * 0.5;
  const makeRect = (cx, cy) => ({
    left: cx - hw - margin,
    top: cy - hh - margin,
    right: cx + hw + margin,
    bottom: cy + hh + margin,
  });

  let cx = Number.isFinite(centerX) ? centerX : 0;
  let cy = Number.isFinite(centerY) ? centerY : 0;
  if (!rectsOverlap(makeRect(cx, cy), keepout)) return { x: cx, y: cy };

  // Preferred fallback: place to the right of the art UI footprint.
  cx = keepout.right + hw + margin;
  if (!rectsOverlap(makeRect(cx, cy), keepout)) return { x: cx, y: cy };

  // Secondary fallback: place below keepout if needed.
  cy = keepout.bottom + hh + margin;
  return { x: cx, y: cy };
}

function ensureDefaultInternalToyChainExistsInHost(artToyId, count = 4) {
  if (!artToyId) return null;
  const wanted = Math.max(1, Math.trunc(Number(count) || 4));
  const artPanel = getArtToyPanelById(artToyId);
  if (!artPanel) return null;
  const host = ensureArtInternalHost();
  const internalActiveForThis = isInternalBoardActiveForArtToy(artToyId);
  const internalWorld = internalActiveForThis
    ? (document.getElementById('board') || document.getElementById('internal-board-world'))
    : null;
  const kind = pickDefaultInternalToyKindForArtToy(artToyId);

  let panels = getInternalPanelsForArtToy(artToyId);
  // If this art toy is currently open, ensure all owned toys are physically in the
  // active internal world (not stashed offscreen in the hidden host).
  if (internalActiveForThis && internalWorld) {
    for (const p of panels) {
      try {
        if (internalWorld.contains(p)) continue;
        p.classList.remove('art-internal-toy');
        restoreInternalPanelAfterHiddenLayout(p);
        p.style.pointerEvents = 'auto';
        internalWorld.appendChild(p);
      } catch {}
    }
    panels = getInternalPanelsForArtToy(artToyId);
  }
  const seedPanel = panels[0] || null;
  let seedInstrument = String(seedPanel?.dataset?.instrument || '').trim();
  if (!seedInstrument) {
    const theme = getSoundThemeKey?.() || '';
    const used = collectUsedInstruments();
    const picked = pickInstrumentForToy(kind, { theme, usedIds: used, preferPriority: true });
    seedInstrument = String(picked || '').trim();
  }
  const seedInstrumentNote = seedPanel?.dataset?.instrumentNote;
  const seedInstrumentOctave = seedPanel?.dataset?.instrumentOctave;
  const seedInstrumentPitchShift = seedPanel?.dataset?.instrumentPitchShift;
  const needed = Math.max(0, wanted - panels.length);
  if (needed > 0) {
    try { artPanel.dataset.internalBootstrapped = '1'; } catch {}
    const size = pickToyPanelSize(kind) || {};
    const spawnW = Math.max(240, Number(size.width) || 380);
    const spawnH = Math.max(200, Number(size.height) || 320);
    const stepX = Math.max(spawnW + CHAIN_SPAWN_GAP + 180, spawnW + 220);
    let centerY = 0;
    let startX = 0;
    // Sequence layout rule:
    // - First toy centered on the art anchor X
    // - Entire chain sits above the full art UI keepout region
    // - Subsequent toys spaced to avoid overlap
    const home = getInternalHomeAnchorForArtToy(artToyId);
    const ax = Number.isFinite(home?.x) ? home.x : 240;
    const keepout = getInternalArtUiKeepoutRect(artToyId);
    const marginY = 44;
    startX = ax;
    centerY = keepout.top - (spawnH * 0.5) - marginY;
    for (let i = 0; i < needed; i++) {
      const index = panels.length + i;
      try {
        const p = createToyPanelAt(kind, {
          centerX: startX + index * stepX,
          centerY,
          instrument: seedInstrument || undefined,
          autoCenter: false,
          allowOffscreen: true,
          skipSpawnPlacement: false,
          containerEl: (internalActiveForThis && internalWorld) ? internalWorld : host,
          artOwnerId: artToyId,
        });
        if (!p) continue;
        if (internalActiveForThis && internalWorld) {
          p.classList.remove('art-internal-toy');
          p.style.pointerEvents = 'auto';
        } else {
          p.classList.add('art-internal-toy');
          p.style.pointerEvents = 'none';
        }
        ensureToyPanelInitializedNow(p, 'ensureDefaultInternalToyChainExistsInHost');
      } catch (err) {
        console.warn('[InternalBoard] host chain toy spawn failed', err);
      }
    }
    panels = getInternalPanelsForArtToy(artToyId);
  }

  if (!panels.length) return null;
  const ordered = panels
    .slice()
    .sort((a, b) => {
      const ax = Number.parseFloat(a?.style?.left || '0') || 0;
      const bx = Number.parseFloat(b?.style?.left || '0') || 0;
      return ax - bx;
    })
    .slice(0, wanted);

  for (let i = 0; i < ordered.length; i++) {
    const cur = ordered[i];
    const prev = ordered[i - 1] || null;
    if (!cur) continue;
    if (!prev) {
      delete cur.dataset.chainParent;
      delete cur.dataset.prevToyId;
      continue;
    }
    cur.dataset.chainParent = prev.id;
    cur.dataset.prevToyId = prev.id;
  }

  // Force a consistent instrument across the whole chain.
  if (seedInstrument) {
    for (const p of ordered) {
      try {
        p.dataset.instrument = seedInstrument;
        p.dataset.instrumentPersisted = '1';
        if (seedInstrumentOctave != null && seedInstrumentOctave !== '') p.dataset.instrumentOctave = String(seedInstrumentOctave);
        if (seedInstrumentPitchShift != null && seedInstrumentPitchShift !== '') p.dataset.instrumentPitchShift = String(seedInstrumentPitchShift);
        if (seedInstrumentNote != null && seedInstrumentNote !== '') p.dataset.instrumentNote = String(seedInstrumentNote);
        else delete p.dataset.instrumentNote;
      } catch {}
      try {
        p.dispatchEvent(new CustomEvent('toy-instrument', {
          detail: {
            value: seedInstrument,
            note: seedInstrumentNote,
            octave: seedInstrumentOctave,
            pitchShift: seedInstrumentPitchShift === '1' || seedInstrumentPitchShift === true,
          },
          bubbles: true,
          composed: true,
        }));
      } catch {}
      try {
        p.dispatchEvent(new CustomEvent('toy:instrument', {
          detail: {
            name: seedInstrument,
            value: seedInstrument,
            note: seedInstrumentNote,
            octave: seedInstrumentOctave,
            pitchShift: seedInstrumentPitchShift === '1' || seedInstrumentPitchShift === true,
          },
          bubbles: true,
          composed: true,
        }));
      } catch {}
    }
  }

  try { updateChains(); } catch {}
  try { updateAllChainUIs(); } catch {}
  try { scheduleChainRedraw(); } catch {}
  return ordered[0] || panels[0] || null;
}

// Force a toy panel to initialize immediately (guarded).
// Needed for "Random" from the external Art Toy view, where we may spawn a brand new
// internal toy and then immediately randomize/play it in the same click.
function ensureToyPanelInitializedNow(panel, reason = 'unknown') {
  if (!panel) return false;
  // Guard against double-init (createToyPanelAt also inits on setTimeout(0)).
  if (panel.__mtToyInitDone) return true;
  panel.__mtToyInitDone = true;

  try { __artRandLog?.('toyInitNow:begin', { panelId: panel.id, toyType: panel.dataset?.toy, reason }); } catch {}

  try { initializeNewToy(panel); } catch (err) { console.warn('[ensureToyPanelInitializedNow] init failed', err); }
  try { initToyChaining(panel); } catch (err) { console.warn('[ensureToyPanelInitializedNow] chain init failed', err); }

  try { __artRandLog?.('toyInitNow:done', { panelId: panel.id, toyType: panel.dataset?.toy, reason }); } catch {}
  return true;
}

function ensureDefaultInternalToyOnFirstEnter(artToyId, worldEl) {
  if (!artToyId || !worldEl) return null;

  const artPanel = getArtToyPanelById(artToyId);
  if (!artPanel) return null;
  const already = artPanel?.dataset?.internalBootstrapped === '1';
  if (already) return null;

  // Mark as bootstrapped immediately to avoid accidental double-spawn.
  try {
    if (artPanel) artPanel.dataset.internalBootstrapped = '1';
  } catch {}

  const kind = pickDefaultInternalToyKindForArtToy(artToyId);
  const homeAnchor = getInternalHomeAnchorForArtToy(artToyId);
  const expectedSize = pickToyPanelSize(kind);
  const spawnW = Math.max(240, Number(expectedSize?.width) || 380);
  const spawnH = Math.max(200, Number(expectedSize?.height) || 320);
  const ax = Number.isFinite(homeAnchor?.x) ? homeAnchor.x : 240;
  const keepout = getInternalArtUiKeepoutRect(artToyId);
  // First toy in sequence: above art UI footprint, aligned to the anchor.
  let centerX = ax;
  let centerY = keepout.top - (spawnH * 0.5) - 44;
  // Match random-chain safety behavior: run through shared spawn-placement.
  // We still seed to the same "above UI" target, but allow collision resolver.

  try {
    const p = createToyPanelAt(kind, {
      centerX,
      centerY,
      // Enter camera is already snapped by internal-board logic; avoid late smooth pan.
      autoCenter: false,
      // Allow "safe above UI" placement even when that world Y is negative.
      allowOffscreen: true,
      skipSpawnPlacement: false,
      containerEl: worldEl,
      artOwnerId: artToyId,
    });
    return p || null;
  } catch (err) {
    console.warn('[InternalBoard] default toy spawn failed', err);
    return null;
  }
}

function setInternalBoardTransform(scale, tx, ty) {
  g_artInternal.scale = Math.max(0.2, Math.min(3.0, Number.isFinite(scale) ? scale : 1));
  g_artInternal.tx = Number.isFinite(tx) ? tx : 0;
  g_artInternal.ty = Number.isFinite(ty) ? ty : 0;

  // If we're currently in internal-board mode and have swapped identity,
  // the *main* board camera system will transform #board for us.
  // Writing an inline transform here would double-transform and cause
  // chains/anchors to be offset / wrong scale.
  const swapped = !!(g_artInternal?._swap?.didSwap);

  // Always seed the internal viewport vars (used by internal-chain drawing and math).
  try {
    const { viewport } = ensureInternalBoardOverlay();
    if (viewport) {
      viewport.style.setProperty('--bv-scale', String(g_artInternal.scale));
      viewport.style.setProperty('--bv-tx', `${g_artInternal.tx}px`);
      viewport.style.setProperty('--bv-ty', `${g_artInternal.ty}px`);
    }
  } catch {}

  if (swapped) return;

  // Prefer the internal-board overlay's transform helper (keeps dots + toys in sync).
  try {
    if (typeof g_artInternal._applyTransform === 'function') {
      g_artInternal._applyTransform();
      return;
    }
  } catch {}

  // Fallback:
  // - BEFORE swap: we can apply a direct transform so the internal board looks correct immediately.
  // - AFTER swap: DO NOT apply a world transform here (board-viewport will drive #board),
  //   otherwise toys get double-transformed and chains drift/scale incorrectly.
  try {
    const { world, viewport } = ensureInternalBoardOverlay();
    if (world) {
      if (swapped) {
        // Clear any leftover inline transform so camera math stays consistent.
        world.style.transform = '';
      } else {
        world.style.transform = `translate(${g_artInternal.tx}px, ${g_artInternal.ty}px) scale(${g_artInternal.scale})`;
      }
    }
  } catch {}
}

function getInternalViewportSize() {
  const viewport = document.getElementById('internal-board-viewport');
  const vr = viewport?.getBoundingClientRect?.();
  const viewW = (Number.isFinite(vr?.width) && vr.width > 0) ? vr.width : 960;
  const viewH = (Number.isFinite(vr?.height) && vr.height > 0) ? vr.height : 640;
  return { viewW, viewH };
}

function getInternalHomeGhostSize() {
  // Keep internal mirror at the normal art-toy size so UI/layout matches external.
  return 220;
}

const g_internalArtAnchorSync = new Map();

function cloneArtState(state) {
  try { return JSON.parse(JSON.stringify(state || {})); } catch {}
  return null;
}

function normalizeArtStateForSync(state) {
  const next = cloneArtState(state) || {};
  // Controls visibility is intentionally local to each surface. Mirroring this
  // causes the shared "single open controls panel" base behavior to fight itself
  // between external panel and internal mirror.
  try { delete next.controlsVisible; } catch {}
  return next;
}

function stopInternalArtAnchorSync(artToyId) {
  const id = String(artToyId || '');
  const ctx = g_internalArtAnchorSync.get(id);
  if (!ctx) return;
  try { if (ctx.raf) cancelAnimationFrame(ctx.raf); } catch {}
  try { ctx.sourcePanel?.removeEventListener?.('pointerdown', ctx.onSourcePointerDown, true); } catch {}
  try { ctx.mirrorPanel?.removeEventListener?.('pointerdown', ctx.onMirrorPointerDown, true); } catch {}
  try { ctx.moMirrorControls?.disconnect?.(); } catch {}
  try { ctx.moSourceControls?.disconnect?.(); } catch {}
  g_internalArtAnchorSync.delete(id);
}

function startInternalArtAnchorSync(artToyId, sourcePanel, mirrorPanel) {
  const id = String(artToyId || '');
  if (!id || !sourcePanel || !mirrorPanel) return;
  stopInternalArtAnchorSync(id);

  const ctx = {
    artToyId: id,
    sourcePanel,
    mirrorPanel,
    raf: 0,
    touched: 'source',
    touchedAt: 0,
  };

  ctx.onSourcePointerDown = () => {
    ctx.touched = 'source';
    ctx.touchedAt = performance.now();
  };
  ctx.onMirrorPointerDown = () => {
    ctx.touched = 'mirror';
    ctx.touchedAt = performance.now();
  };

  try { sourcePanel.addEventListener('pointerdown', ctx.onSourcePointerDown, true); } catch {}
  try { mirrorPanel.addEventListener('pointerdown', ctx.onMirrorPointerDown, true); } catch {}

  const applyToMirror = () => {
    const state = normalizeArtStateForSync(sourcePanel?.getArtToyPersistState?.());
    if (!state) return;
    try { mirrorPanel.applyArtToyPersistState?.(state); } catch {}
  };
  const applyToSource = () => {
    const state = normalizeArtStateForSync(mirrorPanel?.getArtToyPersistState?.());
    if (!state) return;
    try { sourcePanel.applyArtToyPersistState?.(state); } catch {}
  };

  const tick = () => {
    if (!g_artInternal?.active || String(g_artInternal?.artToyId || '') !== id) {
      stopInternalArtAnchorSync(id);
      return;
    }
    if (!sourcePanel.isConnected || !mirrorPanel.isConnected) {
      stopInternalArtAnchorSync(id);
      return;
    }
    const srcState = sourcePanel.getArtToyPersistState?.();
    const mirState = mirrorPanel.getArtToyPersistState?.();
    if (!srcState || !mirState) {
      ctx.raf = requestAnimationFrame(tick);
      return;
    }
    const srcSig = JSON.stringify(normalizeArtStateForSync(srcState));
    const mirSig = JSON.stringify(normalizeArtStateForSync(mirState));
    if (srcSig !== mirSig) {
      const now = performance.now();
      const recentTouch = (now - ctx.touchedAt) < 1800;
      const dir = recentTouch ? ctx.touched : 'source';
      if (dir === 'mirror') applyToSource();
      else applyToMirror();
    }
    ctx.raf = requestAnimationFrame(tick);
  };

  applyToMirror();
  ctx.raf = requestAnimationFrame(tick);
  g_internalArtAnchorSync.set(id, ctx);
}

function ensureInternalHomeAnchorGhost(artToyId) {
  if (!artToyId) return null;
  const { world } = ensureInternalBoardOverlay();
  if (!world) return null;

  // Keep one active ghost in the internal world.
  try {
    world.querySelectorAll('.internal-art-anchor-ghost').forEach((el) => {
      if (el?.dataset?.artToyId !== String(artToyId)) el.remove();
    });
  } catch {}

  let ghost = null;
  try {
    ghost = Array.from(world.querySelectorAll('.internal-art-anchor-ghost'))
      .find(el => el?.dataset?.artToyId === String(artToyId)) || null;
  } catch {}

  const sourcePanel = getArtToyPanelById(artToyId);
  if (!ghost) {
    const type = sourcePanel?.dataset?.artToy || '';
    const created = createArtToyAt(type, {
      containerEl: world,
      centerX: 240,
      centerY: 180,
      autoCenter: false,
      showControlsOnSpawn: true,
    });
    if (!created) return null;
    ghost = created;
    ghost.classList.add('internal-art-anchor-ghost');
    ghost.dataset.artToyId = String(artToyId);
    ghost.dataset.artToyMirrorSource = String(artToyId);
    ghost.dataset.dragDisabled = '1';
    ghost.style.position = 'absolute';
    ghost.style.zIndex = '1';
    try {
      const dragCore = ghost.querySelector('.art-toy-drag-btn .c-btn-core');
      if (dragCore) dragCore.style.setProperty('--c-btn-icon-url', "url('./assets/UI/T_ButtonEmpty.png')");
    } catch {}
  }

  const anchor = getInternalHomeAnchorForArtToy(artToyId);
  const size = getInternalHomeGhostSize();
  ghost.style.width = `${size}px`;
  ghost.style.height = `${size}px`;
  // Base art-toy drag button center sits 80px up/left from panel origin.
  // Position panel so that button center lands exactly on the anchor while all
  // other UI keeps its default external-relative alignment.
  ghost.style.left = `${Math.round(anchor.x + 80)}px`;
  ghost.style.top = `${Math.round(anchor.y + 80)}px`;
  ghost.dataset.dragDisabled = '1';
  try {
    const dragCore = ghost.querySelector('.art-toy-drag-btn .c-btn-core');
    if (dragCore) dragCore.style.setProperty('--c-btn-icon-url', "url('./assets/UI/T_ButtonEmpty.png')");
  } catch {}
  try { world.prepend(ghost); } catch {}

  if (sourcePanel) {
    startInternalArtAnchorSync(artToyId, sourcePanel, ghost);
  }
  return ghost;
}

function computeInternalCameraForWorldPoint(worldX, worldY, scale) {
  const { viewW, viewH } = getInternalViewportSize();
  const safeScale = (Number.isFinite(scale) && scale > 0) ? scale : 1;
  const wx = Number.isFinite(worldX) ? worldX : 240;
  const wy = Number.isFinite(worldY) ? worldY : 180;
  const tx = viewW * 0.5 - wx * safeScale;
  const ty = viewH * 0.5 - wy * safeScale;
  return { scale: safeScale, tx, ty, worldX: wx, worldY: wy };
}

function readActiveViewportCamera() {
  const vp = document.querySelector('.board-viewport') || document.getElementById('internal-board-viewport');
  const cs = vp ? getComputedStyle(vp) : null;
  const s = cs ? parseFloat(cs.getPropertyValue('--bv-scale')) : NaN;
  const tx = cs ? parseFloat(cs.getPropertyValue('--bv-tx')) : NaN;
  const ty = cs ? parseFloat(cs.getPropertyValue('--bv-ty')) : NaN;
  return {
    scale: Number.isFinite(s) ? s : 1,
    tx: Number.isFinite(tx) ? tx : 0,
    ty: Number.isFinite(ty) ? ty : 0,
  };
}

function tweenBoardCameraTo(targetScale, targetTx, targetTy, durationMs = 468) {
  const start = readActiveViewportCamera();
  const end = {
    scale: Number.isFinite(targetScale) ? targetScale : start.scale,
    tx: Number.isFinite(targetTx) ? targetTx : start.tx,
    ty: Number.isFinite(targetTy) ? targetTy : start.ty,
  };
  const dur = Math.max(80, Number(durationMs) || 468);
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const lerp = (a, b, t) => a + (b - a) * t;

  let t0 = 0;
  const step = (now) => {
    if (!t0) t0 = now;
    const k = Math.min(1, (now - t0) / dur);
    const e = easeOutCubic(k);
    const s = lerp(start.scale, end.scale, e);
    const x = lerp(start.tx, end.tx, e);
    const y = lerp(start.ty, end.ty, e);
    try { window.__setBoardViewportNow?.(s, x, y); } catch {}
    if (k < 1) {
      requestAnimationFrame(step);
    } else {
      try { window.__setBoardViewportNow?.(end.scale, end.tx, end.ty); } catch {}
      try { setInternalBoardTransform(end.scale, end.tx, end.ty); } catch {}
    }
  };
  requestAnimationFrame(step);
}

function getStoredInternalHomeAnchor(artToyId) {
  const artPanel = getArtToyPanelById(artToyId);
  if (!artPanel) return null;
  const x = Number(artPanel.dataset?.internalHomeX);
  const y = Number(artPanel.dataset?.internalHomeY);
  const scale = Number(artPanel.dataset?.internalHomeScale);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y, scale: (Number.isFinite(scale) && scale > 0) ? scale : null };
}

function setStoredInternalHomeAnchor(artToyId, anchor) {
  const artPanel = getArtToyPanelById(artToyId);
  if (!artPanel || !anchor) return false;
  const x = Number(anchor.x);
  const y = Number(anchor.y);
  const scale = Number(anchor.scale);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  try {
    artPanel.dataset.internalHomeX = String(x);
    artPanel.dataset.internalHomeY = String(y);
    if (Number.isFinite(scale) && scale > 0) artPanel.dataset.internalHomeScale = String(scale);
    else delete artPanel.dataset.internalHomeScale;
    return true;
  } catch {}
  return false;
}

function getInternalHomeAnchorForArtToy(artToyId) {
  const defaultScale = (Number.isFinite(Number(window.__MT_NEW_SCENE_ZOOM)) && Number(window.__MT_NEW_SCENE_ZOOM) > 0)
    ? Number(window.__MT_NEW_SCENE_ZOOM)
    : 1;
  if (!artToyId) return { x: 240, y: 180, scale: defaultScale };
  const stored = getStoredInternalHomeAnchor(artToyId);
  if (stored) {
    return {
      x: stored.x,
      y: stored.y,
      scale: (Number.isFinite(stored.scale) && stored.scale > 0) ? stored.scale : defaultScale,
    };
  }
  const cam = computeInternalBoardDefaultCamera(artToyId);
  const anchor = {
    x: Number.isFinite(cam.worldX) ? cam.worldX : 240,
    y: Number.isFinite(cam.worldY) ? cam.worldY : 180,
    scale: Number.isFinite(cam.scale) && cam.scale > 0 ? cam.scale : defaultScale,
  };
  try { setStoredInternalHomeAnchor(artToyId, anchor); } catch {}
  return anchor;
}

function centerInternalBoardOnHomeAnchor(artToyId) {
  if (!artToyId) return false;
  ensureInternalHomeAnchorGhost(artToyId);
  const anchor = getInternalHomeAnchorForArtToy(artToyId);
  try { window.__cancelWheelZoomLerp?.(); } catch {}

  const cam = computeInternalCameraForWorldPoint(anchor.x, anchor.y, anchor.scale);
  // Direct camera tween to exact target avoids conversion drift in swapped-board mode.
  try { tweenBoardCameraTo(cam.scale, cam.tx, cam.ty, 468); return true; } catch {}

  // Fallback if animated camera helper is unavailable.
  setInternalBoardTransform(cam.scale, cam.tx, cam.ty);
  try { window.__setBoardViewportNow?.(cam.scale, cam.tx, cam.ty); } catch {}
  requestAnimationFrame(() => {
    try { window.__setBoardViewportNow?.(cam.scale, cam.tx, cam.ty); } catch {}
  });
  return true;
}

function computeInternalBoardDefaultCamera(artToyId) {
  const homeZoom = (() => {
    const z = Number(window.__MT_NEW_SCENE_ZOOM);
    // Match external "new scene / return home" default zoom when available.
    return (Number.isFinite(z) && z > 0) ? z : 1;
  })();
  const parsePositive = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : NaN;
  };
  const pickSize = (...vals) => {
    for (const v of vals) {
      if (Number.isFinite(v) && v > 0) return v;
    }
    return 0;
  };

  const owned = getInternalPanelsForArtToy(artToyId);
  let sumX = 0;
  let sumY = 0;
  let count = 0;

  for (const p of owned) {
    if (!p) continue;
    const toyType = p?.dataset?.toy || '';
    const expected = pickToyPanelSize(toyType);
    const left = parseFloat(p.style.left);
    const top = parseFloat(p.style.top);
    const rect = p.getBoundingClientRect?.();
    const cs = (() => { try { return getComputedStyle(p); } catch { return null; } })();
    const w = pickSize(
      p.offsetWidth,
      rect?.width,
      parsePositive(p.style.width),
      parsePositive(cs?.width),
      Number(expected?.width)
    );
    const h = pickSize(
      p.offsetHeight,
      rect?.height,
      parsePositive(p.style.height),
      parsePositive(cs?.height),
      Number(expected?.height)
    );
    if (!Number.isFinite(left) || !Number.isFinite(top)) continue;
    const cx = left + (Number.isFinite(w) ? w * 0.5 : 0);
    const cy = top + (Number.isFinite(h) ? h * 0.5 : 0);
    sumX += cx;
    sumY += cy;
    count++;
  }

  // Default zoom for internal board matches main board home/new-scene zoom.
  const scale = homeZoom;
  const worldX = count > 0 ? (sumX / count) : 240;
  const worldY = count > 0 ? (sumY / count) : 180;
  return computeInternalCameraForWorldPoint(worldX, worldY, scale);
}

function readMainBoardCameraSnapshot() {
  // Pull from the current main board viewport CSS vars used by board-viewport.js
  // (These should exist even if we later swap IDs/classes.)
  const mainViewport =
    document.querySelector('.board-viewport') ||
    document.querySelector('.main-stage') ||
    document.body;

  const cs = mainViewport ? getComputedStyle(mainViewport) : null;
  const scale = cs ? parseFloat(cs.getPropertyValue('--bv-scale')) : NaN;
  const tx = cs ? parseFloat(cs.getPropertyValue('--bv-tx')) : NaN;
  const ty = cs ? parseFloat(cs.getPropertyValue('--bv-ty')) : NaN;

  return {
    scale: Number.isFinite(scale) ? scale : 1,
    tx: Number.isFinite(tx) ? tx : 0,
    ty: Number.isFinite(ty) ? ty : 0,
    viewportEl: mainViewport || null,
  };
}

function forceRevertBoardIdentityAfterInternalMode() {
  // In failure cases (eg interrupted transition), we can end up with swapped
  // IDs/classes but swap.didSwap=false. This function detects and fixes that.
  const swap = g_artInternal._swap;

  const internalViewport = document.getElementById('internal-board-viewport');
  const mainBoardAlt = document.getElementById('board-main');
  const maybeInternalBoard = document.getElementById('board');

  const looksSwapped = !!(
    internalViewport && internalViewport.classList.contains('board-viewport') &&
    mainBoardAlt && maybeInternalBoard && internalViewport.contains(maybeInternalBoard)
  );

  if (!looksSwapped) return;

  // Find the main viewport element (the one that owns the main board).
  const findViewportForBoard = (boardEl) => {
    let el = boardEl;
    while (el && el !== document.body) {
      if (el.classList && (el.classList.contains('board-viewport') || el.classList.contains('board-viewport-main'))) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  };

  const mainViewport =
    document.querySelector('.board-viewport-main') ||
    (mainBoardAlt ? findViewportForBoard(mainBoardAlt) : null) ||
    swap.mainViewportEl ||
    null;

  // Remove internal ownership.
  try { internalViewport.classList.remove('board-viewport'); } catch {}

  // Restore main viewport ownership.
  try {
    if (mainViewport && !mainViewport.classList.contains('board-viewport')) {
      mainViewport.classList.add('board-viewport');
    }
  } catch {}

  // Restore IDs.
  try { maybeInternalBoard.id = 'internal-board-world'; } catch {}
  try { mainBoardAlt.id = 'board'; } catch {}

  // Reset swap bookkeeping.
  swap.didSwap = false;
}

function swapBoardIdentityForInternalMode() {
  const swap = g_artInternal._swap;
  if (swap.didSwap) return;

  // Always start from a clean baseline.
  try { forceRevertBoardIdentityAfterInternalMode(); } catch {}

  const mainBoard = document.getElementById('board');
  const internalViewport = document.getElementById('internal-board-viewport');
  const internalWorld = document.getElementById('internal-board-world');
  if (!mainBoard || !internalViewport || !internalWorld) return;

  // Record original state so we can revert.
  swap.mainBoardEl = mainBoard;
  swap.mainBoardPrevId = mainBoard.id; // "board"
  // IMPORTANT: many systems look up the active viewport via `querySelector('.board-viewport')`.
  // If the main viewport keeps that class, internal mode will still route camera/drag math to it.
  swap.mainViewportEl = document.querySelector('.board-viewport');
  swap.mainViewportHadBoardViewportClass = !!swap.mainViewportEl && swap.mainViewportEl.classList.contains('board-viewport');
  swap.mainViewportHadBoardViewportMainClass = !!swap.mainViewportEl && swap.mainViewportEl.classList.contains('board-viewport-main');

  // Mark the main viewport so we can find it later even after .board-viewport moves.
  try {
    if (swap.mainViewportEl && !swap.mainViewportHadBoardViewportMainClass) {
      swap.mainViewportEl.classList.add('board-viewport-main');
    }
  } catch {}

  // Move .board-viewport identity from main viewport to internal viewport.
  try {
    if (swap.mainViewportEl && swap.mainViewportHadBoardViewportClass) {
      swap.mainViewportEl.classList.remove('board-viewport');
    }
  } catch {}
  try { internalViewport.classList.add('board-viewport'); } catch {}

  swap.internalViewportEl = internalViewport;
  swap.internalWorldEl = internalWorld;
  swap.internalWorldPrevId = internalWorld.id; // "internal-board-world"

  // 1) Move main board out of the way (ID swap)
  try { mainBoard.id = 'board-main'; } catch {}

  // 2) Promote internal world to become #board
  try { internalWorld.id = 'board'; } catch {}

  // IMPORTANT:
  // After this point, the normal board camera system will transform #board based on viewport vars.
  // If internalWorld still has an inline transform (from setInternalBoardTransform pre-swap),
  // we get a *double transform* which makes chains appear offset / wrong scale.
  try { internalWorld.style.transform = ''; } catch {}

  // 3) Make internal viewport look like the normal board viewport
  try { internalViewport.classList.add('board-viewport'); } catch {}

  // Re-attach zoom coordinator to the new #board so transforms apply to internal toys.
  try {
    const stageNow = document.querySelector('main#board, #board, #world, .world, .canvas-world');
    if (stageNow) attachWorldElement(stageNow);
  } catch {}

  // Rebind gesture listeners to the newly promoted `.board-viewport`.
  try { window.__rebindBoardGestures?.(); } catch {}

  swap.didSwap = true;
}

function revertBoardIdentityAfterInternalMode() {
  const swap = g_artInternal._swap;
  if (!swap.didSwap) {
    // Still attempt to recover if we detect a half-swapped state.
    try { forceRevertBoardIdentityAfterInternalMode(); } catch {}
    return;
  }

  // Remove internal viewport ownership.
  try {
    if (swap.internalViewportEl) swap.internalViewportEl.classList.remove('board-viewport');
  } catch {}

  // Restore .board-viewport class back to the main viewport (if it originally had it).
  try {
    const mainViewport = swap.mainViewportEl || document.querySelector('.board-viewport-main');
    if (mainViewport && swap.mainViewportHadBoardViewportClass) {
      mainViewport.classList.add('board-viewport');
    }
    // Remove the temporary marker class only if we added it.
    if (mainViewport && !swap.mainViewportHadBoardViewportMainClass) {
      mainViewport.classList.remove('board-viewport-main');
    }
  } catch {}

  // Restore internal world ID
  try {
    if (swap.internalWorldEl) swap.internalWorldEl.id = swap.internalWorldPrevId || 'internal-board-world';
  } catch {}

  // Restore main board ID
  try {
    if (swap.mainBoardEl) swap.mainBoardEl.id = swap.mainBoardPrevId || 'board';
  } catch {}

  // Re-attach zoom coordinator back to the main board stage.
  try {
    const stageNow = document.querySelector('main#board, #board, #world, .world, .canvas-world');
    if (stageNow) attachWorldElement(stageNow);
  } catch {}

  // Rebind gesture listeners back to the main `.board-viewport`.
  try { window.__rebindBoardGestures?.(); } catch {}

  // Restore the main-board camera (entering internal mode can cause subsequent camera
  // writes to hit the wrong viewport when `.board-viewport` is swapped).
  try {
    const snap = swap.mainCamSnapshot;
    const mainViewport = swap.mainViewportEl || document.querySelector('.board-viewport');
    if (snap && mainViewport) {
      if (Number.isFinite(snap.scale)) mainViewport.style.setProperty('--bv-scale', String(snap.scale));
      if (Number.isFinite(snap.tx)) mainViewport.style.setProperty('--bv-tx', `${snap.tx}px`);
      if (Number.isFinite(snap.ty)) mainViewport.style.setProperty('--bv-ty', `${snap.ty}px`);
      // Also restore the coordinator's live state so delayed commit/tween writes
      // cannot re-apply stale internal-board transforms after exit.
      try { window.__cancelWheelZoomLerp?.(); } catch {}
      try { window.__setBoardViewportNow?.(snap.scale, snap.tx, snap.ty); } catch {}
      // One more frame for any queued post-swap writes.
      requestAnimationFrame(() => {
        try { window.__setBoardViewportNow?.(snap.scale, snap.tx, snap.ty); } catch {}
      });
    }
  } catch {}

  swap.didSwap = false;
}

function enterInternalBoard(artToyId) {
  if (!artToyId) return;
  // Defensive: if a previous internal session failed to revert cleanly,
  // we may still have swapped IDs/classes which breaks input + dot background.
  try { forceRevertBoardIdentityAfterInternalMode(); } catch {}
  const { overlay, world, title } = ensureInternalBoardOverlay();
  const host = ensureArtInternalHost();

  // Snapshot the current main-board camera BEFORE we swap.
  const snap = readMainBoardCameraSnapshot();

  // Remember the main-board camera so we can restore it on exit.
  try {
    const swap = g_artInternal._swap || (g_artInternal._swap = {});
    swap.mainCamSnapshot = { scale: snap.scale, tx: snap.tx, ty: snap.ty };
  } catch {}

  // Move internal panels for this art toy into the internal board world.
  const panels = getInternalPanelsForArtToy(artToyId);
  for (const p of panels) {
    try {
      p.classList.remove('art-internal-toy');
      restoreInternalPanelAfterHiddenLayout(p);
      p.style.pointerEvents = 'auto';
      world.appendChild(p);
    } catch {}
  }

  // If there are none yet, spawn a default internal toy on first entry.
  let spawnedDefaultOnEnter = false;
  if (!panels.length) {
    try { spawnedDefaultOnEnter = !!ensureDefaultInternalToyOnFirstEnter(artToyId, world); } catch {}
  }
  try { ensureInternalHomeAnchorGhost(artToyId); } catch {}

  if (title) title.textContent = 'Inside Art Toy';

  g_artInternal.active = true;
  g_artInternal.artToyId = artToyId;

  document.body.classList.add('internal-board-active');
  overlay.classList.add('is-active');
  overlay.classList.remove('is-exiting');

  dbgInternalOverlay('enter:after-active-class', overlay);

  // Critical: swap board identity so all existing toy dragging / board math works inside internal mode.
  swapBoardIdentityForInternalMode();

  // Internal-board camera policy:
  // Always start at default zoom centered on this art toy's internal content.
  const internalCam = computeInternalBoardDefaultCamera(artToyId);
  setInternalBoardTransform(internalCam.scale, internalCam.tx, internalCam.ty);
  try { window.__cancelWheelZoomLerp?.(); } catch {}
  try { window.__setBoardViewportNow?.(internalCam.scale, internalCam.tx, internalCam.ty); } catch {}
  requestAnimationFrame(() => {
    try { window.__setBoardViewportNow?.(internalCam.scale, internalCam.tx, internalCam.ty); } catch {}
  });

  __artRandLog('enterInternalBoard:afterSwap', {
    artToyId,
    pendingMusic: document.getElementById(artToyId)?.dataset?.pendingRandMusic,
    pendingAll: document.getElementById(artToyId)?.dataset?.pendingRandAll,
  });

  // If we deferred any internal randomisation (e.g., drawgrid while hidden), apply it now.
  try { applyPendingInternalRandomIfNeeded(artToyId); } catch {}

  // Connectors: switch the chain canvas to the internal #board and rebuild geometry for internal toys.
  try { ensureChainCanvasAttachedToActiveBoard(); } catch {}
  try { rebuildChainSegments(); } catch {}
  try { g_chainRedrawPendingFull = true; } catch {}
  try { scheduleChainRedraw(true); } catch {}

  // Animate scale-in from the art toy position.
  try { animateInternalBoardIn(artToyId); } catch {}

  // If any internal toys performed headless model updates while hidden (eg DrawGrid),
  // refresh their visuals now that we're visible.
  // Two rAFs = after DOM move + after layout/camera settle.
  try {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          const panelsNow = getInternalPanelsForArtToy(artToyId);
          for (const p of panelsNow) {
            if (typeof p.__toyRefreshVisualsIfNeeded === 'function') {
              try { p.__toyRefreshVisualsIfNeeded(); } catch {}
            }
            // DrawGrid: after swapping boards / reparenting into the internal world,
            // some paint-layer state can be out-of-date (symptom: "drawn" line becomes a dot at 0,0).
            // Force a full resnap/redraw to rebuild canvas sizes + stroke paths in the new layout context.
            try {
              if (p?.dataset?.toy === 'drawgrid') {
                const dg = p.__drawToy || p.__toyApi || p.__toy || null;
                if (dg && typeof dg.resnapAndRedraw === 'function') {
                  dg.resnapAndRedraw(true, { preservePaintIfNoStrokes: true });
                }
              }
            } catch {}
          }
        } catch {}
        try {
          if (spawnedDefaultOnEnter) {
            const recenter = computeInternalBoardDefaultCamera(artToyId);
            setInternalBoardTransform(recenter.scale, recenter.tx, recenter.ty);
            try { window.__cancelWheelZoomLerp?.(); } catch {}
            try { window.__setBoardViewportNow?.(recenter.scale, recenter.tx, recenter.ty); } catch {}
          }
        } catch {}
      });
    });
  } catch {}

  // Ensure the hidden host stays alive (panels for other toys remain stashed there).
  // (No-op read, keeps linter happy.)
  void host;
}

function exitInternalBoardImmediate() {
  if (!g_artInternal.active) return;
  const { overlay } = ensureInternalBoardOverlay();
  const host = ensureArtInternalHost();

  const artToyId = g_artInternal.artToyId;
  try { stopInternalArtAnchorSync(artToyId); } catch {}
  const panels = getInternalPanelsForArtToy(artToyId);
  for (const p of panels) {
    try {
      p.classList.add('art-internal-toy');
      p.style.pointerEvents = 'none';
      // Keep layoutable while hidden so external randomise/play continues to work
      // for canvas toys (DrawGrid) after you’ve entered/exited once.
      try { makeInternalPanelLayoutableWhileHidden(p); } catch {}
      host.appendChild(p);
    } catch {}
  }

  try {
    document.querySelectorAll(`.internal-art-anchor-ghost[data-art-toy-id="${CSS.escape(String(artToyId))}"]`).forEach((el) => {
      try { el.remove(); } catch {}
    });
  } catch {}

  // Revert the #board + .board-viewport identity swap.
  revertBoardIdentityAfterInternalMode();

  // Connectors: move chain canvas back to the main #board and rebuild main-board geometry.
  try { ensureChainCanvasAttachedToActiveBoard(); } catch {}
  // Clear any stale internal-board connector frame before we redraw on the main board.
  try { clearChainCanvasHard(); } catch {}
  try { rebuildChainSegments(); } catch {}
  try { g_chainRedrawPendingFull = true; } catch {}
  try { scheduleChainRedraw(true); } catch {}

  g_artInternal.active = false;
  g_artInternal.artToyId = null;

  document.body.classList.remove('internal-board-active');
  overlay.classList.remove('is-active');
  overlay.classList.remove('is-exiting');
}

function requestExitInternalBoard() {
  if (!g_artInternal.active) return;
  const artToyId = g_artInternal.artToyId;
  const { overlay } = ensureInternalBoardOverlay();
  if (!overlay) return;
  // Animate out first, then do the actual exit bookkeeping.
  animateInternalBoardOut(artToyId, () => {
    try { exitInternalBoardImmediate(); } catch {}
  });
}

// Expose a tiny API for debugging.
try {
  window.__ArtInternal = Object.assign(window.__ArtInternal || {}, {
    enter: enterInternalBoard,
    exit: requestExitInternalBoard,
    isActive: () => !!g_artInternal.active,
    getHomeAnchor: () => {
      if (!g_artInternal.active || !g_artInternal.artToyId) return null;
      return getInternalHomeAnchorForArtToy(g_artInternal.artToyId);
    },
    centerHome: () => {
      if (!g_artInternal.active || !g_artInternal.artToyId) return false;
      return centerInternalBoardOnHomeAnchor(g_artInternal.artToyId);
    },
  });
} catch {}

// Click delegate: Art Toy "Music" button enters internal-board mode.
document.addEventListener('click', (e) => {
  const btn = e.target?.closest?.('button[data-action="artToy:music"]');
  if (!btn) return;
  const artToyId = resolveArtToyIdFromActionButton(btn);
  if (!artToyId) return;
  e.preventDefault();
  e.stopPropagation();
  enterInternalBoard(artToyId);
}, true);

function resetArtToyToDefaultState(artToyId) {
  if (!artToyId) return false;
  const artPanel = getArtToyPanelById(artToyId);
  if (!artPanel) return false;
  const isActiveInternalTarget = !!(g_artInternal?.active && g_artInternal?.artToyId === artToyId);
  let mirrorPanel = null;
  if (isActiveInternalTarget) {
    try {
      mirrorPanel = document.querySelector(`.internal-art-anchor-ghost[data-art-toy-id="${CSS.escape(String(artToyId))}"]`);
    } catch {}
  }

  try {
    const owned = getInternalPanelsForArtToy(artToyId);
    for (const p of owned) {
      try { destroyToyPanel(p, { allowOffBoard: true }); } catch {}
    }
  } catch {}

  // Keep internal-board session alive when clearing from inside the toy.
  // External clear keeps existing teardown behavior.
  if (!isActiveInternalTarget) {
    try {
      stopInternalArtAnchorSync(artToyId);
      const sel = `.internal-art-anchor-ghost[data-art-toy-id="${CSS.escape(String(artToyId))}"]`;
      document.querySelectorAll(sel).forEach((el) => {
        try { el.remove(); } catch {}
      });
    } catch {}

    try {
      delete artPanel.dataset.internalBootstrapped;
      delete artPanel.dataset.internalHomeX;
      delete artPanel.dataset.internalHomeY;
      delete artPanel.dataset.internalHomeScale;
      delete artPanel.dataset.pendingRandMusic;
      delete artPanel.dataset.pendingRandAll;
    } catch {}
  }

  try { artPanel.classList.remove('flash'); } catch {}
  try { mirrorPanel?.classList?.remove?.('flash'); } catch {}
  try { artPanel.onArtClear?.(); } catch {}
  try { mirrorPanel?.onArtClear?.(); } catch {}
  const clearTransientNodes = (root) => {
    if (!root?.querySelectorAll) return;
    try {
      root.querySelectorAll('.art-firework-spark, .art-firework-core, .art-firework-dot, .art-firework-ring, .art-firework-star, .art-laser-path').forEach((node) => {
        try { node.remove(); } catch {}
      });
    } catch {}
  };
  clearTransientNodes(artPanel);
  clearTransientNodes(mirrorPanel);

  // In internal mode, keep the board open and immediately restore one default toy.
  if (isActiveInternalTarget) {
    try { ensureDefaultInternalToyChainExistsInHost(artToyId, 1); } catch {}
  }

  try { window.Persistence?.markDirty?.(); } catch {}
  return true;
}

// Click delegate: Art Toy "Clear" button.
document.addEventListener('click', (e) => {
  const btn = e.target?.closest?.('button[data-action="artToy:clear"]');
  if (!btn) return;
  const artToyId = resolveArtToyIdFromActionButton(btn);
  if (!artToyId) return;
  e.preventDefault();
  e.stopPropagation();
  resetArtToyToDefaultState(artToyId);
}, true);

const g_artInternalRandomInFlight = new Set();

function randomizeInternalToysForArtToy(artToyId, mode, opts = {}) {
  if (!artToyId) return;
  const lockId = String(artToyId);
  if (g_artInternalRandomInFlight.has(lockId)) {
    __artRandLog('randomizeInternalToysForArtToy:skip:in-flight', { artToyId, mode });
    return;
  }
  g_artInternalRandomInFlight.add(lockId);
  try {
  const source = opts.source || 'button';
  const autoStartTransport = opts.autoStartTransport !== false;
  __artRandLog('randomizeInternalToysForArtToy:begin', { artToyId, mode, source });
  // If the user presses random before ever entering the toy, we still want
  // a default internal toy to exist so randomisation can happen immediately.
  try { ensureDefaultInternalToyChainExistsInHost(artToyId, 4); } catch {}

  const panels = getInternalPanelsForArtToy(artToyId);
  __artRandLog('randomizeInternalToysForArtToy:panels', {
    artToyId,
    count: panels.length,
    ids: panels.map(p => p.id),
  });
  if (!panels.length) return;

  // "Instant randomise" from the external view must be audible on the *first* press.
  // Ensure the audio context is unlocked and the transport is running before we
  // mutate patterns and call startToy().
  try {
    ensureAudioContext?.();
    if (autoStartTransport && typeof isRunning === 'function' && !isRunning()) {
      // Cancel anything pending from a prior run (deferred setTimeout gates + scheduled sources)
      try { bumpAllToyAudioGen?.(); } catch {}
      try { start?.(); } catch {}
      try { document.dispatchEvent(new Event('transport:play')); } catch {}
    }
  } catch {}

  const allowDefer = opts.allowDefer !== false;
  const internalActiveForThis = isInternalBoardActiveForArtToy(artToyId);
  __artRandLog('randomizeInternalToysForArtToy:context', { artToyId, mode, allowDefer, internalActiveForThis, autoStartTransport });

  try {
    randomizeArtToyStateStub(artToyId, mode === 'all' ? 'all' : 'music');
  } catch {}

  // If we actually apply a randomisation, clear any pending flags so we don't
  // accidentally re-randomise on enter (which feels like "tune changed on enter").
  const clearPendingFlags = () => {
    try {
      const artPanel = document.getElementById(artToyId);
      if (!artPanel) return;
      artPanel.dataset.pendingRandMusic = '0';
      artPanel.dataset.pendingRandAll = '0';
    } catch {}
  };

  // DrawGrid's headless random path updates model/audio immediately, but some
  // parts of playback wiring settle on the next frame. Starting in the same tick
  // can lead to "silent until second press".
  //
  // IMPORTANT: After random, we must NOT restart/reset scheduler timing.
  // Random should behave like the visible DrawGrid random button:
  // apply changes, then the *next* step plays on beat.
  const ensureToyPlayingAfterRandomNoReset = (panel) => {
    try {
      const t = panel?.dataset?.toy;
      __artRandLog('ensureToyPlayingAfterRandomNoReset:enter', {
        panelId: panel?.id,
        toyType: t,
        autoStartTransport
      });

      // Always ensure the AudioContext is alive, but do not force scheduler resets.
      try { ensureAudioContext?.(); } catch {}
      const transportRunning = !!isRunning?.();
      // External Art Toy random should never auto-play a stopped scene.
      if (!autoStartTransport && !transportRunning) return;

      // DrawGrid uses the global transport; only start it if needed.
      if (t === 'drawgrid') {
        try {
          if (!isRunning?.()) {
            start?.();
            __artRandLog('ensureToyPlayingAfterRandomNoReset:startedTransport', { panelId: panel?.id });
          }
        } catch (e) {
          __artRandLog('ensureToyPlayingAfterRandomNoReset:drawgridStartError', { err: String(e?.message || e) });
        }
        return;
      }

      // Other toys: only start if they appear not to be playing.
      // (Do NOT force restart semantics.)
      try {
        if (!panel?.classList?.contains?.('toy-playing')) {
          const api = panel.__toyApi || panel.__toy || panel.__toyInstance || panel.__drawToy || null;
          if (api && typeof api.start === 'function') api.start();
          else panel.dispatchEvent(new CustomEvent('toy:start', { bubbles: false }));
          __artRandLog('ensureToyPlayingAfterRandomNoReset:startedToy', { panelId: panel?.id, toyType: t });
        }
      } catch (e) {
        __artRandLog('ensureToyPlayingAfterRandomNoReset:error', { err: String(e?.message || e) });
      }
    } catch {}
  };

  function randomizeMusicForPanel(p) {
    if (!p) return;
    try {
      // Preferred path: toy-provided API that is safe while hidden.
      if (typeof p.__toyRandomMusic === 'function') {
        p.__toyRandomMusic();
      } else {
        // Fallback: event-based randomisation.
        p.dispatchEvent(new CustomEvent('toy-random-notes', { bubbles: true, composed: true }));
      }
    } catch {}
  }

  for (const p of panels) {
    try {
      if (mode === 'music') {
        const toyType = p.dataset?.toy;
        __artRandLog('panel', { artToyId, panelId: p.id, toyType, mode });

        // If DrawGrid doesn't have the headless API and we're outside, defer to avoid
        // layout-dependent random corrupting visuals. If it DOES have the API, we can
        // randomise instantly even while hidden.
        if (
          allowDefer &&
          !internalActiveForThis &&
          toyType === 'drawgrid' &&
          typeof p.__toyRandomMusic !== 'function'
        ) {
          __artRandLog('defer', { artToyId, panelId: p.id, toyType, mode, reason: 'drawgrid-no-api-and-not-internal' });
          markPendingInternalRandom(artToyId, 'music');
          continue;
        }
        // Use the per-toy "do what the visible Random button does" behavior.
        // randomizeToyMusic() prefers panel.__toyRandomMusic() when available.
        randomizeToyMusic(p, { artToyId, panelId: p.id, toyType, mode, source });
        const hasNotesNow = panelHasAnyNotes(p);
        __artRandLog('postRandom:notes', { artToyId, panelId: p.id, toyType, hasNotesNow });

        // The intent of the art-toy buttons is "instant music".
        try { pulseToyBorder(p, 360); } catch {}
        __artRandLog('startToy:try', { artToyId, panelId: p.id, toyType });
        clearPendingFlags();
        ensureToyPlayingAfterRandomNoReset(p);

        // DrawGrid sometimes isn't fully ready the very first frame after being spawned/hidden.
        // If the random produced no notes, retry once on the next frame (then start again).
        if (toyType === 'drawgrid' && !hasNotesNow) {
          __artRandLog('drawgrid:retryScheduled', { artToyId, panelId: p.id, reason: 'no-notes-after-random' });
          requestAnimationFrame(() => {
            try {
              randomizeToyMusic(p, { artToyId, panelId: p.id, toyType, mode, source: source + ':retry1' });
              const hasNotes2 = panelHasAnyNotes(p);
              __artRandLog('drawgrid:retryResult', { artToyId, panelId: p.id, hasNotes2 });
              // Only bother restarting if we actually got notes this time.
              if (hasNotes2) ensureToyPlayingAfterRandomNoReset(p);
            } catch (e) {
              __artRandLog('drawgrid:retryError', { artToyId, panelId: p.id, err: String(e?.message || e) });
            }
          });
        }
      } else {
        // Random All:
        // 1) Always randomise MUSIC immediately (even externally) so you hear something now.
        // 2) Then apply the "all" random (toy-random / art-state hooks) if safe;
        //    for drawgrid while external, defer ONLY the "all" pass until internal is active.
        const toyType = p.dataset?.toy;
        __artRandLog('panel', { artToyId, panelId: p.id, toyType, mode });

        // Step 1: music now
        randomizeToyMusic(p, { artToyId, panelId: p.id, toyType, mode: 'music', source: source + ':preAll' });
        const hasNotesNow = panelHasAnyNotes(p);
        __artRandLog('postRandom:notes', { artToyId, panelId: p.id, toyType, hasNotesNow, why: 'preAll-music' });
        __artRandLog('startToy:try', { artToyId, panelId: p.id, toyType, why: 'preAll-music' });
        ensureToyPlayingAfterRandomNoReset(p);

        if (toyType === 'drawgrid' && !hasNotesNow) {
          __artRandLog('drawgrid:retryScheduled', { artToyId, panelId: p.id, reason: 'no-notes-after-preAll-music' });
          requestAnimationFrame(() => {
            try {
              randomizeToyMusic(p, { artToyId, panelId: p.id, toyType, mode: 'music', source: source + ':preAll:retry1' });
              const hasNotes2 = panelHasAnyNotes(p);
              __artRandLog('drawgrid:retryResult', { artToyId, panelId: p.id, hasNotes2, why: 'preAll-music' });
              if (hasNotes2) ensureToyPlayingAfterRandomNoReset(p);
            } catch (e) {
              __artRandLog('drawgrid:retryError', { artToyId, panelId: p.id, err: String(e?.message || e), why: 'preAll-music' });
            }
          });
        }

        // Step 2: "all" pass (defer for drawgrid when not internal)
        if (allowDefer && !internalActiveForThis && toyType === 'drawgrid') {
          __artRandLog('defer', { artToyId, panelId: p.id, toyType, mode: 'all', reason: 'drawgrid-all-defer-external' });
          // We already randomized music in Step 1 above.
          // Defer ONLY the non-music random so entering internal doesn't re-roll the tune.
          markPendingInternalRandom(artToyId, 'allBlocksOnly');
          continue;
        }

        // Safe to do full random now
        __artRandLog('dispatch', { artToyId, panelId: p.id, toyType, event: 'toy-random' });
        p.dispatchEvent(new CustomEvent('toy-random', { bubbles: true, composed: true }));
        __artRandLog('startToy:try', { artToyId, panelId: p.id, toyType, why: 'postAll-toyRandom' });
        ensureToyPlayingAfterRandomNoReset(p);
      }
    } catch {}
  }

  try { window.Persistence?.markDirty?.(); } catch {}
  try { syncArtToySlotsFromInternalNotes(artToyId); } catch {}
  try { requestAnimationFrame(() => syncArtToySlotsFromInternalNotes(artToyId)); } catch {}
  } finally {
    requestAnimationFrame(() => {
      try { g_artInternalRandomInFlight.delete(lockId); } catch {}
    });
  }
}

function resolveArtToyIdFromActionButton(btn) {
  if (!btn) return '';
  try {
    const panel = btn.closest?.('.art-toy-panel') || null;
    const mirroredSource = panel?.dataset?.artToyMirrorSource;
    if (mirroredSource) return String(mirroredSource);
    if (panel?.id) return String(panel.id);
  } catch {}
  try {
    const id = btn.dataset?.artToyId;
    if (id) return String(id);
  } catch {}
  return '';
}

// Click delegate: Art Toy "Random All" button.
document.addEventListener('click', (e) => {
  const btn = e.target?.closest?.('button[data-action="artToy:randomAll"]');
  if (!btn) return;
  const artToyId = resolveArtToyIdFromActionButton(btn);
  if (!artToyId) return;
  __artRandLog('click', { action: 'randomAll', artToyId });
  e.preventDefault();
  e.stopPropagation();
  randomizeInternalToysForArtToy(artToyId, 'all', {
    allowDefer: true,
    source: 'randomAll',
    autoStartTransport: false,
  });
}, true);

// Click delegate: Art Toy "Random Music" button.
document.addEventListener('click', (e) => {
  const btn = e.target?.closest?.('button[data-action="artToy:randomMusic"]');
  if (!btn) return;
  const artToyId = resolveArtToyIdFromActionButton(btn);
  if (!artToyId) return;
  __artRandLog('click', { action: 'randomMusic', artToyId });
  e.preventDefault();
  e.stopPropagation();
  randomizeInternalToysForArtToy(artToyId, 'music', {
    allowDefer: true,
    source: 'randomMusic',
    autoStartTransport: false,
  });
}, true);

// Click delegate: Fireworks Art Toy "Effect" button (manual cycle).
document.addEventListener('click', (e) => {
  const btn = e.target?.closest?.('button[data-action="artToy:cycleFireworkFx"]');
  if (!btn) return;
  const artToyId = resolveArtToyIdFromActionButton(btn);
  if (!artToyId) return;
  e.preventDefault();
  e.stopPropagation();
  try {
    const panel = getArtToyPanelById(artToyId);
    if (!panel) return;
    if (typeof panel.cycleFireworkEffect === 'function') {
      panel.cycleFireworkEffect(+1);
    } else if (typeof panel.setFireworkEffectId === 'function') {
      const cur = Number(panel?.dataset?.fireworkFx) || 0;
      panel.setFireworkEffectId(cur + 1);
    }
    try { window.Persistence?.markDirty?.(); } catch {}
  } catch {}
}, true);

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
      const pat = panel.__seqPatternActive || panel.__seqPattern;
      const c = Array.isArray(pat?.cols) ? pat.cols[col] : null;
      if (c && c.active && Array.isArray(c.nodes) && c.nodes.length) {
        const disabled = new Set(Array.isArray(c.disabled) ? c.disabled : []);
        for (const row of c.nodes) {
          if (typeof row === 'number' && !Number.isNaN(row) && !disabled.has(row)) return true;
        }
        return false;
      }
    } catch {}
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

function panelHasAnyNotes(panel) {
  if (!panel) return false;
  const type = panel.dataset?.toy;

  if (type === 'loopgrid' || type === 'loopgrid-drum') {
    const steps = panel.__gridState?.steps;
    const hasNotes = Array.isArray(steps) ? steps.some(Boolean) : false;
    panel.__loopgridHasNotes = hasNotes;
    return hasNotes;
  }

  if (type === 'drawgrid') {
    if (window.__MT_DEBUG_ART_RANDOM) {
      __artRandLog('drawgrid:hasAnyNotes:probe', {
        panelId: panel.id,
        isConnected: panel.isConnected,
        display: (() => { try { return getComputedStyle(panel).display; } catch { return '??'; } })(),
        hasToyRandomMusic: typeof panel.__toyRandomMusic === 'function',
        hasDrawToy: !!panel.__drawToy,
        hasToyApi: !!panel.__toyApi
      });
    }
    try {
      if (typeof panel.__drawToy?.hasActiveNotes === 'function') {
        const v = !!panel.__drawToy.hasActiveNotes();
        if (window.__MT_DEBUG_ART_RANDOM) {
          __artRandLog('drawgrid:hasAnyNotes:hasActiveNotes()', { panelId: panel.id, result: v });
        }
        return v;
      }
    } catch {}
    try {
      const st = panel.__drawToy?.getState?.();
      const active = st?.nodes?.active;
      const v = Array.isArray(active) && active.some(Boolean);
      if (window.__MT_DEBUG_ART_RANDOM) {
        __artRandLog('drawgrid:hasAnyNotes:state.nodes.active', {
          panelId: panel.id,
          isArray: Array.isArray(active),
          activeCount: Array.isArray(active) ? active.filter(Boolean).length : null,
          result: v
        });
      }
      return v;
    } catch {}
    try {
      const pat = panel.__seqPatternActive || panel.__seqPattern;
      const cols = Array.isArray(pat?.cols) ? pat.cols : [];
      const v = cols.some(c => c && c.active && Array.isArray(c.nodes) && c.nodes.length > 0);
      if (window.__MT_DEBUG_ART_RANDOM) {
        __artRandLog('drawgrid:hasAnyNotes:seqPattern', { panelId: panel.id, cols: cols.length, result: v });
      }
      return v;
    } catch {}
    return false;
  }

  if (type === 'chordwheel') {
    const s = panel.__chordwheelStepStates;
    return Array.isArray(s) && s.some(v => v !== -1);
  }

    return false;
}

function startToy(panelEl) {
    if (!panelEl) return;
    __artRandLog('startToy:begin', {
      panelId: panelEl?.id,
      toyType: panelEl?.dataset?.toy,
      audioState: (window.__audioContext?.state || 'unknown')
    });
    try {
        // Always restart toys from their start when (re)started.
        // This keeps pause/resume deterministic and prevents mid-bar resumes.
        try {
            const ctx = ensureAudioContext?.();
            const now = ctx?.currentTime;
            if (Number.isFinite(now)) {
                panelEl.__loopStartOverrideSec = now;
                panelEl.__forceSchedulerReset = true;
            }
        } catch {}
        const api = panelEl.__toyApi || panelEl.__drawToy || panelEl.__toy || panelEl.__toyInstance || null;
        const apiName =
          api === panelEl.__toyApi ? '__toyApi' :
          api === panelEl.__drawToy ? '__drawToy' :
          api === panelEl.__toy ? '__toy' :
          api === panelEl.__toyInstance ? '__toyInstance' :
          'unknown';

        if (window.__MT_DEBUG_ART_RANDOM) {
          __artRandLog('startToy:enter', {
            panelId: panelEl.id,
            toyType: panelEl.dataset?.toy,
            apiFound: !!api,
            apiName,
            canStart: !!(api && typeof api.start === 'function'),
            hasNotesNow: (() => { try { return panelHasAnyNotes(panelEl); } catch { return 'err'; } })(),
            dump: (panelEl.dataset?.toy === 'drawgrid') ? __dumpDrawgridNotes(panelEl) : undefined
          });
        }

        if (api && typeof api.start === 'function') {
            api.start();
            if (window.__MT_DEBUG_ART_RANDOM) {
                __artRandLog('startToy:calledApiStart', { panelId: panelEl.id, apiName });
            }
        } else {
            const toyType = panelEl.dataset?.toy;
            if (toyType === 'drawgrid') {
                try {
                    if (!isRunning()) {
                        start();
                        if (window.__MT_DEBUG_ART_RANDOM) {
                            __artRandLog('startToy:startedTransportForDrawgrid', { panelId: panelEl.id });
                        }
                    }
                } catch (e) {
                    if (window.__MT_DEBUG_ART_RANDOM) {
                        __artRandLog('startToy:drawgridStartError', { err: String(e?.message || e) });
                    }
                }
            } else {
                panelEl.dispatchEvent(new CustomEvent('toy:start', { bubbles: false }));
                if (window.__MT_DEBUG_ART_RANDOM) {
                    __artRandLog('startToy:dispatchedEvent', { panelId: panelEl.id, event: 'toy:start' });
                }
            }
        }
      if (window.__CHAIN_DEBUG) console.log('[chain] startToy', panelEl.id);
    } catch (e) {
        if (window.__CHAIN_DEBUG) console.warn('[chain] startToy failed', panelEl?.id, e);
    }

    __artRandLog('startToy:done', {
      panelId: panelEl?.id,
      toyType: panelEl?.dataset?.toy,
      playingClass: panelEl?.classList?.contains('toy-playing')
    });
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
        // For step-driven toys, only pulse if the chain has notes or this toy is connected.
        const isChained = !!(activeToy.dataset.prevToyId || activeToy.dataset.nextToyId || activeToy.dataset.chainHasChild === '1');
        shouldPulse = isChained || doesChainHaveActiveNotes(headId);
      }

    const nextToyId = activeToy.dataset.nextToyId;
    const nextToy = nextToyId ? document.getElementById(nextToyId) : null;

    let nextActiveId = null;

    if (nextToy) {
        nextActiveId = nextToyId;
        if (shouldPulse) triggerConnectorPulse(activeToyId, nextToyId);
        g_chainState.set(headId, nextToyId);
    } else {
        nextActiveId = headId; // Loop back to head
        if (shouldPulse) triggerConnectorPulse(activeToyId, headId);
        g_chainState.set(headId, headId);
    }

    // Only reset/cancel scheduling if we actually moved to a DIFFERENT toy.
    // In a 1-toy chain, activeToyId === headId every bar; resetting here wipes de-dupe state
    // and causes the scheduler to re-schedule the same notes -> doubled playback.
    if (nextActiveId && nextActiveId !== activeToyId) {
      // Mark newly active toy before the scheduler runs so it can safely bump once
      // without invalidating already-scheduled notes mid-bar.
      try {
        if (nextToy) {
          nextToy.__chainJustActivated = true;
        } else {
          const headEl = document.getElementById(headId);
          if (headEl) headEl.__chainJustActivated = true;
        }
      } catch {}

      // IMPORTANT:
      // Chain handoff can happen *before* the bar ends (pre-advance). In that case, the outgoing toy
      // may already have future AudioBufferSourceNodes scheduled for later columns in the current bar.
      // Those will otherwise keep playing "over" the newly-active toy.
      //
      // We cancel any remaining scheduled audio for BOTH the outgoing and the newly-active toy,
      // and request a scheduler reset so the next tick re-schedules cleanly from the active set.
      try {
        const outAudioId =
          activeToy?.dataset?.audiotoyid ||
          activeToy?.__audioToyId ||
          activeToyId;
        try { cancelScheduledToySources(outAudioId); } catch {}
        try { if (outAudioId !== activeToyId) cancelScheduledToySources(activeToyId); } catch {}
        bumpToyAudioGen(outAudioId, 'chain-advance-out');
        activeToy.__forceSchedulerReset = true;
      } catch {}
      try {
        const inAudioId =
          nextToy?.dataset?.audiotoyid ||
          nextToy?.__audioToyId ||
          nextActiveId;
        try { cancelScheduledToySources(inAudioId); } catch {}
        try { if (inAudioId !== nextActiveId) cancelScheduledToySources(nextActiveId); } catch {}
        bumpToyAudioGen(inAudioId, 'chain-advance-in');
        if (nextToy) nextToy.__forceSchedulerReset = true;
      } catch {}

      try { g_sequencerScheduler?.clearToy?.(activeToyId); } catch {}
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
    if (CHAIN_DEBUG && window.__CHAIN_DEBUG) {
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
            core.style.setProperty('--c-btn-icon-url', `url('./assets/UI/T_ButtonEmpty.png')`);
        }
    } else {
        delete panel.dataset.chainHasChild;
        btn?.removeAttribute?.('data-chaindisabled');
        btn?.classList?.remove?.('toy-chain-btn-disabled');
        if (btn) btn.style.pointerEvents = 'auto';
        if (core) {
            core.style.setProperty('--c-btn-icon-url', `url('./assets/UI/T_ButtonExtend.png')`);
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

let g_chainUiStateKey = '';
function updateAllChainUIs({ force = false } = {}) {
    if (typeof window !== 'undefined' && window.__PERF_DISABLE_CHAIN_UI) return;
    const __perfOn = !!(window.__PerfFrameProf && typeof performance !== 'undefined' && performance.now);
    const __perfStart = __perfOn ? performance.now() : 0;
    // Normalize child flags from DOM links so refresh/restore can't lose them.
    const panels = Array.from(document.querySelectorAll('.toy-panel[id]'));
    if (!force) {
        const edgeCount = g_chainEdges ? g_chainEdges.size : 0;
        let edgeKey = '';
        if (g_chainEdges && g_chainEdges.size) {
            try {
                for (const edge of g_chainEdges.values()) {
                    edgeKey += `${edge.fromToyId}->${edge.toToyId}|`;
                }
            } catch {}
        }
        const nextKey = `${edgeCount}|${edgeKey}|` + panels.map(p => [
            p.id,
            p.dataset.prevToyId || '',
            p.dataset.nextToyId || '',
            p.dataset.chainParent || '',
            p.dataset.chainHasChild || '',
        ].join(':')).join('|');
        if (nextKey === g_chainUiStateKey) return;
        g_chainUiStateKey = nextKey;
    }
    if (__perfOn) {
        window.__PerfFrameProf.mark('chain.ui.query', performance.now() - __perfStart);
    }
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
    if (__perfOn) {
        window.__PerfFrameProf.mark('chain.ui.parents', performance.now() - __perfStart);
    }

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
            core.style.setProperty('--c-btn-icon-url', `url('./assets/UI/${icon}')`);
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
    if (__perfOn) {
        window.__PerfFrameProf.mark('chain.ui', performance.now() - __perfStart);
    }
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

    const chainBtn = panel?.querySelector?.('.toy-chain-btn');
    if (chainBtn) {
        // PERF: Avoid forced reflow from `offsetWidth` animation restart.
        // Use Web Animations API instead (no layout flush required).
        try {
            // Cancel any in-flight flash so repeated pulses don't stack.
            if (chainBtn.__chainFlashAnim) {
                try { chainBtn.__chainFlashAnim.cancel(); } catch {}
                chainBtn.__chainFlashAnim = null;
            }
          const anim = chainBtn.animate(
              [
                  { transform: 'translateY(-50%) scale(1)', filter: 'brightness(1)' },
                  { transform: 'translateY(-50%) scale(1.08)', filter: 'brightness(1.35)' },
                  { transform: 'translateY(-50%) scale(1)', filter: 'brightness(1)' },
              ],
              { duration: durationMs, iterations: 1, easing: 'ease-out' }
          );
            chainBtn.__chainFlashAnim = anim;
            anim.onfinish = () => { chainBtn.__chainFlashAnim = null; };
            anim.oncancel = () => { chainBtn.__chainFlashAnim = null; };
        } catch {
            // Fallback to class-based flash (but without offsetWidth reflow).
            chainBtn.classList.add('chain-btn-flash');
            setTimeout(() => chainBtn.classList.remove('chain-btn-flash'), durationMs + 25);
        }
    }

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
const g_pulseUntil = new Map(); // panelEl -> untilMs
const g_pulseLastRequestAt = new WeakMap(); // panelEl -> last request timestamp (ms)
const PULSE_MIN_REQUEUE_MS = 120; // coalesce rapid pulses into one visible pulse

// Pulse cleanup timers (ensure we do *one* DOM remove per pulse window, not per frame).
const g_pulseCleanupTimer = new WeakMap(); // panelEl -> timeoutId

function schedulePulseCleanup(panel) {
  if (!panel || !panel.isConnected) return;
  // Clear any existing cleanup timer for this panel.
  const prev = g_pulseCleanupTimer.get(panel);
  if (prev) {
    try { clearTimeout(prev); } catch {}
    try { g_pulseCleanupTimer.delete(panel); } catch {}
  }
  const until = g_pulseUntil.get(panel) || 0;
  if (!until) return;
  const now = performance.now();
  const delay = Math.max(0, Math.ceil(until - now) + 8);
  const id = window.setTimeout(() => {
    // Only remove if we've truly expired (pulses can extend the until time).
    try {
      const u = g_pulseUntil.get(panel) || 0;
      if (!panel.isConnected) return;
      if (u && performance.now() < u) {
        // Still active; reschedule based on the new expiry.
        schedulePulseCleanup(panel);
        return;
      }
      g_pulseUntil.delete(panel);
      if (panel.classList.contains('toy-playing-pulse')) {
        if (window.__PERF_TRACE_DOM_WRITES) traceDomWrite('pulseToyBorder: classList.remove toy-playing-pulse');
        panel.classList.remove('toy-playing-pulse');
      }
    } catch {}
  }, delay);
  g_pulseCleanupTimer.set(panel, id);
}

// Pulse class removals are intentionally executed outside rAF to avoid triggering
// style/layout work in the animation callback.
const g_pulseRemoveQueue = new Set(); // panelEl
let g_pulseRemoveTimer = 0;
function queuePulseClassRemoval(panel) {
  if (!panel || !panel.isConnected) return;
  g_pulseRemoveQueue.add(panel);
  if (g_pulseRemoveTimer) return;
  g_pulseRemoveTimer = window.setTimeout(() => {
    g_pulseRemoveTimer = 0;
    for (const p of g_pulseRemoveQueue) {
      try {
        if (p && p.isConnected && p.classList.contains('toy-playing-pulse')) {
          if (window.__PERF_TRACE_DOM_WRITES) traceDomWrite('pulseToyBorder: classList.remove toy-playing-pulse');
          p.classList.remove('toy-playing-pulse');
        }
      } catch {}
    }
    g_pulseRemoveQueue.clear();
  }, 0);
}

// Pulse class adds are also executed outside rAF to avoid triggering style/layout work
// in the animation callback. (PerfTrace tags these as dom-in-raf otherwise.)
const g_pulseAddQueue = new Set(); // panelEl
let g_pulseAddTimer = 0;
function queuePulseClassAdd(panel) {
  if (!panel || !panel.isConnected) return;
  g_pulseAddQueue.add(panel);
  if (g_pulseAddTimer) return;
  g_pulseAddTimer = window.setTimeout(() => {
    g_pulseAddTimer = 0;
    for (const p of g_pulseAddQueue) {
      try {
        if (!p || !p.isConnected) continue;
        if (!p.classList.contains('toy-playing')) {
          if (window.__PERF_TRACE_DOM_WRITES) traceDomWrite('pulseToyBorder: classList.add toy-playing');
          p.classList.add('toy-playing');
        }
        if (!p.classList.contains('toy-playing-pulse')) {
          if (window.__PERF_TRACE_DOM_WRITES) traceDomWrite('pulseToyBorder: classList.add toy-playing-pulse');
          p.classList.add('toy-playing-pulse');
          // Only queue outline sync when the pulse actually begins (not every pulse request).
          window.__PERF_OUTLINE_SYNC_COUNT = (window.__PERF_OUTLINE_SYNC_COUNT || 0) + 1;
          try { queueBodyOutlineSync(p); } catch {}
        }
      } catch {}
    }
    g_pulseAddQueue.clear();
  }, 0);
}

function queueBodyOutlineSync(panel) {
  if (!panel || !panel.isConnected) return;
  g_outlineSyncQueue.add(panel);
  if (g_outlineSyncRaf) return;
  const rafCb = () => {
    g_outlineSyncRaf = 0;
    for (const p of g_outlineSyncQueue) {
      try { syncBodyOutline(p); } catch {}
    }
    g_outlineSyncQueue.clear();
  };
  rafCb.__perfRafTag = 'perf.raf.outlineSync';
  g_outlineSyncRaf = requestAnimationFrame(rafCb);
}

function pulseToyBorder(panel, durationMs = 320) {
  if (!panel || !panel.isConnected) return;
  if (window.__PERF_DISABLE_PULSES) return;
  if (!shouldRenderToyVisuals(panel)) return;

  window.__PERF_PULSE_COUNT = (window.__PERF_PULSE_COUNT || 0) + 1;
  const now = performance.now();

  // Coalesce ultra-rapid pulse requests (common when notes are dense).
  const lastReq = g_pulseLastRequestAt.get(panel) || 0;
  g_pulseLastRequestAt.set(panel, now);

  const hadPulseClass = panel.classList.contains('toy-playing-pulse');
  const until = now + durationMs;

  // Always extend the expiry (even if we skip DOM writes).
  const prevUntil = g_pulseUntil.get(panel) || 0;
  if (until > prevUntil) g_pulseUntil.set(panel, until);
  schedulePulseCleanup(panel);

  // If already pulsing and requests are coming in hot, don't touch the DOM again.
  if (hadPulseClass && (now - lastReq) < PULSE_MIN_REQUEUE_MS) {
    return;
  }

  // Add pulse classes outside rAF (avoid dom-in-raf).
  if (!hadPulseClass || !panel.classList.contains('toy-playing')) {
    queuePulseClassAdd(panel);
  }
}

function serviceToyPulses(nowMs) {
  if (g_pulseUntil.size === 0) return;
  for (const [panel, until] of g_pulseUntil.entries()) {
    if (until > nowMs) continue;
    if (!panel || !panel.isConnected) {
      g_pulseUntil.delete(panel);
      continue;
    }
    // Remove the pulse class outside rAF to avoid style/layout flushes in-frame.
    if (panel.classList.contains('toy-playing-pulse')) queuePulseClassRemoval(panel);
    g_pulseUntil.delete(panel);
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
        core.style.setProperty('--c-btn-icon-url', `url('./assets/UI/T_ButtonExtend.png')`);
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

    if (CHAIN_DEBUG && window.__CHAIN_DEBUG) {
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
            coreEl.style.setProperty('--c-btn-icon-url', `url('./assets/UI/${icon}')`);
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
            if (window.__CHAIN_DEBUG) {
                console.log('[chain] new child', { parent: panel.id, child: newPanel.id });
            }
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
        let sourceWidth = sourcePanel.offsetWidth || (getRect(sourcePanel).width / boardScale);
        let sourceHeight = sourcePanel.offsetHeight || (getRect(sourcePanel).height / boardScale);

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
            const sourceRect = getRect(sourcePanel);
            const boardRect = getRect(board);
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

        // -----------------------------------------------------------------
        // Internal-board ownership propagation
        // -----------------------------------------------------------------
        // In internal mode, chain visuals are filtered by art-toy ownership.
        // The chain button creates new panels directly, so we MUST stamp the
        // same owner metadata onto the spawned child panel, otherwise the
        // scheduler will play but connector edges will be filtered out.
        try {
            const parentOwner =
                (sourcePanel && sourcePanel.dataset && sourcePanel.dataset.artOwnerId) ? sourcePanel.dataset.artOwnerId : '';
            const internalActive = !!(g_artInternal && g_artInternal.active);
            const internalOwner = internalActive ? (g_artInternal.artToyId || '') : '';
            const resolvedOwner = internalOwner || parentOwner;
            if (resolvedOwner) {
                newPanel.dataset.artOwnerId = resolvedOwner;
            }
            // Helpful explicit flag: "this panel belongs to an internal board world"
            if (internalActive) {
                newPanel.dataset.internalBoardOwner = '1';
            } else if (sourcePanel?.dataset?.internalBoardOwner) {
                newPanel.dataset.internalBoardOwner = sourcePanel.dataset.internalBoardOwner;
            }
        } catch {}

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
                if (window.__CHAIN_DEBUG) {
                    console.warn('[chain][overview] failed to register new panel in overview positions', err);
                }
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
        const initialPlacement = ensureSharedPanelSpawnPlacement(newPanel, {
            baseLeft: normalLeft,
            baseTop: normalTop,
            fallbackWidth: sourceWidth,
            fallbackHeight: sourceHeight,
        });
        syncOverviewPosition(newPanel);
        if (!overviewActiveAtCreate && initialPlacement?.changed) {
            try { persistToyPosition(newPanel); } catch (err) {
                if (window.__CHAIN_DEBUG) console.warn('[chain] persistToyPosition failed', err);
            }
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
                if (window.__CHAIN_DEBUG) {
                    console.warn('[chain][overview] refreshDecorations failed', err);
                }
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
            if (window.__CHAIN_DEBUG) {
              console.log('[chain][new-child]', {
                parent: sourcePanel.id,
                child: newPanel.id,
                oldNextId: oldNextId || null,
                chainHasChild: sourcePanel.dataset.chainHasChild || null,
                btnDisabledAttr: btn?.getAttribute('data-chaindisabled') || null,
                btnHasDisabledClass: btn?.classList?.contains?.('toy-chain-btn-disabled') || false,
                btnComputedIcon: core ? getComputedStyle(core).getPropertyValue('--c-btn-icon-url') : null,
              });
            }

            // Immediately swap the source "+" texture to the empty state now that it has an outgoing link.
            const sourceChainCore = sourcePanel.querySelector('.toy-chain-btn .c-btn-core');
            if (sourceChainCore) {
                sourceChainCore.style.setProperty('--c-btn-icon-url', `url('./assets/UI/T_ButtonEmpty.png')`);
                // Force the pseudo-element to update after styles apply
                requestAnimationFrame(() => {
                    sourceChainCore.style.setProperty('--c-btn-icon-url', `url('./assets/UI/T_ButtonEmpty.png')`);
                });
            }
            // Lock the source button right away so the user sees it disable without waiting
            const sourceChainBtn = sourcePanel.querySelector('.toy-chain-btn');
            if (sourceChainBtn) {
                sourceChainBtn.setAttribute('data-chaindisabled', '1');
                sourceChainBtn.style.pointerEvents = 'none';
                sourceChainBtn.classList.add('toy-chain-btn-disabled');
                // Nudge a repaint to avoid blank icons when chaining immediately after refresh
                getRect(sourceChainBtn);
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
                        if (window.__CHAIN_DEBUG) console.warn('[chain] persistToyPosition failed', err);
                    }
                    syncOverviewPosition(newPanel);
                    updateChains();
                    updateAllChainUIs();
                    // Ensure connector geometry is rebuilt immediately (important for internal mode).
                    try { rebuildChainSegments(); } catch {}
                    try { scheduleChainRedraw(true); } catch {}
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
                    if (window.__CHAIN_DEBUG) console.warn('[chain] persistToyPosition failed', err);
                }

                updateChains();
                updateAllChainUIs();
                // Ensure connector geometry is rebuilt immediately (important for internal mode).
                try { rebuildChainSegments(); } catch {}
                try { scheduleChainRedraw(true); } catch {}
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
            if (window.__CHAIN_DEBUG) {
                console.log('[CHAIN][perf] chained toy created in', dt.toFixed(1), 'ms');
            }
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
    const rect = getRect(panel);
    const viewRect = getRect(viewport);
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    return cx < viewRect.left || cx > viewRect.right || cy < viewRect.top || cy > viewRect.bottom;
}

function isPanelNearViewportEdge(panel, marginPx = 96) {
    if (!panel || typeof panel.getBoundingClientRect !== 'function') return false;
    const viewport = panel.closest?.('.board-viewport') || document.querySelector('.board-viewport') || document.documentElement;
    if (!viewport) return false;
    const rect = getRect(panel);
    const viewRect = getRect(viewport);
    const m = Math.max(0, Number(marginPx) || 0);
    // "Near edge" means any part of the panel is inside the margin band.
    // Also treat fully offscreen as near-edge so we pan in both cases.
    if (rect.right < viewRect.left || rect.left > viewRect.right || rect.bottom < viewRect.top || rect.top > viewRect.bottom) {
        return true;
    }
    return (
        rect.left < (viewRect.left + m) ||
        rect.right > (viewRect.right - m) ||
        rect.top < (viewRect.top + m) ||
        rect.bottom > (viewRect.bottom - m)
    );
}

function hintOffscreenSpawn(panel) {
    if (!panel || !panel.isConnected) return;
    // Disabled: we no longer spawn particles from the create-toy button when a toy
    // spawns offscreen/near-edge. (It was visually noisy and misleading.)
    return;
}

function persistToyPosition(panel) {
    try {
        if (typeof window !== 'undefined' && window.__PERF_LAB_RUN_CONTEXT === 'auto') return;
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

function createToyPanelAt(toyType, {
    centerX,
    centerY,
    instrument,
    autoCenter,
    allowOffscreen = false,
    shouldHintOffscreen,
    skipSpawnPlacement = false,
    // NEW: optional placement container + ownership tag (internal-board spawns)
    containerEl = null,
    artOwnerId = null,
} = {}) {
    const type = String(toyType || '').toLowerCase();
    if (!type || !toyInitializers[type]) {
        console.warn('[createToyPanelAt] unknown toy type', toyType);
        return null;
    }
    const board = containerEl || document.getElementById('board');
    if (!board) return null;

    // ---------------------------------------------------------------------
    // Internal Board: auto-tag spawned toys with the active Art Toy owner.
    //
    // Chain connector drawing inside internal boards filters strictly by
    // panel.dataset.artOwnerId matching g_artInternal.artToyId.
    // If we spawn toys into the internal board without tagging ownership,
    // playback can still work, but connector geometry is skipped -> edges: 0.
    // ---------------------------------------------------------------------
    let resolvedArtOwnerId = artOwnerId;
    try {
        const internalActive = !!(g_artInternal && g_artInternal.active);
        const spawningIntoInternalWorld = (board && board.id === 'internal-board-world');
        if (internalActive && spawningIntoInternalWorld && !resolvedArtOwnerId) {
            resolvedArtOwnerId = g_artInternal.artToyId || null;
        }
    } catch {}
    const shouldHintOffscreenResolved = (typeof shouldHintOffscreen === 'boolean') ? shouldHintOffscreen : !!autoCenter;
    let chosenInstrument = instrument;
    if (!chosenInstrument) {
        const theme = getSoundThemeKey?.() || '';
        const used = collectUsedInstruments();
        const preferPriority = (used && typeof used.size === 'number') ? (used.size === 0) : false;
        const picked = pickInstrumentForToy(type, { theme, usedIds: used, preferPriority });
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

    const rawLeft = Number.isFinite(centerX) ? (centerX - (width || 0) / 2) : 0;
    const rawTop = Number.isFinite(centerY) ? (centerY - (height || 0) / 2) : 0;
    const left = allowOffscreen ? rawLeft : Math.max(0, rawLeft);
    const top = allowOffscreen ? rawTop : Math.max(0, rawTop);

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;

    // If this was spawned inside an Art Toy internal board, tag it for ownership.
    if (resolvedArtOwnerId) {
        panel.dataset.artOwnerId = String(resolvedArtOwnerId);
        panel.dataset.internalBoardOwner = String(resolvedArtOwnerId);
        // Inherit current owner-level volume/mute so newly created internal toys
        // immediately match the Art Toy slider state.
        try {
            const ownerPanel = document.getElementById(String(resolvedArtOwnerId));
            if (ownerPanel) {
                const ownerVol = Number(ownerPanel.dataset?.toyVolume);
                const ownerMuted = ownerPanel.dataset?.toyMuted;
                if (Number.isFinite(ownerVol)) panel.dataset.toyVolume = String(Math.max(0, Math.min(1, ownerVol)));
                if (ownerMuted === '1' || ownerMuted === '0' || ownerMuted === 'true' || ownerMuted === 'false') {
                    const isMuted = (ownerMuted === '1' || ownerMuted === 'true');
                    panel.dataset.toyMuted = isMuted ? '1' : '0';
                }
            }
        } catch {}
    }

    board.appendChild(panel);
    const isInternalSpawn = !!panel.dataset.internalBoardOwner && board?.id === 'internal-board-world';
    // Creating a toy changes chain structure. Ensure the scheduler will resync.
    g_chainStructureVersion++;
    g_lastSequencedToyCount = -1;
    try { updateChains(); } catch {}
    // Hint the focus animator to scale in like a focus transition on first render.
    panel.dataset.spawnScaleHint = '0.75';

    if (!skipSpawnPlacement) {
        const initialPlacement = ensureSharedPanelSpawnPlacement(panel, {
            baseLeft: left,
            baseTop: top,
            fallbackWidth: width,
            fallbackHeight: height,
        });
        if (initialPlacement?.changed) {
            // The helper already wrote the updated position to the style attributes.
        }
    }
    if (!isInternalSpawn) {
        syncOverviewPosition(panel);
        persistToyPosition(panel);
    }

    setTimeout(() => {
        if (!panel.isConnected) return;
        // If something (eg Art Toy external random) forced init immediately, skip.
        if (panel.__mtToyInitDone) return;
        panel.__mtToyInitDone = true;

        try { initializeNewToy(panel); } catch (err) { console.warn('[createToyPanelAt] init failed', err); }
        try { initToyChaining(panel); } catch (err) { console.warn('[createToyPanelAt] chain init failed', err); }

        const finalizePlacement = () => {
            if (!skipSpawnPlacement) {
                const followUp = ensureSharedPanelSpawnPlacement(panel, {
                    fallbackWidth: width,
                    fallbackHeight: height,
                    skipIfMoved: true,
                });
                if (followUp?.changed) {
                    if (!isInternalSpawn) persistToyPosition(panel);
                }
            }
            if (!isInternalSpawn) syncOverviewPosition(panel);
            try { updateChains(); updateAllChainUIs(); } catch (err) { console.warn('[createToyPanelAt] chain update failed', err); }
            try { applyStackingOrder(); } catch (err) { console.warn('[createToyPanelAt] stacking failed', err); }
            try { window.Persistence?.markDirty?.(); } catch (err) { console.warn('[createToyPanelAt] mark dirty failed', err); }
            delete panel.dataset.spawnAutoManaged;
            delete panel.dataset.spawnAutoLeft;
            delete panel.dataset.spawnAutoTop;
            const overviewActive = !!(window.__overviewMode?.isActive?.() ||
                document.querySelector('#board')?.classList?.contains('board-overview') ||
                document.body?.classList?.contains('overview-mode'));
            const allowAutoCenter =
                !!autoCenter &&
                !panel.__restoringFromSnapshot &&
                window.__PERF_LAB_RUN_CONTEXT !== 'auto';
            if (panel.isConnected && !overviewActive && allowAutoCenter) {
                setToyFocus(panel, { center: true });
                // If the spawn ended up offscreen or hugging the edge, lerp the camera to it.
                // This is global behaviour and is NOT tied to scene save/load.
                panToSpawnedPanel(panel, { duration: 650 });
            }
            if (shouldHintOffscreenResolved) {
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

// --- Internal board helpers for ToySpawner (so Create Toy targets internal-board-world while active) ---
try {
    window.__mtInternalBoard = Object.assign(window.__mtInternalBoard || {}, {
        isActive: () => !!g_artInternal?.active,
        getActiveArtToyId: () => g_artInternal?.artToyId || null,
        getWorldEl: () => document.getElementById('internal-board-world'),
        getViewportEl: () => document.getElementById('internal-board-viewport'),
        // Convert screen coords into internal world coords using the *LIVE* internal-board camera.
        // IMPORTANT: in internal-board mode we drive the camera via the main board camera system
        // (identity swap). The true current transform lives in CSS vars on the internal viewport:
        //   --bv-scale, --bv-tx, --bv-ty
        // Using g_artInternal.{scale,tx,ty} here can be stale and causes huge offsets / wrong scale.
        clientToWorld: (clientX, clientY) => {
            const viewport = document.getElementById('internal-board-viewport');
            if (!viewport) return null;

            const rect = viewport.getBoundingClientRect();
            const localX = clientX - rect.left;
            const localY = clientY - rect.top;
            const inside = localX >= 0 && localY >= 0 && localX <= rect.width && localY <= rect.height;

            // Read the camera vars that the board-viewport system is actually using right now.
            // (--bv-tx/--bv-ty are px strings; parseFloat handles that.)
            let scale = 1;
            let panX = 0;
            let panY = 0;
            try {
                const cs = getComputedStyle(viewport);
                const s0 = parseFloat(cs.getPropertyValue('--bv-scale'));
                const tx0 = parseFloat(cs.getPropertyValue('--bv-tx'));
                const ty0 = parseFloat(cs.getPropertyValue('--bv-ty'));
                if (Number.isFinite(s0)) scale = s0;
                if (Number.isFinite(tx0)) panX = tx0;
                if (Number.isFinite(ty0)) panY = ty0;
            } catch {}

            scale = Math.max(1e-6, Number(scale) || 1);
            const x = (localX - panX) / scale;
            const y = (localY - panY) / scale;
            return { inside, x, y, rect, localX, localY, scaleX: scale, scaleY: scale, panX, panY };
        },
    });
} catch (err) {
    console.warn('[internal-board] global helper registration failed', err);
}

function destroyToyPanel(panelOrId, opts = {}) {
    const panel = typeof panelOrId === 'string' ? document.getElementById(panelOrId) : panelOrId;
    if (!panel) return false;
    if (!panel.classList || !panel.classList.contains('toy-panel')) return false;
    const allowOffBoard = !!opts.allowOffBoard;
    const board = document.getElementById('board');
    if (!allowOffBoard && (!board || !board.contains(panel))) return false;

    const panelId = panel.id;
    const prevId = panel.dataset.prevToyId || '';
    const nextId = panel.dataset.nextToyId || '';

    // --- AUDIO: stop immediately on delete ---
    // Notes are scheduled ahead (lookahead). If we don't cancel/mute, the deleted toy
    // will keep playing already-scheduled events for a few beats.
    try { cancelScheduledToySources(panelId); } catch {}
    try {
        const audioToyId = panel?.dataset?.audiotoyid;
        if (audioToyId && audioToyId !== panelId) cancelScheduledToySources(audioToyId);
    } catch {}
    try {
        const ctx = ensureAudioContext();
        const g = getToyGain(panelId);
        const t = ctx?.currentTime ?? 0;
        // Hard-mute immediately (also silences tone-synth fallbacks that route via toy gain).
        try { g.gain.cancelScheduledValues(t); } catch {}
        try { g.gain.setValueAtTime(0, t); } catch { try { g.gain.value = 0; } catch {} }
    } catch {}

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
    // Deleting a toy changes chain structure. Ensure the scheduler will resync even
    // if the toy-count returns to the same value after a subsequent create.
    g_chainStructureVersion++;
    g_lastSequencedToyCount = -1;
    try { updateChains(); } catch {}

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

function destroyArtToyPanel(panelOrId) {
    const panel = typeof panelOrId === 'string' ? document.getElementById(panelOrId) : panelOrId;
    if (!panel) return false;
    if (!panel.classList || !panel.classList.contains('art-toy-panel')) return false;
    if (panel.classList.contains('internal-art-anchor-ghost')) return false;

    const artToyId = panel.id || '';

    // If this art toy is currently open, close internal mode first so board identity
    // and overlay state stay coherent while we delete owned content.
    try {
        if (g_artInternal?.active && g_artInternal?.artToyId === artToyId) {
            exitInternalBoardImmediate();
        }
    } catch (err) {
        console.warn('[destroyArtToyPanel] internal exit failed', err);
    }

    // Remove owned internal toys via the shared toy destroy path (off-board capable).
    try {
        const owned = getInternalPanelsForArtToy(artToyId);
        for (const p of owned) {
            try { destroyToyPanel(p, { allowOffBoard: true }); } catch {}
        }
    } catch (err) {
        console.warn('[destroyArtToyPanel] destroy owned toys failed', err);
    }

    // Remove matching internal home ghost if present.
  try {
    stopInternalArtAnchorSync(artToyId);
    const sel = `.internal-art-anchor-ghost[data-art-toy-id="${CSS.escape(String(artToyId))}"]`;
    document.querySelectorAll(sel).forEach((el) => {
      try { el.remove(); } catch {}
    });
  } catch {}

    try { panel.remove(); } catch {}
    try { updateChains(); } catch {}
    try { updateAllChainUIs(); } catch {}
    try { scheduleChainRedraw(); } catch {}
    try { applyStackingOrder(); } catch {}
    try { window.Persistence?.markDirty?.(); } catch {}
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
    window.ArtToyFactory = Object.assign(window.ArtToyFactory || {}, {
        destroy: destroyArtToyPanel,
    });
    if (window.ToySpawner && typeof window.ToySpawner.configure === 'function') {
        window.ToySpawner.configure({
            getCatalog: () => getToyCatalog(),
            create: createToyPanelAt,
            remove: destroyToyPanel,
        });
        if (typeof window.ToySpawner.configureArt === 'function') {
            window.ToySpawner.configureArt({
                getCatalog: () => getArtCatalog(),
                create: createArtToyAt,
                remove: destroyArtToyPanel,
            });
        }
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
  // Internal board: panels live inside a different viewport/world that is transformed
  // independently. Using style.left/top math here can drift/offset under pan+zoom.
  // Prefer a rect->world conversion using the internal board's transform when active.
  try {
    const internalActive = !!(g_artInternal && g_artInternal.active);
    const inInternal = internalActive && !!panel?.closest?.('#internal-board-world');
    if (inInternal) {
      const pr = panel.getBoundingClientRect();

      // Anchor vertically at the toy body center if available (matches main-board behaviour).
      let clientY = pr.top + pr.height * 0.5;
      const body = panel.querySelector?.('.toy-body');
      if (body) {
        const br = body.getBoundingClientRect();
        if (br && Number.isFinite(br.top) && Number.isFinite(br.height)) {
          clientY = br.top + br.height * 0.5;
        }
      }

      const clientX = (side === 'left') ? pr.left : pr.right;

      // Internal board: prefer the internal helper which reads the live CSS camera vars.
      let wHelper = null;
      try { wHelper = window.__mtInternalBoard?.clientToWorld?.(clientX, clientY) || null; } catch {}

      dbgChainInternalDeep('getChainAnchor(internal)', {
        panelId: panel?.id || null,
        side,
        client: { x: clientX, y: clientY },
        panelRect: pr ? { x: pr.x, y: pr.y, w: pr.width, h: pr.height } : null,
        world_helper: (wHelper && Number.isFinite(wHelper.x) && Number.isFinite(wHelper.y)) ? { x: wHelper.x, y: wHelper.y } : null,
        helper_meta: (wHelper && wHelper.rect) ? {
          vp: { x: wHelper.rect.x, y: wHelper.rect.y, w: wHelper.rect.width, h: wHelper.rect.height },
          local: (Number.isFinite(wHelper.localX) && Number.isFinite(wHelper.localY)) ? { x: wHelper.localX, y: wHelper.localY } : null,
          scale: Number.isFinite(wHelper.scaleX) ? wHelper.scaleX : null,
          pan: (Number.isFinite(wHelper.panX) && Number.isFinite(wHelper.panY)) ? { x: wHelper.panX, y: wHelper.panY } : null,
          inside: !!wHelper.inside,
        } : null,
      });

      if (wHelper && Number.isFinite(wHelper.x) && Number.isFinite(wHelper.y)) {
        return { x: wHelper.x, y: wHelper.y };
      }

    }
  } catch {}

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
  // Deep debug: capture the raw anchor points we are feeding into the edge.
  // Enable with: localStorage.CHAIN_INTERNAL_DEEP_DBG="1"
  dbgChainInternalDeep('edgeAnchors', {
    fromId: fromPanel?.id || null,
    toId: toPanel?.id || null,
    a1: (a1 && Number.isFinite(a1.x) && Number.isFinite(a1.y)) ? { x: a1.x, y: a1.y } : a1,
    a2: (a2 && Number.isFinite(a2.x) && Number.isFinite(a2.y)) ? { x: a2.x, y: a2.y } : a2,
  });
  return { a1, a2 };
}

function updateChainEdgeControls(edge) {
  if (!edge) return;
  const { p1x, p1y, p2x, p2y } = edge;
  if (!Number.isFinite(p1x) || !Number.isFinite(p1y) || !Number.isFinite(p2x) || !Number.isFinite(p2y)) {
    edge.c1x = edge.c1y = edge.c2x = edge.c2y = NaN;
    return;
  }
  const dx = p2x - p1x;
  const dy = p2y - p1y;
  const dist = Math.hypot(dx, dy) || 1;
  const handleLength = Math.max(28, dist * 0.25); // horizontal-only handles
  edge.c1x = p1x + handleLength;
  edge.c1y = p1y;
  edge.c2x = p2x - handleLength;
  edge.c2y = p2y;
}

function rebuildChainSegments() {
  // New edge model + adjacency index.
  g_chainEdges.clear();
  g_edgesByToyId.clear();

  const board = document.getElementById('board');
  if (!board || !g_chainState || g_chainState.size === 0) return;

  const internalActive = !!(g_artInternal && g_artInternal.active);
  const activeArtToyId = internalActive ? (g_artInternal.artToyId || null) : null;

  for (const headId of g_chainState.keys()) {
    let current = document.getElementById(headId);
    const visited = new Set();

    while (current && !visited.has(current.id)) {
      visited.add(current.id);

      const nextId = current.dataset.nextToyId;
      if (!nextId) break;
      const next = document.getElementById(nextId);
      if (!next) break;

      if (!internalActive) {
        // Main board: Art Toy internal chains should NOT draw connectors.
        if (current.dataset.artOwnerId || next.dataset.artOwnerId) {
          current = next;
          continue;
        }
      } else {
        // Internal board: ONLY draw connectors for panels owned by the active art toy.
        const aOwner = current.dataset.artOwnerId;
        const bOwner = next.dataset.artOwnerId;
        if (!activeArtToyId || aOwner !== activeArtToyId || bOwner !== activeArtToyId) {
          current = next;
          continue;
        }
      }

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
      updateChainEdgeControls(edge);

      g_chainEdges.set(edgeId, edge);

      // Adjacency index ? useful for future detach/reattach UX.
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

  const boardCtx = getActiveBoardContext();
  const layer = getOrCreateChainLayer(boardCtx.key);

  // Ensure chain canvas is attached to the active context's viewport.
  try { ensureChainCanvasAttachedToActiveBoard(boardCtx); } catch {}
  if (!chainCanvas || !chainCtx) return;

  // Per-context sizing cache (prevents main<->internal cache leakage)
  try {
    const vp = boardCtx?.viewportEl;
    layer.cache.boardClientWidth = vp?.clientWidth || 0;
    layer.cache.boardClientHeight = vp?.clientHeight || 0;
    // keep legacy globals in sync for debug/compat
    g_boardClientWidth = layer.cache.boardClientWidth;
    g_boardClientHeight = layer.cache.boardClientHeight;
  } catch {}
  const __perfOn = !!(window.__PerfFrameProf && typeof performance !== 'undefined' && performance.now);

  const width = g_boardClientWidth || 0;
  const height = g_boardClientHeight || 0;
  const internalActive = !!(g_artInternal && g_artInternal.active);

  // IMPORTANT:
  // Chains draw in WORLD coords and we apply a world->screen transform on the 2D ctx.
  // In internal-board mode, the *source of truth* is the CSS transform on the internal world element
  // (identity swap can make #board point at internal world, and g_artInternal.{scale,tx,ty} can drift).
  // So we read the world element’s computed transform instead of using g_artInternal.
  let scale = 1;
  let tx = 0;
  let ty = 0;
  try {
    if (internalActive) {
      // IMPORTANT: during identity swap, internal world may be #board.
      // Use the active board context’s worldEl so we always read the real element.
      const cssT = (typeof getInternalBoardCssTransform === 'function')
        ? getInternalBoardCssTransform(boardCtx?.worldEl || null)
        : null;

      if (cssT && Number.isFinite(cssT.scale)) {
        scale = Number(cssT.scale) || 1;
        tx = Number(cssT.tx) || 0;
        ty = Number(cssT.ty) || 0;
        dbgChainInternalDeep?.('internalCssTransform(used)', {
          css: { scale: cssT.scale, tx: cssT.tx, ty: cssT.ty, raw: cssT.raw, worldId: cssT.worldId, worldClass: cssT.worldClass },
          gArt: { scale: g_artInternal?.scale, tx: g_artInternal?.tx, ty: g_artInternal?.ty },
        });
      } else {
        // Fallback: should be rare now, but keep it safe.
        scale = Number(g_artInternal?.scale) || 1;
        tx = Number(g_artInternal?.tx) || 0;
        ty = Number(g_artInternal?.ty) || 0;
        dbgChainInternalDeep?.('internalCssTransformMissing_fallbackToGArt', { boardCtxKey: boardCtx?.key || null });
      }
    } else {
      const t = getViewportTransform() || {};
      scale = Number(t.scale) || 1;
      tx = Number(t.tx) || 0;
      ty = Number(t.ty) || 0;
    }
  } catch {}

  const safeScale = (Number.isFinite(scale) && Math.abs(scale) > 1e-6) ? scale : 1;
  if (internalActive) {
    dbgChainInternalDeep?.('internalCamFinal', { safeScale, tx, ty });
  }

  // IMPORTANT:
  // The chain canvas is a SCREEN-SPACE overlay attached to the active viewport.
  // Therefore:
  // - the canvas element is sized/positioned in SCREEN pixels (0,0 .. viewport w/h)
  // - we draw geometry in WORLD coords and apply the camera transform on the 2D ctx
  //   (screen = world * scale + translate)
  //
  // Previously we attempted to position the canvas in WORLD space (left/top in world
  // units) while ALSO attaching it as a viewport overlay. That mismatch is what caused
  // chains to appear ~half-size and massively offset.
  const worldLeft = 0;
  const worldTop = 0;
  const edgeCount = g_chainEdges ? g_chainEdges.size : 0;

  if (!width || !height) return;

  const tStart = performance.now();

  // Use a lower-resolution backing buffer for the chain canvas to reduce GPU cost.
  // We still draw in board coordinates, but the internal pixel density is scaled down.
  const devicePixelRatioForChains = window.devicePixelRatio || 1;
  const dpr = devicePixelRatioForChains * CHAIN_CANVAS_RESOLUTION_SCALE;
  const canvasW = chainCanvas.width / dpr;
  const canvasH = chainCanvas.height / dpr;

  dbgChainInternalDeep('drawChains(pre)', {
    width,
    height,
    internalActive: internalActive,
    edgeCount,
    cam: { scale, tx, ty, safeScale, worldLeft, worldTop },
    dpr: { device: devicePixelRatioForChains, mul: CHAIN_CANVAS_RESOLUTION_SCALE, effective: dpr },
    canvasLogical: { w: canvasW, h: canvasH },
  });

  // --- Phase 1: resize canvas if board viewport changed ---
  let tAfterResize = tStart;
  const sizeChanged = forceFull || canvasW !== width || canvasH !== height;

  if (sizeChanged) {
    const tResizeStart = performance.now();

    // Screen-sized backing buffer (viewport pixels * dpr)
    chainCanvas.width = width * dpr;
    chainCanvas.height = height * dpr;
    tAfterResize = performance.now();

    if (CHAIN_DEBUG) {
      console.log('[CHAIN][perf][resize] chainCanvas resized', 'board=', width, 'x', height, 'canvas=', chainCanvas.width, 'x', chainCanvas.height, 'cost=', (tAfterResize - tResizeStart).toFixed(2), 'ms')
    }
  } else {
    tAfterResize = performance.now();
  }

  // Keep the overlay canvas pinned to the viewport.
  if (sizeChanged || forceFull) {
    chainCanvas.style.left = '0px';
    chainCanvas.style.top = '0px';
    chainCanvas.style.width = `${width}px`;
    chainCanvas.style.height = `${height}px`;
    // Keep bookkeeping for debug/metrics.
    g_chainCanvasWorldLeft = 0;
    g_chainCanvasWorldTop = 0;
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
    if (__perfOn) {
      window.__PerfFrameProf.mark('chain.draw', performance.now() - tStart);
    }
    return;
  }

  // --- Phase 3: draw all edges ---
  // Apply camera transform directly: screen = world*scale + translate
  // Include dpr (and CHAIN_CANVAS_RESOLUTION_SCALE via dpr).
  chainCtx.setTransform(
    safeScale * dpr, 0,
    0, safeScale * dpr,
    tx * dpr,
    ty * dpr
  );

  const now = performance.now();
  // You can tweak these to taste. Thicker curves = slightly more GPU work.
  const baseWidth = 4;
  const pulseExtraWidth = 2;

  let connectorCount = 0;
  const tEdgesStart = performance.now();

  chainCtx.lineCap = 'round';
  const baseStroke = 'hsl(222, 100%, 80%)';
  const pulseStroke = 'hsl(222, 100%, 95%)';

  chainCtx.lineWidth = (baseWidth * 3) / safeScale;
  chainCtx.strokeStyle = baseStroke;
  chainCtx.beginPath();
  let hasBasePath = false;
  const pulsingEdges = [];

  for (const edge of g_chainEdges.values()) {
    const { fromToyId, toToyId, p1x, p1y, p2x, p2y, c1x, c1y, c2x, c2y } = edge;

    if (!Number.isFinite(p1x) || !Number.isFinite(p1y) ||
        !Number.isFinite(p2x) || !Number.isFinite(p2y) ||
        !Number.isFinite(c1x) || !Number.isFinite(c1y) ||
        !Number.isFinite(c2x) || !Number.isFinite(c2y)) {
      continue;
    }

    const pulseInfo = g_pulsingConnectors.get(fromToyId);
    const isPulsing = !!(pulseInfo && pulseInfo.toId === toToyId && pulseInfo.until > now);

    if (isPulsing) {
      pulsingEdges.push(edge);
    } else {
      chainCtx.moveTo(p1x, p1y);
      chainCtx.bezierCurveTo(c1x, c1y, c2x, c2y, p2x, p2y);
      hasBasePath = true;
    }

    connectorCount++;
  }

  if (hasBasePath) {
    chainCtx.stroke();
  }
  if (pulsingEdges.length) {
    chainCtx.lineWidth = ((baseWidth + pulseExtraWidth) * 3) / safeScale;
    chainCtx.strokeStyle = pulseStroke;
    for (const edge of pulsingEdges) {
      chainCtx.beginPath();
      chainCtx.moveTo(edge.p1x, edge.p1y);
      chainCtx.bezierCurveTo(edge.c1x, edge.c1y, edge.c2x, edge.c2y, edge.p2x, edge.p2y);
      chainCtx.stroke();
    }
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
  if (__perfOn) {
    window.__PerfFrameProf.mark('chain.draw', performance.now() - tStart);
  }

  dbgChainInternal('drawChains', { forceFull, width, height, scale, tx, ty });
}

// Shift connector geometry only for segments touching a specific toy by applying
// the toy's movement delta. This avoids layout reads during drag.
function updateChainSegmentsForToy(toyId) {
  if (!toyId) return;
  if (!CHAIN_FEATURE_ENABLE_CONNECTOR_DRAW) return;

  // In internal-board mode, connector endpoints are derived from DOM rect->world conversion
  // (see getChainAnchor). The lightweight "delta" update below assumes endpoints track
  // style.left/top in world units, which is not reliable under internal pan/zoom.
  // Rebuild geometry instead (still cheap given typical edge counts).
  if (g_artInternal && g_artInternal.active) {
    try { rebuildChainSegments(); } catch (err) { if (CHAIN_DEBUG) console.warn('[CHAIN][drag] rebuildChainSegments(internal) failed', err); }
    try { scheduleChainRedraw(); } catch {}
    return;
  }

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

  // No movement since last update ? nothing to do.
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
        updateChainEdgeControls(edge);
        touchedEdges++;
      }
      if (edge.toToyId === toyId) {
        edge.p2x += dx;
        edge.p2y += dy;
        updateChainEdgeControls(edge);
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

function beginChainPanelMove(panelOrId, pos = {}) {
  if (!CHAIN_FEATURE_ENABLE_CONNECTOR_DRAW) return;
  const toyId = (typeof panelOrId === 'string') ? panelOrId : panelOrId?.id;
  if (!toyId) return;
  if (!g_edgesByToyId || !g_edgesByToyId.has(toyId)) return;
  let left = Number.isFinite(pos.left) ? pos.left : NaN;
  let top = Number.isFinite(pos.top) ? pos.top : NaN;
  if (!Number.isFinite(left) || !Number.isFinite(top)) {
    const panel = (typeof panelOrId === 'string') ? document.getElementById(toyId) : panelOrId;
    if (panel) {
      left = parseFloat(panel.style.left);
      top = parseFloat(panel.style.top);
    }
  }
  if (!Number.isFinite(left) || !Number.isFinite(top)) return;
  g_chainToyLastPos.set(toyId, { left, top });
}

function notifyChainPanelMoved(panelOrId) {
  if (!CHAIN_FEATURE_ENABLE_CONNECTOR_DRAW) return;
  const toyId = (typeof panelOrId === 'string') ? panelOrId : panelOrId?.id;
  if (!toyId) return;
  if (!g_edgesByToyId || !g_edgesByToyId.has(toyId)) return;
  if (!g_chainToyLastPos.has(toyId)) {
    rebuildChainSegments();
    scheduleChainRedraw();
    return;
  }
  updateChainSegmentsForToy(toyId);
  scheduleChainRedraw();
}

try {
  window.__chainBeginPanelMove = beginChainPanelMove;
  window.__chainNotifyPanelMoved = notifyChainPanelMoved;
} catch {}

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
let g_chainPausedSnapshot = null;
// Bump this whenever toys are created/destroyed so the scheduler can resync chain state
// even if toy counts happen to return to the same value (delete then create).
let g_chainStructureVersion = 0;
let g_lastSeenChainStructureVersion = -1;
let g_lastChainSyncAt = 0;
let g_lastSequencedToyCount = -1;

function snapshotChainStateForPause(){
  try{
    const snap = new Map();
    g_chainState.forEach((v,k)=> snap.set(k,v));
    g_chainPausedSnapshot = snap;
    g_lastAudioPhase01 = null;
    if (window.__CHAIN_DEBUG) console.log('[chain] snapshot pause', { size: snap.size });
  }catch(e){
    g_chainPausedSnapshot = null;
    if (window.__CHAIN_DEBUG) console.warn('[chain] snapshot pause failed', e);
  }
}

function restoreChainStateAfterResume(){
  try{
    // On resume, always restart chains from their heads.
    // This avoids mid-chain resumes that can skip early notes.
    updateChains();
    const now = ensureAudioContext()?.currentTime;
    for (const headId of g_chainState.keys()) {
      g_chainState.set(headId, headId);
      const headEl = document.getElementById(headId);
      if (headEl) {
        if (Number.isFinite(now)) headEl.__loopStartOverrideSec = now;
        try {
          // Refresh deterministic pattern snapshots on resume (drawgrid relies on these).
          if (typeof headEl.__seqTouch === 'function') headEl.__seqTouch('resume');
        } catch {}
        headEl.__chainJustActivated = true;
        headEl.__forceSchedulerReset = true;
      }
    }
    g_chainPausedSnapshot = null;
    if (window.__CHAIN_DEBUG) console.log('[chain] resume -> reset to heads', { size: g_chainState.size });
  }catch(e){
    if (window.__CHAIN_DEBUG) console.warn('[chain] restore resume failed', e);
  }
}

// Install listeners once
try{
  if (!window.__CHAIN_PAUSE_SNAPSHOT_INSTALLED){
    window.__CHAIN_PAUSE_SNAPSHOT_INSTALLED = true;

    // Snapshot before anything else reacts to pause
    document.addEventListener('transport:pause', snapshotChainStateForPause, true);

    // Restore as soon as transport is running again (audio-core dispatches transport:play)
    document.addEventListener('transport:play', restoreChainStateAfterResume, true);
  }
}catch{}
let g_sequencerScheduler = null;
let audioSchedIntervalId = null;
let g_noteSchedCfg = null;
let g_noteSchedRebuildPending = null;
let g_lastCfgCheckAt = 0;
let g_audioTickBusy = false;
let g_lastAudioPhase01 = null;
let g_audioPostResumeLogUntil = 0;

function computeNoteSchedTiming() {
  const info = getLoopInfo();
  const steps = Number.isFinite(NUM_STEPS) ? NUM_STEPS : 8;
  const barSec = Math.max(0.25, Number(info?.barSec ?? info?.barLenSec ?? 0) || 0);
  const stepSec = barSec / Math.max(1, steps);
  const lookaheadSec = Math.max(0.5, stepSec * 2.5);
  const leadSec = Math.max(0.02, Math.min(0.06, stepSec * 0.25));
  return { lookaheadSec, leadSec, stepSec, barSec, steps };
}

function ensureSequencerScheduler() {
  if (!g_sequencerScheduler) {
    const cfg = computeNoteSchedTiming();
    const lateGraceSec = Math.min(0.08, cfg.stepSec * 0.5);
    g_noteSchedCfg = cfg;
    g_sequencerScheduler = createSequencerScheduler({
      lookaheadSec: cfg.lookaheadSec,
      leadSec: cfg.leadSec,
      lateGraceSec,
    });
    window.__mtNoteSchedConfig = cfg;
    try { window.__NOTE_SCHEDULER_ENABLED = true; } catch {}
  }
  return g_sequencerScheduler;
}

function tickAudioScheduler() {
  if (g_audioTickBusy) return;
  g_audioTickBusy = true;
  try {
    if (!CHAIN_FEATURE_ENABLE_SCHEDULER || !CHAIN_FEATURE_ENABLE_SEQUENCER) return;
    if (!isRunning()) return;
    // Keep chain state in sync with DOM changes (new toys / deleted toys).
    // Critical: delete+create can produce the same toy-count, so we also use a structure version.
    try {
      const nowMs = performance?.now?.() ?? Date.now();
      const throttled = !g_lastChainSyncAt || (nowMs - g_lastChainSyncAt) > 150;
      if (throttled) {
        g_lastChainSyncAt = nowMs;
        const curCount = getSequencedToys?.()?.length ?? 0;
        const structureChanged = (g_lastSeenChainStructureVersion !== g_chainStructureVersion);
        const countChanged = (curCount !== g_lastSequencedToyCount);
        if (structureChanged || countChanged || !g_chainState || g_chainState.size < 1) {
          g_lastSeenChainStructureVersion = g_chainStructureVersion;
          g_lastSequencedToyCount = curCount;
          updateChains();
        }
      }
    } catch {}
    if (window.__PERF_DISABLE_CHAIN_WORK) return;

    const info = getLoopInfo();
    if (!info) return;
    const nowMs = performance?.now?.() ?? Date.now();
    if (!g_lastCfgCheckAt || (nowMs - g_lastCfgCheckAt) > 500) {
      g_lastCfgCheckAt = nowMs;
      const nextCfg = computeNoteSchedTiming();
      const curCfg = g_noteSchedCfg;
      if (curCfg?.stepSec && nextCfg?.stepSec) {
        const delta = Math.abs(nextCfg.stepSec - curCfg.stepSec) / curCfg.stepSec;
        if (delta > 0.15) g_noteSchedRebuildPending = nextCfg;
      }
    }

    if (g_noteSchedRebuildPending && info.col === 0) {
      // IMPORTANT:
      // We are about to rebuild the scheduler at bar start. The old scheduler may have already
      // scheduled future AudioBufferSourceNodes (lookahead). If we rebuild without cancelling,
      // we will schedule the same notes again -> doubled notes starting on bar 2.
      try { bumpAllToyAudioGen(); } catch {}

      g_sequencerScheduler = null;
      g_noteSchedRebuildPending = null;
      ensureSequencerScheduler();
    }

    const ctx = ensureAudioContext();
    const nowAt = ctx?.currentTime ?? 0;
    try {
      const lastResumeAt = Number(window.__NOTE_SCHED_LAST_RESUME_AT);
      const justResumed = Number.isFinite(lastResumeAt) && (nowAt - lastResumeAt) < 0.25;
      if (justResumed) g_audioPostResumeLogUntil = Math.max(g_audioPostResumeLogUntil, nowAt + 0.5);
    } catch {}
    const forceSequencerAll = !!window.__PERF_FORCE_SEQUENCER_ALL;

    // Advance chains on bar wrap inside the audio tick to avoid scheduling col0 for the outgoing toy.
    try {
      const phase01 = Number(info?.phase01);
      if (Number.isFinite(phase01)) {
        const wrapped = Number.isFinite(g_lastAudioPhase01) && phase01 < g_lastAudioPhase01 && g_lastAudioPhase01 > 0.9;
        g_lastAudioPhase01 = phase01;
        if (wrapped && g_chainState && g_chainState.size) {
          for (const headId of g_chainState.keys()) {
            try { advanceChain(headId); } catch {}
          }
        }
      }
    } catch {}
    // Active toys are the currently-active toy per chain head.
    // If we still have no chain state (or it got cleared), fall back to all sequenced toys.
    let activeToyIds = null;
    try {
      if (forceSequencerAll) {
        activeToyIds = new Set(getSequencedToys().map(p => p.id).filter(Boolean));
      } else if (g_chainState && g_chainState.size) {
        activeToyIds = new Set(g_chainState.values());
      } else {
        const all = getSequencedToys();
        activeToyIds = new Set(all.map(t => t.id));
      }
    } catch {
      activeToyIds = new Set();
    }

    if (!activeToyIds || !activeToyIds.size) return;

    const sequencerScheduler = ensureSequencerScheduler();
    try {
      const activeAudioToyIds = new Set();
      for (const toyId of activeToyIds) {
        const toy = document.getElementById(toyId);
        if (!toy) continue;
        const hasNotes = panelHasAnyNotes(toy);
        try {
          if (window.__SCHED_MISMATCH_DEBUG && nowAt < g_audioPostResumeLogUntil) {
            const payload = {
              toyId,
              toyType: toy?.dataset?.toy,
              hasNotes,
              hasSeqPattern: !!(toy.__seqPatternActive || toy.__seqPattern),
              chainActive: toy?.dataset?.chainActive,
              loopStartOverride: toy?.__loopStartOverrideSec,
              loopStart: info?.loopStartTime,
              barLen: info?.barLen,
              windowStart: (nowAt + Math.max(0, g_noteSchedCfg?.leadSec ?? 0)) - Math.max(0, g_noteSchedCfg?.lateGraceSec ?? 0),
              windowEnd: nowAt + Math.max(0.05, g_noteSchedCfg?.lookaheadSec ?? 0),
              nowAt,
            };
            console.log('[sched][resume-check] ' + JSON.stringify(payload));
          }
        } catch {}
        if (hasNotes) {
          activeAudioToyIds.add(toyId);
        } else {
          try { toy.__chainJustActivated = false; } catch {}
        }
      }

      // Publish authoritative active set every tick (used as a hard guard in toy schedulers).
      // This prevents "inactive toy schedules anyway" bleed/repeats during chain transitions.
      try {
        window.__mtSchedTick = (window.__mtSchedTick | 0) + 1;
        window.__mtActiveToyIds = Array.from(activeAudioToyIds);
        window.__mtChainState = Array.from(g_chainState.entries());
        window.__mtNowAt = nowAt;
      } catch {}

      // --- DEBUG: publish active sets for mismatch investigations ---
      try {
        if (window.__SCHED_MISMATCH_DEBUG) {
          // Throttle spam, but DON'T miss transitions:
          // log on bar start OR whenever active set changes.
          const key = window.__mtActiveToyIds.join('|');
          const prevKey = window.__mtActiveToyIdsKey || '';
          const changed = key !== prevKey;
          window.__mtActiveToyIdsKey = key;
          if (info?.col === 0 || changed) {
            console.log(changed ? '[sched][tick][active-changed]' : '[sched][tick]', {
              tick: window.__mtSchedTick,
              col: info?.col,
              phase01: info?.phase01,
              nowAt,
              activeToyIds: window.__mtActiveToyIds,
              chainState: window.__mtChainState,
              changed,
              prevActiveToyIds: prevKey ? prevKey.split('|').filter(Boolean) : [],
            });
          }
        }
      } catch {}

      sequencerScheduler.tick({
        activeToyIds: activeAudioToyIds,
        getToy: (id) => document.getElementById(id),
        loopInfo: info,
        nowAt,
      });
    } catch {}
  } finally {
    g_audioTickBusy = false;
  }
}

function startAudioScheduler() {
  if (audioSchedIntervalId) return;
  ensureSequencerScheduler();
  audioSchedIntervalId = setInterval(tickAudioScheduler, 25);
}

function stopAudioScheduler() {
  if (!audioSchedIntervalId) return;
  clearInterval(audioSchedIntervalId);
  audioSchedIntervalId = null;
}

function resetChainState({ clearDom = true } = {}) {
  try {
    g_chainState.clear();
    g_chainEdges.clear();
    g_edgesByToyId.clear();
    g_chainSegments.length = 0;
    g_pulsingConnectors.clear();
    g_chainToyLastPos.clear();
    g_chainPosDirtyToyIds.clear();
    g_chainDragToyId = null;
    g_chainDragLastUpdateTime = 0;
    g_chainRedrawPendingFull = false;
  } catch {}
  if (clearDom) {
    try {
      document.querySelectorAll('.toy-panel').forEach((panel) => {
        delete panel.dataset.prevToyId;
        delete panel.dataset.nextToyId;
        delete panel.dataset.chainParent;
        delete panel.dataset.chainHasChild;
        panel.removeAttribute('data-chaindisabled');
      });
    } catch {}
  }
  try { updateAllChainUIs(); } catch {}
  try { scheduleChainRedraw(); } catch {}
}
try { window.resetChainState = resetChainState; } catch {}

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

  // --- Normalize linkage + compute true chain heads ---
  const seenHeads = new Set();
  for (const toy of allToys) {
    try {
      // Keep chainParent / prevToyId in sync
      const parentId = toy?.dataset?.chainParent || toy?.dataset?.prevToyId || '';
      if (parentId && !toy.dataset.prevToyId) toy.dataset.prevToyId = parentId;
      if (toy.dataset.prevToyId && !toy.dataset.chainParent) toy.dataset.chainParent = toy.dataset.prevToyId;

      // Ensure parent.nextToyId points at child
      if (toy.dataset.prevToyId) {
        const parent = document.getElementById(toy.dataset.prevToyId);
        if (parent && !parent.dataset.nextToyId) parent.dataset.nextToyId = toy.id;
      }
    } catch {}

    try {
      const head = findChainHead(toy);
      if (head && head.id) seenHeads.add(head.id);
    } catch {}
  }

  // --- Rebuild g_chainState from scratch ---
  // This prevents "phantom heads" when a toy transitions from head -> child.
  // Phantom heads = extra active toys = cross-play/bleed between chained toys.
  try {
    const prevState = new Map(g_chainState);
    g_chainState.clear();

    for (const headId of seenHeads) {
      const headEl = document.getElementById(headId);
      if (!headEl) continue;

      // Preserve previously active toy IF it is still within this chain.
      let activeId = prevState.get(headId) || headId;
      let activeEl = document.getElementById(activeId);
      if (!activeEl) {
        activeId = headId;
        activeEl = headEl;
      } else {
        const activeHead = findChainHead(activeEl);
        if (!activeHead || activeHead.id !== headId) {
          activeId = headId;
          activeEl = headEl;
        }
      }

      g_chainState.set(headId, activeId);
    }
  } catch (err) {
    // If anything goes wrong, fall back to safe 1-toy state per head
    try {
      g_chainState.clear();
      for (const headId of seenHeads) g_chainState.set(headId, headId);
    } catch {}
    if (CHAIN_DEBUG) console.warn('[CHAIN] updateChains rebuild failed', err);
  }

  // Rebuild cached connector geometry whenever chain heads change and redraw once.
  try {
    rebuildChainSegments();
    if (CHAIN_FEATURE_ENABLE_CONNECTOR_DRAW) {
      g_chainRedrawPendingFull = true;
      scheduleChainRedraw();
    }
  } catch (err) {
    if (CHAIN_DEBUG) console.warn('[CHAIN][perf] rebuildChainSegments/draw failed', err);
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

function withPerfMark(name, fn) {
  const __perfOn = !!(window.__PerfFrameProf && typeof performance !== 'undefined' && performance.now);
  if (!__perfOn) return fn();
  const t0 = performance.now();
  try { return fn(); }
  finally {
    try { window.__PerfFrameProf.mark(name, performance.now() - t0); } catch {}
  }
}
function scheduler(){
  let lastPhase = 0;
  const lastCol = new Map();
  let lastPerfLog = 0;
  const prevActiveToyIds = new Set();
  let prevHadActiveToys = false;
  let prevRunning = false;
  let chainPreAdvanced = false;
  let visualSuppressionAppliedForInternal = false;
  const CHAIN_PRE_ADVANCE_PHASE = 0.97;
  const CHAIN_PRE_ADVANCE_ENABLED = false;
  const debugFirstStep = () => !!window.__CHAIN_DEBUG_FIRST_STEP;

  function step(){
    // --- Quality Lab frame pacing controls ---------------------------------
    // Used to stress visual LOD + dt-sensitive code paths without needing a slow machine.
    // Configure via Perf Lab UI (Quality Lab section) or by setting window.__QUALITY_LAB manually.
    const __qlab = window.__QUALITY_LAB || null;
    const __targetFps = __qlab ? (Number(__qlab.targetFps) || 0) : 0;
    const __cpuBurnMs = __qlab ? (Number(__qlab.cpuBurnMs) || 0) : 0;

    const __now0 = performance.now();

    // Throttle scheduler execution to emulate low FPS (logic + render).
    if (__targetFps > 0) {
      const __minDt = Math.max(1, 1000 / Math.max(1, __targetFps));
      const __last = step.__qlabLastExecT || 0;
      if (__last && (__now0 - __last) < __minDt) {
        requestAnimationFrame(step);
        return;
      }
      step.__qlabLastExecT = __now0;
    } else {
      step.__qlabLastExecT = __now0;
    }

    const frameStart = __now0;

    // Optional CPU burn to simulate expensive JS work.
    if (__cpuBurnMs > 0) {
      const __burnStart = performance.now();
      while ((performance.now() - __burnStart) < __cpuBurnMs) { /* busy */ }
    }
    const __perfOn = !!(window.__PerfFrameProf && typeof performance !== 'undefined' && performance.now);
    const __rafStart = __perfOn ? performance.now() : 0;
    // Update global quality signal (FPS + memory pressure with hysteresis)
    try { autoQualityOnFrame(); } catch {}
    // While inside an Art Toy's internal board, the main board should not visually update.
    const __internalActive = !!(g_artInternal && g_artInternal.active);

    if (__internalActive && !visualSuppressionAppliedForInternal) {
      visualSuppressionAppliedForInternal = true;
      try {
        document.querySelectorAll('#board-main .toy-panel.toy-playing-pulse').forEach((p) => {
          try { p.classList.remove('toy-playing-pulse'); } catch {}
        });
      } catch {}
    } else if (!__internalActive && visualSuppressionAppliedForInternal) {
      visualSuppressionAppliedForInternal = false;
    }

    // Clear expired pulse classes without timers (visual-only; skip while inside internal board.)
    if (!__internalActive) {
      try {
        if (__perfOn) {
          const t0 = performance.now();
          serviceToyPulses(frameStart);
          const dt = performance.now() - t0;
          window.__PerfFrameProf.mark('pulse.service', dt);
        } else {
          serviceToyPulses(frameStart);
        }
      } catch {}

      // Keep outline-related CSS vars synced with zoom; heavy geometry sync happens on demand.
      try {
        window.__updateOutlineScaleIfNeeded && window.__updateOutlineScaleIfNeeded();
      } catch {}
    }

    const info = getLoopInfo();

    const running = isRunning();
    const wasRunning = prevRunning;
    if (running && !wasRunning) {
      lastCol.clear();
      try {
        document.querySelectorAll('.toy-panel').forEach((toy) => {
          if (typeof toy.__sequencerSchedule === 'function') {
            toy.__chainJustActivated = true;
          }
        });
      } catch {}
      if (debugFirstStep()) {
        console.log('[chain][debug] transport start', { phase01: info?.phase01 });
      }
    }
    prevRunning = running;

    // Screen-space "home" anchor: gradient + particle landmark.
    // Keep this cheap and frame-synced by piggybacking on the main scheduler rAF.
    // In internal mode this renders against the internal viewport/anchor context.
    try { tickBoardAnchor({ nowMs: frameStart, loopInfo: info, running, internalActive: __internalActive }); } catch {}
    const hasChains = g_chainState && g_chainState.size > 0;
    const allowChainWork = !window.__PERF_DISABLE_CHAIN_WORK;

    if (CHAIN_FEATURE_ENABLE_SCHEDULER && running && hasChains && allowChainWork){
      // When the note scheduler is enabled, chain advance is driven by the audio tick
      // to align with AudioContext timing and avoid duplicate advances.
      if (window.__NOTE_SCHEDULER_ENABLED) {
        lastPhase = info.phase01;
      } else {
      // --- Phase: advance chains on bar wrap ---
      const phase = info.phase01;
      const prevPhase = lastPhase;
      const phaseJustWrapped = phase < prevPhase && prevPhase > 0.9;
      lastPhase = phase;

      // Reset the "already advanced this wrap" guard shortly after we enter the new bar.
      // (If we don't reset it, we'll suppress the NEXT bar-wrap advance and schedule
      // the old toy's early notes into the new bar -> audible repeats at chain boundaries.)
      if (!phaseJustWrapped && chainPreAdvanced && Number.isFinite(phase) && phase > 0.1) {
        chainPreAdvanced = false;
      }

      if (phaseJustWrapped && !chainPreAdvanced) {
        const tAdvanceStart = __perfOn ? performance.now() : 0;
        for (const [headId] of g_chainState.entries()) {
          const activeToy = document.getElementById(g_chainState.get(headId));
          // Bouncers and Ripplers manage their own advancement via the 'chain:next' event.
          // All other toys (like loopgrid) advance on the global bar clock.
          if (activeToy && activeToy.dataset.toy !== 'bouncer' && activeToy.dataset.toy !== 'rippler') {
            advanceChain(headId);
          }
        }
        const tAdvanceEnd = __perfOn ? performance.now() : 0;
        if (__perfOn) {
          window.__PerfFrameProf.mark('chain.advance', tAdvanceEnd - tAdvanceStart);
        }
        if (CHAIN_DEBUG && (tAdvanceEnd - tAdvanceStart) > CHAIN_DEBUG_LOG_THRESHOLD_MS) {
          console.log('[CHAIN][perf] advanceChain batch', (tAdvanceEnd - tAdvanceStart).toFixed(2), 'ms', 'heads=', g_chainState.size);
        }
        chainPreAdvanced = true;
      } else if (CHAIN_PRE_ADVANCE_ENABLED && !chainPreAdvanced && phase >= CHAIN_PRE_ADVANCE_PHASE && prevPhase < CHAIN_PRE_ADVANCE_PHASE) {
        for (const [headId] of g_chainState.entries()) {
          const activeToy = document.getElementById(g_chainState.get(headId));
          if (activeToy && activeToy.dataset.toy !== 'bouncer' && activeToy.dataset.toy !== 'rippler') {
            advanceChain(headId);
          }
        }
        chainPreAdvanced = true;
      }
      }

      // --- Phase A: chain-active flags ---
      const tActiveStart = __perfOn ? performance.now() : 0;
      const forceSequencerAll = !!window.__PERF_FORCE_SEQUENCER_ALL;
      const activeToyIds = forceSequencerAll
        ? new Set(getSequencedToys().map(p => p.id).filter(Boolean))
        : new Set(g_chainState.values());
      const hasActiveToys = activeToyIds.size > 0;
      if (debugFirstStep()) {
        console.log('[chain][debug] activeToyIds', {
          active: Array.from(activeToyIds),
          chainState: Array.from(g_chainState.entries()),
        });
      }

      const activeChanged = (() => {
        if (hasActiveToys !== prevHadActiveToys) return true;
        if (activeToyIds.size !== prevActiveToyIds.size) return true;
        for (const id of activeToyIds) {
          if (!prevActiveToyIds.has(id)) return true;
        }
        return false;
      })();

      if (CHAIN_FEATURE_ENABLE_MARK_ACTIVE && hasActiveToys && activeChanged) {
        const tMarkDomStart = __perfOn ? performance.now() : 0;
        document.querySelectorAll('.toy-panel[id]').forEach(toy => {
          const isActive = activeToyIds.has(toy.id);
          const current = toy.dataset.chainActive === 'true';

          // If this toy just lost chain focus, drop any lingering pulse so the flash
          // doesn't bleed into the next active link.
          if (current && !isActive) {
            try { g_pulseUntil.delete(toy.id); } catch {}
            try { toy.classList.remove('toy-playing-pulse'); } catch {}
            try { toy.__pulseHighlight = 0; toy.__pulseRearm = false; } catch {}
            try { toy.__simpleRhythmVisualState?.flash?.fill?.(0); } catch {}
            try { toy.__loopgridLastDrawPlayheadCol = -999; } catch {}
            try { toy.__loopgridNeedsRedraw = true; } catch {}
          }

          if (current !== isActive) {
            toy.dataset.chainActive = isActive ? 'true' : 'false';
            try { toy.__loopgridNeedsRedraw = true; } catch {}
            if (isActive) {
              lastCol.delete(toy.id);
              try {
                // Avoid mid-bar gen bumps when note scheduler is active.
                if (!window.__NOTE_SCHEDULER_ENABLED) toy.__chainJustActivated = true;
              } catch {}
              if (debugFirstStep()) {
                console.log('[chain][debug] active', { id: toy.id, toy: toy.dataset?.toy });
              }
            }
          }
        });

        prevActiveToyIds.clear();
        for (const id of activeToyIds) prevActiveToyIds.add(id);
        prevHadActiveToys = hasActiveToys;
        if (__perfOn) {
          window.__PerfFrameProf.mark('chain.markActive.dom', performance.now() - tMarkDomStart);
        }
      }
      const tActiveEnd = __perfOn ? performance.now() : 0;
      if (__perfOn) {
        window.__PerfFrameProf.mark('chain.markActive', tActiveEnd - tActiveStart);
      }
      if (CHAIN_DEBUG && (tActiveEnd - tActiveStart) > CHAIN_DEBUG_LOG_THRESHOLD_MS) {
        console.log('[CHAIN][perf] mark-active', (tActiveEnd - tActiveStart).toFixed(2), 'ms', 'activeToyCount=', activeToyIds.size);
      }

      // --- Phase C: per-toy sequencer stepping for active chain links ---
      const tStepStart = __perfOn ? performance.now() : 0;
      if (CHAIN_FEATURE_ENABLE_SEQUENCER && hasActiveToys) {
        for (const activeToyId of activeToyIds) {
          const toy = document.getElementById(activeToyId);
          if (toy && typeof toy.__sequencerStep === 'function') {
            if (!shouldRenderToyVisuals(toy)) continue;
            const steps = parseInt(toy.dataset.steps, 10) || NUM_STEPS;
            const col = Math.floor(info.phase01 * steps) % steps;
            if (col !== lastCol.get(toy.id)) {
              const isFirstStep = !lastCol.has(toy.id);
              lastCol.set(toy.id, col);
              if (isFirstStep && debugFirstStep()) {
                console.log('[chain][debug] first step', { id: toy.id, toy: toy.dataset?.toy, col, phase01: info.phase01 });
              }
              try {
                toy.__mtLastSequencerCol = col;
                toy.__sequencerStep(col);
              } catch (e) {
                console.warn(`Sequencer step failed for ${toy.id}`, e);
              }
              // If this toy actually has notes at this column, flash the normal-mode border
              const hasNotesAtCol = panelHasNotesAtColumn(toy, col);
              if (artTriggerDbgEnabled()) {
                artTriggerDbg('scheduler:step:probe', {
                  toyId: toy.id,
                  toyType: toy?.dataset?.toy || null,
                  ownerArtToyId: toy?.dataset?.artOwnerId || null,
                  col,
                  hasNotesAtCol,
                  chainJustActivated: !!toy.__chainJustActivated,
                  phase01: info?.phase01 ?? null,
                  source: 'scheduler:step',
                });
              }
              const suppressTransitionArtTrigger = !!toy.__chainJustActivated;
              if (suppressTransitionArtTrigger) {
                if (artTriggerDbgEnabled()) {
                  artTriggerDbg('scheduler:step:drop:chain-just-activated', {
                    toyId: toy.id,
                    toyType: toy?.dataset?.toy || null,
                    ownerArtToyId: toy?.dataset?.artOwnerId || null,
                    col,
                    hasNotesAtCol,
                    phase01: info?.phase01 ?? null,
                  });
                }
                try { toy.__chainJustActivated = false; } catch {}
                continue;
              }
              const useToyNoteDrivenArt = !!window.__NOTE_SCHEDULER_ENABLED
                && (toy?.dataset?.toy === 'drawgrid' || toy?.dataset?.toy === 'loopgrid' || toy?.dataset?.toy === 'loopgrid-drum');
              if (hasNotesAtCol && !useToyNoteDrivenArt) {
                pulseToyBorder(toy);
                // First-pass: if this toy lives inside an Art Toy, flash the Art Toy.
                flashOwningArtToyForPanel(toy, 'scheduler:step', { col, slotIndex: col });
              }
            }
          }
        }
      }
      const tStepEnd = __perfOn ? performance.now() : 0;
      if (__perfOn) {
        window.__PerfFrameProf.mark('chain.sequencer', tStepEnd - tStepStart);
      }
      if (CHAIN_DEBUG && CHAIN_FEATURE_ENABLE_SEQUENCER && (tStepEnd - tStepStart) > CHAIN_DEBUG_LOG_THRESHOLD_MS) {
        console.log('[CHAIN][perf] sequencerStep batch', (tStepEnd - tStepStart).toFixed(2), 'ms', 'activeToyCount=', activeToyIds.size);
      }

    } else if (!running && wasRunning) {
      // Transport just paused ? clear steady highlight ONCE (avoid DOM writes inside every rAF frame)
      try {
        document.querySelectorAll('.toy-panel').forEach(p => {
          p.classList.remove('toy-playing', 'toy-playing-pulse');
        });
      } catch {}
      // Also clear any pending pulse bookkeeping so we don't re-add visuals while paused.
      try { g_pulseUntil && g_pulseUntil.clear && g_pulseUntil.clear(); } catch {}
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
    if (__perfOn && __rafStart) {
      window.__PerfFrameProf.mark('perf.raf.scheduler', performance.now() - __rafStart);
    }

    // Connectors are now updated on-demand, not every frame.
    requestAnimationFrame(step);
  }

  step.__perfRafTag = 'perf.raf.main';
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
        withPerfMark('perf.raf.connectors', () => {
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
        });
    }
    animateConnectors.__perfRafTag = 'perf.raf.connectors';
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
    // IMPORTANT (itch.io): don't block first paint / UI boot on sample decoding.
    // initAudioAssets() can take seconds on slower CPUs/networks (many decodeAudioData calls).
    // We kick audio loading off in the background so UI elements (e.g. board anchor + button) appear instantly.
    (async () => {
      try {
        await initAudioAssets(CSV_PATH);
        await loadInstrumentCatalog();
        mainLog('[AUDIO] samples loaded');
      } catch (e) {
        console.warn('[AUDIO] init failed', e);
      }
    })();

    if (board && !document.getElementById('chain-canvas')) {
        chainCanvas = document.createElement('canvas');
        chainCanvas.id = 'chain-canvas';
        Object.assign(chainCanvas.style, {
            position: 'absolute',
            inset: '0', // width/height are set dynamically in drawChains
            pointerEvents: 'none',
            zIndex: '999'
        });
        chainCtx = chainCanvas.getContext('2d');
        try { ensureChainCanvasAttachedToActiveBoard(); } catch {}

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
    // First-run "Volume setup" overlay (uses the real master slider; not part of scene save/load).
    requestAnimationFrame(() => {
      try { showVolumeSetupIfFirstRun(); } catch {}
    });
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
            bubbles: true,
            composed: true,
            detail: { user: true, reason: 'user-clear-button' }
          }));
        }
      } catch (err) {
        console.warn('[MAIN] clear dispatch failed', err);
      }
    }, true);

    // Internal-board: header buttons need to behave exactly like the main board.
    // In internal mode we temporarily swap board identity (#board / .board-viewport).
    // Some toys rely on global delegates; keep this scoped delegate as a safety net.
    document.addEventListener('click', async (e) => {
      if (!document.body.classList.contains('internal-board-active')) return;

      const btn = e.target?.closest?.('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (!action) return;

      // If the button explicitly opts out of delegates (e.g. scoped random), respect it.
      if (btn.dataset.skipHeaderDelegate === '1') return;

      const panel = btn.closest?.('.toy-panel');
      if (!panel) return;

      // Randomize variants
      if (action === 'random') {
        try {
          panel.dispatchEvent(new CustomEvent('toy-random', { bubbles: true, composed: true }));
        } catch {}
        return;
      }
      if (action === 'random-notes') {
        try {
          panel.dispatchEvent(new CustomEvent('toy-random-notes', { bubbles: true, composed: true }));
        } catch {}
        return;
      }
      if (action === 'random-blocks') {
        try {
          panel.dispatchEvent(new CustomEvent('toy-random-blocks', { bubbles: true, composed: true }));
        } catch {}
        return;
      }

      // Instrument picker
      if (action === 'instrument') {
        try {
          const chosen = await openInstrumentPicker({
            panel,
            toyId: (panel.dataset.audiotoyid || panel.dataset.toyid || panel.dataset.toy || panel.id || 'master'),
          });
          if (!chosen) return;
          const val = String((typeof chosen === 'string' ? chosen : chosen?.value) || '');
          if (!val) return;
          const chosenNote = (typeof chosen === 'object' && chosen) ? chosen.note : null;
          const chosenOctave = (typeof chosen === 'object' && chosen) ? chosen.octave : null;
          const chosenPitchShift = (typeof chosen === 'object' && chosen) ? chosen.pitchShift : null;

          panel.dataset.instrument = val;
          panel.dataset.instrumentPersisted = '1';
          if (chosenOctave !== null && chosenOctave !== undefined) panel.dataset.instrumentOctave = String(chosenOctave);
          if (chosenPitchShift !== null && chosenPitchShift !== undefined) panel.dataset.instrumentPitchShift = chosenPitchShift ? '1' : '0';
          if (chosenNote) panel.dataset.instrumentNote = String(chosenNote);
          else delete panel.dataset.instrumentNote;

          try { panel.dispatchEvent(new CustomEvent('toy-instrument', { bubbles: true, composed: true, detail:{ value: val, note: chosenNote, octave: chosenOctave, pitchShift: chosenPitchShift } })); } catch {}
          try { panel.dispatchEvent(new CustomEvent('toy:instrument', { detail:{ name: val, value: val, note: chosenNote, octave: chosenOctave, pitchShift: chosenPitchShift }, bubbles:true })); } catch {}
        } catch {}
        return;
      }
    }, true);
    document.querySelectorAll('.toy-panel').forEach(initToyChaining);
    // Initial sync once toys are present
    try { syncAllBodyOutlines(); } catch {}
    // Run a couple of follow-up syncs after layout settles (fonts/DOM can land late)
    requestAnimationFrame(() => {
      withPerfMark('perf.raf.outlines', () => { try { syncAllBodyOutlines(); } catch {} });
    });
    setTimeout(() => { try { syncAllBodyOutlines(); } catch {} }, 160);
    // If overview was restored on load, reapply its decorations once toys exist.
    requestAnimationFrame(() => {
      withPerfMark('perf.raf.overviewDecor', () => {
        try {
          if (overviewMode?.isActive?.()) {
            overviewMode.refreshDecorations?.();
            syncAllBodyOutlines();
          }
        } catch {}
      });
    });
    updateAllChainUIs(); // Set initial instrument button visibility
    requestAnimationFrame(() => {
      withPerfMark('perf.raf.chainUI', () => { try { updateAllChainUIs(); } catch {} });
    }); // After any late-restored links land
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
      if (CHAIN_DEBUG && window.__CHAIN_DEBUG) {
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
      }
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

  // --- Trash/Delete hover + drop tracking for normal header-drags (including internal-board) ---
  // The toy panels can be dragged by their own header-drag logic, but the trash highlighting/deletion
  // is handled by ToySpawner.begin/update/endPanelDrag(). In internal-board mode we still want the
  // global trash button to highlight + delete on release.
  let g_trashTrackDrag = null;

  function trashTrackMove(e) {
    const st = g_trashTrackDrag;
    if (!st) return;
    if (st.pointerId != null && typeof e.pointerId === 'number' && e.pointerId !== st.pointerId) return;
    try {
      window.ToySpawner?.updatePanelDrag?.({ clientX: e.clientX, clientY: e.clientY });
    } catch (err) {
      console.warn('[main] ToySpawner.updatePanelDrag failed', err);
    }
  }

  function trashTrackEnd(e) {
    const st = g_trashTrackDrag;
    if (!st) return;
    if (st.pointerId != null && typeof e.pointerId === 'number' && e.pointerId !== st.pointerId) return;

    window.removeEventListener('pointermove', trashTrackMove, true);
    window.removeEventListener('pointerup', trashTrackEnd, true);
    window.removeEventListener('pointercancel', trashTrackEnd, true);

    try {
      window.ToySpawner?.endPanelDrag?.({
        clientX: e.clientX,
        clientY: e.clientY,
        pointerId: e.pointerId,
        canceled: e.type === 'pointercancel'
      });
    } catch (err) {
      console.warn('[main] ToySpawner.endPanelDrag failed', err);
    }

    g_trashTrackDrag = null;
  }

  function handleTrashTrackPointerDown(e) {
    // Only primary button
    if (typeof e.button === 'number' && e.button !== 0) return;
    if (isActivelyEditingToy()) return;
    if (e.target?.closest?.('.toy-chain-btn')) return;

    const panel = e.target?.closest?.('.toy-panel, .art-toy-panel');
    if (!panel) return;

    if (panel.classList.contains('art-toy-panel')) {
      const dragBtn = panel.querySelector?.('.art-toy-drag-btn') || panel.querySelector?.('.art-toy-handle');
      const inDragBtn = dragBtn && (dragBtn === e.target || dragBtn.contains(e.target));
      if (!inDragBtn) return;
    } else {
      const header = panel.querySelector?.('.toy-header');
      const inHeader = header && (header === e.target || header.contains(e.target));
      if (!inHeader) return;
    }

    // Overview-mode uses its own drag handler which already wires ToySpawner begin/update/end.
    const board = document.getElementById('board');
    const overviewActive =
      !!(window.__overviewMode?.isActive?.() ||
         board?.classList?.contains('board-overview') ||
         document.body?.classList?.contains('overview-mode'));
    if (overviewActive) return;

    // Arm ToySpawner trash tracking for this header-drag.
    try {
      window.ToySpawner?.beginPanelDrag?.({ panel, pointerId: e.pointerId });
    } catch (err) {
      console.warn('[main] ToySpawner.beginPanelDrag failed', err);
    }

    g_trashTrackDrag = {
      panel,
      pointerId: typeof e.pointerId === 'number' ? e.pointerId : null
    };

    window.addEventListener('pointermove', trashTrackMove, true);
    window.addEventListener('pointerup', trashTrackEnd, true);
    window.addEventListener('pointercancel', trashTrackEnd, true);
  }

  if (!window.__TRASH_TRACK_INSTALLED__) {
    window.__TRASH_TRACK_INSTALLED__ = true;
    document.addEventListener('pointerdown', handleTrashTrackPointerDown, true);
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
    // If the press originated on an interactive control, don't queue tap-to-focus.
    // This avoids camera recenters from button taps (e.g. Art Toy Random/Music buttons).
    if (e.target && e.target.closest) {
      if (e.target.closest('.toy-chain-btn')) return;
      if (e.target.closest('button, [role="button"], input, select, textarea, a[href], [data-action], .toy-controls, .toy-header-controls')) return;
    }
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
    startAudioScheduler();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopAudioScheduler();
      } else {
        startAudioScheduler();
      }
    });
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
import { PERF_FLAGS } from "./perf-flags.js";

// Expose for live debugging / perf-lab runs
window.PERF_FLAGS = PERF_FLAGS;








