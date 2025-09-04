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
  };

  // Set the host height to be taller, with a 10% margin top/bottom.
  host.style.height = '80vh';
  host.style.maxHeight = '80vh';

  // Move panel to the overlay
  host.appendChild(panel);
  // Clear inline positioning so it centers correctly in the host.
  panel.style.left = 'auto';
  panel.style.top = 'auto';
  panel.style.width = '';
  // Make the panel fill the host's new height.
  panel.style.height = '100%';
  panel.classList.add('toy-zoomed');
  overlay.classList.add('open');

  panel.dispatchEvent(new CustomEvent('toy-zoom', { detail: { zoomed: true }, bubbles: true }));
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
