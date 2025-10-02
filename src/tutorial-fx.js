
// src/tutorial-fx.js

let fxCanvas = null;
let fxCtx = null;
let animationFrameId = null;
let activeAnimations = [];

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
    zIndex: '9999'
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

function createParticle(x, y) {
  const angle = Math.random() * 2 * Math.PI;
  const radius = Math.random() * 15;
  return {
    x: x + Math.cos(angle) * radius,
    y: y + Math.sin(angle) * radius,
    vx: 0,
    vy: 0,
    life: 1,
    size: 2 + Math.random() * 2
  };
}

function animateHint(startPos, endPos, onComplete) {
  const particles = Array.from({ length: 20 }, () => createParticle(startPos.x, startPos.y));
  const duration = 1000; // 1 second
  const startTime = performance.now();

  const animation = {
    update() {
      const now = performance.now();
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      particles.forEach(p => {
        const ease = 1 - Math.pow(1 - progress, 3); // easeOutCubic
        p.x += (endPos.x - p.x) * ease * 0.1;
        p.y += (endPos.y - p.y) * ease * 0.1;
        p.life = 1 - progress;
      });

      if (progress >= 1) {
        this.isDone = true;
        if (onComplete) onComplete();
      }
    },
    draw(ctx) {
      particles.forEach(p => {
        ctx.fillStyle = `rgba(255, 255, 255, ${p.life * 0.8})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, 2 * Math.PI);
        ctx.fill();
      });
    },
    isDone: false
  };
  activeAnimations.push(animation);
}

function loop() {
  if (!fxCtx || !fxCanvas) return;
  fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
  
  activeAnimations = activeAnimations.filter(anim => !anim.isDone);
  
  activeAnimations.forEach(anim => {
    anim.update();
    anim.draw(fxCtx);
  });

  if (activeAnimations.length > 0) {
    animationFrameId = requestAnimationFrame(loop);
  } else {
    animationFrameId = null;
  }
}

function startLoop() {
  if (!animationFrameId) {
    loop();
  }
}

export function playTaskHint(startEl, endEl) {
  ensureCanvas();
  
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

  const onComplete = () => {
    endEl.classList.add('tutorial-target-flash');
    setTimeout(() => {
      endEl.classList.remove('tutorial-target-flash');
    }, 500);
  };

  animateHint(startPos, endPos, onComplete);
  startLoop();
}

export function stopAllHints() {
  activeAnimations = [];
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  if (fxCanvas) {
      fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
  }
}
