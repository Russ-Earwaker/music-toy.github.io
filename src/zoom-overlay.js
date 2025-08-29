// src/zoom-overlay.js
// Advanced overlay (full file) — centered + aspect-aware + phone safety frame.
//
// Goals:
// - Pixel-perfect viewport centering (multi-monitor safe)
// - Keep *square toys* square and sized to fit
// - Keep *rectangular toys* (e.g., Grid) at their natural aspect (no vertical stretch)
// - Add a safety frame so header/volume aren't flush to screen edges on phones
// - Pre-size before moving to Advanced (no 0×0 phase), neutralise grid transforms
// - Click outside or ESC exits; restore everything on exit
//
// How it works
// 1) Measure header/footer and the toy body's *original aspect ratio* in standard mode.
// 2) Compute a content box from viewport minus a safe padding (and max width).
/* 3) If nearly square (±3%), make the body a square. Otherwise, preserve aspect.
      Body size is chosen to fit within the content box after header/footer. */
// 4) Apply sizes *before* moving into the overlay, so internals don’t glitch.
// 5) Center a padded frame at 50%/50% (then do a tiny correction if any drift).

export function ensureOverlay(){ return _ensureOverlay(); }
export function zoomInPanel(panel, onExit){ return _zoomIn(panel, onExit); }
export function zoomOutPanel(panel){ return _zoomOut(panel); }

let overlayEl=null, frameEl=null, activePanel=null, restoreInfo=null;
let escHandler=null, relayoutHandler=null;

const VIEWPORT_FRACTION = 0.96;   // leave a little breathing room
const MAX_CONTENT_W = 1200;       // avoid over-wide panels on desktop
const SAFE_PAD = 24;              // minimum safety padding (px) around the frame
const SQUARE_EPS = 0.03;          // +-3% counts as square

function _ensureOverlay(){
  if (overlayEl) return overlayEl;
  overlayEl = document.getElementById('zoom-overlay');
  if (!overlayEl){
    overlayEl = document.createElement('div');
    overlayEl.id='zoom-overlay';
    Object.assign(overlayEl.style,{
      position:'fixed', inset:'0', display:'none', zIndex:'9999',
      background:'rgba(0,0,0,0.35)', backdropFilter:'none',
      pointerEvents:'none', overflow:'hidden', boxSizing:'border-box'
    });
    overlayEl.addEventListener('pointerdown', (e)=>{
      try{ if (activePanel && !activePanel.contains(e.target)) _zoomOut(activePanel); }catch{}
    });
    document.body.appendChild(overlayEl);
  }
  if (!frameEl || frameEl.parentNode!==overlayEl){
    frameEl = document.createElement('div');
    frameEl.id='zoom-frame';
    Object.assign(frameEl.style,{
      position:'absolute',
      top:'50%', left:'50%',
      transform:'translate(-50%, -50%)', // anchor to viewport center
      width:'0px', height:'0px',         // set per-layout
      pointerEvents:'auto',
      display:'block',
      boxSizing:'content-box',           // padding is *outside* panel size we compute
      // Phone safety frame (works on Safari via env/constant and other browsers via 24px):
      paddingTop: 'max(24px, env(safe-area-inset-top))',
      paddingRight: 'max(24px, env(safe-area-inset-right))',
      paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
      paddingLeft: 'max(24px, env(safe-area-inset-left))'
    });
    overlayEl.appendChild(frameEl);
  }
  return overlayEl;
}

const _px = (n)=> (Math.round(n)||0)+'px';
function _vsize(){
  const vv=window.visualViewport;
  if (vv && vv.width && vv.height) return {vw:Math.floor(vv.width), vh:Math.floor(vv.height)};
  const vw=Math.max(document.documentElement.clientWidth, window.innerWidth||0);
  const vh=Math.max(document.documentElement.clientHeight, window.innerHeight||0);
  return {vw,vh};
}
function _openHidden(){ overlayEl.style.display='block'; overlayEl.style.pointerEvents='none'; overlayEl.style.backdropFilter='none'; overlayEl.style.visibility='hidden'; }
function _reveal(){ overlayEl.style.pointerEvents='auto'; overlayEl.style.backdropFilter='blur(2px)'; overlayEl.style.visibility='visible'; }
function _close(){ overlayEl.style.display='none'; overlayEl.style.pointerEvents='none'; overlayEl.style.backdropFilter='none'; overlayEl.style.visibility='hidden'; frameEl.replaceChildren(); }
function _snap(el){ return el ? (el.getAttribute('style')||'') : null; }
function _rest(el,str){ if(!el)return; if(str==null) el.removeAttribute('style'); else el.setAttribute('style',str); }
function _ensurePositioned(el){ if(!el)return; const cs=getComputedStyle(el); if(cs.position==='static') el.style.position='relative'; }

