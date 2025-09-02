// src/boot-theme.js (<=300 lines)
import { getActiveThemeKey, setActiveThemeKey, resolveGridSamples, resolveWheelSamples, resolveBouncerSamples, resolveRipplerSamples } from "./theme-manager.js";
import { assignGridInstrument, assignWheelInstrument, assignBouncerInstrument, assignRipplerInstrument } from "./theme-hooks.js";

function wireAll(){ console.log('[THEME] wireAll start');
  resolveGridSamples().forEach((id,i)=> assignGridInstrument(i,id));
  const w = resolveWheelSamples()[0];   if (w) assignWheelInstrument(w);
  const b = resolveBouncerSamples()[0]; if (b) assignBouncerInstrument(b);
  const r = resolveRipplerSamples()[0]; if (r) assignRipplerInstrument(r);
}

window.ThemeBoot = {
  _dbg:true,
  getActiveThemeKey,
  setTheme: (k)=>{ console.log('[THEME] setTheme', k); const kk = setActiveThemeKey(k); requestAnimationFrame(wireAll); return kk; },
  wireAll,
};

window.addEventListener("DOMContentLoaded", ()=> requestAnimationFrame(wireAll));
window.addEventListener("samples-ready", ()=> requestAnimationFrame(wireAll));
