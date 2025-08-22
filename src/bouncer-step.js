import { circleRectHit } from './bouncer-helpers.js';


function sweptCircleAABB(px, py, vx, vy, r, rect){
  // Expanded AABB (inflate rect by r)
  const ex = rect.x - r, ey = rect.y - r, ew = rect.w + 2*r, eh = rect.h + 2*r;

  // No movement
  if (vx === 0 && vy === 0) return null;

  // Ray vs AABB (slab method) for segment [0,1]
  let tmin = 0, tmax = 1;
  let nx = 0, ny = 0; // normal

  // X slabs
  if (vx !== 0){
    const tx1 = (ex - px) / vx;
    const tx2 = (ex + ew - px) / vx;
    const txEntry = Math.min(tx1, tx2);
    const txExit  = Math.max(tx1, tx2);
    if (txEntry > tmin){ tmin = txEntry; nx = (vx > 0) ? -1 : 1; ny = 0; }
    tmax = Math.min(tmax, txExit);
  } else {
    if (px < ex || px > ex + ew) return null;
  }

  // Y slabs
  if (vy !== 0){
    const ty1 = (ey - py) / vy;
    const ty2 = (ey + eh - py) / vy;
    const tyEntry = Math.min(ty1, ty2);
    const tyExit  = Math.max(ty1, ty2);
    // If Y entry is later than current tmin, update normal to Y
    if (tyEntry > tmin){ nx = 0; ny = (vy > 0) ? -1 : 1; tmin = tyEntry; }
    tmax = Math.min(tmax, tyExit);
  } else {
    if (py < ey || py > ey + eh) return null;
  }

  if (tmax < tmin) return null; // no intersection
  if (tmin < 0 || tmin > 1) return null;

  const hitX = px + vx * tmin;
  const hitY = py + vy * tmin;
  return { t: tmin, nx, ny, hx: hitX, hy: hitY };
}

