// Nondestructive whole-toy octave offset, after existing pitch policies.
export const normalizeRegisterOctaves = value => Math.max(-2, Math.min(2, Math.trunc(Number(value) || 0)));
export function restoreToyRegister(panel, state = {}) {
  if (panel?.dataset?.toy !== 'drawgrid') return;
  panel.dataset.registerOctaves = String(normalizeRegisterOctaves(state.registerOctaves));
  panel.dispatchEvent?.(new CustomEvent('toy:register', { bubbles: true }));
}
