// src/theme-manager.js
// Manage active theme + normalize instrument IDs. Lightweight (<300 lines).

import { THEMES } from "./themes.js";

// Debug toggle (off by default to avoid perf hit)
if (window.__THEME_DEBUG === undefined) window.__THEME_DEBUG = false;
const dbg = (...a)=>{ if (window.__THEME_DEBUG) try{ console.log(...a); }catch{} };

let _activeThemeKey = "djembe_kalimba";
export function getActiveThemeKey(){ return _activeThemeKey; }
export function setActiveThemeKey(key){
  if (!THEMES[key]) { console.warn("[theme] unknown key:", key); return _activeThemeKey; }
  const prev = _activeThemeKey; _activeThemeKey = key;
  dbg("[theme] setActiveThemeKey", { prev, next: key });
  return _activeThemeKey;
}
export function getActiveTheme(){ const t = THEMES[_activeThemeKey] ?? THEMES.default; dbg("[theme] getActiveTheme", _activeThemeKey, t); return t; }

export const getGridInstruments = ()=> { const t=getActiveTheme(); return Array.isArray(t.grids)?t.grids.slice(0,4):[]; };
export const getWheelInstruments = ()=> { const t=getActiveTheme(); return Array.isArray(t.wheel)?t.wheel.slice(0,1):[]; };
export const getBouncerInstruments = ()=> { const t=getActiveTheme(); return Array.isArray(t.bouncer)?t.bouncer.slice(0,1):[]; };
export const getRipplerInstruments = ()=> { const t=getActiveTheme(); return Array.isArray(t.rippler)?t.rippler.slice(0,1):[]; };

function normalizeId(name){
  if (name == null) return name;
  let n = String(name).toLowerCase().trim();
  n = n.replace(/[\s\-]+/g, "_").replace(/[^a-z0-9_]/g, "").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  return n;
}

// Minimal alias table (extend only as needed)
const SAMPLE_ALIASES = { handclap: "hand_clap", clap: "hand_clap", djembe_low: "djembe_bass" };

export function resolveSampleName(name){
  const n = normalizeId(name);
  return n ? (SAMPLE_ALIASES[n] || n) : n;
}
export function resolveSamplesFor(list){ return (list || []).map(resolveSampleName); }

export const resolveGridSamples = ()=> resolveSamplesFor(getGridInstruments());
export const resolveWheelSamples = ()=> resolveSamplesFor(getWheelInstruments());
export const resolveBouncerSamples = ()=> resolveSamplesFor(getBouncerInstruments());
export const resolveRipplerSamples = ()=> resolveSamplesFor(getRipplerInstruments());
