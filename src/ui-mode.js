// A user preference, deliberately independent of project and transport models.
export const UI_MODE_KEY = 'prefs:ui-mode';
export function createUIMode({storage, apply = () => {}} = {}) {
  let mode = 'simple';
  try { if (storage?.getItem(UI_MODE_KEY) === 'advanced') mode = 'advanced'; } catch {}
  const listeners = new Set();
  return {
    get: () => mode,
    isSimple: () => mode === 'simple',
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    set(next) {
      if (!['simple', 'advanced'].includes(next) || next === mode) return;
      const previous = mode;
      mode = next;
      try { storage?.setItem(UI_MODE_KEY, mode); } catch {}
      apply(mode);
      for (const fn of listeners) fn(mode, previous);
    },
  };
}
let storage;
try { storage = globalThis.localStorage; } catch {}
const apply = mode => { if (globalThis.document?.documentElement) document.documentElement.dataset.uiMode = mode; };
export const uiMode = createUIMode({storage, apply});
apply(uiMode.get());
