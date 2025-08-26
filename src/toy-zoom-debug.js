// src/toy-zoom-debug.js
// Debug helper: inspect per-toy sizes vs. their inner visuals.
// Usage: in DevTools console run: logToySizes() at different zoom levels.
(function(){
  function rectInfo(el){
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height) };
  }
  function sizeInfo(el){
    if (!el) return null;
    return { cw: el.clientWidth, ch: el.clientHeight };
  }
  function findVisual(panel){
    const body = panel.querySelector('.toy-body') || panel;
    const canvas = body.querySelector('canvas');
    const svg = canvas ? null : body.querySelector('svg');
    const vis = canvas || svg;
    return { body, canvas, svg, vis };
  }
  function snapshot(){
    const out = [];
    document.querySelectorAll('.toy-panel').forEach((panel, idx)=>{
      const kind = (panel.getAttribute('data-toy') || '').toLowerCase();
      const { body, vis, canvas, svg } = findVisual(panel);
      const panelR = rectInfo(panel);
      const bodyR = rectInfo(body);
      const visR = rectInfo(vis);
      const panelS = sizeInfo(panel);
      const bodyS = sizeInfo(body);
      const visS = sizeInfo(vis);
      out.push({
        idx, kind,
        panelR, bodyR, visR,
        panelS, bodyS, visS,
        ratios: (bodyR && visR) ? { w: +(visR.w / bodyR.w).toFixed(3), h: +(visR.h / bodyR.h).toFixed(3) } : null,
        classes: panel.className
      });
    });
    return out;
  }
  function log(){
    const snap = snapshot();
    console.table(snap.map(s=> ({
      idx: s.idx,
      toy: s.kind,
      panelW: s.panelR?.w, panelH: s.panelR?.h,
      bodyW: s.bodyR?.w, bodyH: s.bodyR?.h,
      visW: s.visR?.w, visH: s.visR?.h,
      ratioW: s.ratios?.w, ratioH: s.ratios?.h
    })));
    return snap;
  }
  window.logToySizes = log;
})();