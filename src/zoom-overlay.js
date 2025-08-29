// zoom-overlay.js (ES module)
// Advanced overlay: centered, aspect-aware, content-sized, footer pinned, safe zones.
// Exports: ensureOverlay, zoomInPanel, zoomOutPanel

let overlayEl=null, frameEl=null, activePanel=null, restoreInfo=null;
let escHandler=null, relayoutHandler=null;

const VIEWPORT_FRACTION = 0.96;
const MAX_CONTENT_W     = 1200;
const SAFE_PAD_X        = 28;
const SAFE_PAD_TOP      = 28;
const SAFE_PAD_BOTTOM   = 64;
const SQUARE_EPS        = 0.03;

function _px(n){ n=(Math.round(n)||0); return (n<0?0:n) + 'px'; }
function _vsize(){
  const vv=window.visualViewport;
  if (vv && vv.width && vv.height) return {vw:Math.floor(vv.width), vh:Math.floor(vv.height)};
  const vw=Math.max(document.documentElement.clientWidth, window.innerWidth||0);
  const vh=Math.max(document.documentElement.clientHeight, window.innerHeight||0);
  return {vw, vh};
}
function _openHidden(){ overlayEl.style.display='block'; overlayEl.style.pointerEvents='none'; overlayEl.style.backdropFilter='none'; overlayEl.style.visibility='hidden'; }
function _reveal(){ overlayEl.style.pointerEvents='auto'; overlayEl.style.backdropFilter='blur(2px)'; overlayEl.style.visibility='visible'; }
function _close(){ overlayEl.style.display='none'; overlayEl.style.pointerEvents='none'; overlayEl.style.backdropFilter='none'; overlayEl.style.visibility='hidden'; frameEl.replaceChildren(); }
function _snap(el){ return el ? (el.getAttribute('style')||'') : null; }
function _rest(el,str){ if(!el)return; if(str==null) el.removeAttribute('style'); else el.setAttribute('style',str); }
function _ensurePositioned(el){ if(!el)return; const cs=getComputedStyle(el); if(cs.position==='static') el.style.position='relative'; }
function _centerCorrect(){
  const r = frameEl.getBoundingClientRect();
  const {vw,vh}=_vsize();
  const dx = Math.round(vw/2 - (r.left + r.width/2));
  const dy = Math.round(vh/2 - (r.top  + r.height/2));
  frameEl.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px)`;
}

function _findHeader(panel){
  return panel.querySelector('.toy-header,[data-role="header"]');
}
function _findBody(panel){
  return panel.querySelector('.toy-body,[data-role="body"]') || panel;
}
function _findFooter(panel){
  let el = panel.querySelector('.toy-volume, .toy-footer, .toy-controls-bottom, [data-role="volume"]');
  if (el) return el;
  const range = panel.querySelector('input[type="range"]');
  if (range){
    el = range.closest('.toy-volume, .toy-footer, .toy-controls, .toy-controls-right, .toy-controls-left') || range.parentElement;
  }
  return el;
}

function _measureAspect(body){
  const cv = body.querySelector('canvas');
  if (cv){
    const cr = cv.getBoundingClientRect();
    const cw = Math.max(1, Math.round(cr.width)), ch = Math.max(1, Math.round(cr.height));
    if (cw>0 && ch>0) return cw/ch;
  }
  const r = body.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
  return w/h;
}

function _contentBox(header, footer){
  const {vw,vh}=_vsize();
  const maxW = Math.min(Math.floor(vw*VIEWPORT_FRACTION) - SAFE_PAD_X*2, MAX_CONTENT_W);
  const maxH = Math.floor(vh*VIEWPORT_FRACTION) - (SAFE_PAD_TOP + SAFE_PAD_BOTTOM);
  const hH = header ? Math.round(header.getBoundingClientRect().height) : 0;
  const hF = footer ? Math.round(footer.getBoundingClientRect().height) : 0;
  return { maxW:Math.max(0,maxW), maxH:Math.max(0,maxH), hH, hF };
}

function _fitBody(aspect, box, forceSquare){
  const usableH = Math.max(0, box.maxH - box.hH - box.hF);
  const usableW = box.maxW;

  // Smooth size lerp
  const ease = 'width 180ms ease, height 180ms ease';
  frameEl.style.transition = ease;

  if (forceSquare){
    const side = Math.floor(Math.max(0, Math.min(usableW, usableH)));
    return { w: side, h: side };
  }
  // width-first; cap by available height
  let w = Math.min(usableW, MAX_CONTENT_W);
  let h = Math.floor(w / Math.max(0.0001, aspect));
  if (h > usableH){ h = usableH; w = Math.floor(h * aspect); }
  return { w: Math.max(0,w), h: Math.max(0,h) };
}

function _applyLayout(panel, header, body, footer, bodyW, bodyH){
  // Lock header/footer heights so panel becomes content-sized
  const hH = header ? Math.round(header.getBoundingClientRect().height) : 0;
  const hF = footer ? Math.round(footer.getBoundingClientRect().height) : 0;
  if (header) header.style.height=_px(hH);
  if (footer) footer.style.height=_px(hF);

  // Panel: simple column, content-sized
  panel.style.display='flex';
  panel.style.flexDirection='column';
  panel.style.alignItems='stretch';
  panel.style.width  = _px(bodyW);
  panel.style.height = _px(bodyH + hH + hF);
  panel.style.transition='width 180ms ease, height 180ms ease, transform 180ms ease';

  if (header){
    header.style.flex='0 0 auto';
    header.style.width='100%';
  }
  _ensurePositioned(body);
  body.style.flex='0 0 auto';
  body.style.width  = _px(bodyW);
  body.style.height = _px(bodyH);
  body.style.overflow='hidden';
  body.style.transition='width 180ms ease, height 180ms ease';

  if (footer){
    footer.style.flex='0 0 auto';
    footer.style.width='100%';
    footer.style.marginTop='auto'; // pins to bottom of panel
  }

  // Frame matches content size (padding provides safety zones)
  frameEl.style.width  = _px(bodyW);
  frameEl.style.height = _px(bodyH + hH + hF);
}

function _neutralisePanelOffsets(panel){
  const prior = {
    transform: panel.style.transform || null,
    translate: panel.style.translate || null,
    left: panel.style.left || null,  top: panel.style.top || null,
    right: panel.style.right || null, bottom: panel.style.bottom || null,
    margin: panel.style.margin || null, transformOrigin: panel.style.transformOrigin || null
  };
  panel.style.transform='none';
  try{ panel.style.translate='0 0'; }catch(e){}
  panel.style.left='0'; panel.style.top='0'; panel.style.right=''; panel.style.bottom='';
  panel.style.margin='0'; panel.style.transformOrigin='50% 50%';
  return prior;
}
function _restorePanelOffsets(panel, prior){
  if (!prior) return;
  if (prior.transform!==null) panel.style.transform=prior.transform; else panel.style.removeProperty('transform');
  if (prior.translate!==null){ try{ panel.style.translate=prior.translate; }catch(e){ panel.style.removeProperty('translate'); } }
  if (prior.left!==null) panel.style.left=prior.left; else panel.style.removeProperty('left');
  if (prior.top!==null) panel.style.top=prior.top; else panel.style.removeProperty('top');
  if (prior.right!==null) panel.style.right=prior.right; else panel.style.removeProperty('right');
  if (prior.bottom!==null) panel.style.bottom=prior.bottom; else panel.style.removeProperty('bottom');
  if (prior.margin!==null) panel.style.margin=prior.margin; else panel.style.removeProperty('margin');
  if (prior.transformOrigin!==null) panel.style.transformOrigin=prior.transformOrigin; else panel.style.removeProperty('transform-origin');
}

export function ensureOverlay(){
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
      try{ if (activePanel && !activePanel.contains(e.target)) zoomOutPanel(activePanel); }catch{}
    });
    document.body.appendChild(overlayEl);
  }
  if (!frameEl || frameEl.parentNode!==overlayEl){
    frameEl = document.createElement('div');
    frameEl.id='zoom-frame';
    Object.assign(frameEl.style,{
      position:'absolute', top:'50%', left:'50%',
      transform:'translate(-50%, -50%)',
      width:'0px', height:'0px',
      pointerEvents:'auto', display:'block', boxSizing:'content-box',
      paddingTop:    `max(${SAFE_PAD_TOP}px, env(safe-area-inset-top))`,
      paddingRight:  `max(${SAFE_PAD_X}px,   env(safe-area-inset-right))`,
      paddingBottom: `max(${SAFE_PAD_BOTTOM}px, env(safe-area-inset-bottom))`,
      paddingLeft:   `max(${SAFE_PAD_X}px,   env(safe-area-inset-left))`
    });
    overlayEl.appendChild(frameEl);
  }
  return overlayEl;
}

export function zoomInPanel(panel, onExit){
  if (!panel) return;
  ensureOverlay();
  if (activePanel && activePanel!==panel) zoomOutPanel(activePanel);

  const header=_findHeader(panel);
  const body  =_findBody(panel);
  const footer=_findFooter(panel);

  // If footer isn't a direct child, hoist it while zoomed (restore later)
  let footerPlaceholder=null, footerParent=null, footerNext=null;
  if (footer && footer.parentNode !== panel){
    footerParent = footer.parentNode; footerNext = footer.nextSibling;
    footerPlaceholder = document.createComment('zoom-footer-placeholder');
    footerParent.insertBefore(footerPlaceholder, footerNext);
    panel.appendChild(footer);
  }

  const placeholder=document.createComment('zoom-placeholder');
  const parent=panel.parentNode, next=panel.nextSibling; parent.insertBefore(placeholder,next);
  const original={ panel:_snap(panel), header:_snap(header), body:_snap(body), footer:_snap(footer) };

  panel.classList.add('toy-zoomed');
  panel.style.margin='0'; panel.style.position='relative';
  panel.style.borderRadius='16px'; panel.style.boxShadow='0 10px 30px rgba(0,0,0,0.5)';
  try{ panel.style.background=getComputedStyle(panel).background||'#1c1c1c'; }catch{}
  const priorOffsets = _neutralisePanelOffsets(panel);

  const aspect = _measureAspect(body);
  const forceSquare = Math.abs(aspect-1)<=SQUARE_EPS && !panel.classList.contains('grid-toy');

  // Pre-size in place
  let box=_contentBox(header, footer);
  let bodySz=_fitBody(aspect, box, forceSquare);
  _applyLayout(panel, header, body, footer, bodySz.w, bodySz.h);

  // Move into overlay (hidden), then reveal
  _openHidden();
  frameEl.replaceChildren(panel);
  activePanel=panel;

  // Snapshot canvases to restore later
  const canvases=[], cvs=body ? body.querySelectorAll('canvas') : [];
  for (let i=0;i<cvs.length;i++){ canvases.push({el:cvs[i], style:_snap(cvs[i])}); cvs[i].style.width='100%'; cvs[i].style.height='100%'; cvs[i].style.display='block'; }

  restoreInfo={ placeholder,parent,original,onExit, header,body,footer,canvases, priorOffsets,
                footerPlaceholder, footerParent, footerNext };

  requestAnimationFrame(()=>{
    box=_contentBox(header, footer);
    bodySz=_fitBody(aspect, box, forceSquare);
    _applyLayout(panel, header, body, footer, bodySz.w, bodySz.h);

    requestAnimationFrame(()=>{
      _reveal();
      _centerCorrect();

      let raf=0;
      const relayout=()=>{
        if (raf) return;
        raf=requestAnimationFrame(()=>{
          const b=_contentBox(header, footer);
          const s=_fitBody(aspect, b, forceSquare);
          _applyLayout(panel, header, body, footer, s.w, s.h);
          _centerCorrect();
          raf=0;
        });
      };
      relayoutHandler=relayout;
      addEventListener('resize', relayout, {passive:true});
      if (window.visualViewport){
        try{ visualViewport.addEventListener('resize', relayout, {passive:true}); }catch{}
        try{ visualViewport.addEventListener('scroll', relayout, {passive:true}); }catch{}
      }
      escHandler=(ev)=>{ if(ev.key==='Escape') zoomOutPanel(panel); };
      addEventListener('keydown', escHandler, {passive:true});
    });
  });
}

export function zoomOutPanel(panel){
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
    _rest(panel, info.original && info.original.panel);
    _rest(info.header, info.original && info.original.header);
    _rest(info.body,   info.original && info.original.body);
    _rest(info.footer, info.original && info.original.footer);

    // If we hoisted the footer, put it back exactly where it was
    try{
      if (info.footer && info.footerParent){
        if (info.footerPlaceholder){
          info.footerParent.insertBefore(info.footer, info.footerPlaceholder);
          info.footerPlaceholder.remove();
        }else{
          info.footerParent.insertBefore(info.footer, info.footerNext||null);
        }
      }
    }catch{}

    if (Array.isArray(info.canvases)){
      for (let i=0;i<info.canvases.length;i++){ const c=info.canvases[i]; _rest(c.el, c.style); }
    }

    const {placeholder,parent}=info;
    if (placeholder && parent){ parent.insertBefore(panel, placeholder); parent.removeChild(placeholder); }

    _close();
    activePanel=null; restoreInfo=null;

    try{ void parent && parent.offsetHeight; }catch{}
    setTimeout(()=>{ try{ dispatchEvent(new Event('resize')); }catch{} }, 0);

    if (typeof info.onExit==='function'){ try{ info.onExit(); }catch{} }
  }catch(e){
    console.error('[zoom-overlay] zoomOut failed', e);
    try{ _close(); }catch{}
  }
}

// Make sure the overlay skeleton exists as soon as the module loads.
try{ ensureOverlay(); }catch{}
