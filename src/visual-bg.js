// src/visual-bg.js — subtle background visualiser (mounted inside #board/.board)
let canvas, ctx, host = null;
let resizeAttached = false;

function pickHost(){
  const a = document.getElementById('board');
  const b = document.querySelector('.board');
  return a || b || document.body;
}

function ensureCanvas(){
  if (canvas) return canvas;
  host = pickHost();

  // The root cause of the clipping is `overflow: hidden` on the <body> element,
  // as confirmed by the `inspectBoard()` debug output. By setting it to 'visible',
  // we allow the transformed #board element's children (like the chain canvas)
  // to be drawn outside the viewport bounds without being clipped. This is the
  // most direct fix for the issue.
  document.body.style.overflow = 'visible';

  // --- New Structure to Isolate Canvases from Board Transform ---
  // The board's transform for panning causes clipping on child canvases.
  // To fix this, we create a stable wrapper for the canvases and a separate
  // pannable container for the toys.
  let canvasWrap = host.querySelector('.canvas-wrapper');
  if (!canvasWrap) {
    canvasWrap = document.createElement('div');
    canvasWrap.className = 'canvas-wrapper';
    Object.assign(canvasWrap.style, {
      position: 'absolute', inset: '0', zIndex: '0', pointerEvents: 'none'
    });
    host.prepend(canvasWrap);
  }

  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'intensity-bg';
    // The background canvas now has a z-index of 0, and the chain canvas will have a z-index of 1.
    // They are inside a wrapper that sits behind the toys.
    Object.assign(canvas.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%', zIndex: '0'
    });
    canvasWrap.appendChild(canvas);
  }

  // Move the chain canvas into the new stable wrapper as well.
  const chainCanvas = host.querySelector('#chain-canvas');
  if (chainCanvas && chainCanvas.parentElement !== canvasWrap) {
    canvasWrap.appendChild(chainCanvas);
    // Ensure chain canvas is drawn on top of the background.
    chainCanvas.style.zIndex = '1';
  }

  const cs = getComputedStyle(host);
  if (cs.position === 'static'){ host.style.position = 'relative'; }

  ctx = canvas.getContext('2d');
  onResize();
  if (!resizeAttached) {
    window.addEventListener('resize', onResize);
    resizeAttached = true;
  }
  
  return canvas;
}

function onResize(){
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  // The canvas now lives in a stable wrapper that fills the host, so we can
  // get the size from the host's clientWidth/Height, which are immune to CSS transforms.
  const rect = (host && host!==document.body) ? { width: host.clientWidth, height: host.clientHeight } : { width: window.innerWidth, height: window.innerHeight };
  const w = Math.max(1, Math.floor(rect.width));
  const h = Math.max(1, Math.floor(rect.height));
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  drawStaticBackground();
}

function drawStaticBackground(){
  if (!canvas || !ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function teardown(){
  if (resizeAttached) {
    window.removeEventListener('resize', onResize);
    resizeAttached = false;
  }
  if (canvas && canvas.parentElement) {
    canvas.parentElement.removeChild(canvas);
  }
  canvas = null;
  ctx = null;
}

export function startIntensityVisual(){
  teardown();
  ensureCanvas();
  drawStaticBackground();
}
export function stopIntensityVisual(){
  teardown();
}
