// zoom-overlay.js (ES module, <300 lines)
// Advanced overlay: no ancestor transforms (good for pointer math),
// centers via CSS Grid, neutralizes any panel-local offsets while zoomed,
// grid kept wide (clamped height), footer fixed at bottom row, full restore on exit.
// Emits `toy-zoom` events (enter/exit).

let overlayEl=null, frameEl=null, activePanel=null, restoreInfo=null;
let escHandler=null, relayoutHandler=null, roFrame=null, roParts=null;

const VIEWPORT_FRACTION = 0.96;
const MAXW_SQUARE = 1200;
const MAXW_GRID   = 960;
const GRID_MAX_VH_FRAC = 0.48; // cap grid body height to ~half the viewport
const SAFE_PAD_X=28, SAFE_PAD_TOP=28, SAFE_PAD_BOTTOM=64;
const SQUARE_EPS = 0.03;

const _px = n => (Math.round(n)||0)+'px';
const _snap = el => el ? (el.getAttribute('style')||'') : null;
const _rest = (el,str)=>{ if(!el)return; if(str==null) el.removeAttribute('style'); else el.setAttribute('style',str); };
const _vsize=()=>{
  const vv=window.visualViewport;
  if (vv && vv.width && vv.height) return {vw:vv.width|0, vh:vv.height|0};
  const vw=Math.max(document.documentElement.clientWidth, window.innerWidth||0);
  const vh=Math.max(document.documentElement.clientHeight, window.innerHeight||0);
  return {vw, vh};
};

const _findHeader = p=> p.querySelector('.toy-header,[data-role="header"]');
const _findBody   = p=> p.querySelector('.toy-body,[data-role="body"]') || p;
function _findFooter(panel){
  return panel.querySelector('.toy-volwrap') ||
         panel.querySelector('[data-role="controls-bottom"]') ||
         panel.querySelector('.toy-controls-bottom') ||
         panel.querySelector('.toy-footer');
}

function _isGrid(panel){
  if (!panel) return false;
  if (panel.querySelector('.grid-canvas')) return true;
  // Fallbacks: dataset or any descendant with class containing "grid"
  const dt = String(panel.dataset?.toy||'').toLowerCase();
  if (dt.includes('grid')) return true;
  const any = panel.querySelector('[class*="grid"], [data-grid], [data-kind="grid"]');
  return !!any;
}
const _stepsOf = p=>{ const n=Number(p?.dataset?.steps); return (Number.isFinite(n)&&n>1)?Math.min(64,Math.max(2,Math.floor(n))):16; };

function _contentBox(header, footer, panel){
  const {vw,vh}=_vsize();
  const frac = Number(panel?.dataset?.zoomFrac)||VIEWPORT_FRACTION;
  const cap  = _isGrid(panel) ? (Number(panel?.dataset?.zoomMaxw)||MAXW_GRID) : MAXW_SQUARE;
  const maxW = Math.min(Math.floor(vw*frac) - SAFE_PAD_X*2, cap);
  const maxH = Math.floor(vh*frac) - (SAFE_PAD_TOP + SAFE_PAD_BOTTOM);
  const hH = header ? (header.getBoundingClientRect().height|0) : 0;
  const hF = footer ? (footer.getBoundingClientRect().height|0) : 0;
  return { maxW:Math.max(0,maxW), maxH:Math.max(0,maxH), hH, hF, vh:Math.floor(vh) };
}
function _gridHFromW(w,steps){ const pad=10, top=6, bot=6; const cell=Math.max(20, Math.floor((w-pad*2)/steps)); return top + Math.max(24,cell) + bot; }
function _measureAspect(body){
  const cv=body.querySelector('canvas,svg');
  if (cv){ const r=cv.getBoundingClientRect(); const cw=Math.max(1,r.width|0), ch=Math.max(1,r.height|0); if (cw>0&&ch>0) return cw/ch; }
  const r=body.getBoundingClientRect(); return Math.max(1,r.width|0)/Math.max(1,r.height|0);
}
function _fitBody(aspect, box, forceSquare, panel){
  const usableH = Math.max(0, box.maxH - box.hH - box.hF);
  const usableW = box.maxW;
  if (_isGrid(panel)){
    const steps=_stepsOf(panel);
    let w=Math.min(usableW, MAXW_GRID);
    let h=_gridHFromW(w, steps);
    // Clamp grid height to not dominate viewport
    const maxGridH = Math.floor(box.vh * GRID_MAX_VH_FRAC);
    h = Math.min(h, Math.max(0, usableH), maxGridH);
    return { w:Math.max(0,w), h:Math.max(0,h) };
  }
  if (forceSquare){
    const side = Math.floor(Math.max(0, Math.min(usableW, usableH)));
    return { w:side, h:side };
  }
  let w=Math.min(usableW, MAXW_SQUARE);
  let h=Math.floor(w/Math.max(0.0001, aspect));
  if (h > usableH){ h=usableH; w=Math.floor(h*aspect); }
  return { w:Math.max(0,w), h:Math.max(0,h) };
}

