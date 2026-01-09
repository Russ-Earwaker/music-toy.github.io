import { LETTER_PHYS, LETTER_VIS, DRAW_LABEL_OPACITY_BASE } from './dg-tuning.js';
import { DG_GHOST_DEBUG } from './dg-debug.js';

function clamp01(value) {
  if (typeof value !== 'number') return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function createDrawLabelOverlay(panel, getState, opts = {}) {
  const { wrap, grid } = opts;

  let drawLabel = panel.querySelector('.drawgrid-tap-label');
  if (!drawLabel) {
    drawLabel = document.createElement('div');
    drawLabel.className = 'drawgrid-tap-label';
    Object.assign(drawLabel.style, {
      position: 'absolute',
      inset: '0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
      zIndex: 7,
      fontFamily: 'system-ui, sans-serif',
      fontWeight: '700',
      letterSpacing: '0.08em',
      // Use Loopgrid/TAP-ish theming if available; bump ~50%.
      color: 'var(--tap-label-color, rgba(160,188,255,0.72))',
      textShadow: 'var(--tap-label-shadow, 0 2px 10px rgba(40,60,120,0.55))',
      fontSize: 'initial',
      lineHeight: '1',
      textTransform: 'uppercase',
      userSelect: 'none',
      opacity: `${DRAW_LABEL_OPACITY_BASE}`,
    });
    wrap.appendChild(drawLabel);
    drawLabel.style.pointerEvents = 'none';
  }

  const state = {
    panel,
    wrap,
    grid,
    getState,
    drawLabel,
    drawLabelLetters: [],
    letterStates: [],
    drawLabelVisible: true,
    lettersRAF: null,
    lastDrawLabelPx: null,
    hasDrawnFirstLine: false,
    ensureLetterPhysicsLoop: null,
    updateDrawLabel: null,
    fadeOutDrawLabel: null,
    knockLettersAt: null,
    getDrawLabelYRange: null,
  };

  function getGridCssRect() {
    let rect = state.grid?.getBoundingClientRect?.();
    if (!rect || !rect.width || !rect.height) {
      rect = state.wrap?.getBoundingClientRect?.();
    }
    if (!rect || !rect.width || !rect.height) return null;
    return rect;
  }

  function logicalToCssPoint(point) {
    if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') {
      return { x: point?.x || 0, y: point?.y || 0 };
    }
    const rect = getGridCssRect();
    const gridArea = state.getState?.()?.gridArea;
    const areaWidth = (gridArea?.w > 0) ? gridArea.w : rect?.width || 1;
    const areaHeight = (gridArea?.h > 0) ? gridArea.h : rect?.height || 1;
    if (!rect) return { x: point.x, y: point.y };
    const scaleX = areaWidth > 0 ? rect.width / areaWidth : 1;
    const scaleY = areaHeight > 0 ? rect.height / areaHeight : 1;
    return {
      x: rect.left + (point.x - (gridArea?.x || 0)) * scaleX,
      y: rect.top + (point.y - (gridArea?.y || 0)) * scaleY,
    };
  }

  function cssToLogicalPoint(point) {
    if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') {
      return { x: point?.x || 0, y: point?.y || 0 };
    }
    const rect = getGridCssRect();
    if (!rect) return { x: point.x, y: point.y };
    const nx = clamp01((point.x - rect.left) / rect.width);
    const ny = clamp01((point.y - rect.top) / rect.height);
    const gridArea = state.getState?.()?.gridArea;
    const areaWidth = (gridArea?.w > 0) ? gridArea.w : rect.width;
    const areaHeight = (gridArea?.h > 0) ? gridArea.h : rect.height;
    return {
      x: (gridArea?.x || 0) + nx * areaWidth,
      y: (gridArea?.y || 0) + ny * areaHeight,
    };
  }

  function ensureLetterPhysicsLoop() {
    const panelState = state.getState?.() || {};
    if (!state.drawLabelVisible || !panelState.isPanelVisible) return;
    if (state.lettersRAF) return;
    const step = () => {
      const nextPanelState = state.getState?.() || {};
      if (!state.drawLabelVisible || !nextPanelState.isPanelVisible) {
        state.lettersRAF = null;
        return;
      }
      let rafNeeded = false;
      for (const st of state.letterStates) {
        const ax = -LETTER_PHYS.k * st.x;
        const ay = -LETTER_PHYS.k * st.y;
        st.vx = (st.vx + ax) * LETTER_PHYS.damping;
        st.vy = (st.vy + ay) * LETTER_PHYS.damping;
        st.x += st.vx;
        st.y += st.vy;

        if (Math.abs(st.x) < LETTER_PHYS.epsilon) st.x = 0;
        if (Math.abs(st.y) < LETTER_PHYS.epsilon) st.y = 0;

        const tx = Math.max(-LETTER_PHYS.max, Math.min(LETTER_PHYS.max, st.x));
        const ty = Math.max(-LETTER_PHYS.max, Math.min(LETTER_PHYS.max, st.y));
        st.el.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;

        // ---- visual: brief color flash + opacity boost on ghost impact ----
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

        let flashAmt = 0;
        if (st.lastHitTs > 0) {
          const t = now - st.lastHitTs;
          if (t <= LETTER_VIS.flashUpMs) {
            flashAmt = LETTER_VIS.flashUpMs > 0
              ? t / Math.max(1, LETTER_VIS.flashUpMs)
              : 1;
          } else if (t <= LETTER_VIS.flashUpMs + LETTER_VIS.flashDownMs) {
            const d = (t - LETTER_VIS.flashUpMs) / Math.max(1, LETTER_VIS.flashDownMs);
            flashAmt = 1 - d;
          } else {
            flashAmt = 0;
          }
        }
        const hadFlash = !!st.flashActive;
        const hasFlash = flashAmt > 0;
        st.flashActive = hasFlash;
        if (hasFlash || hadFlash) {
          const opacity = Math.min(1, LETTER_VIS.opacityBase + LETTER_VIS.opacityBoost * flashAmt);
          st.el.style.opacity = `${Math.max(0, opacity)}`;

          if (hasFlash) {
            const boost = 1 + (LETTER_VIS.flashBoost - 1) * flashAmt;
            st.el.style.filter = `brightness(${boost.toFixed(3)})`;
            st.el.style.color = LETTER_VIS.flashColor;
            st.el.style.textShadow = LETTER_VIS.flashShadow;
          } else {
            st.el.style.filter = 'none';
            st.el.style.color = '';
            st.el.style.textShadow = '';
          }
        }

        if (
          st.x !== 0 || st.y !== 0 ||
          Math.abs(st.vx) > LETTER_PHYS.epsilon ||
          Math.abs(st.vy) > LETTER_PHYS.epsilon
        ) {
          rafNeeded = true;
        }
        if (hasFlash) rafNeeded = true;
      }
      state.lettersRAF = rafNeeded ? requestAnimationFrame(step) : null;
    };
    state.lettersRAF = requestAnimationFrame(step);
  }

  function rebuildLetterStates() {
    state.letterStates.length = 0;
    for (const el of state.drawLabelLetters) {
      el.style.transition = 'none';
      el.style.willChange = 'transform';
      // visual state for hit flash
      state.letterStates.push({
        el, x: 0, y: 0, vx: 0, vy: 0,
        lastHitTs: 0,      // ms timestamp of last hit
        flashActive: false,
      });
    }
    ensureLetterPhysicsLoop();
  }

  function renderDrawText() {
    if (!state.drawLabel) return;
    state.drawLabelLetters.length = 0;
    state.drawLabel.innerHTML = '';
    for (const ch of 'DRAW') {
      const span = document.createElement('span');
      span.className = 'drawgrid-letter';
      span.textContent = ch;
      span.style.display = 'inline-block';
      span.style.willChange = 'transform';
      span.style.transform = 'translate3d(0,0,0)';
      // Visual baseline for per-letter effects
      span.style.opacity = `${LETTER_VIS.opacityBase}`;       // per-letter opacity (multiplies with container's 0.3)
      span.style.filter = 'none';     // we'll bump brightness briefly on hit
      state.drawLabel.appendChild(span);
      state.drawLabelLetters.push(span);
    }
    rebuildLetterStates();
  }
  renderDrawText();

  function setDrawTextActive(active) {
    if (!state.drawLabel) return;
    if (active) {
      state.drawLabel.style.display = 'flex';
      // Restore base opacity whenever we show it
      state.drawLabel.style.opacity = `${DRAW_LABEL_OPACITY_BASE}`;
      state.drawLabelVisible = true;
      ensureLetterPhysicsLoop();
    } else {
      state.drawLabel.style.opacity = '0';
      state.drawLabel.style.display = 'none';
      state.drawLabelVisible = false;
      if (state.lettersRAF) {
        cancelAnimationFrame(state.lettersRAF);
        state.lettersRAF = null;
      }
    }
  }

  function fadeOutDrawLabel(opts = {}) {
    const { immediate = false } = opts || {};
    if (!state.drawLabel) return;
    state.hasDrawnFirstLine = true;

    if (immediate) {
      state.drawLabel.style.transition = 'none';
      state.drawLabel.style.opacity = '0';
      setDrawTextActive(false);
      return;
    }

    try {
      state.drawLabel.style.transition = 'opacity 260ms ease-out';
    } catch {}
    state.drawLabel.style.opacity = '0';

    setTimeout(() => {
      try {
        setDrawTextActive(false);
        // Clear transition so future shows don't inherit it unexpectedly
        state.drawLabel.style.transition = '';
      } catch {}
    }, 280);
  }

  function knockLettersAt(localX, localY, { radius = 72, strength = 10, source = 'unknown' } = {}) {
    const panelState = state.getState?.() || {};
    const z = Math.max(0.1, panelState?.dgViewport?.getZoom?.() || 1);
    const scaledRadius = radius * z;
    if (!state.drawLabel || !state.drawLabelLetters.length) return;
    const rect = state.drawLabel?.getBoundingClientRect?.();
    if (!rect || !rect.width || !rect.height) return;
    const gridArea = panelState?.gridArea;
    const baseX = (typeof localX === 'number' ? localX : 0) + (gridArea?.x || 0);
    const baseY = (typeof localY === 'number' ? localY : 0) + (gridArea?.y || 0);
    const cssPoint = logicalToCssPoint({ x: baseX, y: baseY });
    const relX = cssPoint.x - rect.left;
    const relY = cssPoint.y - rect.top;
    state.drawLabelLetters.forEach((el, idx) => {
      const letterRect = el.getBoundingClientRect?.();
      if (!letterRect) return;

      const lx = letterRect.left - rect.left + letterRect.width * 0.5;
      const ly = letterRect.top  - rect.top  + letterRect.height * 0.5;

      const dx = lx - relX;
      const dy = ly - relY;
      const distSq = dx * dx + dy * dy;
      if (distSq > scaledRadius * scaledRadius) return;

      const dist = Math.sqrt(distSq) || 1;
      const fall = 1 - Math.min(1, dist / scaledRadius);
      const push = strength * fall * fall;

      const ux = dx / dist;
      const uy = dy / dist;

      const st = state.letterStates[idx];
      if (!st) return;
      const impulse = LETTER_PHYS.impulse * push;
      st.vx += ux * impulse;
      st.vy += uy * impulse;

      ensureLetterPhysicsLoop();
      // ---- visual: register a hit only for ghost fingers within the core radius ----
      const coreHitRadius = scaledRadius * LETTER_VIS.ghostCoreHitMul;
      if ((source === 'ghost' || source === 'line' || source === 'header') && dist <= coreHitRadius) {
        st.lastHitTs = (typeof performance !== 'undefined' && performance.now)
          ? performance.now()
          : Date.now();
      }
      if (DG_GHOST_DEBUG) {
        try { console.debug('[DG][letters-hit]', { idx, dx, dy }); } catch {}
      }
    });
  }

  function updateDrawLabel(show) {
    // Once we've faded it out after the first line, don't resurrect it
    // unless explicitly re-enabled via clear().
    if (state.hasDrawnFirstLine) {
      if (!show) setDrawTextActive(false);
      return;
    }
    setDrawTextActive(!!show);
  }

  function getDrawLabelYRange() {
    if (!state.drawLabel) return null;
    const drawRect = state.drawLabel.getBoundingClientRect?.();
    if (!drawRect) return null;
    const centerX = drawRect.left + drawRect.width * 0.5;
    const logicalTop = cssToLogicalPoint({ x: centerX, y: drawRect.top });
    const logicalBottom = cssToLogicalPoint({ x: centerX, y: drawRect.bottom });
    const topY = Math.min(logicalTop.y, logicalBottom.y);
    const bottomY = Math.max(logicalTop.y, logicalBottom.y);
    if (!Number.isFinite(topY) || !Number.isFinite(bottomY) || bottomY <= topY) return null;
    const gridArea = state.getState?.()?.gridArea;
    const areaTop = Number.isFinite(gridArea?.y) ? gridArea.y : topY;
    const areaBottom = Number.isFinite(gridArea?.h) ? (gridArea.y + gridArea.h) : bottomY;
    const minY = Math.max(areaTop, topY);
    const maxY = Math.min(areaBottom, bottomY);
    if (!Number.isFinite(minY) || !Number.isFinite(maxY) || maxY <= minY) return null;
    return { minY, maxY, midY: (minY + maxY) * 0.5 };
  }

  updateDrawLabel(true);

  state.ensureLetterPhysicsLoop = ensureLetterPhysicsLoop;
  state.updateDrawLabel = updateDrawLabel;
  state.fadeOutDrawLabel = fadeOutDrawLabel;
  state.knockLettersAt = knockLettersAt;
  state.getDrawLabelYRange = getDrawLabelYRange;

  return state;
}

