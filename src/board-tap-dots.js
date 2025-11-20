// Tap dots overlay: canvas-based ripple where each dot wakes up as the wave hits it.
(() => {
  const board = document.getElementById('board');
  const viewport = document.querySelector('.board-viewport');
  if (!board || !viewport) return;

  let overlay = board.querySelector('.board-tap-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'board-tap-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    board.appendChild(overlay);
  }

  // Canvas for drawing the tap dots
  let canvas = overlay.querySelector('.board-tap-canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'board-tap-canvas';
    overlay.appendChild(canvas);
  }

  const ctx = canvas.getContext('2d');

  const DEBUG = false;
  const FORCE_DEBUG_VIS = false;
  const HANG_MS = 0; // delay before fading out overlay after wave ends
  const FADE_OUT_MS = 1000;   // time to fade dots after tap release

  // Drag nudge config
  const DRAG_WAVE_MS = 180;   // how long a drag "poke" lasts
  const DRAG_RADIUS_FACTOR = 0.5; // fraction of tap radius used for drag influence
  const DRAG_PUSH_MULT = 1.0; // how far drag pushes vs dot.pushMag

  let hideTimer = 0;
  let rafId = 0;
  let isPointerDown = false;
  let waveFinished = false;

  // Fade-out state
  let fadeOutActive = false;
  let fadeOutStartTime = 0;

  // Drag nudge state
  let dragActive = false;
  let dragPosX = 0;
  let dragPosY = 0;
  let dragDirX = 0;
  let dragDirY = 0;
  let dragStrength = 0;
  let dragStartTime = 0;

  // Last tap spacing used to size drag pushes
  let currentTapSpacing = 0;

  // Board / grid settings (aligned with CSS vars)
  const style = getComputedStyle(board);
  const boardW = board.offsetWidth || 8000;
  const boardH = board.offsetHeight || 8000;
  const baseSpacing = parseFloat(style.getPropertyValue('--board-grid-spacing')) || 90;
  const baseTapSpacing =
    parseFloat(style.getPropertyValue('--board-tap-spacing')) || (baseSpacing / 6);
  const tapRadiusBoardUnits =
    parseFloat(style.getPropertyValue('--board-tap-radius')) || (baseSpacing * 1.5);
  const gridOffsetX = parseFloat(style.getPropertyValue('--board-grid-offset-x')) || 0;
  const gridOffsetY = parseFloat(style.getPropertyValue('--board-grid-offset-y')) || 0;

  // Wave timing (faster, still with a bit of settle)
  const WAVE_DURATION_MS = 200;  // how long the expanding circle travels
  const DOT_WAVE_WIDTH_MS = 220; // quicker per-dot flash + settle

  // Base dot appearance
  const BASE_DOT_RADIUS = 1.4; // pixels at scale = 1
  const MAX_SCALE = 1.5;       // peak scale at wave edge

  // Colours
  const BASE_COLOR = { r: 90, g: 100, b: 255 };  // blue
  const WHITE = { r: 255, g: 255, b: 255 };

  let dots = [];
  let tapX = 0;
  let tapY = 0;
  let tapRadiusScreen = tapRadiusBoardUnits;
  let waveStartTime = 0;
  let waveActive = false;

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const width = board.offsetWidth || boardW;
    const height = board.offsetHeight || boardH;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function resetOverlay() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = 0;
    }
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    waveActive = false;
    isPointerDown = false;
    waveFinished = false;
    fadeOutActive = false;
    fadeOutStartTime = 0;
    dragActive = false;
    dragPosX = 0;
    dragPosY = 0;
    dragDirX = 0;
    dragDirY = 0;
    dragStrength = 0;
    dragStartTime = 0;
    dots = [];

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    overlay.classList.remove('is-active');
    if (DEBUG) console.debug('[tap-dots] reset');
  }

  function clientToBoardPoint(e) {
    const rect = board.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / (rect.width || 1);
    const fy = (e.clientY - rect.top) / (rect.height || 1);
    const x = fx * boardW;
    const y = fy * boardH;
    return { x, y };
  }

  function buildDotsAroundTap(x, y, radiusScreen, zoomScale) {
    dots = [];

    // Match the finer tap-grid spacing (scaled with zoom) and align to board grid.
    const quantizedScale = Math.pow(2, Math.round(Math.log2(Math.max(zoomScale, 0.01))));
    const tapSpacing = baseTapSpacing / quantizedScale;
    currentTapSpacing = tapSpacing;

    const minX = x - radiusScreen;
    const maxX = x + radiusScreen;
    const minY = y - radiusScreen;
    const maxY = y + radiusScreen;

    // Align fine grid to the main board grid, similar to the CSS background-position math.
    const firstColIndex = Math.floor((minX - gridOffsetX) / tapSpacing);
    const startX = gridOffsetX + firstColIndex * tapSpacing;

    const firstRowIndex = Math.floor((minY - gridOffsetY) / tapSpacing);
    const startY = gridOffsetY + firstRowIndex * tapSpacing;

    for (let yy = startY; yy <= maxY; yy += tapSpacing) {
      for (let xx = startX; xx <= maxX; xx += tapSpacing) {
        const dx = xx - x;
        const dy = yy - y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > radiusScreen) continue; // only dots inside the max radius

        // When does the wave front reach this dot?
        const impactT = (dist / radiusScreen) * WAVE_DURATION_MS;

        const dirX = dist > 0.0001 ? dx / dist : 0;
        const dirY = dist > 0.0001 ? dy / dist : 0;
        const pushMag = tapSpacing * 1.65; // stronger radial "poke" distance

        dots.push({
          x: xx,
          y: yy,
          dist,
          impactTime: impactT,
          dirX,
          dirY,
          pushMag
        });
      }
    }

    if (DEBUG) {
      console.debug('[tap-dots] built dots', {
        count: dots.length,
        tapSpacing,
        radiusScreen
      });
    }
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // Simple up-then-down envelope: 0 -> 1 -> 0 over [0, 1]
  function envelope01(t) {
    if (t <= 0 || t >= 1) return 0;
    if (t < 0.5) return t / 0.5;
    return (1 - t) / 0.5;
  }

  function easeOutCubic(t) {
    const u = 1 - Math.min(Math.max(t, 0), 1);
    return 1 - u * u * u;
  }

  function easeOutQuad(t) {
    const u = 1 - Math.min(Math.max(t, 0), 1);
    return 1 - u * u;
  }

  function drawWaveFrame(now) {
    // We might still be fading out even if waveActive is false.
    if (!waveActive && !fadeOutActive && !dragActive) return;

    const elapsed = now - waveStartTime;
    const totalDuration = WAVE_DURATION_MS + DOT_WAVE_WIDTH_MS;

    // Once the travelling wave has passed every dot, we mark it finished.
    if (!waveFinished && elapsed >= totalDuration) {
      waveFinished = true;
    }

    // Fade factor (1 -> 0 over FADE_OUT_MS once fadeOutActive starts)
    let fadeFactor = 1;
    if (fadeOutActive) {
      const t = (now - fadeOutStartTime) / FADE_OUT_MS;
      if (t >= 1) {
        fadeFactor = 0;
      } else {
        fadeFactor = 1 - t;
      }
    }

    // Drag amplitude (1 at dragStartTime -> 0 over DRAG_WAVE_MS)
    let dragAmp = 0;
    let dragRadius = 0;
    if (dragActive) {
      const tDrag = (now - dragStartTime) / DRAG_WAVE_MS;
      if (tDrag >= 1) {
        dragActive = false;
      } else {
        dragAmp = 1 - tDrag;
        dragRadius = tapRadiusScreen * DRAG_RADIUS_FACTOR;
      }
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // If we're fully faded out, clean up and bail.
    if (fadeFactor <= 0) {
      waveActive = false;
      fadeOutActive = false;
      resetOverlay();
      return;
    }

    ctx.save();
    ctx.globalAlpha = fadeFactor;

    // Early "hit" phase (0 -> MAX) then longer settle (MAX -> 1)
    const impactDuration = DOT_WAVE_WIDTH_MS * 0.35;
    const settleDuration = DOT_WAVE_WIDTH_MS - impactDuration;

    for (const dot of dots) {
      const localT = elapsed - dot.impactTime;

      // 1) Wave has not reached this dot yet -> draw nothing.
      if (localT < 0) {
        continue;
      }

      // 2) Wave has passed and the dot has finished its flash -> calm blue dot at grid spot,
      //    but allow drag to "poke" it with same style as the tap wave.
      if (localT > DOT_WAVE_WIDTH_MS) {
        // Base settled alpha: fade based on distance (center = strong, edge = faint).
        const distRatio = Math.min(dot.dist / tapRadiusScreen, 1);
        const edgeFactor = 1 - distRatio;
        const settledAlpha = lerp(0.3, 0.9, edgeFactor);

        let scale = 1;
        let mixToWhite = 0;
        let drawX = dot.x;
        let drawY = dot.y;

        // Drag nudge: use same MAX_SCALE + white as impact phase.
        if (dragAmp > 0 && dragRadius > 0) {
          const dxp = dot.x - dragPosX;
          const dyp = dot.y - dragPosY;
          const distDrag = Math.sqrt(dxp * dxp + dyp * dyp);

          if (distDrag < dragRadius) {
            const influence = 1 - distDrag / dragRadius;
            const dragImpact = dragAmp * influence * dragStrength;

            // Scale 1 -> MAX_SCALE
            scale = lerp(1, MAX_SCALE, dragImpact);
            // Blue -> white
            mixToWhite = dragImpact;

            const push = dot.pushMag * DRAG_PUSH_MULT * dragImpact;
            drawX += dragDirX * push;
            drawY += dragDirY * push;
          }
        }

        const r = Math.round(lerp(BASE_COLOR.r, WHITE.r, mixToWhite));
        const g = Math.round(lerp(BASE_COLOR.g, WHITE.g, mixToWhite));
        const b = Math.round(lerp(BASE_COLOR.b, WHITE.b, mixToWhite));

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${settledAlpha})`;
        ctx.beginPath();
        ctx.arc(drawX, drawY, BASE_DOT_RADIUS * scale, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      // 3) Within the local wave window for this dot -> animate scale + colour with radial "poke".
      let scale;
      let mixToWhite;
      let alpha;
      let pushAmount;

      if (localT <= impactDuration) {
        // Impact phase: 0 -> MAX_SCALE, blue -> white, pushed outward.
        const phase = localT / impactDuration;
        const eased = easeOutCubic(phase);

        scale = lerp(0, MAX_SCALE, eased);
        mixToWhite = eased;
        alpha = lerp(0.4, 1.0, eased);
        pushAmount = dot.pushMag * eased;
      } else {
        // Settle phase: MAX_SCALE -> 1, white -> blue, slide back to grid.
        const phase = (localT - impactDuration) / settleDuration;
        const eased = easeOutQuad(phase);

        scale = lerp(MAX_SCALE, 1, eased);
        mixToWhite = 1 - eased;
        alpha = lerp(1.0, 0.9, eased);
        pushAmount = dot.pushMag * (1 - eased);
      }

      const r = Math.round(lerp(BASE_COLOR.r, WHITE.r, mixToWhite));
      const g = Math.round(lerp(BASE_COLOR.g, WHITE.g, mixToWhite));
      const b = Math.round(lerp(BASE_COLOR.b, WHITE.b, mixToWhite));

      const drawX = dot.x + dot.dirX * pushAmount;
      const drawY = dot.y + dot.dirY * pushAmount;

      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(drawX, drawY, BASE_DOT_RADIUS * scale, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    const shouldContinue =
      fadeOutActive || dragActive || !waveFinished || isPointerDown;

    if (shouldContinue) {
      rafId = requestAnimationFrame(drawWaveFrame);
    } else {
      waveActive = false;
      resetOverlay();
    }
  }

  function startWave(x, y) {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = 0;
    }

    waveFinished = false;
    fadeOutActive = false;
    fadeOutStartTime = 0;
    dragActive = false;
    dragStrength = 0;

    resizeCanvas();

    const zoomScale =
      parseFloat(getComputedStyle(board).getPropertyValue('--zoom-scale')) || 1;

    // Keep the *screen* radius constant as zoom changes.
    tapRadiusScreen = tapRadiusBoardUnits / zoomScale;

    tapX = x;
    tapY = y;

    buildDotsAroundTap(tapX, tapY, tapRadiusScreen, zoomScale);

    overlay.classList.add('is-active');
    if (FORCE_DEBUG_VIS) {
      overlay.classList.add('tap-dots-debug');
    }

    waveStartTime = performance.now();
    waveActive = true;
    drawWaveFrame(waveStartTime);
  }

  function handlePointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!e.isPrimary) return;
    if (e.target.closest('.toy-panel, button, a, input, select, textarea')) return;

    isPointerDown = true;

    const { x, y } = clientToBoardPoint(e);
    if (DEBUG) console.debug('[tap-dots] down', {
      clientX: e.clientX,
      clientY: e.clientY,
      x,
      y,
      tapRadiusBoardUnits
    });

    startWave(x, y);

    viewport.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerup', handlePointerUp, { once: true, capture: true });
    window.addEventListener('pointercancel', handlePointerUp, { once: true, capture: true });
  }

  function handlePointerUp() {
    if (DEBUG) console.debug('[tap-dots] up');
    isPointerDown = false;
    viewport.removeEventListener('pointermove', handlePointerMove);
    fadeOutActive = true;
    fadeOutStartTime = performance.now();
  }

  function handlePointerMove(e) {
    if (!isPointerDown) return;
    if (!e.isPrimary) return;

    const { x, y } = clientToBoardPoint(e);

    if (dragPosX === 0 && dragPosY === 0) {
      dragPosX = x;
      dragPosY = y;
      return;
    }

    const dx = x - dragPosX;
    const dy = y - dragPosY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.1) {
      dragPosX = x;
      dragPosY = y;
      return;
    }

    dragDirX = dx / dist;
    dragDirY = dy / dist;
    dragStrength = Math.min(dist / (currentTapSpacing || 1), 1);
    dragPosX = x;
    dragPosY = y;
    dragStartTime = performance.now();
    dragActive = true;

    // Make sure we have a frame loop running to show the drag effect.
    if (!waveActive && !fadeOutActive) {
      waveActive = true;
      waveStartTime = dragStartTime;
      drawWaveFrame(dragStartTime);
    }
  }

  function handleTouchStart(e) {
    if (e.touches.length === 0) return;
    const t = e.touches[0];

    // Ignore touches on UI elements, same as pointer path.
    if (t.target && t.target.closest &&
        t.target.closest('.toy-panel, button, a, input, select, textarea')) {
      return;
    }

    isPointerDown = true;

    const { x, y } = clientToBoardPoint(t);
    if (DEBUG) console.debug('[tap-dots] touchstart', {
      clientX: t.clientX,
      clientY: t.clientY,
      x,
      y,
      tapRadiusBoardUnits
    });

    startWave(x, y);

    viewport.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { once: true, capture: true });
    window.addEventListener('touchcancel', handleTouchEnd, { once: true, capture: true });
  }

  function handleTouchMove(e) {
    if (!isPointerDown) return;
    if (e.touches.length === 0) return;
    const t = e.touches[0];

    const { x, y } = clientToBoardPoint(t);

    if (dragPosX === 0 && dragPosY === 0) {
      dragPosX = x;
      dragPosY = y;
      return;
    }

    const dx = x - dragPosX;
    const dy = y - dragPosY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.1) {
      dragPosX = x;
      dragPosY = y;
      return;
    }

    dragDirX = dx / dist;
    dragDirY = dy / dist;
    dragStrength = Math.min(dist / (currentTapSpacing || 1), 1);
    dragPosX = x;
    dragPosY = y;
    dragStartTime = performance.now();
    dragActive = true;

    if (!waveActive && !fadeOutActive) {
      waveActive = true;
      waveStartTime = dragStartTime;
      drawWaveFrame(dragStartTime);
    }
  }

  function handleTouchEnd() {
    if (DEBUG) console.debug('[tap-dots] touchend');
    isPointerDown = false;
    viewport.removeEventListener('touchmove', handleTouchMove);
    fadeOutActive = true;
    fadeOutStartTime = performance.now();
  }

  resetOverlay();
  resizeCanvas();

  const supportsPointer = 'PointerEvent' in window;

  if (supportsPointer) {
    viewport.addEventListener('pointerdown', handlePointerDown, { passive: true });
  } else {
    viewport.addEventListener('touchstart', handleTouchStart, { passive: true });
  }

  window.addEventListener('resize', resizeCanvas);

  if (DEBUG) console.debug('[tap-dots] ready', { supportsPointer });
})();
