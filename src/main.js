// src/main.js (final: no version suffixes; instruments populate on boot; single boot; robust samples-ready)
import { DEFAULT_BPM, NUM_STEPS, ac, setBpm, ensureAudioContext, createScheduler, getLoopInfo } from './audio-core.js';
import { initAudioAssets, triggerInstrument, getInstrumentNames } from './audio-samples.js';

import { buildGrid, markPlayingColumn as markGridCol } from './grid.js';
import { createBouncer } from './bouncer.js';
import { createRippleSynth } from './ripplesynth.js';
import { assertRipplerContracts, runRipplerSmoke } from './ripplesynth-safety.js';
import { createLoopIndicator } from './loopindicator.js';
import { initDragBoard, organizeBoard } from './board.js';



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
      sel.value = (names && names.includes(current)) ? current : (names?.[0] || 'tone');
      sel.dispatchEvent(new Event('change', { bubbles:true }));
    });
  }

  // Repopulate selects + set sensible grid defaults when samples are ready
  window.addEventListener('samples-ready', (e)=>{
    const ok = !!e?.detail?.ok;
    const names = e?.detail?.names || [];
    console.log('[samples-ready]', e?.detail);
    rebuildInstrumentSelects(names);
    const pick = (hint) => names.find(n => n.toLowerCase().includes(hint)) || names[0] || 'tone';
    if (ok && grids.length) {
      const prefs = [pick('kick'), pick('snare'), pick('hat'), pick('clap')];
      grids.forEach((g, i) => { try { g.setInstrument && g.setInstrument(prefs[i] || names[0] || 'tone'); } catch{} });
    }
  });

  // --- Master scheduler ---
  const scheduler = createScheduler(
    (stepIndex, time) => {
      grids.forEach(g => {
        const s = g.steps[stepIndex];
        if (!s || !s.active) return;
        const nn = g.getNoteName ? g.getNoteName(stepIndex) : 'C4';
        triggerInstrument(g.instrument || 'tone', nn, time);
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

    // Create "Organise" button in the header/toolbar
    try {
      // Prefer the same container as BPM control if present
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
        // Ensure visible if appended to body fallback
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
      // No-op if assets already loaded
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

    // Kick off asset load NOW so instrument names populate before first tap
    try { await initAudioAssets(CSV_PATH); } catch{}

    // Build 4 grids
    const names0 = getInstrumentNames();
    const pick0 = (hint) => names0.find(n => n.toLowerCase().includes(hint)) || names0[0] || 'tone';
    const gridIds = ['#grid1', '#grid2', '#grid3', '#grid4'];
    grids = gridIds.map((sel, i) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const titles = ['Kick','Snare','Hat-Closed','Clap'];
      const inst = [pick0('kick'), pick0('snare'), pick0('hat'), pick0('clap')][i] || names0[0] || 'tone';
      return buildGrid(sel, NUM_STEPS, { defaultInstrument: inst, title: titles[i] });
    }).filter(Boolean);

    // Other toys
    toys = [];
    document.querySelectorAll('.toy-panel').forEach((panel) => {
      if (panel.dataset.toyInit === '1') return;
      const kind = (panel.getAttribute('data-toy') || '').toLowerCase();
      let inst = null;
      try{
        if (kind === 'rippler' || kind === 'ripple') {
          inst = createRippleSynth(panel);
        } else if (kind === 'bouncer') {
          inst = createBouncer(panel);
        } else {
          return;
        }
        const ni = getInstrumentNames();
        inst?.setInstrument?.( (ni.find(n=>n.toLowerCase().includes('kalimba')) || ni[0] || 'tone') );
        toys.push(inst);
        panel.dataset.toyInit = '1';
      }catch(e){
        console.error('[boot] toy init failed for', kind, e);
      }
    });
    console.log('[boot] toys:', toys.length);
    try { assertRipplerContracts(); runRipplerSmoke(); } catch {}

    setupTransport();

    // Auto-unlock on first gesture anywhere
    let armed = true;
    const onFirstPointer = async () => {
      if (!armed) return; armed = false;
      await unlockAudioAndStart();
      window.removeEventListener('pointerdown', onFirstPointer, true);
    };
    window.addEventListener('pointerdown', onFirstPointer, true);
  }

  boot();
}