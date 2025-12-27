// src/board-anchor.js — screen-space "home" anchor (<=300 lines)
// A gentle, particle-built landmark that helps players orient themselves.
//
// Features:
// - Screen-space canvas overlay (not affected by board pan/zoom transform)
// - Central "energy ball" (simple circle + glow)
// - Idle animation when transport is stopped
// - Beat/bar pulses when transport is running
// - Directional background gradient that points toward the anchor when off-screen
// - Mini "home" button under the ? button to recenter the camera
// - Entire system can be disabled via window.__MT_ANCHOR_DISABLED or localStorage.mt_anchor_enabled='0'

import { getViewportElement, getViewportTransform } from './board-viewport.js';
import {
  startOrbitParticleStreamAtPoint,
  startParticleStream,
  stopParticleStream,
  updateOrbitParticleStreamMetrics,
} from './tutorial-fx.js';
import { BEATS_PER_BAR } from './audio-core.js';

const DEFAULT_WORLD_POS = Object.freeze({ x: 0, y: 0 });

// --- Tuning ---
const ANCHOR_SIZE_MULT = 4.0; // requested: 4x overall size
const ZOOM_SCALE_CLAMP_MIN = 0.25;
const ZOOM_SCALE_CLAMP_MAX = 2.5;

const CORE_BASE_R_PX = 12;
const CORE_PULSE_R_PX = 18;

const MAX_DT = 0.050; // cap dt to avoid big jumps when tab refocuses

function perfMark(dt) {
  try { window.__PerfFrameProf?.mark?.('anchor', dt); } catch {}
}

function __anchIsGesturing() {
  try { return !!window.__GESTURE_ACTIVE; } catch {}
  return false;
}

function __anchGestureDrawModulo() {
  let base = 1;
  let hasAnchorOverride = false;
  try {
    const m = window?.__PERF_ANCHOR?.gestureModulo;
    if (Number.isFinite(m) && m >= 1) {
      base = Math.floor(m);
      hasAnchorOverride = true;
    }
  } catch {}

  if (!hasAnchorOverride) {
    try {
      const m = window?.__PERF_PARTICLES?.gestureDrawModulo;
      if (Number.isFinite(m) && m >= 1) base = Math.floor(m);
    } catch {}
  }

  // Keep anchor smooth when scene load is light (<=2 drawgrids visible).
  try {
    const vc = window?.__DRAWGRID_GLOBAL?.visibleCount;
    if (Number.isFinite(vc) && vc <= 2) return 1;
  } catch {}

  return base;
}

let __anchFrameIdx = 0;

// Gradient (requested: bigger + more opaque, min opacity never hits 0)
const GRAD_ONSCREEN_R_PX = 240;
const GRAD_OFFSCREEN_R_PX = 740;
const GRAD_MIN_ALPHA = 0.12;
const GRAD_MAX_ALPHA = 0.34;
const GRAD_EDGE_PAD_PX = 34;
const GRAD_OFFSCREEN_FADE_SEC = 1.0;
const HOVER_RADIUS_BASE_PX = 34;
const HOVER_ORBIT_RADIUS_BASE_PX = 32;
const WHITE_FLASH_INTENSITY = 0.45;
const NOTE_FLASH_INTENSITY = 1.35;
const WHITE_FLASH_ALPHA = 0.35;
const NOTE_FLASH_ALPHA = 1.1;
const WHITE_FLASH_DECAY = 1.6;
const NOTE_FLASH_MIN_FADE_SEC = 0.06;
const NOTE_FLASH_GLOW = 0.85;

let __enabled = true;

let canvas = null;
let ctx = null;
let lastNowMs = 0;
let offscreenFade01 = 0;

let lastPhase01 = 0;
let lastBeatIndex = -1;
let lastCenterWorld = null;
let lastCenterWorldTs = 0;

let pulseBeat = 0;
let pulseBar = 0;
let pulseBeatT = 1; // 0..1
let pulseBarT = 1;  // 0..1
let beatDurSec = 0.5;
let flashingCells = [];
let lastFlashedCells = new Set();
let chainCellAssignments = new Map(); // chainHeadId -> { i, j, color }
let assignedCellKeys = new Set();
let assignedColors = new Set();
let noteListenerActive = false;

let markerEl = null;        // invisible world-space DOM marker (for centering)
let miniBtnEl = null;       // UI button under ? launcher
let miniStyleEl = null;
let hoverActive = false;
let hoverPointer = null;
let hoverBound = false;
let hoverHostEl = null;
let hoverMoveHandler = null;
let hoverLeaveHandler = null;
let hoverDownHandler = null;
let hoverSuppressUntil = 0;
let lastAnchorGuideTarget = null;
let lastAnchorGuideInfo = null;
let anchorGuideFlashTimer = 0;
let anchorGuideStopBound = false;
let anchorGuideIgnoreUntil = 0;
let hoverForceBurstNext = false;
let anchorGuideActive = false;

function readEnabled() {
  try {
    if (window.__MT_ANCHOR_DISABLED === true) return false;
    const v = localStorage.getItem('mt_anchor_enabled');
    if (v === '0') return false;
  } catch {}
  return true;
}

