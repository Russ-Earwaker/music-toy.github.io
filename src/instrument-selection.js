import { supportsToyInstrument, applyToyInstrument } from './instrument-state.js';
import { getDisplayNameForId } from './instrument-catalog.js';
import { openInstrumentPicker } from './instrument-picker.js';
import { instrumentColour } from './instrument-colours.js';

export async function chooseToyInstrument(panel, picker = openInstrumentPicker) {
  if (!supportsToyInstrument(panel?.dataset?.toy) || panel.__instrumentChoosing) return;
  panel.__instrumentChoosing = true;
  try {
    const chosen = await picker({ panel, toyId: panel.__audioToyId || panel.dataset.audiotoyid || panel.dataset.toyid || panel.id });
    if (chosen && panel.isConnected) applyToyInstrument(panel, chosen);
  } finally { panel.__instrumentChoosing = false; }
}

export function installInstrumentSelection(panel, host, { picker = openInstrumentPicker } = {}) {
  if (!supportsToyInstrument(panel?.dataset?.toy) || !host) return null;
  let button = panel.querySelector('.toy-inst-btn');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button'; button.className = 'c-btn toy-inst-btn';
    button.dataset.action = 'instrument'; button.dataset.skipHeaderDelegate = '1';
    button.dataset.helpLabel = 'Choose instrument'; button.dataset.helpPosition = 'bottom';
    button.style.setProperty('--c-btn-size', '65px');
    button.innerHTML = '<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core" style="--c-btn-icon-url: url(\'./assets/UI/T_ButtonInstruments.png\');"></div>';
    host.appendChild(button);
  }
  const header = panel.querySelector('.toy-header') || host;
  let label = header.querySelector('.toy-instrument-name');
  if (!label) {
    label = document.createElement('span'); label.className = 'toy-instrument-name';
    header.appendChild(label);
  }
  if (!button.__instrumentBound) {
    button.__instrumentBound = true;
    button.addEventListener('click', e => { e.stopPropagation(); chooseToyInstrument(panel, picker).catch(console.warn); });
    const update = () => {
      const id = panel.dataset.instrument || 'tone';
      const name = getDisplayNameForId(id) || id.replace(/[_-]/g, ' ');
      button.title = `Choose Instrument: ${name}`;
      button.setAttribute('aria-label', button.title);
      label.textContent = name;
      panel.style.setProperty('--instrument-colour', instrumentColour(id));
      panel.dataset.instrumentColour = instrumentColour(id);
    };
    // Occupy only the existing empty space between the two control groups.
    // Absolute positioning leaves header height and button positions unchanged.
    const left = header.querySelector('.toy-title');
    const positionLabel = () => {
      const slot = instrumentHeaderLabelSlot(left ? left.offsetLeft + left.offsetWidth : 0, host.offsetLeft ?? header.offsetWidth ?? 0);
      label.style.left = `${slot.left}px`; label.style.width = `${slot.width}px`;
    };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(positionLabel) : null;
    for (const element of new Set([header, host, left].filter(Boolean))) observer?.observe(element);
    panel.addEventListener('toy:dispose', () => observer?.disconnect(), { once: true });
    positionLabel();
    panel.addEventListener('toy-instrument', update);
    panel.addEventListener('toy:instrument', update);
    update();
  }
  return button;
}

export function instrumentHeaderLabelSlot(leftControlsEnd, rightControlsStart, gap = 12) {
  const left = leftControlsEnd + gap;
  return { left, width: Math.max(0, rightControlsStart - gap - left) };
}
