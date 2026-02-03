// src/diag-drawgrid.js
(function(){
  if (window.__diagDraw) return; window.__diagDraw=true;
  const DEBUG = localStorage.getItem('mt_debug')==='1';
  const EVENTS = (localStorage.getItem('dg_events') === '1');
  const log = (...a)=> DEBUG && console.info('[diag-draw]', ...a);

  function check(){
    const paints = document.querySelectorAll('canvas[data-role="drawgrid-paint"]');
    paints.forEach(cv=>{
      const pnl = cv.closest('.toy-panel');
      const ok = pnl && pnl.id==='drawgrid1';
      if (!ok){
        cv.style.outline='3px solid red';
        console.error('[drawgrid] paint canvas not under #drawgrid1 panel!', { panel: pnl && (pnl.id||pnl.dataset.toy) });
      } else {
        cv.style.outline='';
      }
      log('paint-canvas', { panel: pnl && (pnl.id||pnl.dataset.toy) });
    });
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', check); else check();
  setInterval(check, 800);

  if (EVENTS) {
    const on = (name, handler) => window.addEventListener(`dg:${name}`, e => handler(e.detail));

    on('commit', d => console.info('[dg:event][commit]', d));
    on('path-alpha', d => console.info('[dg:event][path-alpha]', d));
    on('buffers', d => console.info('[dg:event][buffers]', d));
    on('overlay-clear', d => console.info('[dg:event][overlay-clear]', d));
    on('paint-clear', d => console.info('[dg:event][paint-clear]', d));
    on('blit', d => console.info('[dg:event][blit]', d));
  }
})();