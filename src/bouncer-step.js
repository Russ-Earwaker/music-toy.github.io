// src/bouncer-step.js — swept collisions + quantized, de-duped scheduling (<=300 lines)
import { circleRectHit } from './bouncer-helpers.js';

function sweptCircleAABB(px, py, vx, vy, r, rect){
  const ex = rect.x - r, ey = rect.y - r, ew = rect.w + 2*r, eh = rect.h + 2*r;
  if (vx === 0 && vy === 0) return null;
  let tmin = 0, tmax = 1, nx = 0, ny = 0;
  if (vx !== 0){
    const tx1 = (ex - px) / vx, tx2 = (ex + ew - px) / vx;
    const txe = Math.min(tx1, tx2), txl = Math.max(tx1, tx2);
    if (txe > tmin){ tmin = txe; nx = (vx > 0) ? -1 : 1; ny = 0; }
    tmax = Math.min(tmax, txl);
  } else if (px < ex || px > ex + ew) return null;
  if (vy !== 0){
    const ty1 = (ey - py) / vy, ty2 = (ey + eh - py) / vy;
    const tye = Math.min(ty1, ty2), tyl = Math.max(ty1, ty2);
    if (tye > tmin){ nx = 0; ny = (vy > 0) ? -1 : 1; tmin = tye; }
    tmax = Math.min(tmax, tyl);
  } else if (py < ey || py > ey + eh) return null;
  if (tmax < tmin || tmin < 0 || tmin > 1) return null;
  const hitX = px + vx * tmin, hitY = py + vy * tmin;
  return { t: tmin, nx, ny, hx: hitX, hy: hitY };
}

