// Authored harmony policy: it consumes transport ticks, never advances a clock.
export const CHORD_ROOTS = Object.freeze(['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']);
export const CHORD_STEP_TICKS = Object.freeze([96,192,384,768]);
export const DEFAULT_CHORDS = Object.freeze([{root:'C',quality:'major'},{root:'A',quality:'minor'},{root:'F',quality:'major'},{root:'G',quality:'major'}].map(Object.freeze));
export function normalizeChords(chords = DEFAULT_CHORDS) {
  const source = Array.isArray(chords) && chords.length ? chords : DEFAULT_CHORDS;
  return Object.freeze(source.slice(0,8).map(chord => Object.freeze({
    root:CHORD_ROOTS.includes(chord?.root)?chord.root:'C',
    quality:chord?.quality==='minor'?'minor':'major'
  })));
}
export const normalizeChordStep = value => CHORD_STEP_TICKS.includes(Number(value)) ? Number(value) : 384;
export const chordLabel = chord => chord.root + (chord.quality==='minor'?'m':'');
export const progressionLabel = chords => chords.map(chordLabel).join(' | ');
export const chordStepLabel = ticks => ({96:'1 beat',192:'2 beats',384:'1 bar',768:'2 bars'}[ticks]);
export function resolveChordAtTick(context, tick) {
  const harmony = context?.harmony;
  if (!harmony || !Number.isFinite(Number(tick)) || Number(tick)<harmony.originTick) return null;
  const index = Math.floor((Number(tick)-harmony.originTick)/harmony.stepTicks)%harmony.chords.length;
  return harmony.chords[index] ?? null;
}
