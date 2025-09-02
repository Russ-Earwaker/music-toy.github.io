// src/drum-tiles-visual.js — drum tiles (one-row, shared renderer, consolidated trigger) (<300 lines)
import { drawBlocksSection } from './ui-tiles.js';
import { triggerNoteForToy } from './audio-trigger.js';

(function(){
  const SEL = '.toy-panel[data-toy="loopgrid"]';
  const STATE = new WeakMap(); // panel -> { enabled:boolean[], onCol:number }

  function ensureCanvas(panel){
    const host = panel.querySelector('.toy-vbody') || panel.querySelector('.toy-body') || panel;
    if (getComputedStyle(host).position === 'static'){ host.style.position = 'relative'; }
    // Move existing canvas into host if needed
    let cvs = panel.querySelector('canvas[data-role="drum-tiles"]');
    if (cvs && cvs.parentNode !== host){ try{ host.prepend(cvs); }catch{} }
    if (!cvs){
      cvs = document.createElement('canvas');
      cvs.dataset.role = 'drum-tiles';
      Object.assign(cvs.style, { position:'absolute', left:'50%', transform:'translateX(-50%)', top:'0', display:'block', zIndex:'50', pointerEvents:'auto' });
      host.prepend(cvs);
      // Click to toggle a cube (persistent)
      cvs.addEventListener('pointerdown', (e)=>{
        const rect = cvs.getBoundingClientRect();
        const col = Math.max(0, Math.min(7, Math.floor((e.clientX - rect.left) / (rect.width/8))));
        const st = STATE.get(panel) || { enabled:new Array(8).fill(false), onCol:-1 };
        st.enabled[col] = !st.enabled[col];
        STATE.set(panel, st);
        render(panel);
        try{ panel.dispatchEvent(new CustomEvent('loopgrid:toggle', { detail:{ col, on: st.enabled[col] }, bubbles:true })); }catch{}
        e.preventDefault(); e.stopPropagation();
      }, {capture:true});
    }
    return cvs;
  }

  function resize(panel){
    const host = panel.querySelector('.toy-vbody') || panel.querySelector('.toy-body') || panel;
    const cvs = ensureCanvas(panel);
    const r = host.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const tile = Math.max(10, Math.floor(r.width / 8));
    const w = tile * 8;
    cvs.width  = Math.max(2, Math.floor(w * dpr));
    cvs.height = Math.max(2, Math.floor(tile * dpr));
    try{ cvs.style.setProperty('width', w + 'px', 'important'); }catch{ cvs.style.width = w + 'px'; }
    try{ cvs.style.setProperty('height', tile + 'px', 'important'); }catch{ cvs.style.height = tile + 'px'; }
    cvs.style.left = '50%';
    cvs.style.transform = 'translateX(-50%)';
    render(panel);
  }
  function render(panel){
    const cvs = ensureCanvas(panel);
    const ctx = cvs.getContext('2d'); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,cvs.width, cvs.height);
    const st = STATE.get(panel) || { enabled:new Array(8).fill(false), onCol:-1 };
    const rect = { x:0, y:0, w:cvs.width/dpr, h:cvs.height/dpr };
    drawBlocksSection(ctx, rect, { active: st.enabled, onCol: st.onCol, pad: 4, zoomed: panel.classList.contains('toy-zoomed') });
  }

  function attach(panel){
    if (panel.__drumTiles) return;
    panel.__drumTiles = true;
    STATE.set(panel, { enabled:new Array(8).fill(false), onCol:-1 });
    resize(panel);

    // Scheduler tick: update highlight and trigger if enabled (consolidated path)
    panel.addEventListener('loopgrid:playcol', (e)=>{
      const st = STATE.get(panel); if (!st) return;
      const col = (e && e.detail && typeof e.detail.col==='number') ? e.detail.col : -1;
      if (col>=0){
        st.onCol = col;
        if (st.enabled[col]){
          const toyId = panel.dataset.toyid || panel.id || 'drum';
          try{ triggerNoteForToy(toyId, 60, 0.9); }catch{ try{ panel.__playCurrent && panel.__playCurrent(); }catch{} }
        }
      }
      render(panel);
    });

    // Drum tap sets current step ON
    panel.addEventListener('loopgrid:tap', ()=>{
      const st = STATE.get(panel); if (!st) return;
      const idx = (st.onCol>=0 ? st.onCol : 0);
      st.enabled[idx] = true;
      STATE.set(panel, st);
      render(panel);
      try{ panel.dispatchEvent(new CustomEvent('loopgrid:toggle', { detail:{ col: idx, on:true }, bubbles:true })); }catch{}
    });

    // Clear / Random controls
    panel.addEventListener('drumtiles:clear', ()=>{
      const st = STATE.get(panel); if (!st) return;
      st.enabled = new Array(8).fill(false);
      STATE.set(panel, st);
      render(panel);
      try{ panel.dispatchEvent(new CustomEvent('loopgrid:clear', { bubbles:true })); }catch{}
    });
    panel.addEventListener('drumtiles:randomize', ()=>{
      const st = STATE.get(panel); if (!st) return;
      const prob = 0.35;
      st.enabled = st.enabled.map(()=> Math.random() < prob);
      STATE.set(panel, st);
      render(panel);
      try{ panel.dispatchEvent(new CustomEvent('loopgrid:randomize', { detail:{ prob }, bubbles:true })); }catch{}
    });
  }

  function boot(){ document.querySelectorAll(SEL).forEach(attach); }
  function relayout(){ document.querySelectorAll(SEL).forEach(resize); }

  window.addEventListener('resize', relayout);
  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState!=='loading') boot();
})();