function pickHost() {
  // Prefer the viewport wrapper so we stay screen-space.
  return getViewportElement();
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function getZoomScale() {
  // Prefer CSS vars already used elsewhere (main.js logs --bv-scale/--zoom-scale)
  try {
    const board = document.getElementById('board');
    if (board) {
      const cs = getComputedStyle(board);
      const a = parseFloat(cs.getPropertyValue('--zoom-scale'));
      if (Number.isFinite(a) && a > 0) return a;
      const b = parseFloat(cs.getPropertyValue('--bv-scale'));
      if (Number.isFinite(b) && b > 0) return b;
    }
  } catch {}
  return 1.0;
}

function getGridInfo() {
  try {
    const board = document.getElementById('board');
    if (board) {
      const cs = getComputedStyle(board);
      const spacing = parseFloat(cs.getPropertyValue('--board-grid-spacing')) || 90;
      const offsetX = parseFloat(cs.getPropertyValue('--board-grid-offset-x')) || 0;
      const offsetY = parseFloat(cs.getPropertyValue('--board-grid-offset-y')) || 0;
      return { spacing, offsetX, offsetY };
    }
  } catch {}
  return { spacing: 90, offsetX: 0, offsetY: 0 }; // Fallback
}

function ensureCanvas() {
  if (canvas) return canvas;
  const host = pickHost();
  if (!host) return null;

  try {
    const cs = getComputedStyle(host);
    if (cs.position === 'static') host.style.position = 'relative';
  } catch {}

  canvas = document.createElement('canvas');
  canvas.id = 'board-anchor-canvas';
  Object.assign(canvas.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: '0',
  });
  host.prepend(canvas);
  ctx = canvas.getContext('2d');

  onResize();
  window.addEventListener('resize', onResize, { passive: true });
  try { window.addEventListener('overview:transition', onResize, { passive: true }); } catch {}

  ensureMarker();
  ensureMiniButton();
  ensureHoverListeners();
  return canvas;
}

function onResize() {
  if (!canvas) return;
  const host = pickHost();
  if (!host) return;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.floor(host.clientWidth || window.innerWidth));
  const h = Math.max(1, Math.floor(host.clientHeight || window.innerHeight));
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
}

function teardown() {
  try { window.removeEventListener('resize', onResize); } catch {}
  try { window.removeEventListener('overview:transition', onResize); } catch {}
  try {
    if (hoverHostEl && hoverMoveHandler) hoverHostEl.removeEventListener('pointermove', hoverMoveHandler);
    if (hoverHostEl && hoverLeaveHandler) hoverHostEl.removeEventListener('pointerleave', hoverLeaveHandler);
    if (hoverHostEl && hoverDownHandler) hoverHostEl.removeEventListener('pointerdown', hoverDownHandler);
  } catch {}
  if (canvas && canvas.parentElement) canvas.parentElement.removeChild(canvas);
  canvas = null;
  ctx = null;
  hoverActive = false;
  hoverPointer = null;
  hoverBound = false;
  hoverHostEl = null;
  hoverMoveHandler = null;
  hoverLeaveHandler = null;
  hoverDownHandler = null;
  hoverSuppressUntil = 0;
  lastAnchorGuideTarget = null;
  lastAnchorGuideInfo = null;
  if (anchorGuideFlashTimer) {
    try { clearTimeout(anchorGuideFlashTimer); } catch {}
    anchorGuideFlashTimer = 0;
  }
  anchorGuideStopBound = false;
  anchorGuideIgnoreUntil = 0;
  hoverForceBurstNext = false;
  anchorGuideActive = false;
  try { stopParticleStream({ immediate: true, owner: 'anchor' }); } catch {}
  try { stopParticleStream({ immediate: true, owner: 'anchor-guide' }); } catch {}
  lastNowMs = 0;
  offscreenFade01 = 0;
  lastPhase01 = 0;
  lastBeatIndex = -1;
  pulseBeat = 0;
  pulseBar = 0;
  flashingCells = [];
  lastFlashedCells = new Set();
  chainCellAssignments = new Map();
  assignedCellKeys = new Set();
  assignedColors = new Set();
  if (markerEl && markerEl.parentElement) markerEl.parentElement.removeChild(markerEl);
  markerEl = null;
  if (miniBtnEl && miniBtnEl.parentElement) miniBtnEl.parentElement.removeChild(miniBtnEl);
  miniBtnEl = null;
  if (miniStyleEl && miniStyleEl.parentElement) miniStyleEl.parentElement.removeChild(miniStyleEl);
  miniStyleEl = null;
}

function getAnchorWorld() {
  try {
    const w = window.__MT_ANCHOR_WORLD;
    if (w && Number.isFinite(w.x) && Number.isFinite(w.y)) return w;
  } catch {}
  return DEFAULT_WORLD_POS;
}

function ensureMarker() {
  if (markerEl && markerEl.isConnected) return markerEl;
  const board = document.getElementById('board');
  if (!board) return null;
  markerEl = document.createElement('div');
  markerEl.id = 'board-anchor-marker';
  Object.assign(markerEl.style, {
    position: 'absolute',
    width: '2px',
    height: '2px',
    opacity: '0',
    pointerEvents: 'none',
    left: '0px',
    top: '0px',
  });
  board.appendChild(markerEl);
  return markerEl;
}

function updateMarkerPos(anchorWorld) {
  if (!markerEl || !markerEl.isConnected) ensureMarker();
  if (!markerEl) return;
  markerEl.style.left = `${anchorWorld.x}px`;
  markerEl.style.top = `${anchorWorld.y}px`;
}

function centerCameraOnAnchor() {
  try {
    if (!markerEl || !markerEl.isConnected) ensureMarker();
    if (markerEl && typeof window.centerBoardOnElementSlow === 'function') {
      const zoom = Number.isFinite(window.__MT_NEW_SCENE_ZOOM) ? window.__MT_NEW_SCENE_ZOOM : 1.0;
      window.centerBoardOnElementSlow(markerEl, zoom, { centerFracX: 0.5 });
      return;
    }
  } catch {}
  // Soft fail: do nothing if the camera helper isn't available.
}

