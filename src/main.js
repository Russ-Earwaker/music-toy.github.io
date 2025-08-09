// src/main.js
import { noteList, noteToFreq, freqRatio } from './utils.js';
import {
  DEFAULT_BPM, NUM_STEPS, TOYS, ac, buffers,
  setBpm, ensureAudioContext, loadBuffers,
  triggerInstrument, createScheduler
} from './audio.js';
import { buildGrid, markPlayingColumn } from './grid.js';
import { createBouncer } from './bouncer.js';
import { createLoopIndicator } from './loopindicator.js';
import { initDragBoard } from './board.js';
import { createRippleSynth } from './ripplesynth.js';

let gridState;
let bouncers = [];
let toys = [];

// instrument-aware scheduling per row
const scheduler = createScheduler(
  (stepIndex, time) => {
    Object.values(gridState).forEach(rowState => {
      const { instrument, steps } = rowState;
      const s = steps[stepIndex];
      if (!s || !s.active) return;
      const noteName = noteList[s.noteIndex];
      triggerInstrument(instrument, noteName, time);
    });

    // visual step marker in the same clock
    const delayMs = Math.max(0, (ac ? (time - ac.currentTime) : 0) * 1000);
    setTimeout(() => markPlayingColumn(stepIndex, TOYS), delayMs);
  },
  (loopStartTime) => {
    toys.forEach(t => t?.onLoop?.(loopStartTime));
  }
);

function setupTransport(){
  const playBtn = document.getElementById('play');
  const stopBtn = document.getElementById('stop');
  const bpmInput = document.getElementById('bpm');

  bpmInput.value = DEFAULT_BPM;
  bpmInput.addEventListener('change', ()=>{
    const v = Math.max(40, Math.min(240, Number(bpmInput.value) || DEFAULT_BPM));
    setBpm(v);
  });

  playBtn.addEventListener('click', async ()=>{
    const ctx = ensureAudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
    if (!Object.keys(buffers).length) await loadBuffers();
    scheduler.start();
    // Ball re-launch will be handled by bouncer.onLoop at next boundary
  });

stopBtn.addEventListener('click', ()=>{
  scheduler.stop();
  markPlayingColumn(0, TOYS);
  toys.forEach(t => t?.reset?.());
});
};



function setupBouncerInstrument(){
  const sel = document.getElementById('bouncer-instrument');
  if (!sel) return;
  sel.addEventListener('change', () => {
    bouncers.forEach(b => b?.setInstrument?.(sel.value));
  });
}

async function boot(){
  try { createLoopIndicator(document.body); } catch(e) { console.warn('[loopindicator] init failed', e); }

    initDragBoard();
  // Build grid (returns state: { rowName: {instrument, steps[]} })
  gridState = buildGrid(TOYS, NUM_STEPS);

  // Toys: Bouncer, RippleSynth, Bouncer
  const selectors = ['#toy-b1', '#toy-b2', '#toy-b3'];
  bouncers = [];
  toys = selectors.map((sel, i) => {
    const el = document.querySelector(sel);
    if (!el) { console.warn('[boot] missing toy element', sel); return null; }
    try {
      const inst = (i === 1) ? createRippleSynth(el) : createBouncer(el);
      if (inst && inst.setInstrument) bouncers.push(inst);
      return inst;
    } catch(e) {
      console.error('[boot] toy init failed for', sel, e);
      return null;
    }
  }).filter(Boolean);

  // Transport
  setupTransport();
  setupBouncerInstrument();

  // ✅ Auto-start
  const ctx = ensureAudioContext();
  if (ctx.state === 'suspended') await ctx.resume();
  if (!Object.keys(buffers).length) await loadBuffers();
  scheduler.start();
}
boot();
