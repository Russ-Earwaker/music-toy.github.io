// Lightweight helpers to keep verbose logs behind a single toggle.
// Enable by setting either:
// - window.MT_DEBUG_FLAGS = { mt_debug_logs: true } (preferred for quick toggles), or
// - localStorage.setItem('mt_debug_logs', '1')

export function debugEnabled(flag = 'mt_debug_logs') {
  try {
    const root = typeof window !== 'undefined' ? window : globalThis;
    const overrides = root?.MT_DEBUG_FLAGS;
    if (overrides && Object.prototype.hasOwnProperty.call(overrides, flag)) {
      return !!overrides[flag];
    }
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(flag);
      if (raw === '1' || raw === 'true') return true;
    }
  } catch {
    // fall through to disabled
  }
  return false;
}

export function makeDebugLogger(flag = 'mt_debug_logs', level = 'debug') {
  return (...args) => {
    if (!debugEnabled(flag)) return;
    try {
      const fn = console[level] || console.debug || console.log;
      fn(...args);
    } catch {
      // swallow logging errors to avoid side effects
    }
  };
}
