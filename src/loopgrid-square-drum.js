// src/loopgrid-square-drum.js — circular pad that triggers current instrument (<=300 lines)
(function(){
  if (window.__loopgridDrumBoot) return; window.__loopgridDrumBoot = true;
  const SEL = '.toy-panel[data-toy="loopgrid"]';

  function ensurePad(panel){
    const body = panel.querySelector('.toy-body') || panel;
    if (!body.querySelector('.loopgrid-drum-pad')){
      const pad = document.createElement('div');
      pad.className = 'loopgrid-drum-pad';
      Object.assign(pad.style, {
        position:'absolute', left:'50%', top:'50%', transform:'translate(-50%,-50%)',
        border:'2px solid rgba(255,255,255,0.25)',
        borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
        background:'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.18), rgba(255,255,255,0.08))',
        boxShadow:'0 6px 18px rgba(0,0,0,0.45), inset 0 2px 8px rgba(255,255,255,0.15)',
        cursor:'pointer', userSelect:'none', zIndex:'60', visibility:'hidden', width:'0px', height:'0px'
      });
      const label = document.createElement('div');
      label.textContent = 'DRUM';
      Object.assign(label.style, { fontWeight:'700', letterSpacing:'0.18em', opacity:'0.85' });
      pad.appendChild(label);
      body.appendChild(pad);

      // play + highlight current column
      pad.addEventListener('pointerdown', (e)=>{
        e.preventDefault(); e.stopPropagation();
        try{ panel.__playCurrent && panel.__playCurrent(); }catch{}
        try{ panel.dispatchEvent(new CustomEvent('loopgrid:tap', { bubbles:true })); }catch{}
      });
    }
  }

  function layout(panel){
    const body = panel.querySelector('.toy-body') || panel;
    const pad = body.querySelector('.loopgrid-drum-pad');
    if (!pad) return;
    const r = body.getBoundingClientRect();
    const size = Math.floor(Math.min(r.width, r.height) * 0.68);
    pad.style.width = size + 'px';
    pad.style.height = size + 'px';
    pad.style.visibility = size>20 ? 'visible' : 'hidden';
  }

  function boot(){
    document.querySelectorAll(SEL).forEach(panel=>{ ensurePad(panel); layout(panel); });
  }
  function relayout(){ document.querySelectorAll(SEL).forEach(layout); }

  window.addEventListener('resize', relayout);
  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState!=='loading') boot();
})();
