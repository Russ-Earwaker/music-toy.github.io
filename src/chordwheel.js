// src/chordwheel.js — chord wheel with 16-step radial ring (per active segment)
import { initToyUI } from './toyui.js';
import { NUM_STEPS, getLoopInfo, ensureAudioContext, getToyGain } from './audio-core.js';
import { triggerNoteForToy } from './audio-trigger.js';
import { drawBlock } from './toyhelpers.js';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function degreeToChordName(deg) {
  const rootOffset = MAJOR_SCALE[(deg - 1 + 7) % 7];
  const rootNoteIndex = (60 + rootOffset) % 12; // 60 = C4
  const rootNoteName = NOTE_NAMES[rootNoteIndex];

  if ([1, 4, 5].includes(deg)) return rootNoteName;
  if ([2, 3, 6].includes(deg)) return rootNoteName + 'm';
  return rootNoteName + '°';
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

export function createChordWheel(panel){
  initToyUI(panel, { toyName: 'Chord Wheel', defaultInstrument: 'Acoustic Guitar Chords' });
  const toyId = panel.dataset.toyid = panel.id || `chordwheel-${Math.random().toString(36).slice(2, 8)}`;
  const audioCtx = ensureAudioContext();



  // --- Strum Realism: Compressor Bus ---
  // To "glue" the notes of the strum together, we'll route all audio for this
  // toy through a single compressor.
  try {
    const toyGain = getToyGain(toyId);
    if (toyGain.context) { // Ensure we have a valid gain node
      const destination = toyGain.destination || audioCtx.destination;
      toyGain.disconnect();

      const compressor = audioCtx.createDynamicsCompressor();
      compressor.threshold.value = -24; compressor.ratio.value = 4;
      compressor.attack.value = 0.006; compressor.release.value = 0.12;

      toyGain.connect(compressor); compressor.connect(destination);
    }
  } catch (e) { console.warn(`[chordwheel] Could not install compressor for ${toyId}`, e); }
  const body = panel.querySelector('.toy-body'); body.innerHTML = '';
  const wrap = el('div','cw-wrap'); const flex = el('div','cw-flex'); wrap.appendChild(flex); body.appendChild(wrap);
  // The flex container will center both the SVG wheel and the overlay canvas.
  Object.assign(flex.style, { position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' });

  const NUM_STEPS = 16;
  const NUM_SLICES = 8;
  const stepStates = Array(NUM_STEPS).fill(-1); // -1: off, 1: arp up, 2: arp down
  let progression = randomProgression16();

  // --- Create Canvas for Cubes ---
  const canvas = el('canvas', 'cw-cubes');
  const ctx = canvas.getContext('2d');
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'auto' });

  // --- Create SVG Wheel (no ring) ---
  const wheel = buildWheelWithRing(190, NUM_SLICES, {});
  // The SVG is for display and segment clicks only. It sits behind the canvas.
  Object.assign(wheel.svg.style, { pointerEvents: 'none' });
  flex.append(wheel.svg, canvas);

  function updateLabels() {
    const wheelLabels = progression.filter((_, i) => i % 2 === 0);
    wheel.setLabels(wheelLabels);
  }

  wheel.setSliceColors(COLORS);
  updateLabels();

  panel.addEventListener('toy-random',()=>{
    progression = randomProgression16();
    updateLabels();
    // New randomization logic:
    // - A random number of active steps (arpeggios).
    // - All active steps must have a gap of at least one empty step between them.
    // - One "double" (two adjacent active steps) is allowed per randomization.
    stepStates.fill(-1);

    const numActive = 3 + Math.floor(Math.random() * 5); // 3 to 7 active steps
    const allowDouble = Math.random() < 0.5;
    const indices = Array.from({length: NUM_STEPS}, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [indices[i], indices[j]] = [indices[j], indices[i]]; }

    let placedCount = 0;
    const occupied = new Set();
    const isAvailable = (index) => !occupied.has(index);
    const occupy = (index) => { occupied.add(index); occupied.add((index - 1 + NUM_STEPS) % NUM_STEPS); occupied.add((index + 1 + NUM_STEPS) % NUM_STEPS); };

    if (allowDouble && numActive >= 2) {
      for (const idx1 of indices) {
        const idx2 = (idx1 + 1) % NUM_STEPS;
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
  });
  panel.addEventListener('toy-clear',()=>{ stepStates.fill(-1); });

  let lastAudioStep = -1;
  let playheadIx = -1;
  const flashes = new Float32Array(NUM_STEPS);

  // --- Canvas Click Handler ---
  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    // Scale pointer coordinates to match the canvas's internal resolution,
    // which might be different from its CSS size due to device pixel ratio.
    const p = {
      x: (e.clientX - r.left) * (canvas.width / r.width),
      y: (e.clientY - r.top) * (canvas.height / r.height)
    };
    const { cubes } = getCubeGeometry(canvas.width, canvas.height, 190, NUM_STEPS);
    for (let i = 0; i < cubes.length; i++) {
      const c = cubes[i];
      if (p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h) {
        // Cycle through states: -1 (off) -> 1 (up) -> 2 (down) -> -1
        const current = stepStates[i];
        if (current === -1) stepStates[i] = 1;
        else if (current === 1) stepStates[i] = 2;
        else stepStates[i] = -1;
        break;
      }
    }
  });

  // --- Main Render Loop ---
  function draw() {
    if (!panel.isConnected) return;
    requestAnimationFrame(draw);

    // --- Timing and Playhead Logic ---
    const info = getLoopInfo();
    const totalPhase16 = info.phase01 * NUM_STEPS;
    const currentStep = Math.floor(totalPhase16);
    playheadIx = currentStep;

    // The hand should rotate over 8 visual segments, in sync with the 16 steps.
    const totalPhase8 = info.phase01 * NUM_SLICES;
    const handSegment = Math.floor(totalPhase8);
    const phaseInHandSegment = totalPhase8 - handSegment;
    wheel.setHand(handSegment, phaseInHandSegment);

    // --- Visual Rendering ---
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const { cubes } = getCubeGeometry(w, h, 190, NUM_STEPS);

    for (let i = 0; i < NUM_STEPS; i++) {
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

    if (playheadIx >= 0) {
      const c = cubes[playheadIx];
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 3;
      ctx.strokeRect(c.x - 2, c.y - 2, c.w + 4, c.h + 4);
    }

    // --- Audio Logic ---
    const audioStep = currentStep;
    if (audioStep !== lastAudioStep) {
      lastAudioStep = audioStep;

      const state = stepStates[audioStep];
      if (state !== -1) {
        flashes[audioStep] = 1.0;
        const chord = buildChord(progression[audioStep] || 1);
        const chordName = degreeToChordName(progression[audioStep] || 1);
        const direction = (state === 2) ? 'up' : 'down';
        scheduleStrum({ notes: chord, direction, chordName });
      }
    }
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
    } catch (e) { console.warn('[chordwheel] Strum noise failed', e); }
  }

  function scheduleStrum({ notes, direction = 'down', chordName }) {
    const currentInstrument = (panel.dataset.instrument || 'acoustic_guitar').toLowerCase().replace(/[\s-]+/g, '_');

    if (currentInstrument === 'acoustic_guitar_chords') {
      const mapping = CHORD_SAMPLE_MAP[chordName] || CHORD_SAMPLE_MAP[chordName.replace('°', '')];
      if (mapping) {
        const { source, shift } = mapping;
        const playbackRate = Math.pow(2, shift / 12);
        // The note name 'C4' is a placeholder as pitch is handled by playbackRate.
        // We override the instrument to play the specific chord sample.
        triggerNoteForToy(toyId, 'C4', 0.95, { playbackRate, instrument: source });
      }
      return; // Done for this instrument type
    }

    // --- Existing strum logic for other instruments ---
    const sweep = 0.008; // 8ms total sweep
    const baseVel = 0.85;


    const time = audioCtx.currentTime;

    const orderedNotes = (direction === 'up') ? [...notes].reverse() : notes;
    const N = orderedNotes.length;
    const step = N > 1 ? sweep / (N - 1) : 0;

    const velAt = i => { const t = i/(N-1 || 1); const curve = (direction === 'down') ? (0.8 + 0.4 * Math.sin(Math.PI * t)) : (1.2 - 0.4 * Math.sin(Math.PI * t)); return baseVel * curve; };
    addStrumNoise(time, sweep, direction);
    orderedNotes.forEach((midi, i) => {
      const delayMs = (i * step * 1000) + (Math.random() * 4 - 2); // ±2ms jitter
      const velocity = Math.max(0.05, Math.min(1, velAt(i)));
      setTimeout(() => triggerNoteForToy(toyId, midiToName(midi), velocity), delayMs);
    });
  }
  draw();

  // This toy manages its own timing via requestAnimationFrame. By setting
  // __sequencerStep to null, we ensure it's completely ignored by the main scheduler.
  panel.__sequencerStep = null;

  // --- Helper Functions ---
  function buildChord(deg){ return maybeAddSeventh(buildDiatonicTriad(deg)); }
}

function getCubeGeometry(width, height, radius, numCubes = 16) {
  const outerPad = 70, size = radius * 2 + outerPad * 2;
  const scale = Math.min(width, height) / size;
  const cx = width / 2, cy = height / 2;
  const r = radius * scale;
  const ringR = (r + 45 * scale);
  const cubeSize = Math.max(12, 48 * scale);
  const cubes = [];
  for (let ix = 0; ix < numCubes; ix++) {
    const a = (ix / numCubes) * Math.PI * 2 - Math.PI / 2;
    const x = cx + ringR * Math.cos(a);
    const y = cy + ringR * Math.sin(a);
    cubes.push({ x: x - cubeSize / 2, y: y - cubeSize / 2, w: cubeSize, h: cubeSize });
  }
  return { cubes, cubeSize };
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
      t.textContent=degreeToChordName(arr[i]||1); labelGroup.appendChild(t);} }

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

