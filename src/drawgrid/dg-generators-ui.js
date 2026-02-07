export function installGeneratorButtons(panel, apiHooks = {}, opts = {}) {
  const {
    getNextDrawTarget,
    setNextDrawTarget,
    getStrokes,
    getAutoTune,
    setAutoTune,
    resnapAndRedraw,
    getCols,
    setCols,
    setCurrentCols,
    setFlashes,
    setPendingActiveMask,
    setManualOverrides,
    setPersistentDisabled,
    getCurrentMapActive,
  } = apiHooks;

  const header = panel.querySelector('.toy-header');
  if (!header) return { updateGeneratorButtons: () => {} };

  const right = header.querySelector('.toy-controls-right') || header;
  const mountRoot = opts?.mountRoot || right;

  // --- Generator Line Buttons (Advanced Mode Only) ---
  const generatorButtonsWrap = document.createElement('div');
  generatorButtonsWrap.className = 'drawgrid-generator-buttons';
  // IMPORTANT:
  // These are header controls; never append to `panel` (it causes them to drift into
  // the body/footer depending on layout/reparenting during refresh).
  generatorButtonsWrap.style.pointerEvents = 'auto';
  mountRoot.appendChild(generatorButtonsWrap);

  const btnLine1 = document.createElement('button');
  btnLine1.type = 'button';
  btnLine1.className = 'c-btn';
  btnLine1.dataset.line = '1';
  btnLine1.title = 'Draw Line 1';
  btnLine1.style.setProperty('--c-btn-size', '96px');
  btnLine1.innerHTML = `<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core"></div>`;
  generatorButtonsWrap.appendChild(btnLine1);

  const btnLine2 = document.createElement('button');
  btnLine2.type = 'button';
  btnLine2.className = 'c-btn';
  btnLine2.dataset.line = '2';
  btnLine2.title = 'Draw Line 2';
  btnLine2.style.setProperty('--c-btn-size', '96px');
  btnLine2.innerHTML = `<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core"></div>`;
  generatorButtonsWrap.appendChild(btnLine2);

  function updateGeneratorButtons() {
    if (!btnLine1 || !btnLine2) return;
    const strokes = getStrokes?.() || [];
    const hasLine1 = strokes.some(s => s.generatorId === 1);
    const hasLine2 = strokes.some(s => s.generatorId === 2);

    const core1 = btnLine1.querySelector('.c-btn-core');
    if (core1) core1.style.setProperty('--c-btn-icon-url', `url('./assets/UI/${hasLine1 ? 'T_ButtonLine1R.png' : 'T_ButtonLine1.png'}')`);
    btnLine1.title = hasLine1 ? 'Redraw Line 1' : 'Draw Line 1';

    const core2 = btnLine2.querySelector('.c-btn-core');
    if (core2) core2.style.setProperty('--c-btn-icon-url', `url('./assets/UI/${hasLine2 ? 'T_ButtonLine2R.png' : 'T_ButtonLine2.png'}')`);
    btnLine2.title = hasLine2 ? 'Redraw Line 2' : 'Draw Line 2';

    const nextDrawTarget = getNextDrawTarget?.();
    const a1 = nextDrawTarget === 1;
    const a2 = nextDrawTarget === 2;
    btnLine1.classList.toggle('active', a1);
    btnLine2.classList.toggle('active', a2);
    btnLine1.setAttribute('aria-pressed', String(a1));
    btnLine2.setAttribute('aria-pressed', String(a2));
  }

  function handleGeneratorButtonClick(e) {
    const lineNum = parseInt(e.target.dataset.line, 10);
    // Toggle arming for this line; do not modify existing strokes here
    const nextDrawTarget = getNextDrawTarget?.();
    if (nextDrawTarget === lineNum) {
      setNextDrawTarget?.(null); // disarm
    } else {
      setNextDrawTarget?.(lineNum); // arm
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
      const nextAutoTune = !getAutoTune?.();
      setAutoTune?.(nextAutoTune);
      autoTuneBtn.textContent = `Auto-tune: ${nextAutoTune ? 'On' : 'Off'}`;
      autoTuneBtn.setAttribute('aria-pressed', String(nextAutoTune));
      // Invalidate the node cache on all strokes since the tuning has changed.
      const strokes = getStrokes?.() || [];
      for (const s of strokes) { s.cachedNodes = null; }
      resnapAndRedraw?.(false);
    });
  }

  // Steps dropdown
  let stepsSel = right.querySelector('.drawgrid-steps');
  if (!stepsSel) {
    stepsSel = document.createElement('select');
    stepsSel.className = 'drawgrid-steps';
    stepsSel.innerHTML = `<option value="8">8 steps</option><option value="16">16 steps</option>`;
    stepsSel.value = String(getCols?.());
    right.appendChild(stepsSel);

    stepsSel.addEventListener('change', () => {
      const prevCols = getCols?.();
      const prevActive = getCurrentMapActive?.();

      const nextCols = parseInt(stepsSel.value, 10);
      setCols?.(nextCols);
      setCurrentCols?.(nextCols);
      panel.dataset.steps = String(nextCols);
      setFlashes?.(new Float32Array(nextCols));

      if (prevActive) {
        setPendingActiveMask?.({ prevCols, prevActive: [...prevActive] });
      }

      // Reset manual overrides and invalidate stroke cache
      setManualOverrides?.(Array.from({ length: nextCols }, () => new Set()));
      const strokes = getStrokes?.() || [];
      for (const s of strokes) { s.cachedNodes = null; }
      setPersistentDisabled?.(Array.from({ length: nextCols }, () => new Set()));

      resnapAndRedraw?.(true);
    });
  }

  // Instrument button (for tutorial unlock and general use)
  if (!right.querySelector('[data-action="instrument"]')) {
    const instBtn = document.createElement('button');
    instBtn.className = 'c-btn toy-inst-btn';
    instBtn.title = 'Choose Instrument';
    instBtn.dataset.action = 'instrument';
    instBtn.innerHTML = `<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core" style="--c-btn-icon-url: url('./assets/UI/T_ButtonInstruments.png');"></div>`;
    instBtn.style.setProperty('--c-btn-size', '65px');
    right.appendChild(instBtn);

    let sel = panel.querySelector('select.toy-instrument');
    if (!sel) {
      sel = document.createElement('select');
      sel.className = 'toy-instrument';
      sel.style.display = 'none';
      right.appendChild(sel);
    }

    const DBG = localStorage.getItem('mt_dbg_header') === '1';
    instBtn.addEventListener('pointerdown', (e) => {
      if (!DBG) return;
      try {
        console.info('[DG][instBtn][DBG] pointerdown', {
          panelId: panel.id || null,
          toyId: panel.dataset?.toyid || panel.dataset?.toy || null,
          defaultPrevented: !!e.defaultPrevented,
          cancelBubble: !!e.cancelBubble,
          pointerType: e.pointerType,
        });
      } catch {}
    }, true);

    instBtn.addEventListener('click', async (e) => {
      if (DBG) {
        try {
          console.info('[DG][instBtn][DBG] click', {
            panelId: panel.id || null,
            toyId: panel.dataset?.toyid || panel.dataset?.toy || null,
            defaultPrevented_before: !!e.defaultPrevented,
            cancelBubble_before: !!e.cancelBubble,
          });
        } catch {}
      }
      try {
        const { openInstrumentPicker } = await import('./instrument-picker.js');
        const { getDisplayNameForId } = await import('./instrument-catalog.js');
        const chosen = await openInstrumentPicker({ panel, toyId: (panel.dataset.toyid || panel.dataset.toy || panel.id || 'master') });
        if (!chosen) {
          try { const h = panel.querySelector('.toy-header'); if (h) { h.classList.remove('pulse-accept'); h.classList.add('pulse-cancel'); setTimeout(() => h.classList.remove('pulse-cancel'), 650); } } catch { }
          return;
        }
        const val = String((typeof chosen === 'string' ? chosen : chosen?.value) || '');
        const chosenNote = (typeof chosen === 'object' && chosen) ? chosen.note : null;
        const chosenOctave = (typeof chosen === 'object' && chosen) ? chosen.octave : null;
        const chosenPitchShift = (typeof chosen === 'object' && chosen) ? chosen.pitchShift : null;
        let has = Array.from(sel.options).some(o => o.value === val);
        if (!has) {
          const o = document.createElement('option');
          o.value = val;
          o.textContent = getDisplayNameForId(val) || val.replace(/[_-]/g, ' ').replace(/\w\S*/g, t => t[0].toUpperCase() + t.slice(1).toLowerCase());
          sel.appendChild(o);
        }
        sel.value = val;
        panel.dataset.instrument = val;
        panel.dataset.instrumentPersisted = '1';
        if (chosenOctave !== null && chosenOctave !== undefined) {
          panel.dataset.instrumentOctave = String(chosenOctave);
        }
        if (chosenPitchShift !== null && chosenPitchShift !== undefined) {
          panel.dataset.instrumentPitchShift = chosenPitchShift ? '1' : '0';
        }
        if (chosenNote) {
          panel.dataset.instrumentNote = String(chosenNote);
        } else {
          delete panel.dataset.instrumentNote;
        }
        panel.dispatchEvent(new CustomEvent('toy-instrument', { detail: { value: val, note: chosenNote, octave: chosenOctave, pitchShift: chosenPitchShift }, bubbles: true }));
        panel.dispatchEvent(new CustomEvent('toy:instrument', { detail: { name: val, value: val, note: chosenNote, octave: chosenOctave, pitchShift: chosenPitchShift }, bubbles: true }));
        try { const h = panel.querySelector('.toy-header'); if (h) { h.classList.remove('pulse-cancel'); h.classList.add('pulse-accept'); setTimeout(() => h.classList.remove('pulse-accept'), 650); } } catch { }
      } catch (e) {
      }
    });
  }

  try { panel.__dgUpdateButtons = updateGeneratorButtons; } catch {}
  return { updateGeneratorButtons };
}

