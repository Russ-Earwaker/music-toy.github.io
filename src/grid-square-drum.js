// grid-square-drum.js
// Non-destructive overlay for the existing Grid toy.
// - Tries to make the canvas appear square (CSS aspect-ratio + height sync)
// - Adds a Drum Pad at the lower portion of the square
// - On tap, emits CustomEvent('grid:drum-tap', { detail: { toyId, playheadX } })
//   and, if available, calls window.gridActivateNearest(toyId)
// File length kept under 300 lines.

const DEBUG = localStorage.getItem('mt_debug')==='1';
const LOG = (...a) => DEBUG && console.log('[grid-square-drum]', ...a);

function addDrumPad(panel, padWrap, toyId) {
  // Check if the pad already exists to avoid re-creating it and its listeners.
  let pad = padWrap.querySelector('.grid-drum-pad');
  if (!pad) {
    pad = document.createElement('div');
    pad.className = 'grid-drum-pad';
    // Note: All styling is now handled by style.css for a circular pad.
    // Defensively clear any text content that might be added by other scripts.
    pad.textContent = '';
    padWrap.appendChild(pad);
  }

  // Prevent adding the same listener multiple times.
  if (pad.__drumPadWired) return;
  pad.__drumPadWired = true;

  const onTap = () => {
    // Play the assigned instrument immediately, using the toy's main playback function.
    // This ensures synth sounds are triggered correctly and consistently.
    if (panel.__playCurrent) {
      try { panel.__playCurrent(); } catch (e) { LOG('__playCurrent failed', e); }
    }
    // Trigger particles
    if (panel.__particles?.disturb) {
      panel.__particles.disturb();
    }

    // Also, activate the cube at the current playhead position.
    const playheadCol = panel?.__drumVisualState?.playheadCol;
    if (playheadCol >= 0 && panel?.__gridState?.steps) {
      panel.__gridState.steps[playheadCol] = true; // Set to true, don't toggle
    }

    const playheadX = window.gridPlayheadX?.(toyId) ?? null;
    panel.dispatchEvent(new CustomEvent('grid:drum-tap', { detail: { toyId, playheadX } }));
    if (typeof window.gridActivateNearest === 'function') {
      try { window.gridActivateNearest(toyId); } catch (e) { LOG('gridActivateNearest error', e); }
    }
    // Quick visual flash
    pad.animate(
      [
        { background: 'radial-gradient(circle, #a070ff, #6030c0)', transform: 'scale(0.95)' },
        { background: '#2c313a', transform: 'scale(1)' }
      ],
      { duration: 250, easing: 'ease-out' }
    );
  };

  pad.addEventListener('pointerdown', onTap);
}

export function attachGridSquareAndDrum(panel) {
  const toyId = panel?.dataset?.toyId || panel?.id || 'grid';
  const padWrap = panel.querySelector('.drum-pad-wrap');
  if (!padWrap) {
    LOG('Could not find .drum-pad-wrap to attach drum pad.');
    return;
  }

  addDrumPad(panel, padWrap, toyId);
  LOG('attached', { toyId });
}
