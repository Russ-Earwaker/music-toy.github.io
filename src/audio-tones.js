// src/audio-tones.js — tone synths (compact + per-toy dest support)
import { ensureAudioContext } from './audio-core.js';
export const TONE_NAMES = [
  'keypad','chime','pop','pluck','pad',
  'retro-square','retro-saw','retro-triangle',
  'laser','wind','alien','fm','organ','drop','bleep','sine','tone'
];


function envGain(acx, startTime, points){
  const g = acx.createGain();
  const p0 = points[0];
  g.gain.setValueAtTime(p0.v, startTime + p0.t);
  for (let i=1;i<points.length;i++){
    const p = points[i];
    g.gain.linearRampToValueAtTime(p.v, startTime + p.t);
  }
  return g;
}

export function noteToFreq(note='C4'){
  const NOTE = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const m = /^([A-G]#?)(-?\d+)$/.exec(String(note).toUpperCase().trim());
  if (!m) return 440;
  const nn = NOTE.indexOf(m[1]);
  const oct = parseInt(m[2],10);
  const midi = (oct+1)*12 + nn; // MIDI number
  return 440 * Math.pow(2, (midi-69)/12);
}

// --- Simple voices ---
export function playToneAt(freq, when, dest){
  const acx = ensureAudioContext();
  const o = acx.createOscillator();
  const g = acx.createGain();
  o.type='sine'; o.frequency.setValueAtTime(freq, when);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(0.25, when+0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, when+0.25);
  o.connect(g); g.connect(dest || acx.destination);
  o.start(when); o.stop(when+0.26);
}

function playKeypadAt(freq, when, dest){
  const acx = ensureAudioContext(); const t0 = when;
  const g = envGain(acx, t0, [{t:0.00,v:0.0001},{t:0.01,v:0.28},{t:0.18,v:0.0008}]);
  const o1 = acx.createOscillator(); o1.type='square'; o1.frequency.setValueAtTime(freq, t0);
  const o2 = acx.createOscillator(); o2.type='square'; o2.frequency.setValueAtTime(freq*2, t0);
  o1.connect(g); o2.connect(g); g.connect(dest || acx.destination);
  o1.start(t0); o2.start(t0); o1.stop(t0+0.2); o2.stop(t0+0.2);
}

function playPopAt(freq, when, dest){
  const acx = ensureAudioContext(); const t0 = when;
  const o = acx.createOscillator(); o.type='sine'; o.frequency.setValueAtTime(freq, t0);
  const g = envGain(acx, t0, [{t:0.00,v:0.0001},{t:0.006,v:0.35},{t:0.12,v:0.0008}]);
  o.connect(g).connect(dest || acx.destination);
  o.start(t0); o.stop(t0+0.14);
}

function playPadAt(freq, when, dest){
  const acx = ensureAudioContext(); const t0=when;
  const o = acx.createOscillator(); o.type='triangle'; o.frequency.setValueAtTime(freq, t0);
  const g = envGain(acx, t0, [{t:0.00,v:0.0001},{t:0.20,v:0.3},{t:0.80,v:0.15},{t:1.20,v:0.0008}]);
  const lp = acx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value = freq*2; lp.Q.value=0.5;
  o.connect(lp).connect(g).connect(dest || acx.destination);
  o.start(t0); o.stop(t0+1.25);
}

function playRetroAt(freq, when, wave, dest){
  const acx = ensureAudioContext(); const t0=when;
  const o = acx.createOscillator(); o.type = wave; o.frequency.setValueAtTime(freq, t0);
  const g = envGain(acx, t0, [{t:0.00,v:0.0001},{t:0.01,v:0.25},{t:0.25,v:0.0008}]);
  o.connect(g).connect(dest || acx.destination);
  o.start(t0); o.stop(t0+0.27);
}

function playLaserAt(freq, when, dest){
  const acx = ensureAudioContext(); const t0=when;
  const o = acx.createOscillator(); o.type='sawtooth'; o.frequency.setValueAtTime(freq*2, t0);
  o.frequency.exponentialRampToValueAtTime(freq/4, t0+0.30);
  const g = envGain(acx, t0, [{t:0.00,v:0.0001},{t:0.01,v:0.35},{t:0.30,v:0.0008}]);
  o.connect(g).connect(dest || acx.destination);
  o.start(t0); o.stop(t0+0.31);
}

function playWindyAt(freq, when, dest){
  const acx = ensureAudioContext(); const t0=when;
  const noise = acx.createBufferSource();
  const len = Math.floor(acx.sampleRate * 0.4);
  const buffer = acx.createBuffer(1, len, acx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i=0;i<data.length;i++) data[i] = (Math.random()*2-1) * (1 - i/len);
  noise.buffer = buffer;
  const bp = acx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=freq; bp.Q.value=1;
  const g = envGain(acx, t0, [{t:0.00,v:0.0001},{t:0.05,v:0.28},{t:0.40,v:0.0008}]);
  noise.connect(bp).connect(g).connect(dest || acx.destination);
  noise.start(t0); noise.stop(t0+0.42);
}

function playAlienAt(freq, when, dest){
  const acx = ensureAudioContext(); const t0=when;
  const carrier = acx.createOscillator(); carrier.type='sine'; carrier.frequency.value=freq;
  const mod = acx.createOscillator(); mod.type='sine'; mod.frequency.value=6;
  const modGain = acx.createGain(); modGain.gain.value = freq*0.5;
  mod.connect(modGain).connect(carrier.frequency);
  const g = envGain(acx, t0, [{t:0.00,v:0.0001},{t:0.02,v:0.25},{t:0.5,v:0.0008}]);
  carrier.connect(g).connect(dest || acx.destination);
  mod.start(t0); carrier.start(t0); mod.stop(t0+0.52); carrier.stop(t0+0.52);
}

function playOrganishAt(freq, when, dest){
  const acx = ensureAudioContext(); const t0=when;
  const g = envGain(acx, t0, [{t:0.00,v:0.0001},{t:0.02,v:0.22},{t:0.40,v:0.0008}]);
  [0,0.5,-0.5].forEach(detune => {
    const osc = acx.createOscillator(); osc.type='triangle'; 
    osc.frequency.value=freq * Math.pow(2, detune/12);
    osc.connect(g); osc.start(t0); osc.stop(t0+0.42);
  });
  g.connect(dest || acx.destination);
}

function playDropletAt(freq, when, dest){
  const acx = ensureAudioContext(); const t0=when;
  const o = acx.createOscillator(); o.type='sine';
  o.frequency.setValueAtTime(freq*2, t0);
  o.frequency.exponentialRampToValueAtTime(freq/3, t0+0.25);
  const g = envGain(acx, t0, [{t:0.00,v:0.0001},{t:0.01,v:0.30},{t:0.25,v:0.0008}]);
  o.connect(g).connect(dest || acx.destination);
  o.start(t0); o.stop(t0+0.26);
}

// Route name/id -> voice
export function playById(id, freq, when, dest){
  const s = (id||'').toLowerCase();
  if (s.includes('keypad') || s.includes('chime')) return playKeypadAt(freq, when, dest);
  if (s.includes('pop') || s.includes('pluck'))  return playPopAt(freq, when, dest);
  if (s.includes('pad'))                         return playPadAt(freq, when, dest);
  if (s.includes('retro-square'))                return playRetroAt(freq, when, 'square', dest);
  if (s.includes('retro-saw'))                   return playRetroAt(freq, when, 'sawtooth', dest);
  if (s.includes('retro-tri') || s.includes('retro-triangle')) return playRetroAt(freq, when, 'triangle', dest);
  if (s.includes('laser'))                       return playLaserAt(freq, when, dest);
  if (s.includes('wind'))                        return playWindyAt(freq, when, dest);
  if (s.includes('alien') || s.includes('fm'))   return playAlienAt(freq, when, dest);
  if (s.includes('organ'))                       return playOrganishAt(freq, when, dest);
  if (s.includes('drop') || s.includes('bleep')) return playDropletAt(freq, when, dest);
  // default
  return playToneAt(freq, when, dest);
}
