// src/chordwheel.js — chord wheel with 16-step radial ring (per active segment)
import { initToyUI } from './toyui.js';
import { NUM_STEPS, TICKS_PER_BAR, getLoopInfo, getTransportState, ensureAudioContext, getToyGain, isRunning, registerActiveNode } from './audio-core.js';
import { createChordWheelStrumParticles } from './chordwheel-strum-particles.js';
import {
  CHORDWHEEL_STRUM_LOGICAL_WIDTH,
  chordWheelStrumClientToLogical,
  createChordWheelStrumViewportSpace,
} from './chordwheel-strum-viewport-space.js';
import {
  CHORDWHEEL_MAIN_LOGICAL_HEIGHT,
  CHORDWHEEL_MAIN_LOGICAL_WIDTH,
  chordWheelMainClientToLogical,
  createChordWheelMainViewportSpace,
  getChordWheelCubeGeometry,
  hitTestChordWheelCubes,
} from './chordwheel-main-viewport-space.js';
import { createToySurfaceManager } from './toy-surface-manager.js';
import { triggerNoteForToy } from './audio-trigger.js';
import { trackScheduledToySource } from './audio-samples.js';
import { drawBlock, whichThirdRect } from './toyhelpers.js';
import { requestPanelPulse } from './pulse-border.js';
import { queueClassToggle, markPanelForDomCommit } from './dom-commit.js';
import { createChordWheelStrumTimes } from './chordwheel-timing.js';
import { bumpToyAudioGen } from './toy-audio.js';
import {
  activatePlaybackInstance,
  deactivatePlaybackInstance,
  ensurePlaybackInstance,
  getPlaybackInstance,
  getPlaybackLocalTick,
  getPlaybackStepEvents,
  removePlaybackInstance,
} from './playback-instances.js';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function degreeToChordName(deg) {
  // `deg` is now a state from 1-14. 1-7 are major, 8-14 are minor.
  const degree = ((deg - 1) % 7) + 1;
  const isMinor = deg > 7;

  const rootOffset = MAJOR_SCALE[(degree - 1 + 7) % 7];
  const rootNoteIndex = (60 + rootOffset) % 12;
  const rootNoteName = NOTE_NAMES[rootNoteIndex];

  if (isMinor) {
    // When selecting the minor variant of a chord, always label it as minor ('m'),
    // not diminished ('°'). This makes Bm selectable instead of B°.
    return rootNoteName + 'm';
  }
  return rootNoteName; // Major
}
function midiToName(midi) {
  if (midi == null) return '';
  const n = ((midi % 12) + 12) % 12;
  const o = Math.floor(midi / 12) - 1;
  return NOTE_NAMES[n] + o;
}
const COLORS = ['#60a5fa','#34d399','#fbbf24','#a78bfa','#f87171','#22d3ee','#eab308','#fb7185'];
// This map now uses the simple chord names (e.g., "C", "Dm") as the `source`.
// This matches the `instrument` IDs that are loaded from samples.csv,
// resolving the "instrument not found" errors.
const CHORD_SAMPLE_MAP = {
  "C":   { source: "C",  shift: 0 },
  "Cm":  { source: "Dm", shift: -2 },
  "C#":  { source: "C",  shift: 1 },
  "C#m": { source: "Em", shift: -1 },
  "D":   { source: "C",  shift: 2 },
  "Dm":  { source: "Dm", shift: 0 },
  "D#":  { source: "F",  shift: -1 },
  "D#m": { source: "Em", shift: 1 },
  "E":   { source: "E",  shift: 0 },
  "Em":  { source: "Em", shift: 0 },
  "F":   { source: "F",  shift: 0 },
  "Fm":  { source: "Am", shift: -2 },
  "F#":  { source: "E",  shift: 2 },
  "F#m": { source: "Em", shift: 2 },
  "G":   { source: "G",  shift: 0 },
  "Gm":  { source: "Am", shift: -2 },
  "G#":  { source: "G",  shift: 1 },
  "G#m": { source: "Am", shift: -1 },
  "A":   { source: "G",  shift: 2 },
  "Am":  { source: "Am", shift: 0 },
  "A#":  { source: "C",  shift: -2 },
  "A#m": { source: "Dm", shift: -1 },
  "B":   { source: "G",  shift: 2 },
  "Bm":  { source: "Am", shift: 2 }
};

// --- Strum Animation State ---
let strumBend = 0;
const STRUM_BEND_AMP = 25;
const STRUM_BEND_DECAY = 0.88;

let strumBgPulse = 0;
const PULSE_DECAY = 0.92;

