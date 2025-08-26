// src/toy-aspect-ratios.js
// Enforce square toy bodies for square visuals so the canvas fills the frame when zooming.
// Injects CSS at runtime to avoid server CSS issues. Safe & non-destructive (<100 lines).
(function(){
  const css = `
  /* Make the visual window square so a square canvas fully fills it */
  [data-toy="wheel"] .toy-body,
  [data-toy="bouncer"] .toy-body,
  [data-toy="rippler"] .toy-body {
    aspect-ratio: 1 / 1;
    height: auto !important;
    min-height: 0 !important;
  }

  /* Ensure the visual fills that square without baseline gaps */
  [data-toy="wheel"] .toy-body canvas,
  [data-toy="bouncer"] .toy-body canvas,
  [data-toy="rippler"] .toy-body canvas {
    width: 100% !important;
    height: 100% !important;
    display: block;
  }`;

  const id = "toy-aspect-ratios-style";
  if (!document.getElementById(id)){
    const s = document.createElement("style");
    s.id = id; s.textContent = css;
    document.head.appendChild(s);
  }
})();