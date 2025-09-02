// src/toyhelpers-sizing.js
// Stable legacy sizing shim used by older toys (like LoopGrid).
// Standard: derive height from width if square/aspect requested (via CSS aspect-ratio).
// Advanced: read the box. No DPR scaling here.

export function initToySizing(shell, canvas, ctx, opts = {}){
  const { squareFromWidth=false, aspectFrom=null, minH=60 } = opts;
  const host = shell.querySelector?.('.toy-body') || shell;
  if (getComputedStyle(host).position==='static') host.style.position='relative';

  // Apply aspect-ratio in Standard so layout is loop-free.
  const applyAspectCSS = ()=>{
    const adv = shell.classList?.contains('toy-zoomed') || !!shell.closest?.('#zoom-overlay');
    if (!adv){
      if (squareFromWidth) host.style.aspectRatio = '1 / 1';
      else if (aspectFrom==='16:10') host.style.aspectRatio = '16 / 10';
      else if (aspectFrom==='4:3') host.style.aspectRatio = '4 / 3';
      else host.style.removeProperty('aspect-ratio');
    } else {
      host.style.removeProperty('aspect-ratio');
    }
  };

  let lastW=0, lastH=0;
  function readSize(){
    const r = host.getBoundingClientRect();
    const W = Math.max(1, Math.floor(r.width || canvas?.clientWidth || 300));
    const adv = shell.classList?.contains('toy-zoomed') || !!shell.closest?.('#zoom-overlay');
    let H;
    if (!adv){
      H = squareFromWidth ? W : (aspectFrom==='16:10' ? Math.floor(W*10/16) : (aspectFrom==='4:3' ? Math.floor(W*3/4) : Math.max(minH, Math.floor(r.height || minH))));
    } else {
      H = Math.max(minH, Math.floor(r.height || minH));
    }
    return { W, H };
  }

  function apply(){
    applyAspectCSS();
    const {W,H} = readSize();
    if (W!==lastW || H!==lastH){
      canvas.style.width = W+'px'; canvas.style.height = H+'px';
      canvas.width = W; canvas.height = H;
      lastW=W; lastH=H;
    }
    return { w:lastW, h:lastH };
  }

  try{
    const ro = new ResizeObserver(()=> apply()); ro.observe(host);
    const mo = new MutationObserver(()=> apply()); mo.observe(shell,{attributes:true,attributeFilter:['class']});
  }catch{}
  apply();
  return { vw(){return lastW;}, vh(){return lastH;}, applySize:apply, setContentWidth(w){/*noop*/}, setContentCssSize(w,h){/*noop*/}, setContentCssHeight(h){/*noop*/} };
}
