import {uiMode} from './ui-mode.js';
import {PAINT_TARGET_SELECTOR,resolvePaintTarget,paintInstrument} from './paint-target.js';
import { createPaletteState, segmentHitsRect } from './paint-palette-state.js';
import { instrumentColour, setInstrumentColour } from './instrument-colours.js';
import { openInstrumentPicker, closeInstrumentPicker } from './instrument-picker.js';
import { getInstrumentDisplayLabel,getInstrumentEntries,loadInstrumentEntries } from './instrument-catalog.js';
import {getSoundThemeKey} from './sound-theme.js';
import {auditionInstrument} from './instrument-audition.js';

export function installPaintPalette() {
 if (document.getElementById('paint-palette')) return;
 const root = document.createElement('aside');
 root.id = 'paint-palette';root.dataset.simpleHelp='Tap a sound to select it, then tap or swipe over toys to apply it. Tap empty space to put it down.';root.dataset.simpleHelpGroup='true';root.dataset.helpPosition='top';root.dataset.simpleHelpPlacement='preferred'; root.setAttribute('aria-label', uiMode.isSimple()?'Sound Palette':'Painter’s palette');
 root.innerHTML = `<button class="palette-handle" type="button" aria-expanded="false" title="Open painter’s palette">🎨<span>PAINT</span></button>
  <div class="palette-wells" hidden></div><div class="palette-tools" hidden>
  <button type="button" data-tool="eyedropper" title="Sample an instrument">◉<span>Eyedropper</span></button></div>
  <button type="button" class="palette-shuffle" title="Shuffle instruments" aria-label="Shuffle all six instruments" hidden>🎲<span>Shuffle</span></button>
  <p class="palette-hint" hidden>Hold a well to configure · Tap empty board to put down</p>`;
 document.body.appendChild(root);
 const wells = root.querySelector('.palette-wells');wells.dataset.simpleHelp='Tap and hold a sound to choose a different sound.';wells.dataset.simpleHelpDetail='true';wells.dataset.helpPosition='right';
 const handle = root.querySelector('.palette-handle');
 const buttons = [];
 const palette = createPaletteState({ onChange: render,allowRandomise:()=>!uiMode.isSimple() });
 let stroke = null, config = null, hold = null, swallowClickUntil = 0, suppressBoardClickUntil = 0;
 const name = id => getInstrumentDisplayLabel(id) || 'Empty well';
 let wasEquipped=false;
 function render() {
  const equipped=!!palette.state.activePaletteTool;
  if(equipped&&!wasEquipped)document.dispatchEvent(new CustomEvent('paint-palette:equip'));
  wasEquipped=equipped;
  buttons.forEach((button, i) => {
   const id = palette.state.slots[i];
   button.style.setProperty('--paint', id ? instrumentColour(id) : '#63534b');
   button.textContent = id ? name(id) : '+';
   button.setAttribute('aria-label', `${name(id)} ${uiMode.isSimple()?'sound':'paint'} well ${i+1}. Hold to configure`);
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
  root.querySelectorAll('.palette-wells,.palette-tools,.palette-shuffle,.palette-hint').forEach(el => el.hidden = !expanded);
 }
 handle.addEventListener('click', toggle);
 document.addEventListener('simple-shape-palette:open',()=>{
  if(!window.matchMedia?.('(max-width:600px)').matches)return;
  handle.setAttribute('aria-expanded','false');
  root.querySelectorAll('.palette-wells,.palette-tools,.palette-shuffle,.palette-hint').forEach(el=>el.hidden=true);
 });
 function cancelHold() { if (hold) { clearTimeout(hold.timer); hold.button?.classList.remove('is-holding'); } hold = null; }
 for (let i=0; i<6; i++) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'palette-well';
  let cancelledTap=false;
  wells.appendChild(button); buttons.push(button);
  button.addEventListener('pointerdown', event => {
   if (event.button !== 0) return;
   cancelledTap=false;swallowClickUntil=0;
   cancelHold();
   button.classList.add('is-holding');
   hold = { button, x: event.clientX, y: event.clientY, timer: setTimeout(() => { cancelledTap=true;button.classList.remove('is-holding'); hold = null; swallowClickUntil = performance.now()+900; configure(i); }, 550) };
  });
  button.addEventListener('pointermove', event => { if (hold && Math.hypot(event.clientX-hold.x,event.clientY-hold.y)>10) {cancelledTap=true;cancelHold();} });
  for(const event of ['pointercancel','pointerleave'])button.addEventListener(event,()=>{cancelledTap=true;});
  for (const event of ['pointerup','pointercancel','pointerleave']) button.addEventListener(event, cancelHold);
  button.addEventListener('contextmenu', event => { event.preventDefault(); });
  button.addEventListener('click', () => {
   if (cancelledTap||performance.now()<swallowClickUntil) { cancelledTap=false;swallowClickUntil = 0; return; }
   if (!palette.state.slots[i]) configure(i); else {
    const id=palette.state.slots[i];palette.selectSlot(i);
    void auditionInstrument(id).catch(error=>console.warn('[palette] Audition failed',error));
   }
  });
 }
 root.querySelectorAll('[data-tool]').forEach(button => button.addEventListener('click', () => palette.selectTool(button.dataset.tool)));
 function syncMode(){
  const simple=uiMode.isSimple();
  root.setAttribute('aria-label',simple?'Sound Palette':'Painter’s palette');handle.title=simple?'Open Sound Palette':'Open painter’s palette';handle.querySelector('span').textContent=simple?'SOUND':'PAINT';
  root.querySelector('.palette-hint').textContent=simple?'Hold a sound to configure · Tap empty board to put down':'Hold a well to configure · Tap empty board to put down';
  const shuffleButton=root.querySelector('.palette-shuffle');shuffleButton.querySelector('span').textContent=simple?'Shuffle Sounds':'Shuffle';shuffleButton.title=simple?'Shuffle Sounds':'Shuffle instruments';shuffleButton.setAttribute('aria-label',simple?'Shuffle Sounds':'Shuffle all six instruments');
  const random=root.querySelector('[data-tool="randomise"]');
  if(simple){random?.remove();if(palette.state.activePaletteTool==='randomise')palette.clear();}
  else if(!random){const button=document.createElement('button');button.type='button';button.dataset.tool='randomise';button.title='Randomise musical content';button.innerHTML='✧<span>Randomise</span>';button.onclick=()=>palette.selectTool('randomise');root.querySelector('.palette-tools').prepend(button);}
  render();
 }
 uiMode.subscribe(syncMode);syncMode();
 void loadInstrumentEntries().then(render);
 let shuffleEffectTimer;
 const finishShuffleEffect=()=>{clearTimeout(shuffleEffectTimer);wells.classList.remove('is-shuffling');};
 for(const type of ['animationend','animationcancel'])wells.addEventListener(type,event=>{
  if(event.animationName==='palette-shuffle'||event.animationName==='palette-shuffle-fade')finishShuffleEffect();
 });
 const shuffle=root.querySelector('.palette-shuffle');shuffle.dataset.simpleHelp='Fill the palette with a new set of sounds.';shuffle.dataset.simpleHelpDetail='true';const eyedropper=root.querySelector('[data-tool=eyedropper]');eyedropper.dataset.simpleHelp="Copy a toy's sound into the palette.";eyedropper.dataset.simpleHelpDetail='true';
 shuffle.addEventListener('click',async()=>{
  if(shuffle.disabled)return;shuffle.disabled=true;cancelHold();releaseStroke();palette.clear();
  try{
   const entries=getInstrumentEntries();
   if(palette.shuffle(entries.length?entries:await loadInstrumentEntries(),getSoundThemeKey())){
    finishShuffleEffect();void wells.offsetWidth;wells.classList.add('is-shuffling');
    // Also expire when hidden or when an animation event cannot be delivered.
    shuffleEffectTimer=setTimeout(finishShuffleEffect,350);
   }
  }catch(error){console.warn('[palette] Shuffle failed',error);}
  finally{shuffle.disabled=false;}
 });
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
  dialog.setAttribute('aria-label', `Configure ${uiMode.isSimple()?'sound':'paint'} well ${index+1}`);
  dialog.dataset.instrument = palette.state.slots[index] || 'tone';
  dialog.innerHTML = `<h2>${uiMode.isSimple()?'Sound':'Paint'} well ${index+1}</h2><button type="button" class="palette-choose">Choose instrument</button>
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
  const direct=resolvePaintTarget(document.elementFromPoint(b.x,b.y));
  if(direct&&palette.paint(direct)){
   stroke.painted=true;effect(b.x,b.y,tool,tool==='randomise'?'#f5d9ff':instrumentColour(paintInstrument(direct)),direct.element||direct);
   if(tool==='eyedropper'){stroke.sampled=true;return;}
  }
  for (const panel of document.querySelectorAll(PAINT_TARGET_SELECTOR)) {
   if (!panel.isConnected) continue;
   // Handles and playable SVG surfaces can extend outside their owner's bounds.
   const footprints=[panel,...panel.querySelectorAll('button,canvas,.surface-body,.surface-hit,.cannon-barrel')];
   for(const footprint of footprints){
    if(!footprint.getClientRects().length)continue;
    const rect=footprint.getBoundingClientRect();if(!rect.width||!rect.height||!segmentHitsRect(a,b,rect))continue;
    const x=Math.max(rect.left+0.5,Math.min(rect.right-0.5,b.x)),y=Math.max(rect.top+0.5,Math.min(rect.bottom-0.5,b.y));
    const target=resolvePaintTarget(document.elementFromPoint(x,y));
    if(!target||(target.element||target)!==panel)continue;
    if(palette.paint(target)){
     stroke.painted=true;
     effect(x,y,tool,tool==='randomise'?'#f5d9ff':instrumentColour(paintInstrument(target)),panel);
     if(tool==='eyedropper'){stroke.sampled=true;return;}
    }
   }
  }
 }
 window.addEventListener('pointerdown', event => {
  if (!palette.state.activePaletteTool || overlayTarget(event.target) || !boardTarget(event.target) || event.button!==0) return;
  stop(event);
  if (stroke) return;
  const point={x:event.clientX,y:event.clientY};
  palette.beginStroke(); stroke={id:event.pointerId,start:point,last:point,moved:false,painted:false,sampled:false,empty:!resolvePaintTarget(event.target)};
  try { stroke.capture=boardTarget(event.target); stroke.capture.setPointerCapture(event.pointerId); } catch {}
  applyAt(point,point);
 },true);
 window.addEventListener('pointermove', event => {
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
 window.addEventListener('pointerup',finish,true); window.addEventListener('pointercancel',finish,true);
 window.addEventListener('lostpointercapture',event => { if (stroke?.id===event.pointerId) releaseStroke(); },true);
 // Prevent a synthetic click after painting from activating a toy's controls.
 window.addEventListener('click', event => {
  if (boardTarget(event.target) && (palette.state.activePaletteTool || performance.now()<suppressBoardClickUntil) && !overlayTarget(event.target)) stop(event);
 },true);
 window.addEventListener('wheel',event => {
  if (palette.state.activePaletteTool && boardTarget(event.target) && !overlayTarget(event.target)) stop(event);
 },{capture:true,passive:false});
 document.addEventListener('keydown',event => { if (event.key==='Escape' && !config) { releaseStroke(); palette.clear(); } });
 window.addEventListener('blur', () => { cancelHold(); releaseStroke(); });
 const reset=() => { cancelHold(); releaseStroke(); palette.clear(); closeConfig(); effects=[]; };
 document.addEventListener('simple-toy-box:choose',reset);
 window.addEventListener('scene:new',reset); window.addEventListener('scene:load',reset);
 window.addEventListener('instrument-colour:change',render);
 render();
}

if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',installPaintPalette,{once:true});
else installPaintPalette();
