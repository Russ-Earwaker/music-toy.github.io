// src/baseMusicToy/waitForStableBox.js
// Wait until an element reports a stable, non-zero bounding box.
// Useful during init/zoom transitions where layout may be 0x0 or oscillating.

function raf() {
  return new Promise(r => requestAnimationFrame(r));
}

/**
 * Wait until the element has a stable, non-zero size.
 * Tries up to maxFrames; bails early when width/height stop changing.
 */
export async function waitForStableBox(el, { maxFrames = 6 } = {}) {
  if (!el || typeof el.getBoundingClientRect !== 'function') {
    return { width: 0, height: 0 };
  }

  let lastW = -1, lastH = -1;
  for (let i = 0; i < maxFrames; i++) {
    await raf(); // let layout/zoom settle this frame
    const rect = el.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (w > 0 && h > 0 && w === lastW && h === lastH) {
      return { width: w, height: h };
    }
    lastW = w;
    lastH = h;
  }

  // final read (whatever it is)
  const rect = el.getBoundingClientRect();
  return { width: Math.round(rect.width), height: Math.round(rect.height) };
}

