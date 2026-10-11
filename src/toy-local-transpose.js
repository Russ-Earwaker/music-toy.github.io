// Toy-local authored offset. Graph offsets are composed at the pitch boundary.
export const normalizeLocalTranspose = value => Math.max(-12, Math.min(12, Math.trunc(Number(value) || 0)));
export function restoreToyLocalTranspose(panel, state = {}) {
  if (panel?.dataset?.toy !== 'drawgrid') return;
  panel.dataset.localTranspose = String(normalizeLocalTranspose(state.localTranspose));
  panel.dispatchEvent?.(new CustomEvent('toy:transpose', { bubbles: true }));
}
