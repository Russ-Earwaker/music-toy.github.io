// src/theme-hooks.js
// Apply instruments to existing toys. Lightweight + compatible with existing 'toy-instrument' handlers (<300 lines).

import { resolveGridSamples, resolveWheelSamples, resolveBouncerSamples, resolveRipplerSamples } from "./theme-manager.js";

if (window.__THEME_DEBUG === undefined) window.__THEME_DEBUG = false;
const dbg = (...a)=>{ if (window.__THEME_DEBUG) try{ console.log(...a); }catch{} };

const normId = s => s==null ? s : String(s).toLowerCase().trim().replace(/[\s\-]+/g,"_").replace(/[^a-z0-9_]/g,"").replace(/_+/g,"_").replace(/^_+|_+$/g,"");
function pickFromSelect(panel, desired){
  const sel = panel && panel.querySelector(".toy-instrument, select");
  if (!sel) return desired;
  const want = normId(desired);
  for (const opt of Array.from(sel.options||[])){ if (normId(opt.value)===want) return opt.value; }
  return desired;
}
function tryChain(fns){ for(const fn of fns){ try{ if(fn && fn()===true) return true; }catch{} } return false; }

function fireBoth(panel, specific, detailKey, value){
  if (!panel) return;
  try { panel.dispatchEvent(new CustomEvent(specific, { detail: { [detailKey]: value } })); } catch {}
  try { panel.dispatchEvent(new CustomEvent("toy-instrument", { detail: { value } })); } catch {}
}

export function assignGridInstrument(index, id){
  const panel = document.querySelector(`#grid${index+1}`) || document.querySelector(`[data-toy="loopgrid"][data-index="${index}"]`);
  if (!panel) return false;
  const value = pickFromSelect(panel, id);
  const ok = tryChain([
    ()=>{ if (window.GridManager?.setInstrument){ window.GridManager.setInstrument(index, value); return true; } return false; },
    ()=>{ const inst = window.grids?.[index]; if (inst?.setInstrument){ inst.setInstrument(value); return true; } return false; },
    ()=>{ fireBoth(panel, "grid:set-instrument", "instrumentId", value); return true; },
  ]);
  if (ok){ panel.dataset.instrument = value; const sel = panel.querySelector(".toy-instrument, select"); if (sel) sel.value = value; }
  dbg("[assignGridInstrument]", { index, id, value, ok });
  return ok;
}
export function assignWheelInstrument(id){
  const panel = document.querySelector(`[data-toy="wheel"]`) || document.getElementById("wheel");
  if (!panel) return false;
  const value = pickFromSelect(panel, id);
  const ok = tryChain([
    ()=>{ if (window.Wheel?.setInstrument){ window.Wheel.setInstrument(value); return true; } return false; },
    ()=>{ const inst = window.wheel; if (inst?.setInstrument){ inst.setInstrument(value); return true; } return false; },
    ()=>{ fireBoth(panel, "wheel:set-instrument", "instrumentId", value); return true; },
  ]);
  if (ok){ panel.dataset.instrument = value; const sel = panel.querySelector(".toy-instrument, select"); if (sel) sel.value = value; }
  dbg("[assignWheelInstrument]", { id, value, ok });
  return ok;
}
export function assignBouncerInstrument(id){
  const panel = document.querySelector(`[data-toy="bouncer"]`) || document.getElementById("bouncer");
  if (!panel) return false;
  const value = pickFromSelect(panel, id);
  const ok = tryChain([
    ()=>{ if (window.Bouncer?.setInstrument){ window.Bouncer.setInstrument(value); return true; } return false; },
    ()=>{ const inst = window.bouncer; if (inst?.setInstrument){ inst.setInstrument(value); return true; } return false; },
    ()=>{ fireBoth(panel, "bouncer:set-instrument", "instrumentId", value); return true; },
  ]);
  if (ok){ panel.dataset.instrument = value; const sel = panel.querySelector(".toy-instrument, select"); if (sel) sel.value = value; }
  dbg("[assignBouncerInstrument]", { id, value, ok });
  return ok;
}
export function assignRipplerInstrument(id){
  const panel = document.querySelector(`[data-toy="rippler"]`) || document.getElementById("rippler");
  if (!panel) return false;
  const value = pickFromSelect(panel, id);
  const ok = tryChain([
    ()=>{ if (window.Rippler?.setInstrument){ window.Rippler.setInstrument(value); return true; } return false; },
    ()=>{ const inst = window.rippler; if (inst?.setInstrument){ inst.setInstrument(value); return true; } return false; },
    ()=>{ fireBoth(panel, "rippler:set-instrument", "instrumentId", value); return true; },
  ]);
  if (ok){ panel.dataset.instrument = value; const sel = panel.querySelector(".toy-instrument, select"); if (sel) sel.value = value; }
  dbg("[assignRipplerInstrument]", { id, value, ok });
  return ok;
}

