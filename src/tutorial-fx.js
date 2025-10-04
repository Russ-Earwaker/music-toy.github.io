// src/tutorial-fx.js

let fxCanvas = null;
let fxCtx = null;
let animationFrameId = null;
let particles = [];
const PARTICLES_PER_SEC = 140;

function ensureCanvas() {
  if (fxCanvas) return;
  fxCanvas = document.createElement('canvas');
  fxCanvas.id = 'tutorial-fx-canvas';
  Object.assign(fxCanvas.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100vw',
    height: '100vh',
    pointerEvents: 'none',
    zIndex: '550' // Between board and tutorial panel
  });
  document.body.appendChild(fxCanvas);
  fxCtx = fxCanvas.getContext('2d');

  const resize = () => {
    fxCanvas.width = window.innerWidth;
    fxCanvas.height = window.innerHeight;
  };
  window.addEventListener('resize', resize);
  resize();
}

function createParticle(x, y, endPos) {
  return {
    x,
    y,
    startX: x,
    startY: y,
    endX: endPos.x,
    endY: endPos.y,
    progress: 0,
    speed: 0.01 + Math.random() * 0.002,
    amplitude: 11.25 + Math.random() * 11.25,
    frequency: 0.1 + Math.random() * 0.1,
    phase: Math.random() * Math.PI * 2,
    size: 1.5
  };
}

function animate(startEl, endEl) {
  if (!fxCtx || !fxCanvas || !startEl || !endEl) {
    animationFrameId = requestAnimationFrame(() => animate(startEl, endEl));
    return;
  }

  if (!animate._lastTs) animate._lastTs = performance.now();
  if (typeof animate._accum !== 'number') animate._accum = 0;

  const now = performance.now();
  const dt = Math.max(0, now - animate._lastTs) / 1000;
  animate._lastTs = now;

  const startRect = startEl.getBoundingClientRect();
  const endRect = endEl.getBoundingClientRect();
  const sx = startRect.left + startRect.width * 0.9;
  const sy = startRect.top + startRect.height * 0.5;
  const ex = endRect.left + endRect.width * 0.5;
  const ey = endRect.top + endRect.height * 0.5;

  animate._accum += PARTICLES_PER_SEC * dt;
  while (animate._accum >= 1) {
    particles.push(createParticle(sx, sy, { x: ex, y: ey }));
    animate._accum -= 1;
  }

  fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
  fxCtx.save();
  fxCtx.globalCompositeOperation = 'lighter';

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.progress = Math.min(1, p.progress + p.speed * (dt * 60));
    const t = p.progress;

    p.x = p.startX + (p.endX - p.startX) * t;
    p.y = p.startY + (p.endY - p.startY) * t + Math.sin(p.phase + t * Math.PI * 2 * p.frequency) * p.amplitude;

    if (p.progress >= 1) {
      particles.splice(i, 1);
      continue;
    }

    fxCtx.beginPath();
    fxCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    fxCtx.fillStyle = Math.random() > 0.98 ? 'rgba(150,200,255,0.9)' : 'rgba(70,120,220,0.8)';
    fxCtx.fill();
  }

  fxCtx.restore();

  animationFrameId = requestAnimationFrame(() => animate(startEl, endEl));
}

export function startParticleStream(startEl, endEl) {
  ensureCanvas();
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  particles = [];
  animate._lastTs = performance.now();
  animate._accum = 0;
  animate(startEl, endEl);
}

export function stopParticleStream() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  particles = [];
  animate._lastTs = undefined;
  animate._accum = 0;
  if (fxCanvas && fxCtx) {
    fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
  }
}
