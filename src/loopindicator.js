// src/loopindicator.js
import { ensureAudioContext, getLoopInfo } from './audio-core.js';

/**
 * Create a single pulsing red loop indicator.
 * - Strong pulse on full loop start
 * - Lighter pulse on each quarter
 */
export function createLoopIndicator(targetSelector = 'body'){
  const host = (typeof targetSelector === 'string') ? document.querySelector(targetSelector) : targetSelector;
  const el = document.createElement('div');
  el.style.cssText = `
    position: fixed;
    right: 12px;
    top: 12px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #d22;
    box-shadow: 0 0 0 0 rgba(220,0,0,0.0);
    transform: scale(1);
    z-index: 9999;
    pointer-events: none;
  `;
  host.appendChild(el);

  let lastQuarter = -1;
  let lastBarId = 0;
  let rafId;

  function animate(){
    const ac = ensureAudioContext();
    const { loopStartTime, barLen } = getLoopInfo();
    const now = ac.currentTime;
    const t = ((now - loopStartTime) % barLen + barLen) % barLen;
    const pct = barLen ? t / barLen : 0;

    // Detect quarter transitions
    const quarter = Math.floor(pct * 4 + 1e-6);
    if (quarter !== lastQuarter){
      const strong = (quarter === 0); // reset case when we loop
      pulse(strong ? 1.0 : 0.55);
      lastQuarter = quarter;
      if (strong) lastBarId++;
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

  animate();
  return { element: el };
}