function ensureMiniButton() {
  // Place a small "home anchor" button in the right-side dock (under existing buttons)
  if (miniBtnEl && miniBtnEl.isConnected) return miniBtnEl;

  const dock = document.querySelector('.toy-spawner-dock');
  if (!dock || !dock.isConnected) return null;

  if (!miniStyleEl) {
    miniStyleEl = document.createElement('style');
    miniStyleEl.textContent = `
      .anchor-mini-btn{
        width: var(--c-btn-size, 44px);
        height: var(--c-btn-size, 44px);
        border-radius: 999px;
        margin-top: 10px;
        display: grid;
        place-items: center;
        cursor: pointer;
        user-select: none;
        pointer-events: auto;
        position: relative;
        overflow: hidden;

        /* Match the anchor's outer glow */
        background: radial-gradient(circle,
          rgba(255,255,255,0.4),
          rgba(64,200,255,0.3) 25%,
          rgba(130,210,255,0.15) 60%,
          transparent 80%
        );

        box-shadow:
          0 0 20px rgba(120,200,255,0.45),
          0 0 34px rgba(120,120,255,0.22);
      }

      .anchor-mini-btn .anchor-mini-grid{
        position: absolute;
        inset: 22%;
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        grid-template-rows: repeat(4, 1fr);
        gap: 2px;
        pointer-events: none;
        opacity: 0.7;
        filter: blur(0.15px);
      }

      .anchor-mini-btn .anchor-mini-grid .mini-cell{
        background: rgba(10, 14, 22, 0.42);
        border-radius: 2px;
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.18);
      }

      /* sprinkle a few brighter squares */
      .anchor-mini-btn .anchor-mini-grid .mini-cell:nth-child(3),
      .anchor-mini-btn .anchor-mini-grid .mini-cell:nth-child(8),
      .anchor-mini-btn .anchor-mini-grid .mini-cell:nth-child(14){
        background: rgba(255,255,255,0.85);
        box-shadow: 0 0 12px rgba(120,200,255,0.22);
      }

      .anchor-mini-btn .anchor-mini-core{
        position: absolute;
        left: 50%;
        top: 50%;
        width: 42%;
        height: 42%;
        transform: translate(-50%, -50%);
        border-radius: 999px;
        pointer-events: none;
        background: radial-gradient(circle,
          rgba(255,255,255,0.92) 0%,
          rgba(120, 130, 255,0.82) 40%,
          rgba(90, 100, 255,0.35) 70%,
          rgba(0,0,0,0) 100%
        );
        box-shadow:
          0 0 10px rgba(120,200,255,0.35),
          0 0 18px rgba(120,120,255,0.18);
        animation: anchorMiniCorePulse 2.6s ease-in-out infinite;
      }

      @keyframes anchorMiniCorePulse {
        0%, 100% { transform: translate(-50%, -50%) scale(0.98); filter: brightness(1.0); }
        50% { transform: translate(-50%, -50%) scale(1.08); filter: brightness(1.12); }
      }
    `;
    document.head.appendChild(miniStyleEl);
  }

  miniBtnEl = document.createElement('div');
  miniBtnEl.className = 'anchor-mini-btn';
  miniBtnEl.title = 'Return home';
  miniBtnEl.setAttribute('aria-label', 'Return home');
  miniBtnEl.dataset.helpLabel = 'Return home';
  miniBtnEl.dataset.helpPosition = 'left';

  // IMPORTANT: real HTML (no escaped entities)
  const cells = new Array(16).fill(0).map(() => '<span class="mini-cell"></span>').join('');
  miniBtnEl.innerHTML = `<div class="anchor-mini-grid" aria-hidden="true">${cells}</div><div class="anchor-mini-core" aria-hidden="true"></div>`;

  // Match the actual size of other dock buttons (so this always aligns).
  try {
    const refBtn =
      dock.querySelector('button') ||
      dock.querySelector('.c-btn') ||
      dock.querySelector('.dock-btn');
    if (refBtn) {
      const r = refBtn.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        miniBtnEl.style.width = `${Math.round(r.width)}px`;
        miniBtnEl.style.height = `${Math.round(r.height)}px`;
      }
    }
  } catch {}

  // Insert just under the help/guide button if we can find it, otherwise append.
  const guideBtn = dock.querySelector('.guide-launcher') || dock.querySelector('[data-action="help"]') || null;
  if (guideBtn && guideBtn.parentElement === dock) {
    dock.insertBefore(miniBtnEl, guideBtn.nextSibling);
  } else {
    dock.appendChild(miniBtnEl);
  }

  miniBtnEl.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  }, true);

  miniBtnEl.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    centerCameraOnAnchor();
  }, true);

  return miniBtnEl;
}

function getViewportLocalPointFromWorld(worldPt) {
  const host = pickHost();
  if (!host) return null;
  const vpRect = host.getBoundingClientRect();
  let { scale = 1, tx = 0, ty = 0 } = getViewportTransform?.() || {};
  const flag = window?.__ZOOM_GESTURE_FLAG;
  if (flag?.active) {
    scale = Number.isFinite(flag.targetScale) ? flag.targetScale : scale;
    tx = Number.isFinite(flag.targetX) ? flag.targetX : tx;
    ty = Number.isFinite(flag.targetY) ? flag.targetY : ty;
  }
  const safeScale = Number.isFinite(scale) && Math.abs(scale) > 1e-6 ? scale : 1;
  const safeTx = Number.isFinite(tx) ? tx : 0;
  const safeTy = Number.isFinite(ty) ? ty : 0;

  let x = worldPt.x * safeScale + safeTx;
  let y = worldPt.y * safeScale + safeTy;

  const board = document.getElementById('board');
  const boardRect = board?.getBoundingClientRect?.();
  if (boardRect) {
    const expectedLeft = vpRect.left + safeTx;
    const expectedTop = vpRect.top + safeTy;
    const rectOk = Math.abs(boardRect.left - expectedLeft) < 0.5 && Math.abs(boardRect.top - expectedTop) < 0.5;
    if (rectOk) {
      x = worldPt.x * safeScale + (boardRect.left - vpRect.left);
      y = worldPt.y * safeScale + (boardRect.top - vpRect.top);
    }
  }
  return { x, y, w: vpRect.width, h: vpRect.height };
}

