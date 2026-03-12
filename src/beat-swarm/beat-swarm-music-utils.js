import { midiToName } from '../note-helpers.js';

export function normalizeSwarmNoteName(noteName) {
  const s = String(noteName || '').trim().toUpperCase();
  const m = /^([A-G])([#B]?)(-?\d+)$/.exec(s);
  if (!m) return '';
  const letter = m[1];
  const accidental = (m[2] || '').replace('B', 'b');
  const octave = m[3];
  return `${letter}${accidental}${octave}`;
}

export function noteNameToMidi(noteName) {
  const normalized = normalizeSwarmNoteName(noteName);
  const m = /^([A-G])([#b]?)(-?\d+)$/.exec(normalized);
  if (!m) return null;
  const base = m[1];
  const accidental = m[2] || '';
  const octave = Math.trunc(Number(m[3]) || 0);
  const semitoneBase = (
    base === 'C' ? 0
      : base === 'D' ? 2
        : base === 'E' ? 4
          : base === 'F' ? 5
            : base === 'G' ? 7
              : base === 'A' ? 9
                : 11
  );
  const accidentalDelta = accidental === '#' ? 1 : (accidental === 'b' ? -1 : 0);
  return ((octave + 1) * 12) + semitoneBase + accidentalDelta;
}

export function transposeSwarmNoteName(noteName, semitoneDelta = 0) {
  const midi = noteNameToMidi(noteName);
  if (!Number.isFinite(midi)) return normalizeSwarmNoteName(noteName) || '';
  const shifted = Math.max(0, Math.min(127, Math.trunc(Number(midi) + Number(semitoneDelta || 0))));
  return normalizeSwarmNoteName(midiToName(shifted)) || normalizeSwarmNoteName(noteName) || '';
}

export function normalizeInstrumentIdToken(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

export function normalizeEnemyDeathFamily(family, fallback = 'medium') {
  const raw = String(family || '').trim().toLowerCase();
  if (raw === 'small' || raw === 'medium' || raw === 'large') return raw;
  return String(fallback || 'medium').trim().toLowerCase() === 'small'
    ? 'small'
    : (String(fallback || 'medium').trim().toLowerCase() === 'large' ? 'large' : 'medium');
}

export function classifyEnemyDeathFamily(enemyLike) {
  const enemy = enemyLike && typeof enemyLike === 'object' ? enemyLike : null;
  const enemyType = String(enemy?.enemyType || '').trim().toLowerCase();
  if (enemyType === 'spawner') return 'large';
  if (enemyType === 'drawsnake') return 'medium';
  if (enemyType === 'composer-group-member') return 'small';
  const hp = Math.max(0, Number(enemy?.maxHp) || Number(enemy?.hp) || 0);
  if (hp >= 12) return 'large';
  if (hp >= 5) return 'medium';
  return 'small';
}