// Prepare panel so header/footer report real heights before measure
function _bootstrapForMeasure(panel, header, footer){
  panel.style.display='grid';
  panel.style.gridTemplateRows='auto 0 auto';
  panel.style.gridTemplateColumns='1fr';
  const box=_contentBox(header, footer, panel);
  panel.style.width=_px(box.maxW);
  void panel.offsetHeight;
}

function _applyLayout(panel, header, body, footer, bodyW, bodyH){
  panel.style.display='grid';
  panel.style.gridTemplateRows='auto '+_px(bodyH)+' auto';
  panel.style.gridTemplateColumns='1fr';
  panel.style.width=_px(bodyW);
  const hH=header?(header.getBoundingClientRect().height|0):0;
  const hF=footer?(footer.getBoundingClientRect().height|0):0;
  panel.style.height=_px(bodyH+hH+hF);
  panel.style.borderRadius='16px';
  panel.style.boxShadow='0 10px 30px rgba(0,0,0,0.5)';
  panel.style.boxSizing='border-box';

  if (header){ header.style.gridRow='1'; header.style.alignSelf='start'; header.style.width='100%'; header.style.zIndex='2'; }
  body.style.gridRow='2'; body.style.alignSelf='center'; body.style.justifySelf='center';
  body.style.width=_px(bodyW); body.style.height=_px(bodyH); body.style.overflow='hidden'; body.style.position='relative'; body.style.zIndex='0'; body.style.boxSizing='border-box';
  if (footer){
    footer.style.gridRow='3'; footer.style.alignSelf='start'; footer.style.width='100%';
    footer.style.pointerEvents='auto'; footer.style.zIndex='3';
  }
}

function _normalizeFooter(panel){
  const vw = panel.querySelector('.toy-volwrap');
  const snapVw=_snap(vw);
  if (vw){
    vw.style.position='static';
    vw.style.left=''; vw.style.right=''; vw.style.top=''; vw.style.bottom='';
    vw.style.width='100%'; vw.style.maxWidth='100%';
    vw.style.pointerEvents='auto'; vw.style.margin='0'; vw.style.gridRow='3'; vw.style.zIndex='4';
  }
  panel.querySelectorAll('input,button').forEach(el=>{ el.style.pointerEvents='auto'; });
  return { snapVw };
}

