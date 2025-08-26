// src/theme-switcher.js
// Theme dropdown. Calls ThemeBoot to reapply. (<300 lines).

import { THEMES } from "./themes.js";
import { getActiveThemeKey } from "./theme-manager.js";

if (window.__THEME_DEBUG === undefined) window.__THEME_DEBUG = false;
const dbg = (...a)=>{ if (window.__THEME_DEBUG) try{ console.log(...a); }catch{} };

function build(){
  const host = document.getElementById("topbar") || document.querySelector("header") || document.body;
  const wrap = document.createElement("div");
  wrap.style.display = "inline-flex"; wrap.style.alignItems = "center"; wrap.style.gap = "6px"; wrap.style.marginLeft = "12px";
  const label = document.createElement("label"); label.textContent = "Theme"; label.htmlFor = "theme-select";
  const sel = document.createElement("select"); sel.id = "theme-select";
  Object.keys(THEMES).forEach(k=>{ const opt=document.createElement("option"); opt.value=k; opt.textContent=k.replace(/_/g," "); sel.appendChild(opt); });
  sel.value = getActiveThemeKey();
  sel.addEventListener("change", ()=>{ try{ window.ThemeBoot?.setTheme(sel.value); }catch{} });
  wrap.appendChild(label); wrap.appendChild(sel); host.appendChild(wrap);
  dbg("[theme-switcher] ready");
}
window.addEventListener("DOMContentLoaded", build);