function findChainHead(toy) {
  if (!toy) return null;
  let current = toy;
  let sanity = 100;
  while (current && current.dataset?.prevToyId && sanity-- > 0) {
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

export function createChordWheel(panel){
  initToyUI(panel, { toyName: 'Chord Wheel', defaultInstrument: 'Acoustic Guitar' });
  const toyId = panel.dataset.toyid = panel.id || `chordwheel-${Math.random().toString(36).slice(2, 8)}`;
  panel.__audioToyId = toyId;
  const audioCtx = ensureAudioContext();
  const initialTransport = getTransportState();
  if (isRunning()) {
    activatePlaybackInstance(panel.id, initialTransport.currentTick, { loopLengthTicks: TICKS_PER_BAR, quantize: true });
  } else {
    ensurePlaybackInstance(panel.id, { active: true, startTick: 0, loopLengthTicks: TICKS_PER_BAR });
  }



  // --- Strum Realism: Light EQ + Compressor Bus ---
  // To make the strum sit like a guitar and reduce low-end rumble, insert a
  // gentle high-pass and low-shelf cut before a glue compressor on the toy bus.
  try {
    const toyGain = getToyGain(toyId);
    if (toyGain.context) { // Ensure we have a valid gain node
      const destination = toyGain.destination || audioCtx.destination;
      toyGain.disconnect();

      // High-pass to remove sub rumble but keep E2 (~82 Hz)
      const hpf = audioCtx.createBiquadFilter();
      hpf.type = 'highpass';
      hpf.frequency.value = 78; // just below low E fundamental
      hpf.Q.value = 0.707;

      // Gentle low-shelf dip to tame boominess
      const lowShelf = audioCtx.createBiquadFilter();
      lowShelf.type = 'lowshelf';
      lowShelf.frequency.value = 180; // below low mids
      lowShelf.gain.value = -2.5;     // subtle

      const compressor = audioCtx.createDynamicsCompressor();
      compressor.threshold.value = -26; compressor.ratio.value = 3.5;
      compressor.attack.value = 0.008; compressor.release.value = 0.14;

      toyGain.connect(hpf);
      hpf.connect(lowShelf);
      lowShelf.connect(compressor);
      compressor.connect(destination);
    }
  } catch (e) { console.warn(`[chordwheel] Could not install compressor for ${toyId}`, e); }
  const body = panel.querySelector('.toy-body'); body.innerHTML = '';
  // This is a common flexbox fix. When a flex item (like this toy-body) contains
  // an element with an intrinsic aspect ratio (the SVG wheel), it can prevent the
  // container from shrinking properly, leading to infinite expansion. Setting
  // min-height to 0 on the flex item breaks this feedback loop.
  body.style.minHeight = '0';
  const wrap = el('div', 'cw-wrap'); const flex = el('div', 'cw-flex'); wrap.appendChild(flex); body.appendChild(wrap);
  Object.assign(wrap.style, { width: '100%' }); // Height must be intrinsic to content
  // The flex container will center both the SVG wheel and the overlay canvas.
  Object.assign(flex.style, { position: 'relative', display: 'flex', alignItems: 'stretch', justifyContent: 'center', gap: '20px', width: '100%' }); // Height must be intrinsic

  // Strum area with particle field behind it
  const strumWrap = el('div', 'cw-strum-wrap');
  Object.assign(strumWrap.style, { position: 'relative', flex: '1 1 0px', minWidth: '0' });
  const particleCanvas = el('canvas', 'cw-particles');
  Object.assign(particleCanvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '0' });
  const particleCtx = particleCanvas.getContext('2d');
  const strumCanvas = el('canvas', 'cw-strum');
  // Must be absolute to not participate in flex-item height calculation, breaking a layout loop.
  Object.assign(strumCanvas.style, { position: 'absolute', inset: '0', zIndex: '1', width: '100%', height: '100%' });
  const strumCtx = strumCanvas.getContext('2d');
  strumWrap.appendChild(particleCanvas);
  strumWrap.appendChild(strumCanvas);
  flex.appendChild(strumWrap);
  let strumLabel = strumWrap.querySelector('.chordwheel-swipe-label');
  if (!strumLabel) {
    strumLabel = el('div', 'toy-action-label chordwheel-swipe-label');
    strumLabel.textContent = 'SWIPE';
    strumWrap.appendChild(strumLabel);
  }

  const applyStrumPrompt = () => {
    const rect = strumWrap.getBoundingClientRect();
    const minSide = Math.min(rect.width || 0, rect.height || 0);
    const sizePx = minSide > 0 ? Math.max(22, Math.floor(minSide * 0.16)) : 28;
    strumLabel.style.fontSize = sizePx + 'px';
    strumLabel.style.opacity = strumWrap.dataset.strumPromptDismissed === '1' ? '0' : '0.55';
  };
  applyStrumPrompt();
  if (!strumWrap.__promptObserver && typeof ResizeObserver !== 'undefined') {
    try {
      const ro = new ResizeObserver(() => applyStrumPrompt());
      ro.observe(strumWrap);
      strumWrap.__promptObserver = ro;
    } catch {}
  }

  const dismissStrumPrompt = () => {
    if (strumWrap.dataset.strumPromptDismissed === '1') return;
    strumWrap.dataset.strumPromptDismissed = '1';
    strumLabel.style.opacity = '0';
  };
  strumCanvas.addEventListener('pointerdown', dismissStrumPrompt);
  strumCanvas.addEventListener('pointermove', dismissStrumPrompt);

  // Particle field for strum area
  const particles = createChordWheelStrumParticles();
  const strumSurface = createToySurfaceManager({
    panel,
    body: strumWrap,
    getBoardScale: () => window.__boardScale || 1,
    tag: 'chordwheel-strum',
  });
  strumSurface.registerCanvas('particles', particleCanvas, { policy: 'managed' });
  strumSurface.registerCanvas('gesture', strumCanvas, { policy: 'managed' });
  strumSurface.syncNow('init');

  // Wrapper for wheel and cubes
  const wheelWrap = el('div', 'cw-wheel-wrap');
  Object.assign(wheelWrap.style, { position: 'relative', flex: '1 1 0px', minWidth: '0' });
  flex.appendChild(wheelWrap);

  const NUM_SLICES = 8;
  let numSteps = 8; // Default to 8 steps
  let stepStates = Array(numSteps).fill(-1); // -1: off, 1: arp up, 2: arp down
  panel.__chordwheelStepStates = stepStates;
  panel.__chordwheelHasActive = false;
  let progression = Array(numSteps).fill(1);
  panel.__seqRev = panel.__seqRev || 0;

  const rebuildSeqPattern = () => {
    panel.__seqPattern = {
      numSteps,
      stepStates: Array.from(stepStates),
      progression: Array.from(progression),
      instrument: panel.dataset.instrument || 'acoustic_guitar',
      chordOct: Number(panel.dataset.chordOct || 0),
      chordOctPreview: panel.dataset.chordOctPreview || '',
    };
  };
  const touchDefinition = () => {
    panel.__seqRev += 1;
    rebuildSeqPattern();
  };
  rebuildSeqPattern();

  const activateAtTransport = ({ retrigger = false } = {}) => {
    const transport = getTransportState();
    const existing = getPlaybackInstance(panel.id);
    const instance = activatePlaybackInstance(panel.id, transport.currentTick, {
      loopLengthTicks: TICKS_PER_BAR,
      quantize: transport.state === 'playing',
      retrigger,
    });
    if (instance !== existing) {
      bumpToyAudioGen(toyId, retrigger ? 'chordwheel-retrigger' : 'chordwheel-activate');
      panel.__forceSchedulerReset = true;
    }
    return instance;
  };
  panel.__chordWheelPlayback = {
    get instance(){ return getPlaybackInstance(panel.id); },
    activate: () => activateAtTransport({ retrigger: false }),
    retrigger: () => activateAtTransport({ retrigger: true }),
    deactivate: () => {
      const instance = deactivatePlaybackInstance(panel.id);
      bumpToyAudioGen(toyId, 'chordwheel-deactivate');
      panel.__forceSchedulerReset = true;
      return instance;
    },
  };
  panel.addEventListener('toy:start', () => panel.__chordWheelPlayback.activate());
  panel.addEventListener('toy:retrigger', () => panel.__chordWheelPlayback.retrigger());
  panel.addEventListener('toy:deactivate', () => panel.__chordWheelPlayback.deactivate());
  panel.addEventListener('toy-instrument', touchDefinition);

  // --- Create Canvas for Cubes ---
  const canvas = el('canvas', 'cw-cubes');
  const ctx = canvas.getContext('2d');
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'auto' });

  // --- Create SVG Wheel (no ring) ---
  const wheel = buildWheelWithRing(190, NUM_SLICES, {});
  // The SVG is for display and segment clicks only. It sits behind the canvas.
  Object.assign(wheel.svg.style, { pointerEvents: 'none', width: '100%', height: '100%', display: 'block' });
  wheelWrap.append(wheel.svg, canvas);
  const mainSurface = createToySurfaceManager({
    panel,
    body: wheelWrap,
    getBoardScale: () => window.__boardScale || 1,
    tag: 'chordwheel-main',
  });
  mainSurface.registerCanvas('wheel-cubes', canvas, { policy: 'managed' });
  mainSurface.syncNow('init');
  let cleanupRan = false;
  const cleanup = () => {
    if (cleanupRan) return;
    cleanupRan = true;
    try { console.debug?.(`[chordwheel] ${toyId} cleanup`); } catch {}
    try { mainSurface.destroy(); } catch {}
    try { strumSurface.destroy(); } catch {}
    try { deactivatePlaybackInstance(panel.id); } catch {}
    try { removePlaybackInstance(panel.id); } catch {}
  };
  panel.addEventListener('toy-remove', cleanup, { once: true });
  panel.__chordwheelCleanup = cleanup;

  // --- Steps Dropdown (Advanced Mode) ---
  const header = panel.querySelector('.toy-header');
  const right = header.querySelector('.toy-controls-right');
  const stepsSelect = el('select', 'cw-steps-select');
  stepsSelect.innerHTML = `<option value="8">8 Steps</option><option value="16">16 Steps</option>`;
  stepsSelect.value = String(numSteps);
  stepsSelect.style.display = 'none'; // Hidden by default
  if (right) right.appendChild(stepsSelect);

  stepsSelect.addEventListener('change', () => {
    const newNumSteps = parseInt(stepsSelect.value, 10);
    if (newNumSteps === numSteps) return;

    numSteps = newNumSteps;
    panel.dataset.steps = String(numSteps);

    // Reset state arrays for the new size
    stepStates = Array(numSteps).fill(-1);
    panel.__chordwheelStepStates = stepStates;
    panel.__chordwheelHasActive = false;
    flashes.length = numSteps; flashes.fill(0);

    // Update progression and labels
    progression = Array(numSteps).fill(1);
    updateLabels();
    touchDefinition();
  });

  // Keep header height stable and refresh labels on zoom
  panel.addEventListener('toy-zoom', () => {
    try { stepsSelect.style.display = 'none'; } catch {}
    try { updateLabels(); } catch {}
  });

  function updateLabels() {
    // Always show chord names on the wheel, matching assigned progression
    const arr = (numSteps === 16) ? progression.filter((_, i)=> i%2===0) : progression;
    const labels = arr.map((st)=> degreeToChordName(st||1));
    wheel.setLabels(labels);
  }
  function diatonicDegreeToState(d) {
    if ([1, 4, 5].includes(d)) return d; // Major I, IV, V
    if ([2, 3, 6, 7].includes(d)) return d + 7; // minor ii, iii, vi, and diminished vii
    return 1; // Fallback to I
  }

  wheel.setSliceColors(COLORS);
  updateLabels();

  function performRandomize(source = 'manual') {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('cw_dbg') === '1') {
      console.log(`[chordwheel random] ${toyId} via=${source}`);
    }

    const diatonicProgression = (numSteps === 16) ? randomPentatonicProgression16() : randomPentatonicProgression8();
    progression = diatonicProgression.map(diatonicDegreeToState);
    updateLabels();

    // New randomization logic:
    // - A random number of active steps (arpeggios).
    // - All active steps must have a gap of at least one empty step between them.
    // - One "double" (two adjacent active steps) is allowed per randomization.
    stepStates.fill(-1);
    const numActive = 3 + Math.floor(Math.random() * (numSteps / 2.5)); // Scale active steps
    const allowDouble = Math.random() < 0.5;
    const indices = Array.from({length: numSteps}, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [indices[i], indices[j]] = [indices[j], indices[i]]; }
    let placedCount = 0;
    const occupied = new Set();
    const isAvailable = (index) => !occupied.has(index); const occupy = (index) => { occupied.add(index); occupied.add((index - 1 + numSteps) % numSteps); occupied.add((index + 1 + numSteps) % numSteps); };
    if (allowDouble && numActive >= 2) {
      for (const idx1 of indices) {
        const idx2 = (idx1 + 1) % numSteps;
        if (isAvailable(idx1) && isAvailable(idx2)) {
          stepStates[idx1] = Math.random() < 0.5 ? 1 : 2; stepStates[idx2] = Math.random() < 0.5 ? 1 : 2;
          occupy(idx1); occupy(idx2);
          placedCount = 2; break;
        }
      }
    }
    while (placedCount < numActive) {
      const foundIndex = indices.find(idx => stepStates[idx] === -1 && isAvailable(idx));
      if (foundIndex === undefined) break; // No available slots left
      stepStates[foundIndex] = Math.random() < 0.5 ? 1 : 2;
      occupy(foundIndex);
      placedCount++;
    }
    touchDefinition();
  }

  panel.addEventListener('toy-random', () => performRandomize('toy-random'));
  panel.addEventListener('toy-clear',()=>{ stepStates.fill(-1); touchDefinition(); });
  // When a preceding toy in a chain is reset, this toy should also reset its pattern
  // to avoid playing an old pattern against a new one.
  // This is no longer needed as the global "randomize all" has been disabled.
  // panel.addEventListener('chain:stop', () => performRandomize('chain:stop'));

  let playheadIx = -1;
  let flashes = new Float32Array(numSteps);


  let lastClickDebug = null; // For debugging click positions
  // --- Canvas Click Handler ---
  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    const p = chordWheelMainClientToLogical({ x: e.clientX, y: e.clientY }, r);

    lastClickDebug = { p, t: Date.now() }; // Store for debug drawing

    const isZoomed = panel.classList.contains('toy-zoomed');

    if (isZoomed) {
      // In zoomed mode, interact with the inner chord-selection cubes.
      const { cubes: innerCubes } = getChordWheelCubeGeometry({ count: NUM_SLICES, inner: true });
      const innerIndex = hitTestChordWheelCubes(innerCubes, p);
      if (innerIndex >= 0) {
          const i = innerIndex;
          const c = innerCubes[i];
              const third = whichThirdRect(c, p.y);
              if (third === 'toggle') return; // Ignore middle clicks

              const baseDegreeIndex = (numSteps === 16) ? (i * 2) : i;
              const currentDegree = progression[baseDegreeIndex] || 1;
              let newDegree = currentDegree;

              // New logic to interleave major/minor chords when cycling.
              const degree = ((currentDegree - 1) % 7) + 1;
              const isMinor = currentDegree > 7;

              if (third === 'up') {
                if (isMinor) {
                  // from minor to next major
                  const nextDegree = (degree % 7) + 1;
                  newDegree = nextDegree;
                } else {
                  // from major to same minor
                  newDegree = currentDegree + 7;
                }
              } else if (third === 'down') {
                if (isMinor) {
                  // from minor to same major
                  newDegree = currentDegree - 7;
                } else {
                  // from major to previous minor
                  const prevDegree = ((degree - 2 + 7) % 7) + 1;
                  newDegree = prevDegree + 7;
                }
              }

              if (newDegree !== currentDegree) {
                  if (numSteps === 16) { progression[baseDegreeIndex] = newDegree; progression[baseDegreeIndex + 1] = newDegree; }
                  else { progression[baseDegreeIndex] = newDegree; }
                  updateLabels();
                  touchDefinition();
              }
          return; // Click was handled, stop processing.
      }
    }
    // Always allow outer cube interaction (strum direction)
    {
      const { cubes } = getChordWheelCubeGeometry({ count: numSteps });
      const cubeIndex = hitTestChordWheelCubes(cubes, p);
      if (cubeIndex >= 0) {
          const i = cubeIndex;
          // Cycle through states: -1 (off) -> 1 (up) -> 2 (down) -> -1
          const current = stepStates[i];
          if (current === -1) stepStates[i] = 1;
          else if (current === 1) stepStates[i] = 2;
          else stepStates[i] = -1;
          touchDefinition();
          return; // Click handled
      }
    }
  });

  // --- Strum Interaction ---
  let isStrumming = false;
  let lastStrumLogicalX = 0;
  let lastBeat = -1;

  function performStrum(direction) {
    const chord = buildChord(progression[playheadIx] || 1);
    const chordName = degreeToChordName(progression[playheadIx] || 1);

    scheduleStrum({ notes: chord, direction, chordName });

    // Trigger animation: a positive or negative bend
    strumBend = (direction === 'down') ? STRUM_BEND_AMP : -STRUM_BEND_AMP;

    // Set the arpeggio state of the currently highlighted cube
    if (playheadIx >= 0 && playheadIx < numSteps) {
        stepStates[playheadIx] = (direction === 'down') ? 2 : 1; // 2 for down, 1 for up
        touchDefinition();
    }
  }

  strumCanvas.addEventListener('pointerdown', e => {
    strumCanvas.setPointerCapture(e.pointerId);
    isStrumming = true;
    const point = chordWheelStrumClientToLogical({ x: e.clientX, y: e.clientY }, strumCanvas.getBoundingClientRect());
    lastStrumLogicalX = point.x;
  });

  strumCanvas.addEventListener('pointermove', e => {
    if (!isStrumming) return;

    const logicalX = chordWheelStrumClientToLogical({ x: e.clientX, y: e.clientY }, strumCanvas.getBoundingClientRect()).x;
    const strumMidX = CHORDWHEEL_STRUM_LOGICAL_WIDTH / 2;
    
    // Check for crossing the midline to trigger a strum
    if (lastStrumLogicalX < strumMidX && logicalX >= strumMidX) {
        performStrum('down'); // Crossing from left to right
    } else if (lastStrumLogicalX > strumMidX && logicalX <= strumMidX) {
        performStrum('up'); // Crossing from right to left
    }

    lastStrumLogicalX = logicalX;
  });

  const onPointerUp = e => {
    isStrumming = false;
    strumCanvas.releasePointerCapture(e.pointerId);
  };

  strumCanvas.addEventListener('pointerup', onPointerUp);
  strumCanvas.addEventListener('pointercancel', onPointerUp);

  // --- Main Render Loop ---
  let lastParticleFrameTime = null;
  function draw(frameTime) {
    if (!panel.isConnected) {
      cleanup();
      return;
    }
    requestAnimationFrame(draw);

    // --- Timing and Playhead Logic ---
    const info = getLoopInfo();
    const running = (typeof isRunning === 'function') ? !!isRunning() : true;

    // A Chord Wheel is "running" if it's the active toy in a chain,
    // OR if it's a standalone toy (not part of any chain),
    // AND the global transport is playing.
    const isActiveInChain = panel.dataset.chainActive !== 'false';
    const isChained = !!(panel.dataset.nextToyId || panel.dataset.prevToyId);
    const hasActiveSteps = stepStates.some(s => s !== -1);
    panel.__chordwheelHasActive = hasActiveSteps;
    panel.__chordwheelStepStates = stepStates;
    const shouldRun = (isActiveInChain || !isChained) && running;

    if (panel.__pulseRearm) {
      requestPanelPulse(panel, { rearm: true });
      panel.__pulseRearm = false;
      panel.__pulseHighlightFired = true;
    }

    if (panel.__pulseHighlight && panel.__pulseHighlight > 0) {
      if (!panel.__pulseHighlightFired) {
        requestPanelPulse(panel);
        panel.__pulseHighlightFired = true;
      }
      panel.__pulseHighlight = Math.max(0, panel.__pulseHighlight - 0.05);
    } else if (panel.__pulseHighlightFired) {
      panel.__pulseHighlightFired = false;
    }

    const head = isChained ? findChainHead(panel) : panel;
    const chainHasNotes = head ? chainHasSequencedNotes(head) : hasActiveSteps;

    // Only show the outline while transport is running.
    let showPlaying;
    if (running) {
      showPlaying = isChained ? (isActiveInChain && chainHasNotes) : hasActiveSteps;
    } else {
      showPlaying = false;
    }
    // Avoid DOM writes in rAF: queue for deferred commit.
    markPanelForDomCommit(panel);
    queueClassToggle(panel, 'toy-playing', showPlaying);

    // Background pulse on global beat
    // This was changed to `shouldRun` to disable the pulse when inactive.
    // The `else` block that set the pulse to 0 is removed to allow the pulse to decay naturally.
    if (shouldRun) {
      const currentBeatInBar = Math.floor(info.phase01 * 4);
      if (currentBeatInBar !== lastBeat) {
        if (currentBeatInBar === 0) {
          strumBgPulse = 1.0; // Strong pulse on the downbeat
        } else {
          strumBgPulse = 0.5; // Weaker pulse on other quarter notes
        }
        lastBeat = currentBeatInBar;
      }
    }

    // Visual phase reads the same playback instance as the audio scheduler.
    const playbackInstance = getPlaybackInstance(panel.id);
    const transportTick = Number(info?.currentTick) || 0;
    const localTick = getPlaybackLocalTick(playbackInstance, transportTick);
    if (localTick != null && (isActiveInChain || !isChained)) {
      playheadIx = Math.floor((localTick * numSteps) / playbackInstance.loopLengthTicks) % numSteps;
    } else if (running) {
      playheadIx = -1;
    }

    // The hand should rotate over 8 visual segments, in sync with the 16 steps.
    // Freeze the wheel hand when paused
    try{
      const visualPhase = localTick == null ? 0 : localTick / playbackInstance.loopLengthTicks;
      const totalPhase8 = visualPhase * NUM_SLICES;
      const handSegment = Math.floor(totalPhase8);
      const phaseInHandSegment = totalPhase8 - handSegment;
      let use;
      if (localTick != null && (isActiveInChain || !isChained)) {
        use = { seg: handSegment, phase: phaseInHandSegment };
      } else {
        use = { seg: 0, phase: 0 }; // Default to straight up when not playing
      }
      wheel.setHand(use.seg, use.phase);
    }catch{}

    // --- Visual Rendering ---
    // Size and draw particle + strum canvases
    if (strumCanvas && particleCanvas) {
      strumSurface.syncNow('draw');
      const cw = Math.max(1, strumSurface.getCssW());
      const ch = Math.max(1, strumSurface.getCssH());
      const viewport = createChordWheelStrumViewportSpace({ width: cw, height: ch, backingScale: strumSurface.getDpr() });
      const dt = lastParticleFrameTime == null || !Number.isFinite(frameTime)
        ? 1 / 60
        : Math.min(0.05, Math.max(0, (frameTime - lastParticleFrameTime) / 1000));
      lastParticleFrameTime = Number.isFinite(frameTime) ? frameTime : lastParticleFrameTime;
      try{ if (!draw.__pbg) draw.__pbg = '#0b1116'; }catch{}
      try{ particles.step(dt); }catch{}
      try{
        const dpr = strumSurface.getDpr();
        particleCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        particleCtx.fillStyle = draw.__pbg; particleCtx.fillRect(0,0, cw,ch);
        particleCtx.translate(viewport.contentRect.left, viewport.contentRect.top);
        particleCtx.scale(viewport.presentationScale, viewport.presentationScale);
        particles.draw(particleCtx);
      }catch{}
      drawStrumArea(strumCtx, cw, ch);
    }

    mainSurface.syncNow('draw');
    const displayWidth = Math.max(1, mainSurface.getCssW());
    const displayHeight = Math.max(1, mainSurface.getCssH());
    const dpr = Math.max(0.25, mainSurface.getDpr());
    const mainViewport = createChordWheelMainViewportSpace({
      width: displayWidth,
      height: displayHeight,
      backingScale: dpr,
    });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, displayWidth, displayHeight);
    ctx.translate(mainViewport.contentRect.left, mainViewport.contentRect.top);
    ctx.scale(mainViewport.presentationScale, mainViewport.presentationScale);
    const w = CHORDWHEEL_MAIN_LOGICAL_WIDTH;
    const h = CHORDWHEEL_MAIN_LOGICAL_HEIGHT;
    // Ensure wheel labels reflect current progression in all views
    try{
      const arr = (numSteps === 16) ? progression.filter((_, i)=> i%2===0) : progression;
      const labels = arr.map(st => degreeToChordName(st||1));
      wheel.setLabels(labels);
    }catch{}
    const { cubes } = getChordWheelCubeGeometry({ count: numSteps });

    // Draw inner chord-name cubes only in Advanced view
    if (panel.classList.contains('toy-zoomed')){
      try { drawInnerCubes(ctx, w, h); } catch {}
    }


    // Always render outer step cubes (strum direction)
    {
      for (let i = 0; i < numSteps; i++) {
        const state = stepStates[i];
        const isActive = state !== -1;
        const flash = flashes[i] || 0;
        drawBlock(ctx, cubes[i], { active: isActive, flash, variant: 'button', showArrows: false });
        if (flash > 0) flashes[i] = Math.max(0, flash - 0.08);

        // Draw custom arrows for arpeggio state
        if (state === 1 || state === 2) {
          ctx.save();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          const c = cubes[i];
          const cx = c.x + c.w / 2;
          const cy = c.y + c.h / 2;
          const arrowW = c.w * 0.4;
          const arrowH = c.h * 0.4;
          ctx.beginPath();
          if (state === 1) { // Arp Up
            ctx.moveTo(cx - arrowW / 2, cy + arrowH / 2); ctx.lineTo(cx + arrowW / 2, cy + arrowH / 2); ctx.lineTo(cx, cy - arrowH / 2);
          } else { // Arp Down
            ctx.moveTo(cx - arrowW / 2, cy - arrowH / 2); ctx.lineTo(cx + arrowW / 2, cy - arrowH / 2); ctx.lineTo(cx, cy + arrowH / 2);
          }
          ctx.closePath(); ctx.fill();
          ctx.restore();
        }
      }
    }

    if (playheadIx >= 0) {
      const c = cubes[playheadIx];
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 3;
      ctx.strokeRect(c.x - 2, c.y - 2, c.w + 4, c.h + 4);
    }

    // Debug visuals removed

    // Decay pulse for next frame
    strumBgPulse *= PULSE_DECAY;
  }

  function dbToGain(db){ return Math.pow(10, db/20); }

  function addStrumNoise(time, sweep, direction) {
    try {
      const toyGain = getToyGain(toyId);
      const dur = Math.max(0.012, Math.min(0.035, sweep + 0.012));
      const noise = audioCtx.createBufferSource();
      const len = Math.ceil(audioCtx.sampleRate * dur);
      const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random()*2 - 1) * 0.5;
      noise.buffer = buf;

      const bp = audioCtx.createBiquadFilter();
      bp.type = 'bandpass';
      const fStart = direction === 'down' ? 1000 : 3200;
      const fEnd   = direction === 'down' ? 3200 : 1000;
      bp.frequency.setValueAtTime(fStart, time);
      bp.frequency.linearRampToValueAtTime(fEnd, time + dur);
      bp.Q.value = 0.707;

      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.linearRampToValueAtTime(dbToGain(-16), time + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);

      noise.connect(bp).connect(g).connect(toyGain);
      noise.start(time);
      noise.stop(time + dur + 0.01);
      try{ registerActiveNode(noise); trackScheduledToySource(toyId, noise, time); }catch{}
    } catch (e) { console.warn('[chordwheel] Strum noise failed', e); }
  }

  // Guitar voicing tables (EADGBE)
  const __CW_TUNING_EADGBE = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4 (6..1)
  const __CW_SHAPES = {
    'C':  'x32010', 'D':  'xx0232', 'E':  '022100', 'F':  '133211', 'G':  '320003', 'A':  'x02220', 'B':  'x24442',
    'Cm': 'x35543', 'Dm': 'xx0231', 'Em': '022000', 'Fm': '133111', 'Gm': '355333', 'Am': 'x02210', 'Bm': 'x24432',
    'C#':  'x46664', 'C#m': 'x46654', 'D#':  'x68886', 'D#m': 'x68876',
    'F#':  '244322', 'F#m': '244222', 'G#':  '466544', 'G#m': '466444',
    'A#':  'x13331', 'A#m': 'x13321'
  };
  function __cwShapeToMidi(shape){
    const out = [];
    for (let s=0; s<6; s++){
      const ch = shape[s];
      if (!ch || ch.toLowerCase()==='x'){ out.push(null); continue; }
      const fret = parseInt(ch, 10);
      if (!Number.isFinite(fret)) { out.push(null); continue; }
      out.push(__CW_TUNING_EADGBE[s] + fret);
    }
    return out;
  }
  function __cwVoicingForName(name, triad){
    const shp = __CW_SHAPES[String(name||'').trim()];
    if (shp) return __cwShapeToMidi(shp);
    const t = Array.isArray(triad) ? triad : [];
    return [null,null,null, t[0]||55, t[1]||59, t[2]||64];
  }

  function scheduleStrum({ notes, direction = 'down', chordName, when: authoritativeTime, definition = null }) {
    panel.__pulseHighlight = 1.0;
    panel.__pulseRearm = true;
    const instrument = definition?.instrument || panel.dataset.instrument || 'acoustic_guitar';
    const currentInstrument = instrument.toLowerCase().replace(/[\s-]+/g, '_');
    const chordOct = Number(definition?.chordOct ?? panel.dataset.chordOct ?? 1);

    if (false && currentInstrument === 'acoustic_guitar_chords') {
      const mapping = CHORD_SAMPLE_MAP[chordName] || CHORD_SAMPLE_MAP[chordName.replace('°', '')];
      if (mapping) {
        const { source, shift } = mapping;
        const playbackRate = Math.pow(2, (shift + 12 * (Number.isFinite(chordOct) ? chordOct : 1)) / 12);
        // The note name 'C4' is a placeholder as pitch is handled by playbackRate.
        // We override the instrument to play the specific chord sample.
        triggerNoteForToy(toyId, 'C4', 0.95, { playbackRate, instrument: source });
      }
      return; // Done for this instrument type
    }

    // --- E/E diagnostic mode: play only low E then high E with 1s gap ---
    try {
      const testFlag = String(panel.dataset.chordTestEe || '').toLowerCase();
      if (testFlag === '1' || testFlag === 'true'){
        const time = Number.isFinite(authoritativeTime) ? authoritativeTime : audioCtx.currentTime;
        // Playback-only octave preview support, same as strum path
        const __octPrevFlag = String(definition?.chordOctPreview ?? panel.dataset.chordOctPreview ?? '').toLowerCase();
        const __octPreview = (__octPrevFlag==='1' || __octPrevFlag==='true') ? 12 : 0;
        // If instrument metadata declares a baseNote that's an octave low (e.g., C3),
        // the sample path will align. Our E/E test uses MIDI names through triggerNoteForToy,
        // which routes to sample or tone consistently.
        const lowE  = 40 + __octPreview; // E2 (MIDI 40)
        const highE = 64 + __octPreview; // E4 (MIDI 64)
        const v = 0.85;
        triggerNoteForToy(toyId, midiToName(lowE),  v, { when: time });
        triggerNoteForToy(toyId, midiToName(highE), v, { when: time + 1.0 });
        try{ if (localStorage.getItem('cw_dbg')==='1') console.log('[chordwheel testEE]', { lowE, highE, when:[0,1.0] }); }catch{}
        return;
      }
    }catch{}

    // --- Guitar-style voicing and strum ---
    {
      const sweep = 0.065; // 65ms natural sweep for realistic strum
      const time = Number.isFinite(authoritativeTime) ? authoritativeTime : audioCtx.currentTime;
      let strings = __cwVoicingForName(chordName, notes);
      const oct = Number(definition?.chordOct ?? panel.dataset.chordOct ?? 0);
      if (Number.isFinite(oct) && oct !== 0){ strings = strings.map(m=> m==null? null : m + 12*oct); }
      // Playback-only octave preview: shift output by +12 when chordOctPreview is truthy ("1"/"true")
      const __octPrevFlag = String(definition?.chordOctPreview ?? panel.dataset.chordOctPreview ?? '').toLowerCase();
      const __octPreview = (__octPrevFlag==='1' || __octPrevFlag==='true') ? 12 : 0;
      const order = (direction === 'up') ? [5,4,3,2,1,0] : [0,1,2,3,4,5];
      const N = order.length;
      const strumTimes = createChordWheelStrumTimes(time, N, { sweep });
      // Per-string emphasis (6..1): tuck lows, let highs speak
      const mul = [0.58, 0.72, 0.85, 0.94, 1.00, 1.00];
      // Direction-aware base dynamics with gentle spread
      const baseVel = (i)=>{
        const t = i/(N-1||1);
        return (direction==='down') ? (0.92 - 0.10*t) : (0.82 + 0.10*t);
      };
      addStrumNoise(time, sweep, direction);
      const __times = []; const __vels = []; const __midi = [];
      // Compute musical step length to scale sustain by tempo and resolution
      let __stepDur = 0.5;
      try { const li = getLoopInfo(); __stepDur = Math.max(0.1, (li?.barLen || 2) / Math.max(1, numSteps)); } catch {}

      for (let k=0; k<N; k++){
        const si = order[k]; const midi = strings[si]; if (midi==null) continue;
        const when = strumTimes[k];
        const v0 = baseVel(k);
        const vm = mul[si] ?? 0.9;
        const vel  = Math.max(0.05, Math.min(1, v0 * vm));
        const midiOut = midi + __octPreview;
        __times.push(+(when-time).toFixed(4)); __vels.push(+vel.toFixed(2)); __midi.push(midiOut);
        // Tempo-scaled sustain: longer on trebles, shorter on bass, proportional to step duration
        // Longer musical sustains with gentle release; keeps ring without boom
        const decayMul = (si <= 1) ? 4.2 : (si <= 3 ? 5.6 : 7.4);
        const decaySec = Math.min(12.0, Math.max(2.8, __stepDur * decayMul));
        const releaseSec = (si <= 1) ? 0.6 : (si <= 3 ? 0.9 : 1.2);
        const sustainLevel = 0.24; // keep a modest level before release
        triggerNoteForToy(toyId, midiToName(midiOut), vel, { when, instrument, env: { decaySec, releaseSec, sustainLevel } });
        // Spawn particles along the string's vertical line; faster near vertical center
        try{
          const x = CHORDWHEEL_STRUM_LOGICAL_WIDTH * 0.5;
          const burstCount = 180;
          const baseSpeed = 4.6; // increase top speed
          const speedMul = 1.8;  // stronger overall scaling
          particles && particles.lineBurst(x, burstCount, baseSpeed, speedMul);
        }catch{}
      }
      try{ if (localStorage.getItem('cw_dbg')==='1') console.log('[chordwheel]', chordName, { dir:direction, strings, order, times:__times, vels:__vels, midi:__midi }); }catch{}
      return; // skip legacy triad path
    }
    // --- Existing strum logic for other instruments ---
    const sweep = 0.07; // 70ms for a more natural strum
    const baseVel = 0.9; // A bit louder base

    const time = audioCtx.currentTime;

    let orderedNotes = (direction === 'up') ? [...notes].reverse() : notes;
    const semis = (Number.isFinite(chordOct) ? chordOct : 1) * 12;
    if (semis) orderedNotes = orderedNotes.map(m => (m|0) + semis);
    const N = orderedNotes.length;
    const step = N > 1 ? sweep / (N - 1) : 0;

    addStrumNoise(time, sweep, direction);

    orderedNotes.forEach((midi, i) => {
      const delay = (i * step) + (Math.random() * 0.004 - 0.002); // ±2ms jitter
      triggerNoteForToy(toyId, midiToName(midi), baseVel, { when: time + delay });
    });
  }
  draw();

  panel.__sequencerEventsInWindow = (fromTick, toTick, instance) => (
    getPlaybackStepEvents(instance, fromTick, toTick, panel.__seqPattern?.numSteps || numSteps)
      .filter(event => (panel.__seqPattern?.stepStates?.[event.step] ?? -1) !== -1)
      .map(event => ({ ...event, eventKey: `chord:${event.step}` }))
  );
  panel.__sequencerScheduleEvent = (event, audioTime) => {
    const definition = panel.__seqPatternActive || panel.__seqPattern;
    const step = event?.step;
    const state = definition?.stepStates?.[step] ?? -1;
    if (state === -1) return;
    flashes[step] = 1.0;
    const degree = definition?.progression?.[step] || 1;
    scheduleStrum({
      notes: buildChord(degree),
      direction: state === 1 ? 'up' : 'down',
      chordName: degreeToChordName(degree),
      when: audioTime,
      definition,
    });
  };

  // Retained only so existing chain discovery includes Chord Wheel. Audio is
  // provided to the shared lookahead scheduler by the event-provider methods.
  panel.__sequencerStep = () => {};

  // Always-on: Press 'C' to play reference C4 tone (debug/tuning aid)
  try{
    if (!panel.__cwCKeybound){
      const onKey = (e)=>{
        try{
          const k = (e && (e.key||e.code) || '').toString().toLowerCase();
          if (k !== 'c') return;
          // Avoid typing into inputs/contenteditable
          const ae = document.activeElement;
          if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
          const t = audioCtx.currentTime;
          // Use tone synth as a neutral reference
          triggerNoteForToy(toyId, 'C4', 0.9, { when: t, instrument: 'tone' });
        }catch{}
      };
      document.addEventListener('keydown', onKey, true);
      panel.__cwCKeybound = true;
    }
  }catch{}
  function drawStrumArea(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);

    // Pulse background
    if (strumBgPulse > 0.01) {
        if (strumBgPulse > 0.6) { // Main beat gets a thick, scaling pulse
            ctx.lineWidth = 2 + (strumBgPulse * 12);
            ctx.strokeStyle = `rgba(255, 255, 255, ${strumBgPulse * 0.5})`;
            const inset = ctx.lineWidth / 2;
            ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
        } else { // Quarter notes get a non-scaling color flash
            ctx.lineWidth = 2;
            // Use a higher alpha multiplier to make the color flash more visible without thickness
            ctx.strokeStyle = `rgba(255, 255, 255, ${strumBgPulse * 0.8})`;
            const inset = 1;
            ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
        }
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();

    const midX = w / 2;

    if (Math.abs(strumBend) > 0.5) {
        // The whole string bows out, oscillating back and forth
        ctx.moveTo(midX, 0);
        for (let y = 0; y <= h; y++) {
            const t = y / h; // 0 to 1
            const xOffset = strumBend * Math.sin(t * Math.PI);
            ctx.lineTo(midX + xOffset, y);
        }
        // Decay and reverse direction for the next frame
        strumBend *= -STRUM_BEND_DECAY;
    } else {
        strumBend = 0; // Clamp to zero to stop animation
        ctx.moveTo(w / 2, 0);
        ctx.lineTo(w / 2, h);
    }
    ctx.stroke();
  }

  // --- Helper Functions ---
  function buildChord(state){ return maybeAddSeventh(buildChordFromState(state)); }

  function drawInnerCubes(ctx, w, h) {
      const { cubes: innerCubes } = getChordWheelCubeGeometry({ count: NUM_SLICES, inner: true });
      for (let i = 0; i < innerCubes.length; i++) {
          const cube = innerCubes[i];
          // Use the correct index to read the progression, especially for 16-step mode.
          const baseDegreeIndex = (numSteps === 16) ? i * 2 : i;
          const chordName = degreeToChordName(progression[baseDegreeIndex] || 1);
          drawBlock(ctx, cube, {
              active: true,
              variant: 'button',
              showArrows: true,
              noteLabel: chordName,
          });
      }
  }

  // Removed zoom-forced panel sizing to keep frame width stable across zoom
}

