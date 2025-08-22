import { circleRectHit } from './bouncer-helpers.js';
  
// src/bouncer-step.js — physics & collisions for Bouncer (clean, balanced)
const DBG = (...a)=>{ try { console.log('[bouncer]', ...a); } catch(e){} };
export function stepBouncer(S, nowAT){
  // Clock & dt
  const ac = S.ensureAudioContext();
  const now = nowAT || (ac ? ac.currentTime : (S.lastAT || 0));
  const dt  = Math.min(0.04, Math.max(0, now - (S.lastAT || now)));

  // Clear per-frame edge flags
  if (S.edgeHitThisStep){
    S.edgeHitThisStep.left = S.edgeHitThisStep.right = false;
    S.edgeHitThisStep.top  = S.edgeHitThisStep.bot   = false;
  }

  // Scheduled relaunch
  if (S.lastLaunch && S.nextLaunchAt != null && ac && now >= S.nextLaunchAt - 0.001){ DBG('spawn due', {now, next:S.nextLaunchAt, lastLaunch:S.lastLaunch});
    const nb = S.spawnBallFrom({ x: S.handle.x, y: S.handle.y, vx: S.lastLaunch.vx, vy: S.lastLaunch.vy, r: S.ballR() });
    S.ball = nb; 
    // Clamp spawn safely inside bounds and offset along velocity
    try {
      const L = S.EDGE, T = S.EDGE;
      const R = S.worldW() - S.EDGE, B = S.worldH() - S.EDGE;
      const rr = (S.ball && S.ball.r) ? S.ball.r : (S.ballR ? S.ballR() : 10);
      S.ball.x = Math.min(Math.max(S.ball.x, L + rr + 2), R - rr - 2);
      S.ball.y = Math.min(Math.max(S.ball.y, T + rr + 2), B - rr - 2);
      S.ball.x += (S.ball.vx || 0) * 0.6;
      S.ball.y += (S.ball.vy || 0) * 0.6;
    } catch(e) {}
    DBG('spawned', {pos:{x:S.ball.x,y:S.ball.y}, vel:{vx:S.ball.vx,vy:S.ball.vy}});
    // Life & next relaunch: exactly N bars (default 1)
    try {
      const li = S.getLoopInfo ? S.getLoopInfo() : null;
      const bl = li ? li.barLen : 0;
      if (bl && S.ball){
        S.ball.flightEnd = now + bl * (S.BOUNCER_BARS_PER_LIFE || 1);
        if (S.setNextLaunchAt) S.setNextLaunchAt(S.ball.flightEnd); else S.nextLaunchAt = S.ball.flightEnd;
      }
    } catch(e){ /* noop */ }
    // First-frame safety
    S.__justSpawnedUntil = now + 0.05;
    if (S.ball){ S.ball.x += S.ball.vx * 0.25; S.ball.y += S.ball.vy * 0.25; S.ball.__warm = 2; }
  }

  S.lastAT = now;
  if (!S.__dbgT || now - S.__dbgT > 1){ S.__dbgT = now; DBG('tick', {now, hasBall: !!S.ball, nextAt: S.nextLaunchAt, flightEnd: S.ball && S.ball.flightEnd}); }
  if (S.fx && S.fx.onStep) S.fx.onStep(S.ball);

  // First-frame velocity guard (if something zeroed it)
  // One-frame trace after spawn
  if (S.ball){
    if (S.__spawnFrames == null) S.__spawnFrames = 0;
    if (S.__spawnFrames < 3){
      DBG('post-spawn frame', S.__spawnFrames, {pos:{x:S.ball.x,y:S.ball.y}, vel:{vx:S.ball.vx,vy:S.ball.vy}});
      S.__spawnFrames++;
    }
  }
if (S.ball && S.__justSpawnedUntil){
    const minV = 0.8;
    const spdNow = Math.hypot(S.ball.vx||0, S.ball.vy||0);
    if (spdNow < minV && S.lastLaunch){
      const spdLL = Math.hypot(S.lastLaunch.vx||0, S.lastLaunch.vy||0) || 1;
      const k = Math.max(minV, spdLL);
      const nx = (S.lastLaunch.vx||0) / spdLL, ny = (S.lastLaunch.vy||0) / spdLL;
      S.ball.vx = nx * k; S.ball.vy = ny * k; DBG('kickstart vel', {vx:S.ball.vx, vy:S.ball.vy});
    }
    if (now <= S.__justSpawnedUntil){
      const spd = Math.abs(S.ball.vx||0) + Math.abs(S.ball.vy||0);
      if (spd < 1e-6 && S.lastLaunch){ S.ball.vx = S.lastLaunch.vx; S.ball.vy = S.lastLaunch.vy; }
    } else {
      S.__justSpawnedUntil = null;
    }
  }

  // Expire life at end-of-bar(s)
  if (S.ball && S.ball.flightEnd && now >= S.ball.flightEnd - 0.001){
    DBG('expire life', {t:now}); if (S.setBallOut) S.setBallOut(null); S.ball = null; S.__spawnFrames = 0;
  }

  // Fade block flashes & reset their step hit
  if (S.blocks){
    for (const b of S.blocks){
      b.flash = Math.max(0, (b.flash||0) - dt);
      b.__hitThisStep = false;
    }
  }

  // Nothing to simulate if no ball
  if (!S.ball) return;

  // World bounds in CSS px
  const L = S.EDGE, T = S.EDGE;
  const R = S.worldW() - S.EDGE, B = S.worldH() - S.EDGE;
  const eps = 0.001;

  // Integrate with substeps for robust collisions
  {
    const steps = 3;
    const inv = 1/steps;
    for (let si=0; si<steps; si++){
      // Move a fraction of the frame
      S.ball.x += S.ball.vx * inv;
      S.ball.y += S.ball.vy * inv;

      // Optional warm-up: skip collisions for first couple frames
      const doCollide = !(S.ball && S.ball.__warm);

      if (doCollide){
        // Collide with edge controllers (locked cubes)
        if (S.edgeControllers){
          for (const b of S.edgeControllers){
            if (!b || !b.collide) continue;
            if (circleRectHit(S.ball.x, S.ball.y, S.ball.r, b)){
              const cx = Math.max(b.x, Math.min(S.ball.x, b.x + b.w));
              const cy = Math.max(b.y, Math.min(S.ball.y, b.y + b.h));
              const dx = S.ball.x - cx, dy = S.ball.y - cy;
              if (Math.abs(dx) > Math.abs(dy)){
                S.ball.vx = (dx>0 ? Math.abs(S.ball.vx) : -Math.abs(S.ball.vx));
                S.ball.x  = cx + (dx>0 ? S.ball.r + eps : -S.ball.r - eps);
              } else {
                S.ball.vy = (dy>0 ? Math.abs(S.ball.vy) : -Math.abs(S.ball.vy));
                S.ball.y  = cy + (dy>0 ? S.ball.r + eps : -S.ball.r - eps);
              }
              b.__hitThisStep = true; b.flash = Math.max(0.9, (b.flash||0)); b.flashDur = 0.12; b.flashEnd = now + 0.12;
              try {
                const ac2 = ac || S.ensureAudioContext();
                const nm  = S.noteValue(S.noteList, b.noteIndex);
                S.triggerInstrument(S.instrument, nm, (ac2?ac2.currentTime:now)+0.0005);
              } catch(e){ /* ignore */ }
              if (b.edge==='left')  S.edgeHitThisStep.left  = true;
              if (b.edge==='right') S.edgeHitThisStep.right = true;
              if (b.edge==='top')   S.edgeHitThisStep.top   = true;
              if (b.edge==='bot')   S.edgeHitThisStep.bot   = true;
            }
          }
        }

        // Collide with floating blocks
        if (S.blocks){
          for (const b of S.blocks){
            if (!b || b.w==null) continue;
            if (circleRectHit(S.ball.x, S.ball.y, S.ball.r, b)){
              const cx = Math.max(b.x, Math.min(S.ball.x, b.x + b.w));
              const cy = Math.max(b.y, Math.min(S.ball.y, b.y + b.h));
              const dx = S.ball.x - cx, dy = S.ball.y - cy;
              if (Math.abs(dx) > Math.abs(dy)){
                S.ball.vx = (dx>0 ? Math.abs(S.ball.vx) : -Math.abs(S.ball.vx));
                S.ball.x  = cx + (dx>0 ? S.ball.r + eps : -S.ball.r - eps);
              } else {
                S.ball.vy = (dy>0 ? Math.abs(S.ball.vy) : -Math.abs(S.ball.vy));
                S.ball.y  = cy + (dy>0 ? S.ball.r + eps : -S.ball.r - eps);
              }
              b.__hitThisStep = true; b.flash = Math.max(0.9, (b.flash||0)); b.flashDur = 0.12; b.flashEnd = now + 0.12;
              if (b.active){
                try {
                  const ac2 = ac || S.ensureAudioContext();
                  const nm  = S.noteValue(S.noteList, b.noteIndex);
                  S.triggerInstrument(S.instrument, nm, (ac2?ac2.currentTime:now)+0.0005);
                } catch(e){ /* ignore */ }
              }
            }
          }
        }
      } // end doCollide

      // Collide with world bounds (also flash & sound on edge controllers)
      if (S.ball.x - S.ball.r < L){
        S.ball.x = L + S.ball.r + eps; S.ball.vx =  Math.abs(S.ball.vx);
        if (S.flashEdge) S.flashEdge('left');
        const m = S.mapControllersByEdge(S.edgeControllers).left;  if (m){ m.flash=1; try{ const nm=S.noteValue(S.noteList, m.noteIndex); const t=(ac?ac.currentTime:now)+0.0005; S.triggerInstrument(S.instrument, nm, t);}catch(e){} }
        S.edgeHitThisStep.left  = true;
      }
      if (S.ball.x + S.ball.r > R){
        S.ball.x = R - S.ball.r - eps; S.ball.vx = -Math.abs(S.ball.vx);
        if (S.flashEdge) S.flashEdge('right');
        const m = S.mapControllersByEdge(S.edgeControllers).right; if (m){ m.flash=1; try{ const nm=S.noteValue(S.noteList, m.noteIndex); const t=(ac?ac.currentTime:now)+0.0005; S.triggerInstrument(S.instrument, nm, t);}catch(e){} }
        S.edgeHitThisStep.right = true;
      }
      if (S.ball.y - S.ball.r < T){
        S.ball.y = T + S.ball.r + eps; S.ball.vy =  Math.abs(S.ball.vy);
        if (S.flashEdge) S.flashEdge('top');
        const m = S.mapControllersByEdge(S.edgeControllers).top;   if (m){ m.flash=1; try{ const nm=S.noteValue(S.noteList, m.noteIndex); const t=(ac?ac.currentTime:now)+0.0005; S.triggerInstrument(S.instrument, nm, t);}catch(e){} }
        S.edgeHitThisStep.top   = true;
      }
      if (S.ball.y + S.ball.r > B){
        S.ball.y = B - S.ball.r - eps; S.ball.vy = -Math.abs(S.ball.vy);
        if (S.flashEdge) S.flashEdge('bot');
        const m = S.mapControllersByEdge(S.edgeControllers).bot;   if (m){ m.flash=1; try{ const nm=S.noteValue(S.noteList, m.noteIndex); const t=(ac?ac.currentTime:now)+0.0005; S.triggerInstrument(S.instrument, nm, t);}catch(e){} }
        S.edgeHitThisStep.bot   = true;
      }
    }
  }

  if (S.ball && S.ball.__warm){ S.ball.__warm--; }

  // Damping
  S.ball.vx *= 0.999;
  S.ball.vy *= 0.999;
}