function _neutralisePanelOffsets(panel){
  const prior = {
    transformInline: panel.style.transform || null,
    translateInline: panel.style.translate || null,
    leftInline: panel.style.left || null,
    topInline: panel.style.top || null,
    rightInline: panel.style.right || null,
    bottomInline: panel.style.bottom || null,
    marginInline: panel.style.margin || null,
    transformOriginInline: panel.style.transformOrigin || null,
  };
  panel.style.transform = 'none';
  try{ panel.style.translate = '0 0'; }catch{ panel.style.translate=''; }
  panel.style.left = '0';
  panel.style.top = '0';
  panel.style.right = '';
  panel.style.bottom = '';
  panel.style.margin = '0';
  panel.style.transformOrigin = '50% 50%';
  return prior;
}

function _restorePanelOffsets(panel, prior){
  if (!prior) return;
  if (prior.transformInline !== null) panel.style.transform = prior.transformInline; else panel.style.removeProperty('transform');
  if (prior.translateInline !== null){ try{ panel.style.translate = prior.translateInline; }catch{ panel.style.removeProperty('translate'); } }
  if (prior.leftInline !== null) panel.style.left = prior.leftInline; else panel.style.removeProperty('left');
  if (prior.topInline !== null) panel.style.top = prior.topInline; else panel.style.removeProperty('top');
  if (prior.rightInline !== null) panel.style.right = prior.rightInline; else panel.style.removeProperty('right');
  if (prior.bottomInline !== null) panel.style.bottom = prior.bottomInline; else panel.style.removeProperty('bottom');
  if (prior.marginInline !== null) panel.style.margin = prior.marginInline; else panel.style.removeProperty('margin');
  if (prior.transformOriginInline !== null) panel.style.transformOrigin = prior.transformOriginInline; else panel.style.removeProperty('transform-origin');
}

function _measureOriginalAspect(body){
  if (!body) return 1;
  const r = body.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width));
  const h = Math.max(1, Math.round(r.height));
  return w / h;
}

function _computeContentBox(header, volume){
  const {vw,vh}=_vsize();
  // available content box after safety padding
  const maxW = Math.min(Math.floor(vw*VIEWPORT_FRACTION) - SAFE_PAD*2, MAX_CONTENT_W);
  const maxH = Math.floor(vh*VIEWPORT_FRACTION) - SAFE_PAD*2;
  const hH = header ? Math.round(header.getBoundingClientRect().height) : 0;
  const hF = volume ? Math.round(volume.getBoundingClientRect().height) : 0;
  return { maxW: Math.max(0, maxW), maxH: Math.max(0, maxH), hH, hF };
}

function _layoutForAspect(aspect, content){
  const {maxW, maxH, hH, hF} = content;
  const usableH = Math.max(0, maxH - hH - hF);
  const usableW = maxW;

  // If near-square, enforce square body
  if (Math.abs(aspect - 1) <= SQUARE_EPS){
    const side = Math.floor(Math.max(0, Math.min(usableW, usableH)));
    return { bodyW: side, bodyH: side };
  }

  // Preserve aspect: fit width-first, then height if needed
  let bodyW = Math.min(usableW, Math.floor(usableH * aspect));
  let bodyH = Math.floor(bodyW / aspect);
  if (bodyW > usableW){
    bodyW = usableW;
    bodyH = Math.floor(bodyW / aspect);
  }
  if (bodyH > usableH){
    bodyH = usableH;
    bodyW = Math.floor(bodyH * aspect);
  }
  return { bodyW: Math.max(0, bodyW), bodyH: Math.max(0, bodyH) };
}

function _applySizes(panel, header, body, volume, sizes){
  const { bodyW, bodyH } = sizes;
  if (header){ header.style.flex='0 0 auto'; }
  if (volume){ volume.style.flex='0 0 auto'; volume.style.alignSelf='stretch'; volume.style.width=_px(bodyW); }

  _ensurePositioned(body);
  body.style.width  = _px(bodyW);
  body.style.height = _px(bodyH);
  body.style.overflow='hidden';

  panel.style.width  = _px(bodyW);
  panel.style.height = _px(bodyH + (header?header.getBoundingClientRect().height:0) + (volume?volume.getBoundingClientRect().height:0));

  frameEl.style.width  = _px(bodyW);
  frameEl.style.height = _px(bodyH + (header?header.getBoundingClientRect().height:0) + (volume?volume.getBoundingClientRect().height:0));
}

