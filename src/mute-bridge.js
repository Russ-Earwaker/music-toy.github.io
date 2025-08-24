// src/mute-bridge.js — best-effort UI bridge to send 'toy-mute' events (<=200 lines)
function toyIdFrom(el){
  const panel = el.closest('.toy-panel');
  if (!panel) return null;
  return panel.dataset.toyid || panel.dataset.toy || null;
}
function dispatchMute(id, muted){
  try{ window.dispatchEvent(new CustomEvent('toy-mute', { detail: { toyId: id, muted: !!muted } })); }catch{}
}
document.addEventListener('click', (ev)=>{
  const t = ev.target;
  if (!t) return;
  if (t.matches('[data-action="mute"], .toy-mute, .btn-mute, [aria-pressed][data-mute]')){
    const id = toyIdFrom(t);
    if (!id) return;
    const panel = t.closest('.toy-panel');
    let muted = false;
    if (t.hasAttribute('aria-pressed')) muted = t.getAttribute('aria-pressed') === 'true';
    else if (panel) muted = panel.classList.contains('is-muted') || panel.dataset.muted === 'true';
    dispatchMute(id, muted);
  }
}, true);