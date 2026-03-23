// src/audio-samples.js — samples + tone fallback (<=300 lines)
import { ensureAudioContext, getToyGain, registerActiveNode, getLoopInfo } from './audio-core.js';
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

// Track scheduled sample sources so we can cancel pending notes on pause/resume.
// Note: this only covers AudioBufferSourceNode-based samples (not tone synth fallbacks).
const __scheduledSampleByToy = new Map(); // toyId -> Set<{ src: AudioBufferSourceNode, tStart: number }>

function __trackScheduledSample(toyId, src, tStart){
  if (!toyId || !src) return;
  const id = String(toyId);
  let set = __scheduledSampleByToy.get(id);
  if (!set) { set = new Set(); __scheduledSampleByToy.set(id, set); }

  const rec = { src, tStart: Number(tStart) || 0 };
  set.add(rec);

  // Best-effort cleanup when the node ends
  try {
    const prev = src.onended;
    src.onended = (ev) => {
      try { set.delete(rec); } catch {}
      try { if (typeof prev === 'function') prev(ev); } catch {}
    };
  } catch {}
}

/** Stop and forget any scheduled (future) sample sources for a toy (or all toys if toyId is falsy). */
export function cancelScheduledToySources(toyId){
  try{
    const ctx = ensureAudioContext();
    const now = ctx?.currentTime ?? 0;
    const epsilon = 0.002;

    const stopSet = (set) => {
      if (!set) return;
      for (const rec of Array.from(set)) {
        try {
          const tStart = Number(rec?.tStart) || 0;
          // Only stop notes that haven't started yet (or are barely starting)
          if (tStart > (now + epsilon)) {
            rec.src?.stop?.();
          }
        } catch {}
        try { set.delete(rec); } catch {}
      }
    };

    if (!toyId) {
      for (const set of __scheduledSampleByToy.values()) stopSet(set);
      __scheduledSampleByToy.clear();
      return;
    }

    const key = String(toyId);
    const set = __scheduledSampleByToy.get(key);
    stopSet(set);
    if (set && set.size === 0) __scheduledSampleByToy.delete(key);
  } catch {}
}

const timingProbeState = {
  lastBar: null,
  lastTs: 0,
  lastWarnBar: null,
};

// Normalize various user/CSV names to canonical lookup ids
function normId(s){
  const x = String(s||'').trim();
  if (!x) return '';
  return x;
}

