// src/drawgrid.js
// Minimal, scoped Drawing Grid -- 16x12, draw strokes, build snapped nodes on release.
// Strictly confined to the provided panel element.
import { buildPalette, midiToName } from './note-helpers.js';
import { drawBlock } from './toyhelpers.js';
import { getLoopInfo, isRunning } from './audio-core.js';
import { onZoomChange, getZoomState, getFrameStartState, onFrameStart } from './zoom/ZoomCoordinator.js';
import { createParticleViewport } from './particles/particle-viewport.js';

// ---- drawgrid debug gate ----
const DG_DEBUG = false;           // master switch
const DG_FRAME_DEBUG = false;     // per-frame spam
const DG_SWAP_DEBUG = false;      // swap spam
const dglog = (...a) => { if (DG_DEBUG) console.log('[DG]', ...a); };
const dgf = (...a) => { if (DG_FRAME_DEBUG) console.log('[DG] frame', ...a); };
const dgs = (...a) => { if (DG_SWAP_DEBUG) console.log('[DG] swap', ...a); };

const DG = {
  log: dglog,
  warn: (...a) => { if (DG_DEBUG) console.warn('[DG]', ...a); },
  time: (label) => { if (DG_DEBUG) console.time(label); },
  timeEnd: (label) => { if (DG_DEBUG) console.timeEnd(label); },
};

// --- Drawgrid debug (off by default) ---
const DBG_DRAW = false; // set true only for hyper-local issues
function dbg(tag, obj){ if (DG_DEBUG && DBG_DRAW) console.log(`[DG][${tag}]`, obj || ''); }
let __dbgLiveSegments = 0;
let __dbgPointerMoves = 0;
let __dbgPaintClears = 0;

let DG_particlesRectsDrawn = 0;
let DG_lettersDrawn = 0;

const STROKE_COLORS = [
  'rgba(95,179,255,0.95)',  // Blue
  'rgba(255,95,179,0.95)',  // Pink
  'rgba(95,255,179,0.95)',  // Green
  'rgba(255,220,95,0.95)', // Yellow
];
let colorIndex = 0;

function withIdentity(ctx, fn) {
  if (!ctx || typeof fn !== 'function') return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  try {
    fn();
  } finally {
    ctx.restore();
  }
}

function clearCanvas(ctx) {
  if (!ctx || !ctx.canvas) return;
  const surface = ctx.canvas;
  withIdentity(ctx, () => ctx.clearRect(0, 0, surface.width, surface.height));
  __dbgPaintClears++;
  if (DG_DEBUG && DBG_DRAW && (__dbgPaintClears % 20) === 1) {
    console.debug('[DG][CLEAR]', { which: surface.getAttribute?.('data-role') || 'paint?', clears: __dbgPaintClears });
  }
}

// Draw a live stroke segment directly to FRONT (no swaps, no back-buffers)
function drawLiveStrokePoint(ctx, pt, prevPt, color) {
  if (!ctx) { dbg('LIVE/no-ctx'); return; }
  withIdentity(ctx, () => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color || '#fff';
    ctx.lineWidth = 3.0;
    if (prevPt) {
      ctx.beginPath();
      ctx.moveTo(prevPt.x, prevPt.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    } else {
      // tiny dot for first point
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = color || '#fff';
      ctx.fill();
    }
  });
  __dbgLiveSegments++;
  if ((__dbgLiveSegments % 10) === 1) dbg('LIVE/segment', { segs: __dbgLiveSegments });
}

let __drawParticlesSeed = 1337;
// --- Commit/settle gating for overlay clears ---
let __dgDeferUntilTs = 0;
let __dgNeedsUIRefresh = false;
let __dgStableFramesAfterCommit = 0;

// --- Zoom-freeze for overlays ---
let zoomFreezeActive = false;
let zoomFreezeW = 0;
let zoomFreezeH = 0;

function __dgInCommitWindow(nowTs) {
  const win = (typeof window !== 'undefined') ? window : null;
  const lp = win?.__LAST_POINTERUP_DIAG__;
  const gestureSettle = win?.__GESTURE_SETTLE_UNTIL_TS || (lp?.t0 ? lp.t0 + 200 : 0);
  const deferUntil = __dgDeferUntilTs || 0;
  const guardUntil = Math.max(gestureSettle || 0, deferUntil);
  return guardUntil > 0 && nowTs < guardUntil;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * For a sparse array of nodes, fills in the empty columns by interpolating
 * and extrapolating from the existing nodes to create a continuous line.
 * @param {Array<Set<number>>} nodes - The sparse array of node rows.
 * @param {number} numCols - The total number of columns in the grid.
 * @returns {Array<Set<number>>} A new array with all columns filled.
 */
function fillGapsInNodeArray(nodes, numCols) {
    const filled = nodes.map(s => s ? new Set(s) : new Set()); // Deep copy
    const firstDrawn = filled.findIndex(n => n.size > 0);
    if (firstDrawn === -1) return filled; // Nothing to fill

    const lastDrawn = filled.map(n => n.size > 0).lastIndexOf(true);

    const getAvgRow = (colSet) => {
        if (!colSet || colSet.size === 0) return NaN;
        // Using a simple loop is arguably clearer and safer than reduce here.
        let sum = 0;
        for (const row of colSet) { sum += row; }
        return sum / colSet.size;
    };

    // Extrapolate backwards from the first drawn point
    const firstRowAvg = getAvgRow(filled[firstDrawn]);
    if (!isNaN(firstRowAvg)) {
        for (let c = 0; c < firstDrawn; c++) {
            filled[c] = new Set([Math.round(firstRowAvg)]);
        }
    }

    // Extrapolate forwards from the last drawn point
    const lastRowAvg = getAvgRow(filled[lastDrawn]);
    if (!isNaN(lastRowAvg)) {
        for (let c = lastDrawn + 1; c < numCols; c++) {
            filled[c] = new Set([Math.round(lastRowAvg)]);
        }
    }

    // Interpolate between drawn points
    let lastKnownCol = firstDrawn;
    for (let c = firstDrawn + 1; c < lastDrawn; c++) {
        if (filled[c].size > 0) {
            lastKnownCol = c;
        } else {
            let nextKnownCol = c + 1;
            while (nextKnownCol < lastDrawn && filled[nextKnownCol].size === 0) { nextKnownCol++; }
            const leftRow = getAvgRow(filled[lastKnownCol]);
            const rightRow = getAvgRow(filled[nextKnownCol]);
            if (isNaN(leftRow) || isNaN(rightRow)) continue;
            const t = (c - lastKnownCol) / (nextKnownCol - lastKnownCol);
            const interpolatedRow = Math.round(leftRow + t * (rightRow - leftRow));
            filled[c] = new Set([interpolatedRow]);
        }
    }
    return filled;
}

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

function chainHasSequencedNotes(head) {
  let current = head;
  let sanity = 100;
  while (current && sanity-- > 0) {
    const toyType = current.dataset?.toy;
    if (toyType === 'loopgrid' || toyType === 'loopgrid-drum') {
      const state = current.__gridState;
      if (state?.steps && state.steps.some(Boolean)) return true;
    } else if (toyType === 'drawgrid') {
      const toy = current.__drawToy;
      if (toy) {
        if (typeof toy.hasActiveNotes === 'function') {
          if (toy.hasActiveNotes()) return true;
        } else if (typeof toy.getState === 'function') {
          try {
            const drawState = toy.getState();
            const activeCols = drawState?.nodes?.active;
            if (Array.isArray(activeCols) && activeCols.some(Boolean)) return true;
          } catch {}
        }
      }
    } else if (toyType === 'chordwheel') {
      if (current.__chordwheelHasActive) return true;
      const steps = current.__chordwheelStepStates;
      if (Array.isArray(steps) && steps.some(s => s !== -1)) return true;
    }
    const nextId = current.dataset?.nextToyId;
    if (!nextId) break;
    current = document.getElementById(nextId);
    if (!current || current === head) break;
  }
  return false;
}

/**
 * A self-contained particle system, adapted from the Bouncer toy.
 * - Particles are distributed across the entire container.
 * - They are gently pulled back to their home position.
 * - A `lineRepulse` function pushes them away from a vertical line.
 */
function createDrawGridParticles({
  getW, getH,
  count = 150,
  returnToHome = true,
  homePull = 0.008, // Increased spring force to resettle faster
  bounceOnWalls = false,
  isNonReactive = () => false,
} = {}){
  const P = [];
  const letters = [];
  const WORD = 'DRAW';
  // tuned widths; W is already wide
  const LETTER_WIDTH_RATIO = { D: 0.78, R: 0.78, A: 0.78, W: 1.18 };
  const LETTER_BASE_ALPHA = 0.2;
  const LETTER_DAMPING = 0.94;
  const LETTER_PULL_MULTIPLIER = 3.2;
  let beatGlow = 0;
  let letterFade = 1;
  let letterFadeTarget = 1;
  let letterFadeSpeed = 0.05;
  let currentDpr = 1;
  let holdOneFrame = false;
  function holdNextFrame(){ holdOneFrame = true; }
  function cancelHoldNextFrame(){ holdOneFrame = false; }
  function allowImmediateDraw(){ holdOneFrame = false; }
  const W = ()=> Math.max(1, Math.floor(getW()?getW() * currentDpr:0));
  const H = ()=> Math.max(1, Math.floor(getH()?getH() * currentDpr:0));
  let lastW = 0, lastH = 0;
  const rand = mulberry32(__drawParticlesSeed);
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const DG_CORNER_PROBE = (() => {
    if (typeof window === 'undefined') return false;
    try {
      return location.search.includes('dgprobe=1') || localStorage.getItem('DG_CORNER_PROBE') === '1';
    } catch {
      return false;
    }
  })();
  const checkNonReactive = () => {
    try {
      return typeof isNonReactive === 'function' && isNonReactive();
    } catch {
      return false;
    }
  };

  function createBaseParticle(nx = rand(), ny = rand()) {
    return {
      nx,
      ny,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      homeX: 0,
      homeY: 0,
      alpha: 0.55,
      tSince: 0,
      delay: 0,
      burst: false,
      flash: 0,
      repulsed: 0,
      isBurst: false,
    };
  }

  function layoutLetters(w, h, { resetPositions = true } = {}) {
    if (!w || !h) return;
    const freeze = checkNonReactive();
    const isUninitialized = letters.length === 0 || !Number.isFinite(letters[0]?.homeX);
    const allowReset = resetPositions && (!freeze || isUninitialized);
    const fontSize = Math.max(24, Math.min(w, h) * 0.28);
    const spacing = fontSize * 0.02;
    let totalWidth = WORD.length ? -spacing : 0;
    for (const char of WORD) {
      const ratio = LETTER_WIDTH_RATIO[char] ?? 0.7;
      totalWidth += ratio * fontSize + spacing;
    }
    const startX = (w - totalWidth) * 0.5;
    const baselineY = h * 0.5;
    while (letters.length < WORD.length) {
      letters.push({
        char: WORD[letters.length],
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        homeX: 0,
        homeY: 0,
        fontSize,
        width: 0,
        alpha: LETTER_BASE_ALPHA,
        flash: 0,
        repulsed: 0,
      });
    }
    if (letters.length > WORD.length) {
      letters.length = WORD.length;
    }
    let cursor = startX;
    for (let i = 0; i < letters.length; i++) {
      const char = WORD[i];
      const ratio = LETTER_WIDTH_RATIO[char] ?? 0.7;
      const width = ratio * fontSize;
      const homeX = cursor + width * 0.5;
      const homeY = baselineY;
      const letter = letters[i];
      letter.char = char;
      letter.fontSize = fontSize;
      letter.width = width;
      if (allowReset) {
        letter.homeX = homeX;
        letter.homeY = homeY;
      }
      if (allowReset) {
        letter.x = homeX;
        letter.y = homeY;
        letter.vx = 0;
        letter.vy = 0;
        letter.alpha = LETTER_BASE_ALPHA;
        letter.flash = 0;
        letter.repulsed = 0;
      }
      cursor += width + spacing;
    }
  }

  function assignHome(p, w, h, { resetPosition = false } = {}) {
    if (!p || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
    const safePrevW = lastW || w;
    const safePrevH = lastH || h;
    const nx = clamp01(typeof p.nx === 'number' ? p.nx : (p.x / w));
    const ny = clamp01(typeof p.ny === 'number' ? p.ny : (p.y / h));
    p.nx = nx;
    p.ny = ny;
    p.homeX = nx * w;
    p.homeY = ny * h;
    const seeded = Number.isFinite(lastW) && lastW > 0 && Number.isFinite(lastH) && lastH > 0;
    const allowReset = resetPosition && (!checkNonReactive() || !seeded);
    if (!allowReset) return;
    if (p.isBurst) {
      const scaleX = safePrevW ? w / safePrevW : 1;
      const scaleY = safePrevH ? h / safePrevH : 1;
      if (Number.isFinite(scaleX) && Number.isFinite(scaleY)) {
        p.x *= scaleX;
        p.y *= scaleY;
        p.vx *= scaleX;
        p.vy *= scaleY;
      }
      return;
    }
    p.x = p.homeX;
    p.y = p.homeY;
    p.vx = 0;
    p.vy = 0;
  }

  function refreshHomes({ resetPositions = true } = {}) {
    const w = W();
    const h = H();
    if (!w || !h) return;
    const freeze = checkNonReactive();
    const seeded = Number.isFinite(lastW) && lastW > 0 && Number.isFinite(lastH) && lastH > 0;
    const allowReset = resetPositions && (!freeze || !seeded);
    for (const p of P) {
      assignHome(p, w, h, { resetPosition: allowReset });
    }
    layoutLetters(w, h, { resetPositions: allowReset });
    lastW = w;
    lastH = h;
  }

  function onResize({ resetPositions = false } = {}) {
    if (DG_DEBUG && resetPositions) DG.warn('particles.onResize() with resetPositions=TRUE');
    refreshHomes({ resetPositions });
  }

  function snapAllToHomes() {
    if (checkNonReactive()) return;
    // Snap free particles
    for (const p of P) {
      if (Number.isFinite(p.homeX) && Number.isFinite(p.homeY)) {
        p.x = p.homeX; p.y = p.homeY;
        p.vx = 0; p.vy = 0;
      }
    }
    // Snap letter quads
    for (const L of letters) {
      if (Number.isFinite(L.homeX) && Number.isFinite(L.homeY)) {
        L.x = L.homeX; L.y = L.homeY;
        L.vx = 0; L.vy = 0;
      }
      // Keep alpha/flash as-is; we only prevent a visual drift at commit.
    }
  }

  for (let i = 0; i < count; i++) {
    P.push(createBaseParticle());
  }

  refreshHomes({ resetPositions: true });

  function onBeat(cx, cy){
    beatGlow = 1;
    const w=W(), h=H();
    const rad = Math.max(24, Math.min(w,h)*0.42);
    for (const p of P){
      const dx = p.x - cx, dy = p.y - cy;
      const d = Math.hypot(dx,dy) || 1;
      if (d < rad){
        const u = 0.25 * (1 - d/rad);
        p.vx += u * (dx/d);
        p.vy += u * (dy/d);
        p.alpha = Math.min(1, p.alpha + 0.25);
      }
    }
    for (const letter of letters) {
      letter.flash = Math.min(1, (letter.flash || 0) + 0.2);
      letter.alpha = Math.min(1, (letter.alpha ?? LETTER_BASE_ALPHA) + 0.06);
    }
  }

  function step(dt=1/60){
    if (holdOneFrame) { holdOneFrame = false; return; }
    const wcss = (typeof getW === 'function') ? getW() : 0;
    const hcss = (typeof getH === 'function') ? getH() : 0;
    if (!wcss || !hcss) return;
    const w = W(), h = H();

    if (P.length < count){
      const width = w || lastW || 1;
      const height = h || lastH || 1;
      for (let i=P.length;i<count;i++){
        const p = createBaseParticle();
        assignHome(p, width, height, { resetPosition: true });
        P.push(p);
      }
    } else if (P.length > count){
      P.length = count;
    }

    if ((w !== lastW || h !== lastH) && w && h){
      // Keep current positions; just move homes.
      refreshHomes({ resetPositions: false });
    } else if (!letters.length && w && h) {
      layoutLetters(w, h, { resetPositions: true });
    }

    const toKeep = [];
    for (const p of P){
      if (p.delay && p.delay>0){ p.delay = Math.max(0, p.delay - dt); continue; }

      if (p.repulsed > 0) {
          p.repulsed = Math.max(0, p.repulsed - 0.05); // Decay tuned for single-hit sweep
      }

      if (p.isBurst) {
          if (p.ttl) p.ttl--;
          if (p.ttl <= 0) {
              continue; // Particle dies
          }
      }

      p.tSince += dt;
      p.vx *= 0.94; p.vy *= 0.94; // Increased damping to resettle faster
      // Burst particles just fly and die, no "return to home"
      if (returnToHome && !p.isBurst && p.repulsed <= 0 && !checkNonReactive()){
        const hx = p.homeX - p.x, hy = p.homeY - p.y;
        p.vx += homePull*hx; p.vy += homePull*hy;
      }
      p.x += p.vx; p.y += p.vy;

      if (p.isBurst) {
          if (p.x < -10 || p.x >= w + 10 || p.y < -10 || p.y >= h + 10) {
              continue; // Burst particles die if they go off-screen
          }
      } else {
          // If a regular particle is pushed far off-screen, respawn it at its
          // home position with a fade-in effect. This avoids the jarring "rush back".
          if (p.x < -10 || p.x >= w + 10 || p.y < -10 || p.y >= h + 10) {
              p.x = p.homeX; p.y = p.homeY;
              p.vx = 0; p.vy = 0;
              p.alpha = 0; // Start fade-in
              p.repulsed = 0; // Reset repulsion state
          }
      }

      p.alpha += (0.55 - p.alpha) * 0.05;
      p.flash = Math.max(0, p.flash - 0.05);
      toKeep.push(p);
    }
    if (toKeep.length !== P.length) {
        P.length = 0;
        Array.prototype.push.apply(P, toKeep);
    }

    if (letters.length) {
      const pull = Math.max(0.004, homePull) * LETTER_PULL_MULTIPLIER;
      for (const letter of letters) {
        if (letter.repulsed > 0) {
          letter.repulsed = Math.max(0, letter.repulsed - 0.04);
        }
        letter.flash = Math.max(0, (letter.flash || 0) - 0.01);
        letter.vx *= LETTER_DAMPING;
        letter.vy *= LETTER_DAMPING;
        if (!checkNonReactive()) {
          letter.vx += (letter.homeX - letter.x) * pull;
          letter.vy += (letter.homeY - letter.y) * pull;
        }
        letter.x += letter.vx;
        letter.y += letter.vy;
        letter.alpha = letter.alpha ?? LETTER_BASE_ALPHA;
        letter.alpha += (LETTER_BASE_ALPHA - letter.alpha) * 0.1;
      }
    }

    if (Math.abs(letterFade - letterFadeTarget) > 0.0001) {
      const delta = (letterFadeTarget - letterFade) * letterFadeSpeed;
      letterFade += delta;
      if (Math.abs(letterFade - letterFadeTarget) < 0.001) {
        letterFade = letterFadeTarget;
      }
    }
  }

  function draw(ctx, zoomGestureActive = false){
    DG_particlesRectsDrawn = 0;
    DG_lettersDrawn = 0;
    if (!ctx) return;
    const cssWidth = typeof getW === 'function' ? getW() : 0;
    const cssHeight = typeof getH === 'function' ? getH() : 0;
    if (!cssWidth || !cssHeight) { return; }
    if (DG_CORNER_PROBE && ctx && cssWidth && cssHeight) {
      ctx.save(); ctx.globalAlpha = 1; ctx.fillStyle = '#00ffff';
      ctx.fillRect(cssWidth - 3, 0, 3, 3);
      ctx.restore();
    }
    withIdentity(ctx, () => {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      if (beatGlow>0){ ctx.globalAlpha = Math.min(0.6, beatGlow*0.6); ctx.fillStyle='rgba(120,160,255,0.5)'; ctx.fillRect(0,0,W(),H()); ctx.globalAlpha=1; beatGlow *= 0.88; }
      for (const p of P){
        const sp = Math.hypot(p.vx, p.vy);
        const spN = Math.max(0, Math.min(1, sp / 5));
        const fastBias = Math.pow(spN, 1.25);
        const baseA = Math.max(0.08, Math.min(1, p.alpha));
        const boost = 0.80 * fastBias;
        const flashBoost = (p.flash || 0) * 0.9;
        ctx.globalAlpha = Math.min(1, baseA + boost + flashBoost);

        let baseR, baseG, baseB;
        if (p.color === 'pink') {
            baseR=255; baseG=105; baseB=180; // Hot pink
        } else {
            baseR=143; baseG=168; baseB=255; // Default blue
        }

        const speedMix = Math.min(0.9, Math.max(0, Math.pow(spN, 1.4)));
        const flashMix = p.flash || 0;
        const mix = Math.max(speedMix, flashMix);
        const r = Math.round(baseR + (255 - baseR) * mix);
        const g = Math.round(baseG + (255 - baseG) * mix);
        const b = Math.round(baseB + (255 - baseB) * mix);
        ctx.fillStyle = `rgb(${r},${g},${b})`;

        const baseSize = 1.5;
        const size = Math.max(0.75, baseSize);
        const x = (p.x | 0) - size / 2;
        const y = (p.y | 0) - size / 2;
        ctx.fillRect(x, y, size, size);
        DG_particlesRectsDrawn++;
      }
      ctx.restore();

      if (letters.length) {
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const letter of letters) {
          const flashBoost = Math.min(1, letter.flash || 0);
          const alpha = Math.min(1, (letter.alpha ?? LETTER_BASE_ALPHA) + flashBoost * 0.8);
          ctx.fillStyle = 'rgb(80,120,180)';
          const finalAlpha = Math.min(1, alpha * letterFade);
          if (finalAlpha <= 0.001) {
            continue;
          }
          ctx.globalAlpha = finalAlpha;
          ctx.font = `700 ${letter.fontSize}px 'Poppins', 'Helvetica Neue', sans-serif`;
          ctx.fillText(letter.char, letter.x, letter.y);
          DG_lettersDrawn++;
        }
        ctx.restore();
      }
    });
    dgf('draw', {
      size: { cssW: cssWidth, cssH: cssHeight, dpr: currentDpr },
      parts: DG_particlesRectsDrawn,
      letters: DG_lettersDrawn
    });
  }

  function lineRepulse(x, width=40, strength=1){
    const w=W(); const h=H();
    const half = width*0.5;
    for (const p of P){
      const dx = p.x - x;
      if (Math.abs(dx) <= half && p.repulsed <= 0.35){
        const s = (dx===0? (Math.random()<0.5?-1:1) : Math.sign(dx));
        const fall = 1 - Math.abs(dx)/half;
        const jitter = 0.9 + Math.random()*0.35;
        const rawForce = Math.max(0, fall) * strength * 3.45 * jitter;
        const k = Math.min(rawForce, 1.6);
        const vyJitter = (Math.random()*2 - 1) * k * 0.24;
        p.vx += s * k * 1.15;
        p.vy += vyJitter;
        p.alpha = Math.min(1, p.alpha + 0.85);
        p.flash = 1.0;
        p.repulsed = 1.0;
      }
    }
    for (const letter of letters) {
      const dx = letter.x - x;
      if (Math.abs(dx) <= half && letter.repulsed <= 0.35) {
        const s = (dx===0? (Math.random()<0.5?-1:1) : Math.sign(dx));
        const fall = 1 - Math.abs(dx)/half;
        const jitter = 0.9 + Math.random() * 0.2;
        const rawForce = Math.max(0, fall) * strength * 1.65 * jitter;
        const k = Math.min(rawForce, 1.9);
        const basePush = k * 1.75 + 0.28;
        const directional = s * k * 0.6;
        const horizontal = basePush + directional;
        const vyJitter = (Math.random()*2 - 1) * k * 0.32;
        letter.vx += horizontal;
        letter.vy += vyJitter;
        letter.alpha = Math.min(1, (letter.alpha ?? LETTER_BASE_ALPHA) + 0.18);
        letter.flash = Math.min(1, (letter.flash || 0) + 0.9);
        letter.repulsed = 1;
      }
    }
  }

  function drawingDisturb(disturbX, disturbY, radius = 30, strength = 0.5) {
    for (const p of P) {
        const dx = p.x - disturbX;
        const dy = p.y - disturbY;
        const distSq = dx * dx + dy * dy;
        if (distSq < radius * radius) {
            const dist = Math.sqrt(distSq) || 1;
            const kick = strength * (1 - dist / radius);
            // Push away from the point
            p.vx += (dx / dist) * kick;
            p.vy += (dy / dist) * kick;
            p.alpha = Math.min(1, p.alpha + 0.5);
            p.flash = Math.max(p.flash, 0.7);
        }
    }
    for (const letter of letters) {
        const dx = letter.x - disturbX;
        const dy = letter.y - disturbY;
        const distSq = dx * dx + dy * dy;
        if (distSq < radius * radius) {
            const dist = Math.sqrt(distSq) || 1;
            const rawKick = strength * 1.0 * (1 - dist / radius);
            const kick = Math.min(rawKick, 1.05);
            const ux = dx / dist;
            const uy = dy / dist;
            letter.vx += ux * kick;
            letter.vy += uy * kick;
            letter.alpha = Math.min(1, (letter.alpha ?? LETTER_BASE_ALPHA) + 0.16);
            letter.flash = Math.max(letter.flash || 0, 0.55);
            letter.repulsed = Math.min(1, letter.repulsed + 0.75);
        }
    }
  }

  function pointBurst(x, y, countBurst = 30, speed = 3.0, color = 'pink') {
    const width = Math.max(1, W());
    const height = Math.max(1, H());
    for (let i = 0; i < countBurst; i++) {
        const angle = Math.random() * Math.PI * 2;
        const p = {
            x, y,
            vx: Math.cos(angle) * speed * (0.5 + Math.random() * 0.5),
            vy: Math.sin(angle) * speed * (0.5 + Math.random() * 0.5),
            homeX: x,
            homeY: y,
            alpha: 1.0,
            flash: 1.0,
            ttl: 45, // frames, ~0.75s
            color: color,
            isBurst: true,
            repulsed: 0, // Not used by bursts, but good to initialize
        };
        p.nx = clamp01(width ? p.homeX / width : 0);
        p.ny = clamp01(height ? p.homeY / height : 0);
        P.push(p);
    }
  }

function ringBurst(x, y, radius, countBurst = 28, speed = 2.4, color = 'pink') {
  const width = Math.max(1, W());
  const height = Math.max(1, H());
  for (let i = 0; i < countBurst; i++) {
    const theta = (i / countBurst) * Math.PI * 2 + (Math.random() * 0.15);
    const px = x + Math.cos(theta) * radius;
    const py = y + Math.sin(theta) * radius;
    const outward = speed * (0.65 + Math.random() * 0.55);
    const jitterA = (Math.random() - 0.5) * 0.35;
    const vx = Math.cos(theta + jitterA) * outward;
    const vy = Math.sin(theta + jitterA) * outward;
    const burst = {
      x: px, y: py, vx, vy,
      homeX: px, homeY: py,
      alpha: 1.0, flash: 1.0,
      ttl: 45, color, isBurst: true, repulsed: 0
    };
    burst.nx = clamp01(width ? burst.homeX / width : 0);
    burst.ny = clamp01(height ? burst.homeY / height : 0);
    P.push(burst);
  }
}

  function setLetterFadeTarget(target, speed = 0.05, immediate = false) {
    letterFadeTarget = Math.max(0, Math.min(1, target));
    letterFadeSpeed = Math.max(0.0001, speed);
    if (immediate) {
      letterFade = letterFadeTarget;
    }
  }

  function fadeLettersOut(speed = 0.08) {
    setLetterFadeTarget(0, speed);
  }

  function fadeLettersIn(speed = 0.06) {
    setLetterFadeTarget(1, speed);
  }

  function setDpr(newDpr) {
    if (typeof zoomGestureActive !== 'undefined' && zoomGestureActive) return;
    if (newDpr === currentDpr) return;
    currentDpr = newDpr;
    refreshHomes({ resetPositions: true });
  }

  function __peek(){ return P && P.length ? P[0] : null; }

  function scalePositions(scaleX, scaleY) {
    if (typeof zoomGestureActive !== 'undefined' && zoomGestureActive) return;
    if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY)) return;
    const newW = (Number.isFinite(lastW) && lastW > 0) ? lastW * scaleX : lastW;
    const newH = (Number.isFinite(lastH) && lastH > 0) ? lastH * scaleY : lastH;
    const safeW = newW && newW > 0 ? newW : (lastW || 1);
    const safeH = newH && newH > 0 ? newH : (lastH || 1);

    for (const p of P) {
      p.x *= scaleX;
      p.y *= scaleY;
      p.vx *= scaleX;
      p.vy *= scaleY;
      p.homeX *= scaleX;
      p.homeY *= scaleY;
      if (!p.isBurst) {
        p.nx = clamp01(safeW ? p.homeX / safeW : p.nx);
        p.ny = clamp01(safeH ? p.homeY / safeH : p.ny);
      }
    }
    for (const letter of letters) {
      letter.x *= scaleX;
      letter.y *= scaleY;
      letter.homeX *= scaleX;
      letter.homeY *= scaleY;
      letter.vx *= scaleX;
      letter.vy *= scaleY;
    }
    if (Number.isFinite(newW) && newW > 0) {
      lastW = newW;
    }
    if (Number.isFinite(newH) && newH > 0) {
      lastH = newH;
    }
  }

  return { step, draw, onBeat, lineRepulse, drawingDisturb, pointBurst, ringBurst, fadeLettersOut, fadeLettersIn, setLetterFadeTarget, setDpr, scalePositions, onResize, snapAllToHomes, holdNextFrame, cancelHoldNextFrame, allowImmediateDraw };
}