// Neutralize any panel-local offsets (transform/margins) while zoomed
function _neutraliseOffsets(el){
  const prior={
    transform: el.style.transform||null,
    translate: el.style.translate||null,
    margin: el.style.margin||null,
    left: el.style.left||null, top: el.style.top||null, right: el.style.right||null, bottom: el.style.bottom||null,
    transformOrigin: el.style.transformOrigin||null
  };
  el.style.transform='none'; try{ el.style.translate='0 0'; }catch{}
  el.style.margin='0'; el.style.left=''; el.style.top=''; el.style.right=''; el.style.bottom='';
  el.style.transformOrigin='50% 50%';
  return prior;
}
function _restoreOffsets(el, prior){
  if(!prior) return;
  (prior.transform!==null)? el.style.transform=prior.transform : el.style.removeProperty('transform');
  try{ (prior.translate!==null)? el.style.translate=prior.translate : el.style.removeProperty('translate'); }catch{}
  (prior.margin!==null)? el.style.margin=prior.margin : el.style.removeProperty('margin');
  (prior.left!==null)? el.style.left=prior.left : el.style.removeProperty('left');
  (prior.top!==null)? el.style.top=prior.top : el.style.removeProperty('top');
  (prior.right!==null)? el.style.right=prior.right : el.style.removeProperty('right');
  (prior.bottom!==null)? el.style.bottom=prior.bottom : el.style.removeProperty('bottom');
  (prior.transformOrigin!==null)? el.style.transformOrigin=prior.transformOrigin : el.style.removeProperty('transform-origin');
}