export function updateDrawLabelLayout(state, rects = {}) {
  if (!state || !state.drawLabel) return;
  const wrap = rects.wrap || state.wrap;
  const gridAreaLogical = rects.gridAreaLogical;
  const areaW = gridAreaLogical?.w || wrap?.clientWidth || 0;
  const areaH = gridAreaLogical?.h || wrap?.clientHeight || 0;
  const minDim = Math.max(1, Math.min(areaW, areaH));
  const labelSizePx = Math.max(48, Math.min(240, minDim * 0.26));
  const labelSizeChanged = (state.lastDrawLabelPx !== labelSizePx);
  if (labelSizeChanged && state.drawLabel?.style) {
    state.drawLabel.style.fontSize = `${labelSizePx}px`;
    state.lastDrawLabelPx = labelSizePx;
  }
  if (Array.isArray(state.drawLabelLetters)) {
    const needsLetterSync = labelSizeChanged || (state.letterStates.length !== state.drawLabelLetters.length);
    if (needsLetterSync) {
      const prevStates = state.letterStates;
      state.letterStates = state.drawLabelLetters.map((el, i) => {
        const prev = prevStates[i];
        if (prev) {
          prev.el = el;
          return prev;
        }
        return { el, x: 0, y: 0, vx: 0, vy: 0, lastHitTs: 0, flashActive: false };
      });
      state.ensureLetterPhysicsLoop?.();
    }
  }
}

export function destroyDrawLabelOverlay(state) {
  if (!state) return;
  if (state.lettersRAF) {
    cancelAnimationFrame(state.lettersRAF);
    state.lettersRAF = null;
  }
  try {
    if (state.drawLabel && state.drawLabel.parentNode) {
      state.drawLabel.parentNode.removeChild(state.drawLabel);
    }
  } catch {}
  state.drawLabelLetters = [];
  state.letterStates = [];
  state.drawLabel = null;
}
