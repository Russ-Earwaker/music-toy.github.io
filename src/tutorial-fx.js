// src/tutorial-fx.js

let behindCanvas, frontCanvas;
let behindCtx, frontCtx;
let animationFrameId = null;
let particles = [];
let desiredFrontLayer = 'front';
const PARTICLES_PER_SEC = 60;
const BURST_COLOR_RGB = { r: 92, g: 178, b: 255 };
const burstColor = (alpha = 1) => `rgba(${BURST_COLOR_RGB.r}, ${BURST_COLOR_RGB.g}, ${BURST_COLOR_RGB.b}, ${alpha})`;

function setupCanvases(behind, front) {
  behindCanvas = behind;
  frontCanvas = front;
  if (behindCanvas) behindCtx = behindCanvas.getContext('2d');
  if (frontCanvas) frontCtx = frontCanvas.getContext('2d');

  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    if (behindCanvas && behindCanvas.parentElement) {
      const rect = behindCanvas.parentElement.getBoundingClientRect();
      behindCanvas.width = rect.width * dpr;
      behindCanvas.height = rect.height * dpr;
      behindCtx?.scale(dpr, dpr);
    }
    if (frontCanvas) {
      frontCanvas.width = window.innerWidth * dpr;
      frontCanvas.height = window.innerHeight * dpr;
      frontCtx?.scale(dpr, dpr);
    }
  };

  window.addEventListener('resize', resize, { passive: true });
  resize();
  applyFrontCanvasLayer(desiredFrontLayer);
}

function applyFrontCanvasLayer(mode = 'front') {
  desiredFrontLayer = mode;
  if (!frontCanvas) return;
  if (mode === 'behind-target') {
    frontCanvas.dataset.tutorialLayer = 'behind-target';
    try {
      frontCanvas.style.setProperty('z-index', '400', 'important');
    } catch {
      frontCanvas.style.zIndex = '400';
    }
  } else if (frontCanvas.dataset.tutorialLayer) {
    delete frontCanvas.dataset.tutorialLayer;
    try {
      frontCanvas.style.removeProperty('z-index');
    } catch {
      frontCanvas.style.zIndex = '';
    }
  }
}
function createParticle(x, y, endPos) {
  return {
    x,
    y,
    startX: x,
    startY: y,
    endX: endPos ? endPos.x : 0,
    endY: endPos ? endPos.y : 0,
    progress: 0,
    speed: 0.005 + Math.random() * 0.001,
    amplitude: 10 + Math.random() * 22.5,
    frequency: 0.6 + Math.random() * 0.1,
    phase: Math.random() * Math.PI * 2,
    size: 1.5 + Math.random() * 0.5,
    life: 1.0,
    isBurst: false,
    isTrail: false,
    isExplosion: false,
    isSun: false,
    isSweeper: false,
    vx: 0,
    vy: 0,
    orbitRadius: 0,
    orbitPhase: 0,
    orbitSpeed: 0,
  };
}

function createBurst(x, y, endPos) {
  // Sun
  const sun = createParticle(x, y, endPos);
  sun.isSun = true;
  sun.isBurst = true; // Sun is part of the burst
  sun.size = 10.0;
  sun.speed = 0.012;
  sun.amplitude = 0;
  particles.push(sun);

  // 2 Orbiters
  for (let i = 0; i < 2; i++) {
    const p = createParticle(x, y, endPos);
    p.isBurst = true;
    p.isSun = false;
    p.speed = 0.012;
    p.orbitRadius = 36;
    p.orbitPhase = i * Math.PI; // Start on opposite sides
    p.orbitSpeed = 0.22 + Math.random() * 0.06;
    particles.push(p);
  }

  // 2 Sweepers
  for (let i = 0; i < 2; i++) {
    const p = createParticle(x, y, endPos);
    p.isBurst = true;
    p.isSweeper = true;
    p.speed = 0.006;
    p.size = 3.2;
    p.amplitude = 36;
    p.phase = i * Math.PI;
    p.frequency = 1;
    particles.push(p);
  }
}

