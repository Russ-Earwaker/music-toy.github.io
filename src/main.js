// src/main.js (grid now routes audio through per-grid channels)
import {
  DEFAULT_BPM, NUM_STEPS, ac,
  setBpm, ensureAudioContext, initAudioAssets,
  triggerInstrument, createScheduler, getInstrumentNames
} from './audio.js';
import { buildGrid, markPlayingColumn as markGridCol } from './grid.js';
import { createLoopIndicator } from './loopindicator.js';
import { initDragBoard } from './board.js';

const CSV_PATH = './assets/samples/samples.csv';

let grids = [];
let toys = [];

const scheduler = createScheduler(
  (stepIndex, time) => {
    grids.forEach(g => {
      const s = g.steps[stepIndex];
      if (!s || !s.active) return;
      const nn = g.getNoteName ? g.getNoteName(stepIndex) : 'C4';
      triggerInstrument(g.instrument || 'tone', nn, time, g.channel);
      g.ping && g.ping(stepIndex);
    });

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

async function boot(){
  try { createLoopIndicator(document.body); } catch(e) { console.warn('[loopindicator] init failed', e); }
  initDragBoard();

  const names = getInstrumentNames();
  const pick = (hint) => names.find(n => n.toLowerCase().includes(hint)) || names[0] || 'tone';

  grids = [
    buildGrid('#grid1', NUM_STEPS, { defaultInstrument: pick('kick'),   title: 'Kick' }),
  ].filter(Boolean);

  const defaults = ['C4'];
  grids.forEach((g, i)=>{
    if (!g) return;
    const N = {'C':0,'C#':1,'D':2,'D#':3,'E':4,'F':5,'F#':6,'G':7,'G#':8,'A':9,'A#':10,'B':11};
    const nn = defaults[i] || 'C4';
    const name= nn.slice(0,-1), oct = parseInt(nn.slice(-1),10);
    const idx = (oct+1)*12 + N[name];
    g.steps.forEach(s => s.noteIndex = idx);
  });

  setupTransport();

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

  window.addEventListener('samples-ready', (e)=>{
    const ok = !!e?.detail?.ok;
    const names = e?.detail?.names || [];
    const pick = (hint) => names.find(n => n.toLowerCase().includes(hint)) || names.find(n => /kick|snare|hat|clap|piano|drum/.test(n.toLowerCase())) || names[0] || 'tone';
    if (ok){
      const prefs = [pick('kick')];
      grids.forEach((g, i) => { try { g.setInstrument && g.setInstrument(prefs[i] || names[0] || 'tone'); } catch{} });
    }
  });
}
boot();
