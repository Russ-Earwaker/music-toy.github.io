// src/main.js (explicit CSV path for instruments)
import {
  DEFAULT_BPM, NUM_STEPS, ac,
  setBpm, ensureAudioContext, initAudioAssets,
  triggerInstrument, createScheduler, getInstrumentNames
} from './audio.js';
import { buildGrid, markPlayingColumn as markGridCol } from './grid.js';
import { createBouncer } from './bouncer.js';
import { createLoopIndicator } from './loopindicator.js';
import { initDragBoard } from './board.js';
import { createRippleSynth } from './ripplesynth.js';

// <<< EDIT THIS if your CSV lives elsewhere >>>
const CSV_PATH = './assets/samples/samples.csv';

let grids = [];
let bouncers = [];
let toys = [];

// Master clock schedules all toys and grids
const scheduler = createScheduler(
  (stepIndex, time) => {
    // drive grids
    grids.forEach(g => {
      if (g.muted) return;
      const s = g.steps[stepIndex];
      if (!s || !s.active) return;
      const nn = g.getNoteName ? g.getNoteName(stepIndex) : 'C4';
      triggerInstrument(g.instrument || 'tone', nn, time);
      g.ping && g.ping(stepIndex);
    });

    // visual step marker per grid (with audio-time alignment)
    const delayMs = Math.max(0, (ac ? (time - ac.currentTime) : 0) * 1000);
    setTimeout(() => grids.forEach(g => markGridCol(g, stepIndex)), delayMs);
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
    await initAudioAssets(CSV_PATH).catch(()=>{});
    scheduler.start();
  });

  stopBtn.addEventListener('click', ()=>{
    scheduler.stop();
    grids.forEach(g => markGridCol(g, 0));
    toys.forEach(t => t?.reset?.());
  });
}

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

  // Build four grids; use display names from CSV/fallback for defaults if available
  const names = getInstrumentNames();
  const pick = (hint) => names.find(n => n.toLowerCase().includes(hint)) || names[0] || 'tone';

  grids = [
    buildGrid('#grid1', NUM_STEPS, { defaultInstrument: pick('kick'),   title: 'Kick' }),
    buildGrid('#grid2', NUM_STEPS, { defaultInstrument: pick('snare'),  title: 'Snare' }),
    buildGrid('#grid3', NUM_STEPS, { defaultInstrument: pick('hat'),    title: 'Hat-Closed' }),
    buildGrid('#grid4', NUM_STEPS, { defaultInstrument: pick('clap'),   title: 'Clap' }),
  ].filter(Boolean);

  // Set default notes per grid row
  const defaults = ['C4','C4','C4','C4'];
  grids.forEach((g, i)=>{
    if (!g) return;
    // initialise all steps' noteIndex to the grid's default note
    const N = {'C':0,'C#':1,'D':2,'D#':3,'E':4,'F':5,'F#':6,'G':7,'G#':8,'A':9,'A#':10,'B':11};
    const nn = defaults[i] || 'C4';
    const name= nn.slice(0,-1), oct = parseInt(nn.slice(-1),10);
    const idx = (oct+1)*12 + N[name];
    g.steps.forEach(s => s.noteIndex = idx);
  });

  // Toys: Bouncer, RippleSynth, Bouncer
  const selectors = ['#toy-b1', '#toy-b2', '#toy-b3'];
  bouncers = [];
  toys = selectors.map((sel, i) => {
    const el = document.querySelector(sel);
    if (!el) { console.warn('[boot] missing toy element', sel); return null; }
    try {
      const inst = (i === 1) ? createRippleSynth(el) : createBouncer(el);
      // default instrument: sane first option
      const ni = getInstrumentNames();
      const first = ni[0] || 'tone';
      if (inst?.setInstrument){ inst.setInstrument(first); }
      if (inst?.setInstrument && i !== 1) bouncers.push(inst);
      return inst;
    } catch(e) {
      console.error('[boot] toy init failed for', sel, e);
      return null;
    }
  }).filter(Boolean);

  setupTransport();
  setupBouncerInstrument();

  // Auto-start on first pointer gesture
  let autoStarted = false;
  window.addEventListener('pointerdown', async ()=>{
    if (autoStarted) return; autoStarted = true;
    try{
      const ctx = ensureAudioContext();
      if (ctx.state === 'suspended') await ctx.resume();
      await initAudioAssets(CSV_PATH).catch(()=>{});
      scheduler.start();
    }catch{}
  }, { once:true });

  // Log which CSV was used
  window.addEventListener('samples-ready', (e)=>{
    const src = e?.detail?.src || 'fallback';
    console.log('[audio] samples-ready from:', src, 'ok=', !!e?.detail?.ok, 'names=', e?.detail?.names);
  });

  window.addEventListener('samples-ready', (e)=>{
    const ok = !!e?.detail?.ok;
    const names = e?.detail?.names || [];
    const pick = (hint) => names.find(n => n.toLowerCase().includes(hint)) || names.find(n => /kick|snare|hat|clap|piano|drum/.test(n.toLowerCase())) || names[0] || 'tone';
    if (ok){
      const prefs = [pick('kick'), pick('snare'), pick('hat'), pick('clap')];
      grids.forEach((g, i) => { try { g.setInstrument && g.setInstrument(prefs[i] || names[0] || 'tone'); } catch{} });
    }
  });

}
boot();
