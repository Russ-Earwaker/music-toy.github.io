// Tap dots overlay: show a denser white grid around a tap point, aligned to the main grid.

(() => {
  const board = document.getElementById('board');
  const viewport = document.querySelector('.board-viewport');
  if (!board || !viewport) return;

  let overlay = board.querySelector('.board-tap-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'board-tap-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    board.appendChild(overlay);
  }

  const DEBUG = false;
  const FORCE_DEBUG_VIS = false;
  const HANG_MS = 200;
  let hideTimer = 0;

  const style = getComputedStyle(board);
  const boardW = board.offsetWidth || 8000;
  const boardH = board.offsetHeight || 8000;
  const baseSpacing = parseFloat(style.getPropertyValue('--board-grid-spacing')) || 90;
  const baseTapSpacing = parseFloat(style.getPropertyValue('--board-tap-spacing')) || (baseSpacing / 6);
  const tapRadius = baseSpacing * 1.5;
  const tapOffset = 0;

  function resetOverlay() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = 0;
    }
    overlay.classList.remove('is-active');
    overlay.style.setProperty('--tap-x', '-9999px');
    overlay.style.setProperty('--tap-y', '-9999px');
    overlay.style.setProperty('--tap-radius', '0px');
    overlay.style.removeProperty('--board-tap-bg-pos');
    overlay.style.removeProperty('--tap-dyn-spacing');
    if (DEBUG) console.debug('[tap-dots] reset');
  }

  function clientToBoardPoint(e) {
    const rect = board.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / (rect.width || 1);
    const fy = (e.clientY - rect.top) / (rect.height || 1);
    const x = fx * boardW;
    const y = fy * boardH;
    return { x, y };
  }

  function handlePointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!e.isPrimary) return;
    if (e.target.closest('.toy-panel, button, a, input, select, textarea')) return;

    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = 0;
    }

    const { x, y } = clientToBoardPoint(e);
    if (DEBUG) console.debug('[tap-dots] down', { clientX: e.clientX, clientY: e.clientY, x, y, tapRadius });

    const zoomScale = parseFloat(getComputedStyle(board).getPropertyValue('--zoom-scale')) || 1;
    const radiusBoardUnits = tapRadius / zoomScale; // keep screen radius constant
    const quantizedScale = Math.pow(2, Math.round(Math.log2(Math.max(zoomScale, 0.01))));
    const tapSpacing = baseTapSpacing / quantizedScale; // zoom in => denser, zoom out => sparser

    overlay.style.setProperty('--tap-x', `${x}px`);
    overlay.style.setProperty('--tap-y', `${y}px`);
    overlay.style.setProperty('--tap-radius', `${radiusBoardUnits}px`);
    overlay.style.setProperty('--tap-dyn-spacing', `${tapSpacing}px`);
    overlay.classList.add('is-active');

    window.addEventListener('pointerup', handlePointerUp, { once: true, capture: true });
    window.addEventListener('pointercancel', handlePointerUp, { once: true, capture: true });
  }

  function handlePointerUp() {
    if (DEBUG) console.debug('[tap-dots] up');
    hideTimer = setTimeout(() => {
      resetOverlay();
    }, HANG_MS);
  }

  resetOverlay();
  viewport.addEventListener('pointerdown', handlePointerDown, { passive: true });
  overlay.classList.remove('tap-dots-debug');
  if (DEBUG) console.debug('[tap-dots] ready');
})();
