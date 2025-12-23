// src/audio-tones.js — tone synths (<=300 lines)
import { ensureAudioContext, registerActiveNode } from './audio-core.js';
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
  try{ registerActiveNode(o); }catch{}
}
function playKeypadAt(freq, when, dest){
  const acx = ensureAudioContext(), t0=when;
  const g = envGain(acx,t0,[{t:0,v:0.0001},{t:0.01,v:0.28},{t:0.18,v:0.0008}]);
  const o1=acx.createOscillator(), o2=acx.createOscillator(); o1.type='square'; o2.type='square';
  o1.frequency.setValueAtTime(freq, t0); o2.frequency.setValueAtTime(freq*2, t0);
  o1.connect(g); o2.connect(g); g.connect(dest||acx.destination); o1.start(t0); o2.start(t0); o1.stop(t0+0.2); o2.stop(t0+0.2);
  try{ registerActiveNode(o1); registerActiveNode(o2); }catch{}
}
function playPopAt(freq, when, dest){
  const acx=ensureAudioContext(), t0=when; const o=acx.createOscillator(); o.type='sine'; o.frequency.setValueAtTime(freq, t0);
  const g=envGain(acx,t0,[{t:0,v:0.0001},{t:0.006,v:0.35},{t:0.12,v:0.0008}]); o.connect(g).connect(dest||acx.destination);
  o.start(t0); o.stop(t0+0.14);
  try{ registerActiveNode(o); }catch{}
}
function playPadAt(freq, when, dest){
  const acx=ensureAudioContext(), t0=when; const o=acx.createOscillator(); o.type='triangle'; o.frequency.setValueAtTime(freq, t0);
  const g=envGain(acx,t0,[{t:0,v:0.0001},{t:0.20,v:0.3},{t:0.80,v:0.15},{t:1.20,v:0.0008}]);
  const lp=acx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=Math.max(50,freq*2); lp.Q.value=0.5;
  o.connect(lp).connect(g).connect(dest||acx.destination); o.start(t0); o.stop(t0+1.25);
  try{ registerActiveNode(o); }catch{}
}
function playRetroAt(freq, when, wave, dest){
  const acx=ensureAudioContext(), t0=when; const o=acx.createOscillator(); o.type=wave; o.frequency.setValueAtTime(freq, t0);
  const g=envGain(acx,t0,[{t:0,v:0.0001},{t:0.01,v:0.25},{t:0.25,v:0.0008}]); o.connect(g).connect(dest||acx.destination); o.start(t0); o.stop(t0+0.27);
  try{ registerActiveNode(o); }catch{}
}
function playLaserAt(freq, when, dest){
  const acx=ensureAudioContext(), t0=when; const o=acx.createOscillator(); o.type='sawtooth';
  const f0=Math.max(30,freq*2); o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20,freq/3), t0+0.5);
  const g=envGain(acx,t0,[{t:0,v:0.0001},{t:0.02,v:0.25},{t:0.5,v:0.0008}]); o.connect(g).connect(dest||acx.destination); o.start(t0); o.stop(t0+0.52);
  try{ registerActiveNode(o); }catch{}
}
function playWindyAt(freq, when, dest){
  const acx=ensureAudioContext(), t0=when; const n=acx.createBufferSource();
  const buf=acx.createBuffer(1, acx.sampleRate*0.25, acx.sampleRate); const ch=buf.getChannelData(0);
  for(let i=0;i<ch.length;i++){ ch[i]=(Math.random()*2-1)*0.4; }
  const bp=acx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=Math.max(50,freq); bp.Q.value=3;
  const g=envGain(acx,t0,[{t:0,v:0.0001},{t:0.04,v:0.25},{t:0.25,v:0.0008}]);
  n.buffer=buf; n.connect(bp).connect(g).connect(dest||acx.destination); n.start(t0); n.stop(t0+0.26);
  try{ registerActiveNode(n); }catch{}
}
function playAlienAt(freq, when, dest){
  const acx = ensureAudioContext();
  const t0 = when;

  // Respect incoming freq (fallback to C4 if missing)
  const base = (Number.isFinite(freq) && freq > 0) ? freq : noteToFreq('C4');

  // --- Core voice: 2 oscillators + gentle FM ---
  const oscA = acx.createOscillator(); // bright body
  const oscB = acx.createOscillator(); // hollow ghost
  const mod  = acx.createOscillator(); // FM modulator
  const modG = acx.createGain();

  oscA.type = 'sawtooth';
  oscB.type = 'triangle';
  mod.type  = 'sine';

  // Base pitch + slight detune for character
  oscA.frequency.setValueAtTime(base, t0);
  oscB.frequency.setValueAtTime(base * Math.pow(2, 18/1200), t0);

  // FM: subtle "alien throat" wobble (not harsh)
  mod.frequency.setValueAtTime(28, t0);
  mod.frequency.exponentialRampToValueAtTime(12, t0 + 0.9);
  modG.gain.setValueAtTime(base * 0.018, t0);     // depth
  modG.gain.exponentialRampToValueAtTime(base * 0.028, t0 + 0.35);
  modG.gain.exponentialRampToValueAtTime(base * 0.010, t0 + 1.4);

  mod.connect(modG);
  modG.connect(oscA.frequency);
  modG.connect(oscB.frequency);

  // --- Pitch vibrato (wobbley but toy-friendly) ---
  const vib = acx.createOscillator();
  const vibG = acx.createGain();
  vib.type = 'sine';
  // Slightly slower wobble reads more "wobbley", less "nervous"
  vib.frequency.setValueAtTime(2.2, t0);
  vib.frequency.exponentialRampToValueAtTime(3.0, t0 + 0.7);
  vib.frequency.exponentialRampToValueAtTime(2.0, t0 + 1.6);

  // Bigger cents depth so it's clearly audible
  const vibHz = base * Math.log(2) * (48 / 1200); // ~48 cents
  vibG.gain.setValueAtTime(vibHz, t0);
  vib.connect(vibG);
  vibG.connect(oscA.frequency);
  vibG.connect(oscB.frequency);

  // --- “Mouth” / formant filtering for alien-voice character ---
  const formant = acx.createBiquadFilter();
  const lp      = acx.createBiquadFilter();

  formant.type = 'bandpass';
  formant.Q.setValueAtTime(12, t0);
  formant.frequency.setValueAtTime(base * 2.2, t0); // vowel-ish region
  formant.frequency.exponentialRampToValueAtTime(base * 4.6, t0 + 0.55);
  formant.frequency.exponentialRampToValueAtTime(base * 1.8, t0 + 1.45);

  lp.type = 'lowpass';
  lp.Q.setValueAtTime(0.7, t0);
  lp.frequency.setValueAtTime(Math.min(2200, base * 7.5), t0);
  lp.frequency.exponentialRampToValueAtTime(Math.min(1600, base * 5.5), t0 + 0.6);
  lp.frequency.exponentialRampToValueAtTime(Math.min(2000, base * 6.5), t0 + 1.6);

  // Slow formant motion for “alive” feeling
  const mouth = acx.createOscillator();
  const mouthG = acx.createGain();
  mouth.type = 'sine';
  mouth.frequency.setValueAtTime(0.18, t0);
  mouthG.gain.setValueAtTime(180, t0);
  mouth.connect(mouthG);
  mouthG.connect(formant.frequency);

  // --- Amp + gentle tremolo for spooky flutter ---
  const amp = acx.createGain();
  amp.gain.setValueAtTime(1.25, t0);

  const trem = acx.createOscillator();
  const tremG = acx.createGain();
  trem.type = 'sine';
  trem.frequency.setValueAtTime(0.9, t0);
  tremG.gain.setValueAtTime(0.06, t0);
  trem.connect(tremG);
  tremG.connect(amp.gain);

  // --- Spooky tail: feedback delay (small, fun, not a mess) ---
  const dry = acx.createGain();
  const wet = acx.createGain();
  const mix = acx.createGain();

  const delay = acx.createDelay(1.0);
  const fb    = acx.createGain();

  delay.delayTime.setValueAtTime(0.23, t0);
  fb.gain.setValueAtTime(0.62, t0);

  // Wet/dry
  dry.gain.setValueAtTime(0.74, t0);
  wet.gain.setValueAtTime(0.26, t0);

  // --- Envelope (longer, more character) ---
  // Longer note with clear "arrival" and spooky decay
  const g = envGain(acx, t0, [
    {t:0.00, v:0.0001},
    {t:0.05, v:0.48},
    {t:0.35, v:0.36},
    {t:1.05, v:0.26},
    {t:1.70, v:0.0010}
  ]);

  // Routing
  // oscA+oscB -> formant -> lp -> amp -> split dry/wet -> mix -> env -> dest
  oscA.connect(formant);
  oscB.connect(formant);

  formant.connect(lp);
  lp.connect(amp);

  amp.connect(dry);
  amp.connect(delay);

  delay.connect(wet);
  delay.connect(fb);
  fb.connect(delay);

  dry.connect(mix);
  wet.connect(mix);

  mix.connect(g).connect(dest || acx.destination);

  // Start/stop
  const tEnd = t0 + 1.75;

  mod.start(t0); vib.start(t0); mouth.start(t0); trem.start(t0);
  oscA.start(t0); oscB.start(t0);

  mod.stop(tEnd); vib.stop(tEnd); mouth.stop(tEnd); trem.stop(tEnd);
  oscA.stop(tEnd); oscB.stop(tEnd);

  try{
    registerActiveNode(mod);
    registerActiveNode(vib);
    registerActiveNode(mouth);
    registerActiveNode(trem);
    registerActiveNode(oscA);
    registerActiveNode(oscB);
  }catch{}
}
function playOrganishAt(freq, when, dest){
  const acx=ensureAudioContext(), t0=when; const g=envGain(acx,t0,[{t:0,v:0.0001},{t:0.02,v:0.22},{t:0.40,v:0.0008}]);
  [0,0.5,-0.5].forEach(det=>{ const o=acx.createOscillator(); o.type='triangle'; o.frequency.setValueAtTime(freq*Math.pow(2,det/12), t0); o.connect(g); o.start(t0); o.stop(t0+0.42); try{ registerActiveNode(o); }catch{} });
  g.connect(dest||acx.destination);
}
function playDropletAt(freq, when, dest){
  const acx=ensureAudioContext(), t0=when; const o=acx.createOscillator(); o.type='sine';
  o.frequency.setValueAtTime(freq*2, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20,freq/3), t0+0.25);
  const g=envGain(acx,t0,[{t:0,v:0.0001},{t:0.01,v:0.30},{t:0.25,v:0.0008}]); o.connect(g).connect(dest||acx.destination);
  o.start(t0); o.stop(t0+0.26);
  try{ registerActiveNode(o); }catch{}
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
    try{ registerActiveNode(o); }catch{}
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
