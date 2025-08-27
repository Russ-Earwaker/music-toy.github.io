// src/toy-zoom-debug2.js
// Robust visual-window debug (v3):
// - Prefer .toy-vbody, then .toy-body; else compute window = panel minus header/controls
// - Measures *after* layout using two rAF ticks to avoid reading before our wrappers apply
// Usage:
//   logToyWindows()              // deferred, after layout
//   logToyWindowsNow()           // immediate (may read zeros mid-build)
(function(){
  function rect(el){ if(!el) return null; const r = el.getBoundingClientRect(); return {x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height)}; }
  function css(el,k){ return el ? getComputedStyle(el)[k] : ""; }
  function shown(el){ if(!el) return false; const s=getComputedStyle(el); return s.display!=="none" && s.visibility!=="hidden"; }

  function findParts(panel){
    const header = panel.querySelector('.toy-header');
    const controls = Array.from(panel.querySelectorAll('.toy-controls'));
    const bodyPref = panel.querySelector('.toy-vbody') || panel.querySelector('.toy-body') || null;
    const vis = panel.querySelector('.wheel-canvas, .grid-canvas, .rippler-canvas, .bouncer-canvas, canvas, svg');
    return { header, controls, body: bodyPref, vis };
  }

  function visualWindow(panel, parts){
    if (parts.body) return rect(parts.body);
    const pr = panel.getBoundingClientRect();
    let top = pr.top, bottom = pr.bottom;
    if (parts.header && shown(parts.header) && css(parts.header,'position') !== 'absolute'){
      const r = parts.header.getBoundingClientRect(); top = Math.max(top, r.bottom);
    }
    for (const ctrl of parts.controls){
      if (!shown(ctrl)) continue;
      const pos = css(ctrl,'position');
      const r = ctrl.getBoundingClientRect();
      if (pos !== 'absolute') top = Math.max(top, r.bottom);
    }
    return { x:Math.round(pr.left), y:Math.round(top), w:Math.round(pr.width), h:Math.max(0, Math.round(bottom - top)) };
  }

  function snapshot(){
    const out = [];
    document.querySelectorAll('.toy-panel').forEach((panel, idx)=>{
      const kind = (panel.getAttribute('data-toy')||'').toLowerCase() || panel.id;
      const p = findParts(panel);
      const win = visualWindow(panel, p);
      const vr = rect(p.vis);
      const pr = rect(panel);
      out.push({
        idx, kind,
        panelW: pr?.w, panelH: pr?.h,
        windowW: win?.w, windowH: win?.h,
        visW: vr?.w, visH: vr?.h,
        fillW: win && vr && win.w ? +(vr.w/win.w).toFixed(3) : null,
        fillH: win && vr && win.h ? +(vr.h/win.h).toFixed(3) : null,
        headerH: p.header ? rect(p.header)?.h : null,
        controlsH: p.controls.reduce((a,c)=> a + (rect(c)?.h||0), 0),
        hasBody: !!p.body
      });
    });
    return out;
  }

  function logNow(){
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

  function raf(fn){ return new Promise(r => requestAnimationFrame(()=> r())); }

  async function logDeferred(){
    await raf(); await raf(); // allow layout to settle
    return logNow();
  }

  window.logToyWindowsNow = logNow;
  window.logToyWindows = logDeferred;
})();