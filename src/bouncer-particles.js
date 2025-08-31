// src/bouncer-particles.js
export function createBouncerParticles(getW, getH, { count=280 } = {}){
  const P = [];
  let beatGlow = 0;
  const W = ()=> Math.max(1, Math.floor(getW()?getW():0));
  const H = ()=> Math.max(1, Math.floor(getH()?getH():0));
  for (let i=0;i<count;i++){
    const x = Math.random()*W(), y = Math.random()*H();
    P.push({ x, y, vx:0, vy:0, homeX:x, homeY:y, alpha:0.55, tSince: 0 });
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
        const k = 0.35 * (1 - d/Math.sqrt(rad2));
        p.vx += vx*0.05 + k*(dx/d);
        p.vy += vy*0.05 + k*(dy/d);
        p.alpha = Math.min(1, p.alpha + 0.18);
      }
    }
  }

  function step(dt, ball){
    const w=W(), h=H();
    for (const p of P){
      // Smooth damping
      p.vx *= 0.985; p.vy *= 0.985;
      // Gravity-ish drift to home to avoid runaway
      const hx = p.homeX - p.x, hy = p.homeY - p.y;
      p.vx += 0.004*hx; p.vy += 0.004*hy;
      // Ball influence
      ballInfluence(p, ball);
      // Integrate
      p.x += p.vx; p.y += p.vy;
      // Respawn if offscreen
      if (p.x < 0 || p.x >= w || p.y < 0 || p.y >= h){
        p.x=p.homeX; p.y=p.homeY; p.vx=0; p.vy=0; p.alpha=0.55; p.tSince=0;
      }
      // Fade back toward base
      p.alpha += (0.55 - p.alpha) * 0.05;
    }
  }

  function draw(ctx){
    if (!ctx) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (beatGlow>0){ ctx.globalAlpha = Math.min(0.6, beatGlow*0.6); ctx.fillStyle='rgba(120,160,255,0.5)'; ctx.fillRect(0,0,W(),H()); ctx.globalAlpha=1; beatGlow *= 0.88; }
    for (const p of P){
      ctx.globalAlpha = Math.max(0.08, Math.min(1, p.alpha));
      ctx.fillStyle = '#8fa8ff';
      ctx.fillRect(p.x|0, p.y|0, 1.5, 1.5);
    }
    ctx.restore();
  }

  return { step, draw, disturb, onBeat };
}