function buildWheelWithRing(radius, numSlices, api){
  const outerPad=70,size=radius*2+outerPad*2;
  const svg=svgEl('svg',{viewBox:`0 0 ${size} ${size}`,class:'cw-wheel'});
  const cx=size/2,cy=size/2,r=radius;

  svg.appendChild(svgEl('circle',{cx,cy,r:r+6,fill:'#0b111c',stroke:'#1f2a3d'}));
  const sliceGroup=svgEl('g',{class:'cw-slices'}); svg.appendChild(sliceGroup);
  const slicePaths=[];
  for(let i=0;i<numSlices;i++){ const path=describeSlice(cx,cy,r-2,(i/numSlices)*Math.PI*2-Math.PI/2,((i+1)/numSlices)*Math.PI*2-Math.PI/2);
    const p=svgEl('path',{d:path,fill:COLORS[i % COLORS.length],opacity:.75,stroke:'#1e293b','data-seg':i});
    if (api.onPickSeg) p.addEventListener('click',()=>api.onPickSeg(i));
    sliceGroup.appendChild(p); slicePaths.push(p); }

  const labelGroup=svgEl('g',{class:'cw-labels'}); svg.appendChild(labelGroup);
  function setLabels(arr){ while(labelGroup.firstChild)labelGroup.removeChild(labelGroup.firstChild);
    for(let i=0;i<numSlices;i++){ const aMid=((i+0.5)/numSlices)*Math.PI*2-Math.PI/2;
      const tx=cx+(r*0.58)*Math.cos(aMid),ty=cy+(r*0.58)*Math.sin(aMid)+8;
      const t=svgEl('text',{x:tx,y:ty,'text-anchor':'middle','font-size':'24','font-weight':'700',fill:'#e2e8f0'});
      t.textContent=arr[i]||''; labelGroup.appendChild(t);} }

  const hand=svgEl('line',{x1:cx,y1:cy,x2:cx,y2:cy-r,stroke:'#e2e8f0','stroke-width':4,'stroke-linecap':'round'}); svg.appendChild(hand);

  function setActiveSeg(seg){ if (slicePaths.length) slicePaths.forEach((p,i)=>p.classList.toggle('active',i===seg)); }
  function setSliceColors(cols){ slicePaths.forEach((p,i)=>p.setAttribute('fill',cols[i]||'#6b7280')); }
  function setHand(seg,localPhase){
    const angle=((seg+localPhase)/numSlices)*Math.PI*2-Math.PI/2;
    const x=cx+(r-6)*Math.cos(angle),y=cy+(r-6)*Math.sin(angle);
    hand.setAttribute('x2',x); hand.setAttribute('y2',y); }

  return{svg,setLabels,setHand,setSliceColors,setActiveSeg};
}

