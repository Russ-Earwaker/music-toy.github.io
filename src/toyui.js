// src/toyui.js — header draggable (pointer-events:auto); robust click routing for all buttons
import { ensureAudioContext, getInstrumentNames, createChannel } from './audio.js';

const ICONS = {
  zoom: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10V4h6v2H5v4H3zm10-6h6v6h-2V6h-4V4zM5 14h4v4h2v-6H3v2zm10 4v-2h4v-4h2v6h-6z"/></svg>`,
  muteOn: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3z"/><path d="m16 9 5 5m0-5-5 5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`,
  muteOff:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3z"/><path d="M17 8a5 5 0 0 1 0 8" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`,
  dice:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h9v9H4zM11 11h9v9h-9z"/></svg>`,
  reset:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v4l3-3-3-3v2a6 6 0 1 0 6 6h-2A4 4 0 1 1 12 6z"/></svg>`,
};

export function initToyUI(shell, {
  defaultInstrument = 'tone',
  onRandom = null,
  onReset  = null,
} = {}){
  // Build or reset header
  let header = shell.querySelector('.toy-header');
  if (!header){
    header = document.createElement('div');
    header.className = 'toy-header';
    shell.prepend(header);
  } else {
    header.innerHTML = '';
  }

  // Left: Zoom + LoopGrid name
  const left = document.createElement('div'); left.className = 'toy-left';
  const zoomBtn = document.createElement('button'); zoomBtn.className = 'toy-btn icon large primary'; zoomBtn.type='button'; zoomBtn.dataset.role='zoom'; zoomBtn.innerHTML = ICONS.zoom;
  const nameEl = document.createElement('span'); nameEl.className = 'toy-name'; nameEl.textContent = 'LoopGrid';
  left.appendChild(zoomBtn); left.appendChild(nameEl);
  header.appendChild(left);

  // Right: Random, Reset, Instrument (zoom-only), BIG Mute
  const right = document.createElement('div'); right.className = 'toy-right';
  const randBtn  = document.createElement('button'); randBtn.className='toy-btn'; randBtn.type='button'; randBtn.dataset.role='random'; randBtn.innerHTML = ICONS.dice + '<span>Random</span>';
  const resetBtn = document.createElement('button'); resetBtn.className='toy-btn'; resetBtn.type='button'; resetBtn.dataset.role='reset';  resetBtn.innerHTML = ICONS.reset + '<span>Reset</span>';
  const instWrap = document.createElement('div'); instWrap.className='inst-wrap';
  const instSel  = document.createElement('select'); instSel.className='inst-select'; instWrap.appendChild(instSel);
  const muteBtn  = document.createElement('button'); muteBtn.className='toy-btn icon large'; muteBtn.type='button'; muteBtn.dataset.role='mute'; muteBtn.innerHTML = ICONS.muteOff;
  right.appendChild(randBtn); right.appendChild(resetBtn); right.appendChild(instWrap); right.appendChild(muteBtn);
  header.appendChild(right);

  // Instrument list
  function rebuildSelect(){
    const names = getInstrumentNames();
    const cur = instSel.value;
    instSel.innerHTML = '';
    names.forEach(n => { const o = document.createElement('option'); o.value=o.textContent=n; instSel.appendChild(o); });
    instSel.value = names.includes(cur) ? cur : (names[0] || defaultInstrument || 'tone');
  }
  rebuildSelect();
  setTimeout(()=>{ try{ rebuildSelect(); }catch{} }, 600);
  window.addEventListener('samples-ready', ()=>{ try{ rebuildSelect(); }catch{} });

  // Floating volume
  const volWrap = document.createElement('div'); volWrap.className = 'toy-volwrap floating';
  const vol = document.createElement('input'); vol.type='range'; vol.min='0'; vol.max='100'; vol.value='100'; vol.className='toy-volume';
  volWrap.appendChild(vol);
  shell.appendChild(volWrap);

  function positionVolume(){
    const shellRect  = shell.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const top = headerRect.top - shellRect.top;
    volWrap.style.top = `${Math.round(top)}px`;
    volWrap.style.left = '100%';
  }
  requestAnimationFrame(positionVolume);
  window.addEventListener('resize', positionVolume);

  // State
  let zoomed = false;
  let instrument = instSel.value || defaultInstrument || 'tone';
  instSel.addEventListener('change', ()=> { instrument = instSel.value; });

  ensureAudioContext();
  const channel = createChannel(1);
  let muted = false;
  function applyGain(){ channel.gain.value = muted ? 0 : (Number(vol.value)/100); }
  vol.addEventListener('input', applyGain);

  // Click handler
  function handle(role){
    if (role === 'zoom'){ console.log('[LoopGrid] zoom click'); setZoom(!zoomed); return; }
    if (role === 'mute'){ console.log('[LoopGrid] mute click'); muted = !muted; muteBtn.innerHTML = muted ? ICONS.muteOn : ICONS.muteOff; applyGain(); return; }
    if (role === 'random'){ console.log('[LoopGrid] random click'); onRandom && onRandom(); return; }
    if (role === 'reset'){ console.log('[LoopGrid] reset click'); if (!zoomed || confirm('Reset this toy?')) onReset && onReset(); return; }
  }

  // Direct listeners
  zoomBtn.addEventListener('click', ()=> handle('zoom'));
  muteBtn.addEventListener('click', ()=> handle('mute'));
  randBtn.addEventListener('click', ()=> handle('random'));
  resetBtn.addEventListener('click', ()=> handle('reset'));

  // Delegation backup (header still draggable)
  header.addEventListener('click', (e)=>{
    const btn = e.target.closest && e.target.closest('button.toy-btn');
    if (!btn) return;
    handle(btn.dataset.role);
  });

  // Capture-phase rect routing (works even if target is the header or child span/svg)
  function routeByRect(ev){
    const h = header;
    if (!h) return;
    const r = h.getBoundingClientRect();
    const x = ev.clientX; const y = ev.clientY;
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return;
    const targets = [
      { el: zoomBtn, role: 'zoom' },
      { el: randBtn, role: 'random' },
      { el: resetBtn, role: 'reset' },
      { el: muteBtn, role: 'mute' },
    ].filter(t => t.el && t.el.offsetParent !== null);
    for (const t of targets){
      const br = t.el.getBoundingClientRect();
      if (x >= br.left && x <= br.right && y >= br.top && y <= br.bottom){
        handle(t.role);
        ev.stopPropagation(); ev.preventDefault();
        return;
      }
    }
  }
  document.addEventListener('click', routeByRect, true);

  console.log('[LoopGrid] header wired; buttons=', header.querySelectorAll('button.toy-btn').length);

  function setZoom(z){
    zoomed = !!z;
    instWrap.style.display = zoomed ? 'block' : 'none';
    shell.dispatchEvent(new CustomEvent('toy-zoom', { detail: { zoomed } }));
    requestAnimationFrame(positionVolume);
  }
  setZoom(false);

  return {
    channel,
    get instrument(){ return instrument; },
    setInstrument(name){ instrument = name; instSel.value = name; },
    get zoomed(){ return zoomed; },
    setZoom,
  };
}
