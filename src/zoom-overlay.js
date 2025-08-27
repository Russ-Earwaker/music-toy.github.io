// src/zoom-overlay.js
// Reliable zoom: portal the entire panel into a fixed, centered overlay.
// Moving DOM nodes preserves event listeners; positions persist since we restore exactly.

export function ensureOverlay(){
  let overlay = document.getElementById('zoom-overlay');
  if (!overlay){
    overlay = document.createElement('div');
    overlay.id = 'zoom-overlay';
    overlay.style.position = 'fixed';
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.display = 'none';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.pointerEvents = 'none'; // enabled when active
    overlay.style.zIndex = '10000';
    overlay.style.background = 'transparent'; // no backdrop, stays visually consistent
    document.body.appendChild(overlay);
  }
  return overlay;
}

export function zoomInPanel(panel, onRequestUnzoom){
  const overlay = ensureOverlay();
  overlay.style.display = 'flex';
  overlay.style.pointerEvents = 'auto';
  // keep header visible
  try{ const h = panel.querySelector('.toy-header'); if (h){ h.style.display='flex'; } }catch{}

  // remember original placement & inline style
  const info = panel._portalInfo || {};
  if (!info.parent) info.parent = panel.parentNode;
  if (info.next === undefined) info.next = panel.nextSibling;
  info.prevStyle = panel.getAttribute('style') || '';
  panel._portalInfo = info;

  // clear absolute offsets so overlay centering is correct
  panel.style.position = '';
  panel.style.left = '';
  panel.style.top = '';
  panel.style.transform = '';

  overlay.appendChild(panel);
  // preserve aspect sizing
  /* preserve aspect sizing */
  try{
    const body = panel.querySelector('.toy-body') || panel;
    const header = panel.querySelector('.toy-header');
    const br = body.getBoundingClientRect();
    const headerH = header ? header.offsetHeight : 0;
    const maxW = Math.max(360, Math.min(window.innerWidth - 80, 1080));
    // Use current body aspect
    const ratio = (br && br.width>0) ? (br.height / br.width) : 0.75;
    const ww = Math.round(Math.min(maxW, Math.max(br.width*1.4, 480)));
    const hh = Math.round(ww * ratio + headerH);
    panel.style.width = ww + 'px';
    panel.style.height = hh + 'px';
    if (header){ header.style.display='flex'; header.style.zIndex='5'; }
  }catch{}

  // click outside to request unzoom
  const outside = (e)=>{
    if (e.target === overlay){
      if (onRequestUnzoom) try { onRequestUnzoom(); } catch {}
    }
  };
  // store handler for removal
  overlay._outsideHandler && overlay.removeEventListener('click', overlay._outsideHandler);
  overlay._outsideHandler = outside;
  overlay.addEventListener('click', outside);
}

export function zoomOutPanel(panel){
  const overlay = ensureOverlay();
  // remove outside handler & hide overlay
  if (overlay._outsideHandler){
    overlay.removeEventListener('click', overlay._outsideHandler);
    overlay._outsideHandler = null;
  }
  overlay.style.display = 'none';
  overlay.style.pointerEvents = 'none';

  // restore original placement and inline style
  const info = panel._portalInfo || {};
  if (info.parent){
    info.parent.insertBefore(panel, info.next || null);
  }
  if ('prevStyle' in info){
    if (info.prevStyle) panel.setAttribute('style', info.prevStyle);
    else panel.removeAttribute('style');
  }
  panel._portalInfo = null;
}
