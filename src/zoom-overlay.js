// zoom-overlay.js (ES module, <300 lines)
// Instant Advanced overlay with: CSS-centered frame, first-frame-accurate sizing,
// grid kept wide (not full-height), single footer, and temporary hiding of stray
// mute/background controls so nothing sits in the middle.
// Exports: ensureOverlay, zoomInPanel, zoomOutPanel

let overlayEl=null, frameEl=null, activePanel=null, restoreInfo=null;
let escHandler=null, relayoutHandler=null, ro=null;

const VIEWPORT_FRACTION = 0.96;
const MAX_CONTENT_W_SQUARE = 1200;
const MAX_CONTENT_W_GRID   = 960;   // grids feel better narrower
const SAFE_PAD_X        = 28;
const SAFE_PAD_TOP      = 28;
const SAFE_PAD_BOTTOM   = 64;
const SQUARE_EPS        = 0.03;

const _px = n => (Math.round(n)||0) + 'px';
const _vsize = () => {
  const vv=window.visualViewport;
  if (vv && vv.width && vv.height) return {vw:Math.floor(vv.width), vh:Math.floor(vv.height)};
  const vw=Math.max(document.documentElement.clientWidth, window.innerWidth||0);
  const vh=Math.max(document.documentElement.clientHeight, window.innerHeight||0);
  return {vw, vh};
};
const _openHidden = ()=>{ overlayEl.style.display='block'; overlayEl.style.pointerEvents='none'; overlayEl.style.backdropFilter='none'; overlayEl.style.visibility='hidden'; };
const _reveal     = ()=>{ overlayEl.style.pointerEvents='auto'; overlayEl.style.backdropFilter='blur(2px)'; overlayEl.style.visibility='visible'; };
const _close      = ()=>{ overlayEl.style.display='none'; overlayEl.style.pointerEvents='none'; overlayEl.style.backdropFilter='none'; overlayEl.style.visibility='hidden'; frameEl.replaceChildren(); };
const _snap       = el=> el ? (el.getAttribute('style')||'') : null;
const _rest       = (el,str)=>{ if(!el)return; if(str==null) el.removeAttribute('style'); else el.setAttribute('style',str); };
const _ensurePositioned = el=>{ if(!el)return; const cs=getComputedStyle(el); if(cs.position==='static') el.style.position='relative'; };

const _findHeader = panel => panel.querySelector('.toy-header,[data-role="header"]');
const _findBody   = panel => panel.querySelector('.toy-body,[data-role="body"]') || panel;

// Controls cluster: use a single wrapper that contains slider + mute + background toggle
function _controlsCandidates(panel){
  const sels = [
    '[data-role="controls-bottom"]','.toy-controls-bottom','.toy-footer','.controls-bottom','.controls',
    '[data-role="controls"]','[data-role="volume"]','.toy-volume','.volume','.slider-wrap','.slider',
    'input[type="range"]',
    '.toy-mute','[data-role="mute"]','[aria-label="Mute"]','.mute',
    '.toy-bg','[data-role="background"]','.background-toggle','.bg','.btn-bg'
  ];
  return Array.from(panel.querySelectorAll(sels.join(',')));
}
function _lowestCommonAncestor(nodes, root){
  if (!nodes.length) return null;
  const paths = nodes.map(n => {
    const a=[]; for (let el=n; el && el!==document && el!==root.parentNode; el=el.parentElement) a.push(el);
    return a;
  });
  const first=paths[0];
  for (let i=0;i<first.length;i++){
    const cand=first[i];
    if (cand===root) return cand;
    let ok=true;
    for (let j=1;j<paths.length;j++){
      if (!paths[j].includes(cand)){ ok=false; break; }
    }
    if (ok) return cand;
  }
  return root;
}
function _findFooterCluster(panel){
  const explicitFooter = panel.querySelector('.toy-controls-bottom, .toy-footer, [data-role="controls-bottom"], [data-role="volume"], .toy-volume');
  const cands = _controlsCandidates(panel);
  if (explicitFooter){
    const hasControl = cands.some(n=> explicitFooter.contains(n) || n===explicitFooter);
    if (hasControl) return { footerNode: explicitFooter, placeholder:null, isCluster:false };
  }
  const key = cands.filter(n=> n.matches('input[type="range"], .toy-mute, [data-role="mute"], [aria-label="Mute"], .mute, .toy-bg, [data-role="background"], .background-toggle, .bg, .btn-bg'));
  if (!key.length){
    if (explicitFooter) return { footerNode: explicitFooter, placeholder:null, isCluster:false };
    return { footerNode: null, placeholder: null, isCluster:false };
  }
  let cluster = _lowestCommonAncestor(key, panel);
  if (cluster===panel) cluster = key[0].parentElement || key[0];
  const ph = document.createComment('zoom-controls-cluster');
  const parent = cluster.parentNode, next = cluster.nextSibling;
  parent.insertBefore(ph, next);
  return { footerNode: cluster, placeholder:{parent, next, ph}, isCluster:true };
}

