// src/main.js
// Themed boot: assigns instruments per active theme without destructive changes.
// Keeps file < 300 lines. Splits and helpers should go in separate modules if needed.

import { DEFAULT_BPM, NUM_STEPS, ac, setBpm, ensureAudioContext, createScheduler, getLoopInfo, setToyVolume, setToyMuted } from './audio-core.js';
import { initAudioAssets, triggerInstrument, getInstrumentNames, reloadSamples } from './audio-samples.js';
import './auto-mix.js';
import { buildGrid, markPlayingColumn as markGridCol } from './grid.js';
import { createBouncer } from './bouncer.js';
import { createRippleSynth } from './ripplesynth.js';
import { createAmbientGlide } from './ambient-glide.js';
import { buildWheel } from './wheel.js';
import { assertRipplerContracts, runRipplerSmoke } from './ripplesynth-safety.js';
import { createLoopIndicator } from './loopindicator.js';
import { initDragBoard, organizeBoard } from './board.js';
import './debug-automix.js';
import './mute-bridge.js';
import './roles-assign.js';

// --- Theme integration (non-destructive) ---
import {
  resolveGridSamples,
  resolveWheelSamples,
  resolveBouncerSamples,
  resolveRipplerSamples,
} from './theme-manager.js';

// --- Instrument name normalization & matching ---
function normId(s){
  if (s == null) return s;
  return String(s).toLowerCase().trim()
    .replace(/[\s\-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}
function makeNameResolver(list){
  const map = new Map();
  (list||[]).forEach(n => map.set(normId(n), n));
  return function resolveName(desired){
    const key = normId(desired);
    return map.get(key) || null;
  };
}


if (!window.__booted__) {
  window.__booted__ = true;

  const CSV_PATH = './assets/samples/samples.csv';
  let grids = [];
  let toys  = [];

  // --- Helpers ---
  function rebuildInstrumentSelects(names){
    const sels = document.querySelectorAll('select.inst-select, select[data-role="inst"], .toy-header select');
    sels.forEach(sel => {
      const current = sel.value;
      sel.innerHTML = '';
      (names && names.length ? names : ['tone']).forEach(n => {
        const opt = document.createElement('option');
        opt.value = n; opt.textContent = n;
        sel.appendChild(opt);
      });
      const prev = sel.value;
      sel.value = (names && names.includes(current)) ? current : (names?.[0] || 'tone');
      if (sel.value !== prev) sel.dispatchEvent(new Event('change', { bubbles:true }));

    });
  }

  // Repopulate selects + set grid defaults from THEME when samples are ready
  window.addEventListener('samples-ready', (e)=>{
    const ok = !!e?.detail?.ok;
    const names = e?.detail?.names || [];
    const resolveName = makeNameResolver(names);
    console.log('[samples-ready]', e?.detail);
    rebuildInstrumentSelects(names);
    const isReload = (e && e.detail && e.detail.source === 'reload');
    if (!isReload && ok && grids.length) {
      const themed = resolveGridSamples();
      grids.forEach((g, i) => { try {
        const wanted = themed[i];
        const inst = resolveName(wanted) || names.find(n=>/djembe|hand.?clap|clap/.test(n)) || names[0] || 'tone';
        g.setInstrument && g.setInstrument(inst);
      } catch{} });
    }
  });

  // --- Master scheduler ---
  const scheduler = createScheduler(
    (stepIndex, time) => {
      grids.forEach(g => {
        const s = g.steps[stepIndex];
        if (!s || !s.active) return;
        const nn = g.getNoteName ? g.getNoteName(stepIndex) : 'C4';
        triggerInstrument(g.instrument || 'tone', nn, time, (g.toyId || 'grid'));
        g.ping && g.ping(stepIndex);
      });
      const delayMs = Math.max(0, (ac ? (time - ac.currentTime) : 0) * 1000);
      setTimeout(() => grids.forEach(g => markGridCol(g, stepIndex)), delayMs);
    },
    (loopStartTime) => {
      toys.forEach(t => t?.onLoop?.(loopStartTime));
    }
  );

  // --- Transport (top bar) ---
  function setupTransport(){
    const playBtn = document.getElementById('play');
    const stopBtn = document.getElementById('stop');
    const bpmInput = document.getElementById('bpm');

    if (bpmInput){
      bpmInput.value = DEFAULT_BPM;
      bpmInput.addEventListener('change', ()=>{
        const v = Math.max(40, Math.min(240, Number(bpmInput.value) || DEFAULT_BPM));
        setBpm(v);
      });
    }

    // Hide/remove play/stop (auto-play system)
    if (playBtn) { playBtn.style.display = 'none'; playBtn.disabled = true; }
    if (stopBtn) { stopBtn.style.display = 'none'; stopBtn.disabled = true; }

    // "Organise" button
    try {
      const host = (bpmInput && bpmInput.parentElement) || document.getElementById('toolbar') || document.querySelector('header') || document.body;
      let orgBtn = document.getElementById('organise-toys-btn');
      if (!orgBtn){
        orgBtn = document.createElement('button');
        orgBtn.id = 'organise-toys-btn';
        orgBtn.type = 'button';
        orgBtn.textContent = 'Organise';
        orgBtn.title = 'Arrange all toys neatly on screen';
        orgBtn.style.marginLeft = '8px';
        orgBtn.style.padding = '6px 10px';
        orgBtn.style.border = '1px solid #252b36';
        orgBtn.style.borderRadius = '10px';
        orgBtn.style.background = '#0d1117';
        orgBtn.style.color = '#e6e8ef';
        orgBtn.style.cursor = 'pointer';
        if (host === document.body){
          orgBtn.style.position = 'fixed';
          orgBtn.style.top = '10px';
          orgBtn.style.right = '10px';
          orgBtn.style.zIndex = '10001';
        }
        host.appendChild(orgBtn);
        orgBtn.addEventListener('click', ()=> {
          try { organizeBoard(); } catch {}
          try { window.dispatchEvent(new Event('organise-toys')); } catch {}
        });
      }
    } catch (e) {
      console.warn('organise button add failed', e);
    }
  }

  // --- Audio Unlock & Asset Load ---
  async function unlockAudioAndStart(){
    try {
      const ctx = ensureAudioContext();
      if (ctx.state === 'suspended') await ctx.resume();
      await initAudioAssets(CSV_PATH).catch(()=>{});
      window.__audioUnlocked = true;
      window.dispatchEvent(new CustomEvent('audio-unlocked'));
      scheduler.start();
    } catch (e) {
      console.warn('[audio] unlock/start failed', e);
    }
  }

  // --- Boot ---
  async function boot(){
    try { createLoopIndicator(document.body); } catch(e) { console.warn('[loopindicator] init failed', e); }
    initDragBoard();

    // Preload assets so names exist
    try { await initAudioAssets(CSV_PATH); } catch{}

    // Build 4 grids with THEME instruments
    const themedGrids = resolveGridSamples();
    const names0 = getInstrumentNames();
    const resolveName = makeNameResolver(names0);
    const gridIds = ['#grid1', '#grid2', '#grid3', '#grid4'];
    const titles = ['Simple Beat','Simple Beat','Simple Beat','Simple Beat'];
    grids = gridIds.map((sel, i) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const wanted = themedGrids[i];
      const inst = resolveName(wanted) || names0.find(n=>/djembe|hand.?clap|clap/.test(n)) || names0[0] || 'tone';
      return buildGrid(sel, NUM_STEPS, { defaultInstrument: inst, title: titles[i] });
    }).filter(Boolean);
    try{ console.log('[boot] grids:', grids.length); }catch{}

    // Ensure at least one Wheel panel exists
    try {
      const panels = Array.from(document.querySelectorAll('.toy-panel'));
      const hasWheel = panels.some(p => (p.getAttribute('data-toy')||'').toLowerCase()==='wheel');
      if (!hasWheel) {
        const extras = panels.filter(p => (p.getAttribute('data-toy')||'').toLowerCase()==='bouncer');
        const carrier = extras.length ? extras[extras.length-1] : null;
        if (carrier) {
          carrier.setAttribute('data-toy', 'wheel');
        } else {
          const board = document.getElementById('board');
          if (board) {
            const sec = document.createElement('section');
            sec.className = 'toy-panel';
            sec.setAttribute('data-toy', 'wheel');
            board.appendChild(sec);
          }
        }
      }
    } catch{}

    // Build other toys & assign THEME instruments
    toys = [];
    document.querySelectorAll('.toy-panel').forEach((panel) => {
      if (panel.dataset.toyInit === '1') return;
      const kind = (panel.getAttribute('data-toy') || '').toLowerCase();
      let inst = null;

      try{
        if (kind === 'rippler' || kind === 'ripple') {
          inst = createRippleSynth(panel);
          const want = resolveRipplerSamples()[0];
          if (inst?.setInstrument){ const sel = panel.querySelector('.toy-instrument, select'); const fromPanel = panel.dataset && panel.dataset.instrument; const r = fromPanel || (sel && sel.value) || (resolveName ? resolveName(want) : want) || want; inst.setInstrument(r); }
        } else if (kind === 'bouncer') {
          inst = createBouncer(panel);
          const want = resolveBouncerSamples()[0];
          if (inst?.setInstrument){ const sel = panel.querySelector('.toy-instrument, select'); const fromPanel = panel.dataset && panel.dataset.instrument; const r = fromPanel || (sel && sel.value) || (resolveName ? resolveName(want) : want) || want; inst.setInstrument(r); }
        } else if (kind === 'ambient' || kind === 'ambient-glide') {
          inst = createAmbientGlide(panel);
        } else if (kind === 'wheel') {
          console.log('[wheel] build start', panel);
          const sel = panel.querySelector('.toy-instrument, select');
          const fromPanel = panel.dataset && panel.dataset.instrument;
          let wheelInstrument = fromPanel || (sel && sel.value) || (resolveName ? resolveName(resolveWheelSamples()[0]) : null) || resolveWheelSamples()[0] || 'acoustic_guitar';
          buildWheel(panel, {
            onNote: (midi, name, vel)=>{
              try {
                const acx = ensureAudioContext();
                triggerInstrument(wheelInstrument, name, acx.currentTime + 0.0005, 'wheel');
              } catch(e){}
            },
            getBpm: ()=> ((getLoopInfo && getLoopInfo().bpm) || DEFAULT_BPM)
          });
          inst = { setInstrument: (n)=> { wheelInstrument = n; } };
          try {
            panel.addEventListener('toy-instrument', (e)=>{
              wheelInstrument = (e?.detail?.value) || wheelInstrument;
            });
          } catch {}
        } else if (kind === 'loopgrid' || kind === 'grid') {
          // already built above
        } else {
          return;
        }

        // Set a sensible default if not set above
        if (inst && !inst.__themedDefaultApplied) {
          const ni = getInstrumentNames();
          let _def = ni[0] || 'tone';
          inst?.setInstrument?.(_def);
          inst.__themedDefaultApplied = true;
        }

        toys.push(inst);
        panel.dataset.toyInit = '1';
      }catch(e){
        console.error('[boot] toy init failed for', kind, e);
      }
    });

    console.log('[boot] toys:', toys.length);
    try { assertRipplerContracts(); runRipplerSmoke(); } catch {}

    setupTransport();

    // Per-toy volume + mute
    window.addEventListener('toy-volume', (e)=>{ try { setToyVolume(e?.detail?.toyId, e?.detail?.value); } catch{} });
    window.addEventListener('toy-mute',   (e)=>{ try { setToyMuted(e?.detail?.toyId, e?.detail?.muted); } catch{} });

    // Auto-unlock on first gesture anywhere
    let armed = true;
    const onFirstPointer = async () => {
      if (!armed) return; armed = false;
      await unlockAudioAndStart();
      window.removeEventListener('pointerdown', onFirstPointer, true);
    };
    window.addEventListener('pointerdown', onFirstPointer, true);
  }

  // Dev: reload samples
  window.addEventListener('keydown', (e)=>{
    if (e.key.toLowerCase() === 'r' && e.ctrlKey && e.shiftKey){
      try { reloadSamples(CSV_PATH); } catch {}
      e.preventDefault();
    }
  });
  window.addEventListener('dev-reload-samples', ()=>{ try { reloadSamples(CSV_PATH); } catch {} });
  try { window.reloadSamples = ()=> reloadSamples(CSV_PATH); } catch {}
  boot();
}
