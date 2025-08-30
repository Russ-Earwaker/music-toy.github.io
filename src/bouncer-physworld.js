// src/bouncer-physworld.js — Safe scaffold for a single-physics-world (not wired yet)
// Default mode: 'dynamic' (old behavior), so importing this won't change anything until enabled.
export function initBouncerPhysWorld(panel, canvas, sizing, opts = {}){
  const mode = opts.mode === 'fixed' ? 'fixed' : 'dynamic'; // default dynamic keeps current behavior
  let PHYS_W = 0, PHYS_H = 0;
  let captured = false;

  function cssW(){ return Math.max(1, Math.floor(canvas?.clientWidth || 0)); }
  function cssH(){ return Math.max(1, Math.floor(canvas?.clientHeight || 0)); }

  function ensureCaptured(){
    if (!captured){
      PHYS_W = cssW();
      PHYS_H = cssH();
      captured = true;
    }
  }

  function worldW(){
    if (mode === 'fixed'){ ensureCaptured(); return PHYS_W; }
    return cssW();
  }
  function worldH(){
    if (mode === 'fixed'){ ensureCaptured(); return PHYS_H; }
    return cssH();
  }

  // Mapping helpers — identity in dynamic mode
  function renderScale(){
    const w = cssW(), h = cssH();
    const pw = (mode === 'fixed') ? worldW() : w;
    const ph = (mode === 'fixed') ? worldH() : h;
    const sx = (pw ? w / pw : 1);
    const sy = (ph ? h / ph : 1);
    return { sx, sy };
  }
  function toWorld(pt){
    if (!pt) return { x:0, y:0 };
    if (mode !== 'fixed') return { x: pt.x, y: pt.y };
    const { sx, sy } = renderScale();
    return { x: pt.x / (sx || 1), y: pt.y / (sy || 1) };
  }
  function toScreen(pt){
    if (!pt) return { x:0, y:0 };
    if (mode !== 'fixed') return { x: pt.x, y: pt.y };
    const { sx, sy } = renderScale();
    return { x: pt.x * (sx || 1), y: pt.y * (sy || 1) };
  }

  // Public control to switch modes safely later
  function setMode(newMode){
    if (newMode === 'fixed'){
      // Capture on transition
      if (!captured){ ensureCaptured(); }
      phys.mode = 'fixed';
    } else {
      phys.mode = 'dynamic';
    }
  }

  const phys = {
    get mode(){ return mode; },
    worldW, worldH, toWorld, toScreen,
    setMode
  };
  return phys;
}
