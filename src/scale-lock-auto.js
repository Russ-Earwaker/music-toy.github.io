// src/scale-lock-auto.js
// Heuristic, non-destructive scale lock for toy visuals (<300 lines).
// Adds data-lock-scale on the most likely visual container inside each .toy-panel.
// Works with scale-lock.js (CSS uses --bv-inv-scale set by board-viewport.js).

(function(){
  const DBG = !!window.__THEME_DEBUG;
  const log = (...a)=>{ if (DBG) try{ console.log("[scale-lock-auto]", ...a); }catch{} };

  const SELECTOR_HINTS = [
    "[data-visual]", "[data-canvas]", "[data-svg]",
    "canvas", "svg",
    ".visual", ".canvas", ".svg", ".plot", ".graph", ".display", ".view",
    ".wheel", ".rippler", ".grid", ".cells", ".pads", ".keys"
  ].join(",");

  function area(el){
    const r = el.getBoundingClientRect();
    return Math.max(0, r.width) * Math.max(0, r.height);
  }

  function pickVisual(panel){
    if (!panel) return null;
    const scope = panel.querySelector(".toy-body") || panel;
    const hint = scope.querySelector(SELECTOR_HINTS);
    if (hint) return hint;

    // Otherwise, pick the largest non-control descendant
    const nodes = Array.from(scope.querySelectorAll("*")).filter(el=>{
      const name = el.tagName.toLowerCase();
      if (name === "select" || name === "button" || name === "input" || name === "label") return false;
      if (el.closest(".toy-header, .toy-controls")) return false;
      return true;
    });
    let best = null, bestA = 0;
    for (const n of nodes){
      const a = area(n);
      if (a > bestA){ bestA = a; best = n; }
    }
    return best || null;
  }

  function lock(panel){
    if (!panel || panel.__scaleLockApplied) return;
    const target = pickVisual(panel);
    if (!target) return;
    target.setAttribute("data-lock-scale","");
    target.style.transformOrigin = "50% 50%";
    panel.__scaleLockApplied = true;
    log("locked", panel, "→", target);
  }

  function scanAll(){
    document.querySelectorAll(".toy-panel").forEach(lock);
  }

  // Observe added toy panels (throttled)
  const pend = new WeakSet();
  const schedule = (el)=>{
    if (pend.has(el)) return;
    pend.add(el);
    requestAnimationFrame(()=>{ try{ lock(el); } finally { pend.delete(el); } });
  };
  const obs = new MutationObserver((muts)=>{
    for (const m of muts){
      (m.addedNodes||[]).forEach(n=>{
        if (n.nodeType===1 && n.classList.contains("toy-panel")) schedule(n);
      });
    }
  });

  window.addEventListener("DOMContentLoaded", ()=>{
    scanAll();
    obs.observe(document.getElementById("board") || document.body, { childList:true, subtree:true });
    log("ready");
  });
})();