const MAJOR_SCALE=[0,2,4,5,7,9,11];

function buildChordFromState(state, tonicMidi = 60) { // tonicMidi is C4
  const degree = ((state - 1) % 7) + 1;
  const isMinor = state > 7;

  const scaleRootIndex = (degree - 1 + 7) % 7;
  let rootNoteMidi = tonicMidi + MAJOR_SCALE[scaleRootIndex];
  const rootNoteName = NOTE_NAMES[rootNoteMidi % 12];

  // New, more authentic open chord voicings with consistent register and correct note counts.
  // These are based on standard open chord shapes but voiced in a consistent, brighter register.
  const chordId = rootNoteName + (isMinor ? 'm' : '');
  const customVoicings = {
    'C':  [48, 52, 55, 60, 64],       // 5 notes (C3-E3-G3-C4-E4)
    'Cm': [48, 51, 55, 60, 63],       // 5 notes (C3-D#3-G3-C4-D#4)
    'D':  [50, 57, 62, 66],          // 4 notes (D3-A3-D4-F#4)
    'Dm': [50, 57, 62, 65],          // 4 notes (D3-A3-D4-F4)
    'E':  [52, 59, 64, 68, 71, 76],    // 6 notes (E3-B3-E4-G#4-B4-E5)
    'Em': [52, 59, 64, 67, 71, 76],    // 6 notes (E3-B3-E4-G4-B4-E5)
    'F':  [53, 60, 65, 69, 72, 77],    // 6 notes (F3-C4-F4-A4-C5-F5)
    'Fm': [53, 60, 65, 68, 72, 77],    // 6 notes (F3-C4-F4-G#4-C5-F5)
    'G':  [55, 59, 62, 67, 71, 74],    // 6 notes (G3-B3-D4-G4-B4-D5)
    'Gm': [55, 58, 62, 67, 70, 74],    // 6 notes (G3-A#3-D4-G4-A#4-D5)
    'A':  [57, 61, 64, 69, 73],       // 5 notes (A3-C#4-E4-A4-C#5)
    'Am': [57, 60, 64, 69, 72],       // 5 notes (A3-C4-E4-A4-C5)
    'B':  [59, 63, 66, 71],          // 4 notes (B3-D#4-F#4-B4)
    'Bm': [59, 62, 66, 71],          // 4 notes (B3-D4-F#4-B4)
  };

  if (customVoicings[chordId]) {
    return customVoicings[chordId].sort((a, b) => a - b);
  }

  // This fallback should not be reached with the comprehensive map above, but is kept as a safeguard.
  const thirdMidi = rootNoteMidi + (isMinor ? 3 : 4);
  const fifthMidi = rootNoteMidi + 7;
  return [rootNoteMidi, thirdMidi, fifthMidi, rootNoteMidi + 12].sort((a, b) => a - b);
}

