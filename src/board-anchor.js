// src/board-anchor.js — screen-space "home" anchor (<=300 lines)
// A gentle, particle-built landmark that helps players orient themselves.
//
// Features:
// - Screen-space canvas overlay (not affected by board pan/zoom transform)
// - Particle "energy ball" made of many rotating particles + orbiting moons
// - Idle animation when transport is stopped
// - Beat/bar pulses when transport is running
// - Directional background gradient that points toward the anchor when off-screen
// - Mini "home" button under the ? button to recenter the camera
// - Entire system can be disabled via window.__MT_ANCHOR_DISABLED or localStorage.mt_anchor_enabled='0'

import { getViewportElement, worldToScreen } from './board-viewport.js';
import { BEATS_PER_BAR } from './audio-core.js';

const DEFAULT_WORLD_POS = Object.freeze({ x: 0, y: 0 });

// --- Tuning ---
const ANCHOR_SIZE_MULT = 4.0; // requested: 4x overall size
const ZOOM_SCALE_CLAMP_MIN = 0.25;
const ZOOM_SCALE_CLAMP_MAX = 2.5;

const CORE_BASE_R_PX = 12;
const CORE_PULSE_R_PX = 18;

const CORE_PARTICLE_COUNT = 18;
const CORE_PARTICLE_R_PX = 5.2; // bigger "blob" particles
const CORE_PARTICLE_RING_R_PX = 6.5; // closer to center

const MOON_COUNT = 14;
const MOON_R_PX = 1.8;
const MAX_DT = 0.050; // cap dt to avoid big jumps when tab refocuses

// Gradient (requested: bigger + more opaque, min opacity never hits 0)
const GRAD_ONSCREEN_R_PX = 380;
const GRAD_OFFSCREEN_R_PX = 740;
const GRAD_MIN_ALPHA = 0.12;
const GRAD_MAX_ALPHA = 0.34;
const GRAD_EDGE_PAD_PX = 34;

let __enabled = true;

let canvas = null;
let ctx = null;
let lastNowMs = 0;

let lastPhase01 = 0;
let lastBeatIndex = -1;

let pulseBeat = 0;
let pulseBar = 0;
let pulseBeatT = 1; // 0..1
let pulseBarT = 1;  // 0..1
let beatDurSec = 0.5;
let prevRunning = false;
let barTurns = 0; // counts completed bars while running
let barAngle = 0; // monotonically increasing radians

let moons = [];
let corePts = [];

let markerEl = null;        // invisible world-space DOM marker (for centering)
let miniBtnEl = null;       // UI button under ? launcher
let miniStyleEl = null;

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

function getMoonSpeedMulFromBeat() {
  // Desired while playing:
  // - 1 orbit = 2 bars (requested)
  // - A bar = BEATS_PER_BAR beats
  // - So radians per second = 2π / (2 bars) = π per bar
  // - bar seconds = beatDurSec * BEATS_PER_BAR
  // => rad/sec = π / (beatDurSec * BEATS_PER_BAR)
  const bd = Math.max(0.08, beatDurSec || 0.5);
    const radPerSec = (2 * Math.PI) / (bd * BEATS_PER_BAR);
  // Our integrator uses (dt * m.speed * mul) so choose mul such that:
  // average |m.speed| ~= 1.0 gives radPerSec.
  return radPerSec;
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

  initCoreParticles();
  initMoons();
  ensureMarker();
  ensureMiniButton();
  return canvas;
}

function initCoreParticles() {
  corePts = [];
  for (let i = 0; i < CORE_PARTICLE_COUNT; i++) {
    const a = (i / CORE_PARTICLE_COUNT) * Math.PI * 2;
    const dir = (Math.random() < 0.5) ? -1 : 1;
    const spRand = 0.35 + Math.random() * 1.25; // wider range
    const sizeMul = 0.75 + Math.random() * 0.85;
    corePts.push({
      a,
      speed: dir * spRand,
      ring: CORE_PARTICLE_RING_R_PX * (0.7 + 0.35 * ((i % 3) / 2)),
      phase: i * 0.37,
      theta: a, // persistent angle
      sizeMul,
    });
  }
}