function ensureHoverListeners() {
  if (hoverBound) return;
  const host = pickHost();
  if (!host) return;
  const onMove = (evt) => {
    const rect = host.getBoundingClientRect();
    hoverPointer = {
      x: evt.clientX - rect.left,
      y: evt.clientY - rect.top,
      rectLeft: rect.left,
      rectTop: rect.top,
    };
  };
  const onLeave = () => {
    hoverPointer = null;
    if (hoverActive) {
      hoverActive = false;
      try { stopParticleStream({ immediate: false, owner: 'anchor' }); } catch {}
    }
  };
  const onDown = (evt) => {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const anchorWorld = getAnchorWorld();
    const local = getViewportLocalPointFromWorld(anchorWorld);
    if (!local) return;
    const zoomScale = clamp(getZoomScale(), ZOOM_SCALE_CLAMP_MIN, ZOOM_SCALE_CLAMP_MAX);
    const drawScale = ANCHOR_SIZE_MULT * zoomScale;
    const rect = host.getBoundingClientRect();
    const px = evt.clientX - rect.left;
    const py = evt.clientY - rect.top;
    const dx = px - local.x;
    const dy = py - local.y;
    const radius = Math.max(HOVER_RADIUS_BASE_PX, HOVER_RADIUS_BASE_PX * drawScale);
    const inside = (dx * dx + dy * dy) <= (radius * radius);
    if (!inside) return;

    evt.preventDefault();
    evt.stopPropagation();

    if (anchorGuideActive) {
      anchorGuideActive = false;
      if (anchorGuideStopBound) {
        anchorGuideStopBound = false;
        try { document.removeEventListener('pointerdown', handleAnchorGuideStop, true); } catch {}
      }
      try { stopParticleStream({ immediate: true, owner: 'anchor-guide' }); } catch {}
      clearAnchorGuideHighlight();
      hoverSuppressUntil = 0;
      return;
    }

    hoverSuppressUntil = 0;
    try { window.dispatchEvent(new CustomEvent('guide:clear-active-task', { bubbles: true, composed: true })); } catch {}
    hoverForceBurstNext = true;
    hoverActive = false;
    hoverPointer = null;
    try { stopParticleStream({ immediate: false, owner: 'anchor' }); } catch {}
    triggerAnchorGuideStream();
  };
  hoverHostEl = host;
  hoverMoveHandler = onMove;
  hoverLeaveHandler = onLeave;
  hoverDownHandler = onDown;
  host.addEventListener('pointermove', onMove, { passive: true });
  host.addEventListener('pointerleave', onLeave, { passive: true });
  host.addEventListener('pointerdown', onDown, { passive: false });
  hoverBound = true;
}

function clearAnchorGuideHighlight() {
  if (!lastAnchorGuideTarget && !lastAnchorGuideInfo) return;
  if (lastAnchorGuideInfo) {
    clearAnchorGuideSpecialHighlight(lastAnchorGuideInfo);
  }
  try {
    lastAnchorGuideTarget.classList.remove(
      'tutorial-pulse-target',
      'tutorial-active-pulse',
      'tutorial-addtoy-pulse',
      'tutorial-flash'
    );
  } catch {}
  if (anchorGuideFlashTimer) {
    try { clearTimeout(anchorGuideFlashTimer); } catch {}
    anchorGuideFlashTimer = 0;
  }
  lastAnchorGuideTarget = null;
  lastAnchorGuideInfo = null;
}

function clearAnchorGuideSpecialHighlight(info) {
  const eventName = info?.highlightEvent;
  if (!eventName) return;
  const target = info?.highlightTarget || info?.target;
  if (!target || !target.isConnected) return;
  try {
    target.dispatchEvent(new CustomEvent(eventName, { detail: { active: false, allowGuide: false } }));
  } catch {}
}

function applyAnchorGuideSpecialHighlight(info) {
  const eventName = info?.highlightEvent;
  if (!eventName) return;
  const target = info?.highlightTarget || info?.target;
  if (!target || !target.isConnected) return;
  try {
    target.dispatchEvent(new CustomEvent(eventName, { detail: { active: true, allowGuide: true } }));
  } catch {}
}
function applyAnchorGuideHighlight(target, highlight) {
  if (!target) return;
  if (highlight === 'toy') {
    clearAnchorGuideHighlight();
    return;
  }
  if (lastAnchorGuideTarget && lastAnchorGuideTarget !== target) {
    clearAnchorGuideHighlight();
  }
  target.classList.add('tutorial-pulse-target', 'tutorial-active-pulse');
  if (highlight === 'add-toy') {
    target.classList.add('tutorial-addtoy-pulse');
  }
  target.classList.add('tutorial-flash');
  if (anchorGuideFlashTimer) clearTimeout(anchorGuideFlashTimer);
  anchorGuideFlashTimer = setTimeout(() => {
    try { target.classList.remove('tutorial-flash'); } catch {}
  }, 360);
  lastAnchorGuideTarget = target;
  lastAnchorGuideInfo = null;
}

