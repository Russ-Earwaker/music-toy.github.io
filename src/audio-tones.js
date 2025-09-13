// src/audio-tones.js — tone synths (<=300 lines)
import { ensureAudioContext } from './audio-core.js';
export const TONE_NAMES = ['keypad','chime','pop','pluck','pad','retro-square','retro-saw','retro-triangle','laser','wind','alien','fm','organ','drop','bleep','sine','tone'];

function envGain(acx, t0, points){
  const g = acx.createGain();
  const p0 = points[0]; g.gain.setValueAtTime(p0.v, t0 + p0.t);
  for (let i=1;i<points.length;i++){ const p=points[i]; g.gain.linearRampToValueAtTime(p.v, t0 + p.t); }
  return g;
}
export function noteToFreq(note='C4'){
  const NOTE = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const m = /^([A-G]#?)(-?\d+)$/.exec(String(note).toUpperCase().trim()); if (!m) return 440;
  const nn = NOTE.indexOf(m[1]); const oct = parseInt(m[2],10); const midi = (oct+1)*12 + nn; return 440*Math.pow(2,(midi-69)/12);
}
export function playToneAt(freq, when, dest){
  const acx = ensureAudioContext(); const o=acx.createOscillator(); const g=acx.createGain();
  o.type='sine'; o.frequency.setValueAtTime(Math.max(1,Number(freq)||440), when);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(0.25, when+0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, when+0.25);
  o.connect(g).connect(dest||acx.destination); o.start(when); o.stop(when+0.26);
}
function playKeypadAt(freq, when, dest){
  const acx = ensureAudioContext(), t0=when;
  const g = envGain(acx,t0,[{t:0,v:0.0001},{t:0.01,v:0.28},{t:0.18,v:0.0008}]);
  const o1=acx.createOscillator(), o2=acx.createOscillator(); o1.type='square'; o2.type='square';
  o1.frequency.setValueAtTime(freq, t0); o2.frequency.setValueAtTime(freq*2, t0);
  o1.connect(g); o2.connect(g); g.connect(dest||acx.destination); o1.start(t0); o2.start(t0); o1.stop(t0+0.2); o2.stop(t0+0.2);
}
function playPopAt(freq, when, dest){
  const acx=ensureAudioContext(), t0=when; const o=acx.createOscillator(); o.type='sine'; o.frequency.setValueAtTime(freq, t0);
  const g=envGain(acx,t0,[{t:0,v:0.0001},{t:0.006,v:0.35},{t:0.12,v:0.0008}]); o.connect(g).connect(dest||acx.destination);
  o.start(t0); o.stop(t0+0.14);
}
function playPadAt(freq, when, dest){
  const acx=ensureAudioContext(), t0=when; const o=acx.createOscillator(); o.type='triangle'; o.frequency.setValueAtTime(freq, t0);
  const g=envGain(acx,t0,[{t:0,v:0.0001},{t:0.20,v:0.3},{t:0.80,v:0.15},{t:1.20,v:0.0008}]);
  const lp=acx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=Math.max(50,freq*2); lp.Q.value=0.5;
  o.connect(lp).connect(g).connect(dest||acx.destination); o.start(t0); o.stop(t0+1.25);
}
function playRetroAt(freq, when, wave, dest){
  const acx=ensureAudioContext(), t0=when; const o=acx.createOscillator(); o.type=wave; o.frequency.setValueAtTime(freq, t0);
  const g=envGain(acx,t0,[{t:0,v:0.0001},{t:0.01,v:0.25},{t:0.25,v:0.0008}]); o.connect(g).connect(dest||acx.destination); o.start(t0); o.stop(t0+0.27);
}
function playLaserAt(freq, when, dest){
  const acx=ensureAudioContext(), t0=when; const o=acx.createOscillator(); o.type='sawtooth';
  const f0=Math.max(30,freq*2); o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20,freq/3), t0+0.5);
  const g=envGain(acx,t0,[{t:0,v:0.0001},{t:0.02,v:0.25},{t:0.5,v:0.0008}]); o.connect(g).connect(dest||acx.destination); o.start(t0); o.stop(t0+0.52);
}
function playWindyAt(freq, when, dest){
  const acx=ensureAudioContext(), t0=when; const n=acx.createBufferSource();
  const buf=acx.createBuffer(1, acx.sampleRate*0.25, acx.sampleRate); const ch=buf.getChannelData(0);
  for(let i=0;i<ch.length;i++){ ch[i]=(Math.random()*2-1)*0.4; }
  const bp=acx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=Math.max(50,freq); bp.Q.value=3;
  const g=envGain(acx,t0,[{t:0,v:0.0001},{t:0.04,v:0.25},{t:0.25,v:0.0008}]);
  n.buffer=buf; n.connect(bp).connect(g).connect(dest||acx.destination); n.start(t0); n.stop(t0+0.26);
}
function playAlienAt(freq, when, dest){
  const acx=ensureAudioContext(), t0=when; const mod=acx.createOscillator(), car=acx.createOscillator();
  mod.type='sine'; car.type='sine'; car.frequency.setValueAtTime(freq, t0); mod.frequency.setValueAtTime(Math.max(0.5,freq*0.25), t0);
  const mg=acx.createGain(); mg.gain.value = Math.max(1, freq*0.5); mod.connect(mg).connect(car.frequency);
  const g=envGain(acx,t0,[{t:0,v:0.0001},{t:0.02,v:0.22},{t:0.5,v:0.0008}]); car.connect(g).connect(dest||acx.destination);
  mod.start(t0); car.start(t0); mod.stop(t0+0.52); car.stop(t0+0.52);
}
function playOrganishAt(freq, when, dest){
  const acx=ensureAudioContext(), t0=when; const g=envGain(acx,t0,[{t:0,v:0.0001},{t:0.02,v:0.22},{t:0.40,v:0.0008}]);
  [0,0.5,-0.5].forEach(det=>{ const o=acx.createOscillator(); o.type='triangle'; o.frequency.setValueAtTime(freq*Math.pow(2,det/12), t0); o.connect(g); o.start(t0); o.stop(t0+0.42); });
  g.connect(dest||acx.destination);
}
function playDropletAt(freq, when, dest){
  const acx=ensureAudioContext(), t0=when; const o=acx.createOscillator(); o.type='sine';
  o.frequency.setValueAtTime(freq*2, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20,freq/3), t0+0.25);
  const g=envGain(acx,t0,[{t:0,v:0.0001},{t:0.01,v:0.30},{t:0.25,v:0.0008}]); o.connect(g).connect(dest||acx.destination);
  o.start(t0); o.stop(t0+0.26);
}
export function playById(id, freq, when, dest, velocity = 1.0, options = {}){
  const s=String(id||'tone').toLowerCase();
  const f=Math.max(20, Number(freq)||440); const t=Math.max(0, Number(when)||ensureAudioContext().currentTime);

  // NEW: Check for a strum envelope first. If present, use a generic oscillator
  // that respects the longer decay time. This is crucial for the Chord Wheel.
  const env = options?.env || options?.strumEnv;
  if (env && typeof env.decaySec === 'number' && env.decaySec > 0) {
    const acx = ensureAudioContext();
    const o = acx.createOscillator();
    // Try to use the specified wave type, default to triangle for a pleasant tone.
    const waveType = TONE_NAMES.includes(s.replace('retro-','')) ? s.replace('retro-','') : 'triangle';
    try { o.type = waveType; } catch { o.type = 'triangle'; }
    o.frequency.setValueAtTime(f, t);
    const g = acx.createGain();
    const d = Math.max(0.08, env.decaySec);
    const atk = Math.min(0.006, d * 0.08);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, velocity), t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(dest || acx.destination);
    o.start(t);
    o.stop(t + d + 0.12);
    return true; // Handled
  }

  // Original logic for short, percussive synth sounds
  if (s.includes('keypad')||s.includes('chime')) return playKeypadAt(f,t,dest);
  if (s.includes('pop')||s.includes('pluck'))  return playPopAt(f,t,dest);
  if (s.includes('pad'))                       return playPadAt(f,t,dest);
  if (s.includes('retro-square'))              return playRetroAt(f,t,'square',dest);
  if (s.includes('retro-saw'))                 return playRetroAt(f,t,'sawtooth',dest);
  if (s.includes('retro-tri')||s.includes('retro-triangle')) return playRetroAt(f,t,'triangle',dest);
  if (s.includes('laser'))                     return playLaserAt(f,t,dest);
  if (s.includes('wind'))                      return playWindyAt(f,t,dest);
  if (s.includes('alien')||s.includes('fm'))   return playAlienAt(f,t,dest);
  if (s.includes('organ'))                     return playOrganishAt(f,t,dest);
  if (s.includes('drop')||s.includes('bleep')) return playDropletAt(f,t,dest);
  return playToneAt(f,t,dest);
}
