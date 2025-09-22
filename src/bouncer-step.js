
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
  const DBG_RESPAWN = ()=> window.BOUNCER_RESPAWN_DBG;
  if (DBG_RESPAWN()) {
    console.log(`[BNC_DBG] step: ENTER. ball flightEnd=${S.ball?.flightEnd?.toFixed(3)}`);
  }

  // Global coalescing disabled: allow multiple sources to fire in the same tick.
  function allowGlobalAtTick(){ return true; }
  // Optional quant debug aggregator
  function dbgMarkFire(label, t){
    try{
      if (!window.BOUNCER_QUANT_DBG) return;
      const li = S.getLoopInfo ? S.getLoopInfo() : null;
      const divRaw = (typeof S.getQuantDiv==='function') ? (S.getQuantDiv()) : 4;
      const div = Number.isFinite(divRaw) ? divRaw : 4;
      const baseBeat = (li && (li.beatLen || (li.barLen/4))) || 0;
      const grid = div > 0 ? (baseBeat / div) : 0;
      const at = (S.ensureAudioContext && S.ensureAudioContext())?.currentTime || (t||0);
      const rel = li ? Math.max(0, at - li.loopStartTime) : 0;
      const tick = grid > 0 ? Math.ceil((rel + 1e-6) / grid) : -1;
      const g = (window.__bouncerFireDbg = window.__bouncerFireDbg || { counts:new Map(), lastTick:-1, lastAt:0, lastLabel:'', grid:0, div:0 });
      g.div = div; g.grid = grid; g.lastAt = t||at; g.lastLabel = label; g.lastTick = tick;
      const c = g.counts.get(tick) || 0; g.counts.set(tick, c+1);
    }catch{}
  }
  // Quantize to next division aligned to project BEAT (not bar), or immediate if off
  function qSixteenth(){
    const ac = (S.ensureAudioContext && S.ensureAudioContext()) || null;
    const at = ac ? ac.currentTime : (S.now || 0);
    const li = S.getLoopInfo ? S.getLoopInfo() : null;
    if (li && typeof li.loopStartTime === 'number' && li.barLen){
      const divRaw = (typeof S.getQuantDiv==='function') ? (S.getQuantDiv()) : 4;
      const div = Number.isFinite(divRaw) ? divRaw : 4;
      if (!div || div <= 0) return at + 0.0005; // no quantization
      // Use beat length so 1/1 = every beat, 1/2 = half-beat, etc.
      const grid = (li.beatLen || (li.barLen/4)) / div;
      const rel  = Math.max(0, at - li.loopStartTime);
      const k    = Math.ceil((rel + 1e-6) / grid);
      return li.loopStartTime + k * grid;
    }
    return at + 0.0005;
  }

  // Tick de-dupe maps (per-division index since epoch, aligned to beats)
  S.__lastTickByBlock = S.__lastTickByBlock || new Map();
  S.__lastTickByEdge  = S.__lastTickByEdge  || new Map();

  const ac = S.ensureAudioContext && S.ensureAudioContext();
  const now = nowAT || (ac ? ac.currentTime : (S.lastAT || 0));

  // If a ball was restored from a snapshot, it will have a `flightTimeRemaining`
  // property. We must convert this to an absolute `flightEnd` time using the
  // current audio clock. This is the only reliable place to do this, as it
  // guarantees we use the same `now` as the physics step.
  if (S.ball && S.ball.flightTimeRemaining != null) {
    S.ball.flightEnd = now + S.ball.flightTimeRemaining;
    const li = S.getLoopInfo ? S.getLoopInfo() : null;
    const life = (li && li.barLen > 0) ? (li.barLen * S.BOUNCER_BARS_PER_LIFE) : 2.0;
    S.ball.spawnTime = S.ball.flightEnd - life; // Reconstruct spawnTime
    delete S.ball.flightTimeRemaining; // Consume the property
    if (window.BOUNCER_RESPAWN_DBG) {
      console.log(`[BNC_DBG] step: Converted flightTimeRemaining to flightEnd=${S.ball.flightEnd.toFixed(3)} (now=${now.toFixed(3)})`);
    }
  }

  // If a ball was launched while paused, its flight time needs to be initialized now.
  if (S.ball && S.ball.pendingFlightTime) {
    delete S.ball.pendingFlightTime; // Consume the flag
    try {
      const li = S.getLoopInfo ? S.getLoopInfo() : null;
      let life = 2.0;
      if (li && Number.isFinite(li.barLen) && li.barLen > 0) {
        life = li.barLen * S.BOUNCER_BARS_PER_LIFE;
      }
      S.ball.flightEnd = now + life;
      S.ball.spawnTime = now;
      S.nextLaunchAt = S.ball.flightEnd; // Also update the respawn timer
    } catch(e) { console.warn('[bouncer-step] failed to set pending flight time', e); }
  }

  if (S.nextLaunchAtRemaining != null) {
    S.nextLaunchAt = now + S.nextLaunchAtRemaining;
    S.nextLaunchAtRemaining = null; // Consume the property
  }
  
  // Framescale: keep speed consistent across FPS
  const dt = Math.max(0, (now - (S.lastAT || now)));
  const frameFactor = Math.min(3.0, Math.max(0.25, dt * 60));

  // integrate with swept collision (segment vs expanded AABB)
  if (S.ball){
    if (S.ball.flightEnd != null && now >= S.ball.flightEnd) {
      // The ball's life is over. Signal the chain to advance to the next toy.
      if (S.panel) {
        S.panel.dispatchEvent(new CustomEvent('chain:next', { bubbles: true }));
      }
      S.ball = null; // End of life for the current ball
    } else if (!S.ball.isGhost) {
      const eps = 0.001;
      // Collide against the same locked physics bounds as rendering
      const L=S.EDGE, T=S.EDGE, R=S.physW()-S.EDGE, B=S.physH()-S.EDGE;
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
            if (li && li.barLen) {
              // De-dupe logic should use a fixed small interval (e.g., 16th notes)
              // regardless of the user's quantization setting, to prevent single
              // physics events from triggering multiple notes.
              const DEDUPE_DIV = 4; // 4 divisions per beat = 16th notes
              const baseBeat = (li && (li.beatLen || (li.barLen/4))) || 0;
              const grid = baseBeat / DEDUPE_DIV;
              const at = (S.ensureAudioContext && S.ensureAudioContext())?.currentTime || now;
              const rel = Math.max(0, at - li.loopStartTime);
              tick16 = grid > 0 ? Math.ceil((rel + 1e-6) / grid) : null;
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
                const nm = S.noteValue ? (S.noteList && Number.isFinite((b.noteIndex))) ? S.noteList[Math.max(0, Math.min(S.noteList.length-1, ((b.noteIndex)|0)))] : null : null;
                const t = qSixteenth();
                // Global coalescing: only one scheduler per tick across all sources (per bar)
                // Global coalescing disabled: do not suppress other sources in this tick
                try { if (window && window.BOUNCER_LOOP_DBG) { var __tt=(t && t.toFixed)?t.toFixed(4):t; console.log('[bouncer-step] HIT', nm, 'idx=', (b&&b.noteIndex), 'listLen=', (S.noteList&&S.noteList.length), 't=', __tt); } } catch(e) {}
                // Pass block index for replay logic
                if (nm && S.triggerInstrument) S.triggerInstrument(S.instrument, nm, t, { blockIndex: bestIdx });
                if (S.fx && S.fx.onHit) S.fx.onHit(S.ball.x, S.ball.y);
                if (S.panel) S.panel.__pulseHighlight = 1.0;
                dbgMarkFire('block', t);
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
                const nm = S.noteValue ? (S.noteList && Number.isFinite((c.noteIndex))) ? S.noteList[Math.max(0, Math.min(S.noteList.length-1, ((c.noteIndex)|0)))] : null : null;
                const t = qSixteenth();
                // Global coalescing disabled: do not suppress other sources in this tick
                try { if (window && window.BOUNCER_LOOP_DBG) { var __tt=(t && t.toFixed)?t.toFixed(4):t; console.log('[bouncer-step] HIT', nm, 'idx=', (b&&c.noteIndex), 'listLen=', (S.noteList&&S.noteList.length), 't=', __tt); } } catch(e) {} // Pass edge controller index for replay logic
                if (nm && S.triggerInstrument) S.triggerInstrument(S.instrument, nm, t, { edgeControllerIndex: ei });
                if (S.fx && S.fx.onHit) S.fx.onHit(S.ball.x, S.ball.y);
                if (S.panel) S.panel.__pulseHighlight = 1.0;
                dbgMarkFire('edge-controller', t);
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
                const nm = S.noteValue ? (S.noteList && Number.isFinite((c.noteIndex))) ? S.noteList[Math.max(0, Math.min(S.noteList.length-1, ((c.noteIndex)|0)))] : null : null;
                const t = qSixteenth();
                try { if (window && window.BOUNCER_LOOP_DBG) { var __tt=(t && t.toFixed)?t.toFixed(4):t; console.log('[bouncer-step] HIT', nm, 'idx=', (b&&c.noteIndex), 'listLen=', (S.noteList&&S.noteList.length), 't=', __tt); } } catch(e) {}
                // de-dupe per 16th tick for world edges
                const edgeKey = (best.nx>0)?'L':(best.nx<0)?'R':(best.ny>0)?'T':'B';
                const lastEdgeTick = (S.__lastTickByEdge && S.__lastTickByEdge.get) ? S.__lastTickByEdge.get(edgeKey) : undefined;
                if (tick16 != null && lastEdgeTick === tick16) { /* already fired this edge this tick */ return; }
                // Global coalescing disabled: do not suppress other sources in this tick
                if (S.__lastTickByEdge && S.__lastTickByEdge.set) S.__lastTickByEdge.set(edgeKey, tick16);
                if (nm && S.triggerInstrument) S.triggerInstrument(S.instrument, nm, t, { edgeName: edgeKey });
                if (typeof S.flashEdge==='function') S.flashEdge((best.nx>0)?'left':(best.nx<0)?'right':(best.ny>0)?'top':'bot');
                if (S.panel) S.panel.__pulseHighlight = 1.0;
                dbgMarkFire('border', t);
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
  // If there's no ball, check if it's time to respawn.
  else {
    if (S.lastLaunch && S.nextLaunchAt != null) {
      const shouldRespawn = now >= (S.nextLaunchAt - 0.001);
      if (window.BOUNCER_RESPAWN_DBG) {
          console.log(`[BNC_DBG] step: No ball. Checking respawn. now=${now.toFixed(3)}, nextLaunchAt=${S.nextLaunchAt.toFixed(3)}, shouldRespawn=${shouldRespawn}`);
      }
      if (shouldRespawn) {
        if (window.BOUNCER_RESPAWN_DBG) console.log('[BNC_DBG] step: Respawning ball.');
        // Respawn from the original launch point, not the current handle position.
        const nb = S.spawnBallFrom({ x: S.lastLaunch.x, y: S.lastLaunch.y, vx: S.lastLaunch.vx, vy: S.lastLaunch.vy, r: S.ballR() }, { isRespawn: true }, S);
        S.ball = nb;
        try {
          S.ball.x += (S.ball.vx||0)*0.6;
          S.ball.y += (S.ball.vy||0)*0.6;
        } catch(e) {}
        S.__justSpawnedUntil = now + 0.05;
      }
    } else if (window.BOUNCER_RESPAWN_DBG) {
        console.log('[BNC_DBG] step: No ball. Not respawning.', { hasLastLaunch: !!S.lastLaunch, hasNextLaunchAt: S.nextLaunchAt != null });
    }
  }

  if (DBG_RESPAWN()) {
    console.log(`[BNC_DBG] step: EXIT. ball flightEnd=${S.ball?.flightEnd?.toFixed(3)}`);
  }
  if (S.fx && S.fx.onStep) S.fx.onStep(S.ball);
  S.lastAT = now;
}
