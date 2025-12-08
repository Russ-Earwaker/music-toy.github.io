// Tap dots overlay: canvas-based ripple where each dot wakes up as the wave hits it.
(() => {
  const board = document.getElementById('board');
  const viewport = document.querySelector('.board-viewport');
  if (!board || !viewport) return;

  // Root the overlay on the board so it layers under toys/UI but above the board background.
  let overlay = board.querySelector('.board-tap-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'board-tap-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    // Insert before other board children so toys render above.
    if (board.firstChild) {
      board.insertBefore(overlay, board.firstChild);
    } else {
      board.appendChild(overlay);
    }
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
  const PROFILE = false; // set true temporarily to log profiling info

  // delay before full reset once everything is faded out
  const HANG_MS = 0;

  // Fade-out timing after tap release
  const FADE_OUT_MS = 1000; // ms to fade dots after tap release

  // Wave timing (tap ripple)
  const WAVE_DURATION_MS = 200;  // how long the expanding circle travels
  const DOT_WAVE_WIDTH_MS = 220; // per-dot flash + settle time
  // Safety: hard cap on dots per tap so we don't blow up per-frame work
  const MAX_DOTS_PER_TAP = 700;

  // Base dot appearance
  const BASE_DOT_RADIUS = 1.4; // pixels at scale = 1
  const MAX_SCALE = 1.6;       // BIG peak scale for drag + tap (we can pull back later)
  const EDGE_FADE_NEAR = 0.95; // alpha multiplier at tap centre
  const EDGE_FADE_FAR = 0.25;  // alpha multiplier at outer edge
  const EDGE_FADE_POWER = 1.4; // curve: >1 makes edges fall off faster

  // Colours
  const BASE_COLOR = { r: 90, g: 100, b: 255 };  // calm blue
  const WHITE = { r: 160, g: 160, b: 255 };      // flash

  // Drag "grab the blob" config
  const DRAG_SMOOTH = 0.5;              // blob snaps towards the finger quickly
  const DRAG_RETURN = 0.22;             // relax back fairly quickly
  const DRAG_MAX_OFFSET_FACTOR = 1.8;   // blob can roam further under the finger
  const DRAG_CENTER_POWER = 1.8;        // inner dots move MUCH more than outer dots
  const DRAG_BLOB_MULT = 2.1;           // stronger exaggeration factor for drag displacement
  const DRAG_BRIGHTEN_MULT = 2.0;       // how much drag can boost brightness

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

  // Profiling accumulators (enabled when PROFILE === true)
  let profileLastNow = 0;
  let profileFrameCount = 0;
  let profileMinDt = Infinity;
  let profileMaxDt = 0;
  let profileSumDt = 0;

  function resetProfile() {
    profileLastNow = 0;
    profileFrameCount = 0;
    profileMinDt = Infinity;
    profileMaxDt = 0;
    profileSumDt = 0;
  }

  // Mapping helpers: board space (8k) -> viewport canvas space
  let viewScaleX = 1;
  let viewScaleY = 1;
  let viewOriginX = 0;
  let viewOriginY = 0;

  function getOverlayRect() {
    const rect = overlay.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return rect;
    return viewport.getBoundingClientRect();
  }

  function getOverlayCssSize() {
    const w = overlay.clientWidth || boardW;
    const h = overlay.clientHeight || boardH;
    return { width: w, height: h };
  }

  function getCurrentZoomScale() {
    const z = parseFloat(getComputedStyle(board).getPropertyValue('--zoom-scale'));
    return Number.isFinite(z) && z > 0 ? z : 1;
  }

  function updateBoardToViewTransform() {
    // Board + overlay share the same CSS transform (scale + translate),
    // so board "world" units map 1:1 into the overlay canvas.
    // Let the board's transform handle zoom/pan; don't rescale again here.
    viewScaleX = 1;
    viewScaleY = 1;
    viewOriginX = 0;
    viewOriginY = 0;
  }

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    // Keep the canvas locked to the overlay's visible rect so all transforms use the same size.
    // Use the untransformed CSS size for the backing buffer so the world transform (scale/translate)
    // isn't applied twice to the canvas itself.
    const cssSize = getOverlayCssSize();
    const width = Math.max(1, cssSize.width);
    const height = Math.max(1, cssSize.height);

    // Mobile Safari can silently drop rendering on oversized canvases. Clamp the backing store so
    // width/height stay under a safe cap, reducing DPR if needed.
    const MAX_BACKING_DIM = 3072;
    const maxDim = Math.max(width, height);
    // Allow a bit more resolution when zoomed in (bigger on-screen footprint) but cap aggressively.
    const zoomScale = getCurrentZoomScale() || 1;
    const zoomBoost = Math.max(1, zoomScale);
    const maxDprByCap = (MAX_BACKING_DIM / maxDim) * zoomBoost;
    let effectiveDpr = Math.min(dpr, maxDprByCap);
    effectiveDpr = Math.max(0.5, effectiveDpr);

    canvas.width = Math.max(1, Math.round(width * effectiveDpr));
    canvas.height = Math.max(1, Math.round(height * effectiveDpr));
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    ctx.setTransform(effectiveDpr, 0, 0, effectiveDpr, 0, 0);

    if (DEBUG) {
      console.debug('[tap-dots] resizeCanvas', {
        width,
        height,
        dpr,
        effectiveDpr,
        maxDim
      });
    }

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

    if (PROFILE) resetProfile();

    if (DEBUG) console.debug('[tap-dots] reset');
  }

  function clientToBoardPoint(e) {
    // Measure relative to the overlay we're actually drawing into,
    // not the full offscreen board.
    const rect = getOverlayRect();
    const fx = (e.clientX - rect.left) / (rect.width || 1);
    const fy = (e.clientY - rect.top) / (rect.height || 1);
    const x = fx * boardW;
    const y = fy * boardH;
    if (DEBUG) {
      console.debug('[tap-dots] clientToBoardPoint', {
        clientX: e.clientX,
        clientY: e.clientY,
        viewScaleX,
        viewScaleY,
        overlayCssSize: getOverlayCssSize(),
        overlayRect: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height
        },
        mapped: { x, y }
      });
    }
    return { x, y };
  }

  function buildDotsAroundTap(x, y, radiusScreen, zoomScale) {
    dots = [];

    // Match the finer tap-grid spacing (scaled with zoom) and align to board grid.
    const quantizedScale = Math.pow(
      2,
      Math.round(Math.log2(Math.max(zoomScale, 0.01)))
    );
    let tapSpacing = baseTapSpacing / quantizedScale;

    // Safety: don't let spacing get *too* tiny even at extreme zoom.
    const minSpacing = baseTapSpacing / 8;
    if (tapSpacing < minSpacing) tapSpacing = minSpacing;

    const minX = x - radiusScreen;
    const maxX = x + radiusScreen;
    const minY = y - radiusScreen;
    const maxY = y + radiusScreen;

    // We'll adjust startX/startY as spacing changes.
    let firstColIndex = Math.floor((minX - gridOffsetX) / tapSpacing);
    let startX = gridOffsetX + firstColIndex * tapSpacing;

    let firstRowIndex = Math.floor((minY - gridOffsetY) / tapSpacing);
    let startY = gridOffsetY + firstRowIndex * tapSpacing;

    // Estimate how many dots we'd generate for a given spacing.
    function estimateCount(spacing) {
      const cols = Math.floor((maxX - startX) / spacing) + 2;
      const rows = Math.floor((maxY - startY) / spacing) + 2;
      return cols * rows;
    }

    let estimated = estimateCount(tapSpacing);

    // If we're over budget, progressively coarsen the grid until we're under MAX_DOTS_PER_TAP.
    while (estimated > MAX_DOTS_PER_TAP) {
      tapSpacing *= 1.25; // gently coarsen
      firstColIndex = Math.floor((minX - gridOffsetX) / tapSpacing);
      startX = gridOffsetX + firstColIndex * tapSpacing;

      firstRowIndex = Math.floor((minY - gridOffsetY) / tapSpacing);
      startY = gridOffsetY + firstRowIndex * tapSpacing;

      estimated = estimateCount(tapSpacing);
    }

    currentTapSpacing = tapSpacing;

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

    if (DEBUG || PROFILE) {
      console.debug('[tap-dots] built dots', {
        count: dots.length,
        tapSpacing,
        radiusScreen,
        zoomScale
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
    // Always schedule the next frame up front; resetOverlay() cancels when done.
    rafId = requestAnimationFrame(drawWaveFrame);

    // We might still be fading even if the tap wave has finished.
    if (!waveActive && !fadeOutActive && !isPointerDown) return;

    if (PROFILE) {
      if (profileLastNow !== 0) {
        const dt = now - profileLastNow;
        profileFrameCount++;
        profileSumDt += dt;
        if (dt < profileMinDt) profileMinDt = dt;
        if (dt > profileMaxDt) profileMaxDt = dt;
      }
      profileLastNow = now;
    }

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

  // Clear in device pixels; reset transform so clearRect covers full backing store.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  const zoomScale = getCurrentZoomScale();
  const invZoom = 1 / Math.max(zoomScale, 0.0001);

    // If we're fully faded and the blob is basically at rest, clean up.
    const dragMag = Math.sqrt(dragOffsetX * dragOffsetX + dragOffsetY * dragOffsetY);
    if (!isPointerDown && fadeFactor <= 0.001 && dragMag <= 0.1) {
      if (PROFILE && profileFrameCount > 0) {
        const avgDt = profileSumDt / profileFrameCount;
        console.log('[tap-dots][profile] wave complete', {
          dots: dots.length,
          frames: profileFrameCount,
          avgFrameMs: Number(avgDt.toFixed(3)),
          minFrameMs: Number(profileMinDt.toFixed(3)),
          maxFrameMs: Number(profileMaxDt.toFixed(3))
        });
      }

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
        const baseAlpha = lerp(0.25, 0.95, edgeFactor) * edgeFade;

        // Apply smooth global drag offset scaled by centre influence and exaggeration.
        const offsetX = dragOffsetX * centreInfluence * DRAG_BLOB_MULT;
        const offsetY = dragOffsetY * centreInfluence * DRAG_BLOB_MULT;

        const dispMag = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
        const maxDisp = (tapRadiusScreen * DRAG_MAX_OFFSET_FACTOR || 1);

        // Reach "full effect" sooner: 0.4 * maxDisp already gives full ratio.
        const dispRatioRaw = Math.min(dispMag / (maxDisp * 0.4), 1);
        // Ease it a bit so it ramps up quickly but still feels smooth.
        const dispRatio = Math.sqrt(dispRatioRaw);

        // Combine "how far from center" and "how far we've dragged" into one intensity.
        const dragIntensity = Math.min(dispRatio * centreInfluence, 1);

        // Inner dots scale up and brighten more based on dragIntensity.
        const scale = lerp(1, MAX_SCALE, dragIntensity);
        const mixToWhite = dragIntensity;

        // Brightness also increases with dragIntensity (on top of baseAlpha).
        const brightFactor = lerp(1, DRAG_BRIGHTEN_MULT, dragIntensity);
        const alpha = baseAlpha * brightFactor;

        const r = Math.round(lerp(BASE_COLOR.r, WHITE.r, mixToWhite));
        const g = Math.round(lerp(BASE_COLOR.g, WHITE.g, mixToWhite));
        const b = Math.round(lerp(BASE_COLOR.b, WHITE.b, mixToWhite));

        const drawX = viewOriginX + (dot.x + offsetX) * viewScaleX;
        const drawY = viewOriginY + (dot.y + offsetY) * viewScaleY;
        const radius = (BASE_DOT_RADIUS * scale) * invZoom; // keep screen size constant regardless of zoom

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
      // Keep screen size roughly constant regardless of zoom (use view scales)
      const radius = (BASE_DOT_RADIUS * scale) * invZoom;

      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(drawX, drawY, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
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

    if (PROFILE) resetProfile();

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
    if (window.__toyFocused) return;
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
    if (window.__toyFocused) return;
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
