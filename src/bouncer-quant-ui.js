// src/bouncer-quant-ui.js — quantization dropdown (Advanced only)
// Values: Off, 1/2, 1/4, 1/8, 1/16

export function installQuantUI(panel, initialDiv = 4){
  // State
  let quantDiv = Number.isFinite(initialDiv) ? initialDiv : 8;

  // Build compact header control
  let qWrap = panel.querySelector('.bouncer-quant-ctrl');
  if (!qWrap){ qWrap = document.createElement('div'); qWrap.className = 'bouncer-quant-ctrl'; }
  Object.assign(qWrap.style, { display:'none', alignItems:'center', gap:'6px' });

  let qLabel = qWrap.querySelector('.bouncer-quant-label');
  if (!qLabel){ qLabel = document.createElement('span'); qLabel.className='bouncer-quant-label'; qLabel.textContent = 'Quant:'; }
  qLabel.style.fontSize = '12px';
  qLabel.style.opacity = '0.8';

  let sel = qWrap.querySelector('select');
  if (!sel){ sel = document.createElement('select'); }
  sel.innerHTML = '';
  const options = [
    { label:'Off', value:'0' },
    // Slower-than-beat options (values < 1 mean multiples of a beat)
    { label:'1 bar', value:'0.25' },     // 4 beats at 4/4
    { label:'2 beats', value:'0.5' },    // 2 beats
    // Beat and faster
    { label:'1/1 (beat)', value:'1' },
    { label:'1/2', value:'2' },
    { label:'1/4', value:'4' },
    { label:'1/8', value:'8' },
    { label:'1/16', value:'16' },
  ];
  for (const {label, value} of options){
    const o = document.createElement('option');
    o.value = value; o.textContent = label; sel.appendChild(o);
  }
  // Set initial from dataset or provided
  const ds = parseFloat(panel.dataset.quantDiv || panel.dataset.quant || String(quantDiv));
  if (Number.isFinite(ds)) quantDiv = ds;
  sel.value = String(quantDiv);

  // Prevent interfering with canvas gestures
  ['pointerdown','pointermove','pointerup','click','mousedown','touchstart','touchmove','touchend'].forEach(t=> {
    sel.addEventListener(t, ev=> ev.stopPropagation(), { passive:true });
  });

  if (!qLabel.parentNode) qWrap.appendChild(qLabel);
  if (!sel.parentNode) qWrap.appendChild(sel);

  // Add a visible beat/quant dot next to the dropdown
  let dot = qWrap.querySelector('.bouncer-quant-dot');
  if (!dot){
    dot = document.createElement('span');
    dot.className = 'bouncer-quant-dot';
    Object.assign(dot.style, {
      display: 'inline-block',
      width: '14px',
      height: '14px',
      borderRadius: '50% 50%',
      background: 'rgba(255,255,255,0.35)',
      boxShadow: '0 0 0 0 rgba(255,255,255,0.0)',
      marginLeft: '6px',
      transform: 'scale(1)'
    });
    qWrap.appendChild(dot);
  }

  // Mount into header controls
  function mount(){
    const header = panel.querySelector('.toy-header');
    const right = panel.querySelector('.toy-controls-right') || header;
    try{ if (right && !qWrap.parentNode) right.appendChild(qWrap); }catch{}
  }
  mount();

  // Advanced-only visibility
  const isAdvanced = ()=> panel.classList.contains('toy-zoomed') || !!panel.closest('#zoom-overlay');
  function updateVisibility(){ qWrap.style.display = isAdvanced() ? 'flex' : 'none'; }
  updateVisibility();
  panel.addEventListener('toy-zoom', updateVisibility);
  const __obs = new MutationObserver(()=> updateVisibility());
  try{ __obs.observe(panel, { attributes:true, attributeFilter:['class'] }); }catch{}

  if (!sel.__wired){ sel.__wired = true; sel.addEventListener('change', ()=>{
    const v = parseFloat(sel.value);
    quantDiv = Number.isFinite(v) ? v : 0;
    panel.dataset.quantDiv = String(quantDiv);
    try{ panel.dispatchEvent(new CustomEvent('bouncer:quant', { detail:{ div: quantDiv } })); }catch{}
  }); }

  return ()=> quantDiv; // getter
}
