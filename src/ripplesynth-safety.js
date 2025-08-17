// src/ripplesynth-safety.js
// Non-destructive guardrails: tiny runtime assertions + smoke checks.
// No side effects; only console warnings. Safe to import from main.js.

import { drawWaves } from './ripplesynth-waves.js';
import { drawParticles } from './ripplesynth-particles.js';
import { makeGetBlockRects } from './ripplesynth-rects.js';

/** Lightweight assertions to catch signature drift early */
export function assertRipplerContracts(){
  try{
    if (typeof drawWaves !== 'function' || drawWaves.length < 7){
      console.warn('[rippler/contracts] drawWaves signature unexpected (expected >=7 args)');
    }
    if (typeof drawParticles !== 'function' || drawParticles.length < 4){
      console.warn('[rippler/contracts] drawParticles signature unexpected (expected >=4 args)');
    }
    if (typeof makeGetBlockRects !== 'function' || makeGetBlockRects.length < 5){
      console.warn('[rippler/contracts] makeGetBlockRects signature unexpected (expected >=5 args)');
    }
    // Clock rule reminder
    console.info('[rippler/contracts] Clock: prefer ac.currentTime; avoid performance.now() in rippler modules.');
  }catch(e){
    console.warn('[rippler/contracts] assertion failed', e);
  }
}

/** Minimal smoke test: verifies canvases exist and have size. */
export function runRipplerSmoke(){
  try{
    const panels = document.querySelectorAll('.toy-panel[data-toy*="ripple"]');
    panels.forEach((panel)=>{
      const canvas = panel.querySelector('canvas');
      if (!canvas){
        console.warn('[rippler/smoke] no canvas for panel', panel);
        return;
      }
      const w = canvas.width|0, h = canvas.height|0;
      if (!w || !h){
        console.warn('[rippler/smoke] canvas has zero size', {w,h, panel});
      }
    });
  }catch(e){
    console.warn('[rippler/smoke] failed', e);
  }
}
