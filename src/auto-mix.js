// src/auto-mix.js — role‑aware Auto‑mix with zoom focus dip (<=300 lines)
import { ensureAudioContext, getToyGain, getToyVolume, isToyMuted } from './audio-core.js';
import { listToys, getIntensity } from './intensity.js';

/* ---------- utils ---------- */
const clamp01 = (x)=> Math.max(0, Math.min(1, x));
const lerp = (a,b,t)=> a + (b-a)*t;

/* ---------- DOM helpers ---------- */
function panelForId(id){
  try{
    const q = `.toy-panel[data-toyid="${id}"], .toy-panel[data-toy="${id}"]`;
    return document.querySelector(q);
  }catch{ return null; }
}
function isZoomed(id){
  const el = panelForId(id);
  return !!(el && (el.classList.contains('toy-zoomed') || el.dataset.zoomed === 'true'));
}
function anyZoomed(){
  try{
    return Array.from(document.querySelectorAll('.toy-panel'))
      .some(el => el.classList.contains('toy-zoomed') || el.dataset.zoomed === 'true');
  }catch{ return false; }
}
function getRoleFor(id){
  const el = panelForId(id);
  return (el?.dataset?.role || '').toLowerCase();
}

/* ---------- role curves ---------- */
function roleDefaults(role){
  switch(role){
    case 'lead':       return { prio: 0.85, minGain: 0.80, alpha: 0.15, beta: 0.25 };
    case 'bass':       return { prio: 0.75, minGain: 0.70, alpha: 0.22, beta: 0.30 };
    case 'percussion': return { prio: 0.60, minGain: 0.65, alpha: 0.30, beta: 0.35 };
    case 'perform':    return { prio: 0.95, minGain: 0.85, alpha: 0.12, beta: 0.20 };
    case 'pad':
    case 'fx':
    default:           return { prio: 0.50, minGain: 0.65, alpha: 0.25, beta: 0.35 };
  }
}
function leadHeat(){
  try{
    let h = 0;
    for (const id of listToys()){
      if (getRoleFor(id) === 'lead'){
        h = Math.max(h, clamp01(getIntensity(id)));
      }
    }
    return h;
  }catch{ return 0; }
}

/* ---------- public target function ---------- */
export function getAutoMixTarget(id){
  const G = clamp01(getIntensity());       // room energy
  const T = clamp01(getIntensity(id));     // this toy energy
  const role = getRoleFor(id);
  const d = roleDefaults(role);

  // priority: dataset override or role default
  const el = panelForId(id);
  const pAttr = el ? Number(el.dataset.priority) : NaN;
  let P = Number.isFinite(pAttr) ? clamp01(pAttr) : d.prio;
  if (isZoomed(id)) P = Math.max(P, 0.95); // zoom focus bump

  // idle dead‑zone
  if (G < 0.02 && T < 0.02) return 1.0;

  const alpha = d.alpha;      // global scaling
  const beta  = d.beta;       // self scaling
  const L = leadHeat();       // lead activity (0..1)

  let base = 1 - alpha*G;
  let self = 1 - beta*T;
  // non‑lead/perform yield a bit more when a lead is hot
  if (role !== 'lead' && role !== 'perform'){
    base *= (1 - 0.25*L);
  }

  const prio = lerp(0.6, 1.0, P);
  let target = base * self * prio;

  // If any toy is zoomed, push non‑zoomed toys down (flat scale to ~25%).
  const ZOOM_OTHERS_SCALE = 0.25;
  if (anyZoomed() && !isZoomed(id)){
    target *= ZOOM_OTHERS_SCALE;
    // allow below role minGain so the zoomed toy clearly stands out
    return clamp01(target);
  }

  const MIN_GAIN = 0.65; // global floor
  const minG = Math.max(MIN_GAIN, d.minGain);
  return Math.max(minG, clamp01(target));
}

/* ---------- engine loop ---------- */
const DUCK_ON_THRESH = 0.12;  // 12% drop to declare 'ducking on'
const DUCK_OFF_THRESH = 0.06; // 6% within base to declare 'ducking off' (hysteresis)

let ATTACK = 0.05;   // fast duck
let RELEASE = 0.30;  // recover
let __timer = null;

function step(){
  const ac = ensureAudioContext();
  const now = ac.currentTime;
  const ids = listToys();

  for (const id of ids){
    const panel = panelForId(id);

    // hard mute path
    if (isToyMuted(id)){
      const node = getToyGain(id);
      try{ node.gain.cancelAndHoldAtTime(now); node.gain.setTargetAtTime(0, now, 0.02); }
      catch{ node.gain.value = 0; }
      if (panel){ panel.dataset.automixG = '0'; panel.dataset.ducking='1'; }
      continue;
    }

    const userVol = getToyVolume(id);             // slider/base
    const tgt = getAutoMixTarget(id);
    const desired = clamp01(userVol * tgt);

    const node = getToyGain(id);
    try{
      node.gain.cancelAndHoldAtTime(now);
      const tau = (desired < node.gain.value) ? ATTACK : RELEASE;
      node.gain.setTargetAtTime(desired, now, tau);
    }catch{
      node.gain.value = desired;
    }

    if (panel){
      panel.dataset.automixG = String(desired.toFixed(2));
      const header = panel.querySelector('.toy-header');
      const base = (userVol>0.0001) ? (desired/userVol) : 1.0;
      const reduction = Math.max(0, Math.min(1, 1 - base));
      // hysteresis on header ducking flag: ON at 15%, OFF at 10%
      const prev = header && (header.dataset.ducking === '1');
      const on  = reduction >= 0.15;
      const off = reduction <= 0.10;
      const next = prev ? (!off ? true : false) : (on ? true : false);
      if (header){
        header.dataset.ducking = next ? '1' : '0';
        const pct = Math.round(reduction*100);
        header.dataset.duck = pct >= 1 ? `Auto −${pct}%` : '';
      }
    }}
}

export function enable(){
  if (__timer) return;
  __timer = setInterval(step, 33); // ~30 Hz
}
export function disable(){
  if (!__timer) return;
  clearInterval(__timer);
  __timer = null;
}
export function set(opts={}){
  if (typeof opts.attack === 'number')  ATTACK  = Math.max(0.005, opts.attack);
  if (typeof opts.release === 'number') RELEASE = Math.max(0.02, opts.release);
}

enable(); // auto-start

try{ window.autoMix = { enable, disable, set, get enabled(){ return !!__timer; } }; }catch{}