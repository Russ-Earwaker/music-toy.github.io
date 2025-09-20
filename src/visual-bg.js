// src/visual-bg.js — subtle background visualiser (mounted inside #board/.board)
import { getIntensity, listToys } from './intensity.js';

let canvas, ctx, raf=0, host=null;

function hueForId(id){
  try{
    let h=0>>>0; const s=String(id);
    for (let i=0;i<s.length;i++){ h = ((h*31) + s.charCodeAt(i)) >>> 0; }
    return h % 360;
  }catch{ return 30; }
}


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

  canvas = document.createElement('canvas');
  canvas.id = 'intensity-bg';
  // The background canvas now has a z-index of 0, and the chain canvas will have a z-index of 1.
  // They are inside a wrapper that sits behind the toys.
  Object.assign(canvas.style, {
    position: 'absolute', inset: '0', width: '100%', height: '100%', zIndex: '0'
  });
  canvasWrap.appendChild(canvas);

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
  window.addEventListener('resize', onResize);
  
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
}

function draw(){
  if (!canvas) return;
  const w = canvas.width, h = canvas.height;
  const dpr = window.devicePixelRatio || 1;
  ctx.clearRect(0,0,w,h);

  // backdrop tint with global intensity (slightly stronger baseline so it's visible)
  const g = getIntensity();
  const g2 = Math.min(1, g*2.0); // reaction boost
  ctx.globalAlpha = 1.0;
  ctx.fillStyle = `rgba(20,24,32, ${0.24 + 0.32*g2})`;
  ctx.fillRect(0,0,w,h);

  // layered sine waves (baseline amplitude so you see motion even at idle)
  const t = performance.now() / 1000;
  const rows = 3;
  for (let r=0;r<rows;r++){
    const base = 0.12;                // baseline motion even at g=0
    const amp = (h/10) * (base + 0.88*g) * (1 - r*0.25);
    const baseY = h*(0.45 + r*0.12);
    const speed = 0.3 + r*0.15;
    ctx.beginPath();
    for (let x=0; x<=w; x+=8){
      const y = baseY + Math.sin((x/dpr)*0.012 + t*speed) * amp;
      if (x===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.strokeStyle = `rgba(240,142,43, ${0.12 + g2*0.24})`;
    ctx.lineWidth = Math.max(1, dpr*1.5);
    ctx.stroke();
  }

  // subtle per-toy bars at bottom
  const barH = Math.max(12*dpr, Math.min(144*dpr, h*0.24));
  const toys = listToys();
  ;
  const gap = 3*dpr;
  const usableW = w - gap*(toys.length+1);
  const bw = toys.length ? Math.max(2*dpr, usableW / Math.max(1,toys.length)) : 0;
  let x = gap;
  ctx.fillStyle = `rgba(203,209,223, ${0.28 + 0.32*g})`;
  for (const id of toys){
    const v = getIntensity(id);
    const v2 = Math.min(1, v*2.2);
    const vv = Math.pow(v2, 0.85);
    const bh = barH * (0.12 + 0.88*vv);
    const hue = hueForId(id);
    // Saturation/Luma/Alpha rise with activity
    const sat = (50 + 45*vv).toFixed(1);
    const lum = (42 + 12*vv).toFixed(1);
    const alp = (0.30 + 0.55*vv).toFixed(3);
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${lum}%, ${alp})`;
    ctx.fillRect(x, h - bh - gap, bw, bh);
    // Outline + small glow cap
    ctx.strokeStyle = `hsla(${hue}, ${Math.max(30, 60-20*vv)}%, ${Math.max(20, 34-10*vv)}%, ${0.8})`;
    ctx.lineWidth = Math.max(1, dpr*0.9);
    ctx.strokeRect(x+0.5*dpr, h - bh - gap + 0.5*dpr, bw - 1*dpr, bh - 1*dpr);
    // Add a brighter inner cap proportional to vv
    const capH = Math.max(1.5*dpr, bh*0.25*vv);
    ctx.fillStyle = `hsla(${hue}, ${Math.min(100, 70+30*vv)}%, ${Math.min(85, 60+25*vv)}%, ${0.35 + 0.45*vv})`;
    ctx.fillRect(x, h - bh - gap, bw, capH);
    x += bw + gap;
}
}

function loop(){
  draw();
  raf = requestAnimationFrame(loop);
}

export function startIntensityVisual(){
  ensureCanvas();
  if (!raf) loop();
}
export function stopIntensityVisual(){
  if (raf){ cancelAnimationFrame(raf); raf=0; }
}