let currentMap = null; // Store the current node map {active, nodes, disabled}
let currentCols = 0;
let nodeCoordsForHitTest = []; // For draggable nodes

function normalizeMapColumns(map, cols) {
  // Ensure consistent shape for player & renderers
  if (!map) return { active: Array(cols).fill(false), nodes: Array.from({length: cols}, () => new Set()), disabled: Array.from({length: cols}, () => new Set()) };
  if (!Array.isArray(map.active)) map.active = Array(cols).fill(false);
  if (!Array.isArray(map.nodes)) map.nodes = Array.from({length: cols}, () => new Set());
  if (!Array.isArray(map.disabled)) map.disabled = Array.from({length: cols}, () => new Set());
  // Fill any sparse holes with Sets
  for (let i=0;i<cols;i++){
    if (!(map.nodes[i] instanceof Set)) map.nodes[i] = new Set(map.nodes[i] || []);
    if (!(map.disabled[i] instanceof Set)) map.disabled[i] = new Set(map.disabled[i] || []);
    if (typeof map.active[i] !== 'boolean') map.active[i] = !!map.active[i];
  }
  return map;
}

export function createDrawGrid(panel, { cols: initialCols = 8, rows = 12, toyId, bpm = 120 } = {}) {
  // The init script now guarantees the panel is a valid HTMLElement with the correct dataset.
  // The .toy-body is now guaranteed to exist by initToyUI, which runs first.
  const body = panel.querySelector('.toy-body');

  if (!body) {
    return;
  }
  body.style.position = 'relative';

  const resolvedToyId = toyId || panel.dataset.toyid || panel.dataset.toy || panel.id || panel.dataset.toyName || 'drawgrid';
  const storageKey = resolvedToyId ? `drawgrid:saved:${resolvedToyId}` : null;
  const PERSIST_DEBOUNCE_MS = 150;
  let persistStateTimer = null;
  let persistedStateCache = null;
  let fallbackHydrationState = null;
  let overlayCamState = getFrameStartState?.() || { scale: 1, x: 0, y: 0 };
  let unsubscribeFrameStart = null;

  function persistStateNow() {
    if (!storageKey) return;
    if (persistStateTimer) {
      clearTimeout(persistStateTimer);
      persistStateTimer = null;
    }
    try {
      const state = captureState();
      persistedStateCache = state;
      try {
        fallbackHydrationState = JSON.parse(JSON.stringify(state));
      } catch {
        fallbackHydrationState = state;
      }
      const payload = { v: 1, state };
      localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch (err) {
      if (DG_DEBUG) DG.warn('persistState failed', err);
    }
  }

  function schedulePersistState() {
    if (!storageKey) return;
    if (persistStateTimer) clearTimeout(persistStateTimer);
    persistStateTimer = setTimeout(() => {
      persistStateTimer = null;
      persistStateNow();
    }, PERSIST_DEBOUNCE_MS);
  }

  function loadPersistedState() {
    if (!storageKey) return null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const state = parsed.state || parsed;
        if (state && typeof state === 'object') {
          persistedStateCache = state;
          try {
            fallbackHydrationState = JSON.parse(JSON.stringify(state));
          } catch {
            fallbackHydrationState = state;
          }
          return state;
        }
      }
    } catch (err) {
      if (DG_DEBUG) DG.warn('loadPersistedState failed', err);
    }
    return null;
  }

  if (storageKey && typeof window !== 'undefined') {
    try { window.addEventListener('beforeunload', persistStateNow); } catch {}
  }

  function getZoomScale(el) {
    // Compare transformed rect to layout box to infer CSS transform scale.
    // Fallback to 1 to remain stable if values are 0 or unavailable.
    if (!el) return { x: 1, y: 1 };
    const rect = el.getBoundingClientRect?.();
    const cw = el.clientWidth || 0;
    const ch = el.clientHeight || 0;
    if (!rect || cw <= 0 || ch <= 0) return { x: 1, y: 1 };
    const inferredX = rect.width  / cw;
    const inferredY = rect.height / ch;
    const cam = typeof getFrameStartState === 'function' ? getFrameStartState() : null;
    const committedScale = Number.isFinite(cam?.scale) ? cam.scale :
      (Number.isFinite(boardScale) ? boardScale : NaN);
    const sx = Number.isFinite(committedScale) ? committedScale : inferredX;
    const sy = Number.isFinite(committedScale) ? committedScale : inferredY;
    const clampedX = Math.max(0.1, Math.min(4, sx));
    const clampedY = Math.max(0.1, Math.min(4, sy));
    return {
      x: (isFinite(clampedX) ? clampedX : 1),
      y: (isFinite(clampedY) ? clampedY : 1)
    };
  }

  // Eraser cursor
  const eraserCursor = document.createElement('div');
  eraserCursor.className = 'drawgrid-eraser-cursor';
  body.appendChild(eraserCursor);

  // Layers (z-index order)
  const particleCanvas = document.createElement('canvas'); particleCanvas.setAttribute('data-role', 'drawgrid-particles');
  const grid = document.createElement('canvas'); grid.setAttribute('data-role','drawgrid-grid');
  const paint = document.createElement('canvas'); paint.setAttribute('data-role','drawgrid-paint');
  const nodesCanvas = document.createElement('canvas'); nodesCanvas.setAttribute('data-role', 'drawgrid-nodes');
  const flashCanvas = document.createElement('canvas'); flashCanvas.setAttribute('data-role', 'drawgrid-flash');
  const ghostCanvas = document.createElement('canvas'); ghostCanvas.setAttribute('data-role','drawgrid-ghost');
  const tutorialCanvas = document.createElement('canvas'); tutorialCanvas.setAttribute('data-role', 'drawgrid-tutorial-highlight');
  Object.assign(grid.style,         { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', zIndex: 0 });
  Object.assign(paint.style,        { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', zIndex: 1 });
  Object.assign(particleCanvas.style, { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', zIndex: 2, pointerEvents: 'none' });
  Object.assign(ghostCanvas.style, { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', zIndex: 3, pointerEvents: 'none' });
  Object.assign(flashCanvas.style,  { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', zIndex: 4, pointerEvents: 'none' });
  Object.assign(nodesCanvas.style,  { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', zIndex: 5, pointerEvents: 'none' });
  Object.assign(tutorialCanvas.style, { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', zIndex: 6, pointerEvents: 'none' });
  body.appendChild(grid);
  body.appendChild(paint);
  body.appendChild(particleCanvas);
  body.appendChild(ghostCanvas);
  body.appendChild(flashCanvas);
  body.appendChild(nodesCanvas);
  body.appendChild(tutorialCanvas);

  
  // debugCanvas.setAttribute('data-role','drawgrid-debug');
  // Object.assign(debugCanvas.style, {
  //   position: 'absolute',
  //   inset: '0',
  //   width: '100%',
  //   height: '100%',
  //   display: DG_DEBUG ? 'block' : 'none',
  //   zIndex: 9999,
  //   pointerEvents: 'none',
  // });
  // body.appendChild(debugCanvas);
  const debugCanvas = null;
  const debugCtx = null;

  function drawDebugHUD(extraLines = []) { /* no-op */ }

  const wrap = document.createElement('div');
  wrap.className = 'drawgrid-size-wrap';
  wrap.style.position = 'relative';
  wrap.style.width = '100%';
  wrap.style.height = '100%';
  wrap.style.overflow = 'hidden';

  // Move all existing elements from body into the new wrapper
  [...body.childNodes].forEach(node => wrap.appendChild(node));
  
  body.appendChild(wrap);

  const particleFrontCtx = particleCanvas.getContext('2d');
  const particleBackCanvas = document.createElement('canvas');
  const particleBackCtx = particleBackCanvas.getContext('2d');
  let particleCtx = particleFrontCtx;

  const gridFrontCtx = grid.getContext('2d', { willReadFrequently: true });
  const gridBackCanvas = document.createElement('canvas');
  const gridBackCtx = gridBackCanvas.getContext('2d', { willReadFrequently: true });
  let gctx = gridFrontCtx;

  const frontCanvas = paint;
  frontCanvas.classList.add('toy-canvas');
  const pctx = frontCanvas.getContext('2d', { willReadFrequently: true });
  const backCanvas = document.createElement('canvas');
  const backCtx = backCanvas.getContext('2d', { alpha: true, desynchronized: true });

  const nodesFrontCtx = nodesCanvas.getContext('2d', { willReadFrequently: true });
  const nodesBackCanvas = document.createElement('canvas');
  const nodesBackCtx = nodesBackCanvas.getContext('2d', { willReadFrequently: true });
  let nctx = nodesFrontCtx;

  const flashFrontCtx = flashCanvas.getContext('2d', { willReadFrequently: true });
  const flashBackCanvas = document.createElement('canvas');
  const flashBackCtx = flashBackCanvas.getContext('2d', { willReadFrequently: true });
  let fctx = flashFrontCtx;

  const ghostFrontCtx = ghostCanvas.getContext('2d');
  const ghostBackCanvas = document.createElement('canvas');
  const ghostBackCtx = ghostBackCanvas.getContext('2d');
  let ghostCtx = ghostFrontCtx;

  const tutorialFrontCtx = tutorialCanvas.getContext('2d');
  const tutorialBackCanvas = document.createElement('canvas');
  const tutorialBackCtx = tutorialBackCanvas.getContext('2d');
  let tutorialCtx = tutorialFrontCtx;

  function resizeSurfacesFor(nextCssW, nextCssH, nextDpr) {
    const dpr = Math.max(1, Number.isFinite(nextDpr) ? nextDpr : (window.devicePixelRatio || 1));
    paintDpr = Math.max(1, Math.min(dpr, 3));
    const targetW = Math.max(1, Math.round(nextCssW * paintDpr));
    const targetH = Math.max(1, Math.round(nextCssH * paintDpr));
    const resize = (canvas) => {
      if (!canvas) return;
      if (canvas.width === targetW && canvas.height === targetH) return;
      canvas.width = targetW;
      canvas.height = targetH;
    };
    resize(gridFrontCtx?.canvas);
    resize(gridBackCanvas);
    resize(particleFrontCtx?.canvas);
    resize(particleBackCanvas);
    resize(nodesFrontCtx?.canvas);
    resize(nodesBackCanvas);
    resize(flashFrontCtx?.canvas);
    resize(flashBackCanvas);
    resize(ghostFrontCtx?.canvas);
    resize(ghostBackCanvas);
    resize(tutorialFrontCtx?.canvas);
    resize(tutorialBackCanvas);
    resize(frontCanvas);
    resize(backCanvas);
    updatePaintBackingStores({ force: true, target: 'both' });
    try { ensureBackVisualsFreshFromFront?.(); } catch {}
  }

  let __forceSwipeVisible = null; // null=auto, true/false=forced by tutorial
  let __swapRAF = null;
  let __dgSkipSwapsDuringDrag = false;

  // helper: request a single swap this frame
  function requestFrontSwap(andThen) {
    if (__swapRAF || __dgSkipSwapsDuringDrag) {
      if (DG_SWAP_DEBUG && __dgSkipSwapsDuringDrag) dgs('skip', 'live drag in progress');
      return;
    }
    const mark = `DG.swapRAF@${performance.now().toFixed(2)}`;
    if (DG_SWAP_DEBUG) dgs('request', { usingBackBuffers, pendingPaintSwap, pendingSwap, zoomCommitPhase, zoomGestureActive });
    __swapRAF = requestAnimationFrame(() => {
      __swapRAF = null;
      if (DG_SWAP_DEBUG) console.time(mark);
      // NEW: if we're currently drawing to FRONT, make back visuals fresh to prevent a blank frame.
      if (!usingBackBuffers) { ensureBackVisualsFreshFromFront(); if (DG_SWAP_DEBUG) dgs('ensureBackVisualsFreshFromFront()'); }

      if (pendingPaintSwap) { swapBackToFront(); if (DG_SWAP_DEBUG) dgs('swapBackToFront()'); if (DG_DEBUG) drawDebugHUD(['swapBackToFront()']); pendingPaintSwap = false; }
      if (typeof flushVisualBackBuffersToFront === 'function') {
        flushVisualBackBuffersToFront(); if (DG_SWAP_DEBUG) dgs('flushVisualBackBuffersToFront()'); if (DG_DEBUG) drawDebugHUD(['flushVisualBackBuffersToFront()']);
      }
      if (DG_SWAP_DEBUG) console.timeEnd(mark);
      if (DG_DEBUG) drawDebugHUD(['swap: FRONT painted']);
      if (andThen) {
        requestAnimationFrame(andThen);
      }
    });
  }
  let isRestoring = false;

  // Double-buffer + DPR tracking
  let pendingPaintSwap = false;
    let paintDpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
  let zoomCommitPhase = 'idle';

  // State
  let cols = initialCols;
  currentCols = cols;
  function emitDrawgridUpdate({ activityOnly = false, steps } = {}) {
    const stepCount = Number.isFinite(steps)
      ? steps | 0
      : (Number.isFinite(currentCols) && currentCols > 0
          ? currentCols | 0
          : (currentMap?.nodes?.length ?? 0));
    currentCols = stepCount;
    currentMap = normalizeMapColumns(currentMap, stepCount);
    if (Array.isArray(currentMap.nodes) && Array.isArray(currentMap.active)) {
      for (let c = 0; c < stepCount; c++) {
        const nodes = currentMap.nodes[c] || new Set();
        const dis = currentMap.disabled?.[c] || new Set();
        let anyOn = false;
        if (nodes.size > 0) {
          for (const r of nodes) {
            if (!dis.has(r)) { anyOn = true; break; }
          }
        }
        currentMap.active[c] = anyOn;
      }
    }
    DG.log('emit update', {
      steps: stepCount,
      activeCount: currentMap.active?.filter(Boolean).length,
      nonEmptyCols: currentMap.nodes?.reduce((n, s)=>n + (s && s.size ? 1 : 0), 0)
    });
    panel.dispatchEvent(new CustomEvent('drawgrid:update', {
      detail: { map: currentMap, steps: stepCount, activityOnly }
    }));
    if (!activityOnly) schedulePersistState();
  }
  let cssW = 0, cssH = 0, cw = 0, ch = 0, topPad = 0;
  let lastBoardScale = 1;
  let boardScale = 1;
  let zoomMode = 'idle';
  let pendingZoomResnap = false;
  const dgViewport = createParticleViewport(() => ({ w: cssW, h: cssH }));
  const dgMap = dgViewport.map;
let __zoomActive = false; // true while pinch/wheel gesture is in progress
const dgNonReactive = () => {
  const ov = (typeof dgViewport?.isNonReactive === 'function') && dgViewport.isNonReactive();
  return ov || __zoomActive;
};
  // Debug helper for Overview tuning
  const DG_OV_DBG = !!(location.search.includes('dgov=1') || localStorage.getItem('DG_OV_DBG') === '1');
  function ovlog(...a){ try { if (DG_OV_DBG) console.debug('[DG][overview]', ...a); } catch {} }

  // Force a front swap after the next successful draw - used on boot and overview toggles.
  let __dgFrontSwapNextDraw = true;
  // Draw a tiny corner probe (debug only) so we can see the visible canvas is active.
  const DG_CORNER_PROBE = !!(location.search.includes('dgprobe=1') || localStorage.getItem('DG_CORNER_PROBE') === '1');

function ensureSizeReady({ force = false } = {}) {
  if (!force && __zoomActive) return true;
  const nowTs = (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();
  if (!force && __dgInCommitWindow(nowTs)) {
    return true;
  }
  const host = wrap || body || frontCanvas?.parentElement;
  let w = host ? host.offsetWidth || host.clientWidth || 0 : 0;
  let h = host ? host.offsetHeight || host.clientHeight || 0 : 0;
  if ((!w || !h) && host) {
    const measured = measureCSSSize(host);
    w = measured.w;
    h = measured.h;
  }
  if (!w || !h) return false;
  w = Math.max(1, w);
  h = Math.max(1, h);

  const changed = force || Math.abs(w - cssW) > 0.5 || Math.abs(h - cssH) > 0.5;
  if (changed) {
    cssW = w; cssH = h;
    progressMeasureW = cssW; progressMeasureH = cssH;

    try { dgViewport?.refreshSize?.({ snap: true }); } catch {}

    resizeSurfacesFor(cssW, cssH, window.devicePixelRatio || paintDpr || 1);

    __dgFrontSwapNextDraw = true;
    dglog('ensureSizeReady:update', { cssW, cssH });
  }
  return true;
}

  function wireOverviewTransitions(panelEl) {
    if (!panelEl) return;
    panelEl.addEventListener('overview:precommit', () => {
      try {
        particles?.holdNextFrame?.();
      } catch {}
    });

    panelEl.addEventListener('overview:commit', () => {
      try {
        const rect = panelEl.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        cssW = Math.max(1, rect.width || cssW);
        cssH = Math.max(1, rect.height || cssH);
        progressMeasureW = cssW;
        progressMeasureH = cssH;
        try { dgViewport?.refreshSize?.({ snap: true }); } catch {}
        resizeSurfacesFor(cssW, cssH, dpr);
        layout(true);
        particles?.cancelHoldNextFrame?.();
        particles?.allowImmediateDraw?.();
        __dgFrontSwapNextDraw = true;
        requestFrontSwap?.();
      } catch (err) {
        dglog('overview:commit:error', String((err && err.message) || err));
      }
    });
  }

  // Zoom signal hygiene
  let lastCommittedScale = boardScale;
  let drawing=false, erasing=false;
  // The `strokes` array is removed. The paint canvas is now the source of truth.
  let cur = null;
  let curErase = null;
  let strokes = []; // Store all completed stroke objects
  let eraseStrokes = []; // Store all completed erase strokes
  let cellFlashes = []; // For flashing grid squares on note play
  let noteToggleEffects = []; // For tap feedback animations
  let nodeGroupMap = []; // Per-column Map(row -> groupId or [groupIds]) to avoid cross-line connections and track z-order
  let nextDrawTarget = null; // Can be 1 or 2. Determines the next special line.
  let flashes = new Float32Array(cols);
  let playheadCol = -1;
  let localLastPhase = 0; // For chain-active race condition
  let erasedTargetsThisDrag = new Set(); // For eraser hit-testing of specific nodes (currently unused)
  let manualOverrides = Array.from({ length: initialCols }, () => new Set()); // per-column node rows overridden by drags
  let draggedNode = null; // { col, row, group? }
  let pendingNodeTap = null; // potential tap for toggle
  let pendingActiveMask = null; // preserve active columns across resolution changes
  let dragScaleHighlightCol = null; // column index currently showing pentatonic hints
  let eraseButton = null; // Reference to header erase button
  let previewGid = null; // 1 or 2 while drawing a special line preview
  let persistentDisabled = Array.from({ length: initialCols }, () => new Set()); // survives view changes
  let btnLine1, btnLine2;
  let autoTune = true; // Default to on
  // Proportional safe area so the grid keeps the same relative size at any zoom.
  // Start with ~5% of the smaller dimension; clamp to a sensible px range.
  const SAFE_AREA_FRACTION = 0.05;
  let gridArea = { x: 0, y: 0, w: 0, h: 0 };
  let tutorialHighlightMode = 'none'; // 'none' | 'notes' | 'drag'
  let tutorialHighlightRaf = null;
  let usingBackBuffers = false;
  let pendingSwap = false;
  let pendingWrapSize = null;
  let pendingEraserSize = null;
  let progressMeasureW = 0;
  let progressMeasureH = 0;
  const PROGRESS_SIZE_THRESHOLD = 4;
  const PROGRESS_AREA_THRESHOLD = 64 * 64;

  const initialSize = getLayoutSize();
  if (initialSize.w && initialSize.h) {
    cssW = Math.max(1, initialSize.w);
    cssH = Math.max(1, initialSize.h);
    progressMeasureW = cssW;
    progressMeasureH = cssH;
    resizeSurfacesFor(cssW, cssH, paintDpr);
  }

  ensureSizeReady({ force: true });
  try { refreshHomes({ resetPositions: true }); } catch {}
  try {
    [grid, paint, particleCanvas, ghostCanvas, flashCanvas, nodesCanvas, tutorialCanvas]
      .filter(Boolean)
      .forEach((cv) => {
        const s = cv.style || {};
        if (s.visibility === 'hidden') s.visibility = '';
        if (s.opacity === '0') s.opacity = '';
        if (s.display === 'none') s.display = '';
      });
  } catch {}

  const particles = createDrawGridParticles({
    getW: () => cssW,
    getH: () => cssH,
    count: 600,
    homePull: 0.002,
    isNonReactive: dgNonReactive,
  });
  try {
    if (particles && typeof particles.onResize === 'function') {
      particles.onResize({ resetPositions: true });
    }
    if (DG_CORNER_PROBE) {
      const ctx = particleCanvas?.getContext?.('2d');
      if (ctx && cssW && cssH) {
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ff00ff';
        ctx.fillRect(0, 0, 3, 3);
        ctx.restore();
      }
    }
    if (typeof requestFrontSwap === 'function') {
      requestFrontSwap();
    }
  } catch {}

  wireOverviewTransitions(panel);

  (function wireOverviewTransitionForDrawgrid(){
    try {
      window.addEventListener('overview:transition', (e) => {
        const active = !!e?.detail?.active;
        const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
          ? performance.now()
          : Date.now();
        const deferUntil = now + 180;
        __dgDeferUntilTs = Math.max(__dgDeferUntilTs || 0, deferUntil);
        __dgStableFramesAfterCommit = 0;
        __dgNeedsUIRefresh = true;
        dglog('overview:transition', { active });
        try { dgViewport?.refreshSize?.({ snap: true }); } catch {}
        // Don't re-home during overview toggles -- avoids visible lerp.
        // refreshHomes({ resetPositions: false });
        __dgFrontSwapNextDraw = true;
        try {
          if (typeof ovlog === 'function') ovlog('overview:transition handled', { active, cssW, cssH });
        } catch {}
      }, { passive: true });
    } catch {}
  })();

if (typeof onFrameStart === 'function') {
  unsubscribeFrameStart = onFrameStart((camState) => {
    overlayCamState = camState; // keep for HUD/other use
  });
}

  const clearTutorialHighlight = () => {
    if (!tutorialCtx) return;
    withIdentity(tutorialCtx, () => {
      const tutorialSurface = getActiveTutorialCanvas();
      if (!tutorialSurface) return;
      tutorialCtx.clearRect(0, 0, tutorialSurface.width, tutorialSurface.height);
    });
  };

  const renderTutorialHighlight = () => {
    if (!tutorialCtx) return;
    const tutorialSurface = getActiveTutorialCanvas();
    withIdentity(tutorialCtx, () => {
      tutorialCtx.clearRect(0, 0, tutorialSurface.width, tutorialSurface.height);
      if (tutorialHighlightMode === 'none' || !nodeCoordsForHitTest?.length) return;
      const baseRadius = Math.max(6, Math.min(cw || 0, ch || 0) * 0.55);
      tutorialCtx.save();
      tutorialCtx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      tutorialCtx.shadowBlur = Math.max(4, baseRadius * 0.3);
      const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now();
      const pulsePhase = (now / 480) % (Math.PI * 2);
      const pulseScale = 1 + Math.sin(pulsePhase) * 0.24;
      let highlightNodes = nodeCoordsForHitTest;
      let anchorNode = null;
      if (tutorialHighlightMode === 'drag') {
        const effectiveWidth = (gridArea.w && gridArea.w > 0) ? gridArea.w : (cw * cols);
        const effectiveHeight = (gridArea.h && gridArea.h > 0) ? gridArea.h : (ch * rows);
        const fallbackX = gridArea.x + (effectiveWidth / 2);
        const fallbackY = gridArea.y + topPad + Math.max(0, effectiveHeight - topPad) / 2;
        const activeNode = nodeCoordsForHitTest.find(node => !node?.disabled);
        anchorNode = activeNode || (nodeCoordsForHitTest.length ? nodeCoordsForHitTest[0] : { x: fallbackX, y: fallbackY });
        highlightNodes = [anchorNode];
      }

      highlightNodes.forEach((node) => {
        if (!node) return;
        tutorialCtx.globalAlpha = node.disabled ? 0.45 : 1;
        tutorialCtx.lineWidth = Math.max(2, baseRadius * 0.22);
        tutorialCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        tutorialCtx.beginPath();
        tutorialCtx.arc(node.x, node.y, baseRadius * pulseScale, 0, Math.PI * 2);
        tutorialCtx.stroke();
      });

      if (tutorialHighlightMode === 'drag' && anchorNode) {
        const bob = Math.sin(now / 420) * Math.min(12, ch * 0.35);
        const arrowColor = 'rgba(148, 181, 255, 0.92)';
        const arrowWidth = Math.max(10, Math.min(cw, ch) * 0.45);
        const arrowHeight = arrowWidth * 1.25;

        const drawArrow = (x, y, direction) => {
          tutorialCtx.beginPath();
          if (direction < 0) {
            tutorialCtx.moveTo(x, y);
            tutorialCtx.lineTo(x - arrowWidth * 0.5, y + arrowHeight);
            tutorialCtx.lineTo(x + arrowWidth * 0.5, y + arrowHeight);
          } else {
            tutorialCtx.moveTo(x, y);
            tutorialCtx.lineTo(x - arrowWidth * 0.5, y - arrowHeight);
            tutorialCtx.lineTo(x + arrowWidth * 0.5, y - arrowHeight);
          }
          tutorialCtx.closePath();
          tutorialCtx.globalAlpha = 0.9;
          tutorialCtx.fillStyle = arrowColor;
          tutorialCtx.fill();
        };

        const topY = anchorNode.y - baseRadius - arrowHeight - 16 - bob;
        const bottomY = anchorNode.y + baseRadius + arrowHeight + 16 + bob;
        drawArrow(anchorNode.x, topY, -1);
        drawArrow(anchorNode.x, bottomY, 1);
        tutorialCtx.globalAlpha = 1;
      }
      tutorialCtx.restore();
      tutorialCtx.shadowBlur = 0;
      tutorialCtx.globalAlpha = 1;
    });
  };

  const startTutorialHighlightLoop = () => {
    if (tutorialHighlightMode === 'none') return;
    if (tutorialHighlightRaf !== null) return;
    const tick = () => {
      if (tutorialHighlightMode === 'none') {
        tutorialHighlightRaf = null;
        return;
      }
      renderTutorialHighlight();
      tutorialHighlightRaf = requestAnimationFrame(tick);
    };
    renderTutorialHighlight();
    tutorialHighlightRaf = requestAnimationFrame(tick);
  };

  const stopTutorialHighlightLoop = () => {
    if (tutorialHighlightRaf !== null) {
      cancelAnimationFrame(tutorialHighlightRaf);
      tutorialHighlightRaf = null;
    }
    clearTutorialHighlight();
  };

  panel.setSwipeVisible = (show, { immediate = false } = {}) => {
  __forceSwipeVisible = !!show;
  const speed = show ? 0.08 : 0.12;
  try { particles.setLetterFadeTarget(show ? 1 : 0, speed, immediate); } catch {}
};

  function syncLetterFade({ immediate = false } = {}) {
    const hasStrokes = Array.isArray(strokes) && strokes.length > 0;
    const hasNodes = Array.isArray(currentMap?.nodes)
      ? currentMap.nodes.some(set => set && set.size > 0)
      : false;
    const hasContent = hasStrokes || hasNodes;
    const target = (__forceSwipeVisible !== null)
      ? (__forceSwipeVisible ? 1 : 0)
      : (hasContent ? 0 : 1);
    const speed = hasContent ? 0.12 : 0.08;
    particles.setLetterFadeTarget(target, speed, immediate);
  }

  if (!panel.__drawgridHelpModeChecker) {
    panel.__drawgridHelpModeChecker = setInterval(() => {
      const imm = !zoomGestureActive; // never force during gesture
      syncLetterFade({ immediate: imm });
    }, 250);
  }

  panel.dataset.steps = String(cols);

  panel.dataset.steps = String(cols);

  // UI: ensure Eraser button exists in header
  const header = panel.querySelector('.toy-header');
  if (header){
    const right = header.querySelector('.toy-controls-right') || header;
    eraseButton = header.querySelector('[data-erase]');
    // The button is now created by toyui.js. We just need to find it and wire it up.
    eraseButton?.addEventListener('click', ()=>{
      if (eraseButton?.disabled) return;
      erasing = !erasing;
      eraseButton.setAttribute('aria-pressed', String(erasing));
      eraseButton.classList.toggle('active', erasing);
      if (!erasing) eraserCursor.style.display = 'none';
      else erasedTargetsThisDrag.clear(); // Clear on tool toggle
    });

    // --- Generator Line Buttons (Advanced Mode Only) ---
    const generatorButtonsWrap = document.createElement('div');
    generatorButtonsWrap.className = 'drawgrid-generator-buttons';
    panel.appendChild(generatorButtonsWrap);

    btnLine1 = document.createElement('button');
    btnLine1.type = 'button';
    btnLine1.className = 'c-btn';
    btnLine1.dataset.line = '1';
    btnLine1.title = 'Draw Line 1';
    btnLine1.style.setProperty('--c-btn-size', '96px');
    btnLine1.innerHTML = `<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core"></div>`;
    generatorButtonsWrap.appendChild(btnLine1);

    btnLine2 = document.createElement('button');
    btnLine2.type = 'button';
    btnLine2.className = 'c-btn';
    btnLine2.dataset.line = '2';
    btnLine2.title = 'Draw Line 2';
    btnLine2.style.setProperty('--c-btn-size', '96px');
    btnLine2.innerHTML = `<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core"></div>`;
    generatorButtonsWrap.appendChild(btnLine2);

    function handleGeneratorButtonClick(e) {
        const lineNum = parseInt(e.target.dataset.line, 10);
        // Toggle arming for this line; do not modify existing strokes here
        if (nextDrawTarget === lineNum) {
            nextDrawTarget = null; // disarm
        } else {
            nextDrawTarget = lineNum; // arm
        }
        updateGeneratorButtons();
    }


    btnLine1.addEventListener('click', handleGeneratorButtonClick);
    btnLine2.addEventListener('click', handleGeneratorButtonClick);

    updateEraseButtonState();
    // Auto-tune toggle
    let autoTuneBtn = right.querySelector('.drawgrid-autotune');
    if (!autoTuneBtn) {
      autoTuneBtn = document.createElement('button');
      autoTuneBtn.type = 'button';
      autoTuneBtn.className = 'toy-btn drawgrid-autotune';
      autoTuneBtn.textContent = 'Auto-tune: On';
      autoTuneBtn.setAttribute('aria-pressed', 'true');
      right.appendChild(autoTuneBtn);

      autoTuneBtn.addEventListener('click', () => {
        autoTune = !autoTune;
        autoTuneBtn.textContent = `Auto-tune: ${autoTune ? 'On' : 'Off'}`;
        autoTuneBtn.setAttribute('aria-pressed', String(autoTune));
        // Invalidate the node cache on all strokes since the tuning has changed.
        for (const s of strokes) { s.cachedNodes = null; }
        resnapAndRedraw(false);
      });
    }

    // Steps dropdown
    let stepsSel = right.querySelector('.drawgrid-steps');
    if (!stepsSel) {
        stepsSel = document.createElement('select');
        stepsSel.className = 'drawgrid-steps';
        stepsSel.innerHTML = `<option value="8">8 steps</option><option value="16">16 steps</option>`;
        stepsSel.value = String(cols);
        right.appendChild(stepsSel);

        stepsSel.addEventListener('change', () => {
            const prevCols = cols;
            const prevActive = currentMap?.active ? [...currentMap.active] : null;

            cols = parseInt(stepsSel.value, 10);
            currentCols = cols;
            panel.dataset.steps = String(cols);
            flashes = new Float32Array(cols);

            if (prevActive) {
                pendingActiveMask = { prevCols, prevActive };
            }

            // Reset manual overrides and invalidate stroke cache
            manualOverrides = Array.from({ length: cols }, () => new Set());
            for (const s of strokes) { s.cachedNodes = null; }
            persistentDisabled = Array.from({ length: cols }, () => new Set());

            resnapAndRedraw(true);
        });
    }

    // Instrument button (for tutorial unlock and general use)
    if (!right.querySelector('[data-action="instrument"]')) {
        const instBtn = document.createElement('button');
        instBtn.className = 'c-btn toy-inst-btn';
        instBtn.title = 'Choose Instrument';
        instBtn.dataset.action = 'instrument';
        instBtn.innerHTML = `<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core" style="--c-btn-icon-url: url('../assets/UI/T_ButtonInstruments.png');"></div>`;
        instBtn.style.setProperty('--c-btn-size', '65px');
        right.appendChild(instBtn);

        let sel = panel.querySelector('select.toy-instrument');
        if (!sel) {
            sel = document.createElement('select');
            sel.className = 'toy-instrument';
            sel.style.display = 'none';
            right.appendChild(sel);
        }

        instBtn.addEventListener('click', async () => {
            try {
                const { openInstrumentPicker } = await import('./instrument-picker.js');
                const { getDisplayNameForId } = await import('./instrument-catalog.js');
                const chosen = await openInstrumentPicker({ panel, toyId: (panel.dataset.toyid || panel.dataset.toy || panel.id || 'master') });
                if (!chosen) {
                    try { const h = panel.querySelector('.toy-header'); if (h) { h.classList.remove('pulse-accept'); h.classList.add('pulse-cancel'); setTimeout(() => h.classList.remove('pulse-cancel'), 650); } } catch { }
                    return;
                }
                const val = String(chosen || '');
                let has = Array.from(sel.options).some(o => o.value === val);
                if (!has) { 
                  const o = document.createElement('option');
                  o.value = val;
                  o.textContent = getDisplayNameForId(val) || val.replace(/[_-]/g, ' ').replace(/\w\S*/g, t => t[0].toUpperCase() + t.slice(1).toLowerCase());
                  sel.appendChild(o);
                }
                sel.value = val;
                panel.dataset.instrument = val;
                panel.dispatchEvent(new CustomEvent('toy-instrument', { detail: { value: val }, bubbles: true }));
                panel.dispatchEvent(new CustomEvent('toy:instrument', { detail: { name: val, value: val }, bubbles: true }));
                try { const h = panel.querySelector('.toy-header'); if (h) { h.classList.remove('pulse-cancel'); h.classList.add('pulse-accept'); setTimeout(() => h.classList.remove('pulse-accept'), 650); } } catch { }
            } catch (e) {
            }
        });
    }
  }

  function updateEraseButtonState() {
    if (!eraseButton) return;
    const isZoomed = panel.classList.contains('toy-zoomed');
    if (!isZoomed && erasing) {
      erasing = false;
      erasedTargetsThisDrag.clear();
    }
    eraseButton.disabled = !isZoomed;
    eraseButton.classList.toggle('is-disabled', !isZoomed);
    eraseButton.setAttribute('aria-pressed', String(erasing));
    eraseButton.classList.toggle('active', !!erasing && isZoomed);
    if (!erasing) {
      eraserCursor.style.display = 'none';
    }
  }

  function updateGeneratorButtons() {
      if (!btnLine1 || !btnLine2) return; // Guard in case header/buttons don't exist
      const hasLine1 = strokes.some(s => s.generatorId === 1);
      const hasLine2 = strokes.some(s => s.generatorId === 2);

      const core1 = btnLine1.querySelector('.c-btn-core');
      if (core1) core1.style.setProperty('--c-btn-icon-url', `url('../assets/UI/${hasLine1 ? 'T_ButtonLine1R.png' : 'T_ButtonLine1.png'}')`);
      btnLine1.title = hasLine1 ? 'Redraw Line 1' : 'Draw Line 1';

      const core2 = btnLine2.querySelector('.c-btn-core');
      if (core2) core2.style.setProperty('--c-btn-icon-url', `url('../assets/UI/${hasLine2 ? 'T_ButtonLine2R.png' : 'T_ButtonLine2.png'}')`);
      btnLine2.title = hasLine2 ? 'Redraw Line 2' : 'Draw Line 2';
      
      const a1 = nextDrawTarget === 1;
      const a2 = nextDrawTarget === 2;
      btnLine1.classList.toggle('active', a1);
      btnLine2.classList.toggle('active', a2);
      btnLine1.setAttribute('aria-pressed', String(a1));
      btnLine2.setAttribute('aria-pressed', String(a2));
  }
  try { panel.__dgUpdateButtons = updateGeneratorButtons; } catch{}

  // New central helper to redraw the paint canvas and regenerate the node map from the `strokes` array.
  function clearAndRedrawFromStrokes(targetCtx = backCtx) {
    if (!targetCtx) return;
    const normalStrokes = strokes.filter(s => !s.justCreated);
    const newStrokes = strokes.filter(s => s.justCreated);
    withIdentity(targetCtx, () => {
      const surface = targetCtx.canvas;
      const width = surface?.width ?? cssW;
      const height = surface?.height ?? cssH;
      targetCtx.clearRect(0, 0, width, height);

      // 1. Draw all existing, non-new strokes first.
      for (const s of normalStrokes) {
        drawFullStroke(targetCtx, s);
      }
      // 2. Apply the global erase mask to the existing strokes.
      for (const s of eraseStrokes) {
        drawEraseStroke(targetCtx, s);
      }
      // 3. Draw the brand new strokes on top, so they are not affected by old erasures.
      for (const s of newStrokes) {
        drawFullStroke(targetCtx, s);
      }
    });

    regenerateMapFromStrokes();
    try { (panel.__dgUpdateButtons || updateGeneratorButtons || function(){})() } catch(e) { }
    syncLetterFade();
  }

  function drawEraseStroke(ctx, stroke) {
    if (!stroke || !stroke.pts || stroke.pts.length < 1) return;
    withIdentity(ctx, () => {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = '#000'; // color doesn't matter
      ctx.lineWidth = getLineWidth() * 2; // diameter of erase circle
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(stroke.pts[0].x, stroke.pts[0].y);
      if (stroke.pts.length === 1) {
          ctx.lineTo(stroke.pts[0].x + 0.1, stroke.pts[0].y);
      } else {
          for (let i = 1; i < stroke.pts.length; i++) {
              ctx.lineTo(stroke.pts[i].x, stroke.pts[i].y);
          }
      }
      ctx.stroke();
      ctx.restore();
    });
  }

  function drawIntoBackOnly(includeCurrentStroke = false) {
    if (!backCtx || !cssW || !cssH) return;
    clearAndRedrawFromStrokes(backCtx);
    if (includeCurrentStroke && cur && Array.isArray(cur.pts) && cur.pts.length > 0) {
      drawFullStroke(backCtx, cur);
    }
    pendingPaintSwap = true;
  }

  /**
   * Processes a single generator stroke, fills in gaps to create a full line,
   * and marks the interpolated nodes as disabled.
   */
  function processGeneratorStroke(stroke, newMap, newGroups) {
    const partial = snapToGridFromStroke(stroke);
    const filledNodes = fillGapsInNodeArray(partial.nodes, cols);

    for (let c = 0; c < cols; c++) {
        if (filledNodes[c]?.size > 0) {
            filledNodes[c].forEach(row => {
                newMap.nodes[c].add(row);
                if (stroke.generatorId) {
                    const stack = newGroups[c].get(row) || [];
                    if (!stack.includes(stroke.generatorId)) stack.push(stroke.generatorId);
                    newGroups[c].set(row, stack);
                }
            });

            if (partial.nodes[c]?.size === 0) {
                if (!newMap.disabled[c]) newMap.disabled[c] = new Set();
                filledNodes[c].forEach(row => newMap.disabled[c].add(row));
            }
            // Add any nodes that were explicitly marked as disabled by the snapping logic (e.g., out of bounds)
            if (partial.disabled && partial.disabled[c]?.size > 0) {
                if (!newMap.disabled[c]) newMap.disabled[c] = new Set();
                partial.disabled[c].forEach(row => newMap.disabled[c].add(row));
            }
        }
    }
  }

  // Regenerates the node map by snapping all generator strokes.
function regenerateMapFromStrokes() {
      const isZoomed = panel.classList.contains('toy-zoomed');
      const newMap = { active: Array(cols).fill(false), nodes: Array.from({ length: cols }, () => new Set()), disabled: Array.from({ length: cols }, () => new Set()) };
      const newGroups = Array.from({ length: cols }, () => new Map());

      if (isZoomed) {
        // Advanced view: snap each generator line separately and union nodes.
        const gens = strokes.filter(s => s.generatorId);
        gens.forEach(s => processGeneratorStroke(s, newMap, newGroups));
      } else {
        // Standard view:
        const gens = strokes.filter(s => s.generatorId);
        if (gens.length > 0){
          gens.forEach(s => processGeneratorStroke(s, newMap, newGroups));
        } else {
          // Prefer a special stroke, otherwise use the latest stroke.
          const specialStroke = strokes.find(s => s.isSpecial) || (strokes.length ? strokes[strokes.length - 1] : null);
          if (specialStroke) processGeneratorStroke(specialStroke, newMap, newGroups);
        }
        // ...manual overrides (unchanged)...
        try {
          if (manualOverrides && Array.isArray(manualOverrides)) {
            for (let c = 0; c < cols; c++) {
              const ov = manualOverrides[c];
              if (ov && ov.size > 0) {
                newMap.nodes[c] = new Set(ov);
                // recompute active based on disabled set
                const dis = newMap.disabled?.[c] || new Set();
                const anyOn = Array.from(newMap.nodes[c]).some(r => !dis.has(r));
                newMap.active[c] = anyOn;
                // carry over groups from nodeGroupMap so we still avoid cross-line connections
                if (nodeGroupMap && nodeGroupMap[c] instanceof Map) {
                  for (const r of newMap.nodes[c]) {
                    const g = nodeGroupMap[c].get(r);
                    if (g != null) {
                      const stack = Array.isArray(g) ? g.slice() : [g];
                      newGroups[c].set(r, stack);
                    }
                  }
                }
              }
            }
          }
        } catch {}
      }

      // Finalize active mask: a column is active if it has at least one non-disabled node
      for (let c = 0; c < cols; c++) {
        const nodes = newMap.nodes?.[c] || new Set();
        const dis = newMap.disabled?.[c] || new Set();
        let anyOn = false;
        if (nodes.size > 0) {
          for (const r of nodes) { if (!dis.has(r)) { anyOn = true; break; } }
        }
        newMap.active[c] = anyOn;
      }

      // If NOTHING is active but there are nodes, default to active for columns that have nodes.
      if (!newMap.active.some(Boolean)) {
        for (let c = 0; c < cols; c++) {
          if ((newMap.nodes?.[c] || new Set()).size > 0) newMap.active[c] = true;
        }
      }

      // If a pending active mask exists (e.g., after steps change), map it to new cols
      if (pendingActiveMask && Array.isArray(pendingActiveMask.prevActive)) {
        const prevCols = pendingActiveMask.prevCols || newMap.active.length;
        const prevActive = pendingActiveMask.prevActive;
        const newCols = cols;
        const mapped = Array(newCols).fill(false);
        if (prevCols === newCols) {
          for (let i = 0; i < newCols; i++) mapped[i] = !!prevActive[i];
        } else if (newCols > prevCols && newCols % prevCols === 0) { // Upscaling (e.g., 8 -> 16)
          const factor = newCols / prevCols;
          for (let i = 0; i < prevCols; i++) {
            for (let j = 0; j < factor; j++) mapped[i * factor + j] = !!prevActive[i];
          }
        } else if (prevCols > newCols && prevCols % newCols === 0) { // Downscaling (e.g., 16 -> 8)
          const factor = prevCols / newCols;
          for (let i = 0; i < newCols; i++) {
            let any = false;
            for (let j = 0; j < factor; j++) any = any || !!prevActive[i * factor + j];
            mapped[i] = any;
          }
        } else {
          // fallback proportional map
          for (let i = 0; i < newCols; i++) {
            const src = Math.floor(i * prevCols / newCols);
            mapped[i] = !!prevActive[src];
          }
        }
        newMap.active = mapped;
        // Rebuild the disabled sets based on the new active state
        for (let c = 0; c < newCols; c++) {
            if (newMap.active[c]) {
                newMap.disabled[c].clear();
            } else if (newMap.nodes[c]) {
                newMap.nodes[c].forEach(r => newMap.disabled[c].add(r));
            }
        }
        pendingActiveMask = null; // consume
      } else {
          // Preserve disabled nodes from the persistent set where positions still exist
          for (let c = 0; c < cols; c++) {
            const prevDis = persistentDisabled[c] || new Set();
            for (const r of prevDis) {
              if (newMap.nodes[c]?.has(r)) newMap.disabled[c].add(r);
            }
          }
      }

      DG.log('rebuild map', {
        cols: newMap.nodes.length,
        activeCount: newMap.active.filter(Boolean).length
      });

      const prevActive = currentMap?.active ? currentMap.active.slice() : null;
      const prevNodes = currentMap?.nodes ? currentMap.nodes.map(s => s ? new Set(s) : new Set()) : null;

      currentMap = newMap;
      nodeGroupMap = newGroups;
      persistentDisabled = currentMap.disabled; // Update persistent set
      try { (panel.__dgUpdateButtons || function(){})() } catch {}

      let didChange = true;
      if (prevActive && Array.isArray(currentMap.active) && prevActive.length === currentMap.active.length){
        didChange = currentMap.active.some((v,i)=> v !== prevActive[i]);
        if (!didChange && prevNodes && Array.isArray(currentMap.nodes) && prevNodes.length === currentMap.nodes.length){
          didChange = currentMap.nodes.some((set,i)=>{
            const a = prevNodes[i], b = set || new Set();
            if (a.size !== b.size) return true;
            for (const v of a) if (!b.has(v)) return true;
            return false;
          });
        }
      }

      if (didChange){
        emitDrawgridUpdate({ activityOnly: false });
      } else {
        // noise-free activity: do not notify the guide as a progress update
        emitDrawgridUpdate({ activityOnly: true });
      }

      drawNodes(currentMap.nodes);
      drawGrid();
  }

  const initialZoomState = getZoomState();
  if (initialZoomState) {
    const initialScale =
      initialZoomState.currentScale ?? initialZoomState.targetScale;
    if (Number.isFinite(initialScale)) {
      boardScale = initialScale;
      lastCommittedScale = boardScale;
    }
  }

  function capturePaintSnapshot() {
    try {
      if (paint.width > 0 && paint.height > 0) {
        const snap = document.createElement('canvas');
        snap.width = paint.width;
        snap.height = paint.height;
        snap.getContext('2d')?.drawImage(paint, 0, 0);
        return snap;
      }
    } catch {}
    return null;
  }

  function restorePaintSnapshot(snap) {
    if (!snap) return;
    try {
      updatePaintBackingStores({ target: usingBackBuffers ? 'back' : 'both' });
      clearCanvas(pctx);
      pctx.drawImage(snap, 0, 0, snap.width, snap.height, 0, 0, cssW, cssH);
    } catch {}
  }

  function scheduleZoomRecompute() {
    if (zoomRAF) return;
    zoomRAF = requestAnimationFrame(() => {
      zoomRAF = 0;
      paintDpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
      pendingZoomResnap = false;
      useBackBuffers();
      updatePaintBackingStores({ force: true, target: 'back' });
      resnapAndRedraw(true);
      if (particles && typeof particles.onResize === 'function') {
        particles.onResize({ resetPositions: false });
      }
      drawIntoBackOnly();
      pendingSwap = true;
    });
  }

  const unsubscribeZoom = onZoomChange((z = {}) => {
    const phase = z?.phase;
    const mode = z?.mode;
    if (mode) {
      zoomMode = mode;
    }
    if (zoomMode === 'gesturing' && !__zoomActive) {
      __zoomActive = true;
    }
    zoomGestureActive = zoomMode === 'gesturing';

    if (phase === 'begin') {
      __zoomActive = true;
      zoomGestureActive = true;
      const beginScale = Number.isFinite(z?.currentScale) ? z.currentScale : (Number.isFinite(z?.targetScale) ? z.targetScale : null);
      dglog('zoom:begin', { scale: beginScale });
      return;
    }

    if (phase === 'commit' || phase === 'idle' || phase === 'done') {
      if (phase === 'commit') {
        try { particles?.snapAllToHomes?.(); } catch {}
      }
      __zoomActive = false;
      zoomMode = 'idle';
      zoomGestureActive = false;
      zoomCommitPhase = 'idle';
      pendingPaintSwap = false;
      pendingSwap = false;
      __dgFrontSwapNextDraw = true;
      if (phase === 'commit') {
        const deferBase = (typeof performance !== 'undefined' && typeof performance.now === 'function')
          ? performance.now()
          : Date.now();
        const deferUntil = deferBase + 160;
        __dgDeferUntilTs = Math.max(__dgDeferUntilTs || 0, deferUntil);
        __dgStableFramesAfterCommit = 0;
        __dgNeedsUIRefresh = true;
        const layoutSize = getLayoutSize();
        if (layoutSize.w && layoutSize.h) {
          cssW = Math.max(1, layoutSize.w);
          cssH = Math.max(1, layoutSize.h);
          progressMeasureW = cssW;
          progressMeasureH = cssH;
          try { dgViewport?.refreshSize?.({ snap: true }); } catch {}
          resizeSurfacesFor(cssW, cssH, window.devicePixelRatio || paintDpr || 1);
        }
        layout(true);
        const commitScale = Number.isFinite(z?.currentScale) ? z.currentScale : (Number.isFinite(z?.targetScale) ? z.targetScale : null);
        dglog('zoom:commit', { scale: commitScale });
      }
      return;
    }
  });

  let zoomRAF = null;
  let zoomGestureActive = false;

  function resnapAndRedraw(forceLayout = false) {
    if (zoomMode === 'gesturing' && !forceLayout) {
      pendingZoomResnap = true;
      return;
    }

    const hasStrokes = Array.isArray(strokes) && strokes.length > 0;
    const hasNodes =
      currentMap &&
      Array.isArray(currentMap.nodes) &&
      currentMap.nodes.some(set => set && set.size > 0);

    syncLetterFade({ immediate: true });
    layout(!!forceLayout);

    requestAnimationFrame(() => {
      if (!panel.isConnected) return;

      if (hasStrokes) {
        regenerateMapFromStrokes();
        withIdentity(pctx, () => {
          clearCanvas(pctx);
          for (const s of strokes) {
            drawFullStroke(pctx, s);
          }
        });
        updateGeneratorButtons();
        return;
      }

      if (hasNodes) {
        drawGrid();
        drawNodes(currentMap.nodes);
        emitDrawgridUpdate({ activityOnly: false });
        updateGeneratorButtons();
        return;
      }

      api.clear();
      updateGeneratorButtons();
    });
  }




  panel.addEventListener('toy-zoom', (e)=>{
    const z = e?.detail;
    if (!z) return;

    if (z.phase === 'prepare') {
      zoomGestureActive = true;
      zoomMode = 'gesturing';
      // during gesture we render via CSS transforms only
      useBackBuffers();
      return;
    }

    if (z.phase === 'recompute') {
      scheduleZoomRecompute();
      return;
    }

    if (z.phase === 'commit') {
      // one-time swap & finalize
      useFrontBuffers();
      // copy ghost back -> front exactly once after swap
      const front = ghostFrontCtx?.canvas, back = ghostBackCtx?.canvas;
      if (front && back) {
        withIdentity(ghostFrontCtx, ()=> ghostFrontCtx.drawImage(back, 0, 0, back.width, back.height, 0, 0, front.width, front.height));
      }
      // NEW: also copy other overlays back -> front once to avoid a 1-frame size pop
      copyCanvas(particleBackCtx, particleFrontCtx);
      copyCanvas(gridBackCtx,      gridFrontCtx);
      copyCanvas(nodesBackCtx,     nodesFrontCtx);
      copyCanvas(flashBackCtx,     flashFrontCtx);
      copyCanvas(tutorialBackCtx,  tutorialFrontCtx);

      resnapAndRedraw(true);
      zoomGestureActive = false;
      zoomMode = 'idle'; // ensure we fully exit zoom mode 
      lastCommittedScale = boardScale;
      return;
    }
  });

  const observer = new ResizeObserver(() => {
    if (zoomMode === 'gesturing') {
      pendingZoomResnap = true;
      return;
    }
    resnapAndRedraw(false);
  });

  function getLineWidth() {
    return Math.max(1.5, Math.round(Math.min(cw, ch) * 0.85));
  }

  let lastZoomX = 1;
  let lastZoomY = 1;

  function getLayoutSize() {
    const w = wrap.offsetWidth;
    const h = wrap.offsetHeight;
    return { w, h };
  }

  function measureCSSSize(el) {
    if (!el) return { w: 0, h: 0 };
    const r = el.getBoundingClientRect();
    return { w: r.width || 0, h: r.height || 0 };
  }

  function useBackBuffers() {
    if (usingBackBuffers) return;
    usingBackBuffers = true;
    syncBackBufferSizes();
    particleCtx = particleBackCtx;
    gctx = gridBackCtx;
    nctx = nodesBackCtx;
    fctx = flashBackCtx;
    ghostCtx = ghostBackCtx;
    tutorialCtx = tutorialBackCtx;
  }

  function useFrontBuffers() {
    if (!usingBackBuffers) return;
    usingBackBuffers = false;
    particleCtx = particleFrontCtx;
    gctx = gridFrontCtx;
    nctx = nodesFrontCtx;
    fctx = flashFrontCtx;
    ghostCtx = ghostFrontCtx;
    tutorialCtx = tutorialFrontCtx;
  }

  function syncGhostBackToFront() {
    if (!ghostFrontCtx || !ghostBackCtx) return;
    const front = ghostFrontCtx.canvas;
    const back = ghostBackCtx.canvas;
    if (!front || !back || !front.width || !front.height) return;
    withIdentity(ghostFrontCtx, () => {
      ghostFrontCtx.globalCompositeOperation = 'source-over';
      ghostFrontCtx.globalAlpha = 1;
      ghostFrontCtx.clearRect(0, 0, front.width, front.height);
      ghostFrontCtx.drawImage(
        back,
        0, 0, back.width, back.height,
        0, 0, front.width, front.height
      );
    });
  }

function copyCanvas(backCtx, frontCtx) {
  if (!backCtx || !frontCtx) return;
  const front = frontCtx.canvas, back = backCtx.canvas;
  if (!front || !back || !front.width || !front.height || !back.width || !back.height) return;
  withIdentity(frontCtx, () => {
    frontCtx.clearRect(0, 0, front.width, front.height);
    frontCtx.drawImage(back, 0, 0, back.width, back.height, 0, 0, front.width, front.height);
  });
}

function syncBackBufferSizes() {
  const pairs = [
    [particleBackCtx, particleFrontCtx],
    [gridBackCtx, gridFrontCtx],
    [nodesBackCtx, nodesFrontCtx],
    [flashBackCtx, flashFrontCtx],
    [ghostBackCtx, ghostFrontCtx],
    [tutorialBackCtx, tutorialFrontCtx]
  ];
  for (const [back, front] of pairs) {
    if (!back || !front) continue;
    if (back.canvas.width  !== front.canvas.width ||
        back.canvas.height !== front.canvas.height) {
      back.canvas.width  = front.canvas.width;
      back.canvas.height = front.canvas.height;
    }
  }
}

  function getActiveFlashCanvas() {
    return usingBackBuffers ? flashBackCanvas : flashCanvas;
  }

  function getActiveGhostCanvas() {
    return usingBackBuffers ? ghostBackCanvas : ghostCanvas;
  }

  function getActiveTutorialCanvas() {
    return usingBackBuffers ? tutorialBackCanvas : tutorialCanvas;
  }

  function updatePaintBackingStores({ force = false, target } = {}) {
    if (!cssW || !cssH) return;
    if (!force && zoomGestureActive) return;
    const targetW = Math.max(1, Math.round(cssW * paintDpr));
    const targetH = Math.max(1, Math.round(cssH * paintDpr));
    const mode = target || (usingBackBuffers ? 'back' : 'both');
    const updateFront = mode === 'front' || mode === 'both';
    const updateBack = mode === 'back' || mode === 'both';

    if (debugCanvas) {
      if (force || debugCanvas.width !== targetW || debugCanvas.height !== targetH) {
        debugCanvas.width = targetW;
        debugCanvas.height = targetH;
      }
    }

    if (updateFront) {
      if (
        force ||
        frontCanvas.width !== targetW ||
        frontCanvas.height !== targetH
      ) {
        frontCanvas.width = targetW;
        frontCanvas.height = targetH;
        pctx.setTransform(1, 0, 0, 1, 0, 0);
        pctx.imageSmoothingEnabled = true;
        pctx.scale(paintDpr, paintDpr);
      }
    }

    if (updateBack && backCtx) {
      if (
        force ||
        backCanvas.width !== targetW ||
        backCanvas.height !== targetH
      ) {
        backCanvas.width = targetW;
        backCanvas.height = targetH;
        backCtx.setTransform(1, 0, 0, 1, 0, 0);
        backCtx.imageSmoothingEnabled = true;
        backCtx.scale(paintDpr, paintDpr);
      }
    }
  }

  function swapBackToFront() {
    if (!backCtx || !cssW || !cssH) return;
    updatePaintBackingStores({ force: true, target: 'front' });
    try {
      withIdentity(pctx, () => {
        pctx.drawImage(backCanvas, 0, 0, backCanvas.width, backCanvas.height, 0, 0, frontCanvas.width, frontCanvas.height);
      });
    } catch {}
  }

  function ensureBackVisualsFreshFromFront() {
    try {
      // Particles
      if (particleBackCanvas && particleCanvas && particleBackCtx) {
        particleBackCanvas.width = particleCanvas.width;
        particleBackCanvas.height = particleCanvas.height;
        particleBackCtx.setTransform(1,0,0,1,0,0);
        particleBackCtx.clearRect(0,0,particleBackCanvas.width,particleBackCanvas.height);
        particleBackCtx.drawImage(particleCanvas, 0, 0);
      }
      // Ghost
      if (ghostBackCanvas && ghostCanvas && ghostBackCtx) {
        ghostBackCanvas.width = ghostCanvas.width;
        ghostBackCanvas.height = ghostCanvas.height;
        ghostBackCtx.setTransform(1,0,0,1,0,0);
        ghostBackCtx.clearRect(0,0,ghostBackCanvas.width,ghostBackCanvas.height);
        ghostBackCtx.drawImage(ghostCanvas, 0, 0);
      }
      // Flash
      if (flashBackCanvas && flashCanvas && flashBackCtx) {
        flashBackCanvas.width = flashCanvas.width;
        flashBackCanvas.height = flashCanvas.height;
        flashBackCtx.setTransform(1,0,0,1,0,0);
        flashBackCtx.clearRect(0,0,flashBackCanvas.width,flashBackCanvas.height);
        flashBackCtx.drawImage(flashCanvas, 0, 0);
      }
      // Tutorial overlay
      if (tutorialBackCanvas && tutorialCanvas && tutorialBackCtx) {
        tutorialBackCanvas.width = tutorialCanvas.width;
        tutorialBackCanvas.height = tutorialCanvas.height;
        tutorialBackCtx.setTransform(1,0,0,1,0,0);
        tutorialBackCtx.clearRect(0,0,tutorialBackCanvas.width,tutorialBackCanvas.height);
        tutorialBackCtx.drawImage(tutorialCanvas, 0, 0);
      }
    } catch {}
  }

  function flushVisualBackBuffersToFront() {
    const w = Math.max(1, Math.round(cssW));
    const h = Math.max(1, Math.round(cssH));

    if (pendingWrapSize) {
      wrap.style.width = `${pendingWrapSize.width}px`;
      wrap.style.height = `${pendingWrapSize.height}px`;
      pendingWrapSize = null;
    }
    if (pendingEraserSize != null) {
      const sizePx = `${pendingEraserSize}px`;
      eraserCursor.style.width = sizePx;
      eraserCursor.style.height = sizePx;
      pendingEraserSize = null;
    }

    grid.width = w; grid.height = h;
    nodesCanvas.width = w; nodesCanvas.height = h;
    particleCanvas.width = w; particleCanvas.height = h;
    flashCanvas.width = w; flashCanvas.height = h;
    ghostCanvas.width = w; ghostCanvas.height = h;
    tutorialCanvas.width = w; tutorialCanvas.height = h;
    if (debugCanvas) { debugCanvas.width = w; debugCanvas.height = h; }

    withIdentity(gridFrontCtx, () => {
      const surface = gridFrontCtx.canvas;
      const width = surface?.width ?? w;
      const height = surface?.height ?? h;
      gridFrontCtx.clearRect(0, 0, width, height);
      gridFrontCtx.drawImage(
        gridBackCanvas,
        0, 0, gridBackCanvas.width, gridBackCanvas.height,
        0, 0, width, height
      );
    });

    withIdentity(nodesFrontCtx, () => {
      const surface = nodesFrontCtx.canvas;
      const width = surface?.width ?? w;
      const height = surface?.height ?? h;
      nodesFrontCtx.clearRect(0, 0, width, height);
      nodesFrontCtx.drawImage(
        nodesBackCanvas,
        0, 0, nodesBackCanvas.width, nodesBackCanvas.height,
        0, 0, width, height
      );
    });

    withIdentity(particleFrontCtx, () => {
      const surface = particleFrontCtx.canvas;
      const width = surface?.width ?? w;
      const height = surface?.height ?? h;
      particleFrontCtx.clearRect(0, 0, width, height);
      particleFrontCtx.drawImage(
        particleBackCanvas,
        0, 0, particleBackCanvas.width, particleBackCanvas.height,
        0, 0, width, height
      );
    });

    withIdentity(flashFrontCtx, () => {
      const surface = flashFrontCtx.canvas;
      const width = surface?.width ?? w;
      const height = surface?.height ?? h;
      flashFrontCtx.clearRect(0, 0, width, height);
      flashFrontCtx.drawImage(
        flashBackCanvas,
        0, 0, flashBackCanvas.width, flashBackCanvas.height,
        0, 0, width, height
      );
    });

    withIdentity(ghostFrontCtx, () => {
      const surface = ghostFrontCtx.canvas;
      const width = surface?.width ?? w;
      const height = surface?.height ?? h;
      ghostFrontCtx.clearRect(0, 0, width, height);
      ghostFrontCtx.drawImage(
        ghostBackCanvas,
        0, 0, ghostBackCanvas.width, ghostBackCanvas.height,
        0, 0, width, height
      );
    });

    withIdentity(tutorialFrontCtx, () => {
      const surface = tutorialFrontCtx.canvas;
      const width = surface?.width ?? w;
      const height = surface?.height ?? h;
      tutorialFrontCtx.clearRect(0, 0, width, height);
      tutorialFrontCtx.drawImage(
        tutorialBackCanvas,
        0, 0, tutorialBackCanvas.width, tutorialBackCanvas.height,
        0, 0, width, height
      );
    });
  }

  function layout(force = false){
    const bodyW = body.offsetWidth;
    const bodyH = body.offsetHeight;
    if (usingBackBuffers) {
      pendingWrapSize = { width: bodyW, height: bodyH };
    } else {
      wrap.style.width  = bodyW + 'px';
      wrap.style.height = bodyH + 'px';
    }


    // Measure transform-immune base...
    const { w: baseW, h: baseH } = getLayoutSize();
    const { x: zoomX, y: zoomY } = getZoomScale(panel); // tracking only for logs/debug
    const newW = Math.max(1, Math.round(baseW));
    const newH = Math.max(1, Math.round(baseH));

    if (newW === 0 || newH === 0) {
      requestAnimationFrame(() => resnapAndRedraw(force));
      return;
    }

    if ((!zoomGestureActive && (force || Math.abs(newW - cssW) > 1 || Math.abs(newH - cssH) > 1)) || (force && zoomGestureActive)) {
      const oldW = cssW;
      const oldH = cssH;
      // Snapshot current paint to preserve erased/drawn content across resize
      let paintSnapshot = null;
      try {
        if (paint.width > 0 && paint.height > 0) {
          paintSnapshot = document.createElement('canvas');
          paintSnapshot.width = paint.width;
          paintSnapshot.height = paint.height;
          const psctx = paintSnapshot.getContext('2d');
          psctx.drawImage(paint, 0, 0);
        }
      } catch {}

      cssW = newW;
      cssH = newH;
      progressMeasureW = cssW;
      progressMeasureH = cssH;
      if (dgViewport?.refreshSize) dgViewport.refreshSize({ snap: true });
      resizeSurfacesFor(cssW, cssH, window.devicePixelRatio || paintDpr || 1);
      if (tutorialHighlightMode !== 'none') renderTutorialHighlight();


      lastZoomX = zoomX;
      lastZoomY = zoomY;

      // Scale the logical stroke data if we have it and the canvas was resized
      if (strokes.length > 0 && oldW > 0 && oldH > 0 && !isRestoring) {
        const scaleX = cssW / oldW;
        const scaleY = cssH / oldH;
        if (scaleX !== 1 || scaleY !== 1) {
          for (const s of strokes) { s.pts = s.pts.map(p => ({ x: p.x * scaleX, y: p.y * scaleY })); }
        }
      }

      const logicalW = cssW;
      const logicalH = cssH;

      const minGridArea = 20; // px floor so it never fully collapses
      // Compute proportional margin in CSS px (already in the visible, transformed space)
      const safeScale = typeof dgMap?.scale === 'function' ? dgMap.scale() : Math.min(cssW, cssH);
      const dynamicSafeArea = Math.max(
        12,                               // lower bound so lines don't hug edges on tiny panels
        Math.round(SAFE_AREA_FRACTION * safeScale)
      );

      gridArea = {
        x: dynamicSafeArea,
        y: dynamicSafeArea,
        w: Math.max(minGridArea, logicalW - 2 * dynamicSafeArea),
        h: Math.max(minGridArea, logicalH - 2 * dynamicSafeArea),
      };
    
      // All calculations are now relative to the gridArea
      // Remove the top cube row; use a minimal padding
      topPad = 0;
      cw = gridArea.w / cols;
      ch = (gridArea.h - topPad) / rows;


      // Update eraser cursor size
      const eraserWidth = getLineWidth() * 2;
      if (usingBackBuffers) {
        pendingEraserSize = eraserWidth;
      } else {
        eraserCursor.style.width = `${eraserWidth}px`;
        eraserCursor.style.height = `${eraserWidth}px`;
      }

      drawGrid();
      // Restore paint snapshot scaled to new size (preserves erasures)
      if (paintSnapshot && zoomCommitPhase !== 'recompute') {
        try {
          updatePaintBackingStores({ target: usingBackBuffers ? 'back' : 'both' });
          clearCanvas(pctx);
          pctx.drawImage(
            paintSnapshot,
            0, 0, paintSnapshot.width, paintSnapshot.height,
            0, 0, cssW, cssH
          );
        } catch {}
      }
      // Clear other content canvases. The caller is responsible for redrawing nodes/overlay.
      // Defer overlay clears if we are in/near a gesture commit; renderLoop will clear safely.
      const __now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if (__dgInCommitWindow(__now) || __dgStableFramesAfterCommit < 2) {
        __dgNeedsUIRefresh = true;
      } else {
        clearCanvas(nctx);
        const flashTarget = getActiveFlashCanvas();
        withIdentity(fctx, () => {
          fctx.clearRect(0, 0, flashTarget.width, flashTarget.height);
        });
        const ghostTarget = getActiveGhostCanvas();
        withIdentity(ghostCtx, () => {
          ghostCtx.clearRect(0, 0, ghostTarget.width, ghostTarget.height);
        });
      }
    }
  }

  function flashColumn(col) {
    // Save current grid state to restore after flash
    const gridSurface = usingBackBuffers ? gridBackCanvas : grid;
    const currentGridData = gctx.getImageData(0, 0, gridSurface.width, gridSurface.height);

    const x = gridArea.x + col * cw;
    const w = cw;
    gctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    gctx.fillRect(x, gridArea.y, w, gridArea.h);

    setTimeout(() => {
        // A fade-out effect for a "fancier" feel
        let opacity = 0.6;
        const fade = setInterval(() => {
            gctx.putImageData(currentGridData, 0, 0); // Restore grid
            opacity -= 0.1;
            if (opacity <= 0) {
                clearInterval(fade);
                drawGrid(); // Final clean redraw
            } else {
                gctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
                gctx.fillRect(x, gridArea.y, w, gridArea.h);
            }
        }, 30);
    }, 100); // Start fade after a short hold
  }

  function drawGrid(){
    withIdentity(gctx, () => {
      const surface = gctx.canvas;
      const width = surface?.width ?? cssW;
      const height = surface?.height ?? cssH;
      gctx.clearRect(0, 0, width, height);

      // Fill the entire background on the lowest layer (grid canvas)
      gctx.fillStyle = '#0b0f16';
      gctx.fillRect(0, 0, width, height);

      // 1. Draw the note grid area below the top padding
      const noteGridY = gridArea.y + topPad;
      const noteGridH = gridArea.h - topPad;
      gctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      gctx.fillRect(gridArea.x, noteGridY, gridArea.w, noteGridH);

      // 2. Subtle fill for active columns
      if (currentMap) {
          for (let c = 0; c < cols; c++) {
              if (currentMap.nodes[c]?.size > 0 && currentMap.active[c]) {
                  let fillOpacity = 0.1; // default opacity
                  const hasTwoLines = strokes.some(s => s.generatorId === 2);
                  if (hasTwoLines) {
                      const totalNodes = currentMap.nodes[c].size;
                      const disabledNodes = currentMap.disabled[c]?.size || 0;
                      const activeNodes = totalNodes - disabledNodes;
                      if (activeNodes === 1) {
                          fillOpacity = 0.05; // more subtle
                      }
                  }
                  gctx.fillStyle = `rgba(143, 168, 255, ${fillOpacity})`;
                  const x = gridArea.x + c * cw;
                  gctx.fillRect(x, noteGridY, cw, noteGridH);
              }
          }
      }

      // 3. Draw all grid lines with the base color
      gctx.strokeStyle = 'rgba(143, 168, 255, 0.35)'; // Untriggered particle color, slightly transparent
      gctx.lineWidth = Math.max(0.5, Math.min(cw,ch) * 0.05);
      // Verticals (including outer lines)
      for (let i = 0; i <= cols; i++) {
          const x = crisp(gridArea.x + i * cw);
          gctx.beginPath();
          gctx.moveTo(x, noteGridY);
          gctx.lineTo(x, gridArea.y + gridArea.h);
          gctx.stroke();
      }
      // Horizontals (including outer lines)
      for (let j = 0; j <= rows; j++) {
          const y = crisp(noteGridY + j * ch);
          gctx.beginPath();
          gctx.moveTo(gridArea.x, y);
          gctx.lineTo(gridArea.x + gridArea.w, y);
          gctx.stroke();
      }

      // 4. Highlight active columns by thickening their vertical lines
      if (currentMap) {
          gctx.strokeStyle = 'rgba(143, 168, 255, 0.7)'; // Brighter version of grid color
          for (let c = 0; c < cols; c++) {
              // Highlight only if there are nodes AND the column is active
              if (currentMap.nodes[c]?.size > 0 && currentMap.active[c]) {
                  // Left line of the column
                  const x1 = crisp(gridArea.x + c * cw);
                  gctx.beginPath();
                  gctx.moveTo(x1, noteGridY);
                  gctx.lineTo(x1, gridArea.y + gridArea.h);
                  gctx.stroke();

                  // Right line of the column
                  const x2 = crisp(gridArea.x + (c + 1) * cw);
                  gctx.beginPath();
                  gctx.moveTo(x2, noteGridY);
                  gctx.lineTo(x2, gridArea.y + gridArea.h);
                  gctx.stroke();
              }
          }
      }
    });
  }

  function crisp(v) {
    return Math.round(v) + 0.5;
  }

  // A helper to draw a complete stroke from a point array.
  // This is used to create a clean image for snapping.
  function drawFullStroke(ctx, stroke) {
    if (!stroke || !stroke.pts || stroke.pts.length < 1) return;
    const color = stroke.color || STROKE_COLORS[0];

    withIdentity(ctx, () => {
      ctx.save();
      const isStandard = !panel.classList.contains('toy-zoomed');
      const isOverlay = (ctx === fctx);
      let wantsSpecial = !!stroke.isSpecial || (isOverlay && (stroke.generatorId === 1 || stroke.generatorId === 2));
      if (!wantsSpecial && isStandard) {
        const hasAnySpecial = strokes.some(s => s.isSpecial);
        if (!hasAnySpecial && stroke === cur) wantsSpecial = true;
      }
      if (wantsSpecial && isOverlay) {
        ctx.shadowColor = 'rgba(255, 255, 255, 0.7)';
        ctx.shadowBlur = 18;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }
      if (!wantsSpecial) {
        ctx.globalAlpha = 0.3;
      }

      ctx.beginPath();
      if (stroke.pts.length === 1) {
        const lineWidth = getLineWidth();
        const p = stroke.pts[0];
        if (wantsSpecial) {
          const r = lineWidth / 2;
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          if (isOverlay) {
            const t = (performance.now ? performance.now() : Date.now());
            const gid = stroke.generatorId ?? 1;
            if (gid === 1) {
              const hue = 200 + 20 * Math.sin((t / 800) * Math.PI * 2);
              grad.addColorStop(0, `hsl(${hue.toFixed(0)}, 100%, 75%)`);
              grad.addColorStop(0.7, `hsl(${(hue + 60).toFixed(0)}, 100%, 68%)`);
              grad.addColorStop(1, `hsla(${(hue + 120).toFixed(0)}, 100%, 60%, 0.35)`);
            } else {
              const hue = 20 + 20 * Math.sin((t / 900) * Math.PI * 2);
              grad.addColorStop(0, `hsl(${hue.toFixed(0)}, 100%, 70%)`);
              grad.addColorStop(0.7, `hsl(${(hue - 25).toFixed(0)}, 100%, 65%)`);
              grad.addColorStop(1, `hsla(${(hue - 45).toFixed(0)}, 100%, 55%, 0.35)`);
            }
            ctx.fillStyle = grad;
          } else {
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
          }
        } else {
          ctx.fillStyle = color;
        }
        ctx.arc(p.x, p.y, lineWidth / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.moveTo(stroke.pts[0].x, stroke.pts[0].y);
        for (let i = 1; i < stroke.pts.length; i++) {
          ctx.lineTo(stroke.pts[i].x, stroke.pts[i].y);
        }
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const lw = getLineWidth() + (isOverlay ? 1.25 : 0);
        ctx.lineWidth = lw;
        if (wantsSpecial) {
          const p1 = stroke.pts[0];
          const pLast = stroke.pts[stroke.pts.length - 1];
          const grad = ctx.createLinearGradient(p1.x, p1.y, pLast.x, pLast.y);
          if (isOverlay) {
            const t = (performance.now ? performance.now() : Date.now());
            const gid = stroke.generatorId ?? 1;
            if (gid === 1) {
              const hue = 200 + 20 * Math.sin((t / 800) * Math.PI * 2);
              grad.addColorStop(0, `hsl(${hue.toFixed(0)}, 100%, 70%)`);
              grad.addColorStop(0.5, `hsl(${(hue + 45).toFixed(0)}, 100%, 70%)`);
              grad.addColorStop(1, `hsl(${(hue + 90).toFixed(0)}, 100%, 68%)`);
            } else {
              const hue = 20 + 20 * Math.sin((t / 900) * Math.PI * 2);
              grad.addColorStop(0, `hsl(${hue.toFixed(0)}, 100%, 68%)`);
              grad.addColorStop(0.5, `hsl(${(hue - 25).toFixed(0)}, 100%, 66%)`);
              grad.addColorStop(1, `hsl(${(hue - 50).toFixed(0)}, 100%, 64%)`);
            }
            ctx.strokeStyle = grad;
          } else {
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          }
        } else {
          ctx.strokeStyle = color;
        }
        ctx.stroke();
      }

      ctx.restore();
    });
  }
  function eraseAtPoint(p) {
    const R = getLineWidth(); // This is the radius
    pctx.save();
    pctx.globalCompositeOperation = 'destination-out';
    pctx.beginPath();
    pctx.arc(p.x, p.y, R, 0, Math.PI * 2, false);
    pctx.fillStyle = '#000';
    pctx.fill();
    pctx.restore();
  }

  function animateErasedNode(node) {
    const duration = 250; // 0.25 seconds
    const startTime = performance.now();
    const initialRadius = Math.max(3, Math.min(cw, ch) * 0.15);

    function frame(now) {
        if (!panel.isConnected) return;
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOutQuad = t => t * (2 - t);
        const easedProgress = easeOutQuad(progress);

        // Redraw the static nodes first (the map is already updated)
        drawNodes(currentMap.nodes);

        // Then draw the animating "ghost" node on top
        if (progress < 1) {
            const scale = 1 + 2.5 * easedProgress; // Scale up to 3.5x
            const opacity = 1 - progress; // Fade out

            nctx.save();
            nctx.globalAlpha = opacity;
            nctx.fillStyle = 'rgba(255, 255, 255, 1)'; // Bright white

            // Add a bright glow that fades
            nctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
            nctx.shadowBlur = 20 * (1 - progress);

            nctx.beginPath();
            nctx.arc(node.x, node.y, initialRadius * scale, 0, Math.PI * 2);
            nctx.fill();
            nctx.restore();
            requestAnimationFrame(frame);
        }
    }
    requestAnimationFrame(frame);
  }

  function drawNodes(nodes) {
    const nodeCoords = [];
    nodeCoordsForHitTest = [];
    withIdentity(nctx, () => {
      const surface = nctx.canvas;
      const width = surface?.width ?? cssW;
      const height = surface?.height ?? cssH;
      nctx.clearRect(0, 0, width, height);
      renderDragScaleBlueHints(nctx);
      if (!nodes) {
        return;
      }

      const radius = Math.max(4, Math.min(cw, ch) * 0.20);

      for (let c = 0; c < cols; c++) {
        if (!nodes[c] || nodes[c].size === 0) continue;
        for (const r of nodes[c]) {
          const x = gridArea.x + c * cw + cw * 0.5;
          const y = gridArea.y + topPad + r * ch + ch * 0.5;
          const groupEntry = nodeGroupMap?.[c]?.get(r) ?? null;
          const disabledSet = currentMap?.disabled?.[c];
          const isDisabled = !!(disabledSet && disabledSet.has(r));
          if (Array.isArray(groupEntry) && groupEntry.length > 0) {
            for (let i = groupEntry.length - 1; i >= 0; i--) {
              const gid = groupEntry[i];
              const nodeData = { x, y, col: c, row: r, radius: radius * 1.5, group: gid, disabled: isDisabled };
              nodeCoords.push(nodeData);
              nodeCoordsForHitTest.push(nodeData);
            }
          } else {
            const groupId = typeof groupEntry === 'number' ? groupEntry : null;
            const nodeData = { x, y, col: c, row: r, radius: radius * 1.5, group: groupId, disabled: isDisabled };
            nodeCoords.push(nodeData);
            nodeCoordsForHitTest.push(nodeData);
          }
        }
      }

      nctx.lineWidth = 3;
      const colsMap = new Map();
      for (const node of nodeCoords) {
        if (!colsMap.has(node.col)) colsMap.set(node.col, []);
        colsMap.get(node.col).push(node);
      }

      const colorFor = (gid, active = true) => {
        if (!active) return 'rgba(80, 100, 160, 0.6)';
        if (gid === 1) return 'rgba(125, 180, 255, 0.9)';
        if (gid === 2) return 'rgba(255, 160, 120, 0.9)';
        return 'rgba(255, 255, 255, 0.85)';
      };

      const matchGroup = (value, gid) => {
        if (gid == null) return value == null;
        return value === gid;
      };

      for (let c = 0; c < cols - 1; c++) {
        const currentColNodes = colsMap.get(c);
        const nextColNodes = colsMap.get(c + 1);
        if (!currentColNodes || !nextColNodes) continue;
        const currentIsActive = currentMap?.active?.[c] ?? false;
        const nextIsActive = currentMap?.active?.[c + 1] ?? true;
        const advanced = panel.classList.contains('toy-zoomed');

        const drawGroupConnections = (gid) => {
          for (const nodeA of currentColNodes) {
            if (!matchGroup(nodeA.group ?? null, gid)) continue;
            for (const nodeB of nextColNodes) {
              if (!matchGroup(nodeB.group ?? null, gid)) continue;
              const eitherDisabled = nodeA.disabled || nodeB.disabled;
              nctx.strokeStyle = colorFor(gid, currentIsActive && nextIsActive && !eitherDisabled);
              if (gid && advanced && !eitherDisabled) {
                nctx.shadowColor = nctx.strokeStyle;
                nctx.shadowBlur = 12;
              } else {
                nctx.shadowColor = 'transparent';
                nctx.shadowBlur = 0;
              }
              nctx.beginPath();
              nctx.moveTo(nodeA.x, nodeA.y);
              nctx.lineTo(nodeB.x, nodeB.y);
              nctx.stroke();
            }
          }
        };

        drawGroupConnections(1);
        drawGroupConnections(2);
        drawGroupConnections(null);
      }

      nctx.shadowColor = 'transparent';
      nctx.shadowBlur = 0;

      const gradientCache = new Map();
      const getGradient = (ctx, x, y, r, color) => {
        const key = `${color}-${r}`;
        if (!gradientCache.has(key)) {
          const grad = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
          grad.addColorStop(0, color);
          grad.addColorStop(0.92, 'rgba(143, 168, 255, 0)');
          grad.addColorStop(1, 'rgba(143, 168, 255, 0)');
          gradientCache.set(key, grad);
        }
        return gradientCache.get(key);
      };

      for (const node of nodeCoords) {
        const disabled = node.disabled || currentMap?.disabled?.[node.col]?.has(node.row);
        const group = node.group ?? null;
        const advanced = panel.classList.contains('toy-zoomed');
        const isSpecialLine1 = group === 1;
        const isSpecialLine2 = group === 2;
        const mainColor = disabled
          ? 'rgba(143, 168, 255, 0.4)'
          : isSpecialLine1
            ? 'rgba(125, 180, 255, 0.92)'
            : isSpecialLine2
              ? 'rgba(255, 160, 120, 0.92)'
              : 'rgba(255, 255, 255, 0.92)';

        if (advanced && (isSpecialLine1 || isSpecialLine2) && !disabled) {
          const glowRadius = node.radius * 1.6;
          const glowColor = isSpecialLine1 ? 'rgba(125, 180, 255, 0.4)' : 'rgba(255, 160, 120, 0.4)';
          nctx.fillStyle = glowColor;
          nctx.beginPath();
          nctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
          nctx.fill();
        }

        nctx.fillStyle = getGradient(nctx, node.x, node.y, node.radius, mainColor);
        nctx.beginPath();
        nctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        nctx.fill();

        nctx.beginPath();
        nctx.fillStyle = disabled ? 'rgba(90, 110, 150, 0.65)' : 'rgba(255, 255, 255, 0.9)';
        nctx.arc(node.x, node.y, node.radius * 0.55, 0, Math.PI * 2);
        nctx.fill();

        nctx.fillStyle = disabled ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.5)';
        nctx.beginPath();
        nctx.arc(node.x, node.y - node.radius * 0.3, node.radius * 0.3, 0, Math.PI * 2);
        nctx.fill();
      }

      if (panel.classList.contains('toy-zoomed')) {
        for (const node of nodeCoords) {
          if (!node.group) continue;
          const disabled = node.disabled || currentMap?.disabled?.[node.col]?.has(node.row);
          const outlineColor = node.group === 1
            ? 'rgba(125, 180, 255, 0.95)'
            : node.group === 2
              ? 'rgba(255, 160, 120, 0.95)'
              : 'rgba(255, 255, 255, 0.85)';
          const strokeAlpha = disabled ? 0.65 : 1;
          nctx.lineWidth = disabled ? 2 : 3.5;
          nctx.strokeStyle = outlineColor.replace(/0\.[0-9]+\)$/, `${strokeAlpha})`);
          nctx.beginPath();
          nctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
          nctx.stroke();
        }
      }

      for (const node of nodeCoords) {
        const colActive = currentMap?.active?.[node.col] ?? true;
        const nodeOn = colActive && !node.disabled;
        const flash = flashes[node.col] || 0;
        const size = radius * 2;
        const cubeRect = { x: node.x - size / 2, y: node.y - size / 2, w: size, h: size };

        nctx.save();
        if (flash > 0) {
          const scale = 1 + 0.15 * Math.sin(flash * Math.PI);
          nctx.translate(node.x, node.y);
          nctx.scale(scale, scale);
          nctx.translate(-node.x, -node.y);
        }
        drawBlock(nctx, cubeRect, {
          baseColor: flash > 0.01 ? '#FFFFFF' : (nodeOn ? '#ff8c00' : '#333'),
          active: flash > 0.01 || nodeOn,
          variant: 'button',
          noteLabel: null,
          showArrows: false,
        });
        nctx.restore();
      }

      drawNoteLabels(nodes);
      if (tutorialHighlightMode !== 'none') {
        renderTutorialHighlight();
      } else {
        clearTutorialHighlight();
      }

      nodeCoordsForHitTest = nodeCoords;
    });
  }

  function drawNoteLabels(nodes) {
    withIdentity(nctx, () => {
      nctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      nctx.font = '600 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      nctx.textAlign = 'center';
      nctx.textBaseline = 'alphabetic';
      const labelY = Math.round(cssH - 10);

      for (let c = 0; c < cols; c++) {
        if (!nodes[c] || nodes[c].size === 0) continue;
        let r = undefined;
        const disabledSet = currentMap?.disabled?.[c] || new Set();
        for (const row of nodes[c]) {
          if (!disabledSet.has(row)) { r = row; break; }
        }
        if (r === undefined) continue;
        const midiNote = chromaticPalette[r];
        if (midiNote === undefined) continue;
        const tx = Math.round(gridArea.x + c * cw + cw * 0.5);
        nctx.fillText(midiToName(midiNote), tx, labelY);
      }
    });
  }

  // --- Note Palettes for Snapping ---
  const pentatonicOffsets = [0, 3, 5, 7, 10];
  const chromaticOffsets = Array.from({length: 12}, (_, i) => i);
  // Create palettes of MIDI numbers. Reversed so top row is highest pitch.
  const chromaticPalette = buildPalette(48, chromaticOffsets, 1).reverse(); // MIDI 59 (B3) down to 48 (C3)
  const pentatonicPalette = buildPalette(48, pentatonicOffsets, 2).reverse(); // 10 notes from C3-C5 range
  const pentatonicPitchClasses = new Set(pentatonicOffsets.map(offset => ((offset % 12) + 12) % 12));

  function renderDragScaleBlueHints(ctx) {
    if (!ctx) return;
    if (typeof dragScaleHighlightCol !== 'number' || dragScaleHighlightCol < 0 || dragScaleHighlightCol >= cols) return;
    if (cw <= 0 || ch <= 0) return;
    const noteGridY = gridArea.y + topPad;
    const colX = gridArea.x + dragScaleHighlightCol * cw;
    const activeRow = (draggedNode && draggedNode.col === dragScaleHighlightCol) ? draggedNode.row : null;
    ctx.save();
    const strokeWidth = Math.max(1, Math.min(cw, ch) * 0.045);
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'butt';
    for (let r = 0; r < rows; r++) {
      const midi = chromaticPalette[r];
      if (typeof midi !== 'number') continue;
      const pitchClass = ((midi % 12) + 12) % 12;
      if (!pentatonicPitchClasses.has(pitchClass)) continue;
      const y = noteGridY + r * ch;
      const alpha = (activeRow === r) ? 0.6 : 0.35;
      ctx.fillStyle = `rgba(90, 200, 255, ${alpha})`;
      ctx.fillRect(colX, y, cw, ch);
      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = activeRow === r ? 'rgba(160, 240, 255, 0.95)' : 'rgba(130, 220, 255, 0.85)';
      ctx.strokeRect(colX, y, cw, ch);
    }
    ctx.restore();
  }

  function setDragScaleHighlight(col) {
    const next = (typeof col === 'number' && col >= 0 && col < cols) ? col : null;
    if (dragScaleHighlightCol === next) return;
    dragScaleHighlightCol = next;
    drawGrid();
    drawNodes(currentMap?.nodes || null);
  }

  function snapToGrid(sourceCtx = pctx){
    // build a map: for each column, choose at most one row where line crosses
    const active = Array(cols).fill(false);
    const nodes = Array.from({length:cols}, ()=> new Set());
    const disabled = Array.from({length:cols}, ()=> new Set());
    const w = paint.width;
    const h = paint.height;
    if (!w || !h) return { active, nodes, disabled }; // Abort if canvas is not ready
    const data = sourceCtx.getImageData(0, 0, w, h).data;

    for (let c=0;c<cols;c++){
      // Define the scan area strictly to the visible grid column to avoid phantom nodes
      const xStart_css = gridArea.x + c * cw;
      const xEnd_css = gridArea.x + (c + 1) * cw;
      const xStart = Math.round(xStart_css);
      const xEnd = Math.round(xEnd_css);
      
      let ySum = 0;
      let inkCount = 0;

      // Scan the column for all "ink" pixels to find the average Y position
      // We scan the full canvas height because the user can draw above or below the visual grid.
      for (let x = xStart; x < xEnd; x++) {
        for (let y = 0; y < h; y++) {
          const i = (y * w + x) * 4;
          if (data[i + 3] > 10) { // alpha threshold
            ySum += y;
            inkCount++;
          }
        }
      }

      if (inkCount > 0) {
        const avgY_dpr = ySum / inkCount;
        const avgY_css = avgY_dpr;

        const noteGridTop = gridArea.y + topPad;
        const noteGridBottom = noteGridTop + rows * ch;
        const isOutside = avgY_css <= noteGridTop || avgY_css >= noteGridBottom;

        if (isOutside) {
            // Find a default "in-key" row for out-of-bounds drawing.
            // This ensures disabled notes are still harmonically related.
            let safeRow = 7; // Fallback to a middle-ish row
            try {
                const visiblePentatonicNotes = pentatonicPalette.filter(p => chromaticPalette.includes(p));
                if (visiblePentatonicNotes.length > 0) {
                    // Pick a note from the middle of the available pentatonic notes.
                    const middleIndex = Math.floor(visiblePentatonicNotes.length / 2);
                    const targetMidi = visiblePentatonicNotes[middleIndex];
                    const targetRow = chromaticPalette.indexOf(targetMidi);
                    if (targetRow !== -1) safeRow = targetRow;
                }
            } catch {}
            nodes[c].add(safeRow);
            disabled[c].add(safeRow);
            active[c] = false; // This will be recomputed later, but good to be consistent
        } else {
            // Map average Y to nearest row, clamped to valid range.
            const r_clamped = Math.max(0, Math.min(rows - 1, Math.round((avgY_css - (gridArea.y + topPad)) / ch)));
            let r_final = r_clamped;

            if (autoTune) {
              // 1. Get the MIDI note for the visually-drawn row
              const drawnMidi = chromaticPalette[r_clamped];

              // 2. Find the nearest note in the pentatonic scale
              let nearestMidi = pentatonicPalette[0];
              let minDiff = Math.abs(drawnMidi - nearestMidi);
              for (const pNote of pentatonicPalette) {
                const diff = Math.abs(drawnMidi - pNote);
                if (diff < minDiff) { minDiff = diff; nearestMidi = pNote; }
              }

              // 3. Map that pentatonic note into the visible chromatic range by octave wrapping
              try {
                const minC = chromaticPalette[chromaticPalette.length - 1];
                const maxC = chromaticPalette[0];
                let wrapped = nearestMidi|0;
                while (wrapped > maxC) wrapped -= 12;
                while (wrapped < minC) wrapped += 12;
                const correctedRow = chromaticPalette.indexOf(wrapped);
                if (correctedRow !== -1) r_final = correctedRow;
              } catch {}
            }

            nodes[c].add(r_final);
            active[c] = true;
        }
      }
    }
    return {active, nodes, disabled};
  }

  function eraseNodeAtPoint(p) {
    const eraserRadius = getLineWidth();
    for (const node of [...nodeCoordsForHitTest]) { // Iterate on a copy
        const key = `${node.col}:${node.row}:${node.group ?? 'n'}`;
        if (erasedTargetsThisDrag.has(key)) continue;

        if (Math.hypot(p.x - node.x, p.y - node.y) < eraserRadius) {
            const col = node.col;
            const row = node.row;
            erasedTargetsThisDrag.add(key);

            if (currentMap && currentMap.nodes[col]) {
                // Do not remove groups or nodes; mark it disabled instead so connections persist (but gray)
                if (!persistentDisabled[col]) persistentDisabled[col] = new Set();
                persistentDisabled[col].add(row);
                // If no enabled nodes remain, mark column inactive
                const anyOn = Array.from(currentMap.nodes[col] || []).some(r => !persistentDisabled[col].has(r));
                currentMap.active[col] = anyOn;
            }

            // Start the animation of the erased node only
            animateErasedNode(node);
            // Notify the player of the change
            emitDrawgridUpdate({ activityOnly: false });
        }
    }
  }

  function onPointerDown(e){
    stopAutoGhostGuide({ immediate: false });
    const rect = paint.getBoundingClientRect();
    // Use shared w/h for coordinate mapping
    const p = {
      x: (e.clientX - rect.left) * (cssW > 0 ? cssW / rect.width : 1),
      y: (e.clientY - rect.top) * (cssH > 0 ? cssH / rect.height : 1)
    };
    
    // (Top cubes removed)

    // Check for node hit first using full grid cell bounds (bigger tap area)
    for (const node of nodeCoordsForHitTest) {
      const cellX = gridArea.x + node.col * cw;
      const cellY = gridArea.y + topPad + node.row * ch;
      if (p.x >= cellX && p.x <= cellX + cw && p.y >= cellY && p.y <= cellY + ch) {
        // With eraser active: erase paint and disable this node + attached lines coloration
        if (erasing) { erasedTargetsThisDrag.clear(); eraseNodeAtPoint(p); eraseAtPoint(p); return; }
        pendingNodeTap = { col: node.col, row: node.row, x: p.x, y: p.y, group: node.group ?? null };
        drawing = true; // capture move/up
        paint.setPointerCapture?.(e.pointerId);
        return; // Defer deciding until move/up
      }
    }

    drawing=true;
    paint.setPointerCapture?.(e.pointerId);

    // Live ink should draw straight to the visible canvas; suppress swaps during drag.
    if (typeof useFrontBuffers === 'function') useFrontBuffers();
    __dgSkipSwapsDuringDrag = true;

    if (erasing) {
      erasedTargetsThisDrag.clear();
      curErase = { pts: [p] };
    } else {
      // When starting a new line, don't clear the canvas. This makes drawing additive.
      // If we are about to draw a special line (previewGid decided), demote any existing line of that kind.
      try {
        const isZoomed = panel.classList.contains('toy-zoomed');
        const hasLine1 = strokes.some(s => s.generatorId === 1);
        const hasLine2 = strokes.some(s => s.generatorId === 2);
        let intendedGid = null;
        if (!isZoomed) {
          if (!hasLine1 && !hasLine2) intendedGid = 1;
        } else {
          if (!hasLine1) intendedGid = 1; else if (nextDrawTarget) intendedGid = nextDrawTarget;
        }
        if (intendedGid) {
          const existing = strokes.find(s => s.generatorId === intendedGid);
          if (existing) {
            existing.isSpecial = false;
            existing.generatorId = null;
            existing.overlayColorize = true;
            // assign a random palette color
            const idx = Math.floor(Math.random() * STROKE_COLORS.length);
            existing.color = STROKE_COLORS[idx];
          }
        }
      } catch {}
      cur = { 
        pts:[p],
        color: STROKE_COLORS[colorIndex++ % STROKE_COLORS.length]
      };
      try {
        particles.drawingDisturb(p.x, p.y, getLineWidth() * 2.0, 0.6);
      } catch(e) {}
      // The full stroke will be drawn on pointermove.
    }
  }
  function onPointerMove(e){
    const rect = paint.getBoundingClientRect();
    // Use shared w/h for coordinate mapping
    const p = {
      x: (e.clientX - rect.left) * (cssW > 0 ? cssW / rect.width : 1),
      y: (e.clientY - rect.top) * (cssH > 0 ? cssH / rect.height : 1)
    };
    if (!pctx) {
      DG.warn('pctx missing; forcing front buffers');
      if (typeof useFrontBuffers === 'function') useFrontBuffers();
    }
    
    // Update cursor for draggable nodes
    if (!draggedNode) {
      let onNode = false;
      for (const node of nodeCoordsForHitTest) {
        const cellX = gridArea.x + node.col * cw;
        const cellY = gridArea.y + topPad + node.row * ch;
        if (p.x >= cellX && p.x <= cellX + cw && p.y >= cellY && p.y <= cellY + ch) { onNode = true; break; }
      }
      paint.style.cursor = onNode ? 'grab' : 'default';
    }

    // Promote pending tap to drag if moved sufficiently
    if (pendingNodeTap && drawing && !draggedNode) {
      const dx = p.x - pendingNodeTap.x;
      const dy = p.y - pendingNodeTap.y;
      if (Math.hypot(dx, dy) > 6) {
        draggedNode = {
          col: pendingNodeTap.col,
          row: pendingNodeTap.row,
          group: pendingNodeTap.group ?? null,
          moved: false,
          originalRow: pendingNodeTap.row
        };
        paint.style.cursor = 'grabbing';
        pendingNodeTap = null;
        setDragScaleHighlight(draggedNode.col);
      }
    }

    if (draggedNode && drawing) {
      const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
      const newRow = clamp(Math.round((p.y - (gridArea.y + topPad)) / ch), 0, rows - 1);

      if (newRow !== draggedNode.row && currentMap) {
          const col = draggedNode.col;
          const oldRow = draggedNode.row;
          const gid = draggedNode.group ?? null;

          // Ensure group map exists for this column
          if (!nodeGroupMap[col]) nodeGroupMap[col] = new Map();
          const colGroupMap = nodeGroupMap[col];

          // Remove this group's presence from the old row's stack
          if (gid != null) {
            const oldArr = (colGroupMap.get(oldRow) || []).filter(g => g !== gid);
            if (oldArr.length > 0) colGroupMap.set(oldRow, oldArr); else colGroupMap.delete(oldRow);
          } else {
            // Ungrouped move: nothing in group map to update
          }

          // Update nodes set for old row only if no groups remain there
          if (!(colGroupMap.has(oldRow))) {
            // If some other ungrouped logic wants to keep it, ensure we don't remove erroneously
            currentMap.nodes[col].delete(oldRow);
          }

          // Add/move to new row; place on top of z-stack
          if (gid != null) {
            const newArr = colGroupMap.get(newRow) || [];
            // Remove any existing same gid first to avoid dupes, then push to end (top)
            const filtered = newArr.filter(g => g !== gid);
            filtered.push(gid);
            colGroupMap.set(newRow, filtered);
          }
          currentMap.nodes[col].add(newRow);

          // record manual override for standard view preservation
          try {
            if (!manualOverrides[col]) manualOverrides[col] = new Set();
            manualOverrides[col] = new Set(currentMap.nodes[col]);
          } catch {}

          draggedNode.row = newRow;
          draggedNode.moved = true;
          try {
            panel.dispatchEvent(new CustomEvent('drawgrid:node-drag', { detail: { col, row: newRow, group: gid } }));
          } catch {}
          
          // Redraw only the nodes canvas; the blue line on the paint canvas is untouched.
          drawNodes(currentMap.nodes);
          drawGrid();
      } else if (dragScaleHighlightCol === null) {
          setDragScaleHighlight(draggedNode.col);
      }
      return;
    }

    if (erasing) {
      const eraserRadius = getLineWidth();
      eraserCursor.style.transform = `translate(${p.x - eraserRadius}px, ${p.y - eraserRadius}px)`;
      if (drawing && curErase) {
        const lastPt = curErase.pts[curErase.pts.length - 1];
        // Draw a line segment for erasing
        pctx.save();
        pctx.globalCompositeOperation = 'destination-out';
        pctx.lineCap = 'round';
        pctx.lineJoin = 'round';
        pctx.lineWidth = getLineWidth() * 2;
        pctx.strokeStyle = '#000';
        pctx.beginPath();
        pctx.moveTo(lastPt.x, lastPt.y);
        pctx.lineTo(p.x, p.y);
        pctx.stroke();
        pctx.restore();
        curErase.pts.push(p);
        eraseNodeAtPoint(p);
      }
      return; // Don't do drawing logic if erasing
    }

    if (!drawing) return; // Guard for drawing logic below

    if (cur) {
      cur.pts.push(p);
      // Determine if current stroke is a special-line preview (show only on overlay)
      const isZoomed = panel.classList.contains('toy-zoomed');
      const hasLine1 = strokes.some(s => s.generatorId === 1);
      const hasLine2 = strokes.some(s => s.generatorId === 2);
      previewGid = null;
      if (!isZoomed) {
        // Standard: first stroke previews as Line 1 if none yet
        if (!hasLine1 && !hasLine2) previewGid = 1;
      } else {
        // Advanced: always preview Line 1 if not yet drawn; otherwise only when explicitly armed
        if (!hasLine1) previewGid = 1;
        else if (nextDrawTarget) previewGid = nextDrawTarget;
      }
      // For normal lines (no previewGid), paint segment onto paint; otherwise, overlay will show it
      if (!previewGid) {
        // live-draw to FRONT only; no swaps during drag
        drawLiveStrokePoint(pctx, cur.pts[cur.pts.length-1], cur.pts[cur.pts.length-2], cur.color);
        __dbgPointerMoves++; if ((__dbgPointerMoves % 5)===1) dbg('MOVE', {usingBackBuffers, pendingPaintSwap});
        __dgNeedsUIRefresh = false; // don't trigger overlay clears during draw
      }
      // Disturb particles for all lines, special or not.
      try {
        particles.drawingDisturb(p.x, p.y, getLineWidth() * 1.5, 0.4);
      } catch(e) {}

      const includeCurrent = !previewGid;
      // drawIntoBackOnly(includeCurrent);
      // pendingPaintSwap = true;
    }
  }
  function onPointerUp(e){
    __dgSkipSwapsDuringDrag = false;
    // Only defer/blank if a *zoom commit* is actually settling.
    const now = performance?.now?.() ?? Date.now();
    const settleTs = (typeof window !== 'undefined') ? window.__GESTURE_SETTLE_UNTIL_TS : 0;
    const inZoomCommit = Number.isFinite(settleTs) && settleTs > now;

    if (inZoomCommit) {
      __dgDeferUntilTs = Math.max(__dgDeferUntilTs, settleTs);
      __dgStableFramesAfterCommit = 0;          // only reset when a zoom commit is settling
      __dgNeedsUIRefresh = true;                // schedule safe clears
    } else {
      // No zoom commit -> do NOT schedule the deferred clears here
      // (avoids one-frame blank/freeze of particles/text on simple pointerup)
    }
    // IMPORTANT: do not clear here; renderLoop will do it safely.
    if (draggedNode) {
      const finalDetail = { col: draggedNode.col, row: draggedNode.row, group: draggedNode.group ?? null };
      const didMove = !!draggedNode.moved;
      if (didMove || inZoomCommit) __dgNeedsUIRefresh = true;
      emitDrawgridUpdate({ activityOnly: false });
      if (didMove) {
        try { panel.dispatchEvent(new CustomEvent('drawgrid:node-drag-end', { detail: finalDetail })); } catch {}
      }
      draggedNode = null;
      setDragScaleHighlight(null);
      drawing = false;
      paint.style.cursor = 'default';
      return;
    }

    // Tap on a node toggles column active state
    if (pendingNodeTap) {
      const col = pendingNodeTap.col;
      const row = pendingNodeTap.row;
      if (!currentMap) {
        currentMap = {
          active:Array(cols).fill(false),
          nodes:Array.from({length:cols},()=>new Set()),
          disabled:Array.from({length:cols},()=>new Set()),
        };
      }

      const dis = persistentDisabled[col] || new Set();
      if (dis.has(row)) dis.delete(row); else dis.add(row);
      persistentDisabled[col] = dis;
      currentMap.disabled[col] = dis;
      // Recompute column active: any node present and not disabled
      const anyOn = Array.from(currentMap.nodes[col] || []).some(r => !dis.has(r));
      currentMap.active[col] = anyOn;

      // Flash feedback on toggle
      flashes[col] = 1.0;
      useBackBuffers();
      drawGrid();
      drawNodes(currentMap.nodes);
      __dgNeedsUIRefresh = true;
      requestFrontSwap(useFrontBuffers);
      emitDrawgridUpdate({ activityOnly: false });
      panel.dispatchEvent(new CustomEvent('drawgrid:node-toggle', { detail: { col, row, disabled: dis.has(row) } }));

      const cx = gridArea.x + col * cw + cw * 0.5;
      const cy = gridArea.y + topPad + row * ch + ch * 0.5;
      const baseRadius = Math.max(6, Math.min(cw, ch) * 0.5);
      noteToggleEffects.push({ x: cx, y: cy, radius: baseRadius, progress: 0 });
      if (noteToggleEffects.length > 24) noteToggleEffects.splice(0, noteToggleEffects.length - 24);
      try { particles.pointBurst(cx, cy, 18, 2.4, 'skyblue'); } catch {}

      pendingNodeTap = null;
    }

    // If we were capturing the pointer but ended up not drawing or toggling anything,
    // we may still be in back-buffer mode from pointerdown. Do a safe no-op swap to
    // avoid a single-frame blank on release.
    if (!drawing) {
      // Background tap: only swap if we truly staged something.
      const needSwap = usingBackBuffers || pendingPaintSwap;
      if (needSwap) {
        if (!usingBackBuffers) ensureBackVisualsFreshFromFront();
        __dgNeedsUIRefresh = true;
        DG.log('onPointerUp: coalesced swap (staged)', { usingBackBuffers, pendingPaintSwap, DG_particlesRectsDrawn, DG_lettersDrawn });
        pendingPaintSwap = true;
        requestFrontSwap(useFrontBuffers);
      } else {
        __dgNeedsUIRefresh = false;
        // Nothing staged - don't poke the overlay clears; keeping visuals intact avoids a one-frame blank.
        DG.log('onPointerUp: no-op (no swap needed)');
      }
      return;
    }
    drawing=false;

    const strokeToProcess = cur;
    cur = null;

    if (erasing) {
      if (curErase) {
        // If it was just a tap (one point), erase a circle at that point.
        if (curErase.pts.length === 1) {
          eraseAtPoint(curErase.pts[0]);
          eraseNodeAtPoint(curErase.pts[0]);
        }
        eraseStrokes.push(curErase);
        curErase = null;
      }
      erasedTargetsThisDrag.clear();
      clearAndRedrawFromStrokes(); // Redraw to bake in the erase
      schedulePersistState();
      pendingPaintSwap = true;
      __dgNeedsUIRefresh = true;
      if (!zoomGestureActive) {
        if (!__swapRAF) {
          __swapRAF = requestAnimationFrame(() => {
            __swapRAF = null;
            swapBackToFront();
            pendingPaintSwap = false;
          });
        }
      }
      return;
    }

    if (!strokeToProcess) {
      // This was a background tap, not a drag that started on a node.
      // Fire activity event but don't modify strokes.
      emitDrawgridUpdate({ activityOnly: true });
      return;
    }

    // If the stroke was just a tap, don't treat it as a drawing.
    if (strokeToProcess.pts.length <= 1) {
      emitDrawgridUpdate({ activityOnly: true });
      return;
    }

    const isZoomed = panel.classList.contains('toy-zoomed');
    let shouldGenerateNodes = true;
    let isSpecial = false;
    let generatorId = null;

    if (isZoomed) {
        const hasLine1 = strokes.some(s => s.generatorId === 1);
        const hasLine2 = strokes.some(s => s.generatorId === 2);

        if (!hasLine1) {
            // No lines exist, this new one is Line 1.
            shouldGenerateNodes = true;
            isSpecial = true;
            generatorId = 1;
        } else if (nextDrawTarget) {
            // A "Draw Line" button was explicitly clicked.
            shouldGenerateNodes = true;
            isSpecial = true;
            generatorId = nextDrawTarget;
            nextDrawTarget = null; // consume target so subsequent swipes follow natural order
        } else {
            // No target armed: decorative line (no nodes)
            shouldGenerateNodes = false;
        }
        nextDrawTarget = null; // Always reset after a draw completes
        try { (panel.__dgUpdateButtons || updateGeneratorButtons)(); } catch(e){ }
    } else { // Standard view logic (unchanged)
        const hasNodes = currentMap && currentMap.nodes.some(s => s.size > 0);
        // If a special line already exists, this new line is decorative.
        // If the user wants to draw a *new* generator line, they should clear first.
        const hasSpecialLine = strokes.some(s => s.isSpecial || s.generatorId);
        if (hasSpecialLine) {
            shouldGenerateNodes = false;
        } else {
            isSpecial = true;
            generatorId = 1; // Standard view's first line is functionally Line 1
            // In standard view, a new generator line should replace any old decorative lines.
            strokes = [];
        }
    }
    
    // Debug: log the decision for this stroke
    strokeToProcess.isSpecial = isSpecial;
    strokeToProcess.generatorId = generatorId;
    strokeToProcess.justCreated = true; // Mark as new to exempt from old erasures
    if (!strokeToProcess.generatorId && typeof strokeToProcess.isSpecial !== 'boolean') {
      strokeToProcess.isSpecial = true;
    }
    strokes.push(strokeToProcess);

    // Redraw back for consistency, and regenerate nodes
    clearAndRedrawFromStrokes();

    // Commit to front immediately
    withIdentity(pctx, () => { drawFullStroke(pctx, strokeToProcess); });

    // No swap needed
    __dgNeedsUIRefresh = true;
    // After drawing, unmark all strokes so they become part of the normal background for the next operation.
    strokes.forEach(s => delete s.justCreated);
    schedulePersistState();

    try {
      syncLetterFade();
    } catch (e) { /* ignore */ }
  }

  // A version of snapToGrid that analyzes a single stroke object instead of the whole canvas
  function snapToGridFromStroke(stroke) {
    // Check for cached nodes, but only if the column count matches.
    if (stroke.cachedNodes && stroke.cachedCols === cols) {
      return stroke.cachedNodes;
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = paint.width;
    tempCanvas.height = paint.height;
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
    if (!tempCtx) return {
        active: Array(cols).fill(false),
        nodes: Array.from({length:cols}, ()=> new Set()),
        disabled: Array.from({length:cols}, ()=> new Set())
    };

    drawFullStroke(tempCtx, stroke);
    // Pass the temporary context to the main snapToGrid function
    const result = snapToGrid(tempCtx);
    // Cache the result against the current column count.
    try { stroke.cachedNodes = result; stroke.cachedCols = cols; } catch {}
    return result;
  }

  paint.addEventListener('pointerdown', onPointerDown);
  paint.addEventListener('pointermove', onPointerMove);
  paint.addEventListener('pointerenter', () => {
    if (erasing) eraserCursor.style.display = 'block';
  });
  paint.addEventListener('pointerleave', () => {
    eraserCursor.style.display = 'none';
    paint.style.cursor = 'default';
  });
  window.addEventListener('pointerup', onPointerUp);
  // Coalesce relayouts on wheel/resize to keep pointer math in sync with zoom changes
  let relayoutScheduled = false;
  function scheduleRelayout(force = true){
    if (relayoutScheduled) return; relayoutScheduled = true;
    requestAnimationFrame(() => { relayoutScheduled = false; layout(force); });
  }
  observer.observe(body);

  panel.addEventListener('drawgrid:playcol', (e) => {
    const col = e?.detail?.col;
    playheadCol = col;
    if (col >= 0 && col < cols) {
        if (currentMap?.active[col]) {
            let pulseTriggered = false;
            flashes[col] = 1.0;
            // Add flashes for the grid cells that are playing
            const nodesToFlash = currentMap.nodes[col];
            if (nodesToFlash && nodesToFlash.size > 0) {
                for (const row of nodesToFlash) {
                    const isDisabled = currentMap.disabled?.[col]?.has(row);
                    if (!isDisabled) {
                        if (!pulseTriggered) {
                            panel.__pulseHighlight = 1.0;
                            panel.__pulseRearm = true;
                            pulseTriggered = true;
                        }
                        cellFlashes.push({ col, row, age: 1.0 });
                        try {
                            const x = gridArea.x + col * cw + cw * 0.5;
                            const y = gridArea.y + topPad + row * ch + ch * 0.5;
                            // Heavily push particles away from the triggering node
                            particles.drawingDisturb(x, y, cw * 1.2, 2.5);
                            particles.pointBurst(x, y, 25, 3.0, 'pink');
                        } catch(e) {}
                    }
                }
            }
        }
    }
  });

  let rafId = 0;
    function renderLoop() {
    if (!panel.__dgFrame) panel.__dgFrame = 0;
    panel.__dgFrame++;
    const nowTs = performance?.now?.() ?? Date.now();
    const inCommitWindow = __dgInCommitWindow(nowTs);
    if (inCommitWindow) {
      __dgStableFramesAfterCommit = 0; // still settling - do nothing destructive
    } else if (__dgStableFramesAfterCommit < 2) {
      __dgStableFramesAfterCommit++; // count a couple of stable frames
    }

    const waitingForStable = inCommitWindow;
    const allowOverlayDraw = !waitingForStable;
    const allowParticleDraw = true;                 // particles should never freeze
    dgf('start', { f: panel.__dgFrame|0, cssW, cssH, allowOverlayDraw, allowParticleDraw });
    if (!ensureSizeReady()) {
      rafId = requestAnimationFrame(renderLoop);
      return;
    }
    const frameCam = overlayCamState || (typeof getFrameStartState === 'function' ? getFrameStartState() : null);
    if (frameCam && Number.isFinite(frameCam.scale)) {
      if (!Number.isFinite(boardScale) || Math.abs(boardScale - frameCam.scale) > 1e-4) {
        boardScale = frameCam.scale;
      }
    }
    if (frameCam && !panel.__dgFrameCamLogged) {
      const isProd = (typeof process !== 'undefined') && (process?.env?.NODE_ENV === 'production');
      if (!isProd && DG_DEBUG && DBG_DRAW) {
        try { console.debug('[DG][overlay] frameStart camera', frameCam); } catch {}
      }
      panel.__dgFrameCamLogged = true;
    }
    const particleDrawCtx = particleCtx || pctx || frontCanvas?.getContext?.('2d');
    try {
      if (allowParticleDraw) {
        const dtMs = Number.isFinite(frameCam?.dt) ? frameCam.dt : 16.6;
        const dt = Number.isFinite(dtMs) ? dtMs / 1000 : (1 / 60);
        particles?.step?.(dt);
        if (particleDrawCtx) {
          withIdentity(particleDrawCtx, () => {
            const surface = particleDrawCtx.canvas;
            const width = surface?.width ?? cssW;
            const height = surface?.height ?? cssH;
            particleDrawCtx.clearRect(0, 0, width, height);
          });
          particles?.draw?.(particleDrawCtx, zoomGestureActive);
        }
      }
    } catch (e) {
      dglog('particles.draw:error', String((e && e.message) || e));
    }

    try {
      drawGrid();
      if (currentMap) drawNodes(currentMap.nodes);
    } catch (e) {
      dglog('drawGrid:error', String((e && e.message) || e));
    }


    if (__dgFrontSwapNextDraw && typeof requestFrontSwap === 'function') {
      __dgFrontSwapNextDraw = false;
      try { requestFrontSwap(); } catch (err) { dgs('error', String((err && err.message) || err)); }
    }
    const dgr = panel?.getBoundingClientRect?.();
    //console.debug('[DIAG][DG] frame', {
      //f: panel.__dgFrame,
      //lastPointerup: window.__LAST_POINTERUP_DIAG__,
      //box: dgr ? { x: dgr.left, y: dgr.top, w: dgr.width, h: dgr.height } : null,
    //});
    if (!dgNonReactive() && __dgNeedsUIRefresh && __dgStableFramesAfterCommit >= 2) {
      __dgNeedsUIRefresh = false;
      __dgDeferUntilTs = 0;
      try {
        if (typeof ensureBackVisualsFreshFromFront === 'function') {
          ensureBackVisualsFreshFromFront();
        }
        if (ghostCtx?.canvas) {
          withIdentity(ghostCtx, () => ghostCtx.clearRect(0, 0, ghostCtx.canvas.width, ghostCtx.canvas.height));
        }
        if (fctx?.canvas) {
          withIdentity(fctx, () => fctx.clearRect(0, 0, fctx.canvas.width, fctx.canvas.height));
        }
        if (tutorialCtx?.canvas) {
          withIdentity(tutorialCtx, () => {
            const active = getActiveTutorialCanvas();
            const tw = active?.width || 0;
            const th = active?.height || 0;
            tutorialCtx.clearRect(0, 0, tw, th);
          });
        }
      } catch (err) {
        DG.warn('deferred UI clear failed', err);
      }
    }
    if (!panel.isConnected) { cancelAnimationFrame(rafId); return; }

    if (panel.__pulseRearm) {
      panel.classList.remove('toy-playing-pulse');
      try { panel.offsetWidth; } catch {}
      panel.__pulseRearm = false;
    }

    if (panel.__pulseHighlight && panel.__pulseHighlight > 0) {
      panel.classList.add('toy-playing-pulse');
      panel.__pulseHighlight = Math.max(0, panel.__pulseHighlight - 0.05);
    } else if (panel.classList.contains('toy-playing-pulse')) {
      panel.classList.remove('toy-playing-pulse');
    }

    // Set playing class for border highlight
    const isActiveInChain = panel.dataset.chainActive === 'true';
    const isChained = !!(panel.dataset.nextToyId || panel.dataset.prevToyId);
    const hasActiveNotes = currentMap && currentMap.active && currentMap.active.some(a => a);

    const head = isChained ? findChainHead(panel) : panel;
    const chainHasNotes = head ? chainHasSequencedNotes(head) : hasActiveNotes;

    let showPlaying;
    if (isRunning()) {
        // A chained toy only shows its highlight if the chain itself currently has notes.
        showPlaying = isChained ? (isActiveInChain && chainHasNotes) : hasActiveNotes;
    } else {
        showPlaying = isChained ? chainHasNotes : hasActiveNotes;
    }
    panel.classList.toggle('toy-playing', showPlaying);

    const flashSurface = getActiveFlashCanvas();
    const ghostSurface = getActiveGhostCanvas();

    // --- other overlay layers still respect allowOverlayDraw ---
    if (allowOverlayDraw) {
      // Clear flash canvas for this frame's animations
      withIdentity(fctx, () => {
        fctx.clearRect(0, 0, flashSurface.width, flashSurface.height);
      });

      // Animate special stroke paint (hue cycling) without resurrecting erased areas:
      // Draw animated special strokes into flashCanvas, then mask with current paint alpha.
      const specialStrokes = strokes.filter(s => s.isSpecial);
      if (specialStrokes.length > 0 || (cur && previewGid)) {
          fctx.save();
          // Draw animated strokes with device transform
          // Draw demoted colorized strokes as static overlay tints
          try {
            const colorized = strokes.filter(s => s.overlayColorize);
            for (const s of colorized) drawFullStroke(fctx, s);
          } catch {}
          // Then draw animated special lines on top of normal lines
          for (const s of specialStrokes) drawFullStroke(fctx, s);
          // Mask with paint alpha without scaling (device pixels)
          fctx.setTransform(1, 0, 0, 1, 0, 0);
          fctx.globalCompositeOperation = 'destination-in';
          fctx.drawImage(paint, 0, 0);
          // Now draw current special preview ON TOP unmasked, so full stroke is visible while drawing
          if (cur && previewGid && cur.pts && cur.pts.length) {
            fctx.setTransform(1, 0, 0, 1, 0, 0);
            fctx.globalCompositeOperation = 'source-over';
            const preview = { pts: cur.pts, isSpecial: true, generatorId: previewGid };
            drawFullStroke(fctx, preview);
          }
          fctx.restore();
      } else {
      }
    }

    for (let i = 0; i < flashes.length; i++) {
        if (flashes[i] > 0) {
            flashes[i] = Math.max(0, flashes[i] - 0.08);
        }
    }

    if (allowOverlayDraw) {
      // Draw cell flashes
      try {
          if (cellFlashes.length > 0) {
              fctx.save();
              for (let i = cellFlashes.length - 1; i >= 0; i--) {
                  const flash = cellFlashes[i];
                  const x = gridArea.x + flash.col * cw;
                  const y = gridArea.y + topPad + flash.row * ch;
                  
                  fctx.globalAlpha = flash.age * 0.6; // Make it a bit more visible
                  fctx.fillStyle = 'rgb(143, 168, 255)'; // Match grid line color
                  fctx.fillRect(x, y, cw, ch);
                  
                  flash.age -= 0.05; // Decay rate
                  if (flash.age <= 0) {
                      cellFlashes.splice(i, 1);
                  }
              }
              fctx.restore();
          }
      } catch (e) { /* fail silently */ }
    }

    if (noteToggleEffects.length > 0) {
      try {
        if (allowOverlayDraw) {
          fctx.save();
          for (let i = noteToggleEffects.length - 1; i >= 0; i--) {
            const effect = noteToggleEffects[i];
            effect.progress += 0.12;
            const alpha = Math.max(0, 1 - effect.progress);
            if (alpha <= 0) {
              noteToggleEffects.splice(i, 1);
              continue;
            }
            const radius = effect.radius * (1 + effect.progress * 1.6);
            const lineWidth = Math.max(1.2, effect.radius * 0.28 * (1 - effect.progress * 0.5));
            fctx.globalAlpha = alpha;
            fctx.lineWidth = lineWidth;
            fctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
            fctx.beginPath();
            fctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
            fctx.stroke();
          }
          fctx.restore();
        } else {
          // Even if we skip drawing, continue advancing animations so they stay in sync.
          for (let i = noteToggleEffects.length - 1; i >= 0; i--) {
            const effect = noteToggleEffects[i];
            effect.progress += 0.12;
            const alpha = Math.max(0, 1 - effect.progress);
            if (alpha <= 0) {
              noteToggleEffects.splice(i, 1);
            }
          }
        }
      } catch {}
    }

    // Draw scrolling playhead
    if (allowOverlayDraw) {
      try {
        const info = getLoopInfo();
        const phaseJustWrapped = info.phase01 < localLastPhase && localLastPhase > 0.9;
        localLastPhase = info.phase01;

      // Only draw and repulse particles if transport is running and this toy is the active one in its chain.
      // If this toy thinks it's active, but the global transport phase just wrapped,
      // it's possible its active status is stale. Skip one frame of playhead drawing
      // to wait for the scheduler to update the `data-chain-active` attribute.
      const probablyStale = isActiveInChain && phaseJustWrapped;

      if (info && isRunning() && isActiveInChain && !probablyStale) {
        // Calculate playhead X position based on loop phase
        const playheadX = gridArea.x + info.phase01 * gridArea.w;

        // Repulse particles at playhead position
        try {
          // A strength of 1.2 gives a nice, visible push.
          particles.lineRepulse(playheadX, cw, 0.33);
        } catch (e) { /* fail silently */ }

        // Use the flash canvas (fctx) for the playhead. It's cleared each frame.
        fctx.save();

        // Width of the soft highlight band scales with a column, clamped
        const gradientWidth = Math.round(
          Math.max(0.8 * cw, Math.min(gridArea.w * 0.08, 2.2 * cw))
        );
        const t = performance.now();
        const hue = 200 + 20 * Math.sin((t / 800) * Math.PI * 2);
        const midColor = `hsla(${(hue + 45).toFixed(0)}, 100%, 70%, 0.25)`;

        const bgGrad = fctx.createLinearGradient(playheadX - gradientWidth / 2, 0, playheadX + gradientWidth / 2, 0);
        bgGrad.addColorStop(0, 'rgba(0,0,0,0)');
        bgGrad.addColorStop(0.5, midColor);
        bgGrad.addColorStop(1, 'rgba(0,0,0,0)');

        fctx.fillStyle = bgGrad;
        fctx.fillRect(playheadX - gradientWidth / 2, gridArea.y, gradientWidth, gridArea.h);

        // Optional: scale shadow/line widths a bit with cw
        const trailLineWidth = Math.max(1.5, cw * 0.08);
        fctx.lineWidth = trailLineWidth;

        // Create a vertical gradient that mimics the "Line 1" animated gradient.
        const grad = fctx.createLinearGradient(playheadX, gridArea.y, playheadX, gridArea.y + gridArea.h);
        grad.addColorStop(0, `hsl(${hue.toFixed(0)}, 100%, 70%)`);
        grad.addColorStop(0.5, `hsl(${(hue + 45).toFixed(0)}, 100%, 70%)`);
        grad.addColorStop(1,  `hsl(${(hue + 90).toFixed(0)}, 100%, 68%)`);

        // --- Trailing lines ---
        fctx.strokeStyle = grad; // Use same gradient for all
        fctx.shadowColor = 'transparent'; // No shadow for trails
        fctx.shadowBlur = 0;

        const trailLineCount = 3;
        const gap = 28; // A constant, larger gap
        for (let i = 0; i < trailLineCount; i++) {
            const trailX = playheadX - (i + 1) * gap;
            fctx.globalAlpha = 0.6 - i * 0.18;
            fctx.lineWidth = Math.max(1.0, 2.5 - i * 0.6);
            fctx.beginPath();
            fctx.moveTo(trailX, gridArea.y);
            fctx.lineTo(trailX, gridArea.y + gridArea.h);
            fctx.stroke();
        }
        fctx.globalAlpha = 1.0; // Reset for main line

        fctx.strokeStyle = grad;
        fctx.lineWidth = 3;
        fctx.shadowColor = 'rgba(255, 255, 255, 0.7)';
        fctx.shadowBlur = 8;

        fctx.beginPath();
        fctx.moveTo(playheadX, gridArea.y);
        fctx.lineTo(playheadX, gridArea.y + gridArea.h);
        fctx.stroke();

        fctx.restore();
      }
      } catch (e) { /* fail silently */ }
    } else {
      const info = getLoopInfo();
      if (info) {
        localLastPhase = info.phase01;
      }
    }

    // Debug overlay
    if (allowOverlayDraw && window.DEBUG_DRAWGRID === 1) {
      fctx.save();
      fctx.strokeStyle = 'red';
      fctx.lineWidth = 1;
      const debugSurface = getActiveFlashCanvas();
      const dbgW = debugSurface?.width ?? cssW;
      const dbgH = debugSurface?.height ?? cssH;
      fctx.strokeRect(0, 0, dbgW, dbgH);
      fctx.fillStyle = 'red';
      fctx.font = '12px monospace';
      const pxScale = dbgW ? (paint.width / dbgW).toFixed(2) : 'n/a';
      fctx.fillText(`boardScale: ${boardScale.toFixed(2)}`, 5, 15);
      fctx.fillText(`w x h: ${dbgW} x ${dbgH}`, 5, 30);
      fctx.fillText(`pixelScale: ${pxScale}`, 5, 45);
      fctx.restore();
    }

    dgf('end', { f: panel.__dgFrame|0 });
    rafId = requestAnimationFrame(renderLoop);
  }
  rafId = requestAnimationFrame(renderLoop);

  function captureState() {
    try {
      const serializeSetArr = (arr) => Array.isArray(arr) ? arr.map(s => Array.from(s || [])) : [];
      const serializeNodes = (arr) => Array.isArray(arr) ? arr.map(s => Array.from(s || [])) : [];
      const normPt = (p) => {
        try {
          const nx = (gridArea.w > 0) ? (p.x - gridArea.x) / gridArea.w : 0;
          const gh = Math.max(1, gridArea.h - topPad);
          const ny = gh > 0 ? (p.y - (gridArea.y + topPad)) / gh : 0;
          return { nx, ny };
        } catch { return { nx: 0, ny: 0 }; }
      };
      return {
        steps: cols | 0,
        autotune: !!autoTune,
        strokes: (strokes || []).map(s => ({
          ptsN: Array.isArray(s.pts) ? s.pts.map(normPt) : [],
          color: s.color,
          isSpecial: !!s.isSpecial,
          generatorId: (typeof s.generatorId === 'number') ? s.generatorId : undefined,
          overlayColorize: !!s.overlayColorize,
        })),
        eraseStrokes: (eraseStrokes || []).map(s => ({
          ptsN: Array.isArray(s.pts) ? s.pts.map(normPt) : [],
        })),
        nodes: {
          active: (currentMap?.active && Array.isArray(currentMap.active)) ? currentMap.active.slice() : Array(cols).fill(false),
          disabled: serializeSetArr(persistentDisabled || []),
          list: serializeNodes(currentMap?.nodes || []),
          groups: (nodeGroupMap || []).map(m => m instanceof Map ? Array.from(m.entries()) : []),
        },
        manualOverrides: Array.isArray(manualOverrides) ? manualOverrides.map(s => Array.from(s || [])) : [],
      };
    } catch (e) {
      return { steps: cols | 0, autotune: !!autoTune };
    }
  }

  function restoreFromState(state) {
    const prevRestoring = isRestoring;
    isRestoring = true;
    try {
      clearCanvas(pctx);
      clearCanvas(nctx);
      const flashSurface = getActiveFlashCanvas();
      withIdentity(fctx, () => fctx.clearRect(0, 0, flashSurface.width, flashSurface.height));

      const denormPt = (nx, ny) => {
        const gh = Math.max(1, gridArea.h - topPad);
        return {
          x: gridArea.x + nx * gridArea.w,
          y: gridArea.y + topPad + ny * gh,
        };
      };

      strokes = (state?.strokes || []).map(s => ({
        pts: (s.ptsN || []).map(p => denormPt(p.nx || 0, p.ny || 0)),
        color: s.color,
        isSpecial: !!s.isSpecial,
        generatorId: (typeof s.generatorId === 'number') ? s.generatorId : undefined,
        overlayColorize: !!s.overlayColorize,
      }));

      eraseStrokes = (state?.eraseStrokes || []).map(s => ({
        pts: (s.ptsN || []).map(p => denormPt(p.nx || 0, p.ny || 0)),
      }));

      regenerateMapFromStrokes();
      currentMap = normalizeMapColumns(currentMap, cols);

      withIdentity(pctx, () => {
        clearCanvas(pctx);
        for (const s of strokes) drawFullStroke(pctx, s);
      });

      emitDrawgridUpdate({ activityOnly: false });
      drawGrid();
      if (currentMap) drawNodes(currentMap.nodes);
    } catch (e) {
      emitDrawgridUpdate({ activityOnly: false });
    } finally {
      isRestoring = prevRestoring;
      try {
        const hasStrokes = Array.isArray(strokes) && strokes.length > 0;
        const hasErase = Array.isArray(eraseStrokes) && eraseStrokes.length > 0;
        const hasNodes = Array.isArray(currentMap?.nodes)
          ? currentMap.nodes.some(set => set && set.size > 0)
          : false;

        if (hasStrokes || hasErase || hasNodes) {
          schedulePersistState();
        }
      } catch {
        // Ignore persist errors during hydration; keep prior local save intact.
      }
    }
  }

  const api = {
    panel,
    startGhostGuide,
    stopGhostGuide,
    clear: ()=>{
      clearCanvas(pctx);
      clearCanvas(nctx);
      const flashSurface = getActiveFlashCanvas();
      withIdentity(fctx, () => {
        fctx.clearRect(0, 0, flashSurface.width, flashSurface.height);
      });
      strokes = [];
      eraseStrokes = [];
      manualOverrides = Array.from({ length: cols }, () => new Set());
      persistentDisabled = Array.from({ length: cols }, () => new Set());
      const emptyMap = {active:Array(cols).fill(false),nodes:Array.from({length:cols},()=>new Set()), disabled:Array.from({length:cols},()=>new Set())};
      currentMap = emptyMap;
      emitDrawgridUpdate({ activityOnly: false });
      drawGrid();
      nextDrawTarget = null; // Disarm any pending line draw
      updateGeneratorButtons(); // Refresh button state to "Draw"
      noteToggleEffects = [];
    },
    setErase:(v)=>{ erasing=!!v; },
    getState: captureState,
    hasActiveNotes: () => {
      try {
        return !!(currentMap?.active && currentMap.active.some(Boolean));
      } catch { return false; }
    },
    restoreState: restoreFromState,
    setState: (st={})=>{
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!panel.isConnected) return;
          isRestoring = true;
          try{
            // Steps first
            if (typeof st.steps === 'number' && (st.steps===8 || st.steps===16)){
              if ((st.steps|0) !== cols){
                cols = st.steps|0;
                currentCols = cols;
                panel.dataset.steps = String(cols);
                flashes = new Float32Array(cols);
                persistentDisabled = Array.from({ length: cols }, () => new Set());
                manualOverrides = Array.from({ length: cols }, () => new Set());
                // Force layout for new resolution
                resnapAndRedraw(true);
              }
            }
            // Ensure geometry is current before de-normalizing
            try{ layout(true); }catch{}
            if (typeof st.autotune !== 'undefined') {
              autoTune = !!st.autotune;
              try{
                const btn = panel.querySelector('.drawgrid-autotune');
                if (btn){ btn.textContent = `Auto-tune: ${autoTune ? 'On' : 'Off'}`; btn.setAttribute('aria-pressed', String(autoTune)); }
              }catch{}
            }
            // Restore strokes (fallback to persisted paint data if external state omits it)
            const hasIncomingStrokes = Object.prototype.hasOwnProperty.call(st, 'strokes');
            const incomingStrokes = Array.isArray(st.strokes) ? st.strokes : null;
            const fallbackStrokes = (!hasIncomingStrokes && Array.isArray(fallbackHydrationState?.strokes) && fallbackHydrationState.strokes.length > 0)
              ? fallbackHydrationState.strokes
              : null;
            const strokeSource = (incomingStrokes && incomingStrokes.length > 0) ? incomingStrokes : fallbackStrokes;
            if (strokeSource) {
              strokes = [];
              for (const s of strokeSource){
                let pts = [];
                if (Array.isArray(s?.ptsN)){
                  const gh = Math.max(1, gridArea.h - topPad);
                  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
                  pts = s.ptsN.map(np=>({
                    x: gridArea.x + clamp(Number(np?.nx)||0, 0, 1) * gridArea.w,
                    y: (gridArea.y + topPad) + clamp(Number(np?.ny)||0, 0, 1) * gh
                  }));
                } else if (Array.isArray(s?.pts)) {
                  // Legacy raw points fallback
                  pts = s.pts.map(p=>({ x: Number(p.x)||0, y: Number(p.y)||0 }));
                }
                const stroke = {
                  pts,
                  color: s?.color || STROKE_COLORS[0],
                  isSpecial: !!s?.isSpecial,
                  generatorId: (typeof s?.generatorId==='number') ? s.generatorId : undefined,
                  overlayColorize: !!s?.overlayColorize,
                };
                strokes.push(stroke);
              }
              clearAndRedrawFromStrokes();
            } else if (hasIncomingStrokes && Array.isArray(st.strokes)) {
              const hasFallback = Array.isArray(fallbackHydrationState?.strokes) && fallbackHydrationState.strokes.length > 0;
              if (!hasFallback) {
                strokes = [];
                clearAndRedrawFromStrokes();
              }
            }

            const hasIncomingErase = Object.prototype.hasOwnProperty.call(st, 'eraseStrokes');
            const incomingEraseStrokes = Array.isArray(st.eraseStrokes) ? st.eraseStrokes : null;
            const fallbackEraseStrokes = (!hasIncomingErase && Array.isArray(fallbackHydrationState?.eraseStrokes) && fallbackHydrationState.eraseStrokes.length > 0)
              ? fallbackHydrationState.eraseStrokes
              : null;
            const eraseSource = (incomingEraseStrokes && incomingEraseStrokes.length > 0) ? incomingEraseStrokes : fallbackEraseStrokes;
            if (eraseSource) {
              eraseStrokes = [];
              for (const s of eraseSource) {
                let pts = [];
                if (Array.isArray(s?.ptsN)) {
                  const gh = Math.max(1, gridArea.h - topPad);
                  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
                  pts = s.ptsN.map(np=>({
                    x: gridArea.x + clamp(Number(np?.nx)||0, 0, 1) * gridArea.w,
                    y: (gridArea.y + topPad) + clamp(Number(np?.ny)||0, 0, 1) * gh
                  }));
                }
                eraseStrokes.push({ pts });
              }
              clearAndRedrawFromStrokes();
            } else if (hasIncomingErase && Array.isArray(st.eraseStrokes)) {
              const hasFallbackErase = Array.isArray(fallbackHydrationState?.eraseStrokes) && fallbackHydrationState.eraseStrokes.length > 0;
              if (!hasFallbackErase) {
                eraseStrokes = [];
                clearAndRedrawFromStrokes();
              }
            }
            // Restore node masks if provided
            if (st.nodes && typeof st.nodes==='object'){
              try{
                const act = Array.isArray(st.nodes.active) ? st.nodes.active.slice(0, cols) : null;
                const dis = Array.isArray(st.nodes.disabled) ? st.nodes.disabled.slice(0, cols).map(a => new Set(a || [])) : null;
                const list = Array.isArray(st.nodes.list) ? st.nodes.list.slice(0, cols).map(a => new Set(a || [])) : null;
                const groups = Array.isArray(st.nodes.groups) ? st.nodes.groups.map(g => new Map(g || [])) : null;

                // If a node list is present in the saved state, it is the source of truth.
                if (list) {
                    if (!currentMap) {
                        // If strokes were not restored, currentMap is null. Build it from saved node list.
                        currentMap = { active: Array(cols).fill(false), nodes: list, disabled: Array.from({length:cols},()=>new Set()) };
                    } else {
                        // If strokes were restored, currentMap exists. Overwrite its nodes with the saved list.
                        currentMap.nodes = list;
                    }
                }

                if (currentMap && (act || dis || groups)) {
                    if (groups) nodeGroupMap = groups;
                    for (let c = 0; c < cols; c++) {
                        if (act && act[c] !== undefined) currentMap.active[c] = !!act[c];
                        if (dis && dis[c] !== undefined) currentMap.disabled[c] = dis[c];
                    }
                }

                  persistentDisabled = currentMap.disabled;

                  drawGrid();
                  drawNodes(currentMap.nodes);
                  try{ 
                    emitDrawgridUpdate({ activityOnly: false });
                  }catch{}
              } catch(e){ }
            }
            if (Array.isArray(st.manualOverrides)){
              try{ manualOverrides = st.manualOverrides.slice(0, cols).map(a=> new Set(a||[])); }catch{}
            }
            // Refresh UI affordances
            try { (panel.__dgUpdateButtons || updateGeneratorButtons)(); } catch{}
            // After all state is applied and layout is stable, sync the dropdown.
            try {
              const stepsSel = panel.querySelector('.drawgrid-steps');
              if (stepsSel) stepsSel.value = String(cols);
            } catch {}
            if (currentMap){ 
              try{
                emitDrawgridUpdate({ activityOnly: false });
              }catch{}
            }
          }catch(e){ }
          isRestoring = false;
          // Re-check after hydration completes
          stopAutoGhostGuide({ immediate: false });
          scheduleGhostIfEmpty({ initialDelay: 0 });
          schedulePersistState();
        });
      });
    }
  };

  // Add some CSS for the new buttons
  const style = document.createElement('style');
  style.textContent = `
      .toy-panel[data-toy="drawgrid"] .drawgrid-generator-buttons {
          position: absolute;
          left: -115px; /* Position outside the panel */
          top: 50%;
          transform: translateY(-50%);
          display: none; /* Hidden by default */
          flex-direction: column;
          gap: 10px;
          z-index: 1;
      }
      .toy-panel[data-toy="drawgrid"].toy-zoomed .drawgrid-generator-buttons {
          display: flex; /* Visible only in advanced mode */
      }
      .toy-panel[data-toy="drawgrid"] .c-btn.active .c-btn-glow {
          opacity: 1;
          filter: blur(2.5px) brightness(1.6);
      }
      .toy-panel[data-toy="drawgrid"] .c-btn.active .c-btn-core::before {
          filter: brightness(1.8);
          transform: translate(-50%, -50%) scale(1.1);
      }
  `;
  panel.appendChild(style);

  function createRandomLineStroke() {
    const leftX = gridArea.x;
    const rightX = gridArea.x + gridArea.w;
    const minY = gridArea.y + topPad + ch; // Inset by one full row from the top
    const maxY = gridArea.y + topPad + (rows - 1) * ch; // Inset by one full row from the bottom
    const K = Math.max(6, Math.round(gridArea.w / Math.max(1, cw*0.9))); // control points
    const cps = [];
    for (let i=0;i<K;i++){
      const t = i/(K-1);
      const x = leftX + (rightX-leftX)*t;
      const y = minY + Math.random() * (maxY - minY);
      cps.push({ x, y });
    }
    function cr(p0,p1,p2,p3,t){ const t2=t*t, t3=t2*t; const a = (-t3+2*t2-t)/2, b = (3*t3-5*t2+2)/2, c = (-3*t3+4*t2+t)/2, d = (t3-t2)/2; return a*p0 + b*p1 + c*p2 + d*p3; }
    const pts = [];
    const samplesPerSeg = Math.max(8, Math.round(cw/3));
    for (let i=0;i<cps.length-1;i++){
      const p0 = cps[Math.max(0,i-1)], p1=cps[i], p2=cps[i+1], p3=cps[Math.min(cps.length-1,i+2)];
      for (let s=0;s<=samplesPerSeg;s++){
        const t = s/samplesPerSeg;
        const x = cr(p0.x, p1.x, p2.x, p3.x, t);
        let y = cr(p0.y, p1.y, p2.y, p3.y, t);
        y = Math.max(minY, Math.min(maxY, y)); // Clamp to the padded area
        pts.push({ x, y });
      }
    }
    return { pts, color: '#fff', isSpecial: true, generatorId: 1 };
  }

  panel.addEventListener('toy-clear', api.clear);

  function handleRandomize() {
    // Ensure data structures exist
    if (!currentMap) {
      currentMap = { active: Array(cols).fill(false), nodes: Array.from({length:cols},()=>new Set()), disabled: Array.from({length:cols},()=>new Set()) };
    }

    // Clear all existing lines and nodes
    strokes = [];
    eraseStrokes = [];
    nodeGroupMap = Array.from({ length: cols }, () => new Map());
    manualOverrides = Array.from({ length: cols }, () => new Set());
    persistentDisabled = Array.from({ length: cols }, () => new Set());
    clearCanvas(pctx);
    clearCanvas(nctx);

    // Build a smooth, dramatic wiggly line across the full grid height using Catmull-Rom interpolation
    try {
      const stroke = createRandomLineStroke();
      strokes.push(stroke);
      drawFullStroke(pctx, stroke);
      regenerateMapFromStrokes();
 
      // After generating the line, randomly deactivate some columns to create rests.
      // This addresses the user's feedback that "Random" no longer turns notes off.
      if (currentMap && currentMap.nodes) {
        for (let c = 0; c < cols; c++) {
          if (Math.random() < 0.35) {
            // Deactivate the column by disabling all of its nodes. This state
            // is preserved by the `persistentDisabled` mechanism.
            if (currentMap.nodes[c]?.size > 0) {
              for (const r of currentMap.nodes[c]) persistentDisabled[c].add(r);
              currentMap.active[c] = false;
            }
          }
        }
      }
    } catch(e){}
    drawGrid();
    drawNodes(currentMap.nodes);
    emitDrawgridUpdate({ activityOnly: false });
  }

  function handleRandomizeBlocks() {
    if (!currentMap || !currentMap.nodes) return;

    for (let c = 0; c < cols; c++) {
        if (currentMap.nodes[c]?.size > 0) {
            // For each node (which is a row `r` in a column `c`) that exists...
            currentMap.nodes[c].forEach(r => {
                // ...randomly decide whether to disable it or not.
                if (Math.random() < 0.5) {
                    persistentDisabled[c].add(r); // Disable the node at (c, r)
                } else {
                    persistentDisabled[c].delete(r); // Enable the node at (c, r)
                }
            });

            // Recompute active state for the column
            const anyOn = Array.from(currentMap.nodes[c]).some(r => !persistentDisabled[c].has(r));
            currentMap.active[c] = anyOn;
            currentMap.disabled[c] = persistentDisabled[c];
        }
    }

    drawGrid();
    drawNodes(currentMap.nodes);
    emitDrawgridUpdate({ activityOnly: false });
  }

  function handleRandomizeNotes() {
    // Save the current active state before regenerating lines
    const oldActive = currentMap?.active ? [...currentMap.active] : null;

    const existingGenIds = new Set();
    strokes.forEach(s => {
      if (s.generatorId === 1 || s.generatorId === 2) { existingGenIds.add(s.generatorId); }
    });
    // If no generator lines exist, create Line 1. Don't call handleRandomize()
    // as that would clear decorative strokes and their disabled states.
    if (existingGenIds.size === 0) {
      existingGenIds.add(1);
    }
    strokes = strokes.filter(s => s.generatorId !== 1 && s.generatorId !== 2);
    const newGenStrokes = [];
    existingGenIds.forEach(gid => {
      const newStroke = createRandomLineStroke();
      newStroke.generatorId = gid;
      newStroke.justCreated = true; // Mark as new to avoid old erasures
      strokes.push(newStroke);
      newGenStrokes.push(newStroke);
    });
    clearAndRedrawFromStrokes();
    // After drawing, unmark the new strokes so they behave normally.
    newGenStrokes.forEach(s => delete s.justCreated);

    // After regenerating, restore the old active state and update disabled nodes to match.
    if (currentMap && oldActive) {
        currentMap.active = oldActive;
        // Rebuild the disabled sets based on the restored active state.
        for (let c = 0; c < cols; c++) {
            if (oldActive[c]) {
                currentMap.disabled[c].clear(); // If column was active, ensure all its new nodes are enabled.
            } else {
                currentMap.nodes[c].forEach(r => currentMap.disabled[c].add(r)); // If column was inactive, disable all its new nodes.
            }
        }
        drawGrid();
        drawNodes(currentMap.nodes);
        emitDrawgridUpdate({ activityOnly: false });
    }
  }
  panel.addEventListener('toy-random', handleRandomize);
  panel.addEventListener('toy-random-blocks', handleRandomizeBlocks);
  panel.addEventListener('toy-random-notes', handleRandomizeNotes);

  const persistedState = loadPersistedState();
  if (persistedState) {
    try { layout(true); } catch {}
    try { restoreFromState(persistedState); } catch (err) {
      if (DG_DEBUG) DG.warn('restoreFromState failed', err);
    }
  }

  // The ResizeObserver only fires on *changes*. We must call layout() once
  // manually to render the initial state. requestAnimationFrame ensures
  // the browser has finished its own layout calculations first.
  requestAnimationFrame(() => resnapAndRedraw(false));

  let ghostGuideAnimFrame = null;
  let ghostGuideLoopId = null;
  let ghostGuideAutoActive = false;
  let ghostGuideRunning = false;
  let ghostFadeRAF = 0;
  const GHOST_SWEEP_DURATION = 2000;
  const GHOST_SWEEP_PAUSE = 1000;

  function stopGhostGuide({ immediate = false } = {}) {
    if (ghostGuideAnimFrame) {
      cancelAnimationFrame(ghostGuideAnimFrame);
      ghostGuideAnimFrame = null;
    }
    ghostGuideRunning = false;
    if (ghostFadeRAF) {
      cancelAnimationFrame(ghostFadeRAF);
      ghostFadeRAF = 0;
    }
    if (immediate) {
      const ghostSurface = getActiveGhostCanvas();
      withIdentity(ghostCtx, () => {
        ghostCtx.clearRect(0, 0, ghostSurface.width, ghostSurface.height);
      });
    } else {
      ghostFadeRAF = requestAnimationFrame(() => fadeOutGhostTrail(0));
    }
  }

  function fadeOutGhostTrail(step = 0) {
    const ghostSurface = getActiveGhostCanvas();
    if (!ghostSurface) {
      ghostFadeRAF = 0;
      return;
    }
    withIdentity(ghostCtx, () => {
      ghostCtx.globalCompositeOperation = 'destination-out';
      ghostCtx.globalAlpha = 0.18;
      ghostCtx.fillRect(0, 0, ghostSurface.width, ghostSurface.height);
    });
    ghostCtx.globalCompositeOperation = 'source-over';
    ghostCtx.globalAlpha = 1.0;
    if (step < 5) {
      ghostFadeRAF = requestAnimationFrame(() => fadeOutGhostTrail(step + 1));
    } else {
      ghostFadeRAF = 0;
    }
  }

  function startGhostGuide({
  startX, endX,
  startY, endY,
  duration = 2000,
  wiggle = true,
  trail = true,
  trailEveryMs = 50,
  trailCount = 3,
  trailSpeed = 1.2,
} = {}) {
  stopGhostGuide({ immediate: true });
  if (ghostFadeRAF) {
    cancelAnimationFrame(ghostFadeRAF);
    ghostFadeRAF = 0;
  }
  const { w, h } = getLayoutSize();
  if (!w || !h) {
    layout(true);
  }

  const gx = gridArea.x, gy = gridArea.y, gw = gridArea.w, gh = gridArea.h;

  if (typeof startX !== 'number' || typeof endX !== 'number') {
    startX = gx;
    endX = gx + gw;
  }
  if (startX > endX) [startX, endX] = [endX, startX];

  if (typeof startY !== 'number' || typeof endY !== 'number') {
    startY = gy;
    endY = gy + gh;
  }

  const { x: zoomX, y: zoomY } = getZoomScale(panel);

  const startTime = performance.now();
  let last = null;
  let lastTrail = 0;
  const noiseSeed = Math.random() * 100;
  ghostGuideRunning = true;

  function frame(now) {
    if (!panel.isConnected) return;
    if (!ghostGuideRunning) return;
    const ghostSurface = getActiveGhostCanvas();
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);

    if (!cw || !ch) {
      layout(true);
    }

    const gx = gridArea.x, gy = gridArea.y, gw = gridArea.w, gh = gridArea.h;
    const currentStartX = gx + gw * 0.1;
    const currentEndX = gx + gw * 0.9;
    const currentStartY = gy + gh * 0.1;
    const currentEndY = gy + gh * 0.9;

    const wiggleAmp = gh * 0.25;

    const x = currentStartX + (currentEndX - currentStartX) * t;
    let y = currentStartY + (currentEndY - currentStartY) * t;
    if (wiggle) {
      const wiggleFactor = Math.sin(t * Math.PI * 3) * Math.sin(t * Math.PI * 0.5 + noiseSeed);
      y += wiggleAmp * wiggleFactor;
    }

    const topBound = gy, bottomBound = gy + gh;
    if (y > bottomBound) y = bottomBound - (y - bottomBound);
    else if (y < topBound) y = topBound + (topBound - y);

    withIdentity(ghostCtx, () => {
      ghostCtx.globalCompositeOperation = 'destination-out';
      ghostCtx.globalAlpha = 0.1;
      ghostCtx.fillRect(0, 0, ghostSurface.width, ghostSurface.height);
    });
    ghostCtx.globalCompositeOperation = 'source-over';
    ghostCtx.globalAlpha = 1.0;

    if (last) {
      withIdentity(ghostCtx, () => {
        ghostCtx.globalCompositeOperation = 'source-over';
        ghostCtx.globalAlpha = 0.25;
        ghostCtx.lineCap = 'round';
        ghostCtx.lineJoin = 'round';
        ghostCtx.lineWidth = getLineWidth() * 1.15;
        ghostCtx.strokeStyle = 'rgba(68,112,255,0.7)';
        ghostCtx.beginPath();
        ghostCtx.moveTo(last.x, last.y);
        ghostCtx.lineTo(x, y);
        ghostCtx.stroke();

        const dotR = getLineWidth() * 0.45;
        ghostCtx.beginPath();
        ghostCtx.arc(x, y, dotR, 0, Math.PI * 2);
        ghostCtx.fillStyle = 'rgba(68,112,255,0.85)';
        ghostCtx.fill();
      });
    }
    last = { x, y };

    const force = 0.8;
    const radius = getLineWidth() * 1.5;
    particles.drawingDisturb(x, y, radius, force);
    if (trail && now - lastTrail >= trailEveryMs) {
      particles.ringBurst(x, y, radius, trailCount, trailSpeed, 'pink');
      lastTrail = now;
    }

    if (ghostGuideRunning && t < 1) {
      ghostGuideAnimFrame = requestAnimationFrame(frame);
    } else {
      ghostGuideRunning = false;
      if (ghostFadeRAF) {
        cancelAnimationFrame(ghostFadeRAF);
      }
      ghostFadeRAF = requestAnimationFrame(() => fadeOutGhostTrail(0));
      ghostGuideAnimFrame = null;
    }
  }

  ghostGuideAnimFrame = requestAnimationFrame(frame);
}

function scheduleGhostIfEmpty({ initialDelay = 150 } = {}) {
  const check = () => {
    if (!panel.isConnected) return;
    if (isRestoring) {                 // Wait until setState() finishes
      setTimeout(check, 100);
      return;
    }
    const hasStrokes = Array.isArray(strokes) && strokes.length > 0;
    const hasNodes = Array.isArray(currentMap?.nodes)
      ? currentMap.nodes.some(set => set && set.size > 0)
      : false;

    if (!hasStrokes && !hasNodes) {
      startAutoGhostGuide({ immediate: true });
    } else {
      // If content exists, ensure the ghost is fully stopped/cleared.
      stopAutoGhostGuide({ immediate: true });
    }
  };
  setTimeout(check, initialDelay);
}

function runAutoGhostGuideSweep() {
  if (!ghostGuideAutoActive) return;

  const { w, h } = getLayoutSize();
  // Guard against tiny layouts
  if (!w || !h || w <= 48 || h <= 48) {

    return;
  }

  // Use logical coordinates directly
  const startX = gridArea.x + gridArea.w * 0.1;
  const endX = gridArea.x + gridArea.w * 0.9;
  const startY = gridArea.y + gridArea.h * 0.1;
  const endY = gridArea.y + gridArea.h * 0.9;

  startGhostGuide({
    startX, endX, startY, endY,
    duration: GHOST_SWEEP_DURATION,
    wiggle: true,
    trail: true,
    trailEveryMs: 50,
    trailCount: 3,
    trailSpeed: 1.2,
  });
}

  function startAutoGhostGuide({ immediate = false } = {}) {
    if (ghostGuideAutoActive) return;
    ghostGuideAutoActive = true;
    syncLetterFade({ immediate });
    runAutoGhostGuideSweep();
    const interval = GHOST_SWEEP_DURATION + GHOST_SWEEP_PAUSE;
    ghostGuideLoopId = setInterval(() => {
      if (!ghostGuideAutoActive) return;
      runAutoGhostGuideSweep();
    }, interval);
  }

  function stopAutoGhostGuide({ immediate = false } = {}) {
    const wasActive = ghostGuideAutoActive || ghostGuideLoopId !== null || !!ghostGuideAnimFrame;
    ghostGuideAutoActive = false;
    if (ghostGuideLoopId) {
      clearInterval(ghostGuideLoopId);
      ghostGuideLoopId = null;
    }
    stopGhostGuide({ immediate });
    if (wasActive) {
      syncLetterFade({ immediate });
    }
  }

  panel.startGhostGuide = startGhostGuide;
  panel.stopGhostGuide = stopGhostGuide;

  panel.addEventListener('toy-remove', () => {
    tutorialHighlightMode = 'none';
    stopTutorialHighlightLoop();
    noteToggleEffects = [];
    if (typeof unsubscribeZoom === 'function') {
      try { unsubscribeZoom(); } catch {}
    }
    if (typeof unsubscribeFrameStart === 'function') {
      try { unsubscribeFrameStart(); } catch {}
      unsubscribeFrameStart = null;
    }
    if (storageKey && typeof window !== 'undefined') {
      try { window.removeEventListener('beforeunload', persistStateNow); } catch {}
    }
    persistStateNow();
    observer.disconnect();
  }, { once: true });

  panel.addEventListener('tutorial:highlight-notes', (event) => {
    if (event?.detail?.active) {
      tutorialHighlightMode = 'notes';
      startTutorialHighlightLoop();
    } else if (tutorialHighlightMode === 'notes') {
      tutorialHighlightMode = 'none';
      stopTutorialHighlightLoop();
    }
  });

  panel.addEventListener('tutorial:highlight-drag', (event) => {
    if (event?.detail?.active) {
      tutorialHighlightMode = 'drag';
      startTutorialHighlightLoop();
    } else if (tutorialHighlightMode === 'drag') {
      tutorialHighlightMode = 'none';
      stopTutorialHighlightLoop();
    }
  });

  panel.addEventListener('drawgrid:update', (e) => {
    const nodes = e?.detail?.map?.nodes;
    const hasAny = Array.isArray(nodes) && nodes.some(set => set && set.size > 0);
          if (hasAny) {
            stopAutoGhostGuide({ immediate: false });    } else {
      startAutoGhostGuide({ immediate: true });
    }
  });

  scheduleGhostIfEmpty({ initialDelay: 150 });

  try { panel.dispatchEvent(new CustomEvent('drawgrid:ready', { bubbles: true })); } catch {}
  return api;
}