export function ensureOverlay(){
  if (overlayEl) return overlayEl;
  overlayEl = document.getElementById('zoom-overlay');
  if (!overlayEl){
    overlayEl=document.createElement('div'); overlayEl.id='zoom-overlay';
    Object.assign(overlayEl.style,{
      position:'fixed', inset:'0', display:'none', zIndex:'9999',
      background:'rgba(0,0,0,0.35)', backdropFilter:'blur(2px)',
      pointerEvents:'none', overflow:'hidden', boxSizing:'border-box'
    });
    overlayEl.addEventListener('pointerdown', (e)=>{
      try{ if (activePanel && !activePanel.contains(e.target)) zoomOutPanel(activePanel); }catch{}
    });
    document.body.appendChild(overlayEl);
  }
  if (!frameEl || frameEl.parentNode!==overlayEl){
    frameEl=document.createElement('div'); frameEl.id='zoom-frame';
    Object.assign(frameEl.style,{
      position:'absolute', inset:'0',
      display:'grid', placeItems:'center',   // pure centering, no transforms
      width:'100%', height:'100%',
      pointerEvents:'auto', boxSizing:'border-box',
      paddingTop:`max(${SAFE_PAD_TOP}px, env(safe-area-inset-top))`,
      paddingRight:`max(${SAFE_PAD_X}px, env(safe-area-inset-right))`,
      paddingBottom:`max(${SAFE_PAD_BOTTOM}px, env(safe-area-inset-bottom))`,
      paddingLeft:`max(${SAFE_PAD_X}px, env(safe-area-inset-left))`
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
  const body=_findBody(panel);
  const footer=_findFooter(panel);

  const placeholder=document.createComment('zoom-placeholder');
  const parent=panel.parentNode, next=panel.nextSibling; parent.insertBefore(placeholder,next);
  const original={ panel:_snap(panel), header:_snap(header), body:_snap(body), footer:_snap(footer) };

  let footerPH=null;
  if (footer && footer.parentNode!==panel){
    footerPH = { parent: footer.parentNode, next: footer.nextSibling };
  }

  panel.classList.add('toy-zoomed');
  overlayEl.style.display='block'; overlayEl.style.pointerEvents='none'; overlayEl.style.visibility='hidden';
  frameEl.replaceChildren(panel);
  activePanel=panel;

  const priorOffsets=_neutraliseOffsets(panel);
  if (footer && footer.parentNode!==panel) panel.appendChild(footer);

  _bootstrapForMeasure(panel, header, footer);
  const aspect=_measureAspect(body);
  const forceSquare = Math.abs(aspect-1)<=SQUARE_EPS && !_isGrid(panel);
  const box=_contentBox(header, footer, panel);
  const bodySz=_fitBody(aspect, box, forceSquare, panel);
  _applyLayout(panel, header, body, footer, bodySz.w, bodySz.h);
  const volSnap=_normalizeFooter(panel);

  const canvases=[], cvs=body?body.querySelectorAll('canvas,svg'):[];
  for (let i=0;i<cvs.length;i++){ canvases.push({el:cvs[i], style:_snap(cvs[i])}); const c=cvs[i]; c.style.display='block'; c.style.width='100%'; c.style.height='100%'; c.style.zIndex='0'; }

  restoreInfo={ placeholder,parent,original,onExit, header,body,footer, canvases, volSnap, footerPH, priorOffsets };

  overlayEl.style.pointerEvents='auto'; overlayEl.style.visibility='visible';
  try{ panel.dispatchEvent(new CustomEvent('toy-zoom', { detail:{ zoomed:true }, bubbles:true })); }catch{}
  try{ window.dispatchEvent(new Event('resize')); }catch{}

  requestAnimationFrame(()=> requestAnimationFrame(()=>{
    const s=_fitBody(aspect, _contentBox(header, footer, panel), forceSquare, panel);
    _applyLayout(panel, header, body, footer, s.w, s.h);
  }));

  const relayout=()=>{
    const s=_fitBody(aspect, _contentBox(header, footer, panel), forceSquare, panel);
    _applyLayout(panel, header, body, footer, s.w, s.h);
  };
  relayoutHandler=relayout;
  addEventListener('resize', relayout, {passive:true});
  if (window.visualViewport){
    try{ visualViewport.addEventListener('resize', relayout, {passive:true}); }catch{}
    try{ visualViewport.addEventListener('scroll', relayout, {passive:true}); }catch{}
  }
  try{
    if (roFrame) roFrame.disconnect();
    roFrame=new ResizeObserver(relayout); roFrame.observe(frameEl);
    if (roParts) roParts.disconnect();
    roParts=new ResizeObserver(relayout); if (header) roParts.observe(header); if (footer) roParts.observe(footer);
  }catch{}

  escHandler=(ev)=>{ if(ev.key==='Escape') zoomOutPanel(panel); };
  addEventListener('keydown', escHandler, {passive:true});
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
    try{ if (roFrame){ roFrame.disconnect(); roFrame=null; } }catch{}
    try{ if (roParts){ roParts.disconnect(); roParts=null; } }catch{}

    if (Array.isArray(info.canvases)){ for (const c of info.canvases){ _rest(c.el, c.style); } }

    try{
      if (info.footer && info.footerPH && info.footerPH.parent){
        info.footerPH.parent.insertBefore(info.footer, info.footerPH.next||null);
      }
    }catch{}

    _rest(panel, info.original && info.original.panel);
    _rest(info.header, info.original && info.original.header);
    _rest(info.body,   info.original && info.original.body);
    _rest(info.footer, info.original && info.original.footer);
    if (info.volSnap){ const vw=panel.querySelector('.toy-volwrap'); if(vw) _rest(vw, info.volSnap.snapVw||info.volSnap); }
    _restoreOffsets(panel, info.priorOffsets);

    const {placeholder,parent}=info;
    if (placeholder && parent){ parent.insertBefore(panel, placeholder); parent.removeChild(placeholder); }

    panel.classList.remove('toy-zoomed');
    overlayEl.style.display='none'; overlayEl.style.pointerEvents='none'; overlayEl.style.visibility='hidden';
    frameEl.replaceChildren();
    activePanel=null; restoreInfo=null;

    try{ panel.dispatchEvent(new CustomEvent('toy-zoom', { detail:{ zoomed:false }, bubbles:true })); }catch{}
    try{ window.dispatchEvent(new Event('resize')); }catch{}
  }catch(e){
    console.error('[zoom-overlay] zoomOut failed', e);
    try{ overlayEl.style.display='none'; }catch{}
    try{ frameEl.replaceChildren(); }catch{}
    activePanel=null; restoreInfo=null;
  }
}

try{ ensureOverlay(); }catch{}
