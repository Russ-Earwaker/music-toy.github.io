// src/auto-mix.js — polite per-toy mixer (adds a post-user auto GainNode per toy)
import { ensureAudioContext, getToyGain } from './audio-core.js';
import { getIntensity, listToys } from './intensity.js';

const AUTO_MIN = 0.7, AUTO_MAX = 1.0;
const ATTACK_MS = 260, RELEASE_MS = 80;
let enabled = true;
const state = new Map(); // id -> { node, value }

function ensureAutoNode(id){
  const key = String(id).toLowerCase();
  if (state.has(key)) return state.get(key);
  const ctx = ensureAudioContext();
  const base = getToyGain(key);
  const auto = ctx.createGain();
  auto.gain.value = 1.0;
  try {
    base.disconnect(); // rewire: base -> auto -> destination
  } catch{}
  try { base.connect(auto); auto.connect(ctx.destination); } catch{}
  const st = { node: auto, value: 1.0 };
  state.set(key, st);
  return st;
}

function targetFor(id){
  // Busier toys duck a touch; very quiet toys sit at 1.0
  const v = getIntensity(id); // [0..1]
  const t = AUTO_MAX - (v * (AUTO_MAX - AUTO_MIN));
  return t;
}

function stepTowards(cur, target, dt){
  const diff = target - cur;
  const speed = (diff > 0) ? (1/ATTACK_MS) : (1/RELEASE_MS);
  return cur + diff * Math.min(1, dt * speed * 1000);
}

let raf=0, lastT=0;
function loop(){
  const t = performance.now();
  const dt = lastT ? (t - lastT) / 1000 : 0.016;
  lastT = t;

  if (enabled){
    let ids = listToys();
    if (!ids.length) ids = ['master'];
    for (const id of ids){
      const st = ensureAutoNode(id);
      const target = targetFor(id);
      st.value = stepTowards(st.value, target, dt);
      try { st.node.gain.setTargetAtTime(st.value, ensureAudioContext().currentTime, 0.015); } catch { st.node.gain.value = st.value; }
    }
  }
  raf = requestAnimationFrame(loop);
}

export function startAutoMix(){ if (!raf) loop(); }
export function stopAutoMix(){ if (raf){ cancelAnimationFrame(raf); raf=0; } }
export function setAutoMixEnabled(v){ enabled = !!v; }
export function isAutoMixEnabled(){ return enabled; }
