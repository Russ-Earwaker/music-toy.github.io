// src/toyui.js — header controls for toys (Zoom, Random, Reset, Mute + per-toy volume hook)
import { getInstrumentNames } from './audio.js';

export function initToyUI(panel, {
  toyName = 'LoopGrid',
  defaultInstrument = 'tone',
  showAdd = false,
  showDelete = false,
  hintAdd = '',
  hintDelete = '',
  deleteMode = 'toggle',
  getDeletableCount = null,
  onRandom = null,
  onReset = null
} = {}){

  // Ensure a header exists
  let header = panel.querySelector('.toy-header');
  if (header) header.textContent = '';
  if (!header){
    header = document.createElement('div');
    header.className = 'toy-header';
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.gap = '10px';
    header.style.padding = '8px 10px';
    panel.prepend(header);
  }

  function makeBtn(txt, title){
    const b = document.createElement('button');
    b.type='button';
    b.className='toy-btn';
    b.textContent = txt;
    b.title = title || txt;
    // minimal inline style so buttons show even if CSS is missing
    b.style.padding = '6px 10px';
    b.style.border = '1px solid #252b36';
    b.style.borderRadius = '10px';
    b.style.background = '#0d1117';
    b.style.color = '#e6e8ef';
    b.style.cursor = 'pointer';
    b.addEventListener('pointerdown', ev => ev.stopPropagation(), { capture:true });
    return b;
  }

  // Left: Zoom + name
  const left = document.createElement('div'); left.style.display='flex'; left.style.alignItems='center'; left.style.gap='8px';
  const zoomBtn = makeBtn('Zoom', 'Zoom / Edit');
  const nameEl  = document.createElement('span'); nameEl.textContent = toyName; nameEl.style.opacity='.85';
  left.append(zoomBtn, nameEl);
  header.appendChild(left);

  // Right: Random, Reset, (Instrument), Mute
  const right = document.createElement('div'); right.style.display='flex'; right.style.alignItems='center'; right.style.gap='8px';

  const randBtn  = makeBtn('Random', 'Randomize pattern');
  const resetBtn = makeBtn('Reset',  'Clear pattern');

  const instWrap = document.createElement('div'); instWrap.style.display='none'; instWrap.style.alignItems='center'; instWrap.style.gap='6px';
  const instSel = document.createElement('select');
  instSel.style.background='#0d1117'; instSel.style.color='#e6e8ef';
  instSel.style.border='1px solid #252b36'; instSel.style.borderRadius='8px'; instSel.style.padding='4px 6px';
  function rebuildInstruments(){
    const names = getInstrumentNames();
    instSel.innerHTML='';
    names.forEach(n => { const o=document.createElement('option'); o.value=o.textContent=n; instSel.appendChild(o); });
    if (names.includes(defaultInstrument)) instSel.value = defaultInstrument;
  }
  rebuildInstruments();
  window.addEventListener('samples-ready', rebuildInstruments);

  instWrap.append(instSel);

  const muteBtn = makeBtn('Mute', 'Mute toy');

  right.append(randBtn, resetBtn, instWrap, muteBtn);
  header.appendChild(right);

  // Volume slider anchored near mute
  const volWrap = document.createElement('div');
  volWrap.className = 'toy-volwrap';
  volWrap.style.position = 'absolute';
  volWrap.style.zIndex = '5';
  volWrap.style.pointerEvents = 'auto';
  volWrap.style.display = 'block';
  volWrap.style.width = '36px';
  volWrap.style.height = '160px';
  volWrap.style.padding = '8px 10px';
  volWrap.style.background = 'rgba(13,17,23,0.92)';
  volWrap.style.border = '1px solid #252b36';
  volWrap.style.borderRadius = '12px';
  volWrap.style.boxShadow = '0 10px 24px rgba(0,0,0,.35)';
  volWrap.style.backdropFilter = 'blur(6px)';
  volWrap.style.userSelect = 'none';

  const vol = document.createElement('input');
  vol.type = 'range';
  vol.min = '0'; vol.max = '100'; vol.value = '100'; vol.step = '1';
  vol.style.writingMode = 'vertical-rl';
  vol.style.direction = 'rtl';
  vol.style.width = '24px';
  vol.style.height = '120px';
  vol.style.margin = '0';
  vol.style.padding = '0';
  vol.style.appearance = 'none';
  vol.style.background = 'transparent';
  // track
  vol.addEventListener('input', (e)=>{ /* TODO: wire to per-toy gain; for now treat 0 as mute */ setMuted(vol.value === '0'); });
  vol.addEventListener('pointerdown', ev => ev.stopPropagation(), { capture:true });

  volWrap.appendChild(vol);
  panel.appendChild(volWrap);

  function positionVolume(){
    // Anchor to the mute button's visual position at the header's right edge
    try{
      const rectP = panel.getBoundingClientRect();
      const rectH = header.getBoundingClientRect();
      const rectM = muteBtn.getBoundingClientRect();
      const x = (rectM.right - rectP.left) - rectP.width + panel.clientWidth + 10; // right edge + offset
      const y = (rectH.bottom - rectP.top) + 8;
      volWrap.style.left = `calc(100% + 10px)`;
      volWrap.style.top  = `${rectH.height + 8}px`;
    }catch{}
  }
  // initial & on resize/zoom
  positionVolume();
  window.addEventListener('resize', positionVolume);
  panel.addEventListener('toy-zoom', positionVolume);


  // Zoom state + dispatch
  let zoomed = false;
  function setZoom(z){
    zoomed = !!z;
    instWrap.style.display = zoomed ? 'flex' : 'none';
    panel.dispatchEvent(new CustomEvent('toy-zoom', { detail: { zoomed } }));
  }
  setZoom(false);

  zoomBtn.addEventListener('click', ()=> setZoom(!zoomed));

  // Random/Reset dispatch (toyui never mutates data; it notifies)
  randBtn.addEventListener('click', ()=>{
    const ev = new CustomEvent('toy-random', { bubbles:true });
    panel.dispatchEvent(ev);
    onRandom && onRandom();
  });
  resetBtn.addEventListener('click', ()=>{
    const ev = new CustomEvent('toy-reset', { bubbles:true });
    panel.dispatchEvent(ev);
    onReset && onReset();
  });

  // Mute flag (toy code can read ui.muted)
  let muted = false;
  function setMuted(m){ muted = !!m; muteBtn.style.opacity = muted ? '0.6' : '1.0'; }
  muteBtn.addEventListener('click', ()=> setMuted(!muted));

  // Public API for toys
  return {
    get instrument(){ return instSel.value; },
    setInstrument: (name)=>{ instSel.value = name; },
    setZoom,
    get muted(){ return muted; },
    setMuted
  };
}
