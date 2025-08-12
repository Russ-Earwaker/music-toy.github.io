// src/toyui.js — header controls for toys (Zoom, Random, Reset, Mute + per-toy volume hook)
import { getInstrumentNames } from './audio.js';

// --- DEBUG helpers (set localStorage.toyuiDebug='1' to enable persistently) ---
const DEBUG = (typeof localStorage !== 'undefined' && localStorage.toyuiDebug === '1');
function dbg(...args){ if (DEBUG) { try { console.log('[toyui]', ...args); } catch {} } }


const ICONS = {
  volume: `<svg viewBox='0 0 24 24' aria-hidden='true'><path d='M3 10v4h4l5 4V6L7 10H3z'/><path d='M16.5 12a4.5 4.5 0 0 0-2.5-4.03v8.06A4.5 4.5 0 0 0 16.5 12z'/></svg>`,
  mute:   `<svg viewBox='0 0 24 24' aria-hidden='true'><path d='M3 10v4h4l5 4V6L7 10H3z'/><path d='M19 5l-3 3'/><path d='M16 8l3 3'/></svg>`
};

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
  const left = document.createElement('div'); left.style.display='flex'; left.className = 'toy-controls toy-controls-left'; left.style.alignItems='center'; left.style.gap='8px';
  const zoomBtn = makeBtn('Zoom', 'Zoom / Edit');
  const nameEl  = document.createElement('span'); nameEl.textContent = toyName; nameEl.style.opacity='.85';
  left.append(zoomBtn, nameEl);
  header.appendChild(left);

  // Right: Random, Reset, (Instrument), Mute
  const right = document.createElement('div'); right.style.display='flex'; right.className = 'toy-controls toy-controls-right'; right.style.alignItems='center'; right.style.gap='8px';

  const randBtn  = makeBtn('Random', 'Randomize pattern');
  const resetBtn = makeBtn('Clear',  'Clear pattern');

  const instWrap = document.createElement('div'); instWrap.style.display='none'; instWrap.style.alignItems='center'; instWrap.style.gap='6px';
  const instSel = document.createElement('select');
  instSel.className = 'toy-instrument';
instSel.addEventListener('pointerdown', ev => ev.stopPropagation(), { capture: true });
instSel.addEventListener('click', ev => ev.stopPropagation(), { capture: true });
instSel.addEventListener('change', ()=>{
  panel.dispatchEvent(new CustomEvent('toy-instrument', { detail: { value: instSel.value } }));
});
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

  const muteBtn = makeBtn('', 'Mute'); muteBtn.innerHTML = ICONS.volume;

  right.append(randBtn, resetBtn, instWrap);
  header.appendChild(right);

  // Backdrop overlay for zoom
  let overlay = document.querySelector('.toy-overlay');
  if (!overlay){
    overlay = document.createElement('div');
    overlay.className = 'toy-overlay';
    overlay.style.display = 'none'; overlay.style.pointerEvents = 'none';
      if (overlay._onClickOutside){ overlay.removeEventListener('click', overlay._onClickOutside); }
    document.body.appendChild(overlay);
  }
  overlay.addEventListener('click', ()=> setZoom(false));


  // External volume pod (Mute + vertical slider)
  const volWrap = document.createElement('div');
  volWrap.className = 'toy-volwrap';
  volWrap.style.position = 'absolute';
  volWrap.style.zIndex = '5';
  volWrap.style.pointerEvents = 'auto';
  volWrap.style.display = 'flex';
  volWrap.style.flexDirection = 'column';
  volWrap.style.alignItems = 'center';
  volWrap.style.gap = '8px';
  volWrap.style.width = '56px';
  volWrap.style.padding = '10px 10px';
  volWrap.style.background = 'rgba(13,17,23,0.92)';
  volWrap.style.border = '1px solid #252b36';
  volWrap.style.borderRadius = '12px';
  volWrap.style.boxShadow = '0 10px 24px rgba(0,0,0,.35)';
  volWrap.style.backdropFilter = 'blur(6px)';
  volWrap.style.userSelect = 'none';

  // Move Mute button into the pod
  muteBtn.style.width = '100%';
  muteBtn.style.textAlign = 'center';
  volWrap.appendChild(muteBtn);

  // Vertical range slider
  const vol = document.createElement('input');
  vol.type = 'range';
  vol.min = '0'; vol.max = '100'; vol.value = '100'; vol.step = '1';
  vol.className = 'toy-volrange';
  vol.style.writingMode = 'vertical-rl';
  vol.style.direction = 'rtl';
  vol.style.width = '28px';
  vol.style.height = '140px';
  vol.style.margin = '0';
  vol.style.padding = '0';
  vol.style.appearance = 'none';
  vol.style.background = 'linear-gradient(to right, transparent calc(50% - 3px), #5b6378 calc(50% - 3px), #5b6378 calc(50% + 3px), transparent calc(50% + 3px))';
  vol.style.borderRadius = '8px';

  vol.addEventListener('input', ()=>{
    const v = Math.max(0, Math.min(1, (parseInt(vol.value,10)||0)/100));
    try { window.dispatchEvent(new CustomEvent('master-volume', { detail: { value: v } })); } catch{}
  });
  vol.addEventListener('pointerdown', ev => ev.stopPropagation(), { capture:true });

  volWrap.appendChild(vol);
  panel.appendChild(volWrap);

  function positionVolume(){
    // Anchor pod to the right outside the panel, top aligned just below header
    const rectH = header.getBoundingClientRect();
    volWrap.style.left = 'calc(100% + 10px)';
    volWrap.style.top = '0px';
  }
  positionVolume();
  window.addEventListener('resize', positionVolume);
  panel.addEventListener('toy-zoom', positionVolume);


  // Zoom state + dispatch
  let zoomed = false;
  
