// src/board.js — draggable panels + organize, no clamp, persists positions
export function initDragBoard(boardSel = '#board') {
  const board = document.querySelector(boardSel);
  if (!board) return;

  // position context
  if (getComputedStyle(board).position === 'static') board.style.position = 'relative';

  const KEY = 'toyPositions';

  function loadAll(){
    try{ return JSON.parse(localStorage.getItem(KEY)||'{}'); }catch{ return {}; }
  }
  function saveAll(map){ try{ localStorage.setItem(KEY, JSON.stringify(map)); }catch{} }
  function savePos(el){
    const id = el.id || el.dataset.toyid || el.dataset.toy || ('panel'+Math.random());
    const map = loadAll();
    map[id] = { left: el.style.left, top: el.style.top };
    saveAll(map);
  }
  function enforceSavedPositions(){
    const map = loadAll();
    // Only apply to panels that are direct children of the board.
    // This prevents it from interfering with panels in the zoom overlay.
    board.querySelectorAll(':scope > .toy-panel').forEach(el=>{
      const id = el.id || el.dataset.toyid || el.dataset.toy;
      const pos = id && map[id];
      if (pos){
        el.style.position = 'absolute';
        if (pos.left) el.style.left = pos.left;
        if (pos.top)  el.style.top  = pos.top;
      }else{
        if (!el.style.left) el.style.left = (Math.random()*200|0)+'px';
        if (!el.style.top)  el.style.top  = (Math.random()*120|0)+'px';
      }
    });
  }

  let drag=null, sx=0, sy=0, ox=0, oy=0;
  function onPointerDown(e){
    // Only start a drag on the specific title handle, not the whole header.
    const handle = e.target.closest('[data-drag-handle="1"]');
    // Ignore clicks on buttons or other interactive elements in the header.
    if (!handle || e.target.closest('button, select, input, a')) return;
    const el = handle.closest('.toy-panel');
    if (!el || el.classList.contains('toy-zoomed')) return;
    el.setPointerCapture?.(e.pointerId);
    drag = el; sx=e.clientX; sy=e.clientY;
    const cs = getComputedStyle(el);
    ox = parseFloat(cs.left)||0; oy=parseFloat(cs.top)||0;
  }
  function onPointerMove(e){
    if (!drag) return;
    const sc = (window.__boardScale||1);
    const nx = ox + (e.clientX - sx) / sc;
    const ny = oy + (e.clientY - sy) / sc;
    drag.style.position='absolute';
    drag.style.left = nx + 'px';
    drag.style.top  = ny + 'px';
  }
  function onPointerUp(e){
    if (!drag) return;
    savePos(drag);
    drag.releasePointerCapture?.(e.pointerId);
    drag=null;
  }
  board.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('pointerup', onPointerUp, true);

  // organize: simple grid
  window.organizeBoard = function organizeBoard(){
    const panels = Array.from(document.querySelectorAll('.toy-panel'));
    const GAP=16, colW=380, colH=420;
    let c=0, r=0;
    panels.forEach(el=>{
      el.style.width = colW+'px';
      el.style.height = '';

      el.style.position='absolute';
      el.style.left = (GAP + c*(colW+GAP))+'px';
      el.style.top  = (GAP + r*(colH+GAP))+'px';
      c++; if (c>=3){ c=0; r++; }
      savePos(el);
    });
  };

  enforceSavedPositions();
  window.addEventListener('resize', enforceSavedPositions);
  document.addEventListener('visibilitychange', ()=>{ if (!document.hidden) enforceSavedPositions(); });
}

export function organizeBoard(){ window.organizeBoard && window.organizeBoard(); }

;(()=>{ try{ (typeof initDragBoard==='function') && initDragBoard('#board'); }catch(e){ console.warn('[board] init failed', e); } })();