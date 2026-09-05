import { resizeCanvasForDpr } from './resizeCanvasForDpr.js';

// Call after initToyUI. CSS owns layout; the toy calls resize before drawing.
// Mark the canvas before mounting so the global manager never claims it.
export function mountToySurface(panel, canvas) {
  const body = panel.querySelector(':scope > .toy-body');
  if (!body) throw new Error('Initialize toy UI before mounting a surface');
  panel.dataset.toyLayout = 'square';
  canvas.dataset.skipAutoDpr = '1';
  canvas.classList.add('toy-surface-canvas');
  let host = body.querySelector(':scope > .toy-surface');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toy-surface';
    body.appendChild(host);
  }
  host.appendChild(canvas);
  function resize(ctx) {
    const width = host.clientWidth;
    const height = host.clientHeight;
    // Hidden/unmounted toys keep their backing store until layout is available.
    if (width <= 0 || height <= 0) return null;
    return resizeCanvasForDpr(canvas, ctx, width, height, { skipCssSync: true });
  }
  return { host, resize };
}
