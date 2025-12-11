import { overviewMode } from './overview-mode.js';

const ICON_OVERVIEW_IN = "url('/assets/UI/T_ButtonOverviewZoomIn.png')";
const ICON_OVERVIEW_OUT = "url('/assets/UI/T_ButtonOverviewZoomOut.png')";
const ICON_FOCUS_CLOSE = "url('/assets/UI/T_ButtonFocusClose.png')";
const SCALE_MIN = 0.3; // Keep in sync with board-viewport.js clamp
const SCALE_MAX = 1.0; // Max zoom-in level
const SETTLE_EPS = 0.002;

document.addEventListener('DOMContentLoaded', () => {
  const topbar = document.getElementById('topbar');
  let controls = topbar?.querySelector?.('.topbar-controls');
  if (!controls && topbar) {
    controls = document.createElement('div');
    controls.className = 'topbar-controls';
    topbar.appendChild(controls);
  }

  const overviewButton = document.getElementById('overview-mode-button');
  let hasFocusedToy = false;
  let currentMode = 'zoom'; // 'zoom' | 'focus-close'
  let pendingSync = false;
  let clickLocked = false;
  let pendingZoomTarget = null;
  let lastNormalScale = SCALE_MAX;

  const isCamLocked = () => (typeof window !== 'undefined' && window.__camTweenLock === true);
  const isOverviewTransitioning = () => !!(overviewMode?.state?.transitioning);

  const resetButton = document.getElementById('reset-view-button');
  if (resetButton?.parentElement) resetButton.remove();

  let readout = document.getElementById('zoom-readout');
  if (readout?.parentElement) readout.remove();
  readout = null;

  const clampScale = (value) => {
    const safe = Number.isFinite(value) && value > 0 ? value : 1;
    return Math.min(SCALE_MAX, Math.max(SCALE_MIN, safe));
  };

  const markerScale = clampScale(overviewMode?.state?.zoomThreshold ?? SCALE_MIN);
  const getMarkerProgress = () => {
    const denom = Math.max(SCALE_MAX - SCALE_MIN, 1e-3);
    const prog = (markerScale - SCALE_MIN) / denom;
    return Math.min(1, Math.max(0, prog));
  };

  const getScale = () => {
    const scale = typeof window.__boardScale === 'number' ? window.__boardScale : 1;
    return clampScale(scale);
  };

  const formatScale = (scale) => `Zoom ${scale.toFixed(scale >= 10 ? 1 : 2)}x`;

  const updateRing = (scale = getScale()) => {
    if (!overviewButton) return;
    const denom = Math.max(SCALE_MAX - SCALE_MIN, 1e-3);
    const progress = Math.min(1, Math.max(0, (clampScale(scale) - SCALE_MIN) / denom));
    overviewButton.style.setProperty('--zoom-progress', progress.toFixed(3));
    const markerProgress = getMarkerProgress();
    const markerAngle = (markerProgress * 360).toFixed(2);
    overviewButton.style.setProperty('--zoom-overview-angle', `${markerAngle}deg`);
  };

  const updateReadout = (scale = getScale()) => {
    updateRing(scale);
    if (readout) {
      readout.textContent = formatScale(scale);
    }
  };

  const updateOverviewState = () => {
    if (pendingZoomTarget !== null || isCamLocked() || isOverviewTransitioning()) {
      return; // hold state/icon until zoom settles
    }
    const active = !!overviewMode?.isActive?.();
    const focusEditingEnabled = (typeof window !== 'undefined' && typeof window.isFocusEditingEnabled === 'function')
      ? window.isFocusEditingEnabled()
      : true;
    if (overviewButton) {
      overviewButton.classList.toggle('is-active', active);
      overviewButton.setAttribute('aria-pressed', active ? 'true' : 'false');
      const core = overviewButton.querySelector('.c-btn-core');
      if (core) {
        const showFocusClose = focusEditingEnabled && hasFocusedToy;
        currentMode = showFocusClose ? 'focus-close' : 'zoom';
        if (showFocusClose) {
          core.style.setProperty('--c-btn-icon-url', ICON_FOCUS_CLOSE);
        } else {
          // Zoomed in: show zoom-out icon. Zoomed out (overview active): show zoom-in icon.
          core.style.setProperty('--c-btn-icon-url', active ? ICON_OVERVIEW_IN : ICON_OVERVIEW_OUT);
        }
      }
    }
  };

  const syncUI = (force = false) => {
    // Always keep the ring/readout in sync.
    const scaleNow = getScale();
    updateReadout(scaleNow);

    if (!force && (pendingZoomTarget !== null || isCamLocked() || isOverviewTransitioning())) {
      if (!pendingSync) {
        pendingSync = true;
        const poll = () => {
          if (pendingZoomTarget !== null || isCamLocked() || isOverviewTransitioning()) {
            requestAnimationFrame(poll);
            return;
          }
          pendingSync = false;
          updateOverviewState();
        };
        requestAnimationFrame(poll);
      }
      return;
    }
    updateOverviewState();
  };

  if (overviewButton && !overviewButton.__bound) {
    overviewButton.addEventListener('click', () => {
      // Ignore clicks while camera/overview is animating or a previous click is pending.
      if (clickLocked || pendingZoomTarget !== null || window.__overviewButtonPending || isCamLocked() || isOverviewTransitioning()) return;
      clickLocked = true;
      try { console.info('[overview-button] click', { currentMode, locked: clickLocked, camLocked: isCamLocked(), transitioning: isOverviewTransitioning() }); } catch {}
      const release = () => {
        const poll = () => {
          if (isCamLocked() || isOverviewTransitioning()) {
            requestAnimationFrame(poll);
            return;
          }
          clickLocked = false;
          syncUI(true);
        };
        requestAnimationFrame(poll);
      };
      if (currentMode === 'focus-close') {
        try { window.clearToyFocus?.(); } catch {}
        release();
        return;
      }
      const state = overviewMode?.state || {};
      const threshold = clampScale(state.zoomThreshold ?? SCALE_MIN);
      const currentScale = getScale();
      const zoomingOut = currentScale >= threshold;
      if (zoomingOut) {
        lastNormalScale = currentScale;
      }
      const centerWorld = (typeof window !== 'undefined' && typeof window.getViewportCenterWorld === 'function')
        ? window.getViewportCenterWorld()
        : null;
      const target = zoomingOut
        ? clampScale(state.buttonOverviewScale ?? SCALE_MIN)
        : clampScale(lastNormalScale || state.buttonNormalScale || SCALE_MAX);
      pendingZoomTarget = target;
      window.__overviewButtonPending = true;
      try { console.info('[overview-button] zoom target', { currentScale, target, dir: zoomingOut ? 'toOverview' : 'fromOverview' }); } catch {}
      try {
        window.__setOverviewButtonGate?.({
          start: currentScale,
          target,
          threshold,
          dir: zoomingOut ? 'toOverview' : 'fromOverview',
        });
      } catch {}
      try {
        if (
          centerWorld &&
          Number.isFinite(centerWorld.x) &&
          Number.isFinite(centerWorld.y) &&
          typeof window.centerBoardOnWorldPoint === 'function'
        ) {
          window.centerBoardOnWorldPoint(centerWorld.x, centerWorld.y, target, { duration: 468 });
        } else {
          window.setBoardScale?.(target);
        }
      } catch {}
      // Do not change overview state immediately; let board-viewport cross the threshold.
      release();
    });
    overviewButton.__bound = true;
  }

  window.addEventListener('focus:change', (event) => {
    hasFocusedToy = !!event.detail.hasFocus;
    if (overviewButton) {
      overviewButton.classList.toggle('has-focused-toy', hasFocusedToy);
    }
    syncUI();
  });

  window.addEventListener('focus:editing-toggle', () => {
    syncUI();
  });

  window.addEventListener('board:scale', (event) => {
    const nextScale = event?.detail?.scale;
    if (typeof nextScale === 'number' && Number.isFinite(nextScale)) {
      updateReadout(nextScale);
      if (pendingZoomTarget !== null && Math.abs(nextScale - pendingZoomTarget) <= SETTLE_EPS) {
        pendingZoomTarget = null;
        window.__overviewButtonPending = false;
        clickLocked = false;
        try { console.info('[overview-button] settled', { scale: nextScale }); } catch {}
        syncUI(true);
        return;
      }
    }
    syncUI();
  });

  window.addEventListener('overview:change', () => {
    syncUI();
  });

  syncUI(true);
});