function resolveOctaveForToy(noteName, toyId, options = {}, instrumentId = ''){
  if (!toyId || typeof document === 'undefined') return noteName;
  const findChainHeadPanel = (panel) => {
    let current = panel;
    let safety = 0;
    while (current && safety++ < 24) {
      const parentId = current.dataset?.chainParent || current.dataset?.prevToyId;
      if (!parentId) break;
      const parent = document.getElementById(parentId)
        || document.querySelector(`.toy-panel[data-toyid="${parentId}"], .toy-panel[data-toy="${parentId}"]`);
      if (!parent || parent === current) break;
      current = parent;
    }
    return current || panel;
  };
  const readPitchShiftFromPanel = (panel) => {
    const flag = String(panel?.dataset?.instrumentPitchShift || '').toLowerCase();
    if (flag === '1' || flag === 'true') return true;
    if (flag === '0' || flag === 'false') return false;
    return null;
  };
  const readOctaveFromPanel = (panel) => {
    const dsOctave = panel?.dataset?.instrumentOctave;
    if (dsOctave != null && dsOctave !== '') {
      const parsed = parseInt(dsOctave, 10);
      if (Number.isFinite(parsed)) return parsed;
    }
    if (panel?.dataset?.instrumentNote) {
      const m = /(-?\d+)/.exec(String(panel.dataset.instrumentNote));
      if (m) {
        const parsed = parseInt(m[1], 10);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
    return null;
  };
  let octave = null;
  const panel = document.querySelector(`.toy-panel[data-audiotoyid="${toyId}"], .toy-panel[data-toyid="${toyId}"], .toy-panel[data-toy="${toyId}"], #${toyId}`);
  const headPanel = panel ? findChainHeadPanel(panel) : panel;
  let pitchShiftEnabled = null;
  if (typeof options.pitchShift === 'boolean') {
    pitchShiftEnabled = options.pitchShift;
  } else {
    pitchShiftEnabled = readPitchShiftFromPanel(headPanel || panel);
    if (pitchShiftEnabled === null) {
      pitchShiftEnabled = readPitchShiftFromPanel(panel);
    }
  }
  if (!pitchShiftEnabled) {
    const entry = entries.get(normId(instrumentId));
    if (entry && entry.baseNote) {
      const m = /(-?\d+)/.exec(String(entry.baseNote));
      if (m) {
        const baseOct = parseInt(m[1], 10);
        if (Number.isFinite(baseOct)) {
          const raw = String(noteName ?? '').trim();
          const match = /^([A-G]#?)(-?\d+)$/i.exec(raw);
          if (match) {
            return `${match[1].toUpperCase()}${baseOct}`;
          }
        }
      }
      return entry.baseNote;
    }
    return noteName;
  }
  if (Number.isFinite(options.octave)) {
    octave = options.octave;
  } else {
    octave = readOctaveFromPanel(headPanel || panel);
    if (!Number.isFinite(octave)) {
      octave = readOctaveFromPanel(panel);
    }
  }
  if (!Number.isFinite(octave)) return noteName;
  const raw = String(noteName ?? '').trim();
  const match = /^([A-G]#?)(-?\d+)$/i.exec(raw);
  if (!match) return noteName;
  return `${match[1].toUpperCase()}${octave}`;
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
export async function initAudioAssets(csvUrl='./samples.csv'){
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
    source_base_note: head.findIndex(h => /^(source[_-]?base[_-]?note|sample[_-]?base[_-]?note|detected[_-]?base[_-]?note)$/i.test(h)),
    source_base_oct: head.findIndex(h => /^(source[_-]?base[_-]?oct(ave)?|sample[_-]?base[_-]?oct(ave)?|detected[_-]?base[_-]?oct(ave)?)$/i.test(h)),
    volume: head.findIndex(h => /^(volume|volume[_-]?db|level[_-]?db|gain[_-]?db)$/i.test(h)),
  };

  // Build entries and decode buffers
  const csvBase = new URL(csvUrl, window.location.href);
  const csvDir = csvBase.href.substring(0, csvBase.href.lastIndexOf('/') + 1);
  const sampleBaseDir = new URL('./assets/samples/', window.location.href).href;

  for (const line of lines){
    const parts = line.split(',');
    const fn    = (col.filename>=0 ? parts[col.filename] : '').trim();
    const idCsv = (col.instrument>=0 ? parts[col.instrument] : '').trim();
    const instId = (col.instrument_id>=0 ? parts[col.instrument_id] : '').trim();
    const disp  = (col.display>=0 ? parts[col.display] : '').trim();
    const synth = (col.synth>=0 ? parts[col.synth] : '').trim().toLowerCase();
    const aliasStr = (col.aliases>=0 ? parts[col.aliases] : '').trim();
    const url = (() => {
      if (!fn) return '';
      if (/^https?:\/\//i.test(fn)) return fn;
      const baseHref = (fn.includes('/') || fn.includes('\\')) ? csvDir : sampleBaseDir;
      try { return new URL(fn, baseHref).href; } catch { return baseHref + fn; }
    })();
    // Optional base note metadata to align pitch for this sample family
    let baseNoteCsv = (col.base_note>=0 ? parts[col.base_note] : '').trim();
    const baseOctCsv = (col.base_oct>=0 ? parts[col.base_oct] : '').trim();
    if (!baseNoteCsv && baseOctCsv){
      // Interpret as C{oct}
      baseNoteCsv = `C${baseOctCsv}`;
    }
    let sourceBaseNoteCsv = (col.source_base_note>=0 ? parts[col.source_base_note] : '').trim();
    const sourceBaseOctCsv = (col.source_base_oct>=0 ? parts[col.source_base_oct] : '').trim();
    if (!sourceBaseNoteCsv && sourceBaseOctCsv){
      sourceBaseNoteCsv = `C${sourceBaseOctCsv}`;
    }
    const volumeCsv = (col.volume>=0 ? parts[col.volume] : '').trim();

    // The canonical ID is the new `instrument_id` column.
    // Fall back to the `instrument` column, then `synth_id`.
    const canonicalId = instId || idCsv || synth;
    if (!canonicalId) continue;

    const data = {
      url,
      synth,
      baseNote: baseNoteCsv || undefined,
      sourceBaseNote: sourceBaseNoteCsv || undefined,
      volume: volumeCsv || undefined,
    };
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
      // Adjust playback rate for pitch using the shared playback anchor.
      // Do not silently swap this to sourceBaseNote/raw detected pitch metadata,
      // or instrument changes across toys would stop preserving the same note.
      // Prefer explicit baseNote from options, then entry metadata, else C4.
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
    // Envelope: optional per-note ADS-like for strums
    const env = options && (options.env || options.strumEnv);
    if (env && typeof env.decaySec === 'number' && env.decaySec > 0){
      try{
        const d = Math.max(0.08, env.decaySec);
        const r = Math.max(0.12, Number(env.releaseSec)||0.8);
        const sustainLevel = Math.max(0.05, Math.min(0.6, Number(env.sustainLevel)||0.22));
        const atk = Math.min(0.012, d * 0.06); // tiny fade-in to avoid clicks
        g.gain.setValueAtTime(0.0001, tStart);
        // Attack to full gain
        g.gain.exponentialRampToValueAtTime(Math.max(0.002, gain), tStart + atk);
        // Decay down to sustain level over d seconds
        g.gain.linearRampToValueAtTime(Math.max(0.001, gain * sustainLevel), tStart + d);
        // Release to silence over r seconds
        g.gain.exponentialRampToValueAtTime(0.0001, tStart + d + r);
      }catch{
        g.gain.value = gain;
      }
    } else {
      g.gain.value = gain;
    }
    src.connect(g).connect(getToyGain(toyId||'master'));
    try{ registerActiveNode(src); }catch{}
    const __startAt = tStart;
    if (window && window.BOUNCER_LOOP_DBG) {
      try { console.log('[audio-samples] start', id, noteName||'C4', 'in', (__startAt - ctx.currentTime).toFixed(3)); } catch (e) {}
    }
    src.start(__startAt);
    try{ __trackScheduledSample(toyId||'master', src, __startAt); }catch{}
    // If envelope provided, schedule stop a bit after decay to avoid truncation clicks
    try{
      if (env && typeof env.decaySec === 'number' && env.decaySec > 0){
        const d = Math.max(0.08, env.decaySec);
        const r = Math.max(0.12, Number(env.releaseSec)||0.8);
        src.stop(__startAt + d + r + 0.3);
      }
    }catch{}
    return true;
  }

  // synth fallback for entry with synth id
  const synthId = ent && ent.synth;
  if (synthId){
    const sNorm = String(synthId||'').toLowerCase().replace(/_/g,'-');
    const toneId = TONE_NAMES.includes(sNorm) ? sNorm : 'tone';
    return playById(toneId, noteToFreq(noteName||'C4'), when||ctx.currentTime, getToyGain(toyId||'master'), gain, options);
  }
  return false;
}

export function triggerInstrument(instrument, noteName='C4', when, toyId, options = {}, velocity = 1.0){
  const ctx = ensureAudioContext();
  const id  = normId(instrument || 'TONE');
  const resolvedNote = resolveOctaveForToy(noteName, toyId, options, id);
  const t   = safeStartTime(ctx, when);
  const vel = Math.max(0.001, Math.min(1.0, velocity));
  try{
    if (toyId && toyId !== 'master') {
      const slotIndex = Number.isFinite(Number(options?.slotIndex)) ? Math.trunc(Number(options.slotIndex)) : null;
      const col = Number.isFinite(Number(options?.col)) ? Math.trunc(Number(options.col)) : null;
      const step = Number.isFinite(Number(options?.step)) ? Math.trunc(Number(options.step)) : null;
      const index = Number.isFinite(Number(options?.index)) ? Math.trunc(Number(options.index)) : null;
      window.dispatchEvent(new CustomEvent('toy:note', {
        detail: {
          toyId: String(toyId),
          instrument: id,
          note: resolvedNote,
          slotIndex,
          col,
          step,
          index,
          velocity: Number.isFinite(Number(velocity)) ? Number(velocity) : null,
          when: Number.isFinite(Number(t)) ? Number(t) : null,
        }
      }));
    }
  }catch{}

  // If id looks like a tone name in friendly form, normalize spaces/underscores/parentheses
  try{
    const idLoose = id.toLowerCase().replace(/[()]/g,'').replace(/[_\s]+/g,'-');
    // Common "tone (sine)" pattern: prefer the inner token if present
    const m = /\(([a-z-\s_]+)\)/.exec(id.toLowerCase());
    const inner = m ? m[1].trim().replace(/[_\s]+/g,'-') : '';
      if (inner && TONE_NAMES.includes(inner)) return playById(inner, noteToFreq(resolvedNote), t, getToyGain(toyId||'master'), vel, options);
      if (TONE_NAMES.includes(idLoose)) return playById(idLoose, noteToFreq(resolvedNote), t, getToyGain(toyId||'master'), vel, options);
    }catch{}

  // exact or alias match first
  if (window.__AUDIO_TIMING_PROBE) {
    try {
      const info = getLoopInfo?.();
      const barLen = Number(info?.barLen) || 0;
      const loopStart = Number(info?.loopStartTime) || 0;
      const now = ctx.currentTime;
      const leadMs = Math.round((t - now) * 1000);
      let shouldLog = false;
      let barIndex = null;
      if (Number.isFinite(barLen) && barLen > 0 && Number.isFinite(loopStart)) {
        barIndex = Math.floor((t - loopStart) / barLen);
        if (barIndex !== timingProbeState.lastBar) {
          timingProbeState.lastBar = barIndex;
          shouldLog = true;
        }
      } else {
        const ts = performance?.now?.() ?? Date.now();
        if (!timingProbeState.lastTs || (ts - timingProbeState.lastTs) > 1000) {
          timingProbeState.lastTs = ts;
          shouldLog = true;
        }
      }
      if (shouldLog) {
        console.log('[audio][timing]', { toyId, barIndex, leadMs });
        const delayMs = Math.max(0, (t - now) * 1000);
        setTimeout(() => {
          const driftMs = Math.round((ctx.currentTime - t) * 1000);
          console.log('[audio][timing][start]', { toyId, barIndex, driftMs });
          const warnMs = Number(window?.__AUDIO_TIMING_DRIFT_WARN_MS);
          const threshold = Number.isFinite(warnMs) ? warnMs : 15;
          if (barIndex != null && driftMs > threshold && timingProbeState.lastWarnBar !== barIndex) {
            timingProbeState.lastWarnBar = barIndex;
            console.warn('[audio][timing][warn]', { toyId, barIndex, driftMs, thresholdMs: threshold });
          }
        }, delayMs);
      }
    } catch {}
  }

  if (playSampleAt(id, t, vel, toyId, resolvedNote, options)) { try{ window.__toyActivityAt = ensureAudioContext().currentTime; }catch{}; return; }

  // try family (e.g., djembe_bass -> djembe)
  const fam = id.split('_')[0];
  if (fam !== id && playSampleAt(fam, t, vel, toyId, resolvedNote, options)) { try{ window.__toyActivityAt = ensureAudioContext().currentTime; }catch{}; return; }

  // synth alias fallback: if an entry exists whose synth matches the id, use that tone
  try{
    for (const ent of entries.values()){
      const s = (ent && ent.synth) ? String(ent.synth).toLowerCase() : '';
      const sNorm = s.replace(/_/g,'-');
      const iNorm = id.replace(/[()]/g,'').replace(/[_\s]+/g,'-');
      if (s && (s === id || sNorm === id || s === iNorm || sNorm === iNorm)){
        const toneId2 = TONE_NAMES.includes(sNorm) ? sNorm : (TONE_NAMES.includes(s) ? s : 'tone');
        const ok = playById(toneId2, noteToFreq(resolvedNote), t, getToyGain(toyId||'master'), vel);
        if (ok) { try{ window.__toyActivityAt = ensureAudioContext().currentTime; }catch{} }
        return ok;
      }
    }
  }catch{}

  // If we've reached here, no sample or synth alias was found for 'id'.
  // Before falling back to a generic tone, try 'acoustic_guitar' as a last resort for samples.
  if (id !== 'acoustic_guitar' && playSampleAt('acoustic_guitar', t, vel, toyId, resolvedNote, options)) {
    console.warn(`[audio] instrument not found: '${id}' — using fallback 'acoustic_guitar'`);
    try { window.__toyActivityAt = ensureAudioContext().currentTime; } catch {}
    return; // Successfully played fallback sample
  }

  // synth fallback
  const toneId = TONE_NAMES.includes(id) ? id : 'tone';
  try{
    if (!TONE_NAMES.includes(id)) {
      // No sample match and not a known tone name; log for diagnostics
      console.warn('[audio] instrument not found:', id, '— using', toneId);
    }
  }catch{}
  const ok = playById(toneId, noteToFreq(resolvedNote), t, getToyGain(toyId||'master'), vel, options);
  if (ok) { try{ window.__toyActivityAt = ensureAudioContext().currentTime; }catch{} }
  return ok;
}

// Tiny debug API
window.AudioDebug = {
  list: ()=> Array.from(new Set([ ...entries.keys(), ...buffers.keys() ])).sort(),
  has: (k)=> entries.has(normId(k)) || buffers.has(normId(k))
};

