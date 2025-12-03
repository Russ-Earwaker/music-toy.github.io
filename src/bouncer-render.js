// src/bouncer-render.js
const __DBG = (globalThis.BOUNCER_DBG_LEVEL|0)||0; const __d=(lvl,...a)=>{ if(__DBG>=lvl) console.log(...a); };
// Encapsulates the Bouncer draw loop to keep bouncer.main.js concise.
import { drawBlock } from './toyhelpers.js';
import { isRunning } from './audio-core.js';
import { startSection } from './perf-meter.js';

export function createBouncerDraw(env){
  const {
    panel, canvas, ctx, sizing, resizeCanvasForDPR, renderScale, physW, physH, EDGE,
    ensureEdgeControllers, edgeControllers, blockSize, blocks, handle,
    particles, drawEdgeBondLines, ensureAudioContext, noteList,
    drawEdgeDecorations, edgeFlash, getLoopInfo,
    getPreviewState, applyPreviewState,
    stepBouncer, buildStateForStep, applyFromStep, installInteractions,
    getBall, lockPhysWorld, getAim, spawnBallFrom, getLastLaunch,
    velFrom, ballR, updateLaunchBaseline,
    BOUNCER_BARS_PER_LIFE, setBallOut, setNextLaunchAt
  } = env;

  let lastCssW = 0, lastCssH = 0;
  const ballTrail = []; let lastBallPos = null; let teleportGuard = false;
  const sparks = [];
  // Local state for flash animations, to survive state rebuilds from the physics engine.
  const blockFlashes = [];
  const edgeFlashes = [];
  let wasActiveInChain = false;
  let lastLifeProgress = 0; // For freezing the life line when paused

  let prevNow = 0;
  let lastBeat = -1; let lastBar = -1;
  let didInit = false;
  let _loggedCubeOnce = false;

  function draw(){
    const endPerf = startSection('bouncer:draw');
    try {
      // Always ensure backing store matches CSS size for crisp rendering
      try{ resizeCanvasForDPR(canvas, ctx); }catch{}
      // Track CSS size (optional diagnostics)
      const cssW = Math.max(1, Math.round(canvas.clientWidth || 0));
      const cssH = Math.max(1, Math.round(canvas.clientHeight || 0));
      lastCssW = cssW; lastCssH = cssH;

    // First-frame init: lock world and set launch baseline
    if (!didInit){
      try{ lockPhysWorld && lockPhysWorld(); }catch{}
      try{ updateLaunchBaseline && updateLaunchBaseline(physW, physH, EDGE); }catch{}
      // Defer interaction setup until the first frame to ensure canvas is sized.
      try { installInteractions && installInteractions(); } catch(e) { console.warn('[bouncer-render] installInteractions failed', e); }
      didInit = true;
    }

    // Reset transform and apply world→render scale
    try{ ctx.setTransform(1,0,0,1,0,0); }catch{}
    // Explicitly fill with the background color to prevent flashing on some systems.
    // With alpha:false, clearRect can have undefined behavior. A fill is more reliable.
    ctx.fillStyle = '#0f141b'; // Match --bg from style.css
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Set playing class for border highlight and handle pulse animation.
      const currentBall = getBall ? getBall() : env.ball;
      const isChainHead = !panel.dataset.prevToyId;
      // A ghost ball on the head of a chain shouldn't trigger the "playing" highlight.
      const showPlaying = !!currentBall && !(currentBall.isGhost && isChainHead);
      panel.classList.toggle('toy-playing', showPlaying);

    if (panel.__pulseHighlight && panel.__pulseHighlight > 0) {
      panel.classList.add('toy-playing-pulse');
      panel.__pulseHighlight = Math.max(0, panel.__pulseHighlight - 0.05); // Decay over ~20 frames
    } else if (panel.classList.contains('toy-playing-pulse')) {
      panel.classList.remove('toy-playing-pulse');
    }

    const rs = renderScale();
    try{ ctx.scale((rs.sx||1), (rs.sy||1)); }catch{}
    try{ ctx.translate(rs.tx||0, rs.ty||0); }catch{}

    const w = physW(), h = physH();
    // On-beat pulse (quarter notes)
    try{
      if (typeof getLoopInfo === 'function'){
        const li = getLoopInfo();
        // The on-beat pulse was deemed distracting. This is disabled.
        // const beatIdx = Math.floor(li.now / Math.max(0.001, li.beatLen));
        // if (beatIdx !== lastBeat){ lastBeat = beatIdx; particles && particles.onBeat && particles.onBeat(handle.x, handle.y); }
      }
    }catch{}


    // Maintain edge controllers for current world size and size them like floating cubes
    try{ ensureEdgeControllers(w, h); }catch{}
    try{ for (const c of edgeControllers){ if (c){ c.w = blockSize(); c.h = blockSize(); } } }catch{}

    // Background particles
    try{
      particles && particles.step(1/60, getBall ? getBall() : env.ball);
      particles && particles.draw(ctx);
    }catch{}

    // Edge bond decorations
    try{ drawEdgeBondLines(ctx, w, h, EDGE, edgeControllers); }catch{}

    // Aim line (neon) and spawn ring
    try{
      const A = getAim ? getAim() : null;
      if (A && A.active){
        ctx.beginPath(); ctx.moveTo(A.sx, A.sy); ctx.lineTo(A.cx, A.cy);
        const g = ctx.createLinearGradient(A.sx,A.sy,A.cx,A.cy);
        g.addColorStop(0, 'rgba(0,255,200,0.85)'); g.addColorStop(1, 'rgba(0,120,255,0.85)');
        ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.setLineDash([8,5]); ctx.stroke(); ctx.setLineDash([]);
        // spawn ring
        ctx.beginPath(); ctx.arc(A.sx, A.sy, Math.max(6, 10), 0, Math.PI*2);
        ctx.strokeStyle = 'rgba(0,255,200,0.9)'; ctx.lineWidth = 2; ctx.stroke();
      }
    }catch{}

    // Draw blocks + edge controllers
    try{
      // Decay local flash values for animation. The physics step sets flash to 1.0 on hit.
      for (let i = 0; i < (blocks?.length || 0); i++) { blockFlashes[i] = Math.max(0, (blockFlashes[i] || 0) - 0.08); }
      for (let i = 0; i < (edgeControllers?.length || 0); i++) { edgeFlashes[i] = Math.max(0, (edgeFlashes[i] || 0) - 0.08); }

      // Check if in advanced/zoomed view for showing note labels
      const isAdv = !!canvas.closest('.toy-zoomed');

      // Draw with the 'button' style and the corrected color/animation logic
      if (blocks) {
        blocks.forEach((b, i) => {
          if (!b) return;
          if (!_loggedCubeOnce && i === 0) {
            _loggedCubeOnce = true;
            const rs = renderScale();
            const blockRect = {
              x: Math.round(b.x * (rs.sx || 1)),
              y: Math.round(b.y * (rs.sy || 1)),
              w: Math.round(b.w * (rs.sx || 1)),
              h: Math.round(b.h * (rs.sy || 1))
            };
            console.debug('[BOUNCER][cube-debug]', {
              id: panel.id,
              cssW,
              cssH,
              blockSizeCss: blockSize(),
              blockRect,
              aspect: (blockRect.w ? (blockRect.h / blockRect.w) : null),
            });
          }
          drawBlock(ctx, b, {
            variant: 'button', active: b.active !== false, flash: blockFlashes[i] || 0,
            noteLabel: isAdv ? (noteList[b.noteIndex] || '') : null, showArrows: isAdv,
          });
        });
      }
      if (edgeControllers) {
        edgeControllers.forEach((c, i) => {
          if (!c) return;
          drawBlock(ctx, c, {
            variant: 'button', active: c.active !== false, flash: edgeFlashes[i] || 0,
            noteLabel: isAdv ? (noteList[c.noteIndex] || '') : null, showArrows: isAdv,
          });
        });
      }
    }catch(e){ console.error('[bouncer-render] draw blocks failed:', e); }
    const previewState = (typeof getPreviewState === 'function') ? getPreviewState() : null;
    if (previewState) {
      try {
        const isAdvPreview = !!canvas.closest('.toy-zoomed');
        if (Array.isArray(previewState.blocks)) {
          for (const pb of previewState.blocks) {
            if (!pb) continue;
            ctx.save();
            ctx.globalAlpha = 0.45;
            ctx.setLineDash([6, 4]);
            drawBlock(ctx, pb, {
              variant: 'button',
              active: pb.active !== false,
              flash: 0,
              noteLabel: isAdvPreview ? (noteList[pb.noteIndex] || '') : null,
              showArrows: isAdvPreview,
            });
            ctx.restore();
          }
        }
        if (Array.isArray(previewState.edgeControllers)) {
          for (const pc of previewState.edgeControllers) {
            if (!pc) continue;
            ctx.save();
            ctx.globalAlpha = 0.5;
            ctx.setLineDash([6, 4]);
            drawBlock(ctx, pc, {
              variant: 'button',
              active: pc.active !== false,
              flash: 0,
              noteLabel: isAdvPreview ? (noteList[pc.noteIndex] || '') : null,
              showArrows: isAdvPreview,
            });
            ctx.restore();
          }
        }
        if (previewState.handle) {
          const hPrev = previewState.handle;
          ctx.save();
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = 'rgba(255,255,255,0.85)';
          ctx.lineWidth = 2;
          const radius = Math.max(typeof ballR === 'function' ? ballR() : 8, 10);
          ctx.beginPath();
          ctx.arc(hPrev.x, hPrev.y, radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(hPrev.x, hPrev.y);
          ctx.lineTo(hPrev.x + (hPrev.vx || 0) * 8, hPrev.y + (hPrev.vy || 0) * 8);
          ctx.stroke();
          ctx.restore();
        }
        
      } catch (err) {
        if (__DBG >= 2) console.warn('[bouncer-render] preview overlay failed', err);
      }
    }

    // Update trail points & sparks
    try{
      const b = getBall ? getBall() : env.ball;
      if (b && !b.isGhost){
        if (lastBallPos && (Math.abs(b.x-lastBallPos.x)>50 || Math.abs(b.y-lastBallPos.y)>50)){
          teleportGuard = true; ballTrail.length = 0;
        } else { teleportGuard = false; }
        ballTrail.push({x:b.x, y:b.y});
        if (ballTrail.length>24) ballTrail.shift();
        lastBallPos = {x:b.x,y:b.y};
        // occasional sparks
        if (Math.random() < 0.4){
          sparks.push({ x:b.x, y:b.y, vx:(Math.random()-0.5)*2, vy:(Math.random()-0.5)*2, life: 12 });
        }
      } else {
        // If no ball, clear the trail
        if (ballTrail.length > 0) ballTrail.length = 0;
        lastBallPos = null;
      }
      // step sparks
      for (let i=sparks.length-1;i>=0;i--){
        const s = sparks[i]; s.x += s.vx; s.y += s.vy; s.life -= 1;
        if (s.life<=0) sparks.splice(i,1);
      }
    }catch{}

    // Draw neon trail and sparks
    try{
      const b = getBall ? getBall() : env.ball;
      if (b && !b.isGhost && !teleportGuard && ballTrail.length > 1) {
        ctx.beginPath();
        ctx.moveTo(ballTrail[0].x, ballTrail[0].y);
        for (let i = 1; i < ballTrail.length; i++) {
          ctx.lineTo(ballTrail[i].x, ballTrail[i].y);
        }

        // Create a gradient that spans the entire trail
        const first = ballTrail[0];
        const last = ballTrail[ballTrail.length - 1];
        const grad = ctx.createLinearGradient(first.x, first.y, last.x, last.y);

        // Blue at the tail (start of array), green at the ball (end of array)
        grad.addColorStop(0, 'rgba(0,120,255,0.0)'); // Transparent Blue at tail
        grad.addColorStop(1, 'rgba(0,255,200,0.85)'); // Green at head (ball)

        ctx.strokeStyle = grad;
        ctx.lineWidth = b.r * 2; // Same width as the ball
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
      // sparks
      for (const s of sparks){
        ctx.globalAlpha = Math.max(0, s.life/12);
        ctx.beginPath(); ctx.arc(s.x, s.y, 1.6, 0, Math.PI*2); ctx.fillStyle='rgba(0,255,220,0.9)'; ctx.fill();
      }
      ctx.globalAlpha = 1;
    }catch{}

    // Always draw handle ring
    try{
      if (handle){
        ctx.beginPath();
        ctx.arc(handle.x, handle.y, 10, 0, Math.PI*2);
        ctx.strokeStyle='rgba(0,255,200,0.4)';
        ctx.lineWidth=1;
        ctx.stroke();

        // New: Draw launch direction indicator
        let vx = 0, vy = 0;
        const aim = getAim ? getAim() : null;
        const lastLaunch = getLastLaunch ? getLastLaunch() : null;

        if (aim && aim.active) {
            // While aiming, the direction is from start to current
            const { vx: aimVx, vy: aimVy } = velFrom(aim.sx, aim.sy, aim.cx, aim.cy);
            vx = aimVx; vy = aimVy;
        } else if (handle.vx != null && handle.vy != null && (handle.vx !== 0 || handle.vy !== 0)) {
            // Use the vector stored on the handle (from a user drag or random click)
            vx = handle.vx; vy = handle.vy;
        } else if (lastLaunch) {
            // Fallback to the last actual launch vector
            vx = lastLaunch.vx; vy = lastLaunch.vy;
        }

        if (vx !== 0 || vy !== 0) {
            const len = Math.hypot(vx, vy);
            if (len > 0.01) { // Avoid division by zero
                const indicatorLength = 20; // Length of the direction line
                const endX = handle.x + (vx / len) * indicatorLength;
                const endY = handle.y + (vy / len) * indicatorLength;

                ctx.beginPath();
                ctx.moveTo(handle.x, handle.y);
                ctx.lineTo(endX, endY);
                ctx.strokeStyle = 'rgba(0,255,200,0.7)';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        }
      }
    }catch{}

    // Draw life line bar
    try {
      const b = getBall ? getBall() : env.ball;
      const ac = ensureAudioContext();
      const now = ac ? ac.currentTime : 0;
      const running = isRunning();

      let progress = 0;
      if (b && b.flightEnd != null && b.spawnTime != null) {
        const lifeDuration = b.flightEnd - b.spawnTime;
        if (lifeDuration > 0) {
          const lifeElapsed = now - b.spawnTime;
          progress = Math.max(0, Math.min(1, lifeElapsed / lifeDuration));
        }
      }

      // When paused, use the last known progress to freeze the bar.
      if (running) {
        lastLifeProgress = progress;
      } else {
        progress = lastLifeProgress;
      }

      // Only show the life line for bouncers that are part of a chain (i.e., not the head).
      const isChainedFollower = !!panel.dataset.prevToyId;
      if (progress > 0 && isChainedFollower) {
        const barY = EDGE + 4; // A few pixels below the top edge
        const barStartX = EDGE;
        const fullBarWidth = w - (EDGE * 2);
        const currentBarWidth = fullBarWidth * progress;

        ctx.beginPath();
        ctx.moveTo(barStartX, barY);
        ctx.lineTo(barStartX + currentBarWidth, barY);
        ctx.strokeStyle = '#ffffff'; // Pure white
        ctx.lineWidth = 2; // Thinner line as requested
        ctx.stroke();
      }
    } catch(e) { /* fail silently */ }

    // Draw ball
    try{
      const b = getBall ? getBall() : env.ball;
      if (b && !b.isGhost){
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r || 6, 0, Math.PI*2);
        ctx.globalAlpha = 0.98;
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }catch{}

    // Edge decorations and flash overlay
    try{ drawEdgeDecorations(ctx, edgeControllers, EDGE, physW(), physH()); }catch{}
    try{
      if (edgeFlash){
        // The main draw loop handles the visual decay of edge flashes.
        const f = edgeFlash;
        f.top = Math.max(0, f.top - 0.12);
        f.bot = Math.max(0, f.bot - 0.12);
        f.left = Math.max(0, f.left - 0.12);
        f.right = Math.max(0, f.right - 0.12);
      }
    }catch{}

    // Step physics if this toy is active in a chain.
    try {
        const ac = ensureAudioContext();
        const now = ac ? ac.currentTime : 0;
        const S = buildStateForStep(now, prevNow);

        // A bouncer is considered "running" if it's the active toy in a chain,
        // OR if it's a standalone toy (not part of any chain),
        // AND the global transport is playing.
        const isActiveInChain = panel.dataset.chainActive === 'true';
        const isChained = !!(panel.dataset.nextToyId || panel.dataset.prevToyId);
        // Physics should run if active in chain, OR if standalone, OR if it has a ghost ball
        // that needs to expire, OR if it has a real ball that needs to finish its life.
        const currentBall = getBall ? getBall() : env.ball;
        const hasActiveGhostBall = currentBall?.isGhost === true;
        const hasRealBall = !!currentBall && !currentBall.isGhost;
        const shouldRunPhysics = (isActiveInChain || !isChained || hasActiveGhostBall || hasRealBall) && isRunning();

        // Run the physics step *before* chain activation logic. This ensures that if a ghost
        // ball expires, it is nulled out before the next toy in the chain checks for a ball.
        if (shouldRunPhysics) stepBouncer(S);
        applyFromStep(S); // Apply state changes from physics immediately.

        // Handle timed unmute for smooth transitions when interrupting a replay.
        if (S.__unmuteAt > 0 && now >= S.__unmuteAt) {
            if (typeof S.setToyMuted === 'function') {
                S.setToyMuted(S.toyId, false, 0.08); // 80ms fade-in
            }
            // This mutation is persisted back via applyFromStep.
            S.__unmuteAt = 0; // Consume the timer
        }

        // Loop recorder: detect new bar and let main decide record/replay
        try {
            if (S && typeof S.getLoopInfo === 'function' && S.visQ && S.visQ.loopRec && typeof S.onNewBar === 'function') {
                const li = S.getLoopInfo();
                const anchor = (S.visQ.loopRec && S.visQ.loopRec.anchorStartTime) ? S.visQ.loopRec.anchorStartTime : li.loopStartTime;
                const k = Math.floor(Math.max(0, (li.now - anchor) / li.barLen));
                if (S.visQ.loopRec.lastBarIndex !== k) {
                    S.onNewBar(li, k);
                }
            }
        } catch (e) { try { if ((globalThis.BOUNCER_DBG_LEVEL | 0) >= 2) console.warn('[bouncer-render] onNewBar error', e); } catch {} }

        if (!isActiveInChain && wasActiveInChain) {
            if (typeof applyPreviewState === 'function') {
                try {
                    const pending = typeof getPreviewState === 'function' ? getPreviewState() : null;
                    if (pending) {
                        applyPreviewState();
                        // Pulse on apply
                        panel.__pulseHighlight = Math.max(panel.__pulseHighlight || 0, 1);
                    }
                } catch (err) {
                    if (__DBG >= 1) console.warn('[bouncer-render] applyPreviewState on deactivate failed', err);
                }
            }
        }

        // When a bouncer becomes active in a chain, spawn a ball if it doesn't have one.
        if (isActiveInChain && !wasActiveInChain) {
            const b = getBall ? getBall() : null;
            if (!b) { // Only do something if there's no ball.
                const isChainHead = !panel.dataset.prevToyId;
                const hasHistory = !!(getLastLaunch ? getLastLaunch() : null);
                const userHasPlacedHandle = !!handle.userPlaced;

                if (userHasPlacedHandle) {
                    // User has placed a spawner, so launch a ball from it.
                    const vx = handle.vx || 0;
                    const vy = handle.vy || -7.68; // Default upwards
                    const newBall = spawnBallFrom({ x: handle.x, y: handle.y, vx, vy, r: ballR() });
                    setBallOut(newBall);
                } else if (hasHistory) {
                    // No user placement, but has history. Let stepBouncer handle the respawn.
                    // This is a no-op here; stepBouncer will see no ball and check nextLaunchAt.
                } else {
                    // This is an empty, untouched bouncer.
                    const isChained = !!(panel.dataset.nextToyId || panel.dataset.prevToyId);
                    if (isChained) {
                        // If it's part of a chain, it should get a ghost ball to act as a "rest" for one bar.
                        // This applies to both head and follower bouncers.
                        const ac = ensureAudioContext();
                        const now = ac ? ac.currentTime : 0;
                        const li = (typeof getLoopInfo === 'function') ? getLoopInfo() : null;
                        let life = 2.0;
                        if (li && Number.isFinite(li.barLen) && li.barLen > 0) {
                            life = BOUNCER_BARS_PER_LIFE * li.barLen;
                        }
                        const ghostBall = {
                            isGhost: true, // A flag to prevent it from being drawn or colliding.
                            spawnTime: now,
                            flightEnd: now + life,
                            r: ballR()
                        };
                        setBallOut(ghostBall);
                        if (typeof setNextLaunchAt === 'function') setNextLaunchAt(ghostBall.flightEnd);
                    }
                }
            }
        }
        wasActiveInChain = isActiveInChain;

        // After the first bar, the bouncer switches to 'replay' mode. This scheduler
        // is responsible for playing back the recorded pattern of notes.
        try {
            const lr = S.visQ && S.visQ.loopRec;
            if (shouldRunPhysics && lr && !lr.isInvalid && lr.mode === 'replay' && typeof S.getLoopInfo === 'function') {
                const li = S.getLoopInfo();
                const nowT = li.now;
                // The playback anchor is the start of the current GLOBAL bar.
                const k_global = Math.floor(Math.max(0, (nowT - li.loopStartTime) / li.barLen));
                const playback_base = li.loopStartTime + k_global * li.barLen;

                if (Array.isArray(lr.pattern) && lr.pattern.length > 0) {
                    // Use global bar index to reset scheduled keys.
                    if (lr.scheduledBarIndex !== k_global) {
                        lr.scheduledBarIndex = k_global;
                        if (!lr.scheduledKeys || typeof lr.scheduledKeys.clear !== 'function') lr.scheduledKeys = new Set();
                        else lr.scheduledKeys.clear();
                    }

                    const LOOKAHEAD = 0.1; // 100ms lookahead for scheduling
                    const base = playback_base;
                    const baseNext = base + li.barLen;
                    const beatDur = li.barLen / 4;

                    const __seen = new Set();
                    const __evs = (Array.isArray(lr.pattern) ? lr.pattern : []).filter(ev => {
                        const keySeen = ev && ev.note ? (ev.note + '@' + (Math.round(((ev.offset || 0)) * 16) / 16)) : '';
                        if (__seen.has(keySeen)) return false; __seen.add(keySeen); return true;
                    });

                    for (const ev of __evs) {
                        if (!ev || !ev.note) continue;

                        let isSourceActive = true;
                        if (ev.blockIndex != null) { const block = S.blocks?.[ev.blockIndex]; if (block && block.active === false) isSourceActive = false; }
                        else if (ev.edgeControllerIndex != null) { const controller = S.edgeControllers?.[ev.edgeControllerIndex]; if (controller && controller.active === false) isSourceActive = false; }
                        else if (ev.edgeName != null) { const m = S.mapControllersByEdge ? S.mapControllersByEdge(S.edgeControllers) : null; const edgeMap = { 'L': 'left', 'R': 'right', 'T': 'top', 'B': 'bot' }; const controllerKey = edgeMap[ev.edgeName]; const c = m?.[controllerKey]; if (c && c.active === false) isSourceActive = false; }
                        if (!isSourceActive) continue;

                        const rawOffBeats = Math.max(0, ev.offset || 0);
                        let quantizedOffBeats = rawOffBeats;
                        try { const vq = (S.getQuantDiv && S.getQuantDiv()); if (Number.isFinite(vq) && vq > 0) { quantizedOffBeats = Math.round(rawOffBeats * vq) / vq; } } catch {}
                        let when = base + quantizedOffBeats * beatDur;
                        if (when < nowT - 0.01) when = baseNext + quantizedOffBeats * beatDur;

                        const key = k_global + '|' + ev.note + '|' + (Math.round(rawOffBeats * 16) / 16);
                        if (when >= nowT && when < nowT + LOOKAHEAD && !lr.scheduledKeys.has(key)) {
                            try { S.triggerInstrumentRaw(S.instrument, ev.note, when); } catch (e) { /* fail silently */ }
                            lr.scheduledKeys.add(key);
                        }
                    }
                }
            }
        } catch (e) { /* fail silently */ }

        // After the physics step, capture any flash events it generated and store
        // them in our local animation state arrays.
        if (S.blocks) {
            S.blocks.forEach((b_step, i) => {
                if (b_step && b_step.flash > 0) {
                    blockFlashes[i] = b_step.flash;
                    b_step.flash = 0; // Consume the flash event
                }
            });
        }
        if (S.edgeControllers) {
            S.edgeControllers.forEach((c_step, i) => {
                if (c_step && c_step.flash > 0) {
                    edgeFlashes[i] = c_step.flash;
                    c_step.flash = 0; // Consume the flash event
                }
            });
        }
        prevNow = now;
    } catch(e) { console.warn('[bouncer-render] step failed', e); }

    } finally {
      endPerf();
      requestAnimationFrame(draw);
    }
  }

  // Kick off the self-perpetuating draw loop.
  requestAnimationFrame(draw);

  return draw;
}











