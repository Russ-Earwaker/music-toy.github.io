import { initToyUI } from './toyui.js';
import { createDrawGrid } from './drawgrid.js';
import { connectDrawGridToPlayer } from './drawgrid-player.js';

export function spawnTutorialToy(lockTutorialControls, setupPanelListeners) {
    /* << REFACTORED_VIEWPORT_RESET START >> */
    // Reset the main board pan/zoom so header and goals are on-screen.
    // This now uses the viewport API directly and relies on __tutorialZoomLock
    // to prevent user interaction, which is handled by board-viewport.js.
    try {
      // Clear any saved viewport so the board-viewport module doesn't restore an odd state
      localStorage.setItem('boardViewport', JSON.stringify({ scale: 1, x: 0, y: 0 }));
      if (typeof window.setBoardScale === 'function') window.setBoardScale(1);
      if (typeof window.panTo === 'function') window.panTo(0, 0);
    } catch (e) { /* no-op */ }
    /* << REFACTORED_VIEWPORT_RESET END >> */
        const factory = window && window.MusicToyFactory;
        const board = document.getElementById('board');
        const boardRect = board.getBoundingClientRect();
        const logicalWidth = board.offsetWidth || boardRect.width || window.innerWidth || 1280;
        const logicalHeight = board.offsetHeight || boardRect.height || window.innerHeight || 720;
        const centerX = logicalWidth / 2;
        const centerY = Math.min(logicalHeight / 2, logicalHeight - 240);

        console.log({ logicalWidth, centerX });

        let panel = null;
        let tutorialFromFactory = false;

        if (factory && typeof factory.create === 'function') {
          try {
            panel = factory.create('drawgrid', { centerX, centerY, instrument: 'AcousticGuitar' });
            tutorialFromFactory = !!panel;
          } catch (err) {
            console.warn('[tutorial] factory create failed, falling back', err);
            panel = null;
            tutorialFromFactory = false;
          }
        }

        if (!panel) {
          panel = document.createElement('section');
          panel.id = 'tutorial-drawgrid';
          panel.className = 'toy-panel';
          panel.dataset.toy = 'drawgrid';
          panel.dataset.instrument = 'AcousticGuitar';
          panel.dataset.instrumentPersisted = '1';
          panel.dataset.tutorial = 'true';
          panel.classList.add('tutorial-panel');
          board.appendChild(panel);
          initToyUI(panel, { toyName: 'DrawGrid Tutorial' });
          createDrawGrid(panel, { toyId: panel.id });
          connectDrawGridToPlayer(panel);
        }
        if (!panel.dataset.tutorial) panel.dataset.tutorial = 'true';
        panel.classList.add('tutorial-panel');
        panel.style.zIndex = '60';

        lockTutorialControls(panel);
        setupPanelListeners(panel);
        return { panel, tutorialFromFactory };
}
