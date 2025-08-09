// src/board.js
export function initDragBoard(boardSel = '#board') {
  const board = document.querySelector(boardSel);
  if (!board) return;

  // restore saved positions
  try {
    const saved = JSON.parse(localStorage.getItem('toyPositions') || '{}');
    Object.entries(saved).forEach(([id, pos]) => {
      const el = document.getElementById(id);
      if (el) { el.style.left = pos.left; el.style.top = pos.top; }
    });
  } catch {}

  let drag = null; // {el, startX, startY, offsetX, offsetY}

  board.addEventListener('pointerdown', (e) => {
    const header = e.target.closest('.toy-header');
    if (!header) return;
    const el = header.closest('.toy-panel');
    const rect = el.getBoundingClientRect();
    const boardRect = board.getBoundingClientRect();

    drag = {
      el,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: rect.left - boardRect.left,
      offsetY: rect.top - boardRect.top
    };
    header.setPointerCapture?.(e.pointerId);
  });

  board.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const nx = Math.max(0, drag.offsetX + dx);
    const ny = Math.max(0, drag.offsetY + dy);
    drag.el.style.left = nx + 'px';
    drag.el.style.top  = ny + 'px';
  });

  function endDrag() {
    if (!drag) return;
    // save positions
    const all = {};
    document.querySelectorAll('.toy-panel').forEach(el => {
      all[el.id] = { left: el.style.left, top: el.style.top };
    });
    localStorage.setItem('toyPositions', JSON.stringify(all));
    drag = null;
  }

  board.addEventListener('pointerup', endDrag);
  board.addEventListener('pointercancel', endDrag);
}
