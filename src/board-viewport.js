// src/board-viewport.js
// Pan & zoom camera for the board (no tilt/perspective).
// Minimal, non-destructive, and phone/PC friendly. <300 lines>
(function initBoardViewport(){
  const BOARD_ID = "board";
  const STAGE_ID = "board-viewport";
  const PAN_ID = "camera-pan";
  const SCALE_ID = "camera-scale";

  const board = document.getElementById(BOARD_ID);
  if (!board) return;

  // Create a wrapper stage around #board if not present
  let stage = board.parentElement && board.parentElement.id === STAGE_ID
    ? board.parentElement
    : null;
  if (!stage){
    stage = document.createElement("div");
    stage.id = STAGE_ID;
    // Inherit layout; don't alter parent's flow
    stage.style.width = "100%";
    stage.style.height = "100%";
    stage.style.position = "relative";
    stage.style.overflow = "hidden";
    // Replace #board in DOM with stage, then move #board inside
    const parent = board.parentNode;
    parent.replaceChild(stage, board);
    stage.appendChild(board);
  }

  // Camera nodes
  let camPan = stage.querySelector("#"+PAN_ID);
  if (!camPan){
    camPan = document.createElement("div");
    camPan.id = PAN_ID;
    camPan.style.position = "absolute";
    camPan.style.inset = "0";
    camPan.style.transform = "translate3d(0,0,0)";
    stage.appendChild(camPan);
  }
  let camScale = camPan.querySelector("#"+SCALE_ID);
  if (!camScale){
    camScale = document.createElement("div");
    camScale.id = SCALE_ID;
    camScale.style.position = "absolute";
    camScale.style.inset = "0";
    camScale.style.transformOrigin = "50% 50%";
    camScale.style.transform = "scale(1)";
    camPan.appendChild(camScale);
  }

  // Move board into camScale (preserve its own styles)
  if (board.parentElement !== camScale){
    camScale.appendChild(board);
  }

  // Camera state
  const state = { scale: 1, x: 0, y: 0, minScale: 0.5, maxScale: 2.5 };
  function clamp(n,a,b){ return Math.min(b, Math.max(a,n)); }
  function apply(){
    camPan.style.transform = `translate3d(${state.x}px, ${state.y}px, 0)`;
    camScale.style.transform = `scale(${state.scale})`;
  }
  function zoomAt(cx, cy, delta){
    const prev = state.scale;
    const next = clamp(prev * (delta > 0 ? 0.9 : 1.1), state.minScale, state.maxScale);
    if (next === prev) return;
    const rect = stage.getBoundingClientRect();
    const p = { x: cx - rect.left, y: cy - rect.top };
    const c = { x: rect.width/2, y: rect.height/2 };
    const r = next / prev;
    state.x = r*state.x + (1 - r)*(p.x - c.x);
    state.y = r*state.y + (1 - r)*(p.y - c.y);
    state.scale = next;
    apply();
  }
  function reset(){ state.scale = 1; state.x = 0; state.y = 0; apply(); }

  // Expose API
  window.BoardViewport = {
    zoomIn(){ zoomAt(stage.clientWidth/2, stage.clientHeight/2, -1); },
    zoomOut(){ zoomAt(stage.clientWidth/2, stage.clientHeight/2, +1); },
    zoomReset: reset,
    pan(dx, dy){ state.x += dx; state.y += dy; apply(); },
    getState(){ return { ...state }; },
  };

  // --- Input handling ---
  let isPanning = false, lastX = 0, lastY = 0;
  let zoomDrag = false, zoomAnchor = {x:0,y:0};

  function beganOnPanel(target){ return !!(target && target.closest && target.closest(".toy-panel")); }

  // Left-drag background to pan
  stage.addEventListener("pointerdown", (e)=>{
    if (e.button === 1){ // middle button: drag to zoom
      zoomDrag = true;
      zoomAnchor.x = e.clientX; zoomAnchor.y = e.clientY;
      stage.setPointerCapture?.(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    if (beganOnPanel(e.target)) return;
    isPanning = true;
    lastX = e.clientX; lastY = e.clientY;
    stage.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });
  stage.addEventListener("pointermove", (e)=>{
    if (zoomDrag){
      const dy = e.clientY - zoomAnchor.y;
      if (Math.abs(dy) > 0){
        const steps = -dy * 0.02; // drag up to zoom in
        const times = Math.max(1, Math.min(10, Math.floor(Math.abs(steps))));
        const dir = steps > 0 ? -1 : +1;
        for (let i=0;i<times;i++) zoomAt(e.clientX, e.clientY, dir);
      }
      zoomAnchor.x = e.clientX; zoomAnchor.y = e.clientY;
      e.preventDefault();
      return;
    }
    if (!isPanning) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    state.x += dx; state.y += dy; apply();
    e.preventDefault();
  });
  function endPointer(e){ isPanning = false; zoomDrag = false; }
  stage.addEventListener("pointerup", endPointer);
  stage.addEventListener("pointercancel", endPointer);
  stage.addEventListener("pointerleave", endPointer);

  // Wheel = zoom
  stage.addEventListener("wheel", (e)=>{
    zoomAt(e.clientX, e.clientY, e.deltaY);
    e.preventDefault();
  }, { passive:false });

  // Pinch to zoom (2 pointers)
  let p1=null,p2=null,lastDist=0;
  stage.addEventListener("pointerdown", (e)=>{
    if (e.pointerType !== "touch") return;
    if (!p1) p1 = {id:e.pointerId,x:e.clientX,y:e.clientY};
    else if (!p2) p2 = {id:e.pointerId,x:e.clientX,y:e.clientY};
  });
  stage.addEventListener("pointermove", (e)=>{
    if (e.pointerType !== "touch") return;
    if (p1 && e.pointerId===p1.id){ p1.x=e.clientX; p1.y=e.clientY; }
    if (p2 && e.pointerId===p2.id){ p2.x=e.clientX; p2.y=e.clientY; }
    if (p1 && p2){
      const dist = Math.hypot(p1.x-p2.x, p1.y-p2.y);
      if (lastDist){
        const delta = dist - lastDist;
        zoomAt((p1.x+p2.x)/2, (p1.y+p2.y)/2, delta<0 ? +1 : -1);
      }
      lastDist = dist;
    }
  });
  function clearTouch(e){
    if (p1 && e.pointerId===p1.id) p1=null;
    if (p2 && e.pointerId===p2.id) p2=null;
    if (!p1 || !p2) lastDist=0;
  }
  stage.addEventListener("pointerup", clearTouch);
  stage.addEventListener("pointercancel", clearTouch);

  // Double-click to reset
  stage.addEventListener("dblclick", ()=> reset());
})();