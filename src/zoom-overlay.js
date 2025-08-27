// src/zoom-overlay.js — centers panel and keeps body square inside viewport
export function ensureOverlay(){
  let overlay = document.getElementById('zoom-overlay');
  if (!overlay){
    overlay = document.createElement('div');
    overlay.id = 'zoom-overlay';
    Object.assign(overlay.style, {
      position:'fixed', inset:'0', display:'none', placeItems:'center',
      zIndex:'9999', background:'rgba(0,0,0,0.35)', backdropFilter:'blur(2px)'
    });
    document.body.appendChild(overlay);
  }
  return overlay;
}

function px(n){ return Math.max(0, Math.round(n)) + 'px'; }

export function zoomInPanel(panel, onClose){
  const overlay = ensureOverlay();
  overlay.innerHTML = '';

  const frame = document.createElement('div');
  Object.assign(frame.style, { position:'relative' });

  const info = {
    parent: panel.parentNode,
    next: panel.nextSibling,
    prevPanelStyle: panel.getAttribute('style'),
    prevBodyStyle: null
  };
  panel._portalInfo = info;

  // Normalize panel
  panel.style.position = 'relative';
  panel.style.left = '0'; panel.style.top = '0';
  panel.style.width = 'min(92vmin, 92vw)';
  panel.style.minHeight = '0';
  panel.classList.add('toy-zoomed');

  const body = panel.querySelector('.toy-body') || panel;
  info.prevBodyStyle = body.getAttribute('style');
  body.style.position = 'relative';
  body.style.inset = 'auto';
  body.style.marginTop = '0';
  body.style.width = '100%';

  frame.appendChild(panel);
  overlay.appendChild(frame);
  overlay.style.display = 'grid';
  try{ panel.dispatchEvent(new CustomEvent('toy-zoom', { detail:{ zoomed:true } })); }catch{}

  function layout(){
    try{
      const vw = Math.max(320, window.innerWidth || 0);
      const vh = Math.max(320, window.innerHeight || 0);
      const header = panel.querySelector('.toy-header');
      const vol = panel.querySelector('.toy-volwrap');
      const hh = header ? header.getBoundingClientRect().height : 0;
      const hv = vol ? Math.max(40, vol.getBoundingClientRect().height || 0) : 48;

      const maxW = Math.floor(vw * 0.92);
      const maxH = Math.floor(vh * 0.92);
      // Square size limited by width and by height minus header + volume + padding
      const limitByHeight = Math.floor(maxH - hh - hv - 16);
      const w = Math.max(160, Math.min(maxW, limitByHeight));

      panel.style.width = px(w);
      body.style.height = px(w);

      // Panel height includes header + body + volume (volume will be positioned at bottom)
      const totalH = Math.round(hh + w + hv);
      panel.style.height = px(totalH);
      panel.style.minHeight = px(totalH);
    }catch{}
  }

  const ro = new ResizeObserver(layout);
  ro.observe(overlay);
  window.addEventListener('resize', layout);
  panel._zoomRO = ro;
  layout();

  overlay.addEventListener('click', (e)=>{
    if (e.target === overlay){ if (onClose) onClose(); }
  }, { once:true });
}

export function zoomOutPanel(panel){
  const overlay = ensureOverlay();
  overlay.style.display = 'none';

  try{
    const body = panel.querySelector('.toy-body') || panel;
    if (panel._zoomRO){ panel._zoomRO.disconnect(); panel._zoomRO = null; }
    const info = panel._portalInfo || {};
    if (info.prevBodyStyle != null){
      if (info.prevBodyStyle) body.setAttribute('style', info.prevBodyStyle);
      else body.removeAttribute('style');
    }
    panel.classList.remove('toy-zoomed');
        // Clear temporary sizing before reattach
    try{ panel.style.width=''; panel.style.height=''; panel.style.minHeight=''; }catch{}
    const bodyEl = panel.querySelector('.toy-body')||panel;
    try{ if (bodyEl){ bodyEl.style.height=''; bodyEl.style.width=''; bodyEl.style.inset=''; } }catch{}
    if (info.parent){ info.parent.insertBefore(panel, info.next || null); }
    if (info.prevPanelStyle != null){
      if (info.prevPanelStyle) panel.setAttribute('style', info.prevPanelStyle);
      else panel.removeAttribute('style');
    }
    panel.classList.remove('toy-zoomed');
    panel._portalInfo = null;
    try{ window.dispatchEvent(new Event('resize')); }catch{}
  }catch{}

  try{ panel.dispatchEvent(new CustomEvent('toy-zoom', { detail:{ zoomed:false } })); }catch{}
  try{ window.dispatchEvent(new Event('resize')); }catch{}
}
