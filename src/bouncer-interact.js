// bouncer-interact.js — pointer/tap/drag handlers for bouncer
export function installBouncerInteractions(canvas, panel, {
  sizing, EDGE, blocks, edgeControllers, ensureAudioContext, noteList, noteValue, triggerInstrument, instrument,
  handle, cannonR, hitRect, whichThirdRect,
  setDragState, getDragState, onEdgeEdit, onHandleMove
}){
  function localPoint(evt){
    const rect = canvas.getBoundingClientRect();
    return { x: (evt.clientX - rect.left), y: (evt.clientY - rect.top) };
  }
  canvas.addEventListener('pointerdown', (e)=>{
    const { draggingHandle, draggingBlock, dragBlockRef, dragOffset, zoomDragCand } = getDragState();
    const p = localPoint(e);
    const zoomed = (sizing && typeof sizing.scale==='number') ? (sizing.scale > 1.01) : false;
    const hit = blocks.find(b => hitRect(p, b));
    const hitCtrl = edgeControllers.find(b => hitRect(p, b));
    if (zoomed){
      if (hit && !hit.fixed){
        setDragState({ zoomDragCand: hit, zoomDragStart: {x:p.x, y:p.y}, zoomTapT: whichThirdRect(hit, p.y) });
        try{ canvas.setPointerCapture(e.pointerId); }catch{}
        e.preventDefault(); return;
      }
      if (hitCtrl){
        const beforeI = hitCtrl.noteIndex, beforeO = hitCtrl.oct || 4;
        const ok = onEdgeEdit(hitCtrl, p.y);
        if (ok && (hitCtrl.noteIndex !== beforeI || (hitCtrl.oct||4)!==beforeO)){
          const ac = ensureAudioContext(); const now = (ac ? ac.currentTime : 0);
          const nm = noteValue(noteList, hitCtrl.noteIndex);
          try{ triggerInstrument(instrument, nm, now+0.0005, panel.dataset?.toy||'bouncer'); }catch{}
        }
        return;
      }
    } else {
      if (hit && !hit.fixed){
        setDragState({ stdDragCand: hit, stdDragStart: {x:p.x, y:p.y}, stdDragMoved: false,
          dragBlockRef: hit, dragOffset: { dx: p.x - hit.x, dy: p.y - hit.y } });
        try{ canvas.setPointerCapture(e.pointerId); }catch{}
        e.preventDefault(); return;
      }
      if (hitCtrl) return;
    }
    handle.x = p.x; handle.y = p.y;
    setDragState({ draggingHandle: true, dragStart: { x: handle.x, y: handle.y }, dragCurr: p });
    try{ canvas.setPointerCapture(e.pointerId); }catch{}
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e)=>{
    const p = localPoint(e);
    const st = getDragState();
    if (st.draggingHandle){ setDragState({ dragCurr: p }); }
    else if (!st.draggingBlock && st.stdDragCand){
      const dx = p.x - st.stdDragStart.x, dy = p.y - st.stdDragStart.y;
      if ((dx*dx + dy*dy) > 16){ setDragState({ draggingBlock: true, stdDragMoved: true }); }
      if (getDragState().draggingBlock && getDragState().dragBlockRef){
        const d = getDragState();
        d.dragBlockRef.x = Math.round(p.x - d.dragOffset.dx);
        d.dragBlockRef.y = Math.round(p.y - d.dragOffset.dy);
      }
    }
    else if (st.draggingBlock && st.dragBlockRef){
      st.dragBlockRef.x = Math.round(p.x - st.dragOffset.dx);
      st.dragBlockRef.y = Math.round(p.y - st.dragOffset.dy);
    }
  });
  function endDrag(e){
    const st = getDragState();
    if (st.draggingHandle){
      setDragState({ draggingHandle:false, dragStart:null, dragCurr:null });
      onHandleMove && onHandleMove();
      return;
    }
    if (st.draggingBlock){
      setDragState({ draggingBlock:false, dragBlockRef:null, stdDragCand:null, stdDragStart:null, stdDragMoved:false });
      return;
    }
    if (st.stdDragCand && !st.draggingBlock){
      st.stdDragCand.active = !st.stdDragCand.active;
      const ac = ensureAudioContext(); const now = (ac?ac.currentTime:0)+0.0005;
      if (st.stdDragCand.active){
        const nm = noteValue(noteList, st.stdDragCand.noteIndex|0);
        try{ triggerInstrument(instrument, nm, now, panel.dataset?.toy||'bouncer'); }catch{}
      }
      setDragState({ stdDragCand:null, stdDragStart:null, stdDragMoved:false, dragBlockRef:null });
      return;
    }
    if (st.zoomDragCand){
      const p = localPoint(e);
      const t = whichThirdRect(st.zoomDragCand, p.y);
      
      if (t === 'toggle'){ st.zoomDragCand.active = !st.zoomDragCand.active; }
      else if (t === 'up'){ st.zoomDragCand.noteIndex = Math.min(noteList.length-1, (st.zoomDragCand.noteIndex|0)+1); }
      else if (t === 'down'){ st.zoomDragCand.noteIndex = Math.max(0, (st.zoomDragCand.noteIndex|0)-1); }
      const ac = ensureAudioContext(); const now = (ac?ac.currentTime:0)+0.0005;
      const nm = noteValue(noteList, st.zoomDragCand.noteIndex|0);
      try{ triggerInstrument(instrument, nm, now, panel.dataset?.toy||'bouncer'); }catch{}
      setDragState({ zoomDragCand:null, zoomDragStart:null, zoomTapT:null });
      return;
    }
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
}