export function stepBouncer(S, nowAT){
  // Quantize to next sixteenth (1/16 of bar)
  function qSixteenth(){
    const ac = (S.ensureAudioContext && S.ensureAudioContext()) || null;
    const at = ac ? ac.currentTime : (S.lastAT || 0);
    const li = S.getLoopInfo ? S.getLoopInfo() : null;
    if (li && typeof li.loopStartTime === 'number' && li.barLen){
      const grid = li.barLen / 16;
      const rel  = Math.max(0, at - li.loopStartTime);
      const k    = Math.ceil((rel + 1e-6) / grid);
      return li.loopStartTime + k * grid;
    }
    return at + 0.0005;
  }

  const ac = S.ensureAudioContext && S.ensureAudioContext();
  const now = nowAT || (ac ? ac.currentTime : (S.lastAT || 0));

  // scheduled re-spawn
  if (S.lastLaunch && S.nextLaunchAt != null && now >= (S.nextLaunchAt - 0.001)){
    const nb = S.spawnBallFrom({ x:S.handle.x, y:S.handle.y, vx:S.lastLaunch.vx, vy:S.lastLaunch.vy, r:S.ballR() });
    S.ball = nb;
    try {
      const L=S.EDGE, T=S.EDGE, R=S.worldW()-S.EDGE, B=S.worldH()-S.EDGE;
      const rr = S.ball.r || S.ballR();
      if (S.ball.x < L+rr+2) S.ball.x = L+rr+2;
      if (S.ball.x > R-rr-2) S.ball.x = R-rr-2;
      if (S.ball.y < T+rr+2) S.ball.y = T+rr+2;
      if (S.ball.y > B-rr-2) S.ball.y = B-rr-2;
      S.ball.x += (S.ball.vx||0)*0.6;
      S.ball.y += (S.ball.vy||0)*0.6;
    } catch(e) {}
    try{
      const li = S.getLoopInfo ? S.getLoopInfo() : null;
      const bl = li ? li.barLen : 0;
      if (bl){
        S.ball.flightEnd = now + bl * (S.BOUNCER_BARS_PER_LIFE || 1);
        if (S.setNextLaunchAt) S.setNextLaunchAt(S.ball.flightEnd);
        S.nextLaunchAt = S.ball.flightEnd;
      }
    } catch(e){}
    S.__justSpawnedUntil = now + 0.05;
  }

  // integrate with swept collision (segment vs expanded AABB) to avoid tunneling
  if (S.ball){
    if (S.ball.flightEnd != null && now >= S.ball.flightEnd){ S.ball = null; }
    else {
      const eps = 0.001;
      const L=S.EDGE, T=S.EDGE, R=S.worldW()-S.EDGE, B=S.worldH()-S.EDGE;
      const rr = S.ball.r || S.ballR();
      const blocks = S.blocks || [];

      // Remaining motion this frame
      let rem = 1.0;
      let iterations = 0;
      const maxIter = 4; // up to 4 bounces per frame (rare)

      while (rem > 1e-4 && iterations++ < maxIter){
        const vx = S.ball.vx * rem;
        const vy = S.ball.vy * rem;

        // Track earliest hit among blocks
        let best = null, bestIdx = -1;
        for (let i=0;i<blocks.length;i++){
          const b = blocks[i]; if (!b || b.fixed === true) continue;
          const h = sweptCircleAABB(S.ball.x, S.ball.y, vx, vy, rr, b);
          if (h && (best == null || h.t < best.t)){ best = h; bestIdx = i; }
        }

        // Also treat world bounds as big rects (left, right, top, bottom)
        // We'll build four rect "slabs" and test similarly
        const wrects = [
          { x: -1e6, y: T, w: (L - (-1e6)), h: B-T, nx: 1, ny: 0 },                 // left wall
          { x: R,   y: T, w: 1e6,           h: B-T,   nx: -1, ny: 0 },               // right wall
          { x: L,   y: -1e6, w: R-L,        h: (T - (-1e6)), nx: 0, ny: 1 },         // top wall
          { x: L,   y: B,   w: R-L,         h: 1e6,          nx: 0, ny: -1 },        // bottom wall
        ];
        // Manually compute slab collisions for world using same function
        for (let wi=0; wi<wrects.length; wi++){
          const wr = wrects[wi];
          const h = sweptCircleAABB(S.ball.x, S.ball.y, vx, vy, rr, wr);
          if (h){
            // override normal with wall's planar normal (more stable)
            h.nx = wr.nx; h.ny = wr.ny;
            if (best == null || h.t < best.t){ best = h; bestIdx = -100 - wi; }
          }
        }

        
        // Also test edge controller cubes as collidables
        if (S.edgeControllers && S.edgeControllers.length){
          for (let ci=0; ci<S.edgeControllers.length; ci++){
            const c = S.edgeControllers[ci]; if (!c) continue;
            const rect = { x:c.x, y:c.y, w:(c.w||c.size||36), h:(c.h||c.size||36) };
            const hc = sweptCircleAABB(S.ball.x, S.ball.y, vx, vy, rr, rect);
            if (hc && (best == null || hc.t < best.t)){ best = hc; bestIdx = -1000 - ci; }
          }
        }

        if (!best){

          // No hit: move fully
          S.ball.x += vx;
          S.ball.y += vy;
          break;
        } else {
          // Move to just before impact
          const tMove = Math.max(0, Math.min(1, best.t));
          S.ball.x += vx * tMove;
          S.ball.y += vy * tMove;

          // Move to exact hit point
          S.ball.x = best.hx;
          S.ball.y = best.hy;
          // Reflect velocity by flipping component on the hit normal
          if (best.nx != 0) S.ball.vx = -S.ball.vx;
          if (best.ny != 0) S.ball.vy = -S.ball.vy;
          // Nudge out of the surface along normal to prevent re-penetration
          S.ball.x += best.nx * eps;
          S.ball.y += best.ny * eps;

          // Trigger block effects if we hit a block
          if (bestIdx >= 0){
            const b = blocks[bestIdx];
            try {
              const nm = S.noteValue ? S.noteValue(S.noteList, b.noteIndex) : null;
              const t = qSixteenth();
              if (nm && S.triggerInstrument) S.triggerInstrument(S.instrument, nm, t); if (c){ c.flash=1.0; c.lastHitAT=(S.lastAT||0);} if (S.fx&&S.fx.onHit) S.fx.onHit(S.ball.x,S.ball.y); if (S.fx && S.fx.onHit) S.fx.onHit(S.ball.x, S.ball.y); if (c) { c.flash = 1.0; c.lastHitAT = (S.lastAT || 0); }
            } catch(e){}
            if (S.fx && S.fx.onHit) S.fx.onHit(S.ball.x, S.ball.y);
            b.flash = 1.0;
          }
          else if (bestIdx <= -1000){
            const ei = (-1000 - bestIdx)|0;
            const c = (S.edgeControllers && S.edgeControllers[ei]) ? S.edgeControllers[ei] : null;
            try {
              const nm = c && S.noteValue ? S.noteValue(S.noteList, c.noteIndex) : null;
              const t = qSixteenth ? qSixteenth() : (qEighth ? qEighth() : ((S.ensureAudioContext&&S.ensureAudioContext())?.currentTime||S.lastAT||0)+0.0005);
              if (nm && S.triggerInstrument) S.triggerInstrument(S.instrument, nm, t);
            } catch(e){}
            if (S.fx && S.fx.onHit) S.fx.onHit(S.ball.x, S.ball.y);
            if (c){ c.flash = 1.0; c.lastHitAT = (S.lastAT||0); }
          }
          else if (bestIdx <= -1000){
            const ei = (-1000 - bestIdx)|0;
            const c = (S.edgeControllers && S.edgeControllers[ei]) ? S.edgeControllers[ei] : null;
            try {
              const nm = c && S.noteValue ? S.noteValue(S.noteList, c.noteIndex) : null;
              const t = (typeof qSixteenth==='function') ? qSixteenth() : (((S.ensureAudioContext&&S.ensureAudioContext())?.currentTime)||S.lastAT||0)+0.0005;
              if (nm && S.triggerInstrument) S.triggerInstrument(S.instrument, nm, t);
            } catch(e){}
            if (S.fx && S.fx.onHit) S.fx.onHit(S.ball.x, S.ball.y);
            if (c){ c.flash = 1.0; c.lastHitAT = (S.lastAT || 0); }
          } else {

            // Edge controller triggers
            try {
              const m=S.mapControllersByEdge?S.mapControllersByEdge(S.edgeControllers):null;
              const c = (best.nx<0)?(m&&m.left) : (best.nx>0)?(m&&m.right) : (best.ny<0)?(m&&m.top):(m&&m.bot);
              if (c && (c.active!==false)){ const nm=S.noteValue?S.noteValue(S.noteList,c.noteIndex):null; const t = qSixteenth(); if (nm&&S.triggerInstrument) S.triggerInstrument(S.instrument,nm,t); }
            } catch(e){}
          }

          // Remaining fraction after impact
          const used = tMove;
          rem = rem * (1 - used);
          if (rem <= 1e-4) break;
        }
      }

      // light damping once per frame
      S.ball.vx *= 0.999;
      S.ball.vy *= 0.999;
    }
  }

  if (S.fx && S.fx.onStep) S.fx.onStep(S.ball);
  S.lastAT = now;
}

