// bouncer-interact.js — pointer/tap/drag handlers for bouncer (full file)
// Map pointer → toy space using **CSS pixels** only.
// Rationale: the toy's physics & hit tests operate in the same space as drawing
// (ctx scaled internally if needed). Using CSS px keeps spawns, drags, and
// edge collisions aligned with the visible canvas.
import { resumeAudioContextIfNeeded } from './audio-core.js';

export function installBouncerInteractions(canvas, panel, {
  sizing, EDGE, blocks, edgeControllers, ensureAudioContext, noteList, noteValue, triggerInstrument, instrument,
  handle, cannonR, hitRect, whichThirdRect,
  setDragState, getDragState, onEdgeEdit, onHandleMove
}){
  function toCssPoint(evt){
    const r = canvas.getBoundingClientRect();
    return { x: evt.clientX - r.left, y: evt.clientY - r.top };
  }
  function endDrag(){
    const st = getDragState();
    if (!st) return;
    if (st.draggingHandle){ setDragState({ draggingHandle:false }); }
    if (st.draggingBlock){ setDragState({ draggingBlock:false, dragBlockRef:null }); }
    if (st.zoomDragCand){ setDragState({ zoomDragCand:null, zoomDragStart:null, zoomTapT:null }); }
  }
  canvas.addEventListener('pointerdown', async (e)=>{
    try { await resumeAudioContextIfNeeded(); } catch {}
    const st = getDragState();
    const p = toCssPoint(e);
    const hit = blocks.find(b => hitRect(p, b));
    if (hit){
      setDragState({ draggingBlock:true, dragBlockRef:hit, dragOffset:{ x:p.x-hit.x, y:p.y-hit.y } });
      return;
    }
    const third = whichThirdRect(p);
    if (third){
      setDragState({ zoomDragCand:{ active:true, noteIndex: third.noteIndex }, zoomDragStart:{x:p.x,y:p.y}, zoomTapT: performance.now() });
      return;
    }
  });
  canvas.addEventListener('pointermove', (e)=>{
    const st = getDragState(); if (!st) return;
    const p = toCssPoint(e);
    if (st.draggingBlock && st.dragBlockRef){
      st.dragBlockRef.x = p.x - st.dragOffset.x;
      st.dragBlockRef.y = p.y - st.dragOffset.y;
    } else if (st.draggingHandle){
      onHandleMove(p);
    } else if (st.zoomDragCand && st.zoomDragCand.active){
      const dx = p.x - st.zoomDragStart.x, dy = p.y - st.zoomDragStart.y;
      if (Math.abs(dx) + Math.abs(dy) > 6){
        setDragState({ zoomDragCand:null, zoomDragStart:null, zoomTapT:null });
      }
    }
  });
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
}

