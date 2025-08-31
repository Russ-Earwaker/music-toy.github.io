// src/bouncer-interactions.js — pointer interactions (<=300 lines)

import { whichThirdRect } from './toyhelpers.js';
import { handleEdgeControllerEdit } from './bouncer-edges.js';
import { stepIndexUp, stepIndexDown } from './note-helpers.js';
import { ensureAudioContext } from './audio-core.js';
import { triggerInstrument } from './audio-samples.js';

function fireNote(inst, name, toyId){
  try{
    const ac = ensureAudioContext();
    const t  = (ac ? ac.currentTime : 0) + 0.0005;
    const instr = (typeof inst === 'function') ? inst() : inst;
    triggerInstrument(instr, name, t, toyId);
  }catch(e){}
}

export function installBouncerInteractions({
  panel, canvas, sizing, toWorld, EDGE, physW, physH, ballR, __getSpeed,
  blocks, edgeControllers, handle,
  spawnBallFrom, setNextLaunchAt, setBallOut,
  instrument, toyId, noteList,
  setAim, isAdvanced
}){
  let draggingBlock = false, dragBlockRef = null, dragOffset = {dx:0, dy:0};
  let draggingHandle = false, aimStart = null, aimCurr = null;
  let tapBlock = null, tapEdge = null, tapStart = null, tapMoved = false;

  function localPoint(evt){
    const r = canvas.getBoundingClientRect();
    const x = (evt.clientX - r.left) * ((canvas.width||1) / Math.max(1, r.width));
    const y = (evt.clientY - r.top)  * ((canvas.height||1) / Math.max(1, r.height));
    return { x, y };
  }

  function velFrom(hx, hy, px, py){
    let dx = (px - hx), dy = (py - hy);
    let len = Math.hypot(dx, dy) || 1;
    let ux = dx/len, uy = dy/len;
    if (len < 3){ ux = 0; uy = -1; }
    const speed = (typeof __getSpeed === 'function') ? __getSpeed() : 1;
    const BASE = 4.8;
    const v = BASE * speed;
    return { vx: ux * v, vy: uy * v };
  }

  function onPointerDown(e){
    const p = toWorld(localPoint(e));
    const hitEdge = edgeControllers.find(c => p.x>=c.x && p.x<=c.x+c.w && p.y>=c.y && p.y<=c.y+c.h);
    const hitBlock = blocks.find(b => p.x>=b.x && p.x<=b.x+b.w && p.y>=b.y && p.y<=b.y+b.h && b.fixed!==true);

    tapStart = { x:p.x, y:p.y }; tapMoved = false; tapBlock = null; tapEdge = null;

    if (hitEdge){
      tapEdge = hitEdge;
      try{ canvas.setPointerCapture(e.pointerId); }catch(e){}
      e.preventDefault(); return;
    }

    if (hitBlock){
      tapBlock = hitBlock;
      // Prepare for potential drag; promote later on move threshold
      dragBlockRef = hitBlock; dragOffset = { dx: p.x - hitBlock.x, dy: p.y - hitBlock.y };
      try{ canvas.setPointerCapture(e.pointerId); }catch(e){}
      e.preventDefault(); return;
    }

    // Click & drag anywhere to launch: anchor handle at start, leave it there
    aimStart = { x: p.x, y: p.y };
    handle.x = Math.round(p.x); handle.y = Math.round(p.y);
    draggingHandle = true; aimCurr = p;
    if (setAim) setAim({ active:true, sx:p.x, sy:p.y, cx:p.x, cy:p.y });
    try{ canvas.setPointerCapture(e.pointerId); }catch(e){}
    e.preventDefault();
  }

  function onPointerMove(e){
    const p = toWorld(localPoint(e));

    // Promote to dragging when threshold exceeded
    if (dragBlockRef && !draggingBlock){
      const dx = p.x - (tapStart ? tapStart.x : p.x);
      const dy = p.y - (tapStart ? tapStart.y : p.y);
      if (Math.abs(dx)+Math.abs(dy) > 3){ draggingBlock = true; }
    }

    if (draggingBlock && dragBlockRef){
      dragBlockRef.x = Math.round(p.x - dragOffset.dx);
      dragBlockRef.y = Math.round(p.y - dragOffset.dy);
      tapMoved = true;
      return;
    }
    if (draggingHandle){
      aimCurr = p;
      if (setAim) setAim({ active:true, cx:p.x, cy:p.y });
      return;
    }
    if (!tapMoved && tapStart){
      const dx = p.x - tapStart.x, dy = p.y - tapStart.y;
      if (Math.abs(dx)+Math.abs(dy) > 3) tapMoved = true;
    }
  }

  function onPointerUp(e){
    const p = toWorld(localPoint(e));

    // Finish block drag or treat as tap
    if (dragBlockRef){
      if (!draggingBlock){
        const t = whichThirdRect(tapBlock||dragBlockRef, p.y);
        const blk = tapBlock || dragBlockRef;
        const adv = typeof isAdvanced==='function' ? !!isAdvanced() : (panel && panel.classList && panel.classList.contains('toy-zoomed'));
        if (t === 'toggle' || !adv){ blk.active = !(blk.active!==false); }
        else if (t === 'up' && adv){ stepIndexUp(blk, (noteList || [])); }
        else if (t === 'down' && adv){ stepIndexDown(blk, (noteList || [])); }
        const nm = (noteList||[])[blk.noteIndex||0] || blk.noteName;
        if (nm) fireNote(instrument, nm, toyId);
      }
      draggingBlock = false; dragBlockRef = null; tapBlock = null;
      try{ canvas.releasePointerCapture(e.pointerId); }catch(e){}
      return;
    }

    // Edge cube tap (no drag)
    if (tapEdge){
      handleEdgeControllerEdit(tapEdge, p.y, whichThirdRect, (noteList || []));
      try{
        const nm=(noteList||[])[tapEdge.noteIndex||0] || tapEdge.noteName;
        if (nm) fireNote(instrument, nm, toyId);
      }catch(e){}
      tapEdge = null; 
      try{ canvas.releasePointerCapture(e.pointerId); }catch(e){} 
      return;
    }

    // Launch
    if (draggingHandle){
      const hsx = aimStart.x, hsy = aimStart.y;
      const { vx, vy } = velFrom(hsx, hsy, p.x, p.y);
      spawnBallFrom({ x: hsx, y: hsy, vx, vy, r: (ballR?ballR():6) });
      draggingHandle = false; aimStart = null; aimCurr = null;
      if (setAim) setAim({ active:false });
      try{ canvas.releasePointerCapture(e.pointerId); }catch(e){}
      return;
    }
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  return { dispose(){
    try{
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
    }catch(e){}
  }};
}
