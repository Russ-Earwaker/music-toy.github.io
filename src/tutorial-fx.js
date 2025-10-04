// src/tutorial-fx.js

let behindCanvas, frontCanvas;
let behindCtx, frontCtx;
let animationFrameId = null;
let particles = [];
const PARTICLES_PER_SEC = 140;

function setupCanvases(behind, front) {
  behindCanvas = behind;
  frontCanvas = front;
  if (behindCanvas) behindCtx = behindCanvas.getContext('2d');
  if (frontCanvas) frontCtx = frontCanvas.getContext('2d');

  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    if (behindCanvas) {
      const rect = behindCanvas.getBoundingClientRect();
      behindCanvas.width = rect.width * dpr;
      behindCanvas.height = rect.height * dpr;
      behindCtx?.scale(dpr, dpr);
    }
    if (frontCanvas) {
      frontCanvas.width = window.innerWidth;
      frontCanvas.height = window.innerHeight;
    }
  };

  window.addEventListener('resize', resize, { passive: true });
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
    speed: 0.005 + Math.random() * 0.001, // 75% slower than original
    amplitude: 22.5 + Math.random() * 22.5, // Increased wander
    frequency: 0.1 + Math.random() * 0.1,
    phase: Math.random() * Math.PI * 2,
    size: 1.5
  };
}

// Draw a subtle origin burst on the behind-canvas so particles appear to emerge from under the task row
function drawOriginParticles(ctx, originEl) {
  if (!ctx || !originEl) return;
  const r = originEl.getBoundingClientRect();
  const x = r.left + r.width * 0.1;
  const y = r.top + r.height * 0.5;
  // soft radial burst
  const grad = ctx.createRadialGradient(x, y, 0, x, y, 24);
  grad.addColorStop(0, 'rgba(120, 170, 255, 0.25)');
  grad.addColorStop(1, 'rgba(120, 170, 255, 0.00)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function startFlight(ctx, startEl, endEl) {
    if (!ctx || !startEl || !endEl) {
        animationFrameId = requestAnimationFrame(() => startFlight(ctx, startEl, endEl));
        return;
    }

    if (!startFlight._lastTs) startFlight._lastTs = performance.now();
    if (typeof startFlight._accum !== 'number') startFlight._accum = 0;

    const now = performance.now();
    const dt = Math.max(0, now - startFlight._lastTs) / 1000;
    startFlight._lastTs = now;

    const startRect = startEl.getBoundingClientRect();
    const endRect = endEl.getBoundingClientRect();
    const sx = startRect.left + startRect.width * 0.9;
    const sy = startRect.top + startRect.height * 0.5;
    const ex = endRect.left + endRect.width * 0.5;
    const ey = endRect.top + endRect.height * 0.5;

    startFlight._accum += PARTICLES_PER_SEC * dt;
    while (startFlight._accum >= 1) {
        particles.push(createParticle(sx, sy, { x: ex, y: ey }));
        startFlight._accum -= 1;
    }

    if(frontCanvas && frontCtx){
        frontCtx.clearRect(0, 0, frontCanvas.width, frontCanvas.height);
        frontCtx.save();
        frontCtx.globalCompositeOperation = 'lighter';
    }
    
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

        if(frontCtx){
            frontCtx.beginPath();
            frontCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            frontCtx.fillStyle = Math.random() > 0.98 ? 'rgba(150,200,255,0.9)' : 'rgba(70,120,220,0.8)';
            frontCtx.fill();
        }
    }

    if(frontCtx) frontCtx.restore();

    animationFrameId = requestAnimationFrame(() => startFlight(ctx, startEl, endEl));
}


export function startParticleStream(originEl, targetEl) {
  const behind = document.querySelector('#tutorial-goals .goal-particles-behind');
  const front  = document.querySelector('.tutorial-particles-front');
  if(!behind || !front) return;
  
  setupCanvases(behind, front);

  drawOriginParticles(behind.getContext('2d'), originEl);

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  particles = [];
  startFlight._lastTs = performance.now();
  startFlight._accum = 0;
  startFlight(front.getContext('2d'), originEl, targetEl);
}

export function stopParticleStream() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  particles = [];
  startFlight._lastTs = undefined;
  startFlight._accum = 0;
  if (frontCanvas && frontCtx) {
    frontCtx.clearRect(0, 0, frontCanvas.width, frontCanvas.height);
  }
  if (behindCanvas && behindCtx) {
    behindCtx.clearRect(0, 0, behindCanvas.width, behindCanvas.height);
  }
}
