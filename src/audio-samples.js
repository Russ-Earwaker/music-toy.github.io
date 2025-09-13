// src/audio-samples.js — samples + tone fallback (<=300 lines)
import { ensureAudioContext, getToyGain } from './audio-core.js';
import { playById, noteToFreq, TONE_NAMES } from './audio-tones.js';

// id -> { url, synth }

// Ensure scheduled 'when' is safe: convert absolute time to >= now+1ms
function safeStartTime(ctx, when){
  const now = ctx.currentTime;
  if (typeof when === 'number' && isFinite(when)) {
    // If 'when' is in the past or dangerously near, bump to just-after now
    return Math.max(now + 0.001, when);
  }
  return now;
}

const entries = new Map();
// id -> AudioBuffer
const buffers = new Map();

// Normalize various user/CSV names to canonical lookup ids
function normId(s){
  const x = String(s||'').trim();
  if (!x) return '';
  return x;
}

// Convenience: add multiple normalized keys to the map for the same entry
function addAliasesFor(id, data, displayName){
  const variants = new Set();
  const base = normId(id);
  variants.add(base);
  for (const k of variants) if (k) entries.set(k, data);
}

// Fetch and decode a sample file
async function loadBuffer(url){
  try{
    const ab = await (await fetch(url)).arrayBuffer();
    return await ensureAudioContext().decodeAudioData(ab);
  }catch(e){
    return null;
  }
}

