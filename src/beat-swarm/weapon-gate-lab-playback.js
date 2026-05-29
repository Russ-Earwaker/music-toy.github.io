import { triggerInstrument } from '../audio-samples.js';

const DEFAULT_BPM = 136;

function getAudioTime() {
  try {
    const ctx = window.__audioCtx || window.audioContext || null;
    if (ctx && Number.isFinite(ctx.currentTime)) return ctx.currentTime;
  } catch {}
  return undefined;
}

export function createWeaponGateLoopPlayer(options = {}) {
  const bpm = Math.max(40, Math.min(240, Number(options.bpm) || DEFAULT_BPM));
  const stepMs = (60000 / bpm) / 2;
  let timer = 0;
  let step = 0;
  let sequence = [];

  function stop() {
    if (timer) clearInterval(timer);
    timer = 0;
  }

  function start(nextSequence) {
    stop();
    sequence = Array.isArray(nextSequence) ? nextSequence.slice(0, 16) : [];
    step = 0;
    if (!sequence.length) return;
    const tick = () => {
      const sel = sequence[step % sequence.length];
      if (sel?.kind === 'note' && sel.note) {
        try {
          triggerInstrument('retro square', sel.note, getAudioTime(), 'weapon-gate-lab-loop', { source: 'weapon-gate-loop', step }, 0.72);
        } catch {}
      }
      step += 1;
    };
    tick();
    timer = setInterval(tick, stepMs);
  }

  return Object.freeze({ start, stop });
}