// Sizing helpers
const _isGrid  = panel => !!panel.querySelector('.grid-canvas') || /grid/i.test(String(panel.dataset?.toy||''));
const _stepsOf = panel => {
  const n = Number(panel.dataset?.steps);
  if (Number.isFinite(n) && n>1) return Math.min(64, Math.max(2, Math.floor(n)));
  return 16;
};
function _contentBox(header, footer, panel){
  const {vw,vh}=_vsize();
  const fraction = Number(panel?.dataset?.zoomFrac)||VIEWPORT_FRACTION;
  const maxWCap = _isGrid(panel) ? (Number(panel?.dataset?.zoomMaxw)||MAX_CONTENT_W_GRID) : MAX_CONTENT_W_SQUARE;
  const maxW = Math.min(Math.floor(vw*fraction) - SAFE_PAD_X*2, maxWCap);
  const maxH = Math.floor(vh*fraction) - (SAFE_PAD_TOP + SAFE_PAD_BOTTOM);
  const hH = header ? Math.round(header.getBoundingClientRect().height) : 0;
  const hF = footer ? Math.round(footer.getBoundingClientRect().height) : 0;
  return { maxW:Math.max(0,maxW), maxH:Math.max(0,maxH), hH, hF };
}
// Grid: height from width & steps (wide rectangle, not full-height)
function _gridBodyFromWidth(bodyW, steps){
  const pad = 10, top=6, bot=6;
  const cellW  = Math.max(20, Math.floor((bodyW - pad*2) / steps));
  return top + Math.max(24, cellW) + bot;
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
function _fitBody(aspect, box, forceSquare, panel){
  const usableH = Math.max(0, box.maxH - box.hH - box.hF);
  const usableW = box.maxW;
  if (_isGrid(panel)){
    const steps = _stepsOf(panel);
    let w = Math.min(usableW, MAX_CONTENT_W_GRID);
    let h = _gridBodyFromWidth(w, steps);
    if (h > usableH){
      const cell = Math.max(20, Math.floor(Math.max(24, usableH - 6 - 6)));
      w = Math.max(0, 20 + 20 + steps * cell);
      if (w > usableW) w = usableW;
      h = Math.min(usableH, _gridBodyFromWidth(w, steps));
    }
    return { w: Math.max(0,w), h: Math.max(0,h) };
  }
  if (forceSquare){
    const side = Math.floor(Math.max(0, Math.min(usableW, usableH)));
    return { w: side, h: side };
  }
  let w = Math.min(usableW, MAX_CONTENT_W_SQUARE);
  let h = Math.floor(w / Math.max(0.0001, aspect));
  if (h > usableH){ h = usableH; w = Math.floor(h * aspect); }
  return { w: Math.max(0,w), h: Math.max(0,h) };
}

// Layout
function _applyLayout(panel, header, body, footer, bodyW, bodyH){
  panel.style.display='grid';
  panel.style.gridTemplateRows='auto ' + _px(bodyH) + ' auto';
  panel.style.gridTemplateColumns='1fr';
  panel.style.width  = _px(bodyW);
  const hH = header? (header.getBoundingClientRect().height|0) : 0;
  const hF = footer? (footer.getBoundingClientRect().height|0) : 0;
  panel.style.height = _px(bodyH + hH + hF);
  panel.style.borderRadius='16px';
  panel.style.boxShadow='0 10px 30px rgba(0,0,0,0.5)';

  if (header){ header.style.gridRow='1'; header.style.alignSelf='start'; header.style.width='100%'; }
  _ensurePositioned(body);
  body.style.gridRow='2'; body.style.alignSelf='center'; body.style.justifySelf='center';
  body.style.width=_px(bodyW); body.style.height=_px(bodyH); body.style.overflow='hidden';

  if (footer){ footer.style.gridRow='3'; footer.style.alignSelf='end'; footer.style.width='100%'; }

  // Frame dims for centering (frame is CSS-centered so sizes only)
  frameEl.style.maxWidth = '100%';
  frameEl.style.width  = 'auto';
  frameEl.style.height = 'auto';
}

// Transform neutralisation
function _neutralisePanelOffsets(panel){
  const prior = {
    transform: panel.style.transform || null,
    translate: panel.style.translate || null,
    left: panel.style.left || null,  top: panel.style.top || null,
    right: panel.style.right || null, bottom: panel.style.bottom || null,
    margin: panel.style.margin || null, transformOrigin: panel.style.transformOrigin || null
  };
  panel.style.transform='none';
  try{ panel.style.translate='0 0'; }catch{}
  panel.style.left='0'; panel.style.top='0'; panel.style.right=''; panel.style.bottom='';
  panel.style.margin='0'; panel.style.transformOrigin='50% 50%';
  return prior;
}
function _restorePanelOffsets(panel, prior){
  if (!prior) return;
  if (prior.transform!==null) panel.style.transform=prior.transform; else panel.style.removeProperty('transform');
  if (prior.translate!==null){ try{ panel.style.translate=prior.translate; }catch{ panel.style.removeProperty('translate'); } }
  if (prior.left!==null) panel.style.left=prior.left; else panel.style.removeProperty('left');
  if (prior.top!==null) panel.style.top=prior.top; else panel.style.removeProperty('top');
  if (prior.right!==null) panel.style.right=prior.right; else panel.style.removeProperty('right');
  if (prior.bottom!==null) panel.style.bottom=prior.bottom; else panel.style.removeProperty('bottom');
  if (prior.margin!==null) panel.style.margin=prior.margin; else panel.style.removeProperty('margin');
  if (prior.transformOrigin!==null) panel.style.transformOrigin=prior.transformOrigin; else panel.style.removeProperty('transform-origin');
}

// Public API
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
      position:'absolute', inset:'0',
      display:'grid', placeItems:'center',
      width:'100%', height:'100%',
      pointerEvents:'auto', boxSizing:'border-box',
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
  const cluster=_findFooterCluster(panel);
  const footer=cluster.footerNode;

  const placeholder=document.createComment('zoom-placeholder');
  const parent=panel.parentNode, next=panel.nextSibling; parent.insertBefore(placeholder,next);
  const original={ panel:_snap(panel), header:_snap(header), body:_snap(body), footer:_snap(footer) };

  panel.classList.add('toy-zoomed');
  panel.style.margin='0'; panel.style.position='relative';
  try{ panel.style.background=getComputedStyle(panel).background||'#1c1c1c'; }catch{}
  const priorOffsets = _neutralisePanelOffsets(panel);

  // Move to overlay first (hidden) for accurate first-frame measures
  _openHidden();
  frameEl.replaceChildren(panel);
  activePanel=panel;

  // Hide stray mute/background not in footer/volwrap during zoom (restore later)
  const hiddenStrays=[];
  try{
    const keep = new Set([footer, panel.querySelector('.toy-volwrap')].filter(Boolean));
    const straySel = ['.toy-mute','[data-role="mute"]','[aria-label="Mute"]','.mute','.toy-bg','[data-role="background"]','.background-toggle','.bg','.btn-bg'].join(',');
    panel.querySelectorAll(straySel).forEach(n=>{
      const ok = Array.from(keep).some(k => k && (k===n || k.contains(n)));
      if (!ok){
        hiddenStrays.push({el:n, style:_snap(n)});
        n.style.display='none';
      }
    });
  }catch{}

  // If we found a controls cluster that's not already the footer of the panel, append it as last row
  if (footer && footer.parentNode!==panel){
    panel.appendChild(footer);
  }

  // Compute sizes and layout
  const aspect = _measureAspect(body);
  const forceSquare = Math.abs(aspect-1)<=SQUARE_EPS && !_isGrid(panel);
  let box=_contentBox(header, footer, panel);
  let bodySz=_fitBody(aspect, box, forceSquare, panel);
  _applyLayout(panel, header, body, footer, bodySz.w, bodySz.h);

  // Snapshot canvases
  const canvases=[], cvs=body ? body.querySelectorAll('canvas') : [];
  for (let i=0;i<cvs.length;i++){ canvases.push({el:cvs[i], style:_snap(cvs[i])}); cvs[i].style.width='100%'; cvs[i].style.height='100%'; cvs[i].style.display='block'; }

  restoreInfo={ placeholder,parent,original,onExit, header,body,footer, priorOffsets, canvases,
                clusterPlaceholder: cluster.placeholder, hiddenStrays };

  // Reveal & dispatch zoom event for panels that listen (e.g., toyui volume placer)
  _reveal();
  try{ panel.dispatchEvent(new CustomEvent('toy-zoom', { detail:{ zoomed:true }, bubbles:true })); }catch{}

  // Post-reveal calibration to settle fonts/layout
  requestAnimationFrame(()=> requestAnimationFrame(()=>{
    const s=_fitBody(aspect, _contentBox(header, footer, panel), forceSquare, panel);
    _applyLayout(panel, header, body, footer, s.w, s.h);
  }));

  // Relayout on viewport changes
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
  try{ if (ro) ro.disconnect(); ro = new ResizeObserver(relayout); ro.observe(frameEl); }catch{}

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
    try{ if (ro){ ro.disconnect(); ro=null; } }catch{}

    // Unhide any temporarily hidden strays
    try{
      if (Array.isArray(info.hiddenStrays)){
        info.hiddenStrays.forEach(s => _rest(s.el, s.style));
      }
    }catch{}

    panel.classList.remove('toy-zoomed');
    _rest(panel, info.original && info.original.panel);
    _rest(info.header, info.original && info.original.header);
    _rest(info.body,   info.original && info.original.body);
    _rest(info.footer, info.original && info.original.footer);

    // Restore controls cluster
    try{
      const ph = info.clusterPlaceholder;
      const footer = info.footer;
      if (ph && ph.parent && footer){
        ph.parent.insertBefore(footer, ph.next || null);
        if (ph.ph) ph.ph.remove();
      }
    }catch{}

    if (Array.isArray(info.canvases)){
      for (let i=0;i<info.canvases.length;i++){ const c=info.canvases[i]; _rest(c.el, c.style); }
    }

    const {placeholder,parent}=info;
    if (placeholder && parent){ parent.insertBefore(panel, placeholder); parent.removeChild(placeholder); }

    // Dispatch zoom=false for listeners (e.g., toyui)
    try{ panel.dispatchEvent(new CustomEvent('toy-zoom', { detail:{ zoomed:false }, bubbles:true })); }catch{}

    _close();
    activePanel=null; restoreInfo=null;
  }catch(e){
    console.error('[zoom-overlay] zoomOut failed', e);
    try{ _close(); }catch{}
  }
}

// Ensure overlay skeleton exists after import
try{ ensureOverlay(); }catch{}
