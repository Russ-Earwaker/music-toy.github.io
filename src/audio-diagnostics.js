// src/audio-diagnostics.js
import { ensureAudioContext } from './audio-core.js';

const AUDIO_DIAG_DEBUG = false;

function logState(where) {
  if (!AUDIO_DIAG_DEBUG) return;
  try {
    const ctx = ensureAudioContext();
    console.info('[audio]', where, 'state=', ctx.state, 'currentTime=', ctx.currentTime.toFixed(3));
  } catch {}
}

export function installAudioDiagnostics() {
  const btn = document.querySelector('#topbar [data-action="toggle-play"]');
  if (btn && !btn.__diag) {
    btn.__diag = true;
    btn.addEventListener('click', () => logState('after toggle-play click'), { capture: true });
  }
  document.addEventListener('visibilitychange', () => logState('visibilitychange'), { passive: true });
  window.addEventListener('pageshow', () => logState('pageshow'), { passive: true });
  logState('boot');
}
