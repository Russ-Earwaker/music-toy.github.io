// src/visual-bg.js — subtle background visualiser for global/per-toy intensity
import { getIntensity, listToys } from './intensity.js';

let canvas, ctx, raf=0;

function ensureCanvas(){
  if (canvas) return canvas;
  canvas = document.createElement('canvas');
  canvas.id = 'intensity-bg';
  Object.assign(canvas.style, {
    position:'fixed', inset:'0', zIndex:'0', pointerEvents:'none'
  });
  document.body.prepend(canvas);
  ctx = canvas.getContext('2d');
  onResize();
  window.addEventListener('resize', onResize);
  return canvas;
}
function onResize(){
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  canvas.style.width = innerWidth+'px';
  canvas.style.height = innerHeight+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
}

function draw(){
  const w = canvas.width / (window.devicePixelRatio||1);
  const h = canvas.height / (window.devicePixelRatio||1);
  const g = getIntensity();

  // Clear with a faint tinted backdrop influenced by global intensity
  ctx.clearRect(0,0,w,h);
  const base = Math.floor(10 + g * 30);
  ctx.fillStyle = `rgba(${base}, ${base}, ${base}, 0.25)`;
  ctx.fillRect(0,0,w,h);

  // Gentle moving waves
  const t = performance.now() / 1000;
  ctx.globalAlpha = 0.25 + 0.35*g;
  ctx.beginPath();
  for (let x=0;x<=w;x+=8){
    const y = h*0.6 + Math.sin((x*0.01)+(t*0.8)) * 14 * (0.2+g) + Math.sin((x*0.02)-(t*0.6)) * 8 * (0.2+g);
    if (x===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Per-toy bars at the bottom
  const toys = listToys();
  const barW = Math.max(8, Math.floor(w / Math.max(8,toys.length*2)));
  const gap = Math.max(6, Math.floor(barW*0.5));
  let x = gap;
  for (const id of toys){
    const v = Math.pow(getIntensity(id), 0.8);
    const bh = Math.max(2, Math.floor((h*0.18) * v));
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x, h - bh - 12, barW, bh);
    x += barW + gap;
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
