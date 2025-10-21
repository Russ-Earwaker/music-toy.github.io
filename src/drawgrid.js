// src/drawgrid.js
// Minimal, scoped Drawing Grid ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â 16x12, draw strokes, build snapped nodes on release.
// Strictly confined to the provided panel element.
import { buildPalette, midiToName } from './note-helpers.js';
import { drawBlock } from './toyhelpers.js';
import { getLoopInfo, isRunning } from './audio-core.js';

const STROKE_COLORS = [
  'rgba(95,179,255,0.95)',  // Blue
  'rgba(255,95,179,0.95)',  // Pink
  'rgba(95,255,179,0.95)',  // Green
  'rgba(255,220,95,0.95)', // Yellow
];
let colorIndex = 0;

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
  count=150,
  returnToHome=true,
  homePull=0.008, // Increased spring force to resettle faster
  bounceOnWalls=false,
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
  const W = ()=> Math.max(1, Math.floor(getW()?getW():0));
  const H = ()=> Math.max(1, Math.floor(getH()?getH():0));
  let lastW = 0, lastH = 0;

  function layoutLetters(w, h, { resetPositions = true } = {}) {
    if (!w || !h) return;
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
      letter.homeX = homeX;
      letter.homeY = homeY;
      if (resetPositions) {
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

  for (let i=0;i<count;i++){
    P.push({ x: 0, y: 0, vx:0, vy:0, homeX:0, homeY:0, alpha:0.55, tSince: 0, delay:0, burst:false, flash: 0, repulsed: 0 });
  }

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
    const w=W(), h=H();
    if (w !== lastW || h !== lastH){
      if (P.length < count){
        for (let i=P.length;i<count;i++){
          P.push({ x: 0, y: 0, vx:0, vy:0, homeX:0, homeY:0, alpha:0.55, tSince: 0, flash: 0, repulsed: 0 });
        }
      } else if (P.length > count){
        P.length = count;
      }

      for (const p of P){
        // Generate a random point
        const nx = Math.random() * w;
        const ny = Math.random() * h;

        p.homeX = nx; p.homeY = ny; p.x = nx; p.y = ny;
        p.vx = 0; p.vy = 0; p.alpha = 0.55; p.tSince = 0; p.delay=0; p.burst=false; p.flash = 0; p.repulsed = 0;
      }
      layoutLetters(w, h, { resetPositions: true });
      lastW = w; lastH = h;
    } else if (!letters.length) {
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
      if (returnToHome && !p.isBurst && p.repulsed <= 0){
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
        letter.vx += (letter.homeX - letter.x) * pull;
        letter.vy += (letter.homeY - letter.y) * pull;
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

  function draw(ctx){
    if (!ctx) return;
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
      // Flash to white
      const r = Math.round(baseR + (255 - baseR) * mix);
      const g = Math.round(baseG + (255 - baseG) * mix);
      const b = Math.round(baseB + (255 - baseB) * mix);
      ctx.fillStyle = `rgb(${r},${g},${b})`;

      const baseSize = 1.5;
      const size = baseSize;
      const x = (p.x | 0) - size / 2;
      const y = (p.y | 0) - size / 2;
      ctx.fillRect(x, y, size, size);
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
      }
      ctx.restore();
    }
  }

  function lineRepulse(x, width=40, strength=1){
    const w=W(); const h=H();
    const half = Math.max(4, width*0.5);
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
        letter.vx += k * 0.4;
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
        P.push(p);
    }
  }

function ringBurst(x, y, radius, countBurst = 28, speed = 2.4, color = 'pink') {
  for (let i = 0; i < countBurst; i++) {
    const theta = (i / countBurst) * Math.PI * 2 + (Math.random() * 0.15);
    const px = x + Math.cos(theta) * radius;
    const py = y + Math.sin(theta) * radius;
    const outward = speed * (0.65 + Math.random() * 0.55);
    const jitterA = (Math.random() - 0.5) * 0.35;
    const vx = Math.cos(theta + jitterA) * outward;
    const vy = Math.sin(theta + jitterA) * outward;
    P.push({
      x: px, y: py, vx, vy,
      homeX: px, homeY: py,
      alpha: 1.0, flash: 1.0,
      ttl: 45, color, isBurst: true, repulsed: 0
    });
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

  return { step, draw, onBeat, lineRepulse, drawingDisturb, pointBurst, ringBurst, fadeLettersOut, fadeLettersIn, setLetterFadeTarget };
}

export function createDrawGrid(panel, { cols: initialCols = 8, rows = 12, toyId, bpm = 120 } = {}) {
  // The init script now guarantees the panel is a valid HTMLElement with the correct dataset.
  // The .toy-body is now guaranteed to exist by initToyUI, which runs first.
  const body = panel.querySelector('.toy-body');

  if (!body) {
    console.error('[drawgrid] Fatal: could not find .toy-body element!');
    return;
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

  const particleCtx = particleCanvas.getContext('2d');
  const gctx = grid.getContext('2d', { willReadFrequently: true });
  const pctx = paint.getContext('2d', { willReadFrequently: true });
  const nctx = nodesCanvas.getContext('2d', { willReadFrequently: true });
  const fctx = flashCanvas.getContext('2d', { willReadFrequently: true });
  const ghostCtx = ghostCanvas.getContext('2d');
  const tutorialCtx = tutorialCanvas.getContext('2d');

  let __forceSwipeVisible = null; // null=auto, true/false=forced by tutorial

  // State
  let cols = initialCols;
  let cssW=0, cssH=0, cw=0, ch=0, topPad=0, dpr=1;
  let drawing=false, erasing=false;
  // The `strokes` array is removed. The paint canvas is now the source of truth.
  let cur = null;
  let curErase = null;
  let strokes = []; // Store all completed stroke objects
  let eraseStrokes = []; // Store all completed erase strokes
  let currentMap = null; // Store the current node map {active, nodes, disabled}
  let nodeCoordsForHitTest = []; // For draggable nodes
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
  let previewGid = null; // 1 or 2 while drawing a special line preview
  let persistentDisabled = Array.from({ length: initialCols }, () => new Set()); // survives view changes
  let btnLine1, btnLine2;
  let autoTune = true; // Default to on
  const safeArea = 40;
  let gridArea = { x: 0, y: 0, w: 0, h: 0 };
  let tutorialHighlightMode = 'none'; // 'none' | 'notes' | 'drag'
  let tutorialHighlightRaf = null;
  let dragHintGhosts = [];
  let dragHintDirection = 1;
  let dragHintIndex = 0;
  let lastDragHintTime = 0;

  const particles = createDrawGridParticles({
    getW: () => cssW,
    getH: () => cssH,
    count: 600,
    homePull: 0.002,
  });

  const clearTutorialHighlight = () => {
    if (!tutorialCtx) return;
    tutorialCtx.clearRect(0, 0, tutorialCanvas.width, tutorialCanvas.height);
  };

  const renderTutorialHighlight = () => {
    if (!tutorialCtx) return;
    tutorialCtx.clearRect(0, 0, tutorialCanvas.width, tutorialCanvas.height);
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
    const nodesToHighlight = nodeCoordsForHitTest;
    for (const node of nodesToHighlight) {
      if (!node) continue;
      tutorialCtx.globalAlpha = node.disabled ? 0.45 : 1;
      tutorialCtx.lineWidth = Math.max(2, baseRadius * 0.22);
      tutorialCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      tutorialCtx.beginPath();
      tutorialCtx.arc(node.x, node.y, baseRadius * pulseScale, 0, Math.PI * 2);
      tutorialCtx.stroke();
    }

    if (tutorialHighlightMode === 'drag') {
      const effectiveWidth = (gridArea.w && gridArea.w > 0) ? gridArea.w : (cw * cols);
      const effectiveHeight = (gridArea.h && gridArea.h > 0) ? gridArea.h : (ch * rows);
      const fallbackX = gridArea.x + (effectiveWidth / 2);
      const fallbackY = gridArea.y + topPad + Math.max(0, effectiveHeight - topPad) / 2;
      const spawnInterval = 650;
      if (now - lastDragHintTime > spawnInterval) {
        const nodeCount = nodeCoordsForHitTest.length;
        const anchorNode = nodeCount
          ? nodeCoordsForHitTest[dragHintIndex % nodeCount]
          : { x: fallbackX, y: fallbackY };
        if (nodeCount) {
          dragHintIndex = (dragHintIndex + 1) % nodeCount;
        } else {
          dragHintIndex = 0;
        }
        dragHintGhosts.push({
          x: anchorNode.x,
          baseY: anchorNode.y,
          dir: dragHintDirection,
          progress: 0
        });
        if (dragHintGhosts.length > 24) dragHintGhosts.shift();
        dragHintDirection *= -1;
        lastDragHintTime = now;
      }

      const amplitude = Math.max(ch * 1.2, 48);
      tutorialCtx.lineWidth = Math.max(1.2, baseRadius * 0.18);
      tutorialCtx.strokeStyle = 'rgba(150, 215, 255, 0.75)';
      for (let i = dragHintGhosts.length - 1; i >= 0; i--) {
        const ghost = dragHintGhosts[i];
        ghost.progress += 0.025;
        if (ghost.progress >= 1) {
          dragHintGhosts.splice(i, 1);
          continue;
        }
        const eased = Math.sin(ghost.progress * Math.PI);
        const y = ghost.baseY + ghost.dir * amplitude * eased;
        const alpha = Math.max(0, 1 - ghost.progress);
        tutorialCtx.globalAlpha = alpha * 0.7;
        const ghostRadius = baseRadius * (0.9 + ghost.progress * 0.8);
        tutorialCtx.beginPath();
        tutorialCtx.arc(ghost.x, y, ghostRadius, 0, Math.PI * 2);
        tutorialCtx.stroke();
      }
      tutorialCtx.globalAlpha = 1;
    } else {
      dragHintGhosts = [];
      dragHintIndex = 0;
    }
    tutorialCtx.restore();
    tutorialCtx.shadowBlur = 0;
    tutorialCtx.globalAlpha = 1;
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
    lastDragHintTime = 0;
    dragHintGhosts = [];
    dragHintDirection = 1;
    dragHintIndex = 0;
    renderTutorialHighlight();
    tutorialHighlightRaf = requestAnimationFrame(tick);
  };

  const stopTutorialHighlightLoop = () => {
    if (tutorialHighlightRaf !== null) {
      cancelAnimationFrame(tutorialHighlightRaf);
      tutorialHighlightRaf = null;
    }
    clearTutorialHighlight();
    dragHintGhosts = [];
    dragHintIndex = 0;
    lastDragHintTime = 0;
    dragHintDirection = 1;
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
    panel.__drawgridHelpModeChecker = setInterval(() => syncLetterFade({ immediate: true }), 250);
  }

  panel.dataset.steps = String(cols);

  panel.dataset.steps = String(cols);

  // UI: ensure Eraser button exists in header
  const header = panel.querySelector('.toy-header');
  if (header){
    const right = header.querySelector('.toy-controls-right') || header;
    let er = header.querySelector('[data-erase]');
    // The button is now created by toyui.js. We just need to find it and wire it up.
    er?.addEventListener('click', ()=>{
      erasing = !erasing;
      er.setAttribute('aria-pressed', String(erasing));
      er.classList.toggle('active', erasing);
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
                console.error("Instrument picker failed in drawgrid", e);
            }
        });
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
  function clearAndRedrawFromStrokes() {
    pctx.clearRect(0, 0, cssW, cssH);

    const normalStrokes = strokes.filter(s => !s.justCreated);
    const newStrokes = strokes.filter(s => s.justCreated);

    // 1. Draw all existing, non-new strokes first.
    for (const s of normalStrokes) {
      drawFullStroke(pctx, s);
    }
    // 2. Apply the global erase mask to the existing strokes.
    for (const s of eraseStrokes) {
      drawEraseStroke(pctx, s);
    }
    // 3. Draw the brand new strokes on top, so they are not affected by old erasures.
    for (const s of newStrokes) {
      drawFullStroke(pctx, s);
    }

    regenerateMapFromStrokes();
    try { (panel.__dgUpdateButtons || updateGeneratorButtons || function(){})() } catch(e) { try { console.warn('[drawgrid] updateGeneratorButtons not available', e); } catch{} }
    syncLetterFade();
  }

  function drawEraseStroke(ctx, stroke) {
    if (!stroke || !stroke.pts || stroke.pts.length < 1) return;
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
        // Standard view: if generator lines exist, preserve all of them; otherwise fall back to first special stroke.
        const gens = strokes.filter(s => s.generatorId);
        if (gens.length > 0){
          gens.forEach(s => processGeneratorStroke(s, newMap, newGroups));
        } else {
          const specialStroke = strokes.find(s => s.isSpecial);
          if (specialStroke){
            processGeneratorStroke(specialStroke, newMap, newGroups);
          }
        }

        // Apply manual node overrides when returning to standard view
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
      // Recompute active flags based on disabled sets
      for (let c = 0; c < cols; c++) {
        if (!newMap.nodes[c] || newMap.nodes[c].size === 0) { newMap.active[c] = false; continue; }
        const dis = newMap.disabled?.[c] || new Set();
        const anyOn = Array.from(newMap.nodes[c]).some(r => !dis.has(r));
        newMap.active[c] = anyOn;
      }

      currentMap = newMap;
      nodeGroupMap = newGroups;
      persistentDisabled = currentMap.disabled; // Update persistent set
      try { (panel.__dgUpdateButtons || function(){})() } catch {}
      panel.dispatchEvent(new CustomEvent('drawgrid:update', { detail: currentMap }));
      drawNodes(currentMap.nodes);
      drawGrid();
  }

  function resnapAndRedraw(forceLayout = false) {
    const hasStrokes = strokes.length > 0;
    const hasNodes = currentMap && currentMap.nodes && currentMap.nodes.some(s => s && s.size > 0);
    syncLetterFade({ immediate: true });
    // Only force layout when needed (e.g., steps/resolution change or zoom). Avoid clearing paint when unnecessary.
    layout(!!forceLayout);

    if (hasStrokes) {
      requestAnimationFrame(() => {
        if (!panel.isConnected) return;
        regenerateMapFromStrokes();
        // After regenerating the map, which is the source of truth,
        // update the generator buttons to reflect the current state.
        // This is more reliable than calling it from the zoom listener directly.
        updateGeneratorButtons();
      });
    } else if (hasNodes) {
      // No strokes to regenerate from (e.g., after dragging). Preserve current nodes and do not clear paint.
      requestAnimationFrame(() => {
        if (!panel.isConnected) return;
        drawGrid();
        drawNodes(currentMap.nodes);
        panel.dispatchEvent(new CustomEvent('drawgrid:update', { detail: currentMap }));
        updateGeneratorButtons();
      });
    } else {
      api.clear();
      // Also update buttons when clearing, to reset them to "Draw".
      updateGeneratorButtons();
    }
  }


  panel.addEventListener('toy-zoom', () => {
    // Snapshot paint to preserve drawn/erased content across zoom transitions
    let zoomSnap = null;
    try {
      if (paint.width > 0 && paint.height > 0) {
        zoomSnap = document.createElement('canvas');
        zoomSnap.width = paint.width;
        zoomSnap.height = paint.height;
        zoomSnap.getContext('2d')?.drawImage(paint, 0, 0);
      }
    } catch {}
    // When zooming in or out, the panel's size changes.
    // We force a layout call to ensure everything is redrawn correctly.
    // A double rAF waits for the browser to finish style recalculation and layout
    // after the panel is moved in the DOM, preventing a "flash of blank canvas".
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!panel.isConnected) return;

        // If entering advanced mode, upgrade the standard-view special line to Line 1
        // so that its nodes are preserved.
    if (panel.classList.contains('toy-zoomed')) {
            const hasGeneratorLines = strokes.some(s => s.generatorId);
            if (!hasGeneratorLines) {
                // If there are no generator lines, we are effectively starting fresh
                // in advanced mode. Clear any purely visual strokes from standard view.
                strokes = [];
            }
        } else {
            // LEAVING advanced mode. Preserve generator lines; standard view will keep their nodes.
        }

        resnapAndRedraw(true);
        // Restore snapshot after layout has run
        requestAnimationFrame(() => {
          if (zoomSnap) {
            try {
              pctx.save();
              pctx.setTransform(1,0,0,1,0,0);
              pctx.drawImage(zoomSnap, 0,0, zoomSnap.width, zoomSnap.height, 0,0, paint.width, paint.height);
              pctx.restore();
            } catch {}
          }
        });
      });
    });
  });

  const observer = new ResizeObserver(() => resnapAndRedraw(false));

  function getLineWidth() {
    return Math.max(12, Math.round(Math.min(cw, ch) * 0.85));
  }

  function layout(force = false){
    const newDpr = window.devicePixelRatio || 1;
    const r = body.getBoundingClientRect();
    const newW = Math.max(1, r.width|0);
    const newH = Math.max(1, r.height|0);

    if (force || Math.abs(newW - cssW) > 1 || Math.abs(newH - cssH) > 1 || newDpr !== dpr) {
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

      dpr = newDpr;
      cssW = newW;
      cssH = newH;
      const w = cssW * dpr;
      const h = cssH * dpr;
      grid.width = w; grid.height = h;
      paint.width = w; paint.height = h;
      nodesCanvas.width = w; nodesCanvas.height = h;
      flashCanvas.width = w; flashCanvas.height = h;
      particleCanvas.width = w; particleCanvas.height = h;
      ghostCanvas.width = w; ghostCanvas.height = h;
      tutorialCanvas.width = w; tutorialCanvas.height = h;
      gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      nctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      particleCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ghostCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (tutorialCtx) tutorialCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (tutorialHighlightMode !== 'none') renderTutorialHighlight();

      // Scale the logical stroke data if we have it and the canvas was resized
      if (strokes.length > 0 && oldW > 0 && oldH > 0) {
        const scaleX = cssW / oldW;
        const scaleY = cssH / oldH;
        if (scaleX !== 1 || scaleY !== 1) {
          for (const s of strokes) { s.pts = s.pts.map(p => ({ x: p.x * scaleX, y: p.y * scaleY })); }
        }
      }

      // Define the grid area inset by the safe area
      gridArea = {
        x: safeArea,
        y: safeArea,
        w: cssW > safeArea * 2 ? cssW - 2 * safeArea : 0,
        h: cssH > safeArea * 2 ? cssH - 2 * safeArea : 0,
      };

      // All calculations are now relative to the gridArea
      // Remove the top cube row; use a minimal padding
      topPad = 0;
      cw = gridArea.w / cols;
      ch = (gridArea.h > topPad) ? (gridArea.h - topPad) / rows : 0;

      // Update eraser cursor size
      const eraserWidth = getLineWidth() * 2;
      eraserCursor.style.width = `${eraserWidth}px`;
      eraserCursor.style.height = `${eraserWidth}px`;

      drawGrid();
      // Restore paint snapshot scaled to new size (preserves erasures)
      if (paintSnapshot) {
        try {
          pctx.save();
          // Draw in device pixels to avoid double-scaling from current transform
          pctx.setTransform(1, 0, 0, 1, 0, 0);
          pctx.drawImage(
            paintSnapshot,
            0, 0, paintSnapshot.width, paintSnapshot.height,
            0, 0, paint.width, paint.height
          );
          pctx.restore();
        } catch {}
      }
      // Clear other content canvases. The caller is responsible for redrawing nodes/overlay.
      nctx.clearRect(0, 0, cssW, cssH);
      fctx.clearRect(0, 0, cssW, cssH);
      ghostCtx.setTransform(1,0,0,1,0,0);
      ghostCtx.clearRect(0,0,ghostCanvas.width,ghostCanvas.height);
      ghostCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  function flashColumn(col) {
    // Save current grid state to restore after flash
    const currentGridData = gctx.getImageData(0, 0, grid.width, grid.height);

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
    gctx.clearRect(0, 0, cssW, cssH);

    // Fill the entire background on the lowest layer (grid canvas)
    gctx.fillStyle = '#0b0f16';
    gctx.fillRect(0, 0, cssW, cssH);

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
    gctx.lineWidth = 1.5;
    // Verticals (including outer lines)
    for(let i = 0; i <= cols; i++){
        const x = gridArea.x + i * cw;
        gctx.beginPath();
        gctx.moveTo(x, noteGridY);
        gctx.lineTo(x, gridArea.y + gridArea.h);
        gctx.stroke();
    }
    // Horizontals (including outer lines)
    for(let j = 0; j <= rows; j++){
        const y = noteGridY + j * ch;
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
                const x1 = gridArea.x + c * cw;
                gctx.beginPath();
                gctx.moveTo(x1, noteGridY);
                gctx.lineTo(x1, gridArea.y + gridArea.h);
                gctx.stroke();

                // Right line of the column
                const x2 = gridArea.x + (c + 1) * cw;
                gctx.beginPath();
                gctx.moveTo(x2, noteGridY);
                gctx.lineTo(x2, gridArea.y + gridArea.h);
                gctx.stroke();
            }
        }
    }
  }

  // A helper to draw a complete stroke from a point array.
  // This is used to create a clean image for snapping.
  function drawFullStroke(ctx, stroke) {
    if (!stroke || !stroke.pts || stroke.pts.length < 1) return;
    const color = stroke.color || STROKE_COLORS[0];

    ctx.save(); // Save context for potential glow effect
    const isStandard = !panel.classList.contains('toy-zoomed');
    const isOverlay = (ctx === fctx); // Only overlay animates hues; paint stays neutral for specials
    let wantsSpecial = !!stroke.isSpecial || (isOverlay && (stroke.generatorId === 1 || stroke.generatorId === 2));
    if (!wantsSpecial && isStandard) {
      const hasAnySpecial = strokes.some(s => s.isSpecial);
      if (!hasAnySpecial && stroke === cur) wantsSpecial = true; // first-line preview in standard
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
            const gid = stroke.generatorId ?? 1; // default to Line 1 palette
            if (gid === 1) {
              const hue = 200 + 20 * Math.sin((t/800) * Math.PI * 2);
              grad.addColorStop(0, `hsl(${hue.toFixed(0)}, 100%, 75%)`);
              grad.addColorStop(0.7, `hsl(${(hue+60).toFixed(0)}, 100%, 68%)`);
              grad.addColorStop(1,  `hsla(${(hue+120).toFixed(0)}, 100%, 60%, 0.35)`);
            } else {
              const hue = 20 + 20 * Math.sin((t/900) * Math.PI * 2);
              grad.addColorStop(0, `hsl(${hue.toFixed(0)}, 100%, 70%)`);
              grad.addColorStop(0.7, `hsl(${(hue-25).toFixed(0)}, 100%, 65%)`);
              grad.addColorStop(1,  `hsla(${(hue-45).toFixed(0)}, 100%, 55%, 0.35)`);
            }
            ctx.fillStyle = grad;
          } else {
            // Paint layer: neutral for specials; overlay handles color shift
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
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      {
        const lw = getLineWidth() + (isOverlay ? 1.25 : 0);
        ctx.lineWidth = lw;
      }
      if (wantsSpecial) {
          const p1 = stroke.pts[0];
          const pLast = stroke.pts[stroke.pts.length - 1];
          const grad = ctx.createLinearGradient(p1.x, p1.y, pLast.x, pLast.y);
          if (isOverlay) {
            const t = (performance.now ? performance.now() : Date.now());
            const gid = stroke.generatorId ?? 1;
            if (gid === 1) {
              const hue = 200 + 20 * Math.sin((t/800) * Math.PI * 2);
              grad.addColorStop(0, `hsl(${hue.toFixed(0)}, 100%, 70%)`);
              grad.addColorStop(0.5, `hsl(${(hue+45).toFixed(0)}, 100%, 70%)`);
              grad.addColorStop(1,  `hsl(${(hue+90).toFixed(0)}, 100%, 68%)`);
            } else {
              const hue = 20 + 20 * Math.sin((t/900) * Math.PI * 2);
              grad.addColorStop(0, `hsl(${hue.toFixed(0)}, 100%, 68%)`);
              grad.addColorStop(0.5, `hsl(${(hue-25).toFixed(0)}, 100%, 66%)`);
              grad.addColorStop(1,  `hsl(${(hue-50).toFixed(0)}, 100%, 64%)`);
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
    nctx.clearRect(0, 0, cssW, cssH);
    if (!nodes) { nodeCoordsForHitTest = []; return; }

    const nodeCoords = []; // Store coordinates of each node: {x, y, col, row, radius, group, disabled}
    nodeCoordsForHitTest = []; // Clear for new set
    const radius = Math.max(4, Math.min(cw, ch) * 0.20); // Bigger nodes

    // First, find all node center points
    for (let c = 0; c < cols; c++) {
        if (nodes[c] && nodes[c].size > 0) {
            for (const r of nodes[c]) {
                const x = gridArea.x + c * cw + cw * 0.5;
                const y = gridArea.y + topPad + r * ch + ch * 0.5;
                const groupEntry = (nodeGroupMap && nodeGroupMap[c]) ? (nodeGroupMap[c].get(r) ?? null) : null;
                const disabledSet = currentMap?.disabled?.[c];
                const isDisabled = !!(disabledSet && disabledSet.has(r));
                if (Array.isArray(groupEntry) && groupEntry.length > 0) {
                  // Multiple overlapped nodes at same position; respect z-order (last is top).
                  // For hit-testing, push top-most first so it is grabbed first.
                  for (let i = groupEntry.length - 1; i >= 0; i--) {
                    const gid = groupEntry[i];
                    const nodeData = { x, y, col: c, row: r, radius: radius * 1.5, group: gid, disabled: isDisabled };
                    nodeCoords.push(nodeData);
                    nodeCoordsForHitTest.push(nodeData);
                  }
                } else {
                  const groupId = (typeof groupEntry === 'number') ? groupEntry : null;
                  const nodeData = { x, y, col: c, row: r, radius: radius * 1.5, group: groupId, disabled: isDisabled }; // Use a larger hit area
                  nodeCoords.push(nodeData);
                  nodeCoordsForHitTest.push(nodeData);
                }
            }
        }
    }

    // --- Draw connecting lines ---
    nctx.lineWidth = 3; // Thicker

    // Group nodes by column for easier and more efficient lookup
    const colsMap = new Map();
    for (const node of nodeCoords) {
        if (!colsMap.has(node.col)) colsMap.set(node.col, []);
        colsMap.get(node.col).push(node);
    }

    // Stroke per segment to handle color changes and disabled nodes (no animation on connectors)
    for (let c = 0; c < cols - 1; c++) {
      const currentColNodes = colsMap.get(c);
      const nextColNodes = colsMap.get(c + 1);
      if (currentColNodes && nextColNodes) {
        const currentIsActive = currentMap?.active?.[c] ?? false;
        const nextIsActive = currentMap?.active?.[c + 1] ?? true;
        const advanced = panel.classList.contains('toy-zoomed');
        const disabledStyle = 'rgba(80, 100, 160, 0.6)'; // Darker blue
        const colorFor = (gid, active=true) => {
          if (!active) return disabledStyle;
          if (gid === 1) return 'rgba(125, 180, 255, 0.9)'; // static bluish
          if (gid === 2) return 'rgba(255, 160, 120, 0.9)'; // static orangey
          return 'rgba(255, 255, 255, 0.85)';
        };

        const matchGroup = (g, gid) => {
          if (gid == null) return (g == null);
          return g === gid;
        };

        const drawGroupConnections = (gid) => {
          for (const node of currentColNodes) {
            if (!matchGroup(node.group ?? null, gid)) continue;
            for (const nextNode of nextColNodes) {
              if (!matchGroup(nextNode.group ?? null, gid)) continue;
              const eitherDisabled = node.disabled || nextNode.disabled;
              nctx.strokeStyle = colorFor(gid, !eitherDisabled);
              nctx.beginPath();
              nctx.moveTo(node.x, node.y);
              nctx.lineTo(nextNode.x, nextNode.y);
              nctx.stroke();
            }
          }
        };

        // Draw per group to avoid cross-line connections in both modes.
        drawGroupConnections(1);
        drawGroupConnections(2);
        drawGroupConnections(null);
      }
    }

    // --- Draw node cubes (with flash animation) on top of connectors ---
    for (const node of nodeCoords) {
        const colActive = currentMap?.active?.[node.col] ?? true;
        const nodeOn = colActive && !node.disabled;
        const flash = flashes[node.col] || 0;
        const size = radius * 2;
        const cubeRect = { x: node.x - size/2, y: node.y - size/2, w: size, h: size };

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
  }

  function drawNoteLabels(nodes) {
    nctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    nctx.font = '12px system-ui, sans-serif';
    nctx.textAlign = 'center';
    nctx.textBaseline = 'bottom';
    const labelY = cssH - 10; // Position below the grid area, in the safe zone

    for (let c = 0; c < cols; c++) {
        if (nodes[c] && nodes[c].size > 0) {
            // choose first non-disabled row for label
            let r = undefined;
            const disabledSet = currentMap?.disabled?.[c] || new Set();
            for (const row of nodes[c]) { if (!disabledSet.has(row)) { r = row; break; } }
            if (r === undefined) continue;
            const midiNote = chromaticPalette[r];
            if (midiNote !== undefined) {
                const x = gridArea.x + c * cw + cw * 0.5;
                nctx.fillText(midiToName(midiNote), x, labelY);
            }
        }
    }
  }

  // --- Note Palettes for Snapping ---
  const pentatonicOffsets = [0, 3, 5, 7, 10];
  const chromaticOffsets = Array.from({length: 12}, (_, i) => i);
  // Create palettes of MIDI numbers. Reversed so top row is highest pitch.
  const chromaticPalette = buildPalette(48, chromaticOffsets, 1).reverse(); // MIDI 59 (B3) down to 48 (C3)
  const pentatonicPalette = buildPalette(48, pentatonicOffsets, 2).reverse(); // 10 notes from C3-C5 range

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
      const xStart = Math.round(xStart_css * dpr);
      const xEnd = Math.round(xEnd_css * dpr);
      
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
        const avgY_css = avgY_dpr / dpr;

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
            panel.dispatchEvent(new CustomEvent('drawgrid:update', { detail: currentMap }));
        }
    }
  }

  function onPointerDown(e){
    panel.stopGhostGuide();
    const rect = paint.getBoundingClientRect();
    // cssW and cssH are the logical canvas dimensions.
    // rect.width and rect.height are the visual dimensions on screen.
    // This correctly scales pointer coordinates regardless of global board zoom or advanced-mode zoom.
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
    // cssW and cssH are the logical canvas dimensions.
    // rect.width and rect.height are the visual dimensions on screen.
    // This correctly scales pointer coordinates regardless of global board zoom or advanced-mode zoom.
    const p = {
      x: (e.clientX - rect.left) * (cssW > 0 ? cssW / rect.width : 1),
      y: (e.clientY - rect.top) * (cssH > 0 ? cssH / rect.height : 1)
    };
    
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
        draggedNode = { col: pendingNodeTap.col, row: pendingNodeTap.row, group: pendingNodeTap.group ?? null };
        paint.style.cursor = 'grabbing';
        pendingNodeTap = null;
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
          try {
            panel.dispatchEvent(new CustomEvent('drawgrid:node-drag', { detail: { col, row: newRow, group: gid } }));
          } catch {}
          
          // Redraw only the nodes canvas; the blue line on the paint canvas is untouched.
          drawNodes(currentMap.nodes);
          drawGrid();
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
        const n = cur.pts.length;
        if (n >= 2) {
          const a = cur.pts[n - 2];
          const b = cur.pts[n - 1];
          pctx.save();
          pctx.lineCap = 'round';
          pctx.lineJoin = 'round';
          pctx.lineWidth = getLineWidth();
          pctx.strokeStyle = cur.color;
          pctx.beginPath();
          pctx.moveTo(a.x, a.y);
          pctx.lineTo(b.x, b.y);
          pctx.stroke();
          pctx.restore();
        }
      }
      // Disturb particles for all lines, special or not.
      try {
        particles.drawingDisturb(p.x, p.y, getLineWidth() * 1.5, 0.4);
      } catch(e) {}
    }
  }
  function onPointerUp(e){
    if (draggedNode) {
      panel.dispatchEvent(new CustomEvent('drawgrid:update', { detail: currentMap }));
      draggedNode = null;
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
      drawGrid();
      drawNodes(currentMap.nodes);
      panel.dispatchEvent(new CustomEvent('drawgrid:update', { detail: currentMap }));
      panel.dispatchEvent(new CustomEvent('drawgrid:node-toggle', { detail: { col, row, disabled: dis.has(row) } }));

      const cx = gridArea.x + col * cw + cw * 0.5;
      const cy = gridArea.y + topPad + row * ch + ch * 0.5;
      const baseRadius = Math.max(6, Math.min(cw, ch) * 0.5);
      noteToggleEffects.push({ x: cx, y: cy, radius: baseRadius, progress: 0 });
      if (noteToggleEffects.length > 24) noteToggleEffects.splice(0, noteToggleEffects.length - 24);
      try { particles.pointBurst(cx, cy, 18, 2.4, 'skyblue'); } catch {}

      pendingNodeTap = null;
    }

    if (!drawing) return;
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
      return;
    }

    if (!strokeToProcess) return;

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
        try { (panel.__dgUpdateButtons || updateGeneratorButtons)(); } catch(e){ console.warn('[drawgrid] updateGeneratorButtons missing', e); }
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
    try { console.info('[drawgrid] up', { isZoomed, isSpecial, generatorId, shouldGenerateNodes, strokes: strokes.length }); } catch{}
    strokeToProcess.isSpecial = isSpecial;
    strokeToProcess.generatorId = generatorId;
    strokeToProcess.justCreated = true; // Mark as new to exempt from old erasures
    strokes.push({ pts: strokeToProcess.pts, color: strokeToProcess.color, isSpecial: strokeToProcess.isSpecial, generatorId: strokeToProcess.generatorId, justCreated: strokeToProcess.justCreated });

    // Redraw all strokes to apply consistent alpha, and regenerate the node map.
    // This fixes the opacity buildup issue from drawing segments during pointermove.
    clearAndRedrawFromStrokes();
    // After drawing, unmark all strokes so they become part of the normal background for the next operation.
    strokes.forEach(s => delete s.justCreated);

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

    tempCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

    // Step and draw particles
    try {
      particles.step(1/60); // Assuming 60fps for dt
      particleCtx.clearRect(0, 0, cssW, cssH);
      // The dark background is now drawn on the grid canvas, so particles can be overlaid.
      particles.draw(particleCtx);
    } catch (e) { /* fail silently */ }

    drawGrid(); // Always redraw grid (background, lines, active column fills)
    if (currentMap) drawNodes(currentMap.nodes); // Always redraw nodes (cubes, connections, labels)

    // Clear flash canvas for this frame's animations
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.clearRect(0, 0, flashCanvas.width, flashCanvas.height);

    // Animate special stroke paint (hue cycling) without resurrecting erased areas:
    // Draw animated special strokes into flashCanvas, then mask with current paint alpha.
    const specialStrokes = strokes.filter(s => s.isSpecial);
    if (specialStrokes.length > 0 || (cur && previewGid)) {
        fctx.save();
        // Draw animated strokes with CSS transform
        fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
          fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          fctx.globalCompositeOperation = 'source-over';
          const preview = { pts: cur.pts, isSpecial: true, generatorId: previewGid };
          drawFullStroke(fctx, preview);
        }
        fctx.restore();
    } else {
    }

    // Animate playhead flash
    for (let i = 0; i < flashes.length; i++) {
        if (flashes[i] > 0) {
            flashes[i] = Math.max(0, flashes[i] - 0.08);
        }
    }

    // Draw cell flashes
    try {
        if (cellFlashes.length > 0) {
            fctx.save();
            fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

    if (noteToggleEffects.length > 0) {
      try {
        fctx.save();
        fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
      } catch {}
    }

    // Draw scrolling playhead
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
          particles.lineRepulse(playheadX, 40, 0.33);
        } catch (e) { /* fail silently */ }

        // Use the flash canvas (fctx) for the playhead. It's cleared each frame.
        fctx.save();
        fctx.setTransform(dpr, 0, 0, dpr, 0, 0); // ensure we're in CSS pixels

        // --- Faded gradient background ---
        const gradientWidth = 80;
        const t = performance.now();
        const hue = 200 + 20 * Math.sin((t / 800) * Math.PI * 2);
        const midColor = `hsla(${(hue + 45).toFixed(0)}, 100%, 70%, 0.25)`;

        const bgGrad = fctx.createLinearGradient(playheadX - gradientWidth / 2, 0, playheadX + gradientWidth / 2, 0);
        bgGrad.addColorStop(0, 'rgba(0,0,0,0)');
        bgGrad.addColorStop(0.5, midColor);
        bgGrad.addColorStop(1, 'rgba(0,0,0,0)');

        fctx.fillStyle = bgGrad;
        fctx.fillRect(playheadX - gradientWidth / 2, gridArea.y, gradientWidth, gridArea.h);


        // Create a vertical gradient that mimics the "Line 1" animated gradient.
        const grad = fctx.createLinearGradient(playheadX, gridArea.y, playheadX, gridArea.y + gridArea.h);
        grad.addColorStop(0, `hsl(${hue.toFixed(0)}, 100%, 70%)`);
        grad.addColorStop(0.5, `hsl(${(hue + 45).toFixed(0)}, 100%, 70%)`);
        grad.addColorStop(1, `hsl(${(hue + 90).toFixed(0)}, 100%, 68%)`);

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

    rafId = requestAnimationFrame(renderLoop);
  }
  rafId = requestAnimationFrame(renderLoop);

  const api = {
    panel,
    startGhostGuide,
    stopGhostGuide,
    clear: ()=>{
      pctx.clearRect(0,0,cssW,cssH);
      nctx.clearRect(0,0,cssW,cssH);
      fctx.clearRect(0,0,cssW,cssH);
      strokes = [];
      eraseStrokes = [];
      manualOverrides = Array.from({ length: cols }, () => new Set());
      persistentDisabled = Array.from({ length: cols }, () => new Set());
      const emptyMap = {active:Array(cols).fill(false),nodes:Array.from({length:cols},()=>new Set()), disabled:Array.from({length:cols},()=>new Set())};
      currentMap = emptyMap;
      panel.dispatchEvent(new CustomEvent('drawgrid:update',{detail:emptyMap}));
      drawGrid();
      nextDrawTarget = null; // Disarm any pending line draw
      updateGeneratorButtons(); // Refresh button state to "Draw"
      noteToggleEffects = [];
    },
    setErase:(v)=>{ erasing=!!v; },
    getState: ()=>{
      try{
        const serializeSetArr = (arr)=> Array.isArray(arr) ? arr.map(s => Array.from(s||[])) : [];
        const serializeNodes = (arr)=> Array.isArray(arr) ? arr.map(s => Array.from(s||[])) : [];
        const normPt = (p)=>{
          try{
            const nx = (gridArea.w>0) ? (p.x - gridArea.x)/gridArea.w : 0;
            const gh = Math.max(1, gridArea.h - topPad);
            const ny = gh>0 ? (p.y - (gridArea.y + topPad))/gh : 0;
            return { nx, ny };
          }catch{ return { nx:0, ny:0 }; }
        };
        const state = {
          steps: cols|0,
          autotune: !!autoTune,
          strokes: (strokes||[]).map(s=>({
            // Store normalized points so restore scales correctly
            ptsN: Array.isArray(s.pts)? s.pts.map(normPt) : [],
            color: s.color,
            isSpecial: !!s.isSpecial,
            generatorId: (typeof s.generatorId==='number')? s.generatorId : undefined,
            overlayColorize: !!s.overlayColorize,
          })),
          eraseStrokes: (eraseStrokes||[]).map(s=>({
            ptsN: Array.isArray(s.pts)? s.pts.map(normPt) : [],
          })),
          nodes: {
            active: (currentMap?.active && Array.isArray(currentMap.active)) ? currentMap.active.slice() : Array(cols).fill(false),
            disabled: serializeSetArr(persistentDisabled || []),
            list: serializeNodes(currentMap?.nodes || []),
            groups: (nodeGroupMap || []).map(m => m instanceof Map ? Array.from(m.entries()) : []),
          },
          manualOverrides: Array.isArray(manualOverrides) ? manualOverrides.map(s=> Array.from(s||[])) : [],
        };
        return state;
      }catch(e){ try{ console.warn('[drawgrid] getState failed', e); }catch{} return { steps: cols|0, autotune: !!autoTune }; }
    },
    hasActiveNotes: () => {
      try {
        return !!(currentMap?.active && currentMap.active.some(Boolean));
      } catch { return false; }
    },
    setState: (st={})=>{
      try{
        // Steps first
        if (typeof st.steps === 'number' && (st.steps===8 || st.steps===16)){
          if ((st.steps|0) !== cols){
            cols = st.steps|0;
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
        // Restore strokes
        if (Array.isArray(st.strokes)){
          strokes = [];
          for (const s of st.strokes){
            let pts = [];
            if (Array.isArray(s?.ptsN)){
              const gh = Math.max(1, gridArea.h - topPad);
              pts = s.ptsN.map(np=>({
                x: gridArea.x + (Number(np?.nx)||0) * gridArea.w,
                y: (gridArea.y + topPad) + (Number(np?.ny)||0) * gh
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
          // Redraw from strokes and rebuild nodes
          clearAndRedrawFromStrokes();
        }
        if (Array.isArray(st.eraseStrokes)) {
          eraseStrokes = [];
          for (const s of st.eraseStrokes) {
            let pts = [];
            if (Array.isArray(s?.ptsN)) {
              const gh = Math.max(1, gridArea.h - topPad);
              pts = s.ptsN.map(np=>({
                x: gridArea.x + Math.max(0, Math.min(1, Number(np?.nx)||0)) * gridArea.w,
                y: (gridArea.y + topPad) + Math.max(0, Math.min(1, Number(np?.ny)||0)) * gh
              }));
            }
            eraseStrokes.push({ pts });
          }
          clearAndRedrawFromStrokes();
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
              try{ panel.dispatchEvent(new CustomEvent('drawgrid:update', { detail: currentMap })); }catch{}
          } catch(e){ try{ console.warn('[drawgrid] apply nodes failed', e); }catch{} }
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
        if (currentMap){ try{ panel.dispatchEvent(new CustomEvent('drawgrid:update', { detail: currentMap })); }catch{} }
      }catch(e){ try{ console.warn('[drawgrid] setState failed', e); }catch{} }
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
    pctx.clearRect(0, 0, cssW, cssH);
    nctx.clearRect(0, 0, cssW, cssH);

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
    } catch(e){ try{ console.warn('[drawgrid random special line]', e); }catch{} }

    drawGrid();
    drawNodes(currentMap.nodes);
    panel.dispatchEvent(new CustomEvent('drawgrid:update', { detail: currentMap }));
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
    panel.dispatchEvent(new CustomEvent('drawgrid:update', { detail: currentMap }));
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
        persistentDisabled = currentMap.disabled; // Update the master disabled set
        drawGrid();
        drawNodes(currentMap.nodes);
        panel.dispatchEvent(new CustomEvent('drawgrid:update', { detail: currentMap }));
    }
  }
  panel.addEventListener('toy-random', handleRandomize);
  panel.addEventListener('toy-random-blocks', handleRandomizeBlocks);
  panel.addEventListener('toy-random-notes', handleRandomizeNotes);

  // The ResizeObserver only fires on *changes*. We must call layout() once
  // manually to render the initial state. requestAnimationFrame ensures
  // the browser has finished its own layout calculations first.
  requestAnimationFrame(() => resnapAndRedraw(false));

  let ghostGuideAnimFrame = null;
  let ghostGuideLoopId = null;
  let ghostGuideAutoActive = false;
  const GHOST_SWEEP_DURATION = 2000;
  const GHOST_SWEEP_PAUSE = 1000;

  function stopGhostGuide() {
    if (ghostGuideAnimFrame) {
      cancelAnimationFrame(ghostGuideAnimFrame);
      ghostGuideAnimFrame = null;
    }
    ghostCtx.setTransform(1,0,0,1,0,0);
    ghostCtx.clearRect(0,0,ghostCanvas.width,ghostCanvas.height);
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
    stopGhostGuide();
    
    const r = panel.getBoundingClientRect();
    const pad = 24;
    const H = Math.max(1, r.height - pad * 2);
    const centerY = r.height / 2;

    // Ensure the sweep crosses the vertical center of the panel.
    if (Math.random() < 0.5) {
        startY = pad + Math.random() * (H / 2 - H * 0.2);
        endY = centerY + Math.random() * (H / 2 - H * 0.2);
    } else {
        startY = centerY + Math.random() * (H / 2 - H * 0.2);
        endY = pad + Math.random() * (H / 2 - H * 0.2);
    }
    
    // Ensure it always goes left to right
    if (startX > endX) [startX, endX] = [endX, startX];

    const startTime = performance.now();
    let last = null;
    let lastTrail = 0;
    const noiseSeed = Math.random() * 100;

    function frame(now) {
      const elapsed = now - startTime;
      let t = Math.min(elapsed / duration, 1);

      if (!cw || !ch) { layout(true); }

      const wiggleAmp = r.height * 0.25; // User can tweak this

      const x = startX + (endX - startX) * t;
      let y = startY + (endY - startY) * t;

      if (wiggle) {
        const wiggleFactor = Math.sin(t * Math.PI * 3) * Math.sin(t * Math.PI * 0.5 + noiseSeed);
        y += wiggleAmp * wiggleFactor;
      }
      
      const topBound = pad;
      const bottomBound = r.height - pad;
      if (y > bottomBound) {
        y = bottomBound - (y - bottomBound);
      } else if (y < topBound) {
        y = topBound + (topBound - y);
      }

      // Fade old trail
      ghostCtx.save();
      ghostCtx.setTransform(1,0,0,1,0,0);
      ghostCtx.globalCompositeOperation = 'destination-out';
      ghostCtx.globalAlpha = 0.1;
      ghostCtx.fillRect(0, 0, ghostCanvas.width, ghostCanvas.height);
      ghostCtx.restore();

      // Draw new segment
      if (last) {
        ghostCtx.save();
        ghostCtx.setTransform(dpr,0,0,dpr,0,0);
        ghostCtx.globalCompositeOperation = 'source-over';
        ghostCtx.globalAlpha = 0.2; // Even more subtle
        ghostCtx.lineCap = 'round';
        ghostCtx.lineJoin = 'round';
        ghostCtx.lineWidth = Math.max(getLineWidth()*1.15, 24);
        ghostCtx.strokeStyle = 'rgba(68, 112, 255, 0.7)'; // User tweaked color
        ghostCtx.beginPath();
        ghostCtx.moveTo(last.x, last.y);
        ghostCtx.lineTo(x, y);
        ghostCtx.stroke();
        ghostCtx.restore();
      }
      last = { x, y };

      const force = 0.8; // Increased knockback
      const radius = getLineWidth() * 1.5;
      particles.drawingDisturb(x, y, radius, force);
      if (trail && now - lastTrail >= trailEveryMs) {
        particles.ringBurst(x, y, radius, trailCount, trailSpeed, 'pink');
        lastTrail = now;
      }

      if (t < 1) {
        ghostGuideAnimFrame = requestAnimationFrame(frame);
      } else {
        ghostCtx.save();
        ghostCtx.setTransform(1,0,0,1,0,0);
        ghostCtx.globalCompositeOperation = 'destination-out';
        ghostCtx.globalAlpha = 1;
        ghostCtx.fillRect(0, 0, ghostCanvas.width, ghostCanvas.height);
        ghostCtx.restore();
        stopGhostGuide();
      }
    }
    ghostGuideAnimFrame = requestAnimationFrame(frame);
  }

  function runAutoGhostGuideSweep() {
    if (!ghostGuideAutoActive) return;
    const rect = panel.getBoundingClientRect();
    if (!rect || rect.width <= 48 || rect.height <= 48) {
      if (ghostGuideAutoActive) requestAnimationFrame(runAutoGhostGuideSweep);
      return;
    }
    const pad = 24;
    const startX = pad;
    const endX = Math.max(pad + 1, rect.width - pad);
    const startY = pad;
    const endY = Math.max(pad + 1, rect.height - pad);
    startGhostGuide({
      startX,
      endX,
      startY,
      endY,
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
    stopGhostGuide();
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
      dragHintGhosts = [];
      dragHintIndex = 0;
      lastDragHintTime = 0;
      startTutorialHighlightLoop();
    } else if (tutorialHighlightMode === 'drag') {
      tutorialHighlightMode = 'none';
      stopTutorialHighlightLoop();
    }
  });

  panel.addEventListener('drawgrid:update', (e) => {
    const nodes = e?.detail?.nodes;
    const hasAny = Array.isArray(nodes) && nodes.some(set => set && set.size > 0);
    if (hasAny) {
      stopAutoGhostGuide({ immediate: true });
    } else {
      startAutoGhostGuide({ immediate: true });
    }
  });

  requestAnimationFrame(() => {
    const hasStrokes = Array.isArray(strokes) && strokes.length > 0;
    const hasNodes = Array.isArray(currentMap?.nodes)
      ? currentMap.nodes.some(set => set && set.size > 0)
      : false;
    if (!hasStrokes && !hasNodes) {
      startAutoGhostGuide({ immediate: true });
    }
  });

  try { panel.dispatchEvent(new CustomEvent('drawgrid:ready', { bubbles: true })); } catch {}
  return api;
}