function _centerCorrect(){
  // Tiny correction in case sub-pixel layout drifted
  const r = frameEl.getBoundingClientRect();
  const {vw,vh}=_vsize();
  const cx = r.left + r.width/2;
  const cy = r.top  + r.height/2;
  const dx = Math.round(vw/2 - cx);
  const dy = Math.round(vh/2 - cy);
  frameEl.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px)`;
}

function _computeSizes(panel, header, body, volume, aspect){
  // Lock header/footer heights for stability during this layout
  const hH = header ? Math.round(header.getBoundingClientRect().height) : 0;
  const hF = volume ? Math.round(volume.getBoundingClientRect().height) : 0;
  if (header) header.style.height = _px(hH);
  if (volume) volume.style.height = _px(hF);

  const content = _computeContentBox(header, volume);
  const bodyBox = _layoutForAspect(aspect, content);
  return {
    bodyW: bodyBox.bodyW,
    bodyH: bodyBox.bodyH,
  };
}

function _zoomIn(panel, onExit){
  if (!panel) return;
  _ensureOverlay();
  if (activePanel && activePanel!==panel) _zoomOut(activePanel);

  const header=panel.querySelector('.toy-header');
  const body  =panel.querySelector('.toy-body');
  const volume=panel.querySelector('.toy-volume, .toy-footer');

  // Snapshot placement + inline styles
  const placeholder=document.createComment('zoom-placeholder');
  const parent=panel.parentNode, next=panel.nextSibling; parent.insertBefore(placeholder,next);
  const original={ panel:_snap(panel), header:_snap(header), body:_snap(body), volume:_snap(volume) };

  // Visuals for zoomed panel
  panel.classList.add('toy-zoomed');
  panel.style.margin='0'; panel.style.position='relative';
  panel.style.display='flex'; panel.style.flexDirection='column';
  panel.style.borderRadius='16px'; panel.style.boxShadow='0 10px 30px rgba(0,0,0,0.5)';
  try{ panel.style.background=getComputedStyle(panel).background||'#1c1c1c'; }catch{}

  // Neutralise any grid/cell offsets while zoomed
  const priorOffsets = _neutralisePanelOffsets(panel);

  // Measure original aspect before any size changes
  const aspect0 = _measureOriginalAspect(body) || 1;

  // PRE-SIZE in place so internals don't see 0×0
  let sizes = _computeSizes(panel, header, body, volume, aspect0);
  _applySizes(panel, header, body, volume, sizes);

  // Move into overlay (hidden), verify, reveal
  _openHidden();
  frameEl.replaceChildren(panel);
  activePanel=panel;

  // Snapshot canvases to restore later
  const canvases=Array.from(body?body.querySelectorAll('canvas'):[]);
  const canvasSnaps=canvases.map(cv=>({el:cv, style:_snap(cv)}));
  restoreInfo={ placeholder,parent,original,onExit,header,body,volume,canvases:canvasSnaps, priorOffsets };

  requestAnimationFrame(()=>{
    sizes = _computeSizes(panel, header, body, volume, aspect0);
    _applySizes(panel, header, body, volume, sizes);

    // Canvases fill body visually
    canvases.forEach(cv=>{ cv.style.width='100%'; cv.style.height='100%'; cv.style.display='block'; });

    requestAnimationFrame(()=>{
      _reveal();
      _centerCorrect(); // final nudge

      // Live relayout (resize/visualViewport changes)
      const relayout=(()=>{
        let raf=0;
        return ()=>{
          if (raf) return;
          raf=requestAnimationFrame(()=>{
            const s2=_computeSizes(panel, header, body, volume, aspect0);
            _applySizes(panel, header, body, volume, s2);
            _centerCorrect();
            raf=0;
          });
        };
      })();
      relayoutHandler=relayout;
      addEventListener('resize', relayout, {passive:true});
      if (window.visualViewport){
        visualViewport.addEventListener('resize', relayout, {passive:true});
        visualViewport.addEventListener('scroll', relayout, {passive:true});
      }

      escHandler=(ev)=>{ if(ev.key==='Escape') _zoomOut(panel); };
      addEventListener('keydown', escHandler, {passive:true});
    });
  });
}

function _zoomOut(panel){
  if (!panel || panel!==activePanel) return;
  const info=restoreInfo||{};
  try{
    if (escHandler){ removeEventListener('keydown', escHandler); escHandler=null; }
    if (relayoutHandler){
      removeEventListener('resize', relayoutHandler); relayoutHandler=null;
      if (window.visualViewport){
        try{ visualViewport.removeEventListener('resize', relayoutHandler); }catch{}
        try{ visualViewport.removeEventListener('scroll', relayoutHandler); }catch{}
      }
    }

    panel.classList.remove('toy-zoomed');
    _rest(panel, info.original?.panel);
    _rest(info.header, info.original?.header);
    _rest(info.body, info.original?.body);
    _rest(info.volume, info.original?.volume);
    try{ _restorePanelOffsets(panel, info.priorOffsets); }catch{}

    if (Array.isArray(info.canvases)){ info.canvases.forEach(({el,style})=> _rest(el,style)); }

    const {placeholder,parent}=info;
    if (placeholder && parent){ parent.insertBefore(panel, placeholder); parent.removeChild(placeholder); }

    _close();
    activePanel=null; restoreInfo=null;

    try{ void parent && parent.offsetHeight; }catch{}
    setTimeout(()=> dispatchEvent(new Event('resize')), 0);

    if (typeof info.onExit==='function'){ try{ info.onExit(); }catch{} }
  }catch(e){
    console.error('[zoom-overlay] zoomOut failed', e);
    try{ _close(); }catch{}
  }
}

// Boot
(function autoBoot(){
  const boot=()=>{ try{ _ensureOverlay(); }catch{} };
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
