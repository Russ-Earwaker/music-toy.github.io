// src/toys-canvas-fit.js
// REVERT MODE: fully disable previous fitter and restore canvases/SVGs to document defaults.
// Safe to ship even if the fitter was never loaded. (<150 lines)
(function(){
  function clearStyles(el, props){
    props.forEach(p=> { try { el.style[p] = ""; } catch {} });
  }
  function restore(panel){
    const body = panel.querySelector(".toy-body") || panel;
    const visuals = body.querySelectorAll("canvas, svg");
    visuals.forEach(v=>{
      clearStyles(v, ["position","left","top","right","bottom","width","height","display","pointerEvents","transform","transformOrigin"]);
      try { delete v.dataset.logicalWidth; delete v.dataset.logicalHeight; } catch {}
    });
  }
  function run(){
    document.querySelectorAll(".toy-panel").forEach(restore);
  }
  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();