function maybeAddSeventh(triad) {
  // This function is kept for signature compatibility but no longer adds a 7th randomly,
  // ensuring chords are consistent on repeated plays.
  // Return a copy to avoid mutation by other parts of the system.
  return [...triad];
}

function el(tag,cls){const n=document.createElement(tag);if(cls)n.className=cls;return n;}
function svgEl(tag,attrs={}){const n=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));return n;}
function describeSlice(cx,cy,r,a0,a1){const x0=cx+r*Math.cos(a0),y0=cy+r*Math.sin(a0),x1=cx+r*Math.cos(a1),y1=cy+r*Math.sin(a1);
  const large=(a1-a0)>Math.PI?1:0; return`M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`; }


// --- Improved chord progression generator (diatonic, variation, cadence) ---
const __CW_PRESETS = [
  [1,5,6,4],  // I–V–vi–IV
  [6,4,1,5],  // vi–IV–I–V
  [1,4,2,5],  // I–IV–ii–V
  [2,5,1,6],  // ii–V–I–vi
  [1,5,4,5],  // I–V–IV–V
  [1,3,6,4],  // I–iii–vi–IV
];

const __CW_SUBS = {
  1: [6],
  6: [1,3],
  4: [2],
  2: [4],
  5: [3,5],
  3: [5,6]
};

