import { createViewportSpace } from './viewport-space.js';

function measureWindowRect(windowObj, documentObj) {
  const root = documentObj?.documentElement;
  return {
    left: 0,
    top: 0,
    width: Math.max(1, Number(root?.clientWidth) || Number(windowObj?.innerWidth) || 1),
    height: Math.max(1, Number(root?.clientHeight) || Number(windowObj?.innerHeight) || 1),
  };
}

export function measureDisplayRect(element, { windowObj = globalThis.window, documentObj = globalThis.document } = {}) {
  try {
    const rect = element?.getBoundingClientRect?.();
    if (rect && Number(rect.width) > 0 && Number(rect.height) > 0) {
      return {
        left: Number(rect.left) || 0,
        top: Number(rect.top) || 0,
        width: Number(rect.width),
        height: Number(rect.height),
      };
    }
  } catch {}
  return measureWindowRect(windowObj, documentObj);
}

export function createDomViewportSpace({
  element = null,
  logicalSize = 'display',
  getBackingScale = () => Number(globalThis.window?.devicePixelRatio) || 1,
  getSafeInsets = () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  windowObj = globalThis.window,
  documentObj = globalThis.document,
  ResizeObserverClass = globalThis.ResizeObserver,
} = {}) {
  let snapshot = null;
  let resizeObserver = null;
  let scheduledFrame = 0;
  const listeners = new Set();

  function resolveLogicalSize(displayRect) {
    const requested = typeof logicalSize === 'function' ? logicalSize(displayRect) : logicalSize;
    if (!requested || requested === 'display') {
      return { width: displayRect.width, height: displayRect.height };
    }
    return {
      width: Math.max(1, Number(requested.width) || displayRect.width),
      height: Math.max(1, Number(requested.height) || displayRect.height),
    };
  }

  function update() {
    const displayRect = measureDisplayRect(element, { windowObj, documentObj });
    const logical = resolveLogicalSize(displayRect);
    snapshot = createViewportSpace({
      logicalWidth: logical.width,
      logicalHeight: logical.height,
      displayRect,
      backingScale: getBackingScale?.() ?? 1,
      safeInsets: getSafeInsets?.() ?? null,
    });
    for (const listener of listeners) listener(snapshot);
    return snapshot;
  }

  function requestUpdate() {
    if (scheduledFrame) return;
    const requestFrame = windowObj?.requestAnimationFrame?.bind(windowObj) || ((fn) => setTimeout(fn, 0));
    scheduledFrame = requestFrame(() => {
      scheduledFrame = 0;
      update();
    });
  }

  function start() {
    update();
    windowObj?.addEventListener?.('resize', requestUpdate, { passive: true });
    windowObj?.visualViewport?.addEventListener?.('resize', requestUpdate, { passive: true });
    if (element && typeof ResizeObserverClass === 'function') {
      resizeObserver = new ResizeObserverClass(requestUpdate);
      resizeObserver.observe(element);
    }
    return snapshot;
  }

  function stop() {
    windowObj?.removeEventListener?.('resize', requestUpdate);
    windowObj?.visualViewport?.removeEventListener?.('resize', requestUpdate);
    resizeObserver?.disconnect?.();
    resizeObserver = null;
    if (scheduledFrame) {
      const cancelFrame = windowObj?.cancelAnimationFrame?.bind(windowObj) || clearTimeout;
      cancelFrame(scheduledFrame);
      scheduledFrame = 0;
    }
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    if (snapshot) listener(snapshot);
    return () => listeners.delete(listener);
  }

  return Object.freeze({
    start,
    stop,
    update,
    subscribe,
    getSnapshot: () => snapshot,
  });
}

