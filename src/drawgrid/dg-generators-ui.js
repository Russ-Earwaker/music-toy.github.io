import { installInstrumentSelection } from '../instrument-selection.js';
export function installGeneratorButtons(panel, apiHooks = {}, opts = {}) {
  const {
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

  // Old generator IDs remain in authored strokes for save/render compatibility.
  // Line arming controls are retired from the player UI.
  const updateGeneratorButtons = () => {};

  // Pentatonic note snapping (legacy state key: autotune).
  let autoTuneBtn = right.querySelector('.drawgrid-autotune');
  if (!autoTuneBtn) {
    autoTuneBtn = document.createElement('button');
    autoTuneBtn.type = 'button';
    autoTuneBtn.className = 'toy-btn drawgrid-autotune';
    autoTuneBtn.textContent = `Snap to Notes: ${getAutoTune?.() ? 'On' : 'Off'}`;
    autoTuneBtn.title = 'Snap pitches to the nearest pentatonic note.';
    autoTuneBtn.setAttribute('aria-label', 'Snap to Notes');
    autoTuneBtn.setAttribute('aria-pressed', String(!!getAutoTune?.()));
    right.appendChild(autoTuneBtn);

    autoTuneBtn.addEventListener('click', () => {
      const nextAutoTune = !getAutoTune?.();
      setAutoTune?.(nextAutoTune);
      autoTuneBtn.textContent = `Snap to Notes: ${nextAutoTune ? 'On' : 'Off'}`;
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
    stepsSel.setAttribute('aria-label', 'Pattern length');
    stepsSel.innerHTML = `<option value="8">8 steps</option><option value="16">16 steps</option><option value="32">32 steps / 4 bars</option>`;
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

  installInstrumentSelection(panel, right);

  try { panel.__dgUpdateButtons = updateGeneratorButtons; } catch {}
  return { updateGeneratorButtons };
}

