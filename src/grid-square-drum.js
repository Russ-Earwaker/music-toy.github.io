// grid-square-drum.js
import { isRunning, getLoopInfo } from './audio-core.js';
import { isHelpActive } from './help-overlay.js';

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
        fontSize: '48px',
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
      updatePadFlash(panel);
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

    if (isHelpActive() && !hasActiveSteps) {
      label.style.opacity = '0.35';
    } else {
      label.style.opacity = '0';
    }
}

function updatePadFlash(panel) {
    const pad = panel.querySelector('.grid-drum-pad');
    if (!pad) return;
    const flash = pad.querySelector('.drum-pad-flash');
    if (!flash) return;

    const st = panel.__drumVisualState;
    const raw = (typeof (st?.bgFlash) === 'number') ? st.bgFlash : 0;
    const value = Number.isFinite(raw) ? raw : 0;
    if (value <= 0.001) {
      if (flash.style.opacity !== '0') flash.style.opacity = '0';
      return;
    }

    const clamped = Math.max(0, Math.min(1, value));
    flash.style.opacity = clamped.toFixed(3);
}

function layout(panel){
    const pad = panel.querySelector('.grid-drum-pad');
    if (!pad) return;
    const r = pad.parentElement.getBoundingClientRect();

    // Compensate for board zoom so TAP stays the same relative size to the toy
    let scale = 1;
    try {
      const board = document.getElementById('board');
      if (board) {
        const tf = (getComputedStyle(board).transform || getComputedStyle(board).webkitTransform || '');
        if (tf && tf !== 'none') {
          const m = tf.match(/matrix\(([^)]+)\)/);
          if (m) {
            const parts = m[1].split(',');
            if (parts.length >= 2) {
              const a = parseFloat(parts[0]);
              const b = parseFloat(parts[1]);
              const s = Math.sqrt(a * a + b * b);
              if (Number.isFinite(s) && s > 0) scale = s;
            }
          }
        }
      }
    } catch {}

    const unscaledMin = Math.min(r.width, r.height) / (scale || 1);
    const size = Math.floor(unscaledMin * 0.3);
    const label = panel.querySelector('.drum-tap-label');
    if(label){
      label.style.fontSize = `${Math.max(24, size * 1.3)}px`;
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
  updatePadFlash(panel);
  panel.addEventListener('loopgrid:update', () => {
    updateLabelVisibility(panel);
    updatePadFlash(panel);
  });

  if (!panel.__drumVisibilityLoop) {
      panel.__drumVisibilityLoop = true;
      const checkRunningState = () => {
          if (!panel.isConnected) return;
          updateLabelVisibility(panel);
          updatePadFlash(panel);
          requestAnimationFrame(checkRunningState);
      }
      checkRunningState();
  }

  LOG('attached', { toyId });
}







