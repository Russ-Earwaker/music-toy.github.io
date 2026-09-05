// One owner for per-toy frames, listeners and observer cleanup.
const lifecycles = new WeakMap();

export function getToyLifecycle(panel) {
  if (lifecycles.has(panel)) return lifecycles.get(panel);
  let disposed = false;
  let wasConnected = panel.isConnected;
  const frames = new Map();
  const cleanups = new Set();

  function addCleanup(cleanup) {
    if (disposed) cleanup();
    else cleanups.add(cleanup);
    return cleanup;
  }

  function listen(target, type, callback, options) {
    if (disposed) return;
    target.addEventListener(type, callback, options);
    addCleanup(() => target.removeEventListener(type, callback, options));
  }

  function requestFrame(callback) {
    if (disposed || frames.has(callback)) return;
    const id = requestAnimationFrame((time) => {
      frames.delete(callback);
      if (disposed) return;
      if (!panel.isConnected) {
        if (wasConnected) dispose();
        else requestFrame(callback); // Allow mounting before the first frame.
        return;
      }
      wasConnected = true;
      callback(time);
    });
    frames.set(callback, id);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const id of frames.values()) cancelAnimationFrame(id);
    frames.clear();
    for (const cleanup of cleanups) {
      try { cleanup(); } catch (error) { console.warn('[toy cleanup]', error); }
    }
    cleanups.clear();
  }

  const lifecycle = { listen, requestFrame, addCleanup, dispose, get disposed() { return disposed; } };
  lifecycles.set(panel, lifecycle);
  // Ignore removal events bubbling from a nested toy.
  const onRemove = (event) => { if (event.target === panel) dispose(); };
  listen(panel, 'toy-remove', onRemove);
  listen(panel, 'toy:remove', onRemove);
  return lifecycle;
}
