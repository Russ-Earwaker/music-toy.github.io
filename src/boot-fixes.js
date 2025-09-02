// src/boot-fixes.js — Minimal stabilizer (safe & scoped)
(function(){
  if (window.__mtBootFixes) return; window.__mtBootFixes = true;
  const DEBUG = localStorage.getItem('mt_debug')==='1';
  const log = (...a)=> DEBUG && console.info('[boot-fixes]', ...a);

  function fixPanel(panel){
    if (!panel || panel.__fixed) return;
    const toy = (panel.dataset.toy||'').toLowerCase();
    // Ensure a body exists
    let body = panel.querySelector('.toy-body');
    if (!body){ body = document.createElement('div'); body.className='toy-body'; panel.appendChild(body); }
    // Square bodies for canvas toys only (do NOT touch drawgrid)
    if (/loopgrid|rippler|bouncer|wheel/.test(toy) && !panel.classList.contains('toy-zoomed')){
      body.style.aspectRatio = body.style.aspectRatio || '1 / 1';
    }
    // Make canvases fill body and never stack above header
    body.querySelectorAll('canvas').forEach(c=>{
      const st = getComputedStyle(c);
      if (st.position === 'static'){
        Object.assign(c.style, { position:'absolute', inset:'0', width:'100%', height:'100%', display:'block', margin:'0' });
      }
    });
    panel.__fixed = true;
    log('fixed panel', panel.id||toy);
  }

  function scan(){ document.querySelectorAll('.toy-panel').forEach(fixPanel); }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', scan); else scan();
  // Light observers, no DOM surgery
  const root = document.body || document.documentElement;
  try{ new MutationObserver(scan).observe(root, { childList:true, subtree:true, attributes:true, attributeFilter:['class','data-toy'] }); }catch{}
  try{ new ResizeObserver(scan).observe(root); }catch{}
  log('booted');
})();