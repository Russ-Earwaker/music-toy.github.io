// Tap dots overlay: canvas-based ripple where each dot wakes up as the wave hits it.
(() => {
  const board = document.getElementById('board');
  const viewport = document.querySelector('.board-viewport');
  if (!board || !viewport) return;

  // Keep the overlay rooted on the viewport (not the board) so it isn't scaled up
  // to the full 8k board size. On iPad a 2x DPR canvas at board dimensions would
  // exceed Safari's canvas limits and silently fail to draw.
  let overlay = viewport.querySelector('.board-tap-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'board-tap-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    viewport.appendChild(overlay);
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

  // delay before full reset once everything is faded out
  const HANG_MS = 0;

  // Fade-out timing after tap release
  const FADE_OUT_MS = 1000; // ms to fade dots after tap release

  // Wave timing (tap ripple)
  const WAVE_DURATION_MS = 200;  // how long the expanding circle travels
  const DOT_WAVE_WIDTH_MS = 220; // per-dot flash + settle time

  // Base dot appearance
  const BASE_DOT_RADIUS = 1.4; // pixels at scale = 1
  const MAX_SCALE = 1.6;       // BIG peak scale for drag + tap (we can pull back later)
  const EDGE_FADE_NEAR = 0.95; // alpha multiplier at tap centre
  const EDGE_FADE_FAR = 0.25;  // alpha multiplier at outer edge
  const EDGE_FADE_POWER = 1.4; // curve: >1 makes edges fall off faster

  // Colours
  const BASE_COLOR = { r: 90, g: 100, b: 255 };  // calm blue
  const WHITE = { r: 255, g: 255, b: 255 };      // flash

  // Drag "grab the blob" config
  const DRAG_SMOOTH = 0.45;             // blob snaps towards the finger much faster
  const DRAG_RETURN = 0.22;             // relax back fairly quickly
  const DRAG_MAX_OFFSET_FACTOR = 1.4;   // blob can travel up to ~2 * tap radius from centre
  const DRAG_CENTER_POWER = 0.4;        // almost the whole disc moves (edge only slightly less)
  const DRAG_BLOB_MULT = 1.5;           // heavy exaggeration factor for drag displacement

  let hideTimer = 0;
  let rafId = 0;

  let isPointerDown = false;
  let waveActive = false;
  let waveFinished = false;

  // Board / grid settings (aligned with CSS vars)
  const style = getComputedStyle(board);
  const boardW = board.offsetWidth || 8000;
  const boardH = board.offsetHeight || 8000;
  const baseSpacing =
    parseFloat(style.getPropertyValue('--board-grid-spacing')) || 90;
  const baseTapSpacing =
    parseFloat(style.getPropertyValue('--board-tap-spacing')) || (baseSpacing / 6);
  const tapRadiusBoardUnits =
    parseFloat(style.getPropertyValue('--board-tap-radius')) || (baseSpacing * 1.5);
  const gridOffsetX =
    parseFloat(style.getPropertyValue('--board-grid-offset-x')) || 0;
  const gridOffsetY =
    parseFloat(style.getPropertyValue('--board-grid-offset-y')) || 0;

  let dots = [];

  let tapX = 0;
  let tapY = 0;
  let tapRadiusScreen = tapRadiusBoardUnits;
  let waveStartTime = 0;

  // track spacing used for this tap (so drag scales nicely)
  let currentTapSpacing = baseTapSpacing;

  // Fade-out state
  let fadeOutActive = false;
  let fadeOutStartTime = 0;

  // Drag state - global blob offset centred at tap
  let dragTargetOffsetX = 0;
  let dragTargetOffsetY = 0;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  // Mapping helpers: board space (8k) -> viewport canvas space
  let viewScaleX = 1;
  let viewScaleY = 1;
  let viewOriginX = 0;
  let viewOriginY = 0;

  function updateBoardToViewTransform() {
    const boardRect = board.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    const bw = boardRect.width || boardW;
    const bh = boardRect.height || boardH;
    viewScaleX = bw / (boardW || 1);
    viewScaleY = bh / (boardH || 1);
    viewOriginX = boardRect.left - viewportRect.left;
    viewOriginY = boardRect.top - viewportRect.top;
  }

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = viewport.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    updateBoardToViewTransform();
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
    waveFinished = false;
    isPointerDown = false;
    fadeOutActive = false;

    dragTargetOffsetX = 0;
    dragTargetOffsetY = 0;
    dragOffsetX = 0;
    dragOffsetY = 0;

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
    const quantizedScale = Math.pow(
      2,
      Math.round(Math.log2(Math.max(zoomScale, 0.01)))
    );
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
        const pushMag = tapSpacing * 1.65; // radial "poke" distance for tap wave

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
    // We might still be fading even if the tap wave has finished.
    if (!waveActive && !fadeOutActive && !isPointerDown) return;

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

    // Smooth global drag offset
    if (isPointerDown) {
      // Follow the target offset
      dragOffsetX += (dragTargetOffsetX - dragOffsetX) * DRAG_SMOOTH;
      dragOffsetY += (dragTargetOffsetY - dragOffsetY) * DRAG_SMOOTH;
    } else {
      // Relax back towards centre
      dragOffsetX += (0 - dragOffsetX) * DRAG_RETURN;
      dragOffsetY += (0 - dragOffsetY) * DRAG_RETURN;
    }

    updateBoardToViewTransform();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // If we're fully faded and the blob is basically at rest, clean up.
    const dragMag = Math.sqrt(dragOffsetX * dragOffsetX + dragOffsetY * dragOffsetY);
    if (!isPointerDown && fadeFactor <= 0.001 && dragMag <= 0.1) {
      waveActive = false;
      fadeOutActive = false;
      if (HANG_MS > 0) {
        hideTimer = setTimeout(() => resetOverlay(), HANG_MS);
      } else {
        resetOverlay();
      }
      return;
    }

    ctx.save();
    ctx.globalAlpha = fadeFactor;

    // Early "hit" phase (0 -> MAX) then settle (MAX -> 1)
    const impactDuration = DOT_WAVE_WIDTH_MS * 0.35;
    const settleDuration = DOT_WAVE_WIDTH_MS - impactDuration;

    for (const dot of dots) {
      const localT = elapsed - dot.impactTime;

      // 1) Wave has not reached this dot yet -> draw nothing.
      if (localT < 0) {
        continue;
      }

      // Distance from the tap centre for centre-weighting + edge fade.
      const distRatio = Math.min(dot.dist / tapRadiusScreen, 1);
      const centreInfluence = Math.pow(1 - distRatio, DRAG_CENTER_POWER);
      const edgeFade = lerp(
        EDGE_FADE_FAR,
        EDGE_FADE_NEAR,
        1 - Math.pow(distRatio, EDGE_FADE_POWER)
      );

      // 2) Wave has passed and the dot has finished its flash -> calm blue dot,
      //    but displaced as part of a single "blob" moved by dragOffset.
      if (localT > DOT_WAVE_WIDTH_MS) {
        // Base settled alpha: fade based on distance (center = strong, edge = faint).
        const edgeFactor = 1 - distRatio;
        const baseAlpha = lerp(0.3, 0.9, edgeFactor) * edgeFade;

        // Apply smooth global drag offset scaled by centre influence and exaggeration.
        const offsetX = dragOffsetX * centreInfluence * DRAG_BLOB_MULT;
        const offsetY = dragOffsetY * centreInfluence * DRAG_BLOB_MULT;

        const dispMag = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
        const maxDisp = (tapRadiusScreen * DRAG_MAX_OFFSET_FACTOR || 1);

        // Reach "full effect" sooner: 0.4 * maxDisp already gives full ratio.
        const dispRatioRaw = Math.min(dispMag / (maxDisp * 0.4), 1);
        // Ease it a bit so it ramps up quickly but still feels smooth.
        const dispRatio = Math.sqrt(dispRatioRaw);

        // Use displacement amount to scale & brighten (stronger version of tap wave).
        const scale = lerp(1, MAX_SCALE, dispRatio);
        const mixToWhite = dispRatio;

        const r = Math.round(lerp(BASE_COLOR.r, WHITE.r, mixToWhite));
        const g = Math.round(lerp(BASE_COLOR.g, WHITE.g, mixToWhite));
        const b = Math.round(lerp(BASE_COLOR.b, WHITE.b, mixToWhite));

        const drawX = viewOriginX + (dot.x + offsetX) * viewScaleX;
        const drawY = viewOriginY + (dot.y + offsetY) * viewScaleY;
        const radius = BASE_DOT_RADIUS * scale; // keep screen size constant regardless of zoom

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${baseAlpha})`;
        ctx.beginPath();
        ctx.arc(drawX, drawY, radius, 0, Math.PI * 2);
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
        alpha = lerp(0.4, 1.0, eased) * edgeFade;
        pushAmount = dot.pushMag * eased;
      } else {
        // Settle phase: MAX_SCALE -> 1, white -> blue, slide back to grid.
        const phase = (localT - impactDuration) / settleDuration;
        const eased = easeOutQuad(phase);

        scale = lerp(MAX_SCALE, 1, eased);
        mixToWhite = 1 - eased;
        alpha = lerp(1.0, 0.9, eased) * edgeFade;
        pushAmount = dot.pushMag * (1 - eased);
      }

      const r = Math.round(lerp(BASE_COLOR.r, WHITE.r, mixToWhite));
      const g = Math.round(lerp(BASE_COLOR.g, WHITE.g, mixToWhite));
      const b = Math.round(lerp(BASE_COLOR.b, WHITE.b, mixToWhite));

      const drawX = viewOriginX + (dot.x + dot.dirX * pushAmount) * viewScaleX;
      const drawY = viewOriginY + (dot.y + dot.dirY * pushAmount) * viewScaleY;
      const radius = BASE_DOT_RADIUS * scale; // keep screen size constant regardless of zoom

      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(drawX, drawY, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    rafId = requestAnimationFrame(drawWaveFrame);
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

    // Reset drag state for this tap
    dragTargetOffsetX = 0;
    dragTargetOffsetY = 0;
    dragOffsetX = 0;
    dragOffsetY = 0;

    const zoomScale =
      parseFloat(getComputedStyle(board).getPropertyValue('--zoom-scale')) || 1;

    // Keep the *screen* radius constant as zoom changes.
    tapRadiusScreen = tapRadiusBoardUnits / zoomScale;

    tapX = x;
    tapY = y;

    buildDotsAroundTap(tapX, tapY, tapRadiusScreen, zoomScale);
    resizeCanvas();

    overlay.classList.add('is-active');
    if (FORCE_DEBUG_VIS) {
      overlay.classList.add('tap-dots-debug');
    }

    waveStartTime = performance.now();
    waveActive = true;
    waveFinished = false;
    fadeOutActive = false;

    // Kick off first frame immediately so there is no delay.
    drawWaveFrame(waveStartTime);
  }

  function handlePointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!e.isPrimary) return;
    if (e.target.closest('.toy-panel, button, a, input, select, textarea')) return;

    isPointerDown = true;

    const { x, y } = clientToBoardPoint(e);
    if (DEBUG) {
      console.debug('[tap-dots] pointerdown', {
        clientX: e.clientX,
        clientY: e.clientY,
        x,
        y,
        tapRadiusBoardUnits
      });
    }

    startWave(x, y);

    viewport.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerup', handlePointerUp, { once: true, capture: true });
    window.addEventListener('pointercancel', handlePointerUp, { once: true, capture: true });
  }

  function handlePointerMove(e) {
    if (!isPointerDown) return;
    if (!e.isPrimary) return;

    const { x, y } = clientToBoardPoint(e);

    // Global offset is pointer position relative to tap centre,
    // clamped so the blob never flies too far away.
    let dx = x - tapX;
    let dy = y - tapY;
    const mag = Math.sqrt(dx * dx + dy * dy);
    const maxOffset = tapRadiusScreen * DRAG_MAX_OFFSET_FACTOR;

    if (mag > maxOffset && mag > 0.0001) {
      const s = maxOffset / mag;
      dx *= s;
      dy *= s;
    }

    dragTargetOffsetX = dx;
    dragTargetOffsetY = dy;
  }

  function handlePointerUp() {
    if (DEBUG) console.debug('[tap-dots] pointerup');
    isPointerDown = false;
    fadeOutActive = true;
    fadeOutStartTime = performance.now();

    viewport.removeEventListener('pointermove', handlePointerMove);
  }

  function handleTouchStart(e) {
    if (e.touches.length === 0) return;
    const t = e.touches[0];

    if (
      t.target &&
      t.target.closest &&
      t.target.closest('.toy-panel, button, a, input, select, textarea')
    ) {
      return;
    }

    isPointerDown = true;

    const { x, y } = clientToBoardPoint(t);
    if (DEBUG) {
      console.debug('[tap-dots] touchstart', {
        clientX: t.clientX,
        clientY: t.clientY,
        x,
        y,
        tapRadiusBoardUnits
      });
    }

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

    let dx = x - tapX;
    let dy = y - tapY;
    const mag = Math.sqrt(dx * dx + dy * dy);
    const maxOffset = tapRadiusScreen * DRAG_MAX_OFFSET_FACTOR;

    if (mag > maxOffset && mag > 0.0001) {
      const s = maxOffset / mag;
      dx *= s;
      dy *= s;
    }

    dragTargetOffsetX = dx;
    dragTargetOffsetY = dy;
  }

  function handleTouchEnd() {
    if (DEBUG) console.debug('[tap-dots] touchend');
    isPointerDown = false;
    fadeOutActive = true;
    fadeOutStartTime = performance.now();

    viewport.removeEventListener('touchmove', handleTouchMove);
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