const __CW_ELIGIBLE_SLOTS = [2,4,6,8];

const __CW_PROB = {
  mutateEligibleSlots: 0.20,     // per eligible slot (scaled by position)
  cadenceWeights: { 5: 0.50, 4: 0.25, 6: 0.25 }, // V, IV, vi
  end8ToVOverride: 0.35,         // reinforce bar-8 as V sometimes
  loopB: { exact: 0.50, lightMutate: 0.30, flipLast4: 0.20 }
};

function __cwChance(p){ return Math.random() < p; }
function __cwPick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

function __cwPosBias(idx/*1..8*/){
  if (idx <= 2) return 0.5;
  if (idx <= 6) return 1.0;
  return 0.8;
}

function __cwSub(rn){
  const pool = __CW_SUBS[rn] || [];
  if (!pool.length) return rn;
  return __cwPick(pool);
}

function __cwDiatonicCadenceBar8(current){
  if (current === 5) return 5;
  const r = Math.random();
  const w = __CW_PROB.cadenceWeights;
  if (r < w[5]) return 5;
  if (r < w[5] + w[4]) return 4;
  return 6;
}

function __cwDiatonicMutate8(seq8){
  const out = seq8.slice();
  for (const slot of __CW_ELIGIBLE_SLOTS){
    if (!__cwChance(__CW_PROB.mutateEligibleSlots * __cwPosBias(slot))) continue;
    out[slot-1] = __cwSub(out[slot-1]);
  }
  return out;
}