function triggerAnchorGuideStream() {
  const guideOpen = !!document.querySelector('.guide-launcher.is-open');
  const guideResolver = (typeof window !== 'undefined') ? window.__getGuideTaskTarget : null;
  const fallbackResolver = (typeof window !== 'undefined') ? window.__getAnchorGuideTarget : null;
  let info = null;
  if (guideOpen && typeof guideResolver === 'function') {
    try { info = guideResolver(); } catch { info = null; }
  }
  if (!info && typeof fallbackResolver === 'function') {
    try { info = fallbackResolver(); } catch { info = null; }
  }
  const target = info?.target;
  if (!target || !target.isConnected) return;
  if (!markerEl || !markerEl.isConnected) ensureMarker();
  const origin = markerEl;
  if (!origin || !origin.isConnected) return;

  applyAnchorGuideHighlight(target, info?.highlight);
  applyAnchorGuideSpecialHighlight(info);
  lastAnchorGuideInfo = info;
  anchorGuideActive = true;
  try {
    startParticleStream(origin, target, {
      layer: 'behind-target',
      suppressGuideTapAck: true,
      owner: 'anchor-guide',
    });
  } catch {}
  anchorGuideIgnoreUntil = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) + 220;
  if (!anchorGuideStopBound) {
    anchorGuideStopBound = true;
    document.addEventListener('pointerdown', handleAnchorGuideStop, true);
  }
}

function handleAnchorGuideStop(evt) {
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  if (anchorGuideIgnoreUntil && now < anchorGuideIgnoreUntil) return;
  try {
    const host = pickHost();
    const anchorWorld = getAnchorWorld();
    const local = getViewportLocalPointFromWorld(anchorWorld);
    if (host && local) {
      const rect = host.getBoundingClientRect();
      const px = evt.clientX - rect.left;
      const py = evt.clientY - rect.top;
      const zoomScale = clamp(getZoomScale(), ZOOM_SCALE_CLAMP_MIN, ZOOM_SCALE_CLAMP_MAX);
      const drawScale = ANCHOR_SIZE_MULT * zoomScale;
      const radius = Math.max(HOVER_RADIUS_BASE_PX, HOVER_RADIUS_BASE_PX * drawScale);
      const dx = px - local.x;
      const dy = py - local.y;
      if ((dx * dx + dy * dy) <= (radius * radius)) return;
    }
  } catch {}
  anchorGuideStopBound = false;
  anchorGuideActive = false;
  try { document.removeEventListener('pointerdown', handleAnchorGuideStop, true); } catch {}
  try { stopParticleStream({ immediate: false, owner: 'anchor-guide', releaseOwner: true }); } catch {}
  clearAnchorGuideHighlight();
  hoverSuppressUntil = 0;
}

function updateHoverFx(local, drawScale) {
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  if (hoverSuppressUntil && now < hoverSuppressUntil) {
    if (hoverActive) {
      hoverActive = false;
      try { stopParticleStream({ immediate: false, owner: 'anchor' }); } catch {}
    }
    return;
  }
  if (!hoverPointer || !local) {
    if (hoverActive) {
      hoverActive = false;
      hoverForceBurstNext = true;
      try { stopParticleStream({ immediate: true, owner: 'anchor' }); } catch {}
    }
    return;
  }
  const dx = hoverPointer.x - local.x;
  const dy = hoverPointer.y - local.y;
  const radius = Math.max(HOVER_RADIUS_BASE_PX, HOVER_RADIUS_BASE_PX * drawScale);
  const inside = (dx * dx + dy * dy) <= (radius * radius);
  const centerClient = {
    x: hoverPointer.rectLeft + local.x,
    y: hoverPointer.rectTop + local.y,
  };

  if (inside && !hoverActive) {
    const orbitRadius = Math.max(HOVER_ORBIT_RADIUS_BASE_PX, HOVER_ORBIT_RADIUS_BASE_PX * drawScale);
    const zoomScale = clamp(getZoomScale(), ZOOM_SCALE_CLAMP_MIN, ZOOM_SCALE_CLAMP_MAX);
    const started = startOrbitParticleStreamAtPoint(centerClient, {
      owner: 'anchor',
      orbitRadius,
      scale: zoomScale,
      forceBurst: hoverForceBurstNext,
      layer: 'behind-world',
    });
    hoverForceBurstNext = false;
    hoverActive = !!started;
  } else if (!inside && hoverActive) {
    hoverActive = false;
    hoverForceBurstNext = true;
    try { stopParticleStream({ immediate: true, owner: 'anchor' }); } catch {}
  }

  if (hoverActive) {
    const orbitRadius = Math.max(HOVER_ORBIT_RADIUS_BASE_PX, HOVER_ORBIT_RADIUS_BASE_PX * drawScale);
    const zoomScale = clamp(getZoomScale(), ZOOM_SCALE_CLAMP_MIN, ZOOM_SCALE_CLAMP_MAX);
    updateOrbitParticleStreamMetrics({ centerClient, orbitRadius, scale: zoomScale });
  }
}

function getDistanceWorldFromCenter(anchorWorld) {
  try {
    if (window.__ZOOM_COMMIT_PHASE && lastCenterWorld) {
      const dx = anchorWorld.x - lastCenterWorld.x;
      const dy = anchorWorld.y - lastCenterWorld.y;
      return Math.sqrt(dx * dx + dy * dy);
    }
    const c = (typeof window.getViewportCenterWorld === 'function') ? window.getViewportCenterWorld() : null;
    if (!c) return 0;
    lastCenterWorld = c;
    lastCenterWorldTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const dx = anchorWorld.x - c.x;
    const dy = anchorWorld.y - c.y;
    return Math.sqrt(dx * dx + dy * dy);
  } catch { return 0; }
}

function triggerBeatPulse(intensity = 1) {
  // Replace, don’t accumulate (so pulses don’t overlap).
  pulseBeat = clamp(intensity, 0, 2.0);
    pulseBeatT = 0;
  triggerGridFlash(3);
}
function triggerBarPulse(intensity = 1) {
  pulseBar = clamp(intensity, 0, 3.0);
    pulseBarT = 0;
  triggerGridFlash(6);
}
function servicePulses(dt) {
  const d = Math.max(0.08, beatDurSec || 0.5);
  pulseBeatT = clamp(pulseBeatT + dt / d, 0, 1);
  pulseBarT  = clamp(pulseBarT  + dt / d, 0, 1);

  // Simple one-beat “thump” curve (fast up, smooth down)
  const beatEnv = 1 - pulseBeatT;
  const barEnv  = 1 - pulseBarT;

  pulseBeat = pulseBeat * beatEnv;
  pulseBar  = pulseBar  * barEnv;
}

