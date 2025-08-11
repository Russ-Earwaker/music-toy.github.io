// src/audio-samples.js — CSV samples + instrument dispatcher (tones included)
import { ensureAudioContext } from './audio-core.js';
import { playById, playToneAt, TONE_NAMES } from './audio-tones.js';

const FALLBACK_SAMPLES = [
  { name: 'RP4 Kick',      url: './assets/samples/RP4_KICK_1.mp3' },
  { name: 'Break Snare',   url: './assets/samples/Brk_Snr.mp3' },
  { name: 'Hi-Hat Closed', url: './assets/samples/Cev_H2.mp3' },
  { name: 'Clap Heater',   url: './assets/samples/Heater-6.mp3' },
];

let entries = new Map(); // name -> { url? , synth? }
let buffers = new Map(); // name -> AudioBuffer
let csvOk = false;

function dispatchReady(src){
  const names = getInstrumentNames();
  window.dispatchEvent(new CustomEvent('samples-ready', { detail: { ok: csvOk, names, src } }));
}

function dirname(url){ const i = url.lastIndexOf('/'); return i === -1 ? '' : url.slice(0, i); }

function parseCsvSmart(text, csvUrl){
  const lines = text.trim().split(/[\r\n]+/).filter(Boolean);
  if (!lines.length) throw new Error('CSV empty');
  const headRaw = lines[0];
  const head = headRaw.split(',').map(s => s.trim().toLowerCase());

  if (head.includes('name') && head.includes('url')){
    const rest = lines.slice(1); const out = [];
    for (const line of rest){
      if (!line || line.startsWith('#')) continue;
      const parts = line.split(',');
      const name = (parts.shift() || '').trim();
      const url  = parts.join(',').trim();
      if (name && url) out.push({ name, url });
    }
    if (!out.length) throw new Error('CSV had no valid rows (name,url)');
    return out;
  }

  const fnIdx = head.indexOf('filename');
  const dnIdx = head.indexOf('display_name');
  const siIdx = head.indexOf('synth_id');
  if (fnIdx !== -1 && dnIdx !== -1){
    const base = dirname(csvUrl);
    const rest = lines.slice(1); const out = [];
    for (const line of rest){
      if (!line || line.startsWith('#')) continue;
      const cols = line.split(',');
      const filename = (cols[fnIdx] || '').trim();
      const display  = (cols[dnIdx] || '').trim() || filename;
      const synth    = siIdx !== -1 ? (cols[siIdx] || '').trim() : '';
      if (synth && !filename){
        out.push({ name: display, synth });
      } else if (filename){
        const url = (base ? (base + '/') : './') + filename;
        out.push({ name: display || filename, url });
      }
    }
    if (!out.length) throw new Error('CSV had no valid rows (filename/display_name/synth_id)');
    return out;
  }
  throw new Error('Unrecognized CSV headers');
}

async function fetchCsvList(csvUrl){
  const res = await fetch(csvUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error(`CSV fetch failed: ${res.status}`);
  const text = await res.text();
  return parseCsvSmart(text, csvUrl);
}
async function loadSample(url){
  const res = await fetch(url);
  const ab = await res.arrayBuffer();
  return new Promise((ok, err)=> ensureAudioContext().decodeAudioData(ab, ok, err));
}
async function loadFromList(list){
  buffers.clear();
  entries.clear();
  for (const it of list){
    entries.set(it.name, { url: it.url, synth: it.synth });
    if (it.url){
      try{
        const b = await loadSample(it.url);
        buffers.set(it.name, b);
      }catch(e){ console.warn('[audio] decode failed', it, e); }
    }
  }
}

async function tryCsvPaths(paths){
  for (const p of paths){
    try{
      const list = await fetchCsvList(p);
      await loadFromList(list);
      if (entries.size > 0){
        csvOk = true;
        dispatchReady(p);
        return true;
      }
    }catch(e){
      console.warn('[audio] CSV try failed', p, e.message || e);
    }
  }
  return false;
}

export async function initAudioAssets(csvUrl){
  ensureAudioContext();
  csvOk = false;
  entries.clear(); buffers.clear();

  const candidates = csvUrl
    ? [csvUrl]
    : ['./assets/samples/samples.csv','./samples.csv','./samples/samples.csv'];

  const ok = await tryCsvPaths(candidates);
  if (!ok){
    await loadFromList(FALLBACK_SAMPLES).catch(()=>{});
    csvOk = false;
    dispatchReady('fallback');
  }
}

export function getInstrumentNames(){
  // Combine tone names + CSV names (tone names first)
  return Array.from(new Set([ ...TONE_NAMES, ...entries.keys() ]));
}

function noteToFreq(note='C4'){
  const NOTE = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const m = /^([A-G]#?)(-?\d)$/.exec(String(note).trim());
  if (!m) return 440;
  const [_, n, o] = m;
  const idx = NOTE.indexOf(n);
  const midi = (Number(o) + 1) * 12 + idx;
  return 440 * Math.pow(2, (midi - 69)/12);
}

function freqRatio(fromNote='C4', toNote='C4'){
  const f1 = noteToFreq(fromNote);
  const f2 = noteToFreq(toNote);
  return f2 / f1;
}

function playSampleAt(name, when, rate=1){
  const ctx = ensureAudioContext();
  const buf = buffers.get(name);
  if (!buf) return;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  src.connect(ctx.destination);
  src.start(when);
}

export function triggerInstrument(instrument, noteName, when){
  // 1) Tone synths by name/id
  const id = (instrument||'').toLowerCase();
  const knownTone = TONE_NAMES.map(n=>n.toLowerCase());
  if (knownTone.includes(id)){
    const freq = noteToFreq(noteName);
    return playById(id, freq, when);
  }

  // 2) CSV row with synth_id mapping (e.synth)
  const e = entries.get(instrument);
  if (e && e.synth){
    const freq = noteToFreq(noteName);
    return playById(e.synth.toLowerCase(), freq, when);
  }

  // 3) Sample buffer by name (pitch-shift relative to C4)
  if (buffers.has(instrument)){
    return playSampleAt(instrument, when, freqRatio('C4', noteName));
  }

  // 4) Fallback simple tone
  const freq = noteToFreq(noteName);
  return playToneAt(freq, when);
}
