// src/zoom-overlay.js
// Viewport-anchored overlay (centers to the WINDOW, not the toy's prior layout).
// - Uses a dedicated host absolutely centered via translate(-50%,-50%).
// - No blur/pointer capture after exit.
// - No first-frame jump (measure invisible, then reveal).
// - Restores panel/header/body/volume + canvases on exit.
// - Keeps standard mode untouched (CSS handles header/volume width = 100%).

export function ensureOverlay(){ return _ensureOverlay(); }
export function zoomInPanel(panel, onExit){ return _zoomIn(panel, onExit); }
export function zoomOutPanel(panel){ return _zoomOut(panel); }

let overlayEl = null;
let hostEl = null;
let activePanel = null;
let restoreInfo = null;
let escHandler = null;
let relayoutHandler = null;

function _ensureOverlay(){
  if (overlayEl) return overlayEl;
  overlayEl = document.getElementById('zoom-overlay');
  if (!overlayEl){
    overlayEl = document.createElement('div');
    overlayEl.id = 'zoom-overlay';
    Object.assign(overlayEl.style, {
      position:'fixed',
      inset:'0',
      display:'none',
      zIndex:'9999',
      background:'rgba(0,0,0,0.35)',
      backdropFilter:'none',
      overflow:'hidden',
      pointerEvents:'none',
    });
    overlayEl.addEventListener('pointerdown', (e)=>{
      if (e.target === overlayEl) _zoomOut(activePanel);
    });
    document.body.appendChild(overlayEl);
  }
  return overlayEl;
}

function _ensureHost(){
  if (hostEl && hostEl.parentNode === overlayEl) return hostEl;
  hostEl = document.createElement('div');
  hostEl.id = 'zoom-host';
  Object.assign(hostEl.style, {
    position:'absolute',
    top:'50%', left:'50%',
    transform:'translate(-50%, -50%)',
    display:'block',
    pointerEvents:'none', // clicks should hit children only
  });
  overlayEl.appendChild(hostEl);
  return hostEl;
}

function _showOverlayVisible(){
  overlayEl.style.display = 'block';
  overlayEl.style.pointerEvents = 'auto';
  overlayEl.style.backdropFilter = 'blur(2px)';
  overlayEl.style.visibility = 'visible';
}

function _prepareOverlayInvisible(){
  overlayEl.style.display = 'block';
  overlayEl.style.pointerEvents = 'none';
  overlayEl.style.backdropFilter = 'none';
  overlayEl.style.visibility = 'hidden';
}

function _closeOverlay(){
  overlayEl.style.display = 'none';
  overlayEl.style.pointerEvents = 'none';
  overlayEl.style.backdropFilter = 'none';
  overlayEl.style.visibility = 'hidden';
  if (hostEl){ hostEl.replaceChildren(); }
}

function _snapStyle(el){ return el ? (el.getAttribute('style') || '') : null; }
function _restoreStyle(el, styleStr){
  if (!el) return;
  if (styleStr == null) el.removeAttribute('style');
  else el.setAttribute('style', styleStr);
}

function _zoomIn(panel, onExit){
  if (!panel) return;
  _ensureOverlay(); _ensureHost();

  // If something else is open, close it first.
  if (activePanel && activePanel !== panel) _zoomOut(activePanel);

  // Elements to track/restore
  const header = panel.querySelector('.toy-header');
  const body   = panel.querySelector('.toy-body');
  const volume = panel.querySelector('.toy-volume, .toy-footer');

  // Record original placement and inline style snapshots
  const placeholder = document.createComment('zoom-placeholder');
  const parent = panel.parentNode;
  const next   = panel.nextSibling;
  parent.insertBefore(placeholder, next);

  const original = {
    panel: _snapStyle(panel),
    header: _snapStyle(header),
    body: _snapStyle(body),
    volume: _snapStyle(volume),
  };

  // Apply zoomed look
  panel.classList.add('toy-zoomed');
  panel.style.margin = '0';
  panel.style.position = 'relative';
  panel.style.display = 'flex';
  panel.style.flexDirection = 'column';
  panel.style.borderRadius = '16px';
  panel.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
  try{ panel.style.background = getComputedStyle(panel).background || '#1c1c1c'; }catch{}

  // Move into overlay host (invisible first)
  _prepareOverlayInvisible();
  hostEl.replaceChildren(panel);
  activePanel = panel;

  // Snapshot canvases we will touch
  const canvases = Array.from(body ? body.querySelectorAll('canvas') : []);
  const canvasSnaps = canvases.map(cv => ({ el: cv, style: _snapStyle(cv) }));

  restoreInfo = { placeholder, parent, original, onExit, header, body, volume, canvases: canvasSnaps };

  // rAF 1: measure header/footer and lock to avoid jumps
  requestAnimationFrame(()=>{
    const hH = header ? Math.round(header.getBoundingClientRect().height) : 0;
    const hF = volume ? Math.round(volume.getBoundingClientRect().height) : 0;
    if (header) header.style.height = hH + 'px';
    if (volume) volume.style.height = hF + 'px';

    // Layout square using viewport (host is at exact center of the window)
    _layoutSquare(panel, header, body, volume, { hH, hF });

    // Canvases fill body in zoom mode
    canvases.forEach(cv=>{
      cv.style.width = '100%';
      cv.style.height = '100%';
      cv.style.display = 'block';
    });

    // rAF 2: reveal overlay now that geometry is final
    requestAnimationFrame(()=>{
      _showOverlayVisible();

      // Window resize => recompute square from viewport
      const relayout = (()=>{
        let raf = 0;
        return ()=>{
          if (raf) return;
          raf = requestAnimationFrame(()=>{
            _layoutSquare(panel, header, body, volume, { hH, hF });
            raf = 0;
          });
        };
      })();
      relayoutHandler = relayout;
      window.addEventListener('resize', relayout, { passive:true });

      // ESC to exit
      escHandler = (ev)=>{ if (ev.key === 'Escape') _zoomOut(panel); };
      window.addEventListener('keydown', escHandler, { passive:true });
    });
  });
}

