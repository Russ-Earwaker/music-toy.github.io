import { circleRectHit } from './bouncer-helpers.js';
// src/bouncer-step.js — physics & collisions for Bouncer
export function stepBouncer(S, nowAT){
    const ac = S.ensureAudioContext(); const now = nowAT || (ac ? ac.currentTime : 0); const dt = Math.min(0.04, Math.max(0, now - (S.lastAT || now)));
    { if (S.lastLaunch && S.nextLaunchAt != null && ac && now >= S.nextLaunchAt - 0.005){ S.spawnBallFrom({ x: S.handle.x, y: S.handle.y, vx: S.lastLaunch.vx, vy: S.lastLaunch.vy, r: S.ballR() }); S.nextLaunchAt = null; } }
    S.lastAT = now;
    S.fx.onStep(S.ball);
    for (const b of S.blocks){ b.flash = Math.max(0, b.flash - dt); b.__hitThisStep = false; }
    if (!S.ball) return; const L=S.EDGE, T=S.EDGE, R=S.worldW()-S.EDGE, B=S.worldH()-S.EDGE; const eps = 0.001; const maxComp = Math.max(Math.abs(S.ball.vx), Math.abs(S.ball.vy)); const maxStep = Math.max(1, S.ball.r * 0.4); const steps = Math.max(1, Math.ceil(maxComp / maxStep)); const stepx = S.ball.vx / steps, stepy = S.ball.vy / steps;
    for (let s=0; s<steps; s++){
      S.ball.x += stepx; S.ball.y += stepy;
      for (const b of S.edgeControllers){
        if (!b || !b.collide) continue;
        if (circleRectHit(S.ball.x, S.ball.y, S.ball.r, b)){ b.flash = Math.max(0.9, (b.flash||0)); b.flash = Math.max(0.9, (b.flash||0));
          b.flashDur=0.12; b.flashEnd=now+0.12; const cx = Math.max(b.x, Math.min(S.ball.x, b.x + b.w)); const cy = Math.max(b.y, Math.min(S.ball.y, b.y + b.h)); const dx = S.ball.x - cx; const dy = S.ball.y - cy;
          if (Math.abs(dx) > Math.abs(dy)){ b.flash = Math.max(0.9, (b.flash||0));
            S.ball.vx = (dx>0? Math.abs(S.ball.vx): -Math.abs(S.ball.vx)); b.flashDur=0.15; const __ac=S.ensureAudioContext(); const __now=(__ac?__ac.currentTime:0); b.flashEnd=__now+0.15; b.rippleAge=0; b.rippleMax=18; S.ball.x = cx + (dx>0 ? S.ball.r + 0.0001 : -S.ball.r - 0.0001);
          } else {
            S.ball.vy = (dy>0? Math.abs(S.ball.vy): -Math.abs(S.ball.vy));
            S.ball.y = cy + (dy>0 ? S.ball.r + 0.0001 : -S.ball.r - 0.0001);
          }
          if (b.edge==='left')  S.edgeHitThisStep.left  = true;
          if (b.edge==='right') S.edgeHitThisStep.right = true;
          if (b.edge==='top')   S.edgeHitThisStep.top   = true;
          if (b.edge==='bot')   S.edgeHitThisStep.bot   = true; const __ac = S.ensureAudioContext(); const __n = (__ac?__ac.currentTime:0); b.__hitThisStep = true; b.lastHitAT = __n; b.flash = 1;
          if (b.edge) S.flashEdge(b.edge);
        }
      }
      if (S.ball.x - S.ball.r < L) {
        S.ball.x = L + S.ball.r + eps; S.ball.vx = Math.abs(S.ball.vx);                        
        S.flashEdge('left'); const __m = S.mapControllersByEdge(S.edgeControllers).left; if (__m) __m.flash = 1;
        S.edgeHitThisStep.left = true;
      }
      if (S.ball.x + S.ball.r > R) {
                S.ball.x = R - S.ball.r - eps; S.ball.vx = -Math.abs(S.ball.vx);                
        S.flashEdge('right'); const __m = S.mapControllersByEdge(S.edgeControllers).right; if (__m) __m.flash = 1;
        S.edgeHitThisStep.right = true;
      }
      if (S.ball.y - S.ball.r < T) {
                        S.ball.y = T + S.ball.r + eps; S.ball.vy = Math.abs(S.ball.vy);        
        S.flashEdge('top'); const __m = S.mapControllersByEdge(S.edgeControllers).top; if (__m) __m.flash = 1;
        S.edgeHitThisStep.top = true;
      }
      if (S.ball.y + S.ball.r > B) {
                                S.ball.y = B - S.ball.r - eps; S.ball.vy = -Math.abs(S.ball.vy);
        S.flashEdge('bot'); const __m = S.mapControllersByEdge(S.edgeControllers).bot; if (__m) __m.flash = 1;
        S.edgeHitThisStep.bot = true;
      }
      for (const b of S.blocks){
        /* keep colliding even when disabled */
        if (circleRectHit(S.ball.x, S.ball.y, S.ball.r, b)){ if (b.active){ b.flashDur=0.12; b.flashEnd=now+0.12; b.flash = Math.max(0.9, (b.flash||0)); }
          const cx = Math.max(b.x, Math.min(S.ball.x, b.x + b.w)); const cy = Math.max(b.y, Math.min(S.ball.y, b.y + b.h)); const dx = S.ball.x - cx, dy = S.ball.y - cy;
          if (Math.abs(dx) > Math.abs(dy)){
            S.ball.vx = (dx>0? Math.abs(S.ball.vx): -Math.abs(S.ball.vx));
            S.ball.x = cx + (dx>0 ? S.ball.r + eps : -S.ball.r - eps);
          } else {
            S.ball.vy = (dy>0? Math.abs(S.ball.vy): -Math.abs(S.ball.vy));
            S.ball.y = cy + (dy>0 ? S.ball.r + eps : -S.ball.r - eps);
          }
          b.__hitThisStep = true;
        }
      }
    }
    S.ball.vx *= 0.999; S.ball.vy *= 0.999;
    for (const b of S.blocks){ if (b.__hitThisStep && b.active && (now - (b.lastHitAT || 0) > 0.09)){
        const name = S.noteValue(S.noteList, b.noteIndex);
        try { S.triggerInstrument(S.instrument, name, now + 0.0005); } catch (e) {}
        b.lastHitAT = now; b.flash = 0.18;
      }
      b.__hitThisStep = false;
    }
    if (S.edgeHitThisStep.left && now - S.edgeLastHitAT.left > 0.07){
  const __map = S.mapControllersByEdge(S.edgeControllers);
  const ctrl = __map.left;
  if (ctrl && ctrl.active){
    const nm = S.noteValue(S.noteList, ctrl.noteIndex);
    try { S.triggerInstrument(S.instrument, nm, now+0.0005); } catch (e) {}
    S.edgeLastHitAT.left = now;
  }
}
if (S.edgeHitThisStep.right && now - S.edgeLastHitAT.right > 0.07){
  const __map = S.mapControllersByEdge(S.edgeControllers);
  const ctrl = __map.right;
  if (ctrl && ctrl.active){
    const nm = S.noteValue(S.noteList, ctrl.noteIndex);
    try { S.triggerInstrument(S.instrument, nm, now+0.0005); } catch (e) {}
    S.edgeLastHitAT.right = now;
  }
}
if (S.edgeHitThisStep.top && now - S.edgeLastHitAT.top > 0.07){
  const __map = S.mapControllersByEdge(S.edgeControllers);
  const ctrl = __map.top;
  if (ctrl && ctrl.active){
    const nm = S.noteValue(S.noteList, ctrl.noteIndex);
    try { S.triggerInstrument(S.instrument, nm, now+0.0005); } catch (e) {}
    S.edgeLastHitAT.top = now;
  }
}
if (S.edgeHitThisStep.bot && now - S.edgeLastHitAT.bot > 0.07){
  const __map = S.mapControllersByEdge(S.edgeControllers);
  const ctrl = __map.bot;
  if (ctrl && ctrl.active){
    const nm = S.noteValue(S.noteList, ctrl.noteIndex);
    try { S.triggerInstrument(S.instrument, nm, now+0.0005); } catch (e) {}
    S.edgeLastHitAT.bot = now;
  }
}
S.edgeHitThisStep.left = S.edgeHitThisStep.right = S.edgeHitThisStep.top = S.edgeHitThisStep.bot = false;

  }
