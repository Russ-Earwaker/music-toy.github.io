// src/art/art-line-thickness-control.js
// Reusable line-thickness slider UI for art toys.

export function createArtLineThicknessControl({
  label = 'Line Thickness',
  min = 1,
  max = 20,
  step = 0.1,
  value = 6,
  onInput = null,
  onCommit = null,
} = {}) {
  const root = document.createElement('div');
  root.className = 'art-line-thickness-control';

  const row = document.createElement('div');
  row.className = 'art-line-thickness-row';
  root.appendChild(row);

  const labelEl = document.createElement('span');
  labelEl.className = 'art-line-thickness-label';
  labelEl.textContent = String(label || 'Line Thickness');
  row.appendChild(labelEl);

  const valueEl = document.createElement('span');
  valueEl.className = 'art-line-thickness-value';
  row.appendChild(valueEl);

  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'art-line-thickness-slider';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  root.appendChild(input);

  const updateValueReadout = () => {
    const n = Number(input.value);
    valueEl.textContent = Number.isFinite(n) ? n.toFixed(1) : String(input.value);
  };

  input.addEventListener('input', () => {
    updateValueReadout();
    try { onInput?.(Number(input.value)); } catch {}
  });
  input.addEventListener('change', () => {
    try { onCommit?.(Number(input.value)); } catch {}
  });

  updateValueReadout();

  return {
    root,
    input,
    setValue(next) {
      if (!Number.isFinite(Number(next))) return;
      input.value = String(next);
      updateValueReadout();
    },
    getValue() {
      const n = Number(input.value);
      return Number.isFinite(n) ? n : Number(value) || 1;
    },
    setDisabled(disabled) {
      input.disabled = !!disabled;
    },
  };
}

