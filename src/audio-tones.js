// src/audio-tones.js — tone synths (includes 'alien')
import { ensureAudioContext } from './audio-core.js';

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
  const m = /^([A-G]#?)(-?\d)$/.exec(String(note).trim());
  if (!m) return 440;
  const [_, n, o] = m;
  const idx = NOTE.indexOf(n);
  const midi = (Number(o) + 1) * 12 + idx;
  return 440 * Math.pow(2, (midi - 69)/12);
}

function playKeypadAt(freq, when){
  const acx = ensureAudioContext(); const t0 = when;
  const osc1 = acx.createOscillator(); osc1.type='sine';    osc1.frequency.value=freq;
  const osc2 = acx.createOscillator(); osc2.type='triangle';osc2.frequency.value=freq*2;
  const ping = acx.createOscillator(); ping.type='sine';    ping.frequency.value=freq*3.2;
  const bp = acx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=freq*2; bp.Q.value=6;
  const g = envGain(acx, t0, [{t:0.00,v:0.0001},{t:0.01,v:0.28},{t:0.18,v:0.14},{t:0.45,v:0.0008}]);
  osc1.connect(bp); osc2.connect(bp); ping.connect(bp); bp.connect(g).connect(acx.destination);
  osc1.start(t0); osc2.start(t0); ping.start(t0+0.005);
  osc1.stop(t0+0.55); osc2.stop(t0+0.55); ping.stop(t0+0.25);
}
function playPopAt(freq, when){
  const acx = ensureAudioContext(); const t0=when;
  const noise = acx.createBufferSource();
  const len = Math.max(1, Math.floor(acx.sampleRate * 0.25));
  const buffer = acx.createBuffer(1, len, acx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i=0;i<data.length;i++){ const amp = 1 - i/len; data[i] = (Math.random()*2-1)*amp; }
  noise.buffer = buffer;
  const bp = acx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=freq; bp.Q.value=10;
  const g = envGain(acx, t0, [{t:0.00,v:0.0001},{t:0.004,v:0.6},{t:0.20,v:0.001}]);
  noise.connect(bp).connect(g).connect(acx.destination);
  noise.start(t0); noise.stop(t0+0.22);
}
function playPadAt(freq, when){
  const acx = ensureAudioContext(); const t0=when;
  const osc = acx.createOscillator(); osc.type='triangle'; osc.frequency.value=freq;
  const lp  = acx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=freq*3;
  const g = envGain(acx, t0, [{t:0.00,v:0.0001},{t:0.05,v:0.20},{t:0.35,v:0.10},{t:0.65,v:0.0008}]);
  osc.connect(lp).connect(g).connect(acx.destination);
  osc.start(t0); osc.stop(t0+0.7);
}
function playRetroAt(freq, when, wave){
  const acx = ensureAudioContext(); const t0=when;
  const osc = acx.createOscillator(); osc.type=wave; osc.frequency.value=freq;
  const g = envGain(acx, t0, [{t:0.00,v:0.0001},{t:0.01,v:0.22},{t:0.18,v:0.0008}]);
  const lp = acx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=Math.min(12000, freq*6);
  osc.connect(lp).connect(g).connect(acx.destination);
  osc.start(t0); osc.stop(t0+0.25);
}
function playLaserAt(freq, when){
  const acx = ensureAudioContext(); const t0=when;
  const osc = acx.createOscillator(); osc.type='sawtooth'; osc.frequency.setValueAtTime(freq*2, t0);
  osc.frequency.exponentialRampToValueAtTime(freq/4, t0+0.3);
  const g = envGain(acx, t0, [{t:0.00,v:0.0001},{t:0.01,v:0.35},{t:0.3,v:0.0008}]);
  osc.connect(g).connect(acx.destination);
  osc.start(t0); osc.stop(t0+0.31);
}
function playWindyAt(freq, when){
  const acx = ensureAudioContext(); const t0=when;
  const noise = acx.createBufferSource();
  const len = Math.floor(acx.sampleRate * 0.4);
  const buffer = acx.createBuffer(1, len, acx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i=0;i<data.length;i++) data[i] = (Math.random()*2-1) * (1 - i/len);
  noise.buffer = buffer;
  const bp = acx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=freq; bp.Q.value=1;
  const g = envGain(acx, t0, [{t:0.00,v:0.0001},{t:0.05,v:0.28},{t:0.4,v:0.0008}]);
  noise.connect(bp).connect(g).connect(acx.destination);
  noise.start(t0); noise.stop(t0+0.42);
}
function playAlienAt(freq, when){
  const acx = ensureAudioContext(); const t0=when;
  const carrier = acx.createOscillator(); carrier.type='sine'; carrier.frequency.value=freq;
  const mod = acx.createOscillator(); mod.type='sine'; mod.frequency.value=6;
  const modGain = acx.createGain(); modGain.gain.value = freq*0.5;
  mod.connect(modGain).connect(carrier.frequency);
  const g = envGain(acx, t0, [{t:0.00,v:0.0001},{t:0.01,v:0.25},{t:0.6,v:0.0008}]);
  carrier.connect(g).connect(acx.destination);
  carrier.start(t0); mod.start(t0);
  carrier.stop(t0+0.62); mod.stop(t0+0.62);
}
function playOrganishAt(freq, when){
  const acx = ensureAudioContext(); const t0=when;
  const g = envGain(acx, t0, [{t:0.00,v:0.0001},{t:0.02,v:0.22},{t:0.4,v:0.0008}]);
  [0,0.5,-0.5].forEach(detune => {
    const osc = acx.createOscillator(); osc.type='triangle'; osc.frequency.value=freq * Math.pow(2, detune/12);
    osc.connect(g);
    osc.start(t0); osc.stop(t0+0.42);
  });
  g.connect(acx.destination);
}
function playDropletAt(freq, when){
  const acx = ensureAudioContext(); const t0=when;
  const osc = acx.createOscillator(); osc.type='sine';
  osc.frequency.setValueAtTime(freq*2, t0);
  osc.frequency.exponentialRampToValueAtTime(freq/3, t0+0.25);
  const g = envGain(acx, t0, [{t:0.00,v:0.0001},{t:0.01,v:0.3},{t:0.25,v:0.0008}]);
  osc.connect(g).connect(acx.destination);
  osc.start(t0); osc.stop(t0+0.26);
}
export function playToneAt(freq, when){
  const acx = ensureAudioContext(); const o = acx.createOscillator(); const g = acx.createGain();
  o.type='sine'; o.frequency.value=freq; g.gain.setValueAtTime(0.22, when); g.gain.exponentialRampToValueAtTime(0.0001, when+0.25);
  o.connect(g); g.connect(acx.destination); o.start(when); o.stop(when+0.26);
}

export function playById(id, freq, when){
  const s = (id||'').toLowerCase();
  if (s.includes('keypad') || s.includes('chime')) return playKeypadAt(freq, when);
  if (s.includes('pop') || s.includes('pluck'))  return playPopAt(freq, when);
  if (s.includes('pad'))                         return playPadAt(freq, when);
  if (s.includes('retro-square'))                return playRetroAt(freq, when, 'square');
  if (s.includes('retro-saw'))                   return playRetroAt(freq, when, 'sawtooth');
  if (s.includes('retro-tri') || s.includes('retro-triangle')) return playRetroAt(freq, when, 'triangle');
  if (s.includes('laser'))                       return playLaserAt(freq, when);
  if (s.includes('wind') || s.includes('windy')) return playWindyAt(freq, when);
  if (s.includes('alien'))                       return playAlienAt(freq, when);
  if (s.includes('organ'))                       return playOrganishAt(freq, when);
  if (s.includes('drop'))                        return playDropletAt(freq, when);
  return playToneAt(freq, when);
}

// for instrument list convenience
export const TONE_NAMES = ['tone','Alien','Retro-Square','Retro-Saw','Retro-Triangle','Keypad','Pop','Pad','Laser','Windy','Organ','Droplet'];
