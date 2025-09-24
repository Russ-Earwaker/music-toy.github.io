// src/bouncer-interactions.js — pointer interactions (<=300 lines)

import { whichThirdRect } from './toyhelpers.js';
import { handleEdgeControllerEdit } from './bouncer-edges.js';
import { stepIndexUp, stepIndexDown } from './note-helpers.js';
import { ensureAudioContext } from './audio-core.js';
import { triggerInstrument } from './audio-samples.js';

function fireNote(inst, name, toyId){
  try {
    const ac = ensureAudioContext();
    const t  = (ac ? ac.currentTime : 0) + 0.0005;
    const instr = (typeof inst === 'function') ? inst() : inst;
    triggerInstrument(instr, name, t, toyId);
  } catch (e) {}
}

export function installBouncerInteractions({
  panel, canvas, sizing, toWorld, EDGE, physW, physH, ballR, __getSpeed,
  blocks, edgeControllers, handle,
  spawnBallFrom, setNextLaunchAt, setBallOut,
  instrument, toyId, noteList, velFrom,
  setAim, isAdvanced, preview
}) {
  const previewApi = preview || {};
  const shouldDefer = () => (previewApi.shouldDefer ? previewApi.shouldDefer() : false);
  const noteListSafe = Array.isArray(noteList) ? noteList : [];

  let draggingBlock = false;
  let draggingBlockPreview = false;
  let dragBlockRef = null;
  let dragBlockIndex = -1;
  let dragOffset = { dx: 0, dy: 0 };

  let tapBlock = null;
  let tapBlockIndex = -1;
  let tapEdge = null;
  let tapEdgeIndex = -1;
  let tapStart = null;
  let tapMoved = false;

  let draggingHandle = false;
  let aimStart = null;
  let aimCurr = null;
  let handlePreviewActive = false;

  function localPoint(evt) {
    const r = canvas.getBoundingClientRect();
    const x = (evt.clientX - r.left) * ((canvas.width || 1) / Math.max(1, r.width));
    const y = (evt.clientY - r.top)  * ((canvas.height||1) / Math.max(1, r.height));
    return { x, y };
  }

  function getPreviewState() {
    return previewApi.getState ? previewApi.getState() : null;
  }

  function ensurePreviewBlock(idx) {
    if (!previewApi.updateBlock) return;
    previewApi.updateBlock(idx, (clone, original) => {
      if (!clone || !original) { return; }
      if (typeof clone.x === 'undefined') {
        Object.assign(clone, original);
      }
    });
  }

  function ensurePreviewEdge(idx) {
    if (!previewApi.updateEdge) return;
    previewApi.updateEdge(idx, (clone, original) => {
      if (!clone || !original) { return; }
      if (typeof clone.x === 'undefined') {
        Object.assign(clone, original);
      }
    });
  }

  function updatePreviewBlock(idx, mutator) {
    if (!previewApi.updateBlock) return;
    previewApi.updateBlock(idx, (clone, original) => {
      if (!clone) return;
      mutator(clone, original || blocks[idx]);
    });
  }

  function updatePreviewEdge(idx, mutator) {
    if (!previewApi.updateEdge) return;
    previewApi.updateEdge(idx, (clone, original) => {
      if (!clone) return;
      mutator(clone, original || edgeControllers[idx]);
    });
  }

  function resetDragState() {
    draggingBlock = false;
    draggingBlockPreview = false;
    dragBlockRef = null;
    dragBlockIndex = -1;
    tapBlock = null;
    tapBlockIndex = -1;
    tapEdge = null;
    tapEdgeIndex = -1;
    tapStart = null;
    tapMoved = false;
    draggingHandle = false;
    aimStart = null;
    aimCurr = null;
    handlePreviewActive = false;
  }

  function onPointerDown(e){
    const p = toWorld(localPoint(e));
    const hitEdge = edgeControllers.find(c => p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h);
    const hitBlock = blocks.find((b, idx) => !b.fixed && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);

    tapStart = { x: p.x, y: p.y };
    tapMoved = false;
    tapBlock = null;
    tapEdge = null;

    if (hitEdge) {
      const idx = edgeControllers.indexOf(hitEdge);
      tapEdgeIndex = idx;
      if (shouldDefer()) {
        ensurePreviewEdge(idx);
        const previewState = getPreviewState();
        const previewEdge = previewState?.edgeControllers?.[idx];
        if (previewEdge) {
          edgeControllers[idx]; // ensure index exists for bounds
          tapEdge = previewEdge;
          tapEdgeIndex = idx;
          try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
          e.preventDefault();
          return;
        }
      }
      tapEdge = hitEdge;
      tapEdgeIndex = idx;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
      return;
    }

    if (hitBlock) {
      const idx = blocks.indexOf(hitBlock);
      tapBlockIndex = idx;
      dragBlockIndex = idx;
      if (shouldDefer()) {
        ensurePreviewBlock(idx);
        const previewState = getPreviewState();
        const previewBlock = previewState?.blocks?.[idx];
        if (previewBlock) {
          tapBlock = previewBlock;
          dragBlockRef = previewBlock;
          draggingBlockPreview = true;
        } else {
          tapBlock = hitBlock;
          dragBlockRef = hitBlock;
          draggingBlockPreview = false;
        }
      } else {
        tapBlock = hitBlock;
        dragBlockRef = hitBlock;
        draggingBlockPreview = false;
      }
      dragOffset = {
        dx: p.x - (dragBlockRef?.x ?? hitBlock.x),
        dy: p.y - (dragBlockRef?.y ?? hitBlock.y)
      };
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
      return;
    }

    // Click & drag anywhere to launch
    aimStart = { x: p.x, y: p.y };
    const deferringHandle = shouldDefer();
    if (deferringHandle) {
      handlePreviewActive = true;
      previewApi.setHandle && previewApi.setHandle({ x: Math.round(p.x), y: Math.round(p.y), userPlaced: true });
    } else {
      handle.x = Math.round(p.x);
      handle.y = Math.round(p.y);
      handle.userPlaced = true;
      try {
        const w = physW(), h = physH();
        if (w > EDGE * 2 && h > EDGE * 2) {
          handle._fx = (handle.x - EDGE) / (w - EDGE * 2);
          handle._fy = (handle.y - EDGE) / (h - EDGE * 2);
        }
      } catch (err) {}
      handlePreviewActive = false;
    }
    draggingHandle = true;
    aimCurr = p;
    if (setAim) setAim({ active: true, sx: p.x, sy: p.y, cx: p.x, cy: p.y });
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  }

  function onPointerMove(e){
    const p = toWorld(localPoint(e));

    if (dragBlockRef && !draggingBlock) {
      const dx = p.x - (tapStart ? tapStart.x : p.x);
      const dy = p.y - (tapStart ? tapStart.y : p.y);
      if (Math.abs(dx) + Math.abs(dy) > 3) draggingBlock = true;
    }

    if (draggingBlock && dragBlockRef) {
      if (draggingBlockPreview && dragBlockIndex >= 0) {
        updatePreviewBlock(dragBlockIndex, (clone) => {
          clone.x = Math.round(p.x - dragOffset.dx);
          clone.y = Math.round(p.y - dragOffset.dy);
        });
      } else {
        dragBlockRef.x = Math.round(p.x - dragOffset.dx);
        dragBlockRef.y = Math.round(p.y - dragOffset.dy);
      }
      tapMoved = true;
      return;
    }

    if (draggingHandle) {
      aimCurr = p;
      if (setAim) setAim({ active: true, cx: p.x, cy: p.y });
      if (handlePreviewActive) {
        const { vx, vy } = velFrom(aimStart.x, aimStart.y, p.x, p.y);
        previewApi.setHandle && previewApi.setHandle({ x: Math.round(aimStart.x), y: Math.round(aimStart.y), vx, vy, userPlaced: true });
      }
      return;
    }

    if (!tapMoved && tapStart) {
      const dx = p.x - tapStart.x;
      const dy = p.y - tapStart.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) tapMoved = true;
    }
  }

  function onPointerUp(e){
    const p = toWorld(localPoint(e));

    if (dragBlockRef) {
      const deferringBlock = draggingBlockPreview && dragBlockIndex >= 0;
      if (!draggingBlock) {
        const t = whichThirdRect(tapBlock || dragBlockRef, p.y);
        const adv = typeof isAdvanced === 'function' ? !!isAdvanced() : (panel?.classList?.contains('toy-zoomed'));
        if (deferringBlock) {
          updatePreviewBlock(dragBlockIndex, (clone) => {
            if (t === 'toggle' || !adv) {
              clone.active = !(clone.active !== false);
            } else if (t === 'up' && adv) {
              stepIndexUp(clone, noteListSafe);
            } else if (t === 'down' && adv) {
              stepIndexDown(clone, noteListSafe);
            }
          });
          const previewState = getPreviewState();
          const previewBlock = previewState?.blocks?.[dragBlockIndex];
          const nm = previewBlock ? (noteListSafe[previewBlock.noteIndex || 0] || previewBlock.noteName) : null;
          if (nm) fireNote(instrument, nm, toyId);
        } else {
          const blk = tapBlock || dragBlockRef;
          if (t === 'toggle' || !adv) {
            blk.active = !(blk.active !== false);
          } else if (t === 'up' && adv) {
            stepIndexUp(blk, noteListSafe);
          } else if (t === 'down' && adv) {
            stepIndexDown(blk, noteListSafe);
          }
          const nm = (noteListSafe[blk.noteIndex || 0]) || blk.noteName;
          if (nm) fireNote(instrument, nm, toyId);
        }
      }
      draggingBlock = false;
      draggingBlockPreview = false;
      dragBlockRef = null;
      dragBlockIndex = -1;
      tapBlock = null;
      tapBlockIndex = -1;
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
      return;
    }

    if (tapEdge) {
      const t = whichThirdRect(tapEdge, p.y);
      const adv = typeof isAdvanced === 'function' ? !!isAdvanced() : false;
      const deferringEdge = shouldDefer() || (tapEdgeIndex >= 0 && previewApi.updateEdge);
      if (deferringEdge && tapEdgeIndex >= 0 && previewApi.updateEdge) {
        updatePreviewEdge(tapEdgeIndex, (clone) => {
          if (t === 'toggle' || !adv) {
            clone.active = !(clone.active !== false);
          } else if (t === 'up' && adv) {
            stepIndexUp(clone, noteListSafe);
          } else if (t === 'down' && adv) {
            stepIndexDown(clone, noteListSafe);
          }
        });
        const previewState = getPreviewState();
        const previewEdge = previewState?.edgeControllers?.[tapEdgeIndex];
        const nm = previewEdge ? (noteListSafe[previewEdge.noteIndex || 0] || previewEdge.noteName) : null;
        if (nm) fireNote(instrument, nm, toyId);
      } else {
        if (t === 'toggle' || !adv) {
          tapEdge.active = !(tapEdge.active !== false);
        } else if (t === 'up' && adv) {
          stepIndexUp(tapEdge, noteListSafe);
        } else if (t === 'down' && adv) {
          stepIndexDown(tapEdge, noteListSafe);
        }
        try {
          const nm = noteListSafe[tapEdge.noteIndex || 0] || tapEdge.noteName;
          if (nm) fireNote(instrument, nm, toyId);
        } catch (err) {}
      }
      tapEdge = null;
      tapEdgeIndex = -1;
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
      return;
    }

    if (draggingHandle) {
      const isChainedFollower = !!panel.dataset.prevToyId;
      const { vx, vy } = velFrom(aimStart.x, aimStart.y, p.x, p.y);

      if (handlePreviewActive || shouldDefer()) {
        previewApi.setHandle && previewApi.setHandle({ x: Math.round(aimStart.x), y: Math.round(aimStart.y), vx, vy, userPlaced: true });
      } else {
        handle.vx = vx;
        handle.vy = vy;
        if (!isChainedFollower) {
          spawnBallFrom({ x: aimStart.x, y: aimStart.y, vx, vy, r: (ballR ? ballR() : 6) });
        }
      }

      draggingHandle = false;
      aimStart = null;
      aimCurr = null;
      handlePreviewActive = false;
      if (setAim) setAim({ active: false });
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
      return;
    }
  }

  function onPointerCancel(e) {
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
    resetDragState();
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);

  return {
    dispose(){
      try {
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointercancel', onPointerCancel);
      } catch (err) {}
    }
  };
}

