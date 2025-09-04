// src/zoom-overlay.js
// Manages the "Advanced" view overlay.

let originalPanelState = null;

function ensureOverlay() {
  let overlay = document.getElementById('adv-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'adv-overlay';

    const backdrop = document.createElement('div');
    backdrop.className = 'adv-backdrop';
    backdrop.addEventListener('click', () => zoomOutPanel());

    const host = document.createElement('div');
    host.className = 'adv-host';

    overlay.append(backdrop, host);
    document.body.appendChild(overlay);
  }
  return overlay;
}

/**
 * Zooms in on a toy panel, moving it to the advanced view overlay.
 * @param {HTMLElement} panel The toy panel element to zoom.
 */
export function zoomInPanel(panel) {
  if (!panel || originalPanelState) return; // Already zoomed

  const overlay = ensureOverlay();
  const host = overlay.querySelector('.adv-host');

  // Store original position to restore it later
  originalPanelState = {
    parent: panel.parentElement,
    nextSibling: panel.nextElementSibling,
    originalClasses: panel.className,
    originalStyle: {
      left: panel.style.left,
      top: panel.style.top,
      width: panel.style.width,
      height: panel.style.height,
    },
    // Capture the current visual aspect ratio so Advanced view can preserve it
    aspect: (function(){
      try {
        const r = panel.getBoundingClientRect();
        const ar = (r && r.height > 1) ? (r.width / r.height) : 1;
        return Math.max(0.25, Math.min(4, ar));
      } catch { return 1; }
    })()
  };

  // Set the host height with a 10% margin top/bottom.
  host.style.height = '80vh';
  host.style.maxHeight = '80vh';

  // Move panel to the overlay
  host.appendChild(panel);
  // Clear inline positioning so it centers correctly in the host.
  panel.style.left = 'auto';
  panel.style.top = 'auto';
  panel.style.width = '';
  panel.style.height = '';
  panel.classList.add('toy-zoomed');
  overlay.classList.add('open');

  panel.dispatchEvent(new CustomEvent('toy-zoom', { detail: { zoomed: true }, bubbles: true }));

  // Size the zoomed panel to preserve its original aspect ratio
  function sizeZoomed(){
    try {
      const ar = (originalPanelState && originalPanelState.aspect) ? originalPanelState.aspect : 1;
      const hostH = host.clientHeight || (window.innerHeight * 0.8);
      const maxW = Math.max(1, Math.round(window.innerWidth * 0.95));
      const wFromH = Math.max(1, Math.round(hostH * ar));
      const w = Math.min(maxW, wFromH);
      const h = Math.max(1, Math.round(w / ar));
      panel.style.width = w + 'px';
      panel.style.height = h + 'px';
    } catch {}
  }
  requestAnimationFrame(sizeZoomed);
  window.addEventListener('resize', sizeZoomed);
  // Keep a reference so we can remove on zoom out
  originalPanelState._onResize = sizeZoomed;
}

/**
 * Closes the advanced view and restores the toy panel to its original position.
 */
export function zoomOutPanel() {
  const overlay = document.getElementById('adv-overlay');
  if (!overlay || !originalPanelState) return;

  const host = overlay.querySelector('.adv-host');
  const panel = host.querySelector('.toy-panel');

  if (panel) {
    // Restore original classes and remove the zoomed class
    panel.className = originalPanelState.originalClasses;
    panel.classList.remove('toy-zoomed');

    // Restore original inline styles
    panel.style.left = originalPanelState.originalStyle.left;
    panel.style.top = originalPanelState.originalStyle.top;
    panel.style.width = originalPanelState.originalStyle.width;
    panel.style.height = originalPanelState.originalStyle.height;

    // Move panel back to its original place in the DOM
    if (originalPanelState.nextSibling) {
      originalPanelState.parent.insertBefore(panel, originalPanelState.nextSibling);
    } else {
      originalPanelState.parent.appendChild(panel);
    }
    // Remove sizing listener
    if (originalPanelState._onResize) {
      try { window.removeEventListener('resize', originalPanelState._onResize); } catch {}
    }
    panel.dispatchEvent(new CustomEvent('toy-zoom', { detail: { zoomed: false }, bubbles: true }));
  }

  // Reset host styles
  host.style.height = '';
  host.style.maxHeight = '';

  overlay.classList.remove('open');
  originalPanelState = null;
}

// Expose to global scope for button delegates
window.zoomInPanel = zoomInPanel;
window.zoomOutPanel = zoomOutPanel;