function startFlight(ctx, startEl, endEl) {
    if (!ctx || !startEl || !endEl) {
        animationFrameId = requestAnimationFrame(() => startFlight(ctx, startEl, endEl));
        return;
    }

    if (!startFlight._lastTs) startFlight._lastTs = performance.now();
    if (typeof startFlight._accum !== 'number') startFlight._accum = 0;

    const now = performance.now();
    const shimmerPhase = now * 0.012;
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

    const sun = particles.find(p => p.isSun);
    if (sun) {
        sun.progress = Math.min(1, sun.progress + sun.speed * (dt * 60));
        sun.x = sun.startX + (sun.endX - sun.startX) * sun.progress;
        sun.y = sun.startY + (sun.endY - sun.startY) * sun.progress;

        // Sun's trail
        if (sun.progress < 1) {
            const trailP = createParticle(sun.x, sun.y, {});
            trailP.isTrail = true;
            trailP.life = 0.45;
            trailP.size = sun.size * 0.8;
            trailP.trailBaseSize = sun.size;
            particles.push(trailP);
        }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];

        if (p.isBurst && !p.isSun && !p.isSweeper) { // Orbiter
            if (sun) {
                p.progress = sun.progress;
                const orbitAngle = p.orbitPhase + sun.progress * 20 * p.orbitSpeed;
                p.x = sun.x + Math.cos(orbitAngle) * p.orbitRadius;
                p.y = sun.y + Math.sin(orbitAngle) * p.orbitRadius;

                const trailP = createParticle(p.x, p.y, {});
                trailP.isTrail = true;
                trailP.life = 0.35;
                trailP.size = p.size * 0.7;
                trailP.trailBaseSize = p.size;
                particles.push(trailP);
            }
            if (p.progress >= 1) {
                particles.splice(i, 1);
                continue;
            }
        } else if (p.isSweeper) {
            if (sun) {
                p.progress = sun.progress;
                const sweepOffset = Math.sin(p.phase + sun.progress * 7 * p.frequency) * p.amplitude;
                const dx = sun.endX - sun.startX;
                const dy = sun.endY - sun.startY;
                const len = Math.sqrt(dx*dx + dy*dy) || 1;
                const pdx = -dy / len;
                const pdy = dx / len;
                p.x = sun.x + pdx * sweepOffset;
                p.y = sun.y + pdy * sweepOffset;

                // Sweeper trail
                const trailP = createParticle(p.x, p.y, {});
                trailP.isTrail = true;
                trailP.life = 0.45;
                trailP.size = p.size * 0.85;
                trailP.trailBaseSize = p.size;
                particles.push(trailP);
            }
            if (p.progress >= 1) {
                particles.splice(i, 1);
                continue;
            }
        } else if (p.isSun) {
            if (p.progress >= 1) {
                particles.splice(i, 1);
                continue;
            }
        } else if (p.isTrail) {
            p.life -= dt * 1.5;
            p.size *= 0.98;
            if (p.life <= 0) {
                particles.splice(i, 1);
                continue;
            }
        } else { // Regular stream
            p.progress = Math.min(1, p.progress + p.speed * (dt * 60));
            const t = p.progress;
            p.x = p.startX + (p.endX - p.startX) * t;
            p.y = p.startY + (p.endY - p.startY) * t + Math.sin(p.phase + t * Math.PI * 2 * p.frequency) * p.amplitude;

            if (p.progress >= 1) {
                particles.splice(i, 1);
                continue;
            }
        }

        if(frontCtx){
            frontCtx.beginPath();
            frontCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            let fillAlpha = 0.85;
            let trailHighlightAlpha = null;
            if (p.isSun || (p.isBurst && !p.isSun && !p.isSweeper)) {
              const phaseOffset = (p.orbitPhase ?? p.phase ?? 0) * 0.8;
              const shimmer = Math.sin(shimmerPhase + phaseOffset);
              fillAlpha = Math.min(1, Math.max(0.45, 0.75 + 0.25 * shimmer));
            } else if (p.isTrail) {
              const opacity = Math.max(0, Math.min(1, 0.8 * p.life + 0.2));
              fillAlpha = opacity;
              trailHighlightAlpha = Math.min(1, opacity + 0.2);
            } else if (p.isSweeper) {
              fillAlpha = 0.78;
            }

            frontCtx.fillStyle = burstColor(fillAlpha);
            frontCtx.fill();

            if (p.isTrail && p.trailBaseSize) {
              frontCtx.beginPath();
              frontCtx.arc(p.x, p.y, Math.max(0.6, p.trailBaseSize * 0.12), 0, Math.PI * 2);
              frontCtx.fillStyle = burstColor(trailHighlightAlpha ?? fillAlpha);
              frontCtx.fill();
            }
        }
    }

    if(frontCtx) frontCtx.restore();

    animationFrameId = requestAnimationFrame(() => startFlight(ctx, startEl, endEl));
}


export function startParticleStream(originEl, targetEl, options = {}) {
  const layer = options?.layer === 'behind-target' ? 'behind-target' : 'front';
  if (!originEl || !targetEl) {
    console.log('[tutorial-fx] startParticleStream skipped: origin or target missing', { originElExists: !!originEl, targetElExists: !!targetEl });
    return;
  }
  const panel = originEl.closest('.guide-goals-panel, .tutorial-goals-panel, #tutorial-goals');
  const behind = panel ? panel.querySelector('.goal-particles-behind') : null;
  const front  = document.querySelector('.tutorial-particles-front');
  if (!behind || !front) {
    console.log('[tutorial-fx] startParticleStream skipped: canvas missing', { hasPanel: !!panel, hasBehind: !!behind, hasFront: !!front });
    return;
  }

  setupCanvases(behind, front);
  applyFrontCanvasLayer(layer);

  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  particles = [];
  startFlight._lastTs = performance.now();
  startFlight._accum = 0;

  const startRect = originEl.getBoundingClientRect();
  const endRect = targetEl.getBoundingClientRect();
  const sx = startRect.left + startRect.width * 0.9;
  const sy = startRect.top + startRect.height * 0.5;
  const ex = endRect.left + endRect.width * 0.5;
  const ey = endRect.top + endRect.height * 0.5;
  console.log('[tutorial-fx] startParticleStream kicking off', {
    originClass: originEl.className,
    targetClass: targetEl.className,
    startRect: { left: startRect.left, top: startRect.top, width: startRect.width, height: startRect.height },
    endRect: { left: endRect.left, top: endRect.top, width: endRect.width, height: endRect.height },
  });
  createBurst(sx, sy, { x: ex, y: ey });

  // Kick the animation
  animationFrameId = requestAnimationFrame(() => startFlight(front.getContext('2d'), originEl, targetEl));
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
  applyFrontCanvasLayer('front');
}













