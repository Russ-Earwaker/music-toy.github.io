// src/bouncer-particles.js
export function createBouncerParticles(getW, getH, {
  count=280,
  biasXCenter=false,
  biasYCenter=false,
  knockbackScale=1,
  returnToHome=true,
  respawnSec=2.8,
  lockXToCenter=false,
  bounceOnWalls=false,
  homePull=0.004
} = {}){
  const P = [];
  let beatGlow = 0;
  const W = ()=> Math.max(1, Math.floor(getW()?getW():0));
  const H = ()=> Math.max(1, Math.floor(getH()?getH():0));
  let lastW = 0, lastH = 0;
  function spawnCoordX(){
    const w = W();
    if (lockXToCenter) return w * 0.5;
    if (!biasXCenter) return Math.random()*w;
    // Sharper peak at center using sum of two triangular variables
    const u1 = Math.random() - Math.random(); // [-1,1]
    const u2 = Math.random() - Math.random(); // [-1,1]
    let u = (u1 + u2) / 2; // still in [-1,1] but more mass near 0
    return ((u + 1) * 0.5) * w;
  }
  function spawnCoordY(){
    const h = H();
    if (!biasYCenter) return Math.random()*h;
    const u = Math.random() - Math.random();
    return ((u + 1) * 0.5) * h;
  }
  for (let i=0;i<count;i++){
    const x = spawnCoordX(), y = spawnCoordY();
    P.push({ x, y, vx:0, vy:0, homeX:x, homeY:y, alpha:0.55, tSince: 0, delay:0, burst:false });
  }

  // Gentle "gravity" towards ball + slight velocity alignment near ball
  function ballInfluence(p, ball){
    if (!ball) return;
    const dx = (ball.x - p.x), dy = (ball.y - p.y);
    const d2 = dx*dx + dy*dy; const d = Math.sqrt(d2);
    const rad = Math.max(16, Math.min(W(),H())*0.18);
    if (d < rad && d > 1){
      const f = 0.08 * (1 - d/rad); // soft falloff
      p.vx += f * dx/d;
      p.vy += f * dy/d;
      // Align slightly with ball direction
      const bl = Math.hypot(ball.vx||0, ball.vy||0) || 1;
      p.vx += 0.02 * (ball.vx||0) / bl;
      p.vy += 0.02 * (ball.vy||0) / bl;
      p.alpha = Math.min(1, p.alpha + 0.08);
    }
  }

  // Beat pulse: radial kick from a point (cx,cy), with brightness pop
  function onBeat(cx, cy){
    beatGlow = 1;
    const w=W(), h=H();
    const rad = Math.max(24, Math.min(w,h)*0.42);
    for (const p of P){
      const dx = p.x - cx, dy = p.y - cy;
      const d = Math.hypot(dx,dy) || 1;
      if (d < rad){
        const u = 0.25 * (1 - d/rad);
        p.vx += u * (dx/d);
        p.vy += u * (dy/d);
        p.alpha = Math.min(1, p.alpha + 0.25);
      }
    }
  }

  function disturb(x, y, vx=0, vy=0){
    const w=W(), h=H();
    const rad = Math.max(12, Math.min(w,h)*0.08);
    const rad2 = rad*rad;
    for (const p of P){
      const dx = p.x - x, dy = p.y - y;
      const d2 = dx*dx + dy*dy;
      if (d2 < rad2){
        const d = Math.sqrt(d2) || 1;
        const k = knockbackScale * 0.35 * (1 - d/Math.sqrt(rad2));
        p.vx += vx*0.10 + k*(dx/d);
        p.vy += vy*0.10 + k*(dy/d);
        p.alpha = Math.min(1, p.alpha + 0.18);
      }
    }
  }

  function step(dt=1/60, ball){
    const w=W(), h=H();
    // Re-home particles when container size changes (prevents drift/cutoff)
    if (w !== lastW || h !== lastH){
      // Adjust population to desired count
      if (P.length < count){
        for (let i=P.length;i<count;i++){
          const x = spawnCoordX(), y = spawnCoordY();
          P.push({ x, y, vx:0, vy:0, homeX:x, homeY:y, alpha:0.55, tSince: 0 });
        }
      } else if (P.length > count){
        P.length = count;
      }
      for (const p of P){
        const nx = spawnCoordX();
        const ny = spawnCoordY();
        p.homeX = nx; p.homeY = ny; p.x = nx; p.y = ny; p.vx = 0; p.vy = 0; p.alpha = 0.55; p.tSince = 0; p.delay=0; p.burst=false;
      }
      lastW = w; lastH = h;
    }
    const toKeep = [];
    for (const p of P){
      // Staggered start: wait until delay elapses
      if (p.delay && p.delay>0){ p.delay = Math.max(0, p.delay - dt); toKeep.push(p); continue; }

      p.tSince += dt;
      // Smooth damping
      p.vx *= 0.985; p.vy *= 0.985;
      // Gravity-ish drift to home to avoid runaway (configurable)
      if (returnToHome){
        const hx = p.homeX - p.x, hy = p.homeY - p.y;
        p.vx += homePull*hx; p.vy += homePull*hy;
      }
      // Ball influence
      ballInfluence(p, ball);
      // Remember previous position for center-line crossing test
      const prevX = p.x;
      // Integrate
      p.x += p.vx; p.y += p.vy;
      // If we crossed the vertical center line, dampen velocity a bit to soften streaks
      const midX = w * 0.5;
      const crossedCenter = ((prevX - midX) * (p.x - midX)) < 0;
      if (crossedCenter){ p.vx *= 0.68*0.68; p.vy *= 0.86*0.86; } // doubled damping strength
      // Handle bounds
      if (bounceOnWalls){
        if (p.x < 0){ p.x = 0; p.vx *= -0.8; }
        if (p.x > w){ p.x = w; p.vx *= -0.8; }
        if (p.y < 0){ p.y = 0; p.vy *= -0.8; }
        if (p.y > h){ p.y = h; p.vy *= -0.8; }
      } else {
        // Respawn if offscreen
        if (p.x < 0 || p.x >= w || p.y < 0 || p.y >= h){
          p.x=p.homeX; p.y=p.homeY; p.vx=0; p.vy=0; p.alpha=0.55; p.tSince=0; p.delay=0; p.burst=false;
        }
      }
      // Optional despawn-on-settle for bursts instead of drifting back
      if (!returnToHome && p.burst){
        const speed = Math.hypot(p.vx, p.vy);
        if (p.tSince >= respawnSec || speed < 0.05){
          // Drop this particle (do not push to keep list)
          continue;
        }
      }
      // Fade back toward base
      p.alpha += (0.55 - p.alpha) * 0.05;
      toKeep.push(p);
    }
    // Replace array with kept particles
    if (toKeep.length !== P.length){ P.length = 0; Array.prototype.push.apply(P, toKeep); }
  }

  function draw(ctx){
    if (!ctx) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (beatGlow>0){ ctx.globalAlpha = Math.min(0.6, beatGlow*0.6); ctx.fillStyle='rgba(120,160,255,0.5)'; ctx.fillRect(0,0,W(),H()); ctx.globalAlpha=1; beatGlow *= 0.88; }
    // Speed-influenced brightness only when moving away from the string (vertical center line)
    const midX = W()*0.5;
    for (const p of P){
      const sp = Math.hypot(p.vx, p.vy);
      const spN = Math.max(0, Math.min(1, sp / 5));
      const fastBias = Math.pow(spN, 1.25);
      const baseA = Math.max(0.08, Math.min(1, p.alpha));
      const away = (p.x < midX && p.vx < 0) || (p.x > midX && p.vx > 0);
      const boost = away ? (0.80*fastBias) : 0; // stronger brightness boost
      ctx.globalAlpha = Math.min(1, baseA + boost);
      // Color-shift towards white for fastest away-moving particles
      const baseR=143, baseG=168, baseB=255;
      const mix = away ? Math.min(0.9, Math.max(0, Math.pow(spN, 1.4))) : 0; // up to ~90% white
      const r = Math.round(baseR + (255-baseR)*mix);
      const g = Math.round(baseG + (255-baseG)*mix);
      const b = Math.round(baseB + (255-baseB)*mix);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(p.x|0, p.y|0, 1.5, 1.5);
    }
    ctx.restore();
  }

  // Horizontal line repulse: push particles outward from a vertical line at x
  function lineRepulse(x, width=40, strength=1){
    const w=W(); const h=H();
    const half = Math.max(4, width*0.5);
    for (const p of P){
      const dx = p.x - x;
      if (Math.abs(dx) <= half){
        const s = (dx===0? (Math.random()<0.5?-1:1) : Math.sign(dx));
        const fall = 1 - Math.abs(dx)/half;
        // Randomize magnitude slightly and add vertical jitter so force isn't perfectly uniform
        const jitter = 0.85 + Math.random()*0.3; // [0.85..1.15]
        const k = Math.max(0, fall) * strength * 0.55 * jitter;
        const vyJitter = (Math.random()*2 - 1) * k * 0.25; // small up/down component
        p.vx += s * k;
        p.vy += vyJitter;
        p.alpha = Math.min(1, p.alpha + 0.35);
      }
    }
  }

  // Spawn a burst of particles along a vertical line at x, biased toward
  // vertical center; initial velocities fire left/right with speed greater
  // near center, and small vertical jitter. These particles then follow the
  // same dynamics (damped drift and optional returnToHome).
  function lineBurst(x, countBurst=80, baseSpeed=3.0, speedMul=1.0){
    const w=W(), h=H(); if (w<=1||h<=1||countBurst<=0) return;
    const cy = h*0.5;
    for (let i=0;i<countBurst;i++){
      const u = (Math.random() - Math.random()); // [-1,1] triangular toward 0
      const y = ((u + 1) * 0.5) * h;
      const centerFactor = 1 - Math.min(1, Math.abs(y - cy)/(h*0.5)); // [0..1]
      // Spread: lower minimum and slightly higher maximum, with variety
      const jitter = 0.5 + Math.random()*0.9; // [0.5..1.4]
      const cf = Math.pow(centerFactor, 0.8); // slightly emphasize center without extremes
      const minW = 0.005, maxW = 1.32;        // min near zero; max unchanged (approved)
      const weight = minW + (maxW - minW) * cf;
      const vMag = baseSpeed * weight * jitter * Math.max(0.1, speedMul);
      const delay = Math.random() * 0.12; // stagger within ~120ms
      // Create mirrored pair with equal speed magnitudes
      const left = { x, y, vx:-vMag, vy:(Math.random()*2 - 1) * vMag * 0.22, homeX:x, homeY:y, alpha:0.8, tSince:0, delay, burst:true };
      const right= { x, y, vx:+vMag, vy:(Math.random()*2 - 1) * vMag * 0.22, homeX:x, homeY:y, alpha:0.8, tSince:0, delay, burst:true };
      P.push(left, right);
    }
    // Removed central ultra-fast spawns to avoid harsh visual streaks
    // Cap total population to avoid unbounded growth
    const maxP = Math.max(count*2, count + 220);
    if (P.length > maxP){ P.splice(0, P.length - maxP); }
  }

  return { step, draw, disturb, onBeat, lineRepulse, lineBurst };
}
