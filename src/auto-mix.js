// src/auto-mix.js — post-fader auto-mix (<=300 lines)
import { ensureAudioContext, getToyGain, getToyVolume, isToyMuted } from './audio-core.js';
import { getIntensity, listToys } from './intensity.js';

// Tunables
let ALPHA = 0.25;       // global reduction
let BETA  = 0.35;       // self reduction
let MIN_GAIN = 0.65;    // floor for autoMix multiplier
const ATTACK_S  = 0.050; // fast duck
const RELEASE_S = 0.300; // slower recovery
const REFRESH_HZ = 30;   // control-rate

let enabled = true;
let timer = null;

const clamp01 = v => Math.max(0, Math.min(1, v));
const lerp = (a,b,t) => a + (b-a)*t;

function getPriorityFor(id){
  try{
    const el = document.querySelector(`.toy-panel[data-toyid="${id}"]`);
    if (!el) return 0.5;
    const p = Number(el.dataset.priority);
    return Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : 0.5;
  }catch{ return 0.5; }
}

function computeTarget(id){
  const G = clamp01(getIntensity());       // room
  const T = clamp01(getIntensity(id));     // this toy
  const P = getPriorityFor(id);            // 0..1
  if (G < 0.02 && T < 0.02) return 1.0;    // idle dead-zone
  const base = 1 - ALPHA*G;
  const self = 1 - BETA*T;
  const prio = lerp(0.6, 1.0, P);
  return Math.max(MIN_GAIN, Math.min(1, base * self * prio));
}

function step(){
  const ctx = ensureAudioContext();
  const toys = listToys();
  for (const id of toys){
    if (isToyMuted(id)) continue;           // respect hard mutes
    const userVol = getToyVolume(id);       // slider value (stored)
    const node = getToyGain(id);            // per-toy bus
    const desired = userVol * computeTarget(id);
    const now = ctx.currentTime;
    const cur = node.gain.value;
    const tau = desired < cur ? ATTACK_S : RELEASE_S;
    try{
      node.gain.cancelAndHoldAtTime(now);
      node.gain.setTargetAtTime(desired, now, tau);
    }catch{
      node.gain.value = desired;
    }
  }
}

export function setAutoMixEnabled(v){
  enabled = !!v;
  if (!enabled && timer){ clearInterval(timer); timer=null; }
  if (enabled && !timer){ timer = setInterval(step, 1000/REFRESH_HZ); }
}
export function isAutoMixEnabled(){ return !!enabled; }

export function startAutoMix(){
  if (!timer && enabled) timer = setInterval(step, 1000/REFRESH_HZ);
  // expose for quick debugging
  window.autoMix = {
    enable: ()=>setAutoMixEnabled(true),
    disable: ()=>setAutoMixEnabled(false),
    set: (opts={})=>{
      if (opts.minGain!=null) MIN_GAIN = Math.max(0, Math.min(1, +opts.minGain));
      if (opts.alpha!=null) ALPHA = Math.max(0, Math.min(1, +opts.alpha));
      if (opts.beta!=null)  BETA  = Math.max(0, Math.min(1, +opts.beta));
    },
    get enabled(){ return enabled; }
  };
}

// Auto-start when module is loaded (safe if imported once)
startAutoMix();
