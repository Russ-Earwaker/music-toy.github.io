// src/layout-cache.js
// Per-frame DOM rect cache to avoid repeated layout reads in hot paths.

let currentFrameId = 0;
let rectCache = new WeakMap();
let frameLoopStarted = false;

function startFrameLoop() {
  if (frameLoopStarted) return;
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return;
  frameLoopStarted = true;
  const tick = () => {
    currentFrameId += 1;
    window.requestAnimationFrame(tick);
  };
  window.requestAnimationFrame(tick);
}

export function beginFrameLayoutCache(frameId) {
  startFrameLoop();
  if (Number.isFinite(frameId)) {
    currentFrameId = frameId;
    return currentFrameId;
  }
  currentFrameId += 1;
  return currentFrameId;
}

export function getRect(el) {
  startFrameLoop();
  if (!el || typeof el.getBoundingClientRect !== 'function') return null;
  const cached = rectCache.get(el);
  if (cached && cached.frameId === currentFrameId) return cached.rect;
  const rect = el.getBoundingClientRect();
  rectCache.set(el, { frameId: currentFrameId, rect });
  return rect;
}

export function invalidateRect(el) {
  if (!el) return;
  rectCache.delete(el);
}

export function invalidateAllRects() {
  rectCache = new WeakMap();
}