function setZoom(z){
  dbg('setZoom call', { to: !!z });
  zoomed = !!z;
  instWrap.style.display = zoomed ? 'flex' : 'none';
  panel.classList.toggle('toy-zoomed', zoomed);
  panel.classList.toggle('toy-unzoomed', !zoomed);
  // Overlay + center
  try{
    if (zoomed){
      overlay.style.display = 'block'; overlay.style.pointerEvents = 'auto';
      overlay.style.zIndex = '9000';
      // remember original style to restore
      if (!panel.dataset.prevStyle) panel.dataset.prevStyle = panel.getAttribute('style') || '';
      panel.classList.add('toy-zoomed-floating');
      // Center and elevate panel in viewport
      panel.style.position = 'fixed';
      panel.style.left = '50%'; panel.style.top = '50%';
      panel.style.transform = 'translate(-50%, -50%)';
      panel.style.zIndex = '10000';
      panel.style.width = 'fit-content';
      // Freeze page scroll
      if (!document.body.dataset._prevOverflow){ document.body.dataset._prevOverflow = document.body.style.overflow || ''; }
      document.body.style.overflow = 'hidden';
      // Header: non-interactive background, interactive controls
      const header = panel.querySelector('.toy-header');
      if (header){
        header.style.pointerEvents = 'none'; dbg('header inert in zoom');
        const clickable = header.querySelectorAll('button, select, input, label, [role="button"], [data-interactive="true"]');
        clickable.forEach(el => { el.style.pointerEvents = 'auto'; });
      // Close zoom when background (outside panel) is clicked
      if (!overlay._onClickOutside){
        overlay._onClickOutside = (ev)=>{
          dbg('overlay click', { target: ev.target && (ev.target.tagName+'.'+(ev.target.className||'')), x: ev.clientX, y: ev.clientY });
          const r = panel.getBoundingClientRect();
          const inside = (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom);
          if (!inside) setZoom(false);
        };
      }
      overlay.addEventListener('click', overlay._onClickOutside);
      if (DEBUG && !document._toyuiTracePD){
        document._toyuiTracePD = (e)=>{ dbg('doc pointerdown', {t:(e.target&&e.target.tagName)||'', c:e.target&&e.target.className}); };
        document._toyuiTraceClick = (e)=>{ dbg('doc click', {t:(e.target&&e.target.tagName)||'', c:e.target&&e.target.className}); };
        document.addEventListener('pointerdown', document._toyuiTracePD, { capture:true });
        document.addEventListener('click', document._toyuiTraceClick, { capture:true });
      }

    
      }
    } else {
      overlay.style.display = 'none'; overlay.style.pointerEvents = 'none';
      if (overlay._onClickOutside){ overlay.removeEventListener('click', overlay._onClickOutside); }
      panel.classList.remove('toy-zoomed-floating');
      // restore original inline styles
      const prev = panel.dataset.prevStyle || '';
      panel.setAttribute('style', prev);
      delete panel.dataset.prevStyle;
      // restore page scroll
      if (document.body.dataset._prevOverflow !== undefined){
        document.body.style.overflow = document.body.dataset._prevOverflow;
        delete document.body.dataset._prevOverflow;
      }
      // restore header pointer-events
      const header = panel.querySelector('.toy-header');
      if (header){
        header.style.pointerEvents = ''; dbg('header restored');
        const clickable = header.querySelectorAll('button, select, input, label, [role="button"], [data-interactive="true"]');
        clickable.forEach(el => { el.style.pointerEvents = ''; });
      }
    }
  }catch{}
  // Notify toy
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
  function setMuted(m){
    muted = !!m;
    try { muteBtn.innerHTML = muted ? ICONS.mute : ICONS.volume; } catch{}
    try { muteBtn.style.color = muted ? '#7b8193' : '#ffffff'; } catch{}
    try { window.dispatchEvent(new CustomEvent('master-mute', { detail: { muted } })); } catch{}
  }
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
