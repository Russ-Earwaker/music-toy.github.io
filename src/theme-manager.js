// src/theme-manager.js (<=300 lines)
import { THEMES } from "./themes.js";

let _activeThemeKey = Object.keys(THEMES)[0] || "default";
export function getActiveThemeKey(){ return _activeThemeKey; }
export function setActiveThemeKey(key){ if (THEMES[key]) _activeThemeKey = key; return _activeThemeKey; }
export function getActiveTheme(){ return THEMES[_activeThemeKey] || THEMES.default; }

// Lists for each toy type from the active theme
export const resolveGridSamples    = ()=> (getActiveTheme().grids   || []).slice(0,4);
export const resolveWheelSamples   = ()=> (getActiveTheme().wheel   || []).slice(0,1);
export const resolveBouncerSamples = ()=> (getActiveTheme().bouncer || []).slice(0,1);
export const resolveRipplerSamples = ()=> (getActiveTheme().rippler || []).slice(0,1);

// Utility to normalise ids
const norm = s=> String(s||'').toLowerCase().trim().split(' ').filter(Boolean).join('_');

// Helper that tries to push a desired id into a panel's instrument select
export function pickFromSelect(panel, desired){
  const sel = panel && panel.querySelector(".toy-instrument, select.toy-instrument");
  if (!sel) return desired;
  const want = norm(desired);
  for (const opt of Array.from(sel.options || [])){
    if (norm(opt.value) === want) return opt.value;
  }
  return desired;
}
