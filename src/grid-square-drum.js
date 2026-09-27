// grid-square-drum.js
import { getLoopInfo } from './audio-core.js';
import { isHelpActive } from './help-overlay.js';
import { getToyLifecycle } from './baseMusicToy/toyLifecycle.js';

const DEBUG = false; // disable debug logs for grid-square-drum overlay
const LOG = () => {};

function addDrumPad(panel, padWrap, toyId) {
  let pad = padWrap.querySelector('.grid-drum-pad');
  if (!pad) {
    pad = document.createElement('div');
    pad.className = 'grid-drum-pad';
    padWrap.appendChild(pad);
  }

  let flash = pad.querySelector('.drum-pad-flash');
  if (!flash) {
    flash = document.createElement('div');
    flash.className = 'drum-pad-flash';
    pad.appendChild(flash);
  }

  let label = padWrap.querySelector('.drum-tap-label');
  if (!label) {
    label = document.createElement('div');
    label.textContent = 'TAP';
    label.className = 'toy-action-label drum-tap-label';
    Object.assign(label.style, {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        fontWeight: '700',
        // Container-relative presentation sizing. Board zoom and --toy-scale
        // transform the complete shell; no inverse scale compensation is needed.
        fontSize: 'max(24px, 39cqi)',
        letterSpacing: '0.1em',
        opacity: '0',
        color: 'rgb(80,120,180)',
        fontFamily: "'Poppins', 'Helvetica Neue', sans-serif",
        transition: 'opacity 0.3s ease-in-out',
        pointerEvents: 'none',
        zIndex: '4'
    });
    padWrap.appendChild(label);
  }
  padWrap.style.containerType = 'inline-size';
  label.style.fontSize = 'max(24px, 39cqi)';

  if (pad.__drumPadWired) return;
  pad.__drumPadWired = true;

  const onTap = () => {
    if (panel.__playCurrent) {
      try { panel.__playCurrent(); } catch (e) { LOG('__playCurrent failed', e); }
    }
    if (panel.__particles?.disturb) {
      panel.__particles.disturb();
    }
    if (panel.__drumVisualState) {
      panel.__drumVisualState.bgFlash = 1.0;
    }
    triggerPadFlash(panel);

    const loopInfo = getLoopInfo();
    const playheadCol = loopInfo ? Math.floor(loopInfo.phase01 * 8) : -1;
    if (playheadCol >= 0 && panel?.__gridState?.steps) {
      panel.__gridState.steps[playheadCol] = true;
    }

    panel.dispatchEvent(new CustomEvent('grid:drum-tap', { detail: { toyId } }));
    pad.animate(
      [
        { transform: 'scale(0.95)' },
        { transform: 'scale(1)' }
      ],
      { duration: 250, easing: 'ease-out' }
    );
  };

  pad.addEventListener('pointerdown', onTap);
}

function updateLabelVisibility(panel) {
    const label = panel.querySelector('.drum-tap-label');
    if (!label) return;

    const gridState = panel.__gridState;
    const hasActiveSteps = gridState && gridState.steps.some(Boolean);

    if (isHelpActive() && !hasActiveSteps) {
      label.style.opacity = '0.35';
    } else {
      label.style.opacity = '0';
    }
}

function triggerPadFlash(panel) {
    const pad = panel.querySelector('.grid-drum-pad');
    if (!pad) return;
    const flash = pad.querySelector('.drum-pad-flash');
    if (!flash) return;

    try {
      flash.getAnimations?.().forEach((animation) => animation.cancel());
      flash.animate(
        [{ opacity: 0.75 }, { opacity: 0 }],
        { duration: 340, easing: 'ease-out' },
      );
    } catch {
      flash.style.opacity = '0.75';
      setTimeout(() => { flash.style.opacity = '0'; }, 340);
    }
}

export function attachGridSquareAndDrum(panel) {
  const toyId = panel?.dataset?.toyId || panel?.id || 'grid';
  const padWrap = panel.querySelector('.drum-pad-wrap');
  if (!padWrap) {
    LOG('Could not find .drum-pad-wrap to attach drum pad.');
    return;
  }

  const lifecycle = getToyLifecycle(panel);
  addDrumPad(panel, padWrap, toyId);
  updateLabelVisibility(panel);
  lifecycle.listen(panel, 'loopgrid:update', () => {
    updateLabelVisibility(panel);
  });
  lifecycle.listen(window, 'help:toggle', () => updateLabelVisibility(panel));
  lifecycle.listen(panel, 'loopgrid:playcol', (event) => {
    const column = Number(event?.detail?.col);
    if (Number.isInteger(column) && panel.__gridState?.steps?.[column]) triggerPadFlash(panel);
  });

  LOG('attached', { toyId });
}
