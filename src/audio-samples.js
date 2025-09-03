// src/audio-samples.js — samples + tone fallback (<=300 lines)
import { ensureAudioContext, getToyGain } from './audio-core.js';
import { playById, noteToFreq, TONE_NAMES } from './audio-tones.js';

const entries = new Map();   // id -> { url, synth }
const buffers = new Map();   // id -> AudioBuffer
const ALIASES = new Map([
  ['djimbe','djembe'],
  ['djimbe_bass','djembe_bass'],
  ['djimbe_tone','djembe_tone'],
  ['djimbe_slap','djembe_slap'],
  ['hand_clap','clap'],
]);

export function getInstrumentNames(){
  const set = new Set(TONE_NAMES);
  for (const k of entries.keys()) set.add(k);
  for (const k of buffers.keys()) set.add(k);
  return Array.from(set).sort();
}

export async function initAudioAssets(csvUrl){
  console.log('[AUDIO] init start', csvUrl);
  if (!csvUrl) return;
  const res = await fetch(csvUrl);
  if (!res.ok){ console.warn('[AUDIO] csv not found', csvUrl); return; }
  const text = await res.text();
  const lines = text.replace(/\r/g,'\n').split('\n').filter(l=>l && !l.trim().startsWith('#'));
  if (!lines.length) return;
  const head = lines.shift().split(',').map(s=>s.trim().toLowerCase());
  const col = { filename: head.indexOf('filename'), instrument: head.indexOf('instrument'), synth: head.indexOf('synth_id') };
  const base = new URL(csvUrl, window.location.href);
  const baseDir = base.href.substring(0, base.href.lastIndexOf('/')+1);
  for (const line of lines){
    const parts = line.split(',');
    const fn = (parts[col.filename]||'').trim();
    const id = (parts[col.instrument]||'').trim().toLowerCase();
    const synth = (parts[col.synth]||'').trim().toLowerCase();
    if (!id) continue;
    const url = fn ? (baseDir + fn) : '';
    entries.set(id, { url, synth });
    // also by filename base
    if (fn){
      const baseName = fn.replace(/\.[^/.]+$/, '').toLowerCase();
      if (baseName && baseName !== id) entries.set(baseName, { url, synth });
    }
    if (url){
      try{
        const ab = await (await fetch(url)).arrayBuffer();
        const buf = await ensureAudioContext().decodeAudioData(ab);
        buffers.set(id, buf);
        if (fn){
          const baseName = fn.replace(/\.[^/.]+$/, '').toLowerCase();
          buffers.set(baseName, buf);
        }
      }catch(e){ /* skip bad file */ }
    }
  }
  console.log('[AUDIO] buffers ready', buffers.size);
  document.dispatchEvent(new CustomEvent('samples-ready'));
}

function playSampleAt(id, when, gain=1, toyId, noteName='C4'){
  const ctx = ensureAudioContext();
  const buf = buffers.get(id);
  if (!buf){ return false; }
  const src = ctx.createBufferSource();
  src.buffer = buf;

  // Adjust playback rate for pitch. Assume base note is C4 for all samples.
  // This allows sample-based instruments to be pitched.
  const baseFreq = noteToFreq('C4');
  const targetFreq = noteToFreq(noteName);
  if (baseFreq > 0 && targetFreq > 0) {
    src.playbackRate.value = targetFreq / baseFreq;
  }

  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g).connect(getToyGain(toyId||'master'));
  src.start(when||ctx.currentTime);
  return true;
}

export function triggerInstrument(instrument, noteName='C4', when, toyId){
  const ctx = ensureAudioContext();
  const id0 = String(instrument||'tone').toLowerCase();
  const id = ALIASES.get(id0) || id0;
  const t = when || ctx.currentTime;

  // exact or base-name sample first
  if (playSampleAt(id, t, 1, toyId, noteName)) return;
  // try family (e.g., djembe_bass -> djembe)
  const fam = id.split('_')[0];
  if (fam !== id && playSampleAt(fam, t, 1, toyId, noteName)) return;

  // synth fallback
  const entry = entries.get(id) || entries.get(fam);
  const synthId = (entry && entry.synth) ? entry.synth : null;
  const toneId = synthId || (TONE_NAMES.includes(id) ? id : 'tone');
  return playById(toneId, noteToFreq(noteName), t, getToyGain(toyId||'master'));
}
