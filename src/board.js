// src/board.js
// Drag + persist positions for .toy-panel elements, with a simple "organise" grid layout.
// Safe around zoom: skip drag/save while a panel has .toy-zoomed.

export function initDragBoard(boardSel = '#board') {
  const board = document.querySelector(boardSel);
  if (!board) return;

  // Ensure board is a positioning context
  const csb = getComputedStyle(board);
  if (csb.position === 'static') board.style.position = 'relative';

  const KEY = 'toyPositions';

  // ---- storage helpers ----
  function loadAll(){
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
  }
  function saveAll(map){
    try { localStorage.setItem(KEY, JSON.stringify(map || collectPositions())); } catch {}
  }
  function collectPositions(){
    const saved = loadAll();
    for (const el of board.querySelectorAll('.toy-panel')){
      const id = ensureId(el);
      const { left, top } = el.style;
      if (left && top) saved[id] = { left, top };
    }
    return saved;
  }
  function ensureId(el){
    if (!el.id){
      const kind = (el.getAttribute('data-toy') || 'toy').toLowerCase();
      el.id = `${kind}-${Array.from(board.querySelectorAll('.toy-panel')).indexOf(el)+1}`;
    }
    return el.id;
  }

  // ---- apply saved/default positions ----
  const saved = loadAll();
  const panels = Array.from(board.querySelectorAll('.toy-panel'));
  const GAP = 16, colW = 380, colH = 280;
  let colCount = Math.max(1, Math.floor(((board.clientWidth || window.innerWidth) - GAP) / (colW + GAP)));

  panels.forEach((el, i) => {
    const id = ensureId(el);
    const pos = saved[id];
    el.style.position = 'absolute';
    if (pos && pos.left && pos.top){
      el.style.left = pos.left;
      el.style.top  = pos.top;
    } else {
      const c = i % colCount;
      const r = Math.floor(i / colCount);
      el.style.left = (GAP + c * (colW + GAP)) + 'px';
      el.style.top  = (GAP + r * (colH + GAP)) + 'px';
    }
  });

  // ---- dragging ----
  let drag = null; // {el, startX, startY, baseLeft, baseTop, moved}
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  function onPointerDown(e){
    const header = e.target.closest('.toy-header');
    if (!header) return;
    const el = header.closest('.toy-panel');
    if (!el || el.classList.contains('toy-zoomed')) return; // don't move zoomed
    const rect = el.getBoundingClientRect();
    const bRect = board.getBoundingClientRect();
    drag = {
      el,
      startX: e.clientX,
      startY: e.clientY,
      baseLeft: parseFloat(el.style.left || (rect.left - bRect.left) + 'px') || 0,
      baseTop:  parseFloat(el.style.top  || (rect.top  - bRect.top)  + 'px') || 0,
      moved: false
    };
    el.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }

  function onPointerMove(e){
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) drag.moved = true;

    // clamp within board bounds
    const bRect = board.getBoundingClientRect();
    const elRect = drag.el.getBoundingClientRect();
    const maxLeft = (bRect.width - elRect.width);
    const maxTop  = (bRect.height - elRect.height);
    const nextLeft = clamp(drag.baseLeft + dx, 0, Math.max(0, Math.floor(maxLeft)));
    const nextTop  = clamp(drag.baseTop  + dy,  0, Math.max(0, Math.floor(maxTop)));
    drag.el.style.left = nextLeft + 'px';
    drag.el.style.top  = nextTop  + 'px';
  }

  function onPointerUp(e){
    if (!drag) return;
    const { el, moved } = drag;
    el.releasePointerCapture?.(e.pointerId);
    drag = null;
    if (moved){
      const map = loadAll();
      const id = ensureId(el);
      map[id] = { left: el.style.left, top: el.style.top };
      saveAll(map);
    }
  }

  board.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('pointercancel', onPointerUp, true);
  document.addEventListener('lostpointercapture', onPointerUp, true);
  window.addEventListener('beforeunload', ()=> saveAll());

  // Recompute column count on resize (no relayout; Organise handles that)
  window.addEventListener('resize', ()=> {
    colCount = Math.max(1, Math.floor(((board.clientWidth || window.innerWidth) - GAP) / (colW + GAP)));
  });
}

// Arrange panels in a neat grid and persist.
export function organizeBoard(boardSel = '#board'){
  const board = document.querySelector(boardSel);
  if (!board) return;
  const panels = Array.from(board.querySelectorAll('.toy-panel'));
  const GAP = 16, colW = 380, colH = 280;
  const maxW = Math.max(480, board.clientWidth || window.innerWidth);
  const cols = Math.max(1, Math.floor((maxW - GAP) / (colW + GAP)));
  const saved = {};
  panels.forEach((el, i) => {
    const id = el.id || `toy-${i+1}`;
    const c = i % cols;
    const r = Math.floor(i / cols);
    const left = (GAP + c * (colW + GAP)) + 'px';
    const top  = (GAP + r * (colH + GAP)) + 'px';
    el.style.position = 'absolute';
    el.style.left = left;
    el.style.top  = top;
    saved[id] = { left, top };
  });
  try { localStorage.setItem('toyPositions', JSON.stringify(saved)); } catch {}
  // ---- defensive guard: while a panel is zoomed, re-apply saved positions to others ----
  function enforceSavedPositions(){
    const z = document.querySelector('.toy-panel.toy-zoomed');
    if (!z) return;
    const saved = loadAll();
    for (const el of board.querySelectorAll('.toy-panel')){
      if (el === z) continue;
      const id = ensureId(el);
      const pos = saved[id];
      if (pos && pos.left && pos.top){
        el.style.position = 'absolute';
        el.style.left = pos.left;
        el.style.top  = pos.top;
      }
    }
  }
  const enforce = ()=> enforceSavedPositions();
  ['click','pointerdown','focus'].forEach(ev => window.addEventListener(ev, enforce, true));
  document.addEventListener('visibilitychange', ()=> { if (!document.hidden) enforceSavedPositions(); });

}

// Broadcast listener (optional external trigger)
window.addEventListener('organise-toys', ()=> organizeBoard());
