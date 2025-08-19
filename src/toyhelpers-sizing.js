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
const cssW = Math.max(1, Math.floor(slotW * scale));
    const cssH = Math.max(1, Math.floor(baseHeightFor(slotW) * scale));
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
  // Standard view size is frozen; only re-apply sizing on resize to keep DPR sharp.
  applySize();
}
// resize observer (suspended during zoom to avoid feedback)
  let ro;
  try {
    ro = new ResizeObserver(()=> ensureFit());
    ro.observe(host);
  } catch {}

  function setZoom(zoomed){
    const nextScale = zoomed ? 2 : 1;
    if (nextScale !== scale){
      scale = nextScale;
      applySize();
    }
    return scale;
  }

  function vw(){ return host.clientWidth  || (host.getBoundingClientRect?.().width|0) || 0; }
  function vh(){ return host.clientHeight || (host.getBoundingClientRect?.().height|0) || 0; }

  // initial
  applySize();

  return { vw, vh, setZoom, get scale(){ return scale; } };
}
