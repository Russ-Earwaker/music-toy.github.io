// src/loopindicator.js
import { ensureAudioContext, getLoopInfo, getToyGain, bpm as currentBpm, isRunning } from './audio-core.js';

/**
 * Create a single pulsing red loop indicator.
 * - Strong pulse on full loop start
 * - Lighter pulse on each quarter
 */
export function createLoopIndicator(targetSelector = '#topbar'){
  const host = (typeof targetSelector === 'string') ? document.querySelector(targetSelector) : targetSelector;
  const attach = host || document.body;

  // Frame anchored to the right side of the header
  const frame = document.createElement('div');
  frame.style.cssText = `
    display: flex;
    align-items: center;
    gap: 10px;
    margin-left: auto; /* push to right in header */
    margin-right: 0;   /* hug the right edge inside header padding */
    margin-top: 40px;  /* push pod further down to avoid top clipping */
    padding: 6px 8px;
    background: rgba(0,0,0,0.25);
    border-radius: 10px;
    z-index: 9999;
  `;
  attach.appendChild(frame);

  const el = document.createElement('div');
  el.style.cssText = `
    width: 70px;
    height: 70px;
    border-radius: 50%;
    background: #d22;
    box-shadow: 0 0 0 0 rgba(220,0,0,0.0);
    transform: scale(1);
    pointer-events: none;
  `;
  

  const bpmLabel = document.createElement('span');
  bpmLabel.textContent = `${Math.round(currentBpm)} BPM`;
  bpmLabel.style.cssText = 'color:#fff;font:600 14px system-ui, sans-serif; opacity:0.9;';
  frame.appendChild(bpmLabel);

  const muteBtn = document.createElement('button');
  muteBtn.type = 'button';
  muteBtn.textContent = 'Unmute';
  muteBtn.style.cssText = 'padding:6px 10px; font:600 12px system-ui, sans-serif;';
  frame.appendChild(muteBtn);
  frame.appendChild(el); // circle on far right

  let lastQuarter = -1;
  let lastBarId = 0;
  let rafId;
  let muted = true;
  let metroBuf = null; // AudioBuffer for metronome sample
  let triedLoad = false;
  let running = true;

  muteBtn.addEventListener('click', () => {
    muted = !muted;
    muteBtn.textContent = muted ? 'Unmute' : 'Mute';
  });

  async function ensureMetronomeLoaded(){
    if (metroBuf || triedLoad) return !!metroBuf;
    triedLoad = true;
    const ctx = ensureAudioContext();
    const urls = [
      './assets/samples/metronome.wav',
      './assets/metronome.wav',
      './metronome.wav'
    ];
    for (const url of urls){
      try{
        const res = await fetch(url);
        if (!res.ok) continue;
        const ab = await res.arrayBuffer();
        metroBuf = await ctx.decodeAudioData(ab);
        break;
      }catch{}
    }
    return !!metroBuf;
  }

  function playClick(){
    if (muted) return;
    if (typeof isRunning==='function' && !isRunning()) return; // do not click while paused
    const ctx = ensureAudioContext();
    const now = ctx.currentTime;
    const toyId = 'metronome';
    if (metroBuf){
      const src = ctx.createBufferSource();
      src.buffer = metroBuf;
      const g = ctx.createGain();
      g.gain.value = 0.7;
      src.connect(g).connect(getToyGain(toyId));
      src.start(now);
      return;
    }
    // Fallback: short tick
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type='square';
    osc.frequency.value = 2000;
    g.gain.value = 0.0;
    osc.connect(g).connect(getToyGain(toyId));
    const t0 = now;
    g.gain.setValueAtTime(0.0, t0);
    g.gain.linearRampToValueAtTime(0.5, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
    osc.start(t0);
    osc.stop(t0 + 0.1);
  }

  function animate(){
    // If transport was paused externally, stop animating immediately
    try{ if (typeof isRunning==='function' && !isRunning()){ running=false; if (rafId){ cancelAnimationFrame(rafId); rafId=0; } return; } }catch{}
    if (!running){ rafId = 0; return; }
    const ac = ensureAudioContext();
    const { loopStartTime, barLen } = getLoopInfo();
    const now = ac.currentTime;
    const t = ((now - loopStartTime) % barLen + barLen) % barLen;
    const pct = barLen ? t / barLen : 0;
    bpmLabel.textContent = `${Math.round(currentBpm)} BPM`;

    // Detect quarter transitions
    const quarter = Math.floor(pct * 4 + 1e-6);
    if (quarter !== lastQuarter){
      const strong = (quarter === 0); // reset case when we loop
      pulse(strong ? 1.0 : 0.55);
      lastQuarter = quarter;
      if (strong) lastBarId++;

      // Always play metronome on quarter if not muted
      ensureMetronomeLoaded().then(()=> playClick());
    }

    // slight breathing based on pct
    const scale = 1 + 0.04 * Math.sin(pct * Math.PI * 2);
    el.style.transform = `scale(${scale.toFixed(3)})`;

    rafId = requestAnimationFrame(animate);
  }

  function pulse(intensity){
    // Big shadow burst that decays
    el.animate([
      { boxShadow: `0 0 0 0 rgba(220,0,0,${0.0})`, transform: el.style.transform },
      { boxShadow: `0 0 14px 6px rgba(255,40,40,${0.5*intensity})` },
      { boxShadow: `0 0 0 0 rgba(220,0,0,0)` }
    ], { duration: 220, easing: 'ease-out' });
    // brightness blink
    el.animate([
      { filter: 'brightness(1.0)' },
      { filter: `brightness(${1.0 + 0.8*intensity})` },
      { filter: 'brightness(1.0)' }
    ], { duration: 180, easing: 'ease-out' });
  }

  // Transport control: pause stops RAF and clicks; resume restarts aligned to current quarter
  try{
    document.addEventListener('transport:pause', ()=>{
      running = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    });
    document.addEventListener('transport:resume', ()=>{
      // Sync lastQuarter to avoid an immediate extra click on resume
      try{
        const ac = ensureAudioContext();
        const { loopStartTime, barLen } = getLoopInfo();
        const now = ac.currentTime;
        const t = ((now - loopStartTime) % barLen + barLen) % barLen;
        lastQuarter = Math.floor((barLen ? (t / barLen) : 0) * 4 + 1e-6);
      }catch{}
      running = true;
      if (!rafId) rafId = requestAnimationFrame(animate);
    });
  }catch{}

  animate();
  return { element: el, frame };
}
