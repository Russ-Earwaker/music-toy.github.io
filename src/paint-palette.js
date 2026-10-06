import { createPaletteState, segmentHitsRect } from './paint-palette-state.js';
import { instrumentColour, setInstrumentColour } from './instrument-colours.js';
import { openInstrumentPicker, closeInstrumentPicker } from './instrument-picker.js';
import { getDisplayNameForId } from './instrument-catalog.js';

export function installPaintPalette() {
 if (document.getElementById('paint-palette')) return;
 const root = document.createElement('aside');
 root.id = 'paint-palette'; root.setAttribute('aria-label', 'Painter’s palette');
 root.innerHTML = `<button class="palette-handle" type="button" aria-expanded="false" title="Open painter’s palette">🎨<span>Paint</span></button>
  <div class="palette-wells" hidden></div><div class="palette-tools" hidden>
  <button type="button" data-tool="randomise" title="Randomise musical content">✧<span>Randomise</span></button>
  <button type="button" data-tool="eyedropper" title="Sample an instrument">◉<span>Eyedropper</span></button></div>
  <p class="palette-hint" hidden>Hold a well to configure · Tap empty board to put down</p>`;
 document.body.appendChild(root);
 const wells = root.querySelector('.palette-wells');
 const handle = root.querySelector('.palette-handle');
 const buttons = [];
 const palette = createPaletteState({ onChange: render });
 let stroke = null, config = null, hold = null, swallowClickUntil = 0, suppressBoardClickUntil = 0;
 const name = id => getDisplayNameForId(id) || id || 'Empty well';
 function render() {
  buttons.forEach((button, i) => {
   const id = palette.state.slots[i];
   button.style.setProperty('--paint', id ? instrumentColour(id) : '#63534b');
   button.textContent = id ? name(id) : '+';
   button.setAttribute('aria-label', `${name(id)} paint well ${i+1}. Hold to configure`);
   button.title = `${name(id)} · Hold to configure`;
   button.setAttribute('aria-pressed', String(palette.state.activePaletteTool === 'instrument' && palette.state.activePaintSlot === i));
  });
  root.querySelectorAll('[data-tool]').forEach(button => button.setAttribute('aria-pressed', String(palette.state.activePaletteTool === button.dataset.tool)));
  document.body.classList.toggle('palette-equipped', !!palette.state.activePaletteTool);
  root.dataset.equipped = palette.state.activePaletteTool || '';
 }
 function toggle() {
  const expanded = handle.getAttribute('aria-expanded') !== 'true';
  handle.setAttribute('aria-expanded', String(expanded));
  root.querySelectorAll('.palette-wells,.palette-tools,.palette-hint').forEach(el => el.hidden = !expanded);
 }
 handle.addEventListener('click', toggle);
 function cancelHold() { if (hold) clearTimeout(hold.timer); hold = null; }
 for (let i=0; i<6; i++) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'palette-well';
  wells.appendChild(button); buttons.push(button);
  button.addEventListener('pointerdown', event => {
   if (event.button !== 0) return;
   cancelHold();
   hold = { x: event.clientX, y: event.clientY, timer: setTimeout(() => { hold = null; swallowClickUntil = performance.now()+900; configure(i); }, 550) };
  });
  button.addEventListener('pointermove', event => { if (hold && Math.hypot(event.clientX-hold.x,event.clientY-hold.y)>10) cancelHold(); });
  for (const event of ['pointerup','pointercancel','pointerleave']) button.addEventListener(event, cancelHold);
  button.addEventListener('contextmenu', event => { event.preventDefault(); });
  button.addEventListener('click', () => {
   if (performance.now()<swallowClickUntil) { swallowClickUntil = 0; return; }
   if (!palette.state.slots[i]) configure(i); else palette.selectSlot(i);
  });
 }
 root.querySelectorAll('[data-tool]').forEach(button => button.addEventListener('click', () => palette.selectTool(button.dataset.tool)));
 function colourHex(id) {
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.fillStyle = instrumentColour(id); ctx.fillRect(0,0,1,1);
  return '#' + [...ctx.getImageData(0,0,1,1).data].slice(0,3).map(v => v.toString(16).padStart(2,'0')).join('');
 }
 function closeConfig() {
  if (!config) return;
  closeInstrumentPicker(config);
  config.remove(); config = null;
 }
 function configure(index) {
  cancelHold(); closeConfig();
  const dialog = document.createElement('dialog'); dialog.className = 'palette-config'; config = dialog;
  dialog.setAttribute('aria-label', `Configure paint well ${index+1}`);
  dialog.dataset.instrument = palette.state.slots[index] || 'tone';
  dialog.innerHTML = `<h2>Paint well ${index+1}</h2><button type="button" class="palette-choose">Choose instrument</button>
   <label>Instrument colour <input type="color"></label><p>Shared by every toy using this instrument.</p>
   <button type="button" class="palette-empty">Empty well</button><button type="button" class="palette-done">Done</button>`;
  document.body.appendChild(dialog); dialog.showModal();
  const colour = dialog.querySelector('input');
  colour.disabled = !palette.state.slots[index];
  colour.value = colourHex(dialog.dataset.instrument);
  colour.addEventListener('input', () => setInstrumentColour(dialog.dataset.instrument, colour.value));
  dialog.querySelector('.palette-choose').textContent = `Choose instrument: ${name(palette.state.slots[index])}`;
  dialog.querySelector('.palette-choose').addEventListener('click', async () => {
   // Temporarily release the modal top layer so the shared picker stays interactive.
   dialog.close();
   try {
    const chosen = await openInstrumentPicker({ panel: dialog, toyId: 'paint-palette' });
    if (config !== dialog) return;
    if (chosen?.value) {
     palette.configure(index, chosen.value); dialog.dataset.instrument = chosen.value;
     dialog.querySelector('.palette-choose').textContent = `Choose instrument: ${name(chosen.value)}`;
     colour.value = colourHex(chosen.value);
     colour.disabled = false;
    }
   } catch (error) { console.warn('[palette] Instrument picker failed', error); }
   if (config === dialog) dialog.showModal();
  });
  dialog.querySelector('.palette-empty').addEventListener('click', () => { palette.configure(index,null); closeConfig(); });
  dialog.querySelector('.palette-done').addEventListener('click', closeConfig);
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeConfig(); });
 }

 // One bounded, demand-driven RAF for trails, toy blooms, shuffle and sample pulses.
 const canvas = document.createElement('canvas'); canvas.className = 'palette-effects'; document.body.appendChild(canvas);
 const ctx = canvas.getContext('2d'); let effects = [], frame = 0;
 function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
 resize(); window.addEventListener('resize', resize);
 function effect(x,y,tool,colour,panel=null) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  effects.push({ x,y,tool,colour,panel,start:performance.now() });
  if (effects.length>64) effects.shift();
  if (!frame) frame = requestAnimationFrame(drawEffects);
 }
 function drawEffects(now) {
  frame = 0; ctx.clearRect(0,0,canvas.width,canvas.height);
  effects = effects.filter(e => now-e.start<420);
  for (const e of effects) {
   const t=(now-e.start)/420; ctx.globalAlpha=(1-t)*0.8;
   ctx.strokeStyle=e.colour; ctx.fillStyle=e.colour; ctx.lineWidth=3;
   if (e.panel?.isConnected) {
    const r=e.panel.getBoundingClientRect(); ctx.globalAlpha=(1-t)*0.22;
    ctx.fillRect(r.left,r.top,r.width,r.height); ctx.globalAlpha=(1-t)*0.8;
   }
   if (e.tool==='randomise') {
    ctx.save(); ctx.translate(e.x,e.y); ctx.rotate(t*4); ctx.font='28px sans-serif'; ctx.fillText('✧',-12,10); ctx.restore();
   } else {
    ctx.beginPath(); ctx.arc(e.x,e.y, e.tool==='eyedropper' ? 8+t*26 : 3+t*10,0,Math.PI*2);
    if (e.tool==='eyedropper') ctx.stroke(); else ctx.fill();
   }
  }
  ctx.globalAlpha=1;
  if (effects.length) frame=requestAnimationFrame(drawEffects);
 }
 const stop = event => { event.preventDefault(); event.stopImmediatePropagation(); };
 const boardTarget = target => target?.closest?.('.board-viewport');
 const overlayTarget = target => target?.closest?.('#paint-palette,.palette-config,#inst-picker,.toy-spawner,#topbar,dialog');
 function applyAt(a,b) {
  if (stroke.sampled) return;
  const tool = palette.state.activePaletteTool;
  for (const panel of document.querySelectorAll('.board-viewport .toy-panel[data-toy]')) {
   if (!panel.isConnected || !panel.getClientRects().length) continue;
   const rect=panel.getBoundingClientRect();
   if (!segmentHitsRect(a,b,rect)) continue;
   // Do not paint through an overlapping panel or a visible overlay.
   const x=Math.max(rect.left+0.5,Math.min(rect.right-0.5,b.x));
   const y=Math.max(rect.top+0.5,Math.min(rect.bottom-0.5,b.y));
   if (document.elementFromPoint(x,y)?.closest('.toy-panel') !== panel) continue;
   if (palette.paint(panel)) {
    stroke.painted=true;
    effect(x,y,tool,tool==='randomise'?'#f5d9ff':instrumentColour(panel.dataset.instrument),panel);
    if (tool==='eyedropper') { stroke.sampled=true; break; }
   }
  }
 }
 document.addEventListener('pointerdown', event => {
  if (!palette.state.activePaletteTool || overlayTarget(event.target) || !boardTarget(event.target) || event.button!==0) return;
  stop(event);
  if (stroke) return;
  const point={x:event.clientX,y:event.clientY};
  palette.beginStroke(); stroke={id:event.pointerId,start:point,last:point,moved:false,painted:false,sampled:false,empty:!event.target.closest('.toy-panel')};
  try { stroke.capture=boardTarget(event.target); stroke.capture.setPointerCapture(event.pointerId); } catch {}
  applyAt(point,point);
 },true);
 document.addEventListener('pointermove', event => {
  if (!stroke || stroke.id!==event.pointerId) return;
  stop(event);
  const point={x:event.clientX,y:event.clientY};
  if (Math.hypot(point.x-stroke.start.x,point.y-stroke.start.y)>8) stroke.moved=true;
  applyAt(stroke.last,point);
  if (Math.hypot(point.x-stroke.last.x,point.y-stroke.last.y)>5 && !stroke.sampled) {
   const tool=palette.state.activePaletteTool;
   effect(point.x,point.y,tool,tool==='instrument'?instrumentColour(palette.state.slots[palette.state.activePaintSlot]):'#f5d9ff');
  }
  stroke.last=point;
 },true);
 function finish(event) {
  if (!stroke || stroke.id!==event.pointerId) return;
  stop(event);
  if (event.type==='pointerup') applyAt(stroke.last,{x:event.clientX,y:event.clientY});
  const clear=event.type==='pointerup' && stroke.empty && !stroke.moved && !stroke.painted;
  suppressBoardClickUntil = performance.now()+700;
  releaseStroke(); if (clear) palette.clear();
 }
 function releaseStroke() {
  const previous=stroke;
  stroke=null; palette.endStroke();
  if (previous) { try { previous.capture?.releasePointerCapture(previous.id); } catch {} }
 }
 document.addEventListener('pointerup',finish,true); document.addEventListener('pointercancel',finish,true);
 document.addEventListener('lostpointercapture',event => { if (stroke?.id===event.pointerId) releaseStroke(); },true);
 // Prevent a synthetic click after painting from activating a toy's controls.
 document.addEventListener('click', event => {
  if (boardTarget(event.target) && (palette.state.activePaletteTool || performance.now()<suppressBoardClickUntil) && !overlayTarget(event.target)) stop(event);
 },true);
 document.addEventListener('wheel',event => {
  if (palette.state.activePaletteTool && boardTarget(event.target) && !overlayTarget(event.target)) stop(event);
 },{capture:true,passive:false});
 document.addEventListener('keydown',event => { if (event.key==='Escape' && !config) { releaseStroke(); palette.clear(); } });
 window.addEventListener('blur', () => { cancelHold(); releaseStroke(); });
 const reset=() => { cancelHold(); releaseStroke(); palette.clear(); closeConfig(); effects=[]; };
 window.addEventListener('scene:new',reset); window.addEventListener('scene:load',reset);
 window.addEventListener('instrument-colour:change',render);
 render();
}

if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',installPaintPalette,{once:true});
else installPaintPalette();