function randomDiatonicProgression8(){
  // 1) pick preset (4) → duplicate to 8
  const base4 = __cwPick(__CW_PRESETS);
  let seq8 = [...base4, ...base4];

  // 2) gentle mutate
  seq8 = __cwDiatonicMutate8(seq8);

  // 3) optional push to V at bar 8 (legacy behavior)
  if (__cwChance(__CW_PROB.end8ToVOverride)) seq8[7] = 5;

  // 4) cadence shaping at bar 8
  seq8[7] = __cwDiatonicCadenceBar8(seq8[7]);

  return seq8;
}

function randomDiatonicProgression16(){
  const loopA = randomDiatonicProgression8();
  let loopB;
  const r = Math.random();
  const P = __CW_PROB.loopB;

  if (r < P.exact){
    loopB = loopA.slice();
  } else if (r < P.exact + P.lightMutate){
    loopB = __cwDiatonicMutate8(loopA);
    loopB[7] = __cwDiatonicCadenceBar8(loopB[7]);
  } else {
    // flip last 4 bars for turnaround
    const b = loopA.slice();
    const last4 = b.slice(4,8).reverse();
    loopB = [...b.slice(0,4), ...last4];
    loopB[7] = __cwDiatonicCadenceBar8(loopB[7]);
  }

  return [...loopA, ...loopB];
}

