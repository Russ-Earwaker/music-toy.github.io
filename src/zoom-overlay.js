// src/zoom-overlay.js — centers panel and keeps body square inside viewport
// Lightweight, non-destructive "Advance" overlay. Restores panel on exit.
export function ensureOverlay(){
  let overlay = document.getElementById('zoom-overlay');
  if (!overlay){
    overlay = document.createElement('div');
    overlay.id = 'zoom-overlay';
    Object.assign(overlay.style, {
      position:'fixed', inset:'0', display:'none', placeItems:'center',
      zIndex:'9999', background:'rgba(0,0,0,0.35)', backdropFilter:'blur(2px)'
    });
    overlay.addEventListener('click', (e)=>{
      // Click outside panel exits
      if (e.target === overlay){
        const panel = overlay.querySelector('.toy-panel');
        if (panel) zoomOutPanel(panel);
      }
    });
    document.body.appendChild(overlay);
  }
  return overlay;
}

function px(n){ return Math.max(0, Math.round(n)) + 'px'; }

export function zoomInPanel(panel){
  const overlay = ensureOverlay();
  if (!panel || panel._portalInfo) return; // already zoomed

  const bodyEl = panel.querySelector('.toy-body');
  const info = {
    parent: panel.parentNode,
    next: panel.nextSibling,
    prevPanelStyle: panel.getAttribute('style'),
    prevBodyStyle: bodyEl ? bodyEl.getAttribute('style') : null
  };
  panel._portalInfo = info;

  // Normalize panel sizing
  panel.style.position = 'relative';
  panel.style.left = '0'; panel.style.top = '0';
  panel.style.width = 'min(92vmin, 92vw)';
  panel.classList.add('toy-zoomed');

  // Body should try to be square inside panel
  if (bodyEl){
    bodyEl.style.width = '100%';
    // Prefer aspect-ratio where available; fallback to explicit height on resize
    bodyEl.style.aspectRatio = '1 / 1';
  }

  overlay.style.display = 'grid';
  overlay.appendChild(panel);

  try{ panel.dispatchEvent(new CustomEvent('toy-zoom', { detail:{ zoomed:true } })); }catch{}
  try{ window.dispatchEvent(new Event('resize')); }catch{}
}

export function zoomOutPanel(panel){
  const overlay = ensureOverlay();
  if (!panel || !panel._portalInfo) return;
  const info = panel._portalInfo;
  const bodyEl = panel.querySelector('.toy-body');
  try{
    if (info.parent){ info.parent.insertBefore(panel, info.next || null); }
    if (info.prevPanelStyle != null){
      if (info.prevPanelStyle) panel.setAttribute('style', info.prevPanelStyle);
      else panel.removeAttribute('style');
    }
    if (bodyEl && info.prevBodyStyle != null){
      if (info.prevBodyStyle) bodyEl.setAttribute('style', info.prevBodyStyle);
      else bodyEl.removeAttribute('style');
    }
    panel.classList.remove('toy-zoomed');
    panel._portalInfo = null;
  }catch{}

  // Hide overlay if no content
  if (!overlay.querySelector('.toy-panel')) overlay.style.display = 'none';

  try{ panel.dispatchEvent(new CustomEvent('toy-zoom', { detail:{ zoomed:false } })); }catch{}
  try{ window.dispatchEvent(new Event('resize')); }catch{}
}
