// src/scale-lock.js
// Opt-in camera scale compensation for inner toy visuals (<300 lines).
// Usage:
//   1) Add data-lock-scale to any inner element whose on-screen size should stay constant when the board zooms.
//   2) Or call: ScaleLock.register(panelSelector, contentSelector)
(function(){
  const styleId = "scale-lock-style";
  if (!document.getElementById(styleId)){
    const css = `[data-lock-scale]{transform:scale(var(--bv-inv-scale,1));transform-origin:50% 50%;will-change:transform}`;
    const el = document.createElement("style"); el.id = styleId; el.textContent = css; document.head.appendChild(el);
  }

  function register(panelSel, contentSel){
    const panels = document.querySelectorAll(panelSel);
    panels.forEach(p => {
      const t = p.querySelector(contentSel);
      if (t) t.setAttribute("data-lock-scale","");
    });
  }

  window.ScaleLock = { register };
})();