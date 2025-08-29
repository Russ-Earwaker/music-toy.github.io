// zoom-overlay.js (ES module, <300 lines)
// Instant Advanced overlay: CSS-centered, accurate first-frame sizing, grid stays wide,
// volume footer is top-aligned to body (not flush to panel bottom), and controls cluster moved as one.
// Exports: ensureOverlay, zoomInPanel, zoomOutPanel

let overlayEl=null, frameEl=null, activePanel=null, restoreInfo=null;
let escHandler=null, relayoutHandler=null, ro=null;

const VIEWPORT_FRACTION = 0.96;
const MAXW_SQUARE = 1200;
const MAXW_GRID   = 960;
const SAFE_PAD_X=28, SAFE_PAD_TOP=28, SAFE_PAD_BOTTOM=64;
const SQUARE_EPS=0.03;

const _px=n=>(Math.round(n)||0)+'px';
const _vsize=()=>{
  const vv=window.visualViewport;
  if(vv&&vv.width&&vv.height) return {vw:vv.width|0, vh:vv.height|0};
  const vw=Math.max(document.documentElement.clientWidth, window.innerWidth||0);
  const vh=Math.max(document.documentElement.clientHeight, window.innerHeight||0);
  return {vw,vh};
};
const _openHidden=()=>{ overlayEl.style.display='block'; overlayEl.style.pointerEvents='none'; overlayEl.style.visibility='hidden'; };
const _reveal=()=>{ overlayEl.style.pointerEvents='auto'; overlayEl.style.visibility='visible'; };
const _close=()=>{ overlayEl.style.display='none'; overlayEl.style.pointerEvents='none'; overlayEl.style.visibility='hidden'; frameEl.replaceChildren(); };
const _snap=el=>el?(el.getAttribute('style')||''):null;
const _rest=(el,str)=>{ if(!el)return; if(str==null) el.removeAttribute('style'); else el.setAttribute('style',str); };

const _findHeader = p=> p.querySelector('.toy-header,[data-role="header"]');
const _findBody   = p=> p.querySelector('.toy-body,[data-role="body"]') || p;

function _controlsCandidates(p){
  const sels=[
    '.toy-volwrap','[data-role="controls-bottom"]','.toy-controls-bottom','.toy-footer','.controls-bottom',
    '[data-role="controls"]','[data-role="volume"]','.toy-volume','.volume','.slider-wrap','.slider',
    'input[type="range"]','button[title="Mute"]',
    '.toy-mute','[data-role="mute"]','[aria-label="Mute"]','.mute',
    '.toy-bg','[data-role="background"]','.background-toggle','.bg','.btn-bg',
    '.volume-bg','.volume-track','.vol-bg','.toy-volbg'
  ];
  return Array.from(p.querySelectorAll(sels.join(',')));
}
function _lca(nodes, root){
  if(!nodes.length) return null;
  const paths=nodes.map(n=>{const a=[];for(let el=n;el&&el!==document&&el!==root.parentNode;el=el.parentElement)a.push(el);return a;});
  const first=paths[0];
  for(let i=0;i<first.length;i++){
    const cand=first[i]; if(cand===root) return cand;
    let ok=true; for(let j=1;j<paths.length;j++){ if(!paths[j].includes(cand)){ ok=false; break; } }
    if(ok) return cand;
  }
  return root;
}
function _findFooterCluster(panel){
  const explicit = panel.querySelector('.toy-volwrap, .toy-controls-bottom, .toy-footer, [data-role="controls-bottom"], [data-role="volume"], .toy-volume');
  const cands = _controlsCandidates(panel);
  if(explicit){
    const has = cands.some(n=> explicit.contains(n) || n===explicit);
    if(has) return { footer: explicit, ph:null };
  }
  const key = cands.filter(n=> n.matches('input[type="range"], button[title="Mute"], .toy-mute,[data-role="mute"],[aria-label="Mute"], .toy-bg,[data-role="background"],.background-toggle,.bg,.btn-bg,.volume-bg,.volume-track,.vol-bg,.toy-volbg'));
  if(!key.length) return { footer: explicit||null, ph:null };
  let cluster=_lca(key, panel);
  if(cluster===panel) cluster = key[0].parentElement || key[0];
  const ph = document.createComment('zoom-controls-cluster');
  cluster.parentNode.insertBefore(ph, cluster.nextSibling);
  return { footer: cluster, ph };
}

const _isGrid = p=> !!p.querySelector('.grid-canvas') || /grid/i.test(String(p.dataset?.toy||''));
const _stepsOf = p=>{ const n=Number(p.dataset?.steps); return (Number.isFinite(n)&&n>1)?Math.min(64,Math.max(2,Math.floor(n))):16; };

