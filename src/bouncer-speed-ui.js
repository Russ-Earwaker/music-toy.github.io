/* Speed control UI — mounts in header, Advanced only */
export function installSpeedUI(panel, sizing, initial=1.00){
  // Force default to 100%. If a control already exists, reuse it (avoid duplicates).
  let speedFactor = 1.00;

  // Build compact header control
  let spWrap = panel.querySelector('.bouncer-speed-ctrl');
  if (!spWrap){ spWrap = document.createElement('div'); spWrap.className = 'bouncer-speed-ctrl'; }
  Object.assign(spWrap.style, {
    display:'none', alignItems:'center', gap:'6px'
  });

  let spLabel = spWrap.querySelector('.bouncer-speed-label');
  if (!spLabel){ spLabel = document.createElement('span'); spLabel.className='bouncer-speed-label'; spLabel.textContent = 'Speed:'; }
  spLabel.style.fontSize = '12px';
  spLabel.style.opacity = '0.8';

  let spVal = spWrap.querySelector('.bouncer-speed-value');
  if (!spVal){ spVal = document.createElement('span'); spVal.className='bouncer-speed-value'; }
  spVal.style.fontSize = '12px';
  spVal.style.opacity = '0.7';
  spVal.style.width = '44px';
  spVal.style.textAlign = 'right';

  let sp = spWrap.querySelector('input[type="range"]');
  if (!sp){ sp = document.createElement('input'); sp.type = 'range'; }
  sp.min = '0.20'; sp.max = '1.60'; sp.step = '0.05';
  sp.value = String(speedFactor.toFixed(2));
  sp.style.width = '120px';

  ['pointerdown','pointermove','pointerup','click','mousedown','touchstart','touchmove','touchend'].forEach(t=> {
    sp.addEventListener(t, ev=> ev.stopPropagation(), { passive:true });
  });

  function updateLabel(){
    spVal.textContent = `${Math.round(speedFactor*100)}%`;
  }
  updateLabel();
    try{ panel.dispatchEvent(new CustomEvent('toy-speed', { detail:{ value: speedFactor } })); }catch{};

  if (!sp.__wired){ sp.__wired = true; sp.addEventListener('input', ()=>{
    const v = parseFloat(sp.value);
    if (!Number.isFinite(v)) return;
    speedFactor = Math.max(0.2, Math.min(1.6, v));
    panel.dataset.speed = String(speedFactor);
    updateLabel();
    try{ panel.dispatchEvent(new CustomEvent('toy-speed', { detail:{ value: speedFactor } })); }catch{};
  }); }

  if (!spLabel.parentNode) spWrap.appendChild(spLabel);
  if (!sp.parentNode) spWrap.appendChild(sp);
  if (!spVal.parentNode) spWrap.appendChild(spVal);

  // Mount into header controls (right side if present)
  function mount(){
    const header = panel.querySelector('.toy-header');
    const right = panel.querySelector('.toy-controls-right') || header;
    try{
      if (right && !spWrap.parentNode){
        right.appendChild(spWrap);
      }
    }catch{}
  }
  mount();

  // Advanced-mode visibility: use the panel class / overlay presence
  function isAdvanced(){
    return panel.classList.contains('toy-zoomed') || !!panel.closest('#zoom-overlay');
  }
  function updateSpeedVisibility(){
    spWrap.style.display = isAdvanced() ? 'flex' : 'none';
  }
  updateSpeedVisibility();

  // React to Advanced toggles
  panel.addEventListener('toy-zoom', ()=>{ updateSpeedVisibility(); });
  const __obs = new MutationObserver(()=> updateSpeedVisibility());
  try{ __obs.observe(panel, { attributes:true, attributeFilter:['class'] }); }catch{}

  // Fallback watcher in case external UI swaps DOM around
  let __lastAdv = null;
  function __tick(){
    const adv = isAdvanced();
    if (__lastAdv === null || adv !== __lastAdv){
      mount();
      updateSpeedVisibility();
      __lastAdv = adv;
    }
    requestAnimationFrame(__tick);
  }
  requestAnimationFrame(__tick);

  return ()=> speedFactor; // getter for main
}
