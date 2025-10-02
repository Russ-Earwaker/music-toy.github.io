// src/tutorial-fx.js

let fxCanvas = null;
let fxCtx = null;
let animationFrameId = null;
let particles = [];

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
    speed: (0.005 + Math.random() * 0.0025),
    amplitude: 15 + Math.random() * 15,
    frequency: 0.1 + Math.random() * 0.1,
    phase: Math.random() * Math.PI * 2,
    size: 1.5, // smaller uniform size
  };
}

function animate(startEl, endEl) {
  const startRect = startEl.getBoundingClientRect();
  const endRect = endEl.getBoundingClientRect();
  const startPos = {
    x: startRect.left + startRect.width / 2,
    y: startRect.top + startRect.height / 2
  };
  const endPos = {
    x: endRect.left + endRect.width / 2,
    y: endRect.top + endRect.height / 2
  };

  // Consistent spawn rate
  if (particles.length < 100) { // Cap particles
    for (let i = 0; i < 2; i++) {
        particles.push(createParticle(startPos.x, startPos.y, endPos));
    }
  }

  if (fxCtx) {
    fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.progress += p.speed;

    if (p.progress >= 1) {
      particles.splice(i, 1);
      continue;
    }

    const currentX = p.startX + (p.endX - p.startX) * p.progress;
    const currentY = p.startY + (p.endY - p.startY) * p.progress;

    const angle = Math.atan2(p.endY - p.startY, p.endX - p.startX);
    const perpendicularAngle = angle + Math.PI / 2;

    const sineOffset = Math.sin(p.progress * Math.PI * 4 + p.phase) * p.amplitude * Math.sin(p.progress * Math.PI);

    p.x = currentX + Math.cos(perpendicularAngle) * sineOffset;
    p.y = currentY + Math.sin(perpendicularAngle) * sineOffset;
    
    if (fxCtx) {
        // Dynamic sparkle
        const isSparkling = Math.random() > 0.98;
        let color = 'rgba(70, 120, 220, 0.8)';
        if (isSparkling) {
            color = `rgba(150, 200, 255, 0.9)`;
        }

        fxCtx.fillStyle = color;
        fxCtx.beginPath();
        fxCtx.arc(p.x, p.y, p.size, 0, 2 * Math.PI);
        fxCtx.fill();
    }
  }

  animationFrameId = requestAnimationFrame(() => animate(startEl, endEl));
}

export function startParticleStream(startEl, endEl) {
  ensureCanvas();
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  particles = [];
  animate(startEl, endEl);
}

export function stopParticleStream() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  particles = [];
  if (fxCanvas && fxCtx) {
    fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
  }
}