function initMoons() {
  moons = [];
  for (let i = 0; i < MOON_COUNT; i++) {
    const a0 = (i / MOON_COUNT) * Math.PI * 2;
    // Even 0..1 distribution of distance, used later against core radius.
    const dist01 = (i + 0.5) / MOON_COUNT;
    moons.push({
      a0,
      // Half clockwise, half counter-clockwise (requested).
      speed: (0.22 + 0.18 * ((i % 4) / 3)) * ((i % 2) ? -1 : 1),
      tilt: (i * 0.33) % (Math.PI * 2),
      dist01,
      phase: i * 0.9,
      t: a0, // persistent parameter
    });
  }
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
  if (canvas && canvas.parentElement) canvas.parentElement.removeChild(canvas);
  canvas = null;
  ctx = null;
  lastNowMs = 0;
  lastPhase01 = 0;
  lastBeatIndex = -1;
  pulseBeat = 0;
  pulseBar = 0;
  moons = [];
  corePts = [];
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
      window.centerBoardOnElementSlow(markerEl, 1.0, { centerFracX: 0.5 });
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
      .anchor-mini-btn::before{
        content: '';
        position: absolute;
        width: 10px;
        height: 10px;
        background: white;
        border-radius: 999px;
        animation: pulseCore 2.5s ease-in-out infinite;
      }
      .anchor-mini-btn .mini-moon{
        position: absolute;
        width: 4px; height: 4px;
        border-radius: 999px;
        background: rgba(255,255,255,0.92);
        box-shadow: 0 0 10px rgba(120,200,255,0.55);
        animation: miniOrbit 2.6s linear infinite;
      }
      .anchor-mini-btn .mini-moon.m2{ animation-duration: 3.5s; opacity: 0.85; }
      @keyframes miniOrbit{
        from { transform: translate(0px, -14px) rotate(0deg) translate(0px, 14px); }
        to   { transform: translate(0px, -14px) rotate(360deg) translate(0px, 14px); }
      }
      @keyframes pulseCore {
        0%, 100% { transform: scale(1); background: rgb(180, 220, 255); }
        50% { transform: scale(1.2); background: rgb(255, 255, 255); }
      }
    `;
    document.head.appendChild(miniStyleEl);
  }

  miniBtnEl = document.createElement('div');
  miniBtnEl.className = 'anchor-mini-btn';
  miniBtnEl.title = 'Return to anchor';
  miniBtnEl.setAttribute('aria-label', 'Return to anchor');

  // IMPORTANT: real HTML (no escaped entities)
  miniBtnEl.innerHTML = `<div class="mini-moon"></div><div class="mini-moon m2"></div>`;

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
  const abs = worldToScreen({ x: worldPt.x, y: worldPt.y });
  const x = abs.x - vpRect.left;
  const y = abs.y - vpRect.top;
  return { x, y, w: vpRect.width, h: vpRect.height };
}

function getDistanceWorldFromCenter(anchorWorld) {
  try {
    const c = (typeof window.getViewportCenterWorld === 'function') ? window.getViewportCenterWorld() : null;
    if (!c) return 0;
    const dx = anchorWorld.x - c.x;
    const dy = anchorWorld.y - c.y;
    return Math.sqrt(dx * dx + dy * dy);
  } catch { return 0; }
}

function triggerBeatPulse(intensity = 1) {
  // Replace, don’t accumulate (so pulses don’t overlap).
  pulseBeat = clamp(intensity, 0, 2.0);
  pulseBeatT = 0;
}
function triggerBarPulse(intensity = 1) {
  pulseBar = clamp(intensity, 0, 3.0);
  pulseBarT = 0;
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

function integrateOrbits(dt, running) {
  const speedMul = running ? 1.8 : 1.0;

  for (const p of corePts) {
    p.theta += dt * speedMul * p.speed;
  }
  // Moons: always integrate so there's never a state-swap pop.
  for (let i = 0; i < moons.length; i++) {
    const m = moons[i];
    let speedMultiplier = (running ? getMoonSpeedMulFromBeat() : 1.0);
    if (running && i < 4) {
      speedMultiplier *= 2;
    }
    m.t += dt * m.speed * speedMultiplier;
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
      barTurns++;
      triggerBarPulse(1);
    }
    if (beatIndex !== lastBeatIndex) {
      triggerBeatPulse(beatIndex === 0 ? 1.0 : 0.75);
      lastBeatIndex = beatIndex;
    }

    // Monotonic bar angle: 1 orbit per bar
    barAngle = (barTurns + phase01) * Math.PI * 2;
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
  const alpha = clamp(GRAD_MAX_ALPHA * base, GRAD_MIN_ALPHA, GRAD_MAX_ALPHA);

  let gx = local.x;
  let gy = local.y;
  let r = GRAD_ONSCREEN_R_PX * drawScale;

  if (!onScreen) {
    const edgePt = clampToEdge(cx, cy, local.x, local.y, w, h, GRAD_EDGE_PAD_PX);
    gx = edgePt.x;
    gy = edgePt.y;
    r = GRAD_OFFSCREEN_R_PX * drawScale;
  }

  const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
  grad.addColorStop(0.00, `rgba(120, 200, 255, ${alpha})`);
    grad.addColorStop(0.28, `rgba(130, 210, 255, ${alpha * 0.70})`);
  grad.addColorStop(1.00, `rgba(0, 0, 0, 0)`);

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function drawAnchorParticles(local, nowSec, running, drawScale = 1) {
  if (!ctx || !canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;

  // Only draw the "ball" when near enough to matter.
  const margin = 260 * drawScale;
  if (local.x < -margin || local.x > w + margin || local.y < -margin || local.y > h + margin) return;

  // Energy: idle wobble + pulses.
  const idle = 0.5 + 0.5 * Math.sin(nowSec * 1.2);
  const energy = clamp((running ? 0.52 : 0.28) + idle * 0.20 + pulseBeat * 0.25 + pulseBar * 0.48, 0, 2.6);
  const moonPulse = clamp((pulseBeat * 0.9) + (pulseBar * 1.2), 0, 3.0);
  const coreR = CORE_BASE_R_PX + energy * CORE_PULSE_R_PX;

  // Draw in a scaled local space so the whole effect (including moons) is zoom-relative.
  ctx.save();
  ctx.translate(local.x, local.y);
  ctx.scale(drawScale, drawScale);

  // Outer glow
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR * 3.6);
  g.addColorStop(0.00, `rgba(255,255,255,${0.36 + 0.12 * energy})`);
  g.addColorStop(0.20, `rgba(64,200,255,${0.24 + 0.11 * energy})`);
    g.addColorStop(0.58, `rgba(130, 210, 255,${0.12 + 0.09 * energy})`);
  g.addColorStop(1.00, `rgba(0,0,0,0)`);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, coreR * 3.6, 0, Math.PI * 2);
  ctx.fill();

  // --- Core made of multiple particles rotating around ---
  ctx.globalCompositeOperation = 'source-over';

  // Central sparkle (keeps a “ball” presence)
  const pulseFactor = clamp(pulseBeat + pulseBar, 0, 2.0) / 2.0;
  const sparkR = Math.floor(180 + 75 * pulseFactor);
  const sparkG = Math.floor(220 + 35 * pulseFactor);
  const sparkB = 255;
  ctx.fillStyle = `rgb(${sparkR},${sparkG},${sparkB})`;
  ctx.beginPath();
  ctx.arc(0, 0, coreR * 0.55, 0, Math.PI * 2);
  ctx.fill();

  // --- Moons with elliptical orbits ---
  const idleEnergy = (running ? 0.52 : 0.28) + idle * 0.20;
  const stableCoreR = CORE_BASE_R_PX + idleEnergy * CORE_PULSE_R_PX;
  for (let i = 0; i < moons.length; i++) {
    const m = moons[i];
    const t = m.t + m.phase;

    // Requested: distance range based on the current blob radius:
    // min = outer edge of central blob, max = 4x core radius.
    const minR = stableCoreR * 1.00;         // right at blob edge
    const maxR = stableCoreR * 1.75;         // closer in (was 2.6)
    // IMPORTANT: moons are NOT affected by the blob "breathing" (no orbitBoost).
    const baseR = (minR + (maxR - minR) * (m.dist01 || 0.5));

    // Ellipse aspect per moon (subtle variation, stable)
        const aspect = 0.2 + 0.4 * (((i * 7) % 10) / 9);
    const ax = baseR;
    const by = baseR * aspect;

    const ex = Math.cos(t) * ax;
    const ey = Math.sin(t) * by;
    const ct = Math.cos(m.tilt), st = Math.sin(m.tilt);
    const rx = ex * ct - ey * st;
    const ry = ex * st + ey * ct;

    const mx = rx;
    const my = ry;

                ctx.fillStyle = `rgba(255,255,255,${0.8 + moonPulse * 0.2})`;
    ctx.beginPath();
    ctx.arc(mx, my, MOON_R_PX, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  ctx.restore(); // scaled local space
}

export function initBoardAnchor() {
  __enabled = readEnabled();
  if (!__enabled) { teardown(); return; }
  ensureCanvas();
}

export function setBoardAnchorEnabled(nextEnabled) {
  __enabled = !!nextEnabled;
  try { localStorage.setItem('mt_anchor_enabled', __enabled ? '1' : '0'); } catch {}
  if (!__enabled) teardown();
  else initBoardAnchor();
}

export function tickBoardAnchor({ nowMs, loopInfo, running } = {}) {
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

  integrateOrbits(dt, !!running);
  serviceLoopTriggers(loopInfo, !!running);
  servicePulses(dt);

  // On start: align barTurns so barAngle matches current moon phase (no pop).
  if (!!running && !prevRunning) {
    const phase01 = loopInfo && Number.isFinite(loopInfo.phase01) ? loopInfo.phase01 : 0;
    const ref = (moons && moons[0] && Number.isFinite(moons[0].t)) ? moons[0].t : 0;
    const wantTurns = Math.floor((ref / (Math.PI * 2)) - phase01);
    if (Number.isFinite(wantTurns)) {
      barTurns = wantTurns;
      barAngle = (barTurns + phase01) * Math.PI * 2;
    }
  }
  prevRunning = !!running;

  const anchorWorld = getAnchorWorld();
  updateMarkerPos(anchorWorld);

  const local = getViewportLocalPointFromWorld(anchorWorld);
  if (!local) return;

  clearFrame();

  const distWorld = getDistanceWorldFromCenter(anchorWorld);
  const nowSec = now / 1000;

  const zoomScale = clamp(getZoomScale(), ZOOM_SCALE_CLAMP_MIN, ZOOM_SCALE_CLAMP_MAX);
  const drawScale = ANCHOR_SIZE_MULT * zoomScale;

  drawGradient(local, distWorld, !!running, drawScale);
  drawAnchorParticles(local, nowSec, !!running, drawScale);
}

try {
  window.__MT_ANCHOR = {
    init: initBoardAnchor,
    tick: tickBoardAnchor,
    setEnabled: setBoardAnchorEnabled,
    center: centerCameraOnAnchor,
  };
} catch {}