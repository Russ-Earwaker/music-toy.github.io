import { overviewMode } from './overview-mode.js';

const ICON_OVERVIEW_IN = "url('/assets/UI/T_ButtonOverviewZoomIn.png')";
const ICON_OVERVIEW_OUT = "url('/assets/UI/T_ButtonOverviewZoomOut.png')";
const SCALE_MIN = 0.3; // Keep in sync with board-viewport.js clamp
const SCALE_MAX = 1.0; // Max zoom-in level

document.addEventListener('DOMContentLoaded', () => {
  const topbar = document.getElementById('topbar');
  let controls = topbar?.querySelector?.('.topbar-controls');
  if (!controls && topbar) {
    controls = document.createElement('div');
    controls.className = 'topbar-controls';
    topbar.appendChild(controls);
  }

  const overviewButton = document.getElementById('overview-mode-button');

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
    const active = !!overviewMode?.isActive?.();
    if (overviewButton) {
      overviewButton.classList.toggle('is-active', active);
      overviewButton.setAttribute('aria-pressed', active ? 'true' : 'false');
      const core = overviewButton.querySelector('.c-btn-core');
      if (core) {
        core.style.setProperty('--c-btn-icon-url', active ? ICON_OVERVIEW_IN : ICON_OVERVIEW_OUT);
      }
    }
  };

  if (overviewButton && !overviewButton.__bound) {
    overviewButton.addEventListener('click', () => {
      overviewMode?.toggle?.(true);
    });
    overviewButton.__bound = true;
  }

  window.addEventListener('board:scale', (event) => {
    const nextScale = event?.detail?.scale;
    if (typeof nextScale === 'number' && Number.isFinite(nextScale)) {
      updateReadout(nextScale);
    } else {
      updateReadout();
    }
  });

  window.addEventListener('overview:change', () => {
    updateOverviewState();
    updateReadout();
  });

  updateOverviewState();
  updateReadout();
});
