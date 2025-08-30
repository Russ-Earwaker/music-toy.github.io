// src/ripplesynth-particles.js
// Particle layer: randomized rest positions (no grid), spring + knockback from ripples.
let P = []; // particles
let WIDTH = 0, HEIGHT = 0;
const P_SPRING = 0.10;
const P_DAMP   = 0.90;
const P_MAXV   = 160;
const P_IMPULSE = 6;     // impulse on ring hit (small)
const P_HIT_BAND = 8;    // tolerance around ring radius
let EDGE_KEEP = 10;

// Flash intensities for rings
const FLASH_MAIN = 1.0;      // primary bright ring
const FLASH_SECOND = 0.55;    // secondary bright ring (less bright)

export function setParticleBounds(w, h){ WIDTH = w; HEIGHT = h; }

function rand(min, max){ return Math.random() * (max - min) + min; }

export function initParticles(w, h, EDGE = 10, count = 56){
  WIDTH = w; HEIGHT = h; EDGE_KEEP = EDGE;
  P = [];
  for (let i=0; i<count; i++){
    const rx = rand(EDGE, w - EDGE);
    const ry = rand(EDGE, h - EDGE);
    P.push({ x: rx, y: ry, rx, ry, vx: 0, vy: 0, flash: 0 });
  }
}

export function reshuffleParticles(){
  // Assign new random rest positions; move particles there and zero velocities
  for (let i=0; i<P.length; i++){
    const rx = rand(EDGE_KEEP, WIDTH - EDGE_KEEP);
    const ry = rand(EDGE_KEEP, HEIGHT - EDGE_KEEP);
    P[i].rx = rx; P[i].ry = ry;
    P[i].x = rx;  P[i].y = ry;
    P[i].vx = 0;  P[i].vy = 0; P[i].flash = 0; P[i].flash = 0;
  }
}

export function scaleParticles(ratio){
  for (const p of P){
    p.x*=ratio; p.y*=ratio; p.rx*=ratio; p.ry*=ratio;
    p.vx*=ratio; p.vy*=ratio;
  }
  WIDTH*=ratio; HEIGHT*=ratio;
}

export function drawParticles(ctx, now, ripples, generator){
  // physics
  const dt = 1/60;
  for (const p of P){
    // spring
    const ax = (p.rx - p.x) * P_SPRING;
    const ay = (p.ry - p.y) * P_SPRING;
    p.vx = (p.vx + ax) * P_DAMP;
    p.vy = (p.vy + ay) * P_DAMP;
    // ripple knockback
    if (generator && generator.x!=null && ripples && ripples.length){
      for (let r=0; r<ripples.length; r++){
        const R = ripples[r];
        const radius = Math.max(0, (now - R.startTime) * R.speed);
        const dist = Math.hypot(p.x - R.x, p.y - R.y);
        if (Math.abs(dist - radius) <= P_HIT_BAND){
          const dx = p.x - R.x, dy = p.y - R.y;
          const d = Math.max(1, Math.hypot(dx, dy));
          const k = P_IMPULSE / d;
          // movement same for primary ring
          p.vx += dx * k; p.vy += dy * k;
          // full flash for primary ring
          p.flash = Math.max(p.flash, FLASH_MAIN);
        }
        // secondary bright ring: same movement, reduced flash
        const radius3 = Math.max(0, radius - R.speed * 1.20);
        if (radius3 > 0 && Math.abs(dist - radius3) <= P_HIT_BAND){
          const dx2 = p.x - R.x, dy2 = p.y - R.y;
          const d2 = Math.max(1, Math.hypot(dx2, dy2));
          const k2 = P_IMPULSE / d2;
          p.vx += dx2 * k2; p.vy += dy2 * k2; // same impulse
          p.flash = Math.max(p.flash, FLASH_SECOND);
        }
      }
    }
    // cap + integrate
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > P_MAXV){ const s = P_MAXV/sp; p.vx*=s; p.vy*=s; }
    p.flash = Math.max(0, p.flash - dt*2);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }

  // render — white points with brightness bump on flash, NO scaling
  ctx.save();
  for (const p of P){
    const alpha = 0.35 + 0.8 * Math.max(0, Math.min(1, p.flash));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(p.x, p.y, 1.2, 1.2);
  }
  ctx.restore();
}

