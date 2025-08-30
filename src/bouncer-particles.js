// src/bouncer-particles.js
export function createBouncerParticles(getW, getH, { count=280 } = {}){
  const P = [];
  const W = ()=> Math.max(1, Math.floor(getW()?getW():0));
  const H = ()=> Math.max(1, Math.floor(getH()?getH():0));
  for (let i=0;i<count;i++){
    const x = Math.random()*W(), y = Math.random()*H();
    P.push({ x, y, vx:0, vy:0, homeX:x, homeY:y, alpha:0.55, tSince: 0 });
  }
  function disturb(x, y, vx=0, vy=0){
    const w=W(), h=H();
    const rad = Math.max(12, Math.min(w,h)*0.08);
    const rad2 = rad*rad;
    const drag = 0.12;
    for (const p of P){
      const dx = p.x - x, dy = p.y - y;
      const d2 = dx*dx + dy*dy;
      if (d2 < rad2){
        const k = Math.max(0.2, 1 - d2/rad2);
        const ax = (-dx)*0.002*k + vx*drag*k;
        const ay = (-dy)*0.002*k + vy*drag*k;
        p.vx += ax; p.vy += ay;
        p.alpha = Math.min(1, p.alpha + 0.35*k);
        p.tSince = 0;
      }
    }
  }
  function step(dt, ball){
    const w=W(), h=H();
    const damp = 0.985;
    for (const p of P){
      p.vx *= damp; p.vy *= damp;
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      if (p.x < 0) p.x += w; else if (p.x >= w) p.x -= w;
      if (p.y < 0) p.y += h; else if (p.y >= h) p.y -= h;
      p.tSince += dt;
      if (p.tSince > 0.4) p.alpha = Math.max(0, p.alpha - dt*0.6);
      if (p.alpha <= 0){
        p.x = p.homeX; p.y = p.homeY; p.vx = 0; p.vy = 0; p.alpha = 0.55; p.tSince = 0;
      }
    }
    if (ball){ disturb(ball.x, ball.y, ball.vx||0, ball.vy||0); }
  }
  function draw(ctx){
    if (!ctx) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of P){
      ctx.globalAlpha = Math.max(0.1, Math.min(1, p.alpha));
      ctx.fillStyle = '#8fa8ff';
      ctx.fillRect(p.x|0, p.y|0, 1.5, 1.5);
    }
    ctx.restore();
  }
  return { step, draw, disturb };
}
