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

  const DRAG_OVERLAP_CLASS = 'toy-overlap';
  const DRAG_OVERLAP_FLASH_CLASS = 'toy-overlap-flash';
  const DRAG_LERP_MS = 240;
  const DRAG_OVERLAP_BUFFER = 40;
  const SAFE_SEARCH_STEP = 16;
  const SAFE_SEARCH_MAX = 360;

  function getPanelRect(panel, overrideX, overrideY){
    const cs = getComputedStyle(panel);
    const w = Math.max(1, panel.offsetWidth || parseFloat(cs.width) || 1);
    const h = Math.max(1, panel.offsetHeight || parseFloat(cs.height) || 1);
    let x = Number.isFinite(overrideX) ? overrideX : parseFloat(panel.style.left);
    let y = Number.isFinite(overrideY) ? overrideY : parseFloat(panel.style.top);
    if (!Number.isFinite(x)) x = panel.offsetLeft || 0;
    if (!Number.isFinite(y)) y = panel.offsetTop || 0;
    return { x, y, w, h };
  }

  function rectsOverlap(a, b, pad = 0){
    const ax1 = a.x - pad;
    const ay1 = a.y - pad;
    const ax2 = a.x + a.w + pad;
    const ay2 = a.y + a.h + pad;
    const bx1 = b.x - pad;
    const by1 = b.y - pad;
    const bx2 = b.x + b.w + pad;
    const by2 = b.y + b.h + pad;
    return (ax1 < bx2) && (ax2 > bx1) && (ay1 < by2) && (ay2 > by1);
  }

  function collectOtherRects(panel){
    const rects = [];
    board.querySelectorAll(':scope > .toy-panel').forEach(other => {
      if (other === panel) return;
      if (other.classList.contains('toy-zoomed')) return;
      const r = getPanelRect(other);
      if (r.w <= 0 || r.h <= 0) return;
      rects.push(r);
    });
    return rects;
  }

  function overlapsAny(rect, others){
    for (let i = 0; i < others.length; i++){
      if (rectsOverlap(rect, others[i], DRAG_OVERLAP_BUFFER)) return true;
    }
    return false;
  }

  function findSafePosition(startRect, others){
    if (!overlapsAny(startRect, others)) return { x: startRect.x, y: startRect.y };
    const step = SAFE_SEARCH_STEP;
    const maxR = Math.max(step, SAFE_SEARCH_MAX);
    for (let r = step; r <= maxR; r += step){
      for (let dx = -r; dx <= r; dx += step){
        const top = { x: startRect.x + dx, y: startRect.y - r, w: startRect.w, h: startRect.h };
        if (!overlapsAny(top, others)) return { x: top.x, y: top.y };
        const bot = { x: startRect.x + dx, y: startRect.y + r, w: startRect.w, h: startRect.h };
        if (!overlapsAny(bot, others)) return { x: bot.x, y: bot.y };
      }
      for (let dy = -r + step; dy <= r - step; dy += step){
        const left = { x: startRect.x - r, y: startRect.y + dy, w: startRect.w, h: startRect.h };
        if (!overlapsAny(left, others)) return { x: left.x, y: left.y };
        const right = { x: startRect.x + r, y: startRect.y + dy, w: startRect.w, h: startRect.h };
        if (!overlapsAny(right, others)) return { x: right.x, y: right.y };
      }
    }
    return null;
  }

  function setOverlapState(panel, overlapping){
    if (!panel) return;
    panel.classList.toggle(DRAG_OVERLAP_CLASS, !!overlapping);
  }

  function flashOverlap(panel){
    if (!panel) return;
    panel.classList.remove(DRAG_OVERLAP_CLASS);
    panel.classList.add(DRAG_OVERLAP_FLASH_CLASS);
    if (panel.__overlapFlashTimer) clearTimeout(panel.__overlapFlashTimer);
    panel.__overlapFlashTimer = setTimeout(() => {
      panel.classList.remove(DRAG_OVERLAP_FLASH_CLASS);
      panel.__overlapFlashTimer = null;
    }, 420);
  }

  function lerpPanelTo(panel, from, to, durationMs, onDone){
    const start = performance?.now?.() ?? Date.now();
    const dur = Math.max(60, durationMs || DRAG_LERP_MS);
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      const x = from.x + (to.x - from.x) * eased;
      const y = from.y + (to.y - from.y) * eased;
      panel.style.left = x + 'px';
      panel.style.top = y + 'px';
      if (t < 1) {
        requestAnimationFrame(tick);
      } else if (typeof onDone === 'function') {
        onDone();
      }
    };
    requestAnimationFrame(tick);
  }

  let drag=null, sx=0, sy=0, ox=0, oy=0;
  let dragOrigin = null;
  let dragOverlapping = false;
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
    dragOrigin = { x: ox, y: oy };
    dragOverlapping = false;
    setOverlapState(el, false);
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
    const rect = getPanelRect(drag, nx, ny);
    const overlap = overlapsAny(rect, collectOtherRects(drag));
    dragOverlapping = overlap;
    setOverlapState(drag, overlap);
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
      if (dragOverlapping) {
        const currentRect = getPanelRect(panel);
        const others = collectOtherRects(panel);
        const safe = findSafePosition(currentRect, others);
        const origin = dragOrigin || { x: currentRect.x, y: currentRect.y };
        const distOrigin = (currentRect.x - origin.x) ** 2 + (currentRect.y - origin.y) ** 2;
        const distSafe = safe
          ? (currentRect.x - safe.x) ** 2 + (currentRect.y - safe.y) ** 2
          : Number.POSITIVE_INFINITY;
        const target = (safe && distSafe < distOrigin) ? safe : origin;
        flashOverlap(panel);
        lerpPanelTo(panel, { x: currentRect.x, y: currentRect.y }, target, DRAG_LERP_MS, () => {
          savePos(panel);
        });
      } else {
        savePos(panel);
      }
    }
    dragOrigin = null;
    dragOverlapping = false;
    setOverlapState(panel, false);
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
    dragOrigin = null;
    dragOverlapping = false;
    setOverlapState(panel, false);
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
