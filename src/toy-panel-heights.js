// src/toy-panel-heights.js
// v3 (instrumented): Reserve real vertical room for each toy panel.
// - panel height = header+controls + preferred body height (wheel/rippler/bouncer ~ panel width clamped 200–420; grid ~120)
// - runs on window 'load' (after toys are built) and on real window resizes
// - logs what it applied per panel; exposes window.__panelHeightsProbe()
(function(){
  function isShown(el){
    if (!el) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden';
  }
  function headerControlsHeight(panel){
    let h = 0;
    const header = panel.querySelector('.toy-header');
    if (header && isShown(header) && getComputedStyle(header).position !== 'absolute'){
      h += header.offsetHeight;
    }
    panel.querySelectorAll('.toy-controls').forEach(ctrl=>{
      const cs = getComputedStyle(ctrl);
      if (isShown(ctrl) && cs.position !== 'absolute'){
        h += ctrl.offsetHeight;
      }
    });
    return h;
  }
  function preferredBodyHeight(panel){
    const kind = (panel.getAttribute('data-toy')||'').toLowerCase();
    const w = Math.max(1, panel.clientWidth || 300);
    if (kind === 'grid' || kind.startsWith('loopgrid')) return 120;
    const minB = 200, maxB = 420;
    return Math.max(minB, Math.min(maxB, w));
  }
  function apply(panel){
    const hc = headerControlsHeight(panel);
    const desired = hc + preferredBodyHeight(panel);
    panel.style.setProperty('height', desired + 'px', 'important');
    panel.style.setProperty('min-height', desired + 'px', 'important');
    return { id: panel.id || null, toy: (panel.getAttribute('data-toy')||'').toLowerCase(), hc, desired };
  }
  function run(){
    const out = [];
    document.querySelectorAll('.toy-panel').forEach(p=> out.push(apply(p)));
    console.log('[panel-heights]', out);
    return out;
  }
  window.__panelHeightsProbe = run;
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run);
  let t=0;
  window.addEventListener('resize', ()=>{ cancelAnimationFrame(t); t=requestAnimationFrame(run); });
})();