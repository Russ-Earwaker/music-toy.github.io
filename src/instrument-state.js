// Sound ownership belongs to the musical toy, independently of graph ancestry.
export const MUSICAL_INSTRUMENT_TOYS = Object.freeze(['loopgrid', 'drawgrid', 'loopgrid-drum', 'chordwheel', 'bouncer', 'rippler']);
export const supportsToyInstrument = kind => MUSICAL_INSTRUMENT_TOYS.includes(kind);
const pitchKeys = ['instrumentNote', 'instrumentOctave', 'instrumentPitchShift'];
export function readToySoundState(panel) {
  const state = {};
  for (const key of ['instrument', ...pitchKeys]) if (panel?.dataset?.[key] != null) state[key] = panel.dataset[key];
  return state;
}
export function restoreToySoundState(panel, state = {}) {
  for (const key of ['instrument', ...pitchKeys]) if (state[key] != null) panel.dataset[key] = String(state[key]);
  if (state.instrumentPitchShift != null) panel.dataset.instrumentPitchShift = [true, 'true', '1', 1].includes(state.instrumentPitchShift) ? '1' : '0';
  if (state.instrument) panel.dataset.instrumentPersisted = '1';
}
export function applyToyInstrument(panel, choice) {
  if (!panel || !supportsToyInstrument(panel.dataset.toy)) return false;
  const detail = typeof choice === 'string' ? { value: choice } : { ...choice };
  if (!detail.value) return false;
  panel.dataset.instrument = detail.value;
  panel.dataset.instrumentPersisted = '1';
  if (detail.octave != null) panel.dataset.instrumentOctave = String(detail.octave);
  if (detail.pitchShift != null) panel.dataset.instrumentPitchShift = detail.pitchShift ? '1' : '0';
  if (Object.hasOwn(detail, 'note')) {
    if (detail.note) panel.dataset.instrumentNote = detail.note;
    else delete panel.dataset.instrumentNote;
  }
  panel.dispatchEvent(new CustomEvent('toy-instrument', { detail, bubbles: true, composed: true }));
  panel.dispatchEvent(new CustomEvent('toy:instrument', { detail: { ...detail, name: detail.value }, bubbles: true }));
  return true;
}
