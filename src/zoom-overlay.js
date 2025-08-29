// src/zoom-overlay.js
// STRICT viewport centering + safe sizing for Advanced mode.
// Fixes Rippler cubes jumping to top-left by:
//  - Measuring header/body/footer BEFORE moving the panel
//  - Applying provisional pixel sizes before DOM move (so body is never 0×0)
//  - Not forcing `.toy-body` display to grid; we preserve layout and just set width/height/overflow
//  - Ensuring `.toy-body` is a positioned container (position:relative if it was static)

export function ensureOverlay(){ return _ensureOverlay(); }
export function zoomInPanel(panel, onExit){ return _zoomIn(panel, onExit); }
export function zoomOutPanel(panel){ return _zoomOut(panel); }

let overlayEl = null;
let frameEl = null;
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
      pointerEvents:'none',
      overflow:'hidden',
      boxSizing:'border-box',
    });
    overlayEl.addEventListener('pointerdown', (e)=>{
      // Exit if click is anywhere outside the active panel (covers clicks on frame/background)
      try{ if (activePanel && !activePanel.contains(e.target)) _zoomOut(activePanel); }catch{}
    });
    document.body.appendChild(overlayEl);
  }
  if (!frameEl || frameEl.parentNode !== overlayEl){
    frameEl = document.createElement('div');
    frameEl.id = 'zoom-frame';
    Object.assign(frameEl.style, {
      position:'absolute',
      top:'0px',
      left:'0px',
      width:'0px',
      height:'0px',
      pointerEvents:'auto',
      display:'block',
      boxSizing:'border-box',
    });
    overlayEl.appendChild(frameEl);
  }
  return overlayEl;
}

function _openOverlayInvisible(){
  overlayEl.style.display = 'block';
  overlayEl.style.pointerEvents = 'none';
  overlayEl.style.backdropFilter = 'none';
  overlayEl.style.visibility = 'hidden';
}
function _revealOverlay(){
  overlayEl.style.pointerEvents = 'auto';
  overlayEl.style.backdropFilter = 'blur(2px)';
  overlayEl.style.visibility = 'visible';
}
function _closeOverlay(){
  overlayEl.style.display = 'none';
  overlayEl.style.pointerEvents = 'none';
  overlayEl.style.backdropFilter = 'none';
  overlayEl.style.visibility = 'hidden';
  frameEl.replaceChildren();
}

function _snapStyle(el){ return el ? (el.getAttribute('style') || '') : null; }
function _restoreStyle(el, styleStr){
  if (!el) return;
  if (styleStr == null) el.removeAttribute('style');
  else el.setAttribute('style', styleStr);
}

function _viewportSize(){
  const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
  const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
  return { vw, vh };
}

function _centerFramePx(width, height){
  const { vw, vh } = _viewportSize();
  const left = Math.round((vw - width) / 2);
  const top  = Math.round((vh - height) / 2);
  frameEl.style.left = left + 'px';
  frameEl.style.top  = top + 'px';
  frameEl.style.width = width + 'px';
  frameEl.style.height = height + 'px';
}

function _ensurePositioned(el){
  if (!el) return;
  const cs = getComputedStyle(el);
  if (cs.position === 'static') el.style.position = 'relative';
}

