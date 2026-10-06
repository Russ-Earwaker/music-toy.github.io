// Frozen palette order: append new IDs; do not reorder existing assignments.
// Golden-angle hues keep neighbouring catalogue instruments far apart, with
// alternating lightness for secondary separation. No scene-dependent ordering.
export const INSTRUMENT_COLOUR_IDS = Object.freeze([
  "tone",
  "piano",
  "kalimba",
  "retro square",
  "retro saw",
  "retro triangle",
  "retro sine",
  "pluck",
  "pad",
  "bell",
  "punch 1",
  "punch 2",
  "punch 3",
  "punch 4",
  "drum side stick",
  "drum kick",
  "drum snare 1",
  "drum bass",
  "hi hat closed",
  "hi hat open",
  "drum snare 2",
  "hand clap",
  "bass tone 5",
  "bass guitar slap",
  "bass guitar muted",
  "guitar distorted",
  "guitar distorted 2",
  "guitar nylon",
  "piano old timey",
  "xylophone",
  "xylophone 2",
  "xylophone toy",
  "marimba",
  "piano toy",
  "glockenspiel toy",
  "ukulele",
  "djembe bass",
  "djembe tone",
  "djembe slap",
  "acoustic guitar",
  "cowbell",
  "bass tone 1",
  "bass tone 2",
  "bass tone 3",
  "bass tone 4",
  "accordian",
  "acoustic guitar 2",
  "hand clap (electro)",
  "tamborine",
  "clap acoustic",
  "finger snap",
  "kazoo",
  "panflute",
  "gaming bling",
  "dog bark",
  "gaming note",
  "synth reverse",
  "synth highback",
  "synth funk",
  "synth shimmer",
  "synth organ",
  "synth strike",
  "rubber band",
  "retro explosion subtle",
  "retro projectile subtle",
  "retro synth brass stab",
  "retro analog synth bass",
  "synth sub bass",
  "subtle bass percussive",
  "riser whoosh short",
  "click percussion short",
  "closed hat electronic short",
  "soft synth pad short 1",
  "soft synth pad short 2",
  "chiptune arp",
  "synth pluck lead short",
  "digital synth lead short",
  "analog pluck arp",
  "soft synth pad short",
  "tight electronic kick",
  "pop",
  "laser",
  "alien"
]);
const colours = Object.fromEntries(INSTRUMENT_COLOUR_IDS.map((id,index)=>[id,
  'oklch('+[76,84,68][index%3]+'% 0.14 '+((index*137.507764)%360).toFixed(4)+')']));
export const INSTRUMENT_COLOURS = Object.freeze(colours);
const COLOUR_KEY = 'rhythmake:instrument-colours';
const colourKey = id => String(id || 'tone').trim().toLowerCase().replace(/[_-]+/g, ' ');
let overrides = {};
try {
 const saved = JSON.parse(globalThis.localStorage?.getItem(COLOUR_KEY) || '{}');
 for (const [id, colour] of Object.entries(saved || {})) {
  if (typeof colour === 'string' && /^#[0-9a-f]{6}$/i.test(colour)) overrides[colourKey(id)] = colour;
 }
} catch {}
export function setInstrumentColour(id, colour) {
 if (!/^#[0-9a-f]{6}$/i.test(colour)) return false;
 overrides[colourKey(id)] = colour;
 try { globalThis.localStorage?.setItem(COLOUR_KEY, JSON.stringify(overrides)); } catch {}
 // Refresh all existing owners; future owners read the same mapping on install.
 for (const panel of globalThis.document?.querySelectorAll?.('.toy-panel[data-instrument]') || []) {
  panel.style.setProperty('--instrument-colour', instrumentColour(panel.dataset.instrument));
  panel.dataset.instrumentColour = instrumentColour(panel.dataset.instrument);
 }
 globalThis.window?.dispatchEvent(new CustomEvent('instrument-colour:change', { detail: { id: colourKey(id), colour } }));
 return true;
}
export function instrumentColour(id='tone') {
 const key=String(id||'tone').trim().toLowerCase().replace(/[_-]+/g,' ');
 if(overrides[key])return overrides[key];
 if(INSTRUMENT_COLOURS[key])return INSTRUMENT_COLOURS[key];
 let hash=2166136261;for(const c of key)hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;
 return 'oklch(76% 0.14 '+(hash/4294967296*360).toFixed(4)+')';
}