function serviceFlashes(dt) {
  if (flashingCells.length === 0) return;
  const barSec = Math.max(0.001, beatDurSec * BEATS_PER_BAR);
  const noteFadeSec = Math.max(NOTE_FLASH_MIN_FADE_SEC, barSec / 8);
  for (let i = flashingCells.length - 1; i >= 0; i--) {
    const cell = flashingCells[i];
    const isWhite = !cell.color || cell.color === '#ffffff' || cell.color === '#fff';
    const decay = isWhite ? WHITE_FLASH_DECAY : (1 / noteFadeSec);
    cell.alpha -= dt * decay;
    if (cell.alpha <= 0) {
      flashingCells.splice(i, 1);
    }
  }
}

function getChainHeadId(toyId) {
  if (!toyId) return null;
  const start = document.getElementById(toyId);
  if (!start) return null;
  let node = start;
  let safety = 0;
  while (node && safety < 40) {
    const parentId = node.dataset.chainParent || node.dataset.prevToyId;
    if (!parentId) break;
    const parent = document.getElementById(parentId);
    if (!parent || parent === node) break;
    node = parent;
    safety++;
  }
  return node && node.id ? node.id : null;
}

function randomBrightColor() {
  const sat = 82 + Math.floor(Math.random() * 16);
  const light = 54 + Math.floor(Math.random() * 14);
  let color = '';
  let attempts = 0;
  while (attempts < 120) {
    const hue = Math.floor(Math.random() * 360);
    color = `hsl(${hue} ${sat}% ${light}%)`;
    if (!assignedColors.has(color)) return color;
    attempts++;
  }
  // If we couldn't find a unique hue quickly, fall back to a deterministic offset.
  const hue = (assignedColors.size * 47) % 360;
  return `hsl(${hue} ${sat}% ${light}%)`;
}

function assignCellForChain(chainHeadId) {
  if (!chainHeadId) return null;
  const existing = chainCellAssignments.get(chainHeadId);
  if (existing) return existing;

  let i = 0;
  let j = 0;
  let key = '';
  const maxCells = 36;
  const canReserve = assignedCellKeys.size < maxCells;
  let attempts = 0;
  while (attempts < 120) {
    i = Math.floor(Math.random() * 6);
    j = Math.floor(Math.random() * 6);
    key = `${i},${j}`;
    if (!canReserve || !assignedCellKeys.has(key)) break;
    attempts++;
  }

  const color = randomBrightColor();
  const entry = { i, j, color };
  chainCellAssignments.set(chainHeadId, entry);
  assignedCellKeys.add(key);
  assignedColors.add(color);
  return entry;
}

function flashCell(i, j, color, intensity = 1.0) {
  for (let idx = 0; idx < flashingCells.length; idx++) {
    const cell = flashingCells[idx];
    if (cell.i === i && cell.j === j && cell.color === color) {
      cell.alpha = Math.max(cell.alpha, intensity);
      return;
    }
  }
  flashingCells.push({ i, j, alpha: intensity, color });
}

function triggerGridFlash(count) {
  const newCells = new Set();
  let attempts = 0;
  while (newCells.size < count && attempts < 50) {
    const i = Math.floor(Math.random() * 6);
    const j = Math.floor(Math.random() * 6);
    const key = `${i},${j}`;
    if (!lastFlashedCells.has(key) && !assignedCellKeys.has(key)) {
      newCells.add(key);
    }
    attempts++;
  }

  lastFlashedCells = new Set(newCells);
  for (const key of newCells) {
    const [i, j] = key.split(',').map(Number);
    flashCell(i, j, '#ffffff', WHITE_FLASH_INTENSITY);
  }
}

function serviceLoopTriggers(loopInfo, running) {
  if (!loopInfo) return;
  const phase01 = Number.isFinite(loopInfo.phase01) ? loopInfo.phase01 : 0;
  const beatIndex = Math.floor(clamp(phase01, 0, 0.999999) * BEATS_PER_BAR);

  // beat duration (for pulse timing)
  if (Number.isFinite(loopInfo.secondsPerBeat) && loopInfo.secondsPerBeat > 0) {
    beatDurSec = loopInfo.secondsPerBeat;
  } else if (Number.isFinite(loopInfo.bpm) && loopInfo.bpm > 0) {
    beatDurSec = 60 / loopInfo.bpm;
  } else {
    beatDurSec = 0.5;
  }

  if (running) {
    const wrapped = phase01 < lastPhase01 && lastPhase01 > 0.65;
    if (wrapped) {
      triggerBarPulse(1);
    }
    if (beatIndex !== lastBeatIndex) {
      triggerBeatPulse(beatIndex === 0 ? 1.0 : 0.75);
      lastBeatIndex = beatIndex;
    }
  } else {
    lastBeatIndex = beatIndex;
  }
  lastPhase01 = phase01;
}

