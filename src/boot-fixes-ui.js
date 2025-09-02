// src/boot-fixes-ui.js
// Non-invasive runtime patch for header/footer consistency.
// - Adds an "Advanced" button if missing and wires it to zoom overlay
// - Ensures footer + volwrap exist and look like the demo (card under the toy)
// Safe to include multiple times (guarded).

(function(){
  if (window.__mtBootUIFix) return; window.__mtBootUIFix = true;
  const DEBUG = localStorage.getItem('mt_debug')==='1';
  const log = (...a)=> DEBUG && console.info('[boot-ui]', ...a);

  function ensureFooter(panel){
    let footer = panel.querySelector('.toy-footer');
    if (!footer){ footer = document.createElement('div'); footer.className='toy-footer'; panel.appendChild(footer); }
    let vol = panel.querySelector('.toy-volwrap');
    if (!vol){ vol = document.createElement('div'); vol.className='toy-volwrap'; footer.appendChild(vol); }
    return { footer, vol };
  }

  function wireAdvanced(panel, btn){
    function isZoomed(){ return panel.classList.contains('toy-zoomed') || !!panel.closest('#zoom-overlay'); }
    btn.addEventListener('click', (e)=>{
      e.preventDefault();
      if (window.zoomInPanel && window.zoomOutPanel){
        if (!isZoomed()) window.zoomInPanel(panel); else window.zoomOutPanel();
      } else {
        panel.classList.toggle('toy-zoomed');
      }
    });
  }

  function ensureAdvanced(panel){
    const header = panel.querySelector('.toy-header'); if (!header) return;
    const right = header.querySelector('.toy-controls-right') || header;
    let adv = header.querySelector('[data-adv]') || Array.from(header.querySelectorAll('button')).find(b=>/advanced/i.test(b.textContent||''));
    if (!adv){
      adv = document.createElement('button');
      adv.type='button';
      adv.className = (right.querySelector('.toy-btn')?.className || 'toy-btn');
      adv.textContent = 'Advanced';
      adv.setAttribute('data-adv','1');
      right.insertBefore(adv, right.firstChild);
      wireAdvanced(panel, adv);
      log('added Advanced', panel.id || panel.dataset.toy);
    } else {
      // make sure it's wired
      if (!adv.__wired){ wireAdvanced(panel, adv); adv.__wired=true; }
    }
  }

  function styleVol(panel, vol){
    vol.style.display='flex';
    vol.style.gap='10px';
    vol.style.alignItems='center';
    vol.style.background='#0d141dcc';
    vol.style.border='1px solid #1c2430';
    vol.style.borderRadius='10px';
    vol.style.padding='8px 10px';
    vol.style.boxSizing='border-box';
    vol.style.width='100%'; vol.style.maxWidth='100%'; vol.style.overflow='hidden';
    const slider = vol.querySelector('input[type="range"]');
    if (slider){ slider.style.flex='1'; slider.style.width='100%'; }
  }

  function fix(panel){
    if (!panel || panel.__mtBootUIFixed) return;
    ensureAdvanced(panel);
    const { vol } = ensureFooter(panel);
    styleVol(panel, vol);
    panel.__mtBootUIFixed = true;
    log('fixed panel', panel.id || panel.dataset.toy);
  }

  function scan(){ document.querySelectorAll('.toy-panel').forEach(fix); }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', scan); else scan();
  const root = document.body || document.documentElement;
  if (root){
    try{ (new MutationObserver(scan)).observe(root, { childList:true, subtree:true, attributes:true, attributeFilter:['class'] }); }catch{}
    try{ (new ResizeObserver(scan)).observe(root); }catch{}
  }
  log('booted');
})();
