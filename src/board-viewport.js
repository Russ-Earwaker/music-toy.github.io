// src/board-viewport.js — pan & zoom from anywhere (clean, <=300 lines)
(function(){
  if (window.__boardViewport) return; window.__boardViewport=true;

  const stage = document.getElementById('board');
  if (!stage) return;

  // Load saved viewport
  let scale = 1, x = 0, y = 0;
  try{
    const saved = JSON.parse(localStorage.getItem('boardViewport')||'null');
    if (saved && typeof saved==='object'){
      if (Number.isFinite(saved.scale)) scale = Math.max(0.5, Math.min(2.5, saved.scale));
      if (Number.isFinite(saved.x)) x = saved.x|0;
      if (Number.isFinite(saved.y)) y = saved.y|0;
    }
  }catch{}
  window.__boardScale = scale;

  function persist(){
    try{ localStorage.setItem('boardViewport', JSON.stringify({ scale, x, y })); }catch{}
  }
  function apply(){
    stage.style.transformOrigin = '50% 50%';
    stage.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    stage.style.setProperty('--bv-scale', String(scale));
    // expose current viewport to other modules
    window.__boardScale = scale;
    window.__boardX = x;
    window.__boardY = y;
    persist();
  }

  // --- Panning ---
  let panning = false, sx=0, sy=0, ox=0, oy=0;
  document.addEventListener('mousedown', (e)=>{
    if (window.__tutorialZoomLock) return;
    const overPanel = !!e.target.closest('.toy-panel');
    if (overPanel) return;        // let panel dragging handle their own
    const overTopbar = !!e.target.closest('#topbar');
    if (overTopbar) return;       // let topbar controls handle their own
    if (e.button!==0 && e.button!==1) return;
    panning = true; sx=e.clientX; sy=e.clientY; ox=x; oy=y;
    document.body.classList.add('panning');
    e.preventDefault();
  }, true);

  window.addEventListener('mousemove', (e)=>{
    if (!panning) return;
    x = ox + (e.clientX - sx);
    y = oy + (e.clientY - sy);
    window.__boardScale = scale; apply();
  }, true);

  window.addEventListener('mouseup', ()=>{
    if (!panning) return;
    panning = false;
    document.body.classList.remove('panning');
    persist();
  }, true);

  // --- Zooming --- (global: anywhere in the window)
  window.addEventListener('wheel', (e)=>{
    if (window.__tutorialZoomLock) { 
      e.preventDefault(); 
      return; 
    }
    // zoom around mouse position
    const delta = e.deltaY;
    const rect = stage.getBoundingClientRect();
    const mx = (e.clientX - rect.left - x) / scale;
    const my = (e.clientY - rect.top  - y) / scale;

    const old = scale;
    const factor = Math.pow(1.0015, -delta);
    scale = Math.max(0.5, Math.min(2.5, scale * factor));

    // keep point under cursor stable
    x = e.clientX - rect.left - mx * scale;
    y = e.clientY - rect.top  - my * scale;
    window.__boardScale = scale; apply();
    e.preventDefault();
    persist();
  }, { passive:false });

  // helpers
  window.panTo = (nx, ny)=>{ x = nx|0; y = ny|0; window.__boardScale = scale; apply(); };
  window.setBoardScale = (sc)=>{ scale = Math.max(0.5, Math.min(2.5, Number(sc)||1)); window.__boardScale = scale; apply(); };

  // Center the board on a specific element at a desired scale
  window.centerBoardOnElement = (el, desiredScale = scale) => {
    if (!el || !stage) return;
    // Use current scale (pre-transform sizes from rects / divide by scale)
    const curScale = Number(window.__boardScale) || scale;
    const boardRect = stage.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();

    // Element center in board's unscaled coordinates
    const centerX = (elRect.left - boardRect.left) / curScale + (elRect.width  / curScale) / 2;
    const centerY = (elRect.top  - boardRect.top ) / curScale + (elRect.height / curScale) / 2;

    // Apply desired scale, then compute translate so element center == viewport center
    scale = Math.max(0.5, Math.min(2.5, Number(desiredScale)||1));
    const viewportCX = (window.innerWidth  / 2);
    const viewportCY = (window.innerHeight / 2);

    const boardWidth = stage.offsetWidth;
    const boardHeight = stage.offsetHeight;
    const centerX_from_center = centerX - boardWidth / 2;
    const centerY_from_center = centerY - boardHeight / 2;

    x = Math.round(viewportCX - scale * centerX_from_center);
    y = Math.round(viewportCY - scale * centerY_from_center);

    window.__boardScale = scale;
    window.__boardX = x;
    window.__boardY = y;
    apply();
  };

  window.__boardScale = scale; apply();
})();
