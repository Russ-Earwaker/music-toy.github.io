// src/viewport-controls.js
// On-screen controls: zoom +/- reset, perspective slider, organise. <300 lines>
(function makeViewportControls(){
  const host = document.body;
  const wrap = document.createElement("div");
  wrap.className = "vp-controls";
  Object.assign(wrap.style, {
    position: "fixed", right: "10px", bottom: "12px", display: "flex", gap: "8px",
    alignItems: "center", zIndex: 10002, background: "rgba(13,17,23,0.6)",
    backdropFilter: "blur(4px)", padding: "8px 10px", border: "1px solid #2a2f3a", borderRadius: "12px"
  });
  const mkBtn = (label, title, on)=>{
    const b = document.createElement("button");
    b.textContent = label; b.title = title;
    Object.assign(b.style, {
      minWidth: "36px", height: "36px", borderRadius: "10px", border: "1px solid #2a2f3a",
      background: "#0d1117", color: "#e6e8ef", fontSize: "16px", lineHeight: "1", cursor: "pointer"
    });
    b.addEventListener("click", on);
    return b;
  };
  const zoomOut = mkBtn("−", "Zoom out (Ctrl/Shift/⌘ + Wheel)", ()=> window.BoardViewport?.zoomOut());
  const reset   = mkBtn("⭯", "Reset view (Double-click)", ()=> window.BoardViewport?.zoomReset());
  const zoomIn  = mkBtn("+", "Zoom in (Ctrl/Shift/⌘ + Wheel)", ()=> window.BoardViewport?.zoomIn());

  const label = document.createElement("span");
  label.textContent = "Persp";
  label.style.color = "#e6e8ef"; label.style.fontSize = "12px";

  const persp = document.createElement("input");
  persp.type = "range"; persp.min = "300"; persp.max = "2000"; persp.value = "900"; persp.style.width = "120px";
  persp.title = "Perspective (lower = stronger perspective, higher = flatter)";
  persp.addEventListener("input", ()=> window.BoardViewport?.setPerspective(persp.value));

  const organise = mkBtn("Organise", "Arrange toys neatly", ()=>{
    try { window.organizeBoard?.(); } catch {}
    try { window.dispatchEvent(new Event("organise-toys")); } catch {}
  });

  wrap.appendChild(zoomOut);
  wrap.appendChild(reset);
  wrap.appendChild(zoomIn);
  wrap.appendChild(label);
  wrap.appendChild(persp);
  wrap.appendChild(organise);
  host.appendChild(wrap);

  // Initialise slider to current state if available
  setTimeout(()=>{
    try { const s = window.BoardViewport?.getState?.(); if (s) persp.value = s.persp; } catch {}
  }, 0);
})();