function clearFrame() {
  if (!ctx || !canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
}

function clampToEdge(cx, cy, x, y, w, h, pad) {
  // Ray from center -> (x,y). Intersect with padded rect, return intersection point.
  const dx = x - cx;
  const dy = y - cy;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = dx / len;
  const ny = dy / len;
  const left = pad, right = w - pad, top = pad, bottom = h - pad;

  let tBest = Infinity;
  // x sides
  if (Math.abs(nx) > 1e-6) {
    const tL = (left - cx) / nx;
    const yL = cy + ny * tL;
    if (tL > 0 && yL >= top && yL <= bottom) tBest = Math.min(tBest, tL);
    const tR = (right - cx) / nx;
    const yR = cy + ny * tR;
    if (tR > 0 && yR >= top && yR <= bottom) tBest = Math.min(tBest, tR);
  }
  // y sides
  if (Math.abs(ny) > 1e-6) {
    const tT = (top - cy) / ny;
    const xT = cx + nx * tT;
    if (tT > 0 && xT >= left && xT <= right) tBest = Math.min(tBest, tT);
    const tB = (bottom - cy) / ny;
    const xB = cx + nx * tB;
    if (tB > 0 && xB >= left && xB <= right) tBest = Math.min(tBest, tB);
  }

  if (!Number.isFinite(tBest) || tBest === Infinity) {
    return { x: clamp(x, left, right), y: clamp(y, top, bottom) };
  }
  // Pull slightly inward so the glow isn't clipped.
  const inward = 10;
  return { x: cx + nx * (tBest - inward), y: cy + ny * (tBest - inward) };
}

function drawGradient(local, distWorld, running, drawScale = 1) {
  if (!ctx || !canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;

  const cx = w * 0.5;
  const cy = h * 0.5;

  const onScreen = (local.x >= 0 && local.x <= w && local.y >= 0 && local.y <= h);

  // Fade as you travel away from the anchor, but never vanish (requested).
  const travel = clamp(distWorld / 2800, 0, 2.4);
  const travelFade = 1 / (1 + travel * travel);
  const base = (running ? 1.0 : 0.78) * travelFade;
  const baseAlpha = clamp(GRAD_MAX_ALPHA * base, GRAD_MIN_ALPHA, GRAD_MAX_ALPHA);

  const paint = (gx, gy, r, alpha) => {
    if (!Number.isFinite(alpha) || alpha <= 0.0001) return;
    const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
    grad.addColorStop(0.00, `rgba(90, 100, 255, ${alpha})`);
    grad.addColorStop(0.28, `rgba(120, 130, 255, ${alpha * 0.70})`);
    grad.addColorStop(1.00, `rgba(0, 0, 0, 0)`);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  };

  if (onScreen) {
    paint(local.x, local.y, GRAD_ONSCREEN_R_PX * drawScale, baseAlpha);
  }

  // Directional edge hint: when offscreen, fade in; when returning onscreen, fade out smoothly.
  if (!onScreen || offscreenFade01 > 0.0001) {
    const edgePt = clampToEdge(cx, cy, local.x, local.y, w, h, GRAD_EDGE_PAD_PX);
    paint(edgePt.x, edgePt.y, GRAD_OFFSCREEN_R_PX * drawScale, baseAlpha * offscreenFade01);
  }
}

function getSquareMetrics(anchorWorld) {
  const { spacing, offsetX, offsetY } = getGridInfo();
  const gridI = Math.round((anchorWorld.x - offsetX) / spacing);
  const gridJ = Math.round((anchorWorld.y - offsetY) / spacing);
  
  const topLeftX = offsetX + gridI * spacing - 1.5 * spacing;
  const topLeftY = offsetY + gridJ * spacing - 1.5 * spacing;

  const dx = topLeftX - anchorWorld.x;
  const dy = topLeftY - anchorWorld.y;

    const largeSquareSize = spacing * 1.5;
  return { dx, dy, largeSquareSize };
}

function drawAnchorGrid(local, drawScale = 1) {
    if (!ctx) return;
    if (flashingCells.length === 0) return;

    ctx.save();
    ctx.translate(local.x, local.y);
    ctx.scale(drawScale, drawScale);

    const anchorWorld = getAnchorWorld();
    const { dx, dy, largeSquareSize } = getSquareMetrics(anchorWorld);
    const gridSize = largeSquareSize / 6;
    
    // --- Flashing cells ---
    for (const cell of flashingCells) {
      const isWhite = !cell.color || cell.color === '#ffffff' || cell.color === '#fff';
      const alphaMult = isWhite ? WHITE_FLASH_ALPHA : NOTE_FLASH_ALPHA;
      ctx.save();
      ctx.globalCompositeOperation = isWhite ? 'source-over' : 'screen';
      ctx.globalAlpha = clamp(cell.alpha * alphaMult, 0, 1);
      ctx.fillStyle = cell.color || '#ffffff';
      if (!isWhite) {
        ctx.shadowColor = cell.color || '#ffffff';
        ctx.shadowBlur = gridSize * NOTE_FLASH_GLOW;
      }
      ctx.fillRect(dx + cell.i * gridSize, dy + cell.j * gridSize, gridSize, gridSize);
      ctx.restore();
    }
    
    ctx.restore();
}

function drawAnchorParticles(local, nowSec, running, drawScale = 1, pulseBeat = 0, pulseBar = 0, corePulseActive = false) {
    if (!ctx) return;

    const idle = 0.5 + 0.5 * Math.sin(nowSec * 1.2);
    const energy = clamp((running ? 0.52 : 0.28) + idle * 0.20 + pulseBeat * 0.25 + pulseBar * 0.48, 0, 2.6);
    const coreR = CORE_BASE_R_PX + energy * CORE_PULSE_R_PX;

    ctx.save();
    ctx.translate(local.x, local.y);
    ctx.scale(drawScale, drawScale);

    // Outer glow
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR * 3.6);
    g.addColorStop(0.00, `rgba(255,255,255,${0.36 + 0.12 * energy})`);
    g.addColorStop(0.20, `rgba(90, 100, 255,${0.24 + 0.11 * energy})`);
    g.addColorStop(0.58, `rgba(120, 130, 255,${0.12 + 0.09 * energy})`);
    g.addColorStop(1.00, `rgba(0,0,0,0)`);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, coreR * 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore(); // for composite op

    ctx.globalCompositeOperation = 'source-over';

  // Central sparkle (keeps a “ball” presence)
  const pulseFactor = clamp(pulseBeat + pulseBar, 0, 2.0) / 2.0;
  const base = { r: 80, g: 60, b: 220 };
  const cyan = { r: 92, g: 178, b: 255 };
  const idlePulse = 0.5 + 0.5 * Math.sin(nowSec * 2.35 + pulseBeat * 1.5 + pulseBar * 1.1);
  const mix = corePulseActive
    ? (0.15 + 0.85 * clamp((idlePulse + pulseFactor) * 0.5, 0, 1))
    : 0.0;
  const sparkR = Math.floor(base.r + (cyan.r - base.r) * mix);
  const sparkG = Math.floor(base.g + (cyan.g - base.g) * mix);
  const sparkB = Math.floor(base.b + (cyan.b - base.b) * mix);
  const sparkA = corePulseActive ? (0.55 + 0.45 * mix) : 1.0;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  // Solid base to avoid any "hole" look.
  ctx.fillStyle = `rgb(${base.r},${base.g},${base.b})`;
  ctx.beginPath();
  ctx.arc(0, 0, coreR * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = corePulseActive
    ? `rgba(${sparkR},${sparkG},${sparkB},${sparkA.toFixed(3)})`
    : `rgb(${sparkR},${sparkG},${sparkB})`;
  ctx.beginPath();
  ctx.arc(0, 0, coreR * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

    ctx.restore(); // for scale/translate
}

export function initBoardAnchor() {
  __enabled = readEnabled();
  if (!__enabled) { teardown(); return; }
  ensureCanvas();
  if (!noteListenerActive) {
    noteListenerActive = true;
    window.addEventListener('toy:note', (e) => {
      const toyId = e?.detail?.toyId;
      if (!toyId || toyId === 'master') return;
      const chainHeadId = getChainHeadId(String(toyId));
      if (!chainHeadId) return;
      const entry = assignCellForChain(chainHeadId);
      if (!entry) return;
      flashCell(entry.i, entry.j, entry.color, NOTE_FLASH_INTENSITY);
    });
    document.addEventListener('toy:remove', (e) => {
      const panel = e?.detail?.panel;
      const id = panel?.id;
      if (!id) return;
      const entry = chainCellAssignments.get(id);
      if (entry) {
        assignedCellKeys.delete(`${entry.i},${entry.j}`);
        assignedColors.delete(entry.color);
        chainCellAssignments.delete(id);
      }
    });
  }
}

export function setBoardAnchorEnabled(nextEnabled) {
  __enabled = !!nextEnabled;
  try { localStorage.setItem('mt_anchor_enabled', __enabled ? '1' : '0'); } catch {}
  if (!__enabled) teardown();
  else initBoardAnchor();
}

export function tickBoardAnchor({ nowMs, loopInfo, running } = {}) {
  const tA = (typeof performance !== 'undefined' && performance.now && window.__PerfFrameProf) ? performance.now() : 0;
  const want = readEnabled();
  if (!want) {
    if (canvas) teardown();
    return;
  }
  if (!canvas) ensureCanvas();
  if (!canvas || !ctx) return;

  // in case topbar DOM was rebuilt
  ensureMiniButton();

  const now = Number.isFinite(nowMs) ? nowMs : (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const dt = clamp(((now - (lastNowMs || now)) / 1000), 0, MAX_DT);
  lastNowMs = now;

  serviceLoopTriggers(loopInfo, !!running);
  servicePulses(dt);
  serviceFlashes(dt);

  const anchorWorld = getAnchorWorld();
  updateMarkerPos(anchorWorld);
  const gesturing = __anchIsGesturing();
  const mod = __anchGestureDrawModulo();
  __anchFrameIdx++;
  const frameIndex = __anchFrameIdx;
  // Keep position smooth; only throttle the heavier grid flashes while gesturing.
  const doFull = (!gesturing) || mod <= 1 || ((frameIndex % mod) === 0);
  const local = getViewportLocalPointFromWorld(anchorWorld);
  if (!local) return;

  // Fade the offscreen directional gradient in/out over ~1s (smooths boundary snapping).
  const onScreen = (local.x >= 0 && local.x <= local.w && local.y >= 0 && local.y <= local.h);
  const target = onScreen ? 0 : 1;
  const step = clamp(dt / GRAD_OFFSCREEN_FADE_SEC, 0, 1);
  if (target > offscreenFade01) offscreenFade01 = Math.min(1, offscreenFade01 + step);
  else if (target < offscreenFade01) offscreenFade01 = Math.max(0, offscreenFade01 - step);

  clearFrame();

  const distWorld = getDistanceWorldFromCenter(anchorWorld);
  const nowSec = now / 1000;

  const zoomScale = clamp(getZoomScale(), ZOOM_SCALE_CLAMP_MIN, ZOOM_SCALE_CLAMP_MAX);
  const drawScale = ANCHOR_SIZE_MULT * zoomScale;

  const buffer = GRAD_EDGE_PAD_PX * 2;
  const onScreenWithPad =
    local.x >= -buffer &&
    local.x <= (local.w + buffer) &&
    local.y >= -buffer &&
    local.y <= (local.h + buffer);
  const offscreenOnly = !onScreenWithPad && !anchorGuideActive && !hoverActive;
  if (offscreenOnly) {
    drawGradient(local, distWorld, !!running, drawScale);
    if (tA) perfMark(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - tA);
    return;
  }

  if (doFull) drawAnchorGrid(local, drawScale);

  drawGradient(local, distWorld, !!running, drawScale);
  drawAnchorParticles(local, nowSec, !!running, drawScale, pulseBeat, pulseBar, anchorGuideActive);
  updateHoverFx(local, drawScale);
  if (tA) perfMark(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - tA);
}

try {
  window.__MT_ANCHOR = {
    init: initBoardAnchor,
    tick: tickBoardAnchor,
    setEnabled: setBoardAnchorEnabled,
    center: centerCameraOnAnchor,
  };
} catch {}
