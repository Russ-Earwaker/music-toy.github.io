// src/toyhelpers-sizing.js
import { resizeCanvasForDPR } from './utils.js';

export function initToySizing(shell, canvas, ctx, { squareFromWidth = false, aspectFrom = null, minH = 60 } = {}){
  const host = shell.querySelector?.('.toy-body') || shell;

  // Hidden sizer avoids measurement feedback from the canvas
  let sizer = host.querySelector?.('.toy-sizer');
  if (!sizer){
    try {
      sizer = document.createElement('div');
      sizer.className = 'toy-sizer';
      sizer.style.display = 'block';
      sizer.style.visibility = 'hidden';
      sizer.style.pointerEvents = 'none';
      sizer.style.position = 'absolute';
      sizer.style.left = '0';
      sizer.style.right = '0';
      sizer.style.top = '0';
      sizer.style.height = '0';
      sizer.style.width = '100%';
      const prevPos = (typeof getComputedStyle==='function') ? getComputedStyle(host).position : null;
      if (prevPos === 'static' || !prevPos){ host.style.position = 'relative'; }
      host.insertBefore(sizer, host.firstChild);
    } catch {}
  }

  let scale = 1; // 1 = standard, 2 = zoomed
  const baseSlotW = measureWidthFallback();
  let slotW = baseSlotW;
  let overrideCssW = null;
  let overrideCssH = null;

  function baseHeightFor(wCss){
    if (squareFromWidth) return wCss;
    if (typeof aspectFrom === 'function'){
      try { const r = aspectFrom(wCss); if (r && isFinite(r)) return Math.max(minH, Math.floor(r)); } catch {}
    }
    // fallback: 3:4-ish
    return Math.max(minH, Math.floor(wCss * 0.75));
  }

  function measureWidthFallback(){
    try {
      const sw = sizer?.clientWidth || 0;
      if (sw) return Math.max(1, Math.floor(sw));
    } catch {}
    try {
      const cs = (typeof getComputedStyle==='function') ? getComputedStyle(host) : null;
      const wcs = cs ? parseFloat(cs.width) : 0;
      if (wcs && isFinite(wcs)) return Math.max(1, Math.floor(wcs));
    } catch {}
    const r = host.getBoundingClientRect?.();
    const w = Math.max(1, Math.floor(r?.width || host.clientWidth || shell.clientWidth || 360));
    return w;
  }

  function applySize(){
  const cssW = Math.max(1, Math.floor((overrideCssW ?? slotW)));
  const cssH = Math.max(1, Math.floor((overrideCssH ?? baseHeightFor(slotW))));
  canvas.style.width  = cssW + 'px';
  canvas.style.height = cssH + 'px';
  // Center horizontally
  canvas.style.marginLeft = 'auto';
  canvas.style.marginRight = 'auto';
  // Keep canvas from influencing ancestor reflow weirdly
  canvas.style.maxWidth = 'none';
  resizeCanvasForDPR(canvas, ctx);
}

  function ensureFit(){
  try{ slotW = measureWidthFallback(); }catch{}
  const ratio = Math.max(0.5, Math.min(4, (slotW / Math.max(1, baseSlotW))));
  scale = ratio;
  applySize();
}
// resize observer (suspended during zoom to avoid feedback)
  let ro;
  try {
    ro = new ResizeObserver(()=> ensureFit());
    ro.observe(host);
  } catch {}

  function setZoom(zoomed){
  // Advanced edit mode: re-measure host and set scale relative to the initial width.
  try{ const w = measureWidthFallback(); slotW = w; }catch{}
  const ratio = Math.max(0.5, Math.min(4, (slotW / Math.max(1, baseSlotW))));
  scale = ratio;
  applySize();
  return scale;
  if (!zoomed){ overrideCssW = null; overrideCssH = null; }
  applySize();

}

  function vw(){ return host.clientWidth  || (host.getBoundingClientRect?.().width|0) || 0; }
  function vh(){ return host.clientHeight || (host.getBoundingClientRect?.().height|0) || 0; }

  // initial
  applySize();

  function setContentWidth(w){
    if (Number.isFinite(w)){
      slotW = Math.max(1, Math.floor(w));
      applySize();
    }
  }
  function setContentCssSize({w=null,h=null}={}){
    if (w!=null && Number.isFinite(w)) overrideCssW = Math.max(1, Math.floor(w));
    if (h!=null && Number.isFinite(h)) overrideCssH = Math.max(1, Math.floor(h));
    applySize();
  }
  function setContentCssHeight(h){ if (Number.isFinite(h)){ overrideCssH = Math.max(1, Math.floor(h)); applySize(); } }

  return { vw, vh, setZoom, setContentWidth, setContentCssSize, setContentCssHeight, get scale(){ return scale; } };
}