// src/toy-zoom-debug2.js
// Deeper debug: measure each toy's *visual window* (panel minus header/controls) vs. its canvas/svg.
// Usage in console: logToyWindows() at normal zoom, then zoom way in and call it again.
(function(){
  function rect(el){ if(!el) return null; const r = el.getBoundingClientRect(); return {x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height)}; }
  function css(el,k){ return el ? getComputedStyle(el)[k] : ""; }
  function isShown(el){ if(!el) return false; const s=getComputedStyle(el); return s.display!=="none" && s.visibility!=="hidden"; }

  function findParts(panel){
    const header = panel.querySelector('.toy-header');
    const controls = Array.from(panel.querySelectorAll('.toy-controls'));
    const vol = panel.querySelector('.toy-volwrap');
    const body = panel.querySelector('.toy-body') || null;
    // primary visual
    const c = panel.querySelector('.wheel-canvas, .grid-canvas, .rippler-canvas, .bouncer-canvas, canvas, svg');
    return { header, controls, vol, body, visual:c };
  }

  function visualWindow(panel, parts){
    const pr = panel.getBoundingClientRect();
    let top = pr.top, bottom = pr.bottom;
    if (parts.header && isShown(parts.header) && css(parts.header,'position') !== 'absolute'){
      const r = parts.header.getBoundingClientRect(); top = Math.max(top, r.bottom);
    }
    for (const ctrl of parts.controls){
      if (!isShown(ctrl)) continue;
      const pos = css(ctrl,'position');
      const r = ctrl.getBoundingClientRect();
      if (pos !== 'absolute'){
        // treat as stacked vertically (most builds put them below header)
        top = Math.max(top, r.bottom);
      }
    }
    // volwrap is absolute; ignore for window height
    const height = Math.max(0, Math.round(bottom - top));
    const width = Math.round(pr.width);
    return { x:Math.round(pr.left), y:Math.round(top), w:width, h:height };
  }

  function snapshot(){
    const out = [];
    document.querySelectorAll('.toy-panel').forEach((panel, idx)=>{
      const kind = (panel.getAttribute('data-toy')||'').toLowerCase() || panel.id;
      const parts = findParts(panel);
      const win = parts.body ? rect(parts.body) : visualWindow(panel, parts);
      const vr = rect(parts.visual);
      const pr = rect(panel);
      out.push({
        idx, kind,
        panelW: pr?.w, panelH: pr?.h,
        windowW: win?.w, windowH: win?.h,
        visW: vr?.w, visH: vr?.h,
        fillW: win && vr ? +(vr.w/win.w).toFixed(3) : null,
        fillH: win && vr ? +(vr.h/win.h).toFixed(3) : null,
        headerH: parts.header ? rect(parts.header)?.h : null,
        controlsH: parts.controls.reduce((a,c)=> a + (rect(c)?.h||0), 0),
        hasBody: !!parts.body
      });
    });
    return out;
  }

  function log(){
    const s = snapshot();
    console.table(s.map(r => ({
      idx: r.idx, toy: r.kind,
      panelW: r.panelW, panelH: r.panelH,
      windowW: r.windowW, windowH: r.windowH,
      visW: r.visW, visH: r.visH,
      fillW: r.fillW, fillH: r.fillH,
      headerH: r.headerH, controlsH: r.controlsH, hasBody: r.hasBody
    })));
    return s;
  }

  window.logToyWindows = log;
})();