export function stepBouncer(S, nowAT){
  // Quantize to next sixteenth (epoch-based)
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

  // Tick de-dupe maps (per-16th index since epoch)
  S.__lastTickByBlock = S.__lastTickByBlock || new Map();
  S.__lastTickByEdge  = S.__lastTickByEdge  || new Map();

  const ac = S.ensureAudioContext && S.ensureAudioContext();
  const now = nowAT || (ac ? ac.currentTime : (S.lastAT || 0));

  
  // Framescale: keep speed consistent across FPS
  const dt = Math.max(0, (now - (S.lastAT || now)));
  const frameFactor = Math.min(3.0, Math.max(0.25, dt * 60));
// scheduled re-spawn (keep behavior but tie life to barLen)
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

  // integrate with swept collision (segment vs expanded AABB)
  if (S.ball){
    if (S.ball.flightEnd != null && now >= S.ball.flightEnd){ S.ball = null; }
    else {
      const eps = 0.001;
      const L=S.EDGE, T=S.EDGE, R=S.worldW()-S.EDGE, B=S.worldH()-S.EDGE;
      const rr = S.ball.r || S.ballR();
      const blocks = S.blocks || [];
      let rem = frameFactor, iterations = 0, maxIter = 4;

      while (rem > 1e-4 && iterations++ < maxIter){
        const stepLen = Math.min(1, rem);
        const vx = S.ball.vx * stepLen, vy = S.ball.vy * stepLen;

        // Track earliest hit among blocks
        let best = null, bestIdx = -1;
        for (let i=0;i<blocks.length;i++){
          const b = blocks[i]; if (!b || b.fixed === true) continue;
          const h = sweptCircleAABB(S.ball.x, S.ball.y, vx, vy, rr, b);
          if (h && (best == null || h.t < best.t)){ best = h; bestIdx = i; }
        }

        // World bounds (as rect slabs)
        const wrects = [
          { x: -1e6, y: T,   w: (L - (-1e6)), h: B-T,   nx:  1, ny:  0 },
          { x: R,    y: T,   w: 1e6,          h: B-T,   nx: -1, ny:  0 },
          { x: L,    y:-1e6, w: R-L,          h:(T-(-1e6)), nx: 0, ny: 1 },
          { x: L,    y: B,   w: R-L,          h: 1e6,   nx:  0, ny: -1 },
        ];
        for (let wi=0; wi<wrects.length; wi++){
          const wr = wrects[wi];
          const h = sweptCircleAABB(S.ball.x, S.ball.y, vx, vy, rr, wr);
          if (h){ h.nx = wr.nx; h.ny = wr.ny; if (best == null || h.t < best.t){ best = h; bestIdx = -100 - wi; } }
        }

        // Edge controller cubes as collidables
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
          S.ball.x += vx; S.ball.y += vy; break;
        } else {
          // Move to hit point and reflect
          const tMove = Math.max(0, Math.min(1, best.t));
          S.ball.x += vx * tMove; S.ball.y += vy * tMove;
          S.ball.x = best.hx; S.ball.y = best.hy;
          if (best.nx != 0) S.ball.vx = -S.ball.vx;
          if (best.ny != 0) S.ball.vy = -S.ball.vy;
          S.ball.x += best.nx * eps; S.ball.y += best.ny * eps;

          // Compute grid tick for de-dupe
          let tick16 = null;
          try {
            const li = S.getLoopInfo ? S.getLoopInfo() : null;
            if (li && li.barLen){
              const grid = li.barLen / 16;
              const at = (S.ensureAudioContext && S.ensureAudioContext())?.currentTime || now;
              const rel = Math.max(0, at - li.loopStartTime);
              tick16 = Math.ceil((rel + 1e-6) / grid);
            }
          } catch(e){}

          // Trigger logic
          if (bestIdx >= 0){
            const b = blocks[bestIdx];
            const isActive = !!(b && b.active !== false);
            if (isActive){
              // de-dupe per tick
              const last = S.__lastTickByBlock.get(bestIdx);
              if (tick16 == null || last !== tick16){
                const nm = S.noteValue ? S.noteValue(S.noteList, b.noteIndex) : null;
                const t = qSixteenth();
                if (nm && S.triggerInstrument) S.triggerInstrument(S.instrument, nm, t);
                if (S.fx && S.fx.onHit) S.fx.onHit(S.ball.x, S.ball.y);
                b.flash = 1.0; b.flashDur = 0.12;
                const at2 = (S.ensureAudioContext && S.ensureAudioContext())?.currentTime || now;
                b.flashEnd = at2 + b.flashDur;
                if (tick16 != null) S.__lastTickByBlock.set(bestIdx, tick16);
              }
            }
          } else if (bestIdx <= -1000){
            const ei = (-1000 - bestIdx) | 0;
            const c = (S.edgeControllers && S.edgeControllers[ei]) ? S.edgeControllers[ei] : null;
            if (c && c.active !== false){
              const last = S.__lastTickByEdge.get(ei);
              if (tick16 == null || last !== tick16){
                const nm = S.noteValue ? S.noteValue(S.noteList, c.noteIndex) : null;
                const t = qSixteenth();
                if (nm && S.triggerInstrument) S.triggerInstrument(S.instrument, nm, t);
                if (S.fx && S.fx.onHit) S.fx.onHit(S.ball.x, S.ball.y);
                c.flash = 1.0; c.flashDur = 0.12;
                const at2 = (S.ensureAudioContext && S.ensureAudioContext())?.currentTime || now;
                c.flashEnd = at2 + c.flashDur;
                if (tick16 != null) S.__lastTickByEdge.set(ei, tick16);
              }
            }
          } else {
            // Edge wall as note (via controllers mapping)
            try {
              const m = S.mapControllersByEdge ? S.mapControllersByEdge(S.edgeControllers) : null;
              const c = (best.nx>0)?(m&&m.left) : (best.nx<0)?(m&&m.right) : (best.ny>0)?(m&&m.top):(m&&m.bot);
              if (c && (c.active!==false)){
                const nm = S.noteValue ? S.noteValue(S.noteList, c.noteIndex) : null;
                const t = qSixteenth();
                if (nm && S.triggerInstrument) S.triggerInstrument(S.instrument, nm, t);
                if (typeof S.flashEdge==='function') S.flashEdge((best.nx>0)?'left':(best.nx<0)?'right':(best.ny>0)?'top':'bot');
                c.flash = 1.0; c.flashDur = 0.12;
                const at2 = (S.ensureAudioContext && S.ensureAudioContext())?.currentTime || now;
                c.flashEnd = at2 + c.flashDur;
              }
            } catch(e){}
          }

          // Remaining fraction after impact
          const used = tMove;
          rem -= used * stepLen;
          if (rem <= 1e-4) break;
        }
      }

      // light damping
      /* no damping */
    }
  }

  if (S.fx && S.fx.onStep) S.fx.onStep(S.ball);
  S.lastAT = now;
}
