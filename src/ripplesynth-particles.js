// src/ripplesynth-particles.js
let _particles = [];

export function initParticles(vw, vh, EDGE = 16, count = 56){
  _particles.length = 0;
  const margin = EDGE + 10;
  const W = typeof vw === 'function' ? vw() : vw;
  const H = typeof vh === 'function' ? vh() : vh;
  for (let i=0;i<count;i++){
    const x = margin + Math.random() * Math.max(1, W - margin*2);
    const y = margin + Math.random() * Math.max(1, H - margin*2);
    _particles.push({ x, y, pushX: 0, pushY: 0, phase: Math.random() * Math.PI * 2 });
  }
  try { console.log('[particles]', _particles.length); } catch {}
}

export function drawParticles(ctx, cx, cy, nowSec, speed, ripples){
  if (!_particles.length) return;
  const RADIUS = 4.0;
  const ALPHA  = 1.0;
  const pMaxPush = 6;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (const pt of _particles){
    const dx = pt.x - cx, dy = pt.y - cy;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist, ny = dy / dist;

    let accum = 0;
    if (Array.isArray(ripples)){
      for (const rp of ripples){
        const rr = Math.max(0, (nowSec - rp.startTime) * speed);
        const d  = Math.abs(dist - rr);
        const fall = Math.exp(-(d*d) / (2*24*24));
        if (fall > accum) accum = fall;
      }
    }

    const targetDisp = pMaxPush * accum * 0.6;
    pt.pushX = (pt.pushX || 0) + (nx * targetDisp - (pt.pushX || 0)) * 0.10;
    pt.pushY = (pt.pushY || 0) + (ny * targetDisp - (pt.pushY || 0)) * 0.10;

    ctx.globalAlpha = ALPHA;
    ctx.beginPath();
    ctx.arc(pt.x + pt.pushX, pt.y + pt.pushY, RADIUS, 0, Math.PI*2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  ctx.restore();
}
