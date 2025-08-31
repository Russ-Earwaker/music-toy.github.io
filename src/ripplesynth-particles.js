// src/ripplesynth-particles.js
// Particle layer: randomized rest positions (no grid), spring + knockback from ripples.
let P = []; // particles
let WIDTH = 0, HEIGHT = 0;
const P_SPRING = 0.10;
const P_DAMP   = 0.90;
const P_MAXV   = 200;
const P_IMPULSE = 6;     // impulse on ring hit (small)
const P_HIT_BAND = 10;    // tolerance around ring radius
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
    P.push({ x: rx, y: ry, rx, ry, vx: 0, vy: 0, flash: 0, tint: 0 });
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

export function drawParticles(ctx, now, ripples, generator, blocks){
  // physics
  const dt = 1/60;
  for (const p of P){
    // spring
    const ax = (p.rx - p.x) * P_SPRING;
    const ay = (p.ry - p.y) * P_SPRING;
    p.vx = (p.vx + ax) * P_DAMP;
    p.vy = (p.vy + ay) * P_DAMP;
    // (spring applied; ripple knockback handled below)
    // ripple knockback
    // ripple knockback
    if (generator && generator.x!=null && ripples && ripples.length){
      for (let r=0; r<ripples.length; r++){
        const R = ripples[r];
        const radius = Math.max(0, (now - R.startTime) * R.speed);
        const dist = Math.hypot(p.x - R.x, p.y - R.y);

        // pre-impulse: gentle inward pull just before crest
        /*PRE_SUCK_PUSH*/
        const PRE_BAND = P_HIT_BAND * 1.2;
        if (dist > radius && (dist - radius) <= PRE_BAND){
          const dxp = p.x - R.x, dyp = p.y - R.y;
          const dp = Math.max(1, Math.hypot(dxp, dyp));
          const closp = 1 - (dist - radius) / PRE_BAND;
          const kp = (P_IMPULSE * 0.25 * (0.8 + 0.4 * closp)) / dp;
          // inward (negative) to suggest water rising
          p.vx -= dxp * kp; p.vy -= dyp * kp;
        }

// r1 (primary) — stronger & wider band
        { const r1Band = P_HIT_BAND * 1.25; if (Math.abs(dist - radius) <= r1Band){
          const dx = p.x - R.x, dy = p.y - R.y;
          const d = Math.max(1, Math.hypot(dx, dy));
          const clos = Math.max(0, 1 - Math.abs(dist - radius) / Math.max(1, r1Band));
          const k = (P_IMPULSE * 1.60 * (1.0 + 0.25 * clos)) / d;
          p.vx += dx * k; p.vy += dy * k;
          p.flash = Math.max(p.flash, Math.max(FLASH_MAIN, 0.90));
        }}

        // r2 (mid) — same strength/flash as r3
        const radius2 = Math.max(0, radius - (R.r2off || (R.speed * 0.60)));
        if (radius2 > 0 && Math.abs(dist - radius2) <= P_HIT_BAND){
          const dxm = p.x - R.x, dym = p.y - R.y;
          const dm = Math.max(1, Math.hypot(dxm, dym));
          const cm = Math.max(0, 1 - Math.abs(dist - radius2) / Math.max(1, P_HIT_BAND));
          const km = (P_IMPULSE * (1.0 + 0.2 * cm)) / dm;
          p.vx += dxm * km; p.vy += dym * km;
          p.flash = Math.max(p.flash, FLASH_SECOND);
        }
        // r3 removed per spec
      }
    }
    // cube repulsion (optional)


    if (blocks && blocks.length){
      for (let bi=0; bi<blocks.length; bi++){
        const b = blocks[bi];
        if (!b || b.w == null || b.h == null) continue;

        // Small pad just outside the cube edges
        const PAD = Math.max(2, Math.max(b.w, b.h) * 0.08); // scales with cube size; thin rim // scales with cube size; thin rim

        const left   = b.x, right  = b.x + b.w;
        const top    = b.y, bottom = b.y + b.h;

        const inRect = (p.x >= left && p.x <= right && p.y >= top && p.y <= bottom);

        if (inRect){
          // Push directly out along the nearest axis to just outside the edge + PAD
          const dxL = p.x - left, dxR = right - p.x, dyT = p.y - top, dyB = bottom - p.y;
          const minD = Math.min(dxL, dxR, dyT, dyB);
          if (minD === dxL){
            const targetX = left - PAD;
            const delta = (targetX - p.x);
            p.x += delta; p.vx += delta * 6;
          } else if (minD === dxR){
            const targetX = right + PAD;
            const delta = (targetX - p.x);
            p.x += delta; p.vx += delta * 6;
          } else if (minD === dyT){
            const targetY = top - PAD;
            const delta = (targetY - p.y);
            p.y += delta; p.vy += delta * 6;
          } else {
            const targetY = bottom + PAD;
            const delta = (targetY - p.y);
            p.y += delta; p.vy += delta * 6;
          }
          // visual cue
          p.flash = Math.max(p.flash, 0.65);
          p.tint  = Math.max(p.tint||0, 1.0);
        } else {
          // Outside: project to minimum PAD distance from the edge if too close
          const px = Math.max(left, Math.min(p.x, right));
          const py = Math.max(top,  Math.min(p.y, bottom));
          const dx = p.x - px, dy = p.y - py;
          const dist = Math.hypot(dx, dy);
          if (dist < PAD){
            const inv = dist>0 ? (1/dist) : 0;
            const nx = dist>0 ? dx*inv : (p.x < (left+right)/2 ? -1 : 1);
            const ny = dist>0 ? dy*inv : (p.y < (top+bottom)/2 ? -1 : 1);
            const need = PAD - dist;
            // move to the rim and add a little velocity kick away
            p.x = px + nx * PAD; p.y = py + ny * PAD;
            p.vx += nx * need * 24; p.vy += ny * need * 24;
            p.flash = Math.max(p.flash, 0.45 * (need / PAD));
            p.tint  = Math.max(p.tint||0, (need / PAD));
          }
        }
      }
    }


    // clamp particle speed similar to bouncer feel
    { const sp = Math.hypot(p.vx, p.vy); if (sp > P_MAXV){ const s=P_MAXV/sp; p.vx*=s; p.vy*=s; } }
    /*GENTLE_DECAY*/
    p.flash = Math.max(0, (p.flash||0) * 0.92 - 0.01);
    p.tint  = Math.max(0, (p.tint||0)  * 0.90 - 0.01);
    p.y += p.vy * dt;
  }

  // render — white points with brightness bump on flash, NO scaling
  ctx.save();
  for (const p of P){
    const base = 0.55; const alpha = Math.max(0.08, Math.min(1, base + 0.45 * Math.max(0, Math.min(1, p.flash)))) ;
    ctx.globalAlpha = alpha;
    if ((typeof window !== 'undefined') && window.__ripplerTint && (p.tint||0) > 0.05){
      // debug tint: bluish when repelled by cubes
      const t = Math.max(0, Math.min(1, p.tint));
      const g = Math.floor(180 + 60 * t);
      const b = Math.floor(200 + 55 * t);
      ctx.fillStyle = 'rgb(120,'+g+','+b+')';
    } else {
      ctx.fillStyle = '#ffffff';
    }
    /*TINT_RENDER*/
    ctx.fillRect(p.x, p.y, 1.5, 1.5);
  }
  ctx.restore();
}