// --- Pentatonic chord progression generator (for Random button) ---
const __CW_PENTATONIC_PRESETS = [
  [1,5,6,2],  // I–V–vi–ii (was I-V-vi-IV)
  [6,2,1,5],  // vi–ii–I–V (was vi-IV-I-V)
  [2,5,1,6],  // ii–V–I–vi (already pentatonic)
  [1,2,5,6],  // I-ii-V-vi (variation)
  [1,3,6,2],  // I-iii-vi-ii (was I-iii-vi-IV)
];

const __CW_PENTATONIC_SUBS = {
  1: [6],
  6: [1,3,2],
  2: [6],
  5: [3,5],
  3: [5,6]
};

const __CW_PENTATONIC_PROB = {
  ...__CW_PROB,
  cadenceWeights: { 5: 0.50, 2: 0.25, 6: 0.25 }, // V, ii, vi
};

function __cwPentatonicSub(rn){
  const pool = __CW_PENTATONIC_SUBS[rn] || [];
  if (!pool.length) return rn;
  return __cwPick(pool);
}

function __cwPentatonicCadenceBar8(current){
  if (current === 5) return 5;
  const r = Math.random();
  const w = __CW_PENTATONIC_PROB.cadenceWeights;
  if (r < w[5]) return 5;
  if (r < w[5] + w[2]) return 2;
  return 6;
}

function __cwPentatonicMutate8(seq8){
  const out = seq8.slice();
  for (const slot of __CW_ELIGIBLE_SLOTS){
    if (!__cwChance(__CW_PENTATONIC_PROB.mutateEligibleSlots * __cwPosBias(slot))) continue;
    out[slot-1] = __cwPentatonicSub(out[slot-1]);
  }
  return out;
}

function randomPentatonicProgression8(){
  const base4 = __cwPick(__CW_PENTATONIC_PRESETS);
  let seq8 = [...base4, ...base4];
  seq8 = __cwPentatonicMutate8(seq8);
  if (__cwChance(__CW_PENTATONIC_PROB.end8ToVOverride)) seq8[7] = 5;
  seq8[7] = __cwPentatonicCadenceBar8(seq8[7]);
  return seq8;
}

function randomPentatonicProgression16(){
  const loopA = randomPentatonicProgression8();
  let loopB;
  const r = Math.random();
  const P = __CW_PENTATONIC_PROB.loopB;

  if (r < P.exact){
    loopB = loopA.slice();
  } else if (r < P.exact + P.lightMutate){
    loopB = __cwDiatonicMutate8(loopA);
    loopB[7] = __cwPentatonicCadenceBar8(loopB[7]);
  } else {
    const b = loopA.slice();
    const last4 = b.slice(4,8).reverse();
    loopB = [...b.slice(0,4), ...last4];
    loopB[7] = __cwDiatonicCadenceBar8(loopB[7]);
  }

  return [...loopA, ...loopB];
}
