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

// Common aliases and misspellings mapped to canonical ids
const ALIASES = new Map([
  ['djimbe','djembe'],
  ['djimbe_bass','djembe_bass'],
  ['djimbe_tone','djembe_tone'],
  ['djimbe_slap','djembe_slap'],
  ['hand_clap','clap'],
  ['handclap','clap'],
  ['acousticguitar','acoustic_guitar'],
  ['acoustic-guitar','acoustic_guitar'],
]);

// Normalize various user/CSV names to canonical lookup ids
function normId(s){
  const x = String(s||'').trim();
  if (!x) return '';
  const lo = x.toLowerCase();
  return ALIASES.get(lo) || lo;
}

// Convenience: add multiple normalized keys to the map for the same entry
function addAliasesFor(id, data, displayName){
  const variants = new Set();
  const base = normId(id);
  const disp = String(displayName||'').trim().toLowerCase();
  // canonical
  variants.add(base);
  // hyphen/space/underscore variants of id
  variants.add(base.replace(/[-\s]+/g,'_'));
  variants.add(base.replace(/[_\s]+/g,'-'));
  variants.add(base.replace(/[-_\s]+/g,''));
  // display name variants
  if (disp){
    variants.add(disp);
    variants.add(disp.replace(/[-\s]+/g,'_'));
    variants.add(disp.replace(/[_\s]+/g,'-'));
    variants.add(disp.replace(/[-_\s]+/g,''));
  }
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
    display: head.findIndex(h=>/^(display\s*_?name|display|label|title)$/.test(h)),
    synth: head.indexOf('synth_id')
  };

  // Build entries and decode buffers
  const base = new URL(csvUrl, window.location.href);
  const baseDir = base.href.substring(0, base.href.lastIndexOf('/')+1);

  for (const line of lines){
    const parts = line.split(',');
    const fn   = (col.filename>=0 ? parts[col.filename] : '').trim();
    const id   = (col.instrument>=0 ? parts[col.instrument] : '').trim();
    const disp = (col.display>=0 ? parts[col.display] : '').trim();
    const synth= (col.synth>=0 ? parts[col.synth] : '').trim().toLowerCase();
    const url  = fn ? (baseDir + fn) : '';
    if (!id && !synth) continue;

    const data = { url, synth };
    addAliasesFor(id||synth, data, disp);

    if (url){
      const buf = await loadBuffer(url);
      if (buf){
        // Mirror the same aliases for buffers
        const keys = [id||synth, disp].filter(Boolean).map(k=>String(k).toLowerCase());
        const variants = new Set();
        for (const k of keys){
          variants.add(k);
          variants.add(k.replace(/[-\s]+/g,'_'));
          variants.add(k.replace(/[_\s]+/g,'-'));
          variants.add(k.replace(/[-_\s]+/g,''));
        }
        for (const k of variants) if (k) buffers.set(normId(k), buf);
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
function playSampleAt(id, when, gain=1, toyId, noteName){
  const key = normId(id);
  const buf = buffers.get(key);
  const ent = entries.get(key);
  if (!buf && !ent) return false;

  const ctx = ensureAudioContext();
  const src = buf ? ctx.createBufferSource() : null;
  if (src){
    src.buffer = buf;

    // Adjust playback rate for pitch. Assume base note is C4 for all samples.
    const baseFreq = noteToFreq('C4');
    const targetFreq = noteToFreq(noteName || 'C4');
    if (baseFreq > 0 && targetFreq > 0) {
      src.playbackRate.value = targetFreq / baseFreq;
    }

    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(g).connect(getToyGain(toyId||'master'));
    const __startAt = safeStartTime(ctx, when);
    if (window && window.BOUNCER_LOOP_DBG) {
      try { console.log('[audio-samples] start', id, noteName||'C4', 'in', (__startAt - ctx.currentTime).toFixed(3)); } catch (e) {}
    }
    src.start(__startAt);
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

export function triggerInstrument(instrument, noteName='C4', when, toyId){
  const ctx = ensureAudioContext();
  const id0 = String(instrument||'tone').toLowerCase();
  const id  = normId(id0);
  const t   = safeStartTime(ctx, when);

  // If id looks like a tone name in friendly form, normalize spaces/underscores/parentheses
  try{
    const idLoose = id.replace(/[()]/g,'').replace(/[_\s]+/g,'-');
    // Common "tone (sine)" pattern: prefer the inner token if present
    const m = /\(([a-z-\s_]+)\)/.exec(id0);
    const inner = m ? m[1].trim().replace(/[_\s]+/g,'-') : '';
    if (inner && TONE_NAMES.includes(inner)) return playById(inner, noteToFreq(noteName), t, getToyGain(toyId||'master'));
    if (TONE_NAMES.includes(idLoose)) return playById(idLoose, noteToFreq(noteName), t, getToyGain(toyId||'master'));
  }catch{}

  // exact or alias match first
  if (playSampleAt(id, t, 1, toyId, noteName)) { try{ window.__toyActivityAt = ensureAudioContext().currentTime; }catch{}; return; }

  // try family (e.g., djembe_bass -> djembe)
  const fam = id.split('_')[0];
  if (fam !== id && playSampleAt(fam, t, 1, toyId, noteName)) { try{ window.__toyActivityAt = ensureAudioContext().currentTime; }catch{}; return; }

  // synth alias fallback: if an entry exists whose synth matches the id, use that tone
  try{
    for (const ent of entries.values()){
      const s = (ent && ent.synth) ? String(ent.synth).toLowerCase() : '';
      const sNorm = s.replace(/_/g,'-');
      const iNorm = id.replace(/[()]/g,'').replace(/[_\s]+/g,'-');
      if (s && (s === id || sNorm === id || s === iNorm || sNorm === iNorm)){
        const toneId2 = TONE_NAMES.includes(sNorm) ? sNorm : (TONE_NAMES.includes(s) ? s : 'tone');
        const ok = playById(toneId2, noteToFreq(noteName), t, getToyGain(toyId||'master'));
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
  const ok = playById(toneId, noteToFreq(noteName), t, getToyGain(toyId||'master'));
  if (ok) { try{ window.__toyActivityAt = ensureAudioContext().currentTime; }catch{} }
  return ok;
}

// Tiny debug API
window.AudioDebug = {
  list: ()=> Array.from(new Set([ ...entries.keys(), ...buffers.keys() ])).sort(),
  has: (k)=> entries.has(normId(k)) || buffers.has(normId(k))
};
