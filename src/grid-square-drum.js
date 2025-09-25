// grid-square-drum.js
import { isRunning, getLoopInfo } from './audio-core.js';

const DEBUG = false; // disable debug logs for grid-square-drum overlay
const LOG = () => {};

function addDrumPad(panel, padWrap, toyId) {
  let pad = padWrap.querySelector('.grid-drum-pad');
  if (!pad) {
    pad = document.createElement('div');
    pad.className = 'grid-drum-pad';
    padWrap.appendChild(pad);
  }

  const body = panel.querySelector('.toy-body') || panel;
  let label = body.querySelector('.drum-tap-label');
  if (!label) {
    label = document.createElement('div');
    label.textContent = 'TAP';
    label.className = 'drum-tap-label';
    Object.assign(label.style, {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        fontWeight: '700',
        fontSize: '48px',
        letterSpacing: '0.1em',
        opacity: '0',
        color: 'rgb(80,120,180)',
        fontFamily: "'Poppins', 'Helvetica Neue', sans-serif",
        transition: 'opacity 0.3s ease-in-out',
        pointerEvents: 'none',
        zIndex: '2'
    });
    body.appendChild(label);
  }

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
    const running = isRunning();

    if (running && !hasActiveSteps) {
      label.style.opacity = '1';
    } else {
      label.style.opacity = '0';
    }
}

function layout(panel){
    const pad = panel.querySelector('.grid-drum-pad');
    if (!pad) return;
    const r = pad.parentElement.getBoundingClientRect();
    const size = Math.floor(Math.min(r.width, r.height) * 0.68);
    const label = panel.querySelector('.drum-tap-label');
    if(label){
      label.style.fontSize = `${Math.max(24, size * 0.2)}px`;
    }
}

export function attachGridSquareAndDrum(panel) {
  const toyId = panel?.dataset?.toyId || panel?.id || 'grid';
  const padWrap = panel.querySelector('.drum-pad-wrap');
  if (!padWrap) {
    LOG('Could not find .drum-pad-wrap to attach drum pad.');
    return;
  }

  addDrumPad(panel, padWrap, toyId);
  layout(panel);
  updateLabelVisibility(panel);
  panel.addEventListener('loopgrid:update', () => updateLabelVisibility(panel));

  if (!panel.__drumVisibilityLoop) {
      panel.__drumVisibilityLoop = true;
      const checkRunningState = () => {
          if (!panel.isConnected) return;
          updateLabelVisibility(panel);
          requestAnimationFrame(checkRunningState);
      }
      checkRunningState();
  }

  LOG('attached', { toyId });
}