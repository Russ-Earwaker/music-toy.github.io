const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
export function transposeNote(note, semitones = 0) {
  const offset = Math.trunc(Number(semitones) || 0);
  if (!offset) return note;
  if (typeof note === 'number' && Number.isFinite(note)) return note + offset;
  const match = /^([A-G])([#b]?)(-?\d+)$/i.exec(String(note).trim());
  if (!match) return note;
  const natural = {C:0,D:2,E:4,F:5,G:7,A:9,B:11}[match[1].toUpperCase()];
  const midi = (Number(match[3]) + 1) * 12 + natural + (match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0) + offset;
  return names[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}
export function isPitchedEvent(instrument, entry, options = {}, occurrence = null) {
  if (occurrence?.pitched === false || options.pitched === false) return false;
  if (options.pitched === true || options.pitchShift === true) return true;
  if (entry?.unpitched != null) return !entry.unpitched;
  return !/(^|[ _-])(drum|kick|snare|clap|snap|hi[ -]?hat|hihat|djembe|djimbe|tamborine|tambourine|shaker|cowbell|cymbal|side[ _-]?stick)([ _-]|$)/i.test(String(instrument));
}
