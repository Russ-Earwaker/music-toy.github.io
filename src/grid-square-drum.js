// grid-square-drum.js
// Non-destructive overlay for the existing Grid toy.
// - Tries to make the canvas appear square (CSS aspect-ratio + height sync)
// - Adds a Drum Pad at the lower portion of the square
// - On tap, emits CustomEvent('grid:drum-tap', { detail: { toyId, playheadX } })
//   and, if available, calls window.gridActivateNearest(toyId)
// File length kept under 300 lines.

(function () {
  const LOG = (...a) => console.log('[grid-square-drum]', ...a);

  function ensureSquareCanvas(panel) {
    const canvas = panel.querySelector('canvas');
    if (!canvas) { LOG('no canvas found'); return null; }

    // Make it visually square. Also keep the internal buffer height synced to width for crisp draws.
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    canvas.style.aspectRatio = '1 / 1';
    canvas.style.display = 'block';

    // Sync canvas.height attribute to clientWidth to keep square pixels if your grid code redraws often.
    const ro = new ResizeObserver(() => {
      const w = Math.max(64, Math.round(canvas.clientWidth));
      if (canvas.height !== w) {
        canvas.height = w;
        // leave canvas.width to your grid code if it sets it; otherwise keep it proportional
        if (!canvas.hasAttribute('width')) canvas.width = w;
        panel.dispatchEvent(new CustomEvent('grid:square-resized', { detail: { w } }));
      }
    });
    ro.observe(canvas);

    // Create an overlay layer matching canvas box for the Drum Pad
    let overlay = panel.querySelector('.grid-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'grid-overlay';
      Object.assign(overlay.style, {
        position: 'relative',
        width: '100%',
        aspectRatio: '1 / 1',
        marginTop: '6px',
      });
      canvas.parentElement.insertBefore(overlay, canvas.nextSibling);
    }
    return { canvas, overlay };
  }

  function addDrumPad(panel, overlay, toyId) {
    let pad = overlay.querySelector('.grid-drum-pad');
    if (!pad) {
      pad = document.createElement('div');
      pad.className = 'grid-drum-pad';
      Object.assign(pad.style, {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: '22%',
        cursor: 'pointer',
        userSelect: 'none',
        outline: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderTop: '1px solid rgba(255,255,255,0.15)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.08))',
        backdropFilter: 'blur(2px)',
      });
      const label = document.createElement('div');
      label.textContent = 'DRUM';
      Object.assign(label.style, {
        fontSize: '0.9rem',
        letterSpacing: '0.2em',
        opacity: 0.8,
      });
      pad.appendChild(label);
      overlay.appendChild(pad);
    }

    const onTap = () => {
      const playheadX = window.gridPlayheadX?.(toyId) ?? null;
      panel.dispatchEvent(new CustomEvent('grid:drum-tap', { detail: { toyId, playheadX } }));
      if (typeof window.gridActivateNearest === 'function') {
        try { window.gridActivateNearest(toyId); } catch (e) { LOG('gridActivateNearest error', e); }
      }
      // Quick visual flash
      pad.animate([{ opacity: 1 }, { opacity: 0.6 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
    };

    pad.addEventListener('pointerdown', onTap);
  }

  function attach(panel) {
    const toyId = panel?.dataset?.toyId || panel?.id || 'grid';
    const parts = ensureSquareCanvas(panel);
    if (!parts) return;
    addDrumPad(panel, parts.overlay, toyId);
    LOG('attached', { toyId });
  }

  // Public attach helper
  window.attachGridSquareAndDrum = function (selectorOrEl) {
    if (selectorOrEl instanceof Element) { attach(selectorOrEl); return; }
    const panels = document.querySelectorAll(selectorOrEl || '.toy-panel[data-toy="grid"]');
    panels.forEach(attach);
  };

  // Auto-attach on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', () => {
    const candidates = document.querySelectorAll('.toy-panel[data-toy="grid"], section[id^="grid"]');
    candidates.forEach(attach);
  });
})();