// --- Minimal zoom persistence: re-apply on class changes for .toy-panel only ---
(function setupZoomPersistence(){
  const panels = () => Array.from(document.querySelectorAll(".toy-panel"));
  const rafMap = new WeakMap();
  const onAttrChange = (panel) => {
    if (!panel) return;
    if (rafMap.has(panel)) return;
    rafMap.set(panel, true);
    requestAnimationFrame(()=>{
      rafMap.delete(panel);
      const kind = (panel.getAttribute("data-toy")||"").toLowerCase();
      const val = panel.dataset.instrument || (panel.querySelector(".toy-instrument, select")||{}).value;
      if (!val) return;
      if (kind.startsWith("loopgrid") || kind==="grid"){
        const idx = Number(panel.id && panel.id.replace(/\D+/g,""))-1;
        if (!isNaN(idx)) assignGridInstrument(idx, val);
      } else if (kind==="wheel"){ assignWheelInstrument(val); }
      else if (kind==="bouncer"){ assignBouncerInstrument(val); }
      else if (kind==="rippler"){ assignRipplerInstrument(val); }
      dbg("[zoom reapply]", { kind, val });
    });
  };

  const obs = new MutationObserver((muts)=>{
    for (const m of muts){
      if (m.type==="attributes" && m.attributeName==="class"){
        const el = m.target;
        if (el && el.classList && el.classList.contains("toy-panel")) onAttrChange(el);
      }
    }
  });
  panels().forEach(p => obs.observe(p, { attributes:true, attributeFilter:["class"] }));
  // Watch for newly added panels
  const rootObs = new MutationObserver((muts)=>{
    for (const m of muts){
      (m.addedNodes||[]).forEach(n=>{
        if (n.nodeType===1 && n.classList.contains("toy-panel")){
          obs.observe(n, { attributes:true, attributeFilter:["class"] });
        }
      });
    }
  });
  rootObs.observe(document.getElementById("board") || document.body, { childList:true, subtree:true });
})();

// 1 delegated listener: keep dataset + audio in sync when user changes a select
document.addEventListener("change", (e)=>{
  const sel = e.target.closest(".toy-instrument, select");
  if (!sel) return;
  const panel = sel.closest(".toy-panel"); if (!panel) return;
  const val = sel.value; panel.dataset.instrument = val;
  const kind = (panel.getAttribute("data-toy")||"").toLowerCase();
  if (kind.startsWith("loopgrid") || kind==="grid"){
    const idx = Number(panel.id && panel.id.replace(/\D+/g,""))-1; if(!isNaN(idx)) assignGridInstrument(idx, val);
  } else if (kind==="wheel"){ assignWheelInstrument(val); }
  else if (kind==="bouncer"){ assignBouncerInstrument(val); }
  else if (kind==="rippler"){ assignRipplerInstrument(val); }
}, true);

// Expose globals for convenience
window.assignGridInstrument = assignGridInstrument;
window.assignWheelInstrument = assignWheelInstrument;
window.assignBouncerInstrument = assignBouncerInstrument;
window.assignRipplerInstrument = assignRipplerInstrument;
