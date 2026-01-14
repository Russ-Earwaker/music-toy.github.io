const PULSE_CLASS = 'toy-playing-pulse';
const DEFAULT_DURATION_MS = 320;
const REARM_DELAY_MS = 30;

const g_pulseUntil = new WeakMap(); // panel -> untilMs
const g_pulseRemoveTimer = new WeakMap(); // panel -> timeoutId
const g_pulseAddTimer = new WeakMap(); // panel -> timeoutId
const g_pulseRearmTimer = new WeakMap(); // panel -> timeoutId

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function clearTimer(map, panel) {
  const id = map.get(panel);
  if (!id) return;
  try { clearTimeout(id); } catch {}
  try { map.delete(panel); } catch {}
}

function schedulePulseAdd(panel, delayMs) {
  clearTimer(g_pulseAddTimer, panel);
  const id = setTimeout(() => {
    try { g_pulseAddTimer.delete(panel); } catch {}
    if (!panel?.isConnected) return;
    panel.classList.add(PULSE_CLASS);
  }, Math.max(0, delayMs));
  g_pulseAddTimer.set(panel, id);
}

function schedulePulseRearm(panel, delayMs) {
  clearTimer(g_pulseRearmTimer, panel);
  const id = setTimeout(() => {
    try { g_pulseRearmTimer.delete(panel); } catch {}
    if (!panel?.isConnected) return;
    panel.classList.remove(PULSE_CLASS);
  }, Math.max(0, delayMs));
  g_pulseRearmTimer.set(panel, id);
}

function schedulePulseRemove(panel, delayMs) {
  clearTimer(g_pulseRemoveTimer, panel);
  const id = setTimeout(() => {
    try { g_pulseRemoveTimer.delete(panel); } catch {}
    if (!panel?.isConnected) return;
    const until = g_pulseUntil.get(panel) || 0;
    const now = nowMs();
    if (now + 1 < until) {
      schedulePulseRemove(panel, until - now);
      return;
    }
    g_pulseUntil.delete(panel);
    panel.classList.remove(PULSE_CLASS);
  }, Math.max(0, delayMs));
  g_pulseRemoveTimer.set(panel, id);
}

export function requestPanelPulse(panel, opts = {}) {
  if (!panel?.isConnected) return;
  const durationMs = Number.isFinite(opts.durationMs) ? opts.durationMs : DEFAULT_DURATION_MS;
  const rearm = !!opts.rearm;
  const now = nowMs();
  const until = now + Math.max(0, durationMs);
  const prevUntil = g_pulseUntil.get(panel) || 0;
  if (until > prevUntil) g_pulseUntil.set(panel, until);

  if (rearm) {
    schedulePulseAdd(panel, REARM_DELAY_MS);
    schedulePulseRearm(panel, 0);
  } else {
    schedulePulseAdd(panel, 0);
  }

  schedulePulseRemove(panel, (g_pulseUntil.get(panel) || until) - now);
}

export function clearPanelPulse(panel, opts = {}) {
  if (!panel) return;
  clearTimer(g_pulseAddTimer, panel);
  clearTimer(g_pulseRemoveTimer, panel);
  clearTimer(g_pulseRearmTimer, panel);
  g_pulseUntil.delete(panel);
  const delayMs = Number.isFinite(opts.delayMs) ? opts.delayMs : 0;
  schedulePulseRemove(panel, delayMs);
}
