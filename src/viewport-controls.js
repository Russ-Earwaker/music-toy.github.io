// src/viewport-controls.js
// Minimal: remove any old controls and render just an Organise button.
(function(){
  function make(){
    // Remove existing instances
    document.querySelectorAll(".vp-controls").forEach(el=> el.remove());
    const host = document.body;
    const wrap = document.createElement("div");
    wrap.className = "vp-controls";
    Object.assign(wrap.style, {
      position: "fixed", right: "10px", bottom: "12px", display: "flex", gap: "8px",
      alignItems: "center", zIndex: 10002, background: "rgba(13,17,23,0.6)",
      backdropFilter: "blur(4px)", padding: "8px 10px", border: "1px solid #2a2f3a", borderRadius: "12px"
    });
    const btn = document.createElement("button");
    btn.textContent = "Organise"; btn.title = "Arrange toys neatly";
    Object.assign(btn.style, {
      minWidth: "86px", height: "36px", borderRadius: "10px", border: "1px solid #2a2f3a",
      background: "#0d1117", color: "#e6e8ef", fontSize: "14px", lineHeight: "1", cursor: "pointer"
    });
    btn.addEventListener("click", ()=>{
      try { window.organizeBoard?.(); } catch {}
      try { window.dispatchEvent(new Event("organise-toys")); } catch {}
    });
    wrap.appendChild(btn);
    host.appendChild(wrap);
  }
  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", make);
  } else {
    make();
  }
})();