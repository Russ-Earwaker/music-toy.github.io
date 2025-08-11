// src/board.js — robust first-run distribution + restore + guard
export function initDragBoard(boardSel = '#board') {
  const board = document.querySelector(boardSel);
  if (!board) return;

  // ---- restore any saved layout
  let hadSaved = false;
  let savedMap = {};
  try {
    savedMap = JSON.parse(localStorage.getItem('toyPositions') || '{}') || {};
    hadSaved = Object.keys(savedMap).length > 0;
  } catch {}

  function applySaved(){
    let count = 0;
    Object.entries(savedMap).forEach(([id, pos]) => {
      const el = document.getElementById(id);
      if (el && pos && (pos.left || pos.top)){
        if (pos.left) el.style.left = pos.left;
        if (pos.top)  el.style.top  = pos.top;
        el.dataset.positioned = '1';
        count++;
      }
    });
    if (count) console.debug('[board] restored positions for', count, 'panels');
  }
  if (hadSaved) applySaved();

  function savePositions(){
    const all = {};
    board.querySelectorAll('.toy-panel').forEach(el => {
      all[el.id] = { left: el.style.left || '', top: el.style.top || '' };
    });
    try {
      localStorage.setItem('toyPositions', JSON.stringify(all));
      savedMap = all;
    } catch {}
  }

  // ---- single deterministic first-run layout (only if no saved)
  function layoutOnceIfNeeded(){
    if (hadSaved) return;
    const panels = Array.from(board.querySelectorAll('.toy-panel'));
    if (!panels.length) return;

    const gapX = 16, gapY = 16;
    const boardRect = board.getBoundingClientRect();
    const maxW = Math.max(360, Math.floor(boardRect.width || (window.innerWidth - 40)));
    let x = gapX, y = gapY, rowH = 0;

    panels.forEach(el => {
      const r = el.getBoundingClientRect();
      const w = Math.max(Math.round(r.width) || 360, 220);
      const h = Math.max(Math.round(r.height) || 180, 120);
      if (x + w + gapX > maxW){
        x = gapX; y += rowH + gapY; rowH = 0;
      }
      el.style.left = x + 'px';
      el.style.top  = y + 'px';
      el.dataset.positioned = '1';
      x += w + gapX;
      rowH = Math.max(rowH, h);
    });

    savePositions();
    hadSaved = true; // prevent any further auto-layout
    console.debug('[board] distributed', panels.length, 'panels');
  }

  // Guard: if something wipes our inline positions shortly after, reapply once
  function guardPositionsOnce(){
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Reapply either distributed or saved values if any panel has empty left/top
        board.querySelectorAll('.toy-panel').forEach(el => {
          const id = el.id;
          const pos = savedMap[id];
          if (!pos) return;
          if (!el.style.left && pos.left) el.style.left = pos.left;
          if (!el.style.top  && pos.top)  el.style.top  = pos.top;
        });
      });
    });
  }

  // schedule layout *after* everything has mounted and sized
  if (!hadSaved){
    const run = () => requestAnimationFrame(() => requestAnimationFrame(() => { layoutOnceIfNeeded(); guardPositionsOnce(); }));
    if (document.readyState === 'complete') run();
    else window.addEventListener('load', run, { once:true });
  } else {
    // also guard once on restore
    guardPositionsOnce();
  }

  // Observe for late-added panels (or attribute wipes) and reapply saved
  const mo = new MutationObserver((list) => {
    let needsApply = false;
    for (const m of list){
      if (m.type === 'childList' && (m.addedNodes?.length)){
        needsApply = true;
      }
      if (m.type === 'attributes' && m.attributeName === 'style'){
        const el = m.target;
        if (el.classList?.contains('toy-panel')){
          const id = el.id, pos = savedMap[id];
          if (pos && (!el.style.left || !el.style.top)){
            needsApply = true;
          }
        }
      }
    }
    if (needsApply){
      applySaved();
    }
  });
  mo.observe(board, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });

  // ---- dragging
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
    savePositions();
    drag = null;
  }

  board.addEventListener('pointerup', endDrag);
  board.addEventListener('pointercancel', endDrag);
}