function buildDiatonicTriad(degree, tonicMidi = 60) {
  const scaleRootIndex = (degree - 1 + 7) % 7;

  const rootOffset = MAJOR_SCALE[scaleRootIndex];
  let thirdOffset = MAJOR_SCALE[(scaleRootIndex + 2) % 7];
  let fifthOffset = MAJOR_SCALE[(scaleRootIndex + 4) % 7];

  // Adjust for octave wrapping to ensure chords are in root position.
  if (thirdOffset < rootOffset) thirdOffset += 12;
  if (fifthOffset < rootOffset) fifthOffset += 12;

  const octaveShift = 0; // Build chords around the C4-C5 range.
  const root = tonicMidi + rootOffset + octaveShift;
  const third = tonicMidi + thirdOffset + octaveShift;
  const fifth = tonicMidi + fifthOffset + octaveShift;

  // Standard root-position triad voicing.
  return [root, third, fifth];
}

function maybeAddSeventh(triad){
  if (Math.random() < 0.25) {
    // The root is the first note of the triad.
    const rootMidi = triad[0];
    const rootPitchClass = rootMidi % 12;
    const scaleDegreeIndex = MAJOR_SCALE.indexOf(rootPitchClass);
    if (scaleDegreeIndex === -1) return triad; // Should not happen with diatonic triads
    let seventhOffset = MAJOR_SCALE[(scaleDegreeIndex + 6) % 7];
    if (seventhOffset < rootPitchClass) seventhOffset += 12;
    // Build the seventh in the same octave as the third and fifth.
    const seventhMidi = (rootMidi - rootPitchClass) + seventhOffset;
    return [...triad, seventhMidi];
  }
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

function __cwCadenceBar8(current){
  if (current === 5) return 5;
  const r = Math.random();
  const w = __CW_PROB.cadenceWeights;
  if (r < w[5]) return 5;
  if (r < w[5] + w[4]) return 4;
  return 6;
}

function __cwMutate8(seq8){
  const out = seq8.slice();
  for (const slot of __CW_ELIGIBLE_SLOTS){
    if (!__cwChance(__CW_PROB.mutateEligibleSlots * __cwPosBias(slot))) continue;
    out[slot-1] = __cwSub(out[slot-1]);
  }
  return out;
}

function randomProgression8(){
  // 1) pick preset (4) → duplicate to 8
  const base4 = __cwPick(__CW_PRESETS);
  let seq8 = [...base4, ...base4];

  // 2) gentle mutate
  seq8 = __cwMutate8(seq8);

  // 3) optional push to V at bar 8 (legacy behavior)
  if (__cwChance(__CW_PROB.end8ToVOverride)) seq8[7] = 5;

  // 4) cadence shaping at bar 8
  seq8[7] = __cwCadenceBar8(seq8[7]);

  return seq8;
}

function randomProgression16(){
  const loopA = randomProgression8();
  let loopB;
  const r = Math.random();
  const P = __CW_PROB.loopB;

  if (r < P.exact){
    loopB = loopA.slice();
  } else if (r < P.exact + P.lightMutate){
    loopB = __cwMutate8(loopA);
    loopB[7] = __cwCadenceBar8(loopB[7]);
  } else {
    // flip last 4 bars for turnaround
    const b = loopA.slice();
    const last4 = b.slice(4,8).reverse();
    loopB = [...b.slice(0,4), ...last4];
    loopB[7] = __cwCadenceBar8(loopB[7]);
  }

  return [...loopA, ...loopB];
}
