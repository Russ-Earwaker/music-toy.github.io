// src/drum-particles.js
// A simple particle system for the drum toy.

export function createDrumParticles({ getW, getH, count = 280 }) {
  const P = [];
  const W = () => Math.max(1, Math.floor(getW ? getW() : 0));
  const H = () => Math.max(1, Math.floor(getH ? getH() : 0));

  function resetParticle(p) {
    const w = W();
    const h = H();
    p.homeX = Math.random() * w;
    p.homeY = Math.random() * h;
    p.x = p.homeX;
    p.y = p.homeY;
    p.vx = 0;
    p.vy = 0;
    p.ttl = 0; // Time-to-live for disturbance
    p.alpha = 0.5;
  }

  for (let i = 0; i < count; i++) {
    const p = {};
    resetParticle(p);
    P.push(p);
  }

  function disturb() {
    const KICK_STRENGTH = 2.5;
    const KICK_TTL = 30; // frames
    for (const p of P) {
      const angle = Math.random() * Math.PI * 2;
      const magnitude = Math.random() * KICK_STRENGTH;
      p.vx += Math.cos(angle) * magnitude;
      p.vy += Math.sin(angle) * magnitude;
      p.ttl = KICK_TTL;
      p.alpha = 1.0; // Flash bright
    }
  }

  function step() {
    const w = W();
    const h = H();
    for (const p of P) {
      if (p.ttl > 0) {
        // Gravity towards home position
        p.vx += (p.homeX - p.x) * 0.002;
        p.vy += (p.homeY - p.y) * 0.002;

        // Damping
        p.vx *= 0.94;
        p.vy *= 0.94;

        // Integration
        p.x += p.vx;
        p.y += p.vy;

        p.ttl--;
      } else if (Math.abs(p.x - p.homeX) > 0.5 || Math.abs(p.y - p.homeY) > 0.5) {
        // Settle back home if disturbed and finished
        p.x += (p.homeX - p.x) * 0.1;
        p.y += (p.homeY - p.y) * 0.1;
      }
      
      // Fade alpha back to base
      p.alpha += (0.5 - p.alpha) * 0.08;

      // Respawn if off-screen
      if (p.x < 0 || p.x >= w || p.y < 0 || p.y >= h) {
        resetParticle(p);
      }
    }
  }

  function draw(ctx) {
    if (!ctx) return;
    ctx.save();
    ctx.fillStyle = '#8fa8ff'; // Bouncer particle color
    for (const p of P) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
      ctx.fillRect(p.x | 0, p.y | 0, 1, 1); // Smaller particles
    }
    ctx.restore();
  }

  return { step, draw, disturb };
}