// Initialize sample library from CSV
export async function initAudioAssets(csvUrl='./assets/samples/samples.csv'){
  const res = await fetch(csvUrl);
  if (!res.ok) throw new Error(`CSV load failed: ${res.status}`);
  const text = await res.text();
  const lines = text.replace(/\r/g,'\n').split('\n').filter(l=>l && !l.trim().startsWith('#'));
  if (!lines.length) return;
  const head = lines.shift().split(',').map(s=>s.trim().toLowerCase());

  const col = {
    filename: head.indexOf('filename'),
    instrument: head.indexOf('instrument'),
    instrument_id: head.indexOf('instrument_id'),
    display: head.findIndex(h=>/^(display\s*_?name|display|label|title)$/.test(h)),
    synth: head.indexOf('synth_id'),
    aliases: head.findIndex(h => h.startsWith('aliases')),
    base_note: head.findIndex(h => /^(base\s*_?note|baseNote|note_base)$/i.test(h)),
    base_oct: head.findIndex(h => /^(base\s*_?oct(ave)?|baseOct(ave)?|octave)$/i.test(h)),
  };

  // Build entries and decode buffers
  const base = new URL(csvUrl, window.location.href);
  const baseDir = base.href.substring(0, base.href.lastIndexOf('/')+1);

  for (const line of lines){
    const parts = line.split(',');
    const fn    = (col.filename>=0 ? parts[col.filename] : '').trim();
    const idCsv = (col.instrument>=0 ? parts[col.instrument] : '').trim();
    const instId = (col.instrument_id>=0 ? parts[col.instrument_id] : '').trim();
    const disp  = (col.display>=0 ? parts[col.display] : '').trim();
    const synth = (col.synth>=0 ? parts[col.synth] : '').trim().toLowerCase();
    const aliasStr = (col.aliases>=0 ? parts[col.aliases] : '').trim();
    const url   = fn ? (baseDir + fn) : '';
    // Optional base note metadata to align pitch for this sample family
    let baseNoteCsv = (col.base_note>=0 ? parts[col.base_note] : '').trim();
    const baseOctCsv = (col.base_oct>=0 ? parts[col.base_oct] : '').trim();
    if (!baseNoteCsv && baseOctCsv){
      // Interpret as C{oct}
      baseNoteCsv = `C${baseOctCsv}`;
    }

    // The canonical ID is the new `instrument_id` column.
    // Fall back to the `instrument` column, then `synth_id`.
    const canonicalId = instId || idCsv || synth;
    if (!canonicalId) continue;

    const data = { url, synth, baseNote: baseNoteCsv || undefined };
    const allNames = new Set();
    allNames.add(normId(canonicalId));
    // The user is renaming 'aliases' to 'instrument_id'. To be safe, we'll
    // still read the 'aliases' column if it exists for backward compatibility.
    if (aliasStr) {
      aliasStr.split(';').map(s => s.trim()).filter(Boolean).forEach(alias => allNames.add(normId(alias)));
    }

    // Register the entry under all its names.
    for (const name of allNames) {
      entries.set(name, data);
    }

    if (url){
      const buf = await loadBuffer(url);
      if (buf){
        // Register the buffer under all its names.
        for (const name of allNames) {
          buffers.set(name, buf);
        }

        // Special handling for chord samples named like 'Guitar_Chord_Am.wav'.
        // This creates an alias (e.g., 'am') so it can be triggered directly by name,
        // which is what the Chord Wheel toy expects for its sample-based mode.
        const m = /guitar_chord_([a-g]#?m?)\.wav/i.exec(fn);
        if (m && m[1]) {
          const chordAlias = m[1].toLowerCase();
          if (chordAlias) {
            const aliasKey = normId(chordAlias);
            if (!buffers.has(aliasKey)) buffers.set(aliasKey, buf);
            if (!entries.has(aliasKey)) entries.set(aliasKey, data);
          }
        }
      }
    }
  }

  // Signal that samples are ready
  try{
    document.dispatchEvent(new CustomEvent('samples-ready'));
    window.dispatchEvent(new CustomEvent('samples-ready'));
  }catch{}
}

export function getInstrumentNames(){
  const set = new Set(TONE_NAMES);
  for (const k of entries.keys()) set.add(k);
  for (const k of buffers.keys()) set.add(k);
  // Filter out things that look like full filenames
  return Array.from(set).filter(n=>!/[.](wav|mp3|ogg|flac)$/i.test(n));
}

// Try to play a preloaded sample by id
function playSampleAt(id, when, gain=1, toyId, noteName, options = {}){
  const key = normId(id);
  const buf = buffers.get(key);
  const ent = entries.get(key);
  if (!buf && !ent) return false;

  const ctx = ensureAudioContext();
  const tStart = safeStartTime(ctx, when);
  const src = buf ? ctx.createBufferSource() : null;
  if (src){
    src.buffer = buf;

    if (options && typeof options.playbackRate === 'number') {
      src.playbackRate.value = options.playbackRate;
    } else {
      // Adjust playback rate for pitch. Assume base note is C4 for all samples.
      // Prefer explicit baseNote from options, then entry metadata, else C4
      let baseNoteName = (options && options.baseNote) || (ent && ent.baseNote) || 'C4';
      // Basic sanitize: ensure like 'C4'
      try{ baseNoteName = String(baseNoteName).trim(); }catch{}
      const baseFreq = noteToFreq(baseNoteName || 'C4');
      const targetFreq = noteToFreq(noteName || 'C4');
      if (baseFreq > 0 && targetFreq > 0) {
        src.playbackRate.value = targetFreq / baseFreq;
      }
    }

    const g = ctx.createGain();
    // Envelope: optional per-note attack/decay for strums
    const env = options && (options.env || options.strumEnv);
    if (env && typeof env.decaySec === 'number' && env.decaySec > 0){
      try{
        const d = Math.max(0.08, env.decaySec);
        const atk = Math.min(0.006, d * 0.08); // very short fade-in to avoid clicks
        g.gain.setValueAtTime(0.0001, tStart);
        g.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), tStart + atk);
        // Exponential decay to near-silence
        g.gain.exponentialRampToValueAtTime(0.0001, tStart + d);
      }catch{
        g.gain.value = gain;
      }
    } else {
      g.gain.value = gain;
    }
    src.connect(g).connect(getToyGain(toyId||'master'));
    const __startAt = tStart;
    if (window && window.BOUNCER_LOOP_DBG) {
      try { console.log('[audio-samples] start', id, noteName||'C4', 'in', (__startAt - ctx.currentTime).toFixed(3)); } catch (e) {}
    }
    src.start(__startAt);
    // If envelope provided, schedule stop a bit after decay to avoid truncation clicks
    try{
      if (env && typeof env.decaySec === 'number' && env.decaySec > 0){
        src.stop(__startAt + Math.max(0.08, env.decaySec) + 0.12);
      }
    }catch{}
    return true;
  }

  // synth fallback for entry with synth id
  const synthId = ent && ent.synth;
  if (synthId){
    const sNorm = String(synthId||'').toLowerCase().replace(/_/g,'-');
    const toneId = TONE_NAMES.includes(sNorm) ? sNorm : 'tone';
    return playById(toneId, noteToFreq(noteName||'C4'), when||ctx.currentTime, getToyGain(toyId||'master'));
  }
  return false;
}

