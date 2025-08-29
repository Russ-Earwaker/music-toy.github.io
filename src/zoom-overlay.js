// src/zoom-overlay.js
// Advanced overlay — pixel-perfect centering with transform neutralisation.
// Symptom you saw (same offset regardless of zoom) points to leftover grid-position
// transforms on the toy panel. We now neutralise transforms on the panel while zoomed.
//
// Features:
// - Viewport-anchored frame at 50%/50% with translate(-50%,-50%)
// - Post-size self-correction (dx, dy) to cancel any residual drift
// - Pre-size before move so internals never see 0×0; ensure body is positioned
// - **NEW**: while zoomed, the panel has transform/translate/left/top neutralised
// - Click outside or ESC exits; full style restore on exit

export function ensureOverlay(){ return _ensureOverlay(); }
export function zoomInPanel(panel, onExit){ return _zoomIn(panel, onExit); }
export function zoomOutPanel(panel){ return _zoomOut(panel); }

let overlayEl=null, frameEl=null, activePanel=null, restoreInfo=null;
let escHandler=null, relayoutHandler=null;

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
      transform:'translate(-50%, -50%)',
      width:'0px', height:'0px',
      pointerEvents:'auto',
      display:'block', boxSizing:'border-box'
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

function _computeSquare(header, body, volume){
  const {vw,vh}=_vsize();
  const maxW=Math.min(Math.floor(vw*0.96), 1200);
  const maxH=Math.floor(vh*0.96);
  const vPad=32, hPad=32;
  const hH=header?Math.round(header.getBoundingClientRect().height):0;
  const hF=volume?Math.round(volume.getBoundingClientRect().height):0;
  const availW=Math.max(0, maxW-hPad);
  const availH=Math.max(0, maxH-vPad-hH-hF);
  const side=Math.floor(Math.max(0, Math.min(availW, availH)));
  return {side,hH,hF,frameW:side+hPad, frameH:side+vPad+hH+hF};
}

function _applySizes(panel, header, body, volume, s){
  if (header){ header.style.height=_px(s.hH); header.style.flex='0 0 auto'; header.style.margin='0 auto'; }
  if (volume){ volume.style.height=_px(s.hF); volume.style.flex='0 0 auto'; volume.style.alignSelf='stretch'; volume.style.width=_px(s.frameW); }
  if (body){
    _ensurePositioned(body);
    body.style.width=_px(s.side);
    body.style.height=_px(s.side);
    body.style.overflow='hidden';
  }
  panel.style.width=_px(s.frameW);
  panel.style.height=_px(s.frameH);
  panel.style.maxWidth=panel.style.width;
  panel.style.maxHeight=panel.style.height;
  frameEl.style.width=_px(s.frameW);
  frameEl.style.height=_px(s.frameH);
}

function _centerCorrect(){
  const r = frameEl.getBoundingClientRect();
  const {vw,vh}=_vsize();
  const cx = r.left + r.width/2;
  const cy = r.top  + r.height/2;
  const dx = Math.round(vw/2 - cx);
  const dy = Math.round(vh/2 - cy);
  frameEl.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px)`;
}

function _neutralisePanelOffsets(panel){
  // Snapshot inline offsets so we can restore 1:1.
  const prior = {
    transformInline: panel.style.transform || null,
    translateInline: panel.style.translate || null,
    leftInline: panel.style.left || null,
    topInline: panel.style.top || null,
    rightInline: panel.style.right || null,
    bottomInline: panel.style.bottom || null,
    transformOriginInline: panel.style.transformOrigin || null,
    marginInline: panel.style.margin || null,
  };
  // Neutralise offsets that could encode grid position into Advanced.
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

function _zoomIn(panel, onExit){
  if (!panel) return;
  _ensureOverlay();
  if (activePanel && activePanel!==panel) _zoomOut(activePanel);

  const header=panel.querySelector('.toy-header');
  const body  =panel.querySelector('.toy-body');
  const volume=panel.querySelector('.toy-volume, .toy-footer');

  const placeholder=document.createComment('zoom-placeholder');
  const parent=panel.parentNode, next=panel.nextSibling; parent.insertBefore(placeholder,next);
  const original={ panel:_snap(panel), header:_snap(header), body:_snap(body), volume:_snap(volume) };

  // Visuals for zoomed panel
  panel.classList.add('toy-zoomed');
  panel.style.margin='0';
  panel.style.position='relative';
  panel.style.display='flex';
  panel.style.flexDirection='column';
  panel.style.borderRadius='16px';
  panel.style.boxShadow='0 10px 30px rgba(0,0,0,0.5)';
  try{ panel.style.background=getComputedStyle(panel).background||'#1c1c1c'; }catch{}

  // Neutralise any leftover grid/cell transforms on the panel while zoomed
  const priorOffsets = _neutralisePanelOffsets(panel);

  let s=_computeSquare(header,body,volume);
  _applySizes(panel,header,body,volume,s);

  _openHidden();
  frameEl.replaceChildren(panel);
  activePanel=panel;

  const canvases=Array.from(body?body.querySelectorAll('canvas'):[]);
  const canvasSnaps=canvases.map(cv=>({el:cv, style:_snap(cv)}));
  restoreInfo={ placeholder,parent,original,onExit,header,body,volume,canvases:canvasSnaps, priorOffsets };

  requestAnimationFrame(()=>{
    s=_computeSquare(header,body,volume);
    _applySizes(panel,header,body,volume,s);
    _centerCorrect();

    canvases.forEach(cv=>{ cv.style.width='100%'; cv.style.height='100%'; cv.style.display='block'; });

    requestAnimationFrame(()=>{
      _reveal();
      _centerCorrect();

      const relayout=(()=>{
        let raf=0;
        return ()=>{
          if (raf) return;
          raf=requestAnimationFrame(()=>{
            const s2=_computeSquare(header,body,volume);
            _applySizes(panel,header,body,volume,s2);
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
    if (relayoutHandler){ removeEventListener('resize', relayoutHandler); relayoutHandler=null; }
    if (window.visualViewport){
      try{ visualViewport.removeEventListener('resize', relayoutHandler); }catch{}
      try{ visualViewport.removeEventListener('scroll', relayoutHandler); }catch{}
    }

    panel.classList.remove('toy-zoomed');
    _rest(panel, info.original?.panel);
    _rest(info.header, info.original?.header);
    _rest(info.body, info.original?.body);
    _rest(info.volume, info.original?.volume);

    // Restore any neutralised offsets/transforms
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
