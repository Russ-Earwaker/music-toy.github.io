// src/bouncer-impact.js — visual impact FX (opt-in)
export function createImpactFX(){
  const rings = []; // {x,y,age}
  const trail = []; // last few ball positions [{x,y,age}]

  function onLaunch(x,y){
    rings.push({ x,y, age:0 });
  }
  function onStep(ball){
    if (!ball) return;
    trail.push({ x: ball.x, y: ball.y, age: 0 });
    while (trail.length > 24) trail.shift();
    for (const r of rings) r.age += 0.016;
    for (const t of trail) t.age += 0.016;
    // cull
    for (let i=rings.length-1; i>=0; i--) if (rings[i].age > 0.5) rings.splice(i,1);
    for (let i=trail.length-1; i>=0; i--) if (trail[i].age > 0.35) trail.splice(i,1);
  }
  function draw(ctx){
    // rings
    for (const r of rings){
      const rad = 6 + r.age*60;
      const a = Math.max(0, 0.35 - r.age*0.6);
      ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, Math.PI*2);
      ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 2; ctx.stroke();
    }
    // trail
    for (const t of trail){
      const a = Math.max(0, 0.28 - t.age*0.8);
      ctx.beginPath(); ctx.arc(t.x, t.y, 3, 0, Math.PI*2);
      ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fill();
    }
  }
  return { onLaunch, onStep, draw };
}