export function triggerInstrument(instrument, noteName='C4', when, toyId, options = {}, velocity = 1.0){
  const ctx = ensureAudioContext();
  const id  = normId(instrument || 'TONE');
  const t   = safeStartTime(ctx, when);
  const vel = Math.max(0.001, Math.min(1.0, velocity));

  // If id looks like a tone name in friendly form, normalize spaces/underscores/parentheses
  try{
    const idLoose = id.toLowerCase().replace(/[()]/g,'').replace(/[_\s]+/g,'-');
    // Common "tone (sine)" pattern: prefer the inner token if present
    const m = /\(([a-z-\s_]+)\)/.exec(id.toLowerCase());
    const inner = m ? m[1].trim().replace(/[_\s]+/g,'-') : '';
    if (inner && TONE_NAMES.includes(inner)) return playById(inner, noteToFreq(noteName), t, getToyGain(toyId||'master'));
    if (TONE_NAMES.includes(idLoose)) return playById(idLoose, noteToFreq(noteName), t, getToyGain(toyId||'master'));
  }catch{}

  // exact or alias match first
  if (playSampleAt(id, t, vel, toyId, noteName, options)) { try{ window.__toyActivityAt = ensureAudioContext().currentTime; }catch{}; return; }

  // try family (e.g., djembe_bass -> djembe)
  const fam = id.split('_')[0];
  if (fam !== id && playSampleAt(fam, t, vel, toyId, noteName, options)) { try{ window.__toyActivityAt = ensureAudioContext().currentTime; }catch{}; return; }

  // synth alias fallback: if an entry exists whose synth matches the id, use that tone
  try{
    for (const ent of entries.values()){
      const s = (ent && ent.synth) ? String(ent.synth).toLowerCase() : '';
      const sNorm = s.replace(/_/g,'-');
      const iNorm = id.replace(/[()]/g,'').replace(/[_\s]+/g,'-');
      if (s && (s === id || sNorm === id || s === iNorm || sNorm === iNorm)){
        const toneId2 = TONE_NAMES.includes(sNorm) ? sNorm : (TONE_NAMES.includes(s) ? s : 'tone');
        const ok = playById(toneId2, noteToFreq(noteName), t, getToyGain(toyId||'master'), vel);
        if (ok) { try{ window.__toyActivityAt = ensureAudioContext().currentTime; }catch{} }
        return ok;
      }
    }
  }catch{}

  // synth fallback
  const toneId = TONE_NAMES.includes(id) ? id : 'tone';
  try{
    if (!TONE_NAMES.includes(id)) {
      // No sample match and not a known tone name; log for diagnostics
      console.warn('[audio] instrument not found:', id, '— using', toneId);
    }
  }catch{}
  const ok = playById(toneId, noteToFreq(noteName), t, getToyGain(toyId||'master'), vel);
  if (ok) { try{ window.__toyActivityAt = ensureAudioContext().currentTime; }catch{} }
  return ok;
}

// Tiny debug API
window.AudioDebug = {
  list: ()=> Array.from(new Set([ ...entries.keys(), ...buffers.keys() ])).sort(),
  has: (k)=> entries.has(normId(k)) || buffers.has(normId(k))
};
