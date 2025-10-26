// src/loopgrid-square-drum.js — circular pad that triggers current instrument (<=300 lines)
import { isRunning } from './audio-core.js';

if (window.__loopgridDrumBoot) {
  // already booted
} else {
  window.__loopgridDrumBoot = true;
  const SEL = '.toy-panel[data-toy="loopgrid-drum"]';

  function ensurePad(panel) {
    const body = panel.querySelector('.toy-body') || panel;
    if (!body.querySelector('.loopgrid-drum-pad')) {
      const pad = document.createElement('div');
      pad.className = 'grid-drum-pad loopgrid-drum-pad';
      
      const flash = document.createElement('div');
      flash.className = 'drum-pad-flash';
      pad.appendChild(flash);
      const label = document.createElement('div');
      label.textContent = 'TAP'; // Set text to 'TAP'
      label.className = 'toy-action-label drum-tap-label';
      Object.assign(label.style, {
        fontWeight: '700',
        fontSize: '48px',
        letterSpacing: '0.1em',
        opacity: '0',
        color: 'rgba(200, 220, 255, 0.85)',
        fontFamily: "'Poppins', 'Helvetica Neue', sans-serif",
        transition: 'opacity 0.3s ease-in-out',
        pointerEvents: 'none',
        zIndex: '4'
      });
      pad.appendChild(label);

      // play + highlight current column
      pad.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();

        console.log('Drum pad clicked');
        console.log('Panel:', panel);
        console.log('Drum Visual State:', panel?.__drumVisualState);

        if (panel.__playCurrent) {
          try {
            panel.__playCurrent();
          } catch (e) {
            console.warn('__playCurrent failed', e);
          }
        }
        // Trigger particles
        if (panel.__particles?.disturb) {
          panel.__particles.disturb();
        }

        // Trigger background flash
        if (panel.__drumVisualState) {
          panel.__drumVisualState.bgFlash = 1.0;
        }

        // Also, activate the cube at the current playhead position. 
        const playheadCol = panel?.__drumVisualState?.playheadCol;
        console.log('Playhead Column:', playheadCol);

        if (playheadCol >= 0 && panel?.__gridState?.steps) {
          console.log('Activating cube at column:', playheadCol);
          panel.__gridState.steps[playheadCol] = true; // Set to true, don't toggle
          console.log('Grid state after activation:', panel.__gridState.steps);
        } else {
          console.log('Did not activate cube. playheadCol:', playheadCol, 'gridState:', panel?.__gridState);
        }

        try {
          panel.dispatchEvent(new CustomEvent('loopgrid:tap', {
            bubbles: true
          }));
        } catch {}
      });
    }
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

  function layout(panel) {
    const pad = panel.querySelector('.loopgrid-drum-pad');
    if (!pad) return;
    
    const label = pad.querySelector('.drum-tap-label');
    if (label) {
      const scale = window.__boardScale || 1;
      label.style.fontSize = `${40 / scale}px`;
    }
  }

  function boot() {
    document.querySelectorAll(SEL).forEach(panel => {
      ensurePad(panel);
      layout(panel);
      updateLabelVisibility(panel);
      panel.addEventListener('loopgrid:update', () => {
        updateLabelVisibility(panel)
      });
    });

    window.addEventListener('board:scale', relayout);

    function checkRunningState() {
      document.querySelectorAll(SEL).forEach(updateLabelVisibility);
      requestAnimationFrame(checkRunningState);
    }
    checkRunningState();
  }

  function relayout() {
    document.querySelectorAll(SEL).forEach(layout);
  }

  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') boot();

}