function _zoomOut(panel){
  if (!panel || panel !== activePanel) return;
  const info = restoreInfo || {};
  try{
    if (escHandler){ window.removeEventListener('keydown', escHandler); escHandler = null; }
    if (relayoutHandler){ window.removeEventListener('resize', relayoutHandler); relayoutHandler = null; }

    // Restore inline styles (panel + key children)
    panel.classList.remove('toy-zoomed');
    _restoreStyle(panel, info.original?.panel);
    _restoreStyle(info.header, info.original?.header);
    _restoreStyle(info.body, info.original?.body);
    _restoreStyle(info.volume, info.original?.volume);

    // Restore canvases
    if (Array.isArray(info.canvases)){
      info.canvases.forEach(({el, style})=> _restoreStyle(el, style));
    }

    // Move back into place
    const { placeholder, parent } = info;
    if (placeholder && parent){
      parent.insertBefore(panel, placeholder);
      parent.removeChild(placeholder);
    }

    // Close overlay
    _closeOverlay();

    activePanel = null;
    restoreInfo = null;

    // Reflow nudge to avoid “needs two exits” symptoms
    try{ void parent && parent.offsetHeight; }catch{}
    // Dispatch resize so toys re-measure naturally
    setTimeout(()=> window.dispatchEvent(new Event('resize')), 0);
  }catch(e){
    console.error('[zoom-overlay] zoomOut failed', e);
    try{ _closeOverlay(); }catch{}
  }
}

function _layoutSquare(panel, header, body, volume, locked){
  if (!panel || !body) return;

  // Compute square from VIEWPORT (not overlay size, not toy position)
  const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
  const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);

  const maxW = Math.min(vw * 0.96, 1200);
  const maxH = vh * 0.96;

  const hH = locked ? locked.hH : (header ? header.getBoundingClientRect().height : 0);
  const hF = locked ? locked.hF : (volume ? volume.getBoundingClientRect().height : 0);
  const vPad = 16 + 16;
  const hPad = 16 + 16;

  const availW = Math.max(0, maxW - hPad);
  const availH = Math.max(0, maxH - vPad - hH - hF);
  const side = Math.floor(Math.max(0, Math.min(availW, availH)));

  // Size host and panel
  hostEl.style.width = Math.round(side + hPad) + 'px';
  hostEl.style.height = Math.round(side + vPad + hH + hF) + 'px';

  panel.style.width = Math.round(side + hPad) + 'px';
  panel.style.height = Math.round(side + vPad + hH + hF) + 'px';
  panel.style.maxWidth = panel.style.width;
  panel.style.maxHeight = panel.style.height;

  // Children
  if (header){ header.style.flex = '0 0 auto'; }
  body.style.flex  = '0 0 auto';
  body.style.width = side + 'px';
  body.style.height= side + 'px';
  body.style.overflow = 'hidden';
  body.style.display  = 'grid';
  body.style.placeItems = 'center';
  if (volume){
    volume.style.flex = '0 0 auto';
    volume.style.marginTop = 'auto';
    volume.style.alignSelf = 'stretch';
    volume.style.width = (side + hPad) + 'px';
  }
}

// Boot
(function autoBoot(){
  const boot = ()=>{ try{ _ensureOverlay(); }catch{} };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
