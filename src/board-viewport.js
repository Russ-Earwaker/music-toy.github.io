// src/board-viewport.js — pan & zoom from anywhere (clean, <=300 lines)
import { overviewMode } from './overview-mode.js';
(function(){
  if (window.__boardViewport) return; window.__boardViewport=true;

  const stage = document.getElementById('board');
  if (!stage) return;

  // Load saved viewport
  let scale = 1, x = 0, y = 0;
  try{
    const savedStr = localStorage.getItem('boardViewport')||'null';
    const saved = JSON.parse(savedStr);
    if (saved && typeof saved==='object'){
      const savedScale = saved.scale;
      if (Number.isFinite(savedScale)) {
        scale = Math.max(0.1, Math.min(2.5, savedScale));
      }
      if (Number.isFinite(saved.x)) x = saved.x|0;
      if (Number.isFinite(saved.y)) y = saved.y|0;
    }
  }catch(e){ console.error('board-viewport: failed to load viewport', e); }
  window.__boardScale = scale;
  const SCALE_EVENT_EPSILON = 1e-4;
  let lastNotifiedScale = scale;

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
    if (Math.abs(scale - lastNotifiedScale) > SCALE_EVENT_EPSILON){
      lastNotifiedScale = scale;
      try {
        window.dispatchEvent(new CustomEvent('board:scale', { detail: { scale } }));
      } catch (err) {
        console.warn('[board-viewport] scale event dispatch failed', err);
      }
    }
    persist();
  }

  function zoomAt(clientX, clientY, factor) {
    const rect = stage.getBoundingClientRect();
    const boardCenterX = rect.left + rect.width / 2;
    const boardCenterY = rect.top + rect.height / 2;

    const mouseXFromCenter = clientX - boardCenterX;
    const mouseYFromCenter = clientY - boardCenterY;

    const mx = mouseXFromCenter / scale;
    const my = mouseYFromCenter / scale;

    const oldScale = scale;
    scale = Math.max(0.1, Math.min(2.5, scale * factor));

    x -= mx * (scale - oldScale);
    y -= my * (scale - oldScale);

    if (scale < overviewMode.state.zoomThreshold) {
        overviewMode.enter();
    } else {
        overviewMode.exit(false);
    }

    window.__boardScale = scale; 
    apply();
    persist();
  }

  // --- Zooming --- (global: anywhere in the window)
  window.addEventListener('wheel', (e)=>{
    if (window.__tutorialZoomLock) { 
      e.preventDefault(); 
      return; 
    }
    const factor = Math.pow(1.0015, -e.deltaY);
    zoomAt(e.clientX, e.clientY, factor);
    e.preventDefault();
  }, { passive:false });

  // helpers
  window.panTo = (nx, ny)=>{ x = nx|0; y = ny|0; window.__boardScale = scale; apply(); };
  window.panBy = (dx, dy)=>{ x += dx; y += dy; apply(); };
  window.zoomAt = zoomAt;
  window.setBoardScale = (sc)=>{ 
    scale = Math.max(0.1, Math.min(2.5, Number(sc)||1)); 
    window.__boardScale = scale; 
    apply(); 
  };
  window.resetBoardView = ()=>{
    scale = 1;
    x = 0;
    y = 0;
    window.__boardScale = scale;
    window.__boardX = x;
    window.__boardY = y;
    apply();
  };

  // Center the board on a specific element at a desired scale
  window.centerBoardOnElement = (el, desiredScale = scale) => {
    if (!el || !stage) return;
    const curScale = Number(window.__boardScale) || scale;
    const boardRect = stage.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();

    const centerX = (elRect.left - boardRect.left) / curScale + (elRect.width  / curScale) / 2;
    const centerY = (elRect.top  - boardRect.top ) / curScale + (elRect.height / curScale) / 2;

    scale = Math.max(0.1, Math.min(2.5, Number(desiredScale)||1));
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
