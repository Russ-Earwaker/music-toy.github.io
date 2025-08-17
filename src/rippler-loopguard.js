// src/rippler-loopguard.js
// Tiny, non-destructive guards for the draw loop and canvas sizing.
export function installLoopGuards(panel, canvas, ctx, draw, resizeCanvasForDPR, setParticleBounds){
  let last = performance.now();
  // touch last each time draw runs by wrapping (without changing original logic)
  const orig = draw;
  function wrapped(){
    last = performance.now();
    return orig();
  }
  try { Object.defineProperty(panel, '__rippler_wrappedDraw', { value: wrapped }); } catch {}

  const watch = setInterval(()=>{
    const dt = performance.now() - last;
    if (dt > 600 && document.visibilityState === 'visible' && panel.isConnected){
      console.warn('[rippler] RAF stalled ~' + Math.round(dt) + 'ms; nudging');
      try { requestAnimationFrame(orig); } catch {}
    }
  }, 400);

  document.addEventListener('visibilitychange', ()=>{
    if (document.visibilityState === 'visible'){
      try { requestAnimationFrame(orig); } catch {}
    }
  });

  try {
    const ro = new ResizeObserver(()=>{
      try { resizeCanvasForDPR(canvas, ctx); setParticleBounds(canvas.width, canvas.height); } catch {}
    });
    ro.observe(panel);
  } catch {}
}
