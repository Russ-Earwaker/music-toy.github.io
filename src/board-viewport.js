// src/board-viewport.js
// Camera for the board: independent pan & zoom (no tilt) + perspective. Phone & PC friendly. <300 lines>.
(function initBoardViewport(){
  const BOARD_ID = "board";
  const STAGE_ID = "board-viewport";
  const PAN_ID = "camera-pan";
  const SCALE_ID = "camera-scale";
  const VIS_ID = "visual-layer";

  const board = document.getElementById(BOARD_ID);
  if (!board) return;

  // ---- Stage wrapper (provides perspective, handles input) ----
  let stage = board.parentElement;
  if (!stage || stage.id !== STAGE_ID){
    stage = document.createElement("div");
    stage.id = STAGE_ID;
    Object.assign(stage.style, {
      position: "relative",
      width: "100%",
      height: "100%",
      overflow: "hidden",
      perspective: "900px",
      touchAction: "none",
    });
    board.parentElement && board.parentElement.insertBefore(stage, board);
  }

  // ---- Camera nodes: pan (translate) outside, scale inside ----
  let camPan = stage.querySelector("#"+PAN_ID);
  if (!camPan){
    camPan = document.createElement("div");
    camPan.id = PAN_ID;
    Object.assign(camPan.style, {
      position: "absolute",
      inset: "0",
      transform: "translate3d(0,0,0)",
      transformStyle: "preserve-3d",
    });
    stage.appendChild(camPan);
  }

  let camScale = camPan.querySelector("#"+SCALE_ID);
  if (!camScale){
    camScale = document.createElement("div");
    camScale.id = SCALE_ID;
    Object.assign(camScale.style, {
      position: "absolute",
      inset: "0",
      transformOrigin: "50% 50%",
      transform: "scale(1)",
      transformStyle: "preserve-3d",
    });
    camPan.appendChild(camScale);
  }

  // Visual layer (for visualisers that should follow the camera)
  let vis = camScale.querySelector("#"+VIS_ID);
  if (!vis){
    vis = document.createElement("div");
    vis.id = VIS_ID;
    Object.assign(vis.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
    });
    camScale.appendChild(vis);
  }

  // Move board into camera scale node
  if (board.parentElement !== camScale){
    camScale.appendChild(board);
    // Ensure board fills the camera scale region
    Object.assign(board.style, {
      position: "absolute",
      inset: "0",
      transform: "none",
    });
  }

  // ---- Camera state ----
  const state = {
    scale: 1,
    x: 0,
    y: 0,
    persp: 900,        // px. larger = flatter perspective
    minScale: 0.5,
    maxScale: 2.5,
    minPersp: 300,
    maxPersp: 2000,
  };

  function clamp(n, a, b){ return Math.min(b, Math.max(a, n)); }

  function emit(){
    const ev = new CustomEvent("board-camera", { detail: { ...state } });
    stage.dispatchEvent(ev);
  }
  function apply(){
    stage.style.setProperty("--bv-scale", String(state.scale));
    stage.style.setProperty("--bv-x", String(state.x));
    stage.style.setProperty("--bv-y", String(state.y));
    stage.style.setProperty("--bv-persp", String(state.persp));
    stage.style.perspective = state.persp + "px";
    camPan.style.transform = `translate3d(${state.x}px, ${state.y}px, 0)`;
    camScale.style.transform = `scale(${state.scale})`;
    emit();
  }

  // Zoom keeping cursor point stable
  function zoomAt(cx, cy, delta){
    const prev = state.scale;
    const next = clamp(prev * (delta > 0 ? 0.9 : 1.1), state.minScale, state.maxScale);
    if (next === prev) return;
    const r = next / prev;
    const rect = stage.getBoundingClientRect();
    const p = { x: cx - rect.left, y: cy - rect.top };
    const c = { x: rect.width/2, y: rect.height/2 };
    // pan' = r*pan + (1 - r)*(p - c)
    state.x = r*state.x + (1 - r)*(p.x - c.x);
    state.y = r*state.y + (1 - r)*(p.y - c.y);
    state.scale = next;
    apply();
  }

  // Public API
  window.BoardViewport = {
    zoomIn(){ zoomAt(stage.clientWidth/2, stage.clientHeight/2, -1); },
    zoomOut(){ zoomAt(stage.clientWidth/2, stage.clientHeight/2, +1); },
    zoomReset(){ state.scale = 1; state.x = 0; state.y = 0; state.persp = 900; apply(); },
    setPerspective(px){ state.persp = clamp(Number(px)||900, state.minPersp, state.maxPersp); apply(); },
    pan(dx, dy){ state.x += dx; state.y += dy; apply(); },
    attachToVisualLayer(el){ if (el && el.parentElement !== vis) vis.appendChild(el); },
    getState(){ return { ...state }; },
  };

  // ---- Input handling ----
  let panning = false, lastX = 0, lastY = 0, pointers = new Map(), lastDist = 0;

  function beganOnPanel(target){ return !!(target && target.closest && target.closest(".toy-panel")); }

  stage.addEventListener("pointerdown", (e)=>{
    if (beganOnPanel(e.target)) return;
    stage.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if (pointers.size === 1){
      panning = true; lastX = e.clientX; lastY = e.clientY;
    } else if (pointers.size === 2){
      const ps = Array.from(pointers.values());
      lastDist = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
    }
    e.preventDefault();
  });

  stage.addEventListener("pointermove", (e)=>{
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});

    if (pointers.size === 1 && panning){
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      state.x += dx; state.y += dy; apply();
      e.preventDefault();
    } else if (pointers.size === 2){
      const ps = Array.from(pointers.values());
      const dist = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
      if (lastDist){
        const delta = dist - lastDist;
        zoomAt((ps[0].x + ps[1].x)/2, (ps[0].y + ps[1].y)/2, delta < 0 ? +1 : -1);
      }
      lastDist = dist;
      e.preventDefault();
    }
  });

  stage.addEventListener("pointerup", (e)=>{
    pointers.delete(e.pointerId);
    if (pointers.size < 2) lastDist = 0;
    if (pointers.size === 0) panning = false;
  });
  stage.addEventListener("pointercancel", (e)=>{
    pointers.delete(e.pointerId);
    if (pointers.size < 2) lastDist = 0;
    if (pointers.size === 0) panning = false;
  });

  // Wheel: default = ZOOM scale; hold Alt to adjust perspective instead
  stage.addEventListener("wheel", (e)=>{
    if (e.altKey){
      const step = (state.maxPersp - state.minPersp) / 30;
      const next = (e.deltaY > 0) ? state.persp + step : state.persp - step;
      window.BoardViewport.setPerspective(next);
    } else {
      zoomAt(e.clientX, e.clientY, e.deltaY);
    }
    e.preventDefault();
  }, { passive:false });

  // Double-click to reset
  stage.addEventListener("dblclick", ()=> window.BoardViewport.zoomReset());

  apply();
})();