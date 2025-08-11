// src/main.js (toy17: all imports cache-busted; single-boot guard; audio unlock after first tap)
if (window.__booted) {
  console.warn('[boot] skipped duplicate boot');
} else {
  window.__booted = true;

  import('./audio.js?toy17').then((audio) => {
    const {
      DEFAULT_BPM, NUM_STEPS, ac,
      setBpm, ensureAudioContext, initAudioAssets,
      triggerInstrument, createScheduler, getInstrumentNames
    } = audio;

    Promise.all([
      import('./grid.js?toy17'),
      import('./bouncer.js?toy17'),
      import('./loopindicator.js?toy17'),
      import('./board.js?toy17'),
      import('./ripplesynth.js?toy17'),
    ]).then(([gridMod, bouncerMod, loopMod, boardMod, rippleMod]) => {
      const { buildGrid, markPlayingColumn: markGridCol } = gridMod;
      const { createBouncer } = bouncerMod;
      const { createLoopIndicator } = loopMod;
      const { initDragBoard } = boardMod;
      const { createRippleSynth } = rippleMod;

      const CSV_PATH = './assets/samples/samples.csv';

      let grids = [];
      let toys  = [];

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

        if (playBtn){
          playBtn.addEventListener('click', async ()=>{
            await unlockAudioAndStart();
          });
        }

        if (stopBtn){
          stopBtn.addEventListener('click', ()=>{
            scheduler.stop();
            grids.forEach(g => markGridCol(g, 0));
            toys.forEach(t => t?.reset?.());
          });
        }
      }

      // --- Audio Unlock Gating ---
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

        const names = getInstrumentNames();
        const pick = (hint) => names.find(n => n.toLowerCase().includes(hint)) || names[0] || 'tone';

        const gridIds = ['#grid1', '#grid2', '#grid3', '#grid4'];
        grids = gridIds.map((sel, i) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const titles = ['Kick','Snare','Hat-Closed','Clap'];
          const inst = [pick('kick'), pick('snare'), pick('hat'), pick('clap')][i] || names[0] || 'tone';
          return buildGrid(sel, NUM_STEPS, { defaultInstrument: inst, title: titles[i] });
        }).filter(Boolean);

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
            inst?.setInstrument?.(ni[0] || 'tone');
            toys.push(inst);
            panel.dataset.toyInit = '1';
          }catch(e){
            console.error('[boot] toy init failed for', kind, e);
          }
        });
        console.log('[boot] toys:', toys.length);

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
    });
  });
}
