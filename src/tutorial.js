import { initToyUI } from './toyui.js';
import { createDrawGrid } from './drawgrid.js';
import { connectDrawGridToPlayer } from './drawgrid-player.js';
import { getSnapshot, applySnapshot } from './persistence.js';

(function() {
  const tutorialButton = document.querySelector('[data-action="tutorial"]');
  const board = document.getElementById('board');
  if (!tutorialButton || !board) return;

  let tutorialActive = false;
  let tutorialToy = null;
  let tutorialFromFactory = false;
  let previousSnapshot = null;
  let previousFocus = null;
  let storedScroll = { x: 0, y: 0 };

  const defaultLabel = tutorialButton.textContent?.trim() || 'Tutorial';

  function updateButtonVisual() {
    tutorialButton.textContent = tutorialActive ? 'Exit Tutorial' : defaultLabel;
    tutorialButton.setAttribute('aria-pressed', tutorialActive ? 'true' : 'false');
  }

  function hideOriginalToys() {
    board.querySelectorAll('.toy-panel').forEach(panel => {
      if (panel.classList.contains('tutorial-panel')) return;
      panel.classList.add('tutorial-hidden');
      panel.setAttribute('aria-hidden', 'true');
    });
  }

  function showOriginalToys() {
    board.querySelectorAll('.toy-panel').forEach(panel => {
      panel.classList.remove('tutorial-hidden');
      panel.removeAttribute('aria-hidden');
    });
  }

  function spawnTutorialToy() {
    const factory = window?.MusicToyFactory;
    const boardRect = board.getBoundingClientRect();
    const logicalWidth = board.offsetWidth || boardRect.width || window.innerWidth || 1280;
    const logicalHeight = board.offsetHeight || boardRect.height || window.innerHeight || 720;
    const centerX = logicalWidth / 2;
    const centerY = Math.min(logicalHeight / 2, logicalHeight - 240);

    let panel = null;
    tutorialFromFactory = false;

    if (factory && typeof factory.create === 'function') {
      try {
        panel = factory.create('drawgrid', {
          centerX,
          centerY,
          instrument: 'AcousticGuitar',
        });
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
      board.appendChild(panel);
      initToyUI(panel, { toyName: 'DrawGrid Tutorial' });
      const drawToy = createDrawGrid(panel, { toyId: panel.id });
      connectDrawGridToPlayer(panel);
      try { panel.__drawgridInit = true; panel.__drawToy = drawToy; } catch {}
      try { panel.dispatchEvent(new CustomEvent('toy-clear', { bubbles: true })); } catch {}
    }

    panel.classList.add('tutorial-panel');
    panel.dataset.tutorial = 'true';
    panel.style.zIndex = '60';

    requestAnimationFrame(() => {
      if (!panel.isConnected) return;
      const width = panel.offsetWidth || 0;
      const height = panel.offsetHeight || 0;
      const boardWidth = board.offsetWidth || logicalWidth;
      const boardHeight = board.offsetHeight || logicalHeight;
      const left = Math.max(16, Math.round((boardWidth - width) / 2));
      const top = Math.max(72, Math.round(Math.min((boardHeight - height) / 2, boardHeight - height - 32)));
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    });

    return panel;
  }

  function enterTutorial() {
    if (tutorialActive) return;
    tutorialActive = true;

    updateButtonVisual();

    previousSnapshot = null;
    try {
      previousSnapshot = typeof getSnapshot === 'function' ? getSnapshot() : null;
    } catch (err) {
      console.warn('[tutorial] snapshot capture failed', err);
    }

    storedScroll = { x: window.scrollX || 0, y: window.scrollY || 0 };
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    document.body.classList.add('tutorial-active');

    hideOriginalToys();

    tutorialToy = spawnTutorialToy();

    if (tutorialToy) {
      tutorialToy.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function exitTutorial() {
    if (!tutorialActive) return;
    tutorialActive = false;

    updateButtonVisual();

    if (tutorialToy) {
      if (tutorialFromFactory && window?.MusicToyFactory?.destroy) {
        try {
          window.MusicToyFactory.destroy(tutorialToy);
        } catch (err) {
          console.warn('[tutorial] factory destroy failed', err);
          tutorialToy.remove();
        }
      } else {
        tutorialToy.remove();
      }
    }
    tutorialToy = null;
    tutorialFromFactory = false;

    showOriginalToys();
    document.body.classList.remove('tutorial-active');

    if (previousSnapshot && typeof applySnapshot === 'function') {
      try {
        applySnapshot(previousSnapshot);
      } catch (err) {
        console.warn('[tutorial] failed to restore scene', err);
      }
    }

    window.scrollTo({ left: storedScroll.x, top: storedScroll.y, behavior: 'auto' });

    if (previousFocus) {
      try {
        previousFocus.focus({ preventScroll: true });
      } catch {}
      previousFocus = null;
    }

    previousSnapshot = null;
  }

  tutorialButton.addEventListener('click', () => {
    if (tutorialActive) exitTutorial();
    else enterTutorial();
  });

  updateButtonVisual();
})();

