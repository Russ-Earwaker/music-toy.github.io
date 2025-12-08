// src/board.js — draggable panels + organize, no clamp, persists positions
export function initDragBoard(boardSel = '#board') {
  const board = document.querySelector(boardSel);
  if (!board) return;

  // --- Toy Focus Highlighting ---


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
    if (window.__toyFocused) return;
    // Only start a drag on the specific title handle, not the whole header.
    const clickedPanel = e.target.closest('.toy-panel');

    let handle = e.target.closest('[data-drag-handle="1"]');
    // Allow dragging the whole panel when unfocused (header hidden).
    if (!handle && clickedPanel?.classList?.contains('toy-unfocused')) {
      handle = clickedPanel;
    }
    // Ignore clicks on buttons or other interactive elements in the header.
    if (!handle || e.target.closest('button, select, input, a')) return;
    const el = handle.closest('.toy-panel');
    if (!el || el.classList.contains('toy-zoomed')) return;
    el.setPointerCapture?.(e.pointerId);
    drag = el; sx=e.clientX; sy=e.clientY;
    const cs = getComputedStyle(el);
    ox = parseFloat(cs.left)||0; oy=parseFloat(cs.top)||0;
    window.ToySpawner?.beginPanelDrag?.({ panel: el, pointerId: e.pointerId });
  }
  function onPointerMove(e){
    if (!drag) return;
    const sc = (window.__boardScale||1);
    const nx = ox + (e.clientX - sx) / sc;
    const ny = oy + (e.clientY - sy) / sc;
    drag.style.position='absolute';
    drag.style.left = nx + 'px';
    drag.style.top  = ny + 'px';
    window.ToySpawner?.updatePanelDrag?.({ panel: drag, clientX: e.clientX, clientY: e.clientY });
  }
  function onPointerUp(e){
    if (!drag) return;
    const panel = drag;
    drag = null;
    panel.releasePointerCapture?.(e.pointerId);
    const removedByTrash = !!window.ToySpawner?.endPanelDrag?.({
      panel,
      pointerId: e.pointerId,
      clientX: e.clientX,
      clientY: e.clientY,
    });
    if (!removedByTrash) {
      savePos(panel);
    }
  }
  function onPointerCancel(e){
    if (!drag) return;
    const panel = drag;
    drag = null;
    panel.releasePointerCapture?.(e.pointerId);
    window.ToySpawner?.endPanelDrag?.({
      panel,
      pointerId: e.pointerId,
      clientX: e.clientX,
      clientY: e.clientY,
      canceled: true,
    });
  }
  board.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('pointercancel', onPointerCancel, true);

  // organize: masonry-like columns that respect actual panel height
  window.organizeBoard = function organizeBoard(){
    const panels = Array.from(document.querySelectorAll('.toy-panel'));
    const GAP = 16;
    const VIEW_W = document.documentElement.clientWidth || 1200;
    const COL_W = 380; // target content width
    const cols = Math.max(1, Math.min(4, Math.floor((VIEW_W - GAP) / (COL_W + GAP))));
    const colX = Array.from({length: cols}, (_,i)=> GAP + i*(COL_W + GAP));
    const colY = Array.from({length: cols}, ()=> GAP);

    panels.forEach(el=>{
      // Fix width but let height be measured from content
      el.style.width = COL_W + 'px';
      el.style.height = '';
      el.style.position='absolute';

      // Choose the column with the smallest current height
      let best = 0; for (let i=1;i<cols;i++){ if (colY[i] < colY[best]) best = i; }
      el.style.left = colX[best] + 'px';
      el.style.top  = colY[best] + 'px';

      // Measure with current layout to advance that column's y
      // Use offsetHeight to include header/footer/volume controls
      const h = Math.max(1, (el.offsetHeight || 0));
      colY[best] += h + GAP;

      savePos(el);
    });
  };

  enforceSavedPositions();
  window.addEventListener('resize', enforceSavedPositions);
  document.addEventListener('visibilitychange', ()=>{ if (!document.hidden) enforceSavedPositions(); });
}

export function organizeBoard(){ window.organizeBoard && window.organizeBoard(); }

;(()=>{ try{ (typeof initDragBoard==='function') && initDragBoard('#board'); }catch(e){ console.warn('[board] init failed', e); } })();