function _contentBox(header, footer, panel){
  const {vw,vh}=_vsize();
  const frac = Number(panel?.dataset?.zoomFrac)||VIEWPORT_FRACTION;
  const maxCap = _isGrid(panel) ? (Number(panel?.dataset?.zoomMaxw)||MAXW_GRID) : MAXW_SQUARE;
  const maxW = Math.min(Math.floor(vw*frac) - SAFE_PAD_X*2, maxCap);
  const maxH = Math.floor(vh*frac) - (SAFE_PAD_TOP + SAFE_PAD_BOTTOM);
  const hH = header? Math.round(header.getBoundingClientRect().height):0;
  const hF = footer? Math.round(footer.getBoundingClientRect().height):0;
  return { maxW:Math.max(0,maxW), maxH:Math.max(0,maxH), hH, hF };
}
function _gridHFromW(bodyW, steps){ const pad=10, top=6, bot=6; const cellW=Math.max(20,Math.floor((bodyW-pad*2)/steps)); return top+Math.max(24,cellW)+bot; }
function _measureAspect(body){
  const cv=body.querySelector('canvas');
  if(cv){ const r=cv.getBoundingClientRect(); const cw=Math.max(1,r.width|0), ch=Math.max(1,r.height|0); if(cw>0&&ch>0) return cw/ch; }
  const r=body.getBoundingClientRect(); return Math.max(1,r.width|0)/Math.max(1,r.height|0);
}
function _fitBody(aspect, box, forceSquare, panel){
  const usableH = Math.max(0, box.maxH - box.hH - box.hF);
  const usableW = box.maxW;
  if(_isGrid(panel)){
    const steps=_stepsOf(panel);
    let w=Math.min(usableW, MAXW_GRID);
    let h=_gridHFromW(w, steps);
    if(h>usableH){
      const cell=Math.max(20, Math.floor(Math.max(24, usableH - 6 - 6)));
      w=Math.max(0, 20+20+steps*cell);
      if(w>usableW) w=usableW;
      h=Math.min(usableH, _gridHFromW(w, steps));
    }
    return {w:Math.max(0,w), h:Math.max(0,h)};
  }
  if(forceSquare){ const side=Math.floor(Math.max(0,Math.min(usableW,usableH))); return {w:side,h:side}; }
  let w=Math.min(usableW, MAXW_SQUARE);
  let h=Math.floor(w/Math.max(0.0001, aspect));
  if(h>usableH){ h=usableH; w=Math.floor(h*aspect); }
  return {w:Math.max(0,w), h:Math.max(0,h)};
}

function _bootstrapForMeasure(panel, header, body, footer){
  // Make sure header/footer heights are real before fit calc
  panel.style.display='grid';
  panel.style.gridTemplateRows='auto 0 auto';
  panel.style.gridTemplateColumns='1fr';
  const box1=_contentBox(header, footer, panel);
  panel.style.width=_px(box1.maxW);
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
  if(header){ header.style.gridRow='1'; header.style.alignSelf='start'; header.style.width='100%'; }
  body.style.gridRow='2'; body.style.alignSelf='center'; body.style.justifySelf='center';
  body.style.width=_px(bodyW); body.style.height=_px(bodyH); body.style.overflow='hidden';
  if(footer){ footer.style.gridRow='3'; footer.style.alignSelf='start'; footer.style.width='100%'; }
  frameEl.style.maxWidth='100%'; frameEl.style.width='auto'; frameEl.style.height='auto';
}

function _normalizeFooterVolume(panel){
  const vw = panel.querySelector('.toy-volwrap');
  if(!vw) return { snap:null };
  const snap=_snap(vw);
  vw.style.position='static';
  vw.style.left=''; vw.style.right=''; vw.style.top=''; vw.style.bottom='';
  vw.style.width='100%';
  vw.style.maxWidth='100%';
  vw.style.pointerEvents='auto';
  vw.style.zIndex='';
  vw.style.margin='0';
  vw.style.gridRow='3';
  return { snap };
}

