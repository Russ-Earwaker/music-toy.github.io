// src/debug.js
export const debug = { enabled: false, el: null };

export function ensureDebugPanel() {
  if (debug.el) return;
  const el = document.createElement('div');
  el.style.cssText = `
    position:fixed; top:8px; left:8px; z-index:9999;
    background:rgba(0,0,0,.7); color:#0f0; font:12px/1.3 monospace;
    padding:8px 10px; border:1px solid #0f0; border-radius:6px; white-space:pre; pointer-events:none;
  `;
  document.body.appendChild(el);
  debug.el = el;
}

export function updateDebugPanel(text) {
  if (!debug.enabled || !debug.el) return;
  debug.el.textContent = text;
}

export function setDebugEnabled(on) {
  debug.enabled = !!on;
  if (debug.enabled) ensureDebugPanel();
  if (debug.el) debug.el.style.display = debug.enabled ? 'block' : 'none';
}

export function attachDebugHotkeys() {
  const keyHandler = (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.isComposing) return;
    if ((e.key || '').toLowerCase() === 'd') {
      e.preventDefault();
      setDebugEnabled(!debug.enabled);
    }
  };
  window.addEventListener('keydown', keyHandler);
  document.addEventListener('keydown', keyHandler);
  window._dbg = () => setDebugEnabled(!debug.enabled);
}

export function injectDebugButton() {
  const header = document.querySelector('header .controls') || document.querySelector('header');
  if (!header) return;
  const btn = document.createElement('button');
  const setLabel = () => btn.textContent = debug.enabled ? 'Debug: ON' : 'Debug: OFF';
  setLabel();
  btn.addEventListener('click', () => { setDebugEnabled(!debug.enabled); setLabel(); });
  header.appendChild(btn);
}
