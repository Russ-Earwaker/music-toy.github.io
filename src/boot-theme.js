// src/boot-theme.js
// Wire active theme to toys. Minimal + non-blocking (<300 lines).

import { getActiveThemeKey, setActiveThemeKey, resolveGridSamples, resolveWheelSamples, resolveBouncerSamples, resolveRipplerSamples } from "./theme-manager.js";
import { assignGridInstrument, assignWheelInstrument, assignBouncerInstrument, assignRipplerInstrument } from "./theme-hooks.js";

if (window.__THEME_DEBUG === undefined) window.__THEME_DEBUG = false;
const dbg = (...a)=>{ if (window.__THEME_DEBUG) try{ console.log(...a); }catch{} };

function wireGrids(){ const ids = resolveGridSamples(); ids.forEach((id,i)=> assignGridInstrument(i,id)); dbg("[wireGrids]", ids); }
function wireWheel(){ const id = resolveWheelSamples()[0]; if (id) assignWheelInstrument(id); dbg("[wireWheel]", id); }
function wireBouncer(){ const id = resolveBouncerSamples()[0]; if (id) assignBouncerInstrument(id); dbg("[wireBouncer]", id); }
function wireRippler(){ const id = resolveRipplerSamples()[0]; if (id) assignRipplerInstrument(id); dbg("[wireRippler]", id); }

export function wireAll(){ wireGrids(); wireWheel(); wireBouncer(); wireRippler(); }

window.ThemeBoot = {
  getActiveThemeKey,
  setTheme: (k)=>{ const kk = setActiveThemeKey(k); requestAnimationFrame(wireAll); return kk; },
  wireAll,
};

window.addEventListener("DOMContentLoaded", ()=> requestAnimationFrame(wireAll));
window.addEventListener("samples-ready", ()=> requestAnimationFrame(wireAll));
