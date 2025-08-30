// src/toyhelpers-sizing.js
import { resizeCanvasForDPR } from './utils.js';

/**
 * initToySizing
 * - Provides a stable zoom `scale` for Advanced mode without cumulative stretching.
 * - Keeps a simple API used by toys: { vw, vh, setZoom, setContentWidth, setContentCssSize, setContentCssHeight, get scale }.
 * - `applySize()` sets CSS size of the canvas; toys still call `resizeCanvasForDPR` before drawing for DPR pixels.
 */
export function initToySizing(shell, canvas, ctx, { squareFromWidth = false, aspectFrom = null, minH = 60 } = {}){
  const host = shell.querySelector?.('.toy-body') || shell;

  // Hidden sizer to measure width independent of canvas layout
  let sizer = host.querySelector?.('.toy-sizer');
  if (!sizer){
    try{
      sizer = document.createElement('div');
      sizer.className = 'toy-sizer';
      sizer.style.position = 'absolute';
      sizer.style.left = '0';
      sizer.style.top = '0';
      sizer.style.width = '100%';
      sizer.style.height = '1px';
      sizer.style.pointerEvents = 'none';
      sizer.style.visibility = 'hidden';
      host.appendChild(sizer);
    }catch{}
  }

  // Baseline (captured once) and live slot width
  const bounds = ()=> (host?.getBoundingClientRect?.() || { width: canvas?.clientWidth||300, height: canvas?.clientHeight||minH });
  const baseBounds = bounds();
  const baseSlotW = Math.max(1, Math.floor(baseBounds.width||300));

  let slotW = Math.max(1, Math.floor(bounds().width||baseSlotW));
  let overrideCssW = null, overrideCssH = null;
  let scale = 1;

  function vw(){ return Math.max(1, Math.floor(overrideCssW ?? slotW)); }
  function vh(){
    /* ZOOMED_SQUARE_ENFORCE */
    try{ const p = host?.closest ? host.closest('.toy-panel') : host; if (p && p.classList && p.classList.contains('toy-zoomed')){ return Math.max(minH, vw()); } }catch{}
    if (overrideCssH != null) return Math.max(minH, Math.floor(overrideCssH));
    if (squareFromWidth) return Math.max(minH, vw());
    if (aspectFrom && Array.isArray(aspectFrom) && aspectFrom.length===2){
      const [aw, ah] = aspectFrom;
      if (aw>0 && ah>0) return Math.max(minH, Math.floor(vw()*ah/aw));
    }
    // Fallback: try host height
    const h = host?.clientHeight || baseBounds.height || minH;
    return Math.max(minH, Math.floor(h));
  }

  function applySize(){
    try{
      const cssW = vw(), cssH = vh();
      if (canvas){
        canvas.style.width = cssW + 'px';
        canvas.style.height = cssH + 'px';
      }
    }catch{}
  }

  function setZoom(zoomed){
    try{
      // Always re-measure current width to avoid compounding
      const b = bounds();
      slotW = Math.max(1, Math.floor(b.width||baseSlotW));
    }catch{}
    if (zoomed){
      const ratio = slotW / baseSlotW;
      scale = Math.max(0.5, Math.min(4, Number.isFinite(ratio) ? ratio : 1));
    }else{
      scale = 1;
      // Clear overrides so we fully reset on unzoom
      overrideCssW = null; overrideCssH = null;
    }
    applySize();
    return scale;
  }

  function setContentWidth(w){
    if (Number.isFinite(w)){
      slotW = Math.max(1, Math.floor(w));
      applySize();
    }
  }
  function setContentCssSize({w=null, h=null}={}){
    if (w!=null && Number.isFinite(w)) overrideCssW = Math.max(1, Math.floor(w));
    if (h!=null && Number.isFinite(h)) overrideCssH = Math.max(1, Math.floor(h));
    applySize();
  }
  function setContentCssHeight(h){
    if (Number.isFinite(h)){ overrideCssH = Math.max(1, Math.floor(h)); applySize(); }
  }

  // Initial sizing and resize handler
  applySize();
  try{
    const ro = new ResizeObserver(()=>{
      try{ slotW = Math.max(1, Math.floor(bounds().width||baseSlotW)); }catch{}
      applySize();
    });
    ro.observe(host);
  }catch{}

  return {
    vw, vh, setZoom, setContentWidth, setContentCssSize, setContentCssHeight,
    get scale(){ return scale; }
  };
}