function _zoomIn(panel, onExit){
  if (!panel) return;
  _ensureOverlay();

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

  // Apply zoomed look (purely visual)
  panel.classList.add('toy-zoomed');
  panel.style.margin = '0';
  panel.style.position = 'relative';
  panel.style.display = 'flex';
  panel.style.flexDirection = 'column';
  panel.style.borderRadius = '16px';
  panel.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
  try{ panel.style.background = getComputedStyle(panel).background || '#1c1c1c'; }catch{}

  // ----- PRE-MEASURE IN ORIGINAL DOM, then set provisional sizes so body is never 0×0 -----
  const { vw, vh } = _viewportSize();
  const hH0 = header ? Math.round(header.getBoundingClientRect().height) : 0;
  const hF0 = volume ? Math.round(volume.getBoundingClientRect().height) : 0;
  const maxW0 = Math.min(Math.floor(vw * 0.96), 1200);
  const maxH0 = Math.floor(vh * 0.96);
  const vPad = 16 + 16;
  const hPad = 16 + 16;
  const availW0 = Math.max(0, maxW0 - hPad);
  const availH0 = Math.max(0, maxH0 - vPad - hH0 - hF0);
  const side0   = Math.floor(Math.max(0, Math.min(availW0, availH0)));
  const frameW0 = side0 + hPad;
  const frameH0 = side0 + vPad + hH0 + hF0;

  _ensurePositioned(body);
  if (header) header.style.height = hH0 + 'px';
  if (volume) volume.style.height = hF0 + 'px';
  // Provisional sizes so observers inside the toy see valid dimensions immediately
  body.style.width  = side0 + 'px';
  body.style.height = side0 + 'px';
  body.style.overflow = 'hidden';
  panel.style.width  = frameW0 + 'px';
  panel.style.height = frameH0 + 'px';

  // Move into overlay frame (keep overlay invisible while we confirm layout)
  _openOverlayInvisible();
  frameEl.replaceChildren(panel);
  activePanel = panel;

  // Snapshot canvases we will touch
  const canvases = Array.from(body ? body.querySelectorAll('canvas') : []);
  const canvasSnaps = canvases.map(cv => ({ el: cv, style: _snapStyle(cv) }));

  restoreInfo = { placeholder, parent, original, onExit, header, body, volume, canvases: canvasSnaps };

  // rAF: verify/adjust sizes (in case header/footer heights differ in overlay context)
  requestAnimationFrame(()=>{
    const hH = header ? Math.round(header.getBoundingClientRect().height) : 0;
    const hF = volume ? Math.round(volume.getBoundingClientRect().height) : 0;
    if (header) header.style.height = hH + 'px';
    if (volume) volume.style.height = hF + 'px';

    const { vw, vh } = _viewportSize();
    const maxW = Math.min(Math.floor(vw * 0.96), 1200);
    const maxH = Math.floor(vh * 0.96);
    const availW = Math.max(0, maxW - hPad);
    const availH = Math.max(0, maxH - vPad - hH - hF);
    const side   = Math.floor(Math.max(0, Math.min(availW, availH)));
    const frameW = side + hPad;
    const frameH = side + vPad + hH + hF;

    body.style.width  = side + 'px';
    body.style.height = side + 'px';
    body.style.overflow = 'hidden';
    _ensurePositioned(body);

    panel.style.width  = frameW + 'px';
    panel.style.height = frameH + 'px';
    panel.style.maxWidth  = panel.style.width;
    panel.style.maxHeight = panel.style.height;

    _centerFramePx(frameW, frameH);

    // Ensure canvases fill body (without changing drawing buffer size)
    canvases.forEach(cv=>{
      cv.style.width = '100%';
      cv.style.height = '100%';
      cv.style.display = 'block';
    });

    // Reveal overlay after geometry is final
    requestAnimationFrame(()=>{
      _revealOverlay();

      // Window resize => recompute square and recenter
      const relayout = (()=>{
        let raf = 0;
        return ()=>{
          if (raf) return;
          raf = requestAnimationFrame(()=>{
            if (header) header.style.height = '';
            if (volume) volume.style.height = '';
            const newHH = header ? Math.round(header.getBoundingClientRect().height) : 0;
            const newHF = volume ? Math.round(volume.getBoundingClientRect().height) : 0;
            if (header) header.style.height = newHH + 'px';
            if (volume) volume.style.height = newHF + 'px';

            const { vw, vh } = _viewportSize();
            const maxW2 = Math.min(Math.floor(vw * 0.96), 1200);
            const maxH2 = Math.floor(vh * 0.96);
            const availW2 = Math.max(0, maxW2 - hPad);
            const availH2 = Math.max(0, maxH2 - vPad - newHH - newHF);
            const side2   = Math.floor(Math.max(0, Math.min(availW2, availH2)));
            const frameW2 = side2 + hPad;
            const frameH2 = side2 + vPad + newHH + newHF;

            body.style.width  = side2 + 'px';
            body.style.height = side2 + 'px';
            _ensurePositioned(body);
            panel.style.width  = frameW2 + 'px';
            panel.style.height = frameH2 + 'px';
            _centerFramePx(frameW2, frameH2);

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

    // Nudge reflow & re-measure
    try{ void parent && parent.offsetHeight; }catch{}
    setTimeout(()=> window.dispatchEvent(new Event('resize')), 0);
  }catch(e){
    console.error('[zoom-overlay] zoomOut failed', e);
    try{ _closeOverlay(); }catch{}
  }
}

// Boot
(function autoBoot(){
  const boot = ()=>{ try{ _ensureOverlay(); }catch{} };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