export function ensureOverlay(){
  if(overlayEl) return overlayEl;
  overlayEl=document.getElementById('zoom-overlay');
  if(!overlayEl){
    overlayEl=document.createElement('div');
    overlayEl.id='zoom-overlay';
    Object.assign(overlayEl.style,{
      position:'fixed', inset:'0', display:'none', zIndex:'9999',
      background:'rgba(0,0,0,0.35)', backdropFilter:'blur(2px)',
      pointerEvents:'none', overflow:'hidden', boxSizing:'border-box'
    });
    overlayEl.addEventListener('pointerdown',(e)=>{ try{ if(activePanel && !activePanel.contains(e.target)) zoomOutPanel(activePanel); }catch{} });
    document.body.appendChild(overlayEl);
  }
  if(!frameEl || frameEl.parentNode!==overlayEl){
    frameEl=document.createElement('div');
    frameEl.id='zoom-frame';
    Object.assign(frameEl.style,{
      position:'absolute', inset:'0', display:'grid', placeItems:'center',
      width:'100%', height:'100%', pointerEvents:'auto', boxSizing:'border-box',
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
  if(!panel) return;
  ensureOverlay();
  if(activePanel && activePanel!==panel) zoomOutPanel(activePanel);

  const header=_findHeader(panel);
  const body=_findBody(panel);
  const { footer, ph }=_findFooterCluster(panel);

  const placeholder=document.createComment('zoom-placeholder');
  const parent=panel.parentNode, next=panel.nextSibling; parent.insertBefore(placeholder,next);
  const original={ panel:_snap(panel), header:_snap(header), body:_snap(body), footer:_snap(footer) };

  panel.classList.add('toy-zoomed');
  panel.style.margin='0'; panel.style.position='relative';

  _openHidden();
  frameEl.replaceChildren(panel);
  activePanel=panel;

  if(footer && footer.parentNode!==panel) panel.appendChild(footer);

  _bootstrapForMeasure(panel, header, body, footer);
  let box=_contentBox(header, footer, panel);
  const aspect=_measureAspect(body);
  const forceSquare = Math.abs(aspect-1)<=SQUARE_EPS && !_isGrid(panel);
  const bodySz=_fitBody(aspect, box, forceSquare, panel);

  _applyLayout(panel, header, body, footer, bodySz.w, bodySz.h);
  const volSnap=_normalizeFooterVolume(panel);

  const canvases=[], cvs=body?body.querySelectorAll('canvas'):[];
  for(let i=0;i<cvs.length;i++){ canvases.push({el:cvs[i], style:_snap(cvs[i])}); cvs[i].style.width='100%'; cvs[i].style.height='100%'; cvs[i].style.display='block'; }

  restoreInfo={ placeholder,parent,original,onExit, header,body,footer, canvases, volSnap, clusterPH:ph };

  _reveal();
  try{ panel.dispatchEvent(new CustomEvent('toy-zoom',{detail:{zoomed:true},bubbles:true})); }catch{}
  try{ window.dispatchEvent(new Event('resize')); }catch{}

  // Post-calibration
  requestAnimationFrame(()=> requestAnimationFrame(()=>{
    _bootstrapForMeasure(panel, header, body, footer);
    box=_contentBox(header, footer, panel);
    const s=_fitBody(aspect, box, forceSquare, panel);
    _applyLayout(panel, header, body, footer, s.w, s.h);
    _normalizeFooterVolume(panel);
    try{ window.dispatchEvent(new Event('resize')); }catch{}
  }));

  const relayout=()=>{
    _bootstrapForMeasure(panel, header, body, footer);
    const b=_contentBox(header, footer, panel);
    const s=_fitBody(aspect, b, forceSquare, panel);
    _applyLayout(panel, header, body, footer, s.w, s.h);
    _normalizeFooterVolume(panel);
  };
  relayoutHandler=relayout;
  addEventListener('resize', relayout, {passive:true});
  if(window.visualViewport){
    try{ visualViewport.addEventListener('resize', relayout, {passive:true}); }catch{}
    try{ visualViewport.addEventListener('scroll', relayout, {passive:true}); }catch{}
  }
  try{ if(ro) ro.disconnect(); ro=new ResizeObserver(relayout); ro.observe(frameEl); }catch{}

  escHandler=(ev)=>{ if(ev.key==='Escape') zoomOutPanel(panel); };
  addEventListener('keydown', escHandler, {passive:true});
}

export function zoomOutPanel(panel){
  if(!panel || panel!==activePanel) return;
  const info=restoreInfo||{};
  try{
    if(escHandler){ removeEventListener('keydown', escHandler); escHandler=null; }
    if(relayoutHandler){
      removeEventListener('resize', relayoutHandler); relayoutHandler=null;
      if(window.visualViewport){
        try{ visualViewport.removeEventListener('resize', relayoutHandler); }catch{}
        try{ visualViewport.removeEventListener('scroll', relayoutHandler); }catch{}
      }
    }
    try{ if(ro){ ro.disconnect(); ro=null; } }catch{}

    _rest(panel, info.original && info.original.panel);
    _rest(info.header, info.original && info.original.header);
    _rest(info.body,   info.original && info.original.body);
    _rest(info.footer, info.original && info.original.footer);
    if(info.volSnap) try{ _rest(panel.querySelector('.toy-volwrap'), info.volSnap.snap); }catch{}

    try{
      const ph=info.clusterPH, f=info.footer;
      if(ph && ph.parent && f){ ph.parent.insertBefore(f, ph.next||null); ph.remove(); }
    }catch{}

    if(Array.isArray(info.canvases)){
      for(let i=0;i<info.canvases.length;i++){ const c=info.canvases[i]; _rest(c.el, c.style); }
    }

    const {placeholder,parent}=info;
    if(placeholder && parent){ parent.insertBefore(panel, placeholder); parent.removeChild(placeholder); }

    try{ panel.classList.remove('toy-zoomed'); }catch{}
    try{ window.dispatchEvent(new Event('resize')); }catch{}

    _close();
    activePanel=null; restoreInfo=null;
  }catch(e){
    console.error('[zoom-overlay] zoomOut failed', e);
    try{ _close(); }catch{}
  }
}

try{ ensureOverlay(); }catch{}
