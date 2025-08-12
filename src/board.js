// src/board.js
// Robust drag + persist: inline !important positioning, computed saves, mutation-safe.
export function initDragBoard(boardSel = '#board') {
  const board = document.querySelector(boardSel);
  if (!board) return;

  const DEBUG = false;
  const log = (...a) => { if (DEBUG) console.log('[board]', ...a); };

  // Ensure board is a positioning context
  const csb = getComputedStyle(board);
  if (csb.position === 'static') board.style.position = 'relative';

  const KEY = 'toyPositions';

  // ---- storage helpers ----
  const loadSaved = () => {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
  };
  const saveAll = () => {
    const all = {};
    board.querySelectorAll('.toy-panel').forEach(el => {
      if (!el.id) return;
      const rect = el.getBoundingClientRect();
      const b = board.getBoundingClientRect();
      const left = Math.max(0, Math.round(rect.left - b.left)) + 'px';
      const top  = Math.max(0, Math.round(rect.top  - b.top )) + 'px';
      all[el.id] = { left, top };
    });
    localStorage.setItem(KEY, JSON.stringify(all));
    log('saved', all);
  };

  // Apply left/top/position with !important so no stylesheet can override
  const applyPos = (el, left, top) => {
    el.style.setProperty('position', 'absolute', 'important');
    el.style.setProperty('left', left, 'important');
    el.style.setProperty('top', top, 'important');
  };

  const applySaved = (saved) => {
    Object.entries(saved).forEach(([id, pos]) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (pos && typeof pos.left === 'string' && typeof pos.top === 'string') {
        applyPos(el, pos.left, pos.top);
      }
    });
    log('applied', saved);
  };

  // Give IDs to any panels missing one (stable by order)
  function ensureIds() {
    const list = Array.from(board.querySelectorAll('.toy-panel'));
    list.forEach((el, i) => {
      if (!el.id) {
        const kind = (el.getAttribute('data-toy') || 'toy').toLowerCase();
        el.id = `${kind}-${i+1}`;
      }
      el.style.setProperty('position', 'absolute', 'important');
    });
    return list;
  }

  // ---- initial restore/baseline ----
  ensureIds();
  let saved = loadSaved();

  if (!Object.keys(saved).length) {
    // First run: create a baseline from current geometry
    saved = {};
    const b = board.getBoundingClientRect();
    board.querySelectorAll('.toy-panel').forEach(el => {
      const r = el.getBoundingClientRect();
      const left = Math.max(0, Math.round(r.left - b.left)) + 'px';
      const top  = Math.max(0, Math.round(r.top  - b.top )) + 'px';
      saved[el.id] = { left, top };
      applyPos(el, left, top);
    });
    localStorage.setItem(KEY, JSON.stringify(saved));
    log('initialized baseline', saved);
  } else {
    applySaved(saved);
    requestAnimationFrame(() => applySaved(saved)); // re-apply after layout/styles
  }

  // Guard for panels added later
  const mo = new MutationObserver(() => {
    ensureIds();
    const s = loadSaved();
    applySaved(s);
  });
  mo.observe(board, { childList: true, subtree: true });

  // ---- default layout for panels with no saved pos -----
  const panels = Array.from(board.querySelectorAll('.toy-panel'));
  const needs = panels.filter(el => !saved[el.id]);
  if (needs.length) {
    const GAP = 16;
    const maxW = Math.max(480, board.clientWidth || window.innerWidth);
    const colW = 380, colH = 280;
    const cols = Math.max(1, Math.floor((maxW - GAP) / (colW + GAP)));
    needs.forEach((el, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const left = (GAP + c * (colW + GAP)) + 'px';
      const top  = (GAP + r * (colH + GAP)) + 'px';
      applyPos(el, left, top);
      saved[el.id] = { left, top };
    });
    localStorage.setItem(KEY, JSON.stringify(saved));
    log('laid out defaults', saved);
  }

  // ---- dragging ----
  let drag = null; // {el, startX, startY, offsetX, offsetY}
  let savePending = false;
  const saveSoon = () => {
    if (savePending) return;
    savePending = true;
    requestAnimationFrame(() => { saveAll(); savePending = false; });
  };

  const onPointerDown = (e) => {
    const header = e.target.closest('.toy-header');
    if (!header) return;
    const el = header.closest('.toy-panel');
    const rect = el.getBoundingClientRect();
    const b = board.getBoundingClientRect();
    applyPos(el, (rect.left - b.left) + 'px', (rect.top - b.top) + 'px');
    drag = {
      el,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: (rect.left - b.left),
      offsetY: (rect.top  - b.top ),
    };
    header.setPointerCapture?.(e.pointerId);
    log('drag start', el.id, drag.offsetX, drag.offsetY);
  };

  const onPointerMove = (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const nx = Math.max(0, Math.round(drag.offsetX + dx));
    const ny = Math.max(0, Math.round(drag.offsetY + dy));
    applyPos(drag.el, nx + 'px', ny + 'px');
    saveSoon();
  };

  const endDrag = () => {
    if (!drag) return;
    saveAll();
    log('drag end');
    drag = null;
  };

  board.addEventListener('pointerdown', onPointerDown);
  board.addEventListener('pointermove', onPointerMove);
  board.addEventListener('pointerup', endDrag);
  board.addEventListener('pointercancel', endDrag);
  window.addEventListener('pointerup', endDrag, true);
  window.addEventListener('pointercancel', endDrag, true);
  document.addEventListener('lostpointercapture', endDrag, true);
  window.addEventListener('beforeunload', saveAll);
}
