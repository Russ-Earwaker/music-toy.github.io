// src/layout-core.js
// Loop-free layout helper for toys.
// Standard mode: uses CSS aspect-ratio (no explicit height).
// Advanced mode: sets explicit px width/height once per change.
// Emits: 'toy:layout' with {w,h,advanced,aspect}.

const DEBUG = (typeof localStorage!=='undefined' && localStorage.getItem('mt_debug')==='1');
const log = (...a)=>{ if(DEBUG) console.info('[layout-core]', ...a); };

export function initLayout(panel, opts={}){
  const aspect = opts.aspect || 'auto'; // 'square'|'16:10'|'auto'
  const maxW = opts.maxWidth || 1400;
  const margin = opts.marginPx || 0;
  const body = panel.querySelector('.toy-body') || (()=>{ const b=document.createElement('div'); b.className='toy-body'; panel.appendChild(b); return b; })();
  if (getComputedStyle(body).position === 'static') body.style.position='relative';

  let lastW=0, lastH=0, logged=false;

  const isAdvanced = ()=> panel.classList.contains('toy-zoomed') || !!panel.closest('#zoom-overlay');

  function applyStandard(){
    // Do NOT set explicit height; just use aspect-ratio and let CSS drive height from width.
    if (aspect==='square') body.style.aspectRatio = '1 / 1';
    else if (aspect==='16:10') body.style.aspectRatio = '16 / 10';
    else body.style.removeProperty('aspect-ratio');
    body.style.removeProperty('width');
    body.style.removeProperty('height');
    body.style.removeProperty('min-height');
  }

  function applyAdvanced(){
    body.style.removeProperty('aspect-ratio');
    const vw = Math.floor(window.innerWidth*0.94);
    const vh = Math.floor(window.innerHeight*0.94);
    let W,H;
    if (aspect==='square'){ W = Math.min(maxW, Math.min(vw, vh)) - margin*2; H = W; }
    else if (aspect==='16:10'){ const w = Math.min(maxW, Math.min(vw, Math.floor(vh*16/10))); W = w - margin*2; H = Math.floor(W*10/16); }
    else { W = Math.min(maxW, vw) - margin*2; H = Math.min(vh,  Math.max(260, vh-2*margin)); }
    W = Math.max(200, W|0); H = Math.max(200, H|0);
    body.style.width = W+'px';
    body.style.height = H+'px';
    body.style.minHeight = H+'px';
  }

  const compute = ()=>{
    if (isAdvanced()) applyAdvanced(); else applyStandard();
    const r = body.getBoundingClientRect();
    // Derive target H for standard/aspect modes without writing back
    const W = Math.max(1, Math.round(r.width));
    const H = (aspect==='square') ? W : (aspect==='16:10' ? Math.floor(W*10/16) : Math.max(1, Math.round(r.height)));
    if (W!==lastW || H!==lastH){
      lastW=W; lastH=H;
      const adv=isAdvanced();
      panel.dispatchEvent(new CustomEvent('toy:layout', { detail:{ w:W, h:H, advanced:adv, aspect }, bubbles:false }));
      if(!logged){ log('first layout', {panel, w:W, h:H, aspect, adv}); logged=true; } else log('layout', {w:W,h:H,aspect,adv});
    }
  };

  // Observers (throttled)
  let raf=0; const req = ()=>{ if(raf) cancelAnimationFrame(raf); raf = requestAnimationFrame(()=>{ raf=0; compute(); }); };
  if (!panel.__lcRO){ try{ panel.__lcRO=new ResizeObserver(req); panel.__lcRO.observe(panel); panel.__lcRO.observe(body); }catch{} }
  if (!panel.__lcMO){ panel.__lcMO=new MutationObserver(req); panel.__lcMO.observe(panel,{attributes:true,attributeFilter:['class']}); }
  window.addEventListener('resize', req, { passive:true });

  // Initial
  req();
  return { onResize:(cb)=>panel.addEventListener('toy:layout', cb), getSize:()=>({w:lastW,h:lastH}) };
}
