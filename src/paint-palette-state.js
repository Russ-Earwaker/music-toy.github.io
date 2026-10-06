import { supportsToyInstrument, applyToyInstrument } from './instrument-state.js';

export const PALETTE_KEY = 'rhythmake:paint-slots';
// Store exact catalogue/audio IDs. The colour mapping normalizes independently.
export const DEFAULT_PAINT_SLOTS = Object.freeze(['PIANO', 'KALIMBA', 'SYNTH PLUCK LEAD SHORT', 'BELL', 'DRUM KICK', 'HI-HAT CLOSED']);
const LEGACY_DEFAULT_IDS = Object.freeze({
 piano: 'PIANO', kalimba: 'KALIMBA', pluck: 'SYNTH PLUCK LEAD SHORT',
 bell: 'BELL', 'drum kick': 'DRUM KICK', 'hi hat closed': 'HI-HAT CLOSED',
});
export const canonicalInstrument = id => String(id || '').trim().toLowerCase().replace(/[_-]+/g, ' ');

// Use the existing musical-content API where offered, otherwise the same event
// as the toy's main Randomise button. None of these paths chooses instruments.
export function randomisePaintToy(panel) {
 if (!supportsToyInstrument(panel?.dataset?.toy)) return false;
 if (typeof panel.__toyRandomMusic === 'function') panel.__toyRandomMusic();
 else panel.dispatchEvent(new CustomEvent('toy-random', { bubbles: true, composed: true }));
 return true;
}

export function createPaletteState({ storage = globalThis.localStorage, assign = applyToyInstrument, randomise = randomisePaintToy, onChange = () => {} } = {}) {
 let slots = [...DEFAULT_PAINT_SLOTS];
 try {
  const saved = JSON.parse(storage?.getItem(PALETTE_KEY) || 'null');
  if (Array.isArray(saved) && saved.length === 6) {
   slots = saved.map(id => typeof id === 'string' && id.trim() ? (Object.hasOwn(LEGACY_DEFAULT_IDS, id) ? LEGACY_DEFAULT_IDS[id] : id) : null);
   if (slots.some((id,index) => id !== saved[index])) storage?.setItem(PALETTE_KEY, JSON.stringify(slots));
  }
 } catch {}
 const state = { slots, activePaletteTool: null, activePaintSlot: null, lastPaintSlot: 0, strokeVisitedToyIds: new Set() };
 const persist = () => { try { storage?.setItem(PALETTE_KEY, JSON.stringify(slots)); } catch {} };
 const clear = () => { state.activePaletteTool = null; state.activePaintSlot = null; state.strokeVisitedToyIds.clear(); onChange(); };
 const selectSlot = index => {
  if (!slots[index]) return;
  if (state.activePaletteTool === 'instrument' && state.activePaintSlot === index) { clear(); return; }
  state.activePaletteTool = 'instrument'; state.activePaintSlot = index; state.lastPaintSlot = index; onChange();
 };
 const selectTool = tool => {
  if (!['randomise', 'eyedropper'].includes(tool)) return;
  if (state.activePaletteTool === tool) { clear(); return; }
  state.activePaletteTool = tool; state.activePaintSlot = null; onChange();
 };
 const configure = (index, id) => {
  if (!Number.isInteger(index) || index < 0 || index >= 6) return;
  slots[index] = typeof id === 'string' && id.trim() ? id : null;
  if (state.activePaintSlot === index && !slots[index]) clear();
  persist(); onChange();
 };
 const paint = panel => {
  if (!state.activePaletteTool || !supportsToyInstrument(panel?.dataset?.toy)) return false;
  const key = panel.id || panel.dataset.toyid || panel;
  if (state.strokeVisitedToyIds.has(key)) return false;
  state.strokeVisitedToyIds.add(key);
  if (state.activePaletteTool === 'eyedropper') {
   const instrument = panel.dataset.instrument;
   if (!instrument) return false;
   let index = slots.findIndex(id => id && canonicalInstrument(id) === canonicalInstrument(instrument));
   if (index < 0) {
    index = slots.findIndex(id => !id);
    if (index < 0) index = state.lastPaintSlot;
    configure(index, instrument);
   }
   state.activePaletteTool = 'instrument'; state.activePaintSlot = index; state.lastPaintSlot = index; onChange();
   return true;
  }
  if (state.activePaletteTool === 'randomise') return randomise(panel);
  return assign(panel, slots[state.activePaintSlot]);
 };
 return { state, clear, selectSlot, selectTool, configure, paint, beginStroke: () => state.strokeVisitedToyIds.clear(), endStroke: () => state.strokeVisitedToyIds.clear() };
}

// Exact segment/rectangle intersection catches small toys between pointer samples.
export function segmentHitsRect(a, b, rect) {
 let lo = 0, hi = 1;
 for (const [start, delta, min, max] of [[a.x, b.x-a.x, rect.left, rect.right], [a.y, b.y-a.y, rect.top, rect.bottom]]) {
  if (!delta) { if (start < min || start > max) return false; continue; }
  const t1 = (min-start)/delta, t2 = (max-start)/delta;
  lo = Math.max(lo, Math.min(t1,t2)); hi = Math.min(hi, Math.max(t1,t2));
  if (lo > hi) return false;
 }
 return true;
}
