// src/ripplesynth.js (toy18: guard tiny panels; stable header)
import { noteList } from './utils.js?toy18';
import { ensureAudioContext, triggerInstrument } from './audio.js?toy18';
import { initToyUI } from './toyui.js?toy18';

function hardResize(canvas, host){
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
  const rect = host.getBoundingClientRect();
  const cssW = Math.max(1, Math.floor(rect.width));
  const cssH = Math.max(1, Math.floor(rect.height));
  if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
    canvas.width  = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas._vw = cssW;
    canvas._vh = cssH;
  }
}


function ensurePanelSizing(shell, host, headH){
  try{
    const cs = getComputedStyle(shell);
    if (cs.position === 'static') shell.style.position = 'relative';
  }catch{ shell.style.position = shell.style.position || 'relative'; }

  // Provide sensible defaults only if panel is tiny (e.g., 20x20)
  const w = Math.max(0, shell.clientWidth|0);
  const h = Math.max(0, shell.clientHeight|0);

  if (w < 220) shell.style.width = shell.style.width || '380px';
  if (h < (headH + 140)) shell.style.height = shell.style.height || (headH + 300) + 'px';

  // Make body fill the interior and have a minimum drawing area
  host.style.minHeight = host.style.minHeight || '260px';
  host.style.minWidth  = host.style.minWidth  || '320px';
}


function setHeaderTitle(shell, name){
  const h = shell?.querySelector?.('.toy-header');
  if (!h) return;
  let span = h.querySelector('.toy-title');
  if (!span) { span = document.createElement('span'); span.className='toy-title'; h.appendChild(span); }
  span.textContent = name;
}

const MAX_RIPPLES = 12;

export function createRippleSynth(target){
  const shell  = (typeof target === 'string') ? document.querySelector(target) : target;
  console.log('[Ripple] mount on', shell?.id || shell);

  let host = shell?.querySelector?.('.toy-body');
  if (!host){
    host = document.createElement('div');
    host.className = 'toy-body';
    shell?.appendChild?.(host);
  }

  const header = shell?.querySelector?.('.toy-header');
  const headH = header ? Math.max(44, Math.round(header.getBoundingClientRect().height)) : 44;
  Object.assign(host.style, {
    position: 'absolute',
    left: '10px', right: '10px', bottom: '10px',
    top: (headH + 6) + 'px',
    display: 'block',
    background: 'rgba(0,128,255,0.08)'
  });

  ensurePanelSizing(shell, host, headH);

  const canvas = (host && host.querySelector && host.querySelector('canvas.ripple-canvas')) || (()=>{
    const c = document.createElement('canvas'); c.className='ripple-canvas'; host.appendChild(c); return c;
  })();
  const ctx = canvas.getContext('2d');
  hardResize(canvas, host);
  console.log('[Ripple] ctx ok, canvas css=', canvas.style.width, canvas.style.height);

  const ui = initToyUI(shell, { toyName: 'Ripple', showAdd:false, showDelete:false });
  setHeaderTitle(shell, 'Ripple');
  requestAnimationFrame(() => setHeaderTitle(shell, 'Ripple'));

  let instrument = 'tone';
  ui?.setInstrument && ui.setInstrument(instrument);

  const ripples = []; // {x,y,r,life,noteIndex}
  const noteListLocal = noteList || ['C4','D4','E4','F4','G4','A4','B4'];
  const cIdx = noteListLocal.indexOf('C4') !== -1 ? noteListLocal.indexOf('C4') : 0;

  function addRipple(x, y, noteIndex){
    if (ripples.length >= MAX_RIPPLES) ripples.shift();
    ripples.push({ x, y, r: 4, life: 1, noteIndex });
    const nn = noteListLocal[Math.max(0, Math.min(noteListLocal.length-1, noteIndex))] || 'C4';
    triggerInstrument(instrument, nn, ensureAudioContext().currentTime);
  }

  function maybeStartDemo(){
    const seed = () => { addRipple(80, 120, cIdx); addRipple(160, 120, cIdx+4); addRipple(240, 120, cIdx+7); };
    const pulse = () => { addRipple(40 + Math.random()*300, 40 + Math.random()*180, cIdx + (Math.random()*7|0)); };
    if (window.__audioUnlocked) {
      seed();
      setInterval(pulse, 1200);
    } else {
      const once = () => { seed(); setInterval(pulse, 1200); window.removeEventListener('audio-unlocked', once); };
      window.addEventListener('audio-unlocked', once);
    }
  }
  maybeStartDemo();

  canvas.addEventListener('pointerdown', (e)=>{
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left);
    const py = (e.clientY - rect.top);
    const rows = 8;
    const row = Math.max(0, Math.min(rows-1, Math.floor((py / (canvas._vh || rect.height)) * rows)));
    addRipple(px, py, cIdx + (rows-1 - row));
  });

  const doResize = ()=> hardResize(canvas, host);
  window.addEventListener('resize', doResize);
  new ResizeObserver(() => hardResize(canvas, host)).observe(host);
  requestAnimationFrame(doResize);

  let running = true;
  function draw(){
    if (!running) return;
    hardResize(canvas, host);
    const vw = canvas._vw ?? canvas.width;
    const vh = canvas._vh ?? canvas.height;
    ctx.clearRect(0, 0, vw, vh);

    ctx.fillStyle = '#0f131a';
    ctx.fillRect(0, 0, vw, vh);

    for (let i=0;i<ripples.length;i++){
      const r = ripples[i];
      r.r += 1.8;
      r.life -= 0.01;
      if (r.life <= 0){ ripples.splice(i,1); i--; continue; }
      const alpha = Math.max(0, Math.min(1, r.life));
      ctx.strokeStyle = `rgba(255,255,255,${0.8*alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI*2);
      ctx.stroke();
    }

    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  function onLoop(loopStartTime){ /* optional */ }
  function reset(){ ripples.splice(0, ripples.length); }
  function setInstrument(name){ instrument = name || 'tone'; ui?.setInstrument?.(instrument); }
  function destroy(){ running=false; }

  return { onLoop, reset, setInstrument, element: canvas, destroy };
}
