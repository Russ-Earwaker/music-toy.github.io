// src/ripplesynth.js
import { resizeCanvasForDPR, getCanvasPos, noteList, clamp } from './utils.js';
import { ensureAudioContext, triggerInstrument, getLoopInfo } from './audio.js';
import { NOTE_BTN_H, EDGE_PAD, randomizeRects, clampRectWithin, drawNoteStripsAndLabel, hitRect, hitTopStrip, hitBottomStrip, findTopmostHit } from './toyhelpers.js';
import { initToyUI, DEFAULT_INSTRUMENTS } from './toyui.js';

/**
 * RippleSynth Toy
 * - Tap empty canvas: spawn expanding ripple
 * - Drag node: move
 * - Tap top/bottom strip of node: pitch up/down
 * - Add/Delete one-shot modes via header buttons (like bouncer)
 * - Optional: hold (>=600ms) for larger/slower ripple
 */
const NODE_SIZE = 44;
const LONG_PRESS_MS = 600;

export function createRippleSynth(target){
  console.log('[ripplesynth] create');
  const shell  = (typeof target === 'string') ? document.querySelector(target) : target;
  const canvas = shell.querySelector('canvas.bouncer-canvas') || shell.querySelector('canvas');
  const ctx    = canvas.getContext('2d');

  // ---------------- Header via toyui ----------------
  const ui = initToyUI(shell, {
    instrumentOptions: DEFAULT_INSTRUMENTS,
    defaultInstrument: 'alien',
    addText: 'Add Node',
    delText: 'Delete Node',
    hintAdd: 'Tap to place a node',
    hintDelete: 'Tap a node to delete'
  });
  // Hint/Toast handled by toyui

  // ---------------- Data ----------------
  let nodes = [
    { x: 100, y: 90,  w:NODE_SIZE, h:NODE_SIZE, noteIndex: noteList.indexOf('C4'), activeFlash:0 },
    { x: 220, y: 140, w:NODE_SIZE, h:NODE_SIZE, noteIndex: noteList.indexOf('E4'), activeFlash:0 },
    { x: 340, y: 80,  w:NODE_SIZE, h:NODE_SIZE, noteIndex: noteList.indexOf('G4'), activeFlash:0 },
  ];
  const noteName = (i)=> noteList[clamp(i,0,noteList.length-1)];

  // Ripples
  const ripples = [];
function triggerRippleVoice(inst, noteNameStr, when){
    const ac = ensureAudioContext();
    const t  = Math.max(ac.currentTime, when || ac.currentTime);
    const f  = noteFreq(noteNameStr);

    if (inst === 'glass'){
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      const bp = ac.createBiquadFilter();
      bp.type='bandpass'; bp.frequency.value = f*2; bp.Q.value = 8;
      osc.type='sine'; osc.frequency.value = f;
      osc.connect(bp).connect(gain).connect(ac.destination);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t+0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t+0.35);
      osc.start(t);
      osc.stop(t+0.5);
      return;
    }

    if (inst === 'pluck'){
      // simple pluck: short noise burst through bandpass, fast decay
      const noise = ac.createBufferSource();
      const buffer = ac.createBuffer(1, ac.sampleRate * 0.25, ac.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i=0;i<data.length;i++) data[i] = (Math.random()*2-1) * (1 - i/data.length); // decaying noise
      noise.buffer = buffer;

      const bp = ac.createBiquadFilter();
      bp.type='bandpass'; bp.frequency.value = f; bp.Q.value = 12;
      const gain = ac.createGain();
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.exponentialRampToValueAtTime(0.22, t+0.004);
      gain.gain.exponentialRampToValueAtTime(0.0008, t+0.18);

      noise.connect(bp).connect(gain).connect(ac.destination);
      noise.start(t);
      noise.stop(t+0.22);
      return;
    }

    if (inst === 'pad'){
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      const lp = ac.createBiquadFilter();
      lp.type='lowpass'; lp.frequency.value = f*3; lp.Q.value = 0.5;
      osc.type='triangle'; osc.frequency.value = f;
      osc.connect(lp).connect(gain).connect(ac.destination);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.18, t+0.03);
      gain.gain.linearRampToValueAtTime(0.10, t+0.25);
      gain.gain.linearRampToValueAtTime(0.0008, t+0.55);
      osc.start(t);
      osc.stop(t+0.6);
      return;
    }

    // fallback to global instruments if supported
    try { triggerInstrument(inst, noteNameStr, t); } catch(e){ /* ignore */ }
  }
 // {x,y,r,spd,thick,life}
  const repeatSpawns = []; // {x,y,big,offset}
  const pendingRespawns = []; // {atTime,x,y,big}
  const MAX_RIPPLES = 6;
  function spawnRipple(x,y,big=false, record=true){
    const spd    = big ? 3.0 : 4.5;
    const thick  = big ? 16 : 10; // detection band thickness
    const life   = big ? 1.2 : 0.9; // seconds
    const now = ensureAudioContext().currentTime;
    // cap concurrent ripples to avoid overload
    if (ripples.length >= MAX_RIPPLES) {
      ripples.shift();
    }
    ripples.push({ x, y, r: 0, spd, thick, bornAt: now, life });
    if (record){
      const { loopStartTime, barLen } = getLoopInfo();
      const offset = ((now - loopStartTime) % barLen + barLen) % barLen;
      repeatSpawns.push({ x, y, big, offset });
    }
  }

  // ---------------- Sizing ----------------
  function ensureSized(){
    if (!canvas._vw || !canvas._vh){
      resizeCanvasForDPR(canvas, ctx);
    }
  }
  const doResize = ()=> { resizeCanvasForDPR(canvas, ctx); };
  requestAnimationFrame(() => {
    doResize();
    // After first real size, randomize nodes to visible area (like bouncer)
    const vw = canvas._vw ?? canvas.width, vh = canvas._vh ?? canvas.height;
    if (vw > 0 && vh > 0){
      randomizeRects(nodes, canvas, EDGE_PAD);
    }
    console.log('[ripplesynth] sized', vw, vh);
  });
  window.addEventListener('resize', doResize);

  // ---------------- Helpers ----------------
    const hitNode = (p)=> findTopmostHit(p, nodes);

  function addNodeAt(x,y,idx = Math.floor(Math.random()*noteList.length)){
    const vw = canvas._vw ?? canvas.width, vh = canvas._vh ?? canvas.height;
    const nx = clamp(x - NODE_SIZE/2, EDGE_PAD, vw - EDGE_PAD - NODE_SIZE);
    const ny = clamp(y - NODE_SIZE/2, EDGE_PAD, vh - EDGE_PAD - NODE_SIZE);
    nodes.push({ x:nx, y:ny, w:NODE_SIZE, h:NODE_SIZE, noteIndex: clamp(idx,0,noteList.length-1), activeFlash:0 });
  }
  function deleteNode(n){ nodes = nodes.filter(x=>x!==n); }

  // ---------------- Input ----------------
  let draggingNode=null, dragOff={x:0,y:0}, moved=false;
  let aiming=false, aimStart={x:0,y:0}, aimCurrent={x:0,y:0};
  let holdTimer=null, holdFired=false;

  canvas.addEventListener('contextmenu', e=> e.preventDefault());

  canvas.addEventListener('pointerdown', (e)=>{
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    const p = getCanvasPos(canvas, e);
    const n = hitNode(p);
    moved=false; holdFired=false;

    // tools
    if (ui.tool==='add'){
      addNodeAt(p.x,p.y);
      ui.toast('Node added');
      ui.setTool('aim'); // one-shot
      return;
    }
    if (ui.tool==='delete'){
      if (n){ deleteNode(n); ui.toast('Node deleted'); }
      ui.setTool('aim'); // one-shot
      return;
    }

    // aim mode
    if (n){
            if (hitTopStrip(p, n)){ n.noteIndex = clamp(n.noteIndex+1,0,noteList.length-1); return; }
      if (hitBottomStrip(p, n)){ n.noteIndex = clamp(n.noteIndex-1,0,noteList.length-1); return; }
      draggingNode = n;
      dragOff.x = p.x - n.x; dragOff.y = p.y - n.y;
      return;
    }

    // start potential ripple
    aiming=true; aimStart={x:p.x,y:p.y}; aimCurrent={x:p.x,y:p.y};
    // hold -> bigger ripple
    holdTimer = setTimeout(()=>{ holdFired=true; }, LONG_PRESS_MS);
  });

  canvas.addEventListener('pointermove', (e)=>{
    const p = getCanvasPos(canvas, e);
    if (draggingNode){
      moved=true;
      draggingNode.x = p.x - dragOff.x; draggingNode.y = p.y - dragOff.y;
      clampRectWithin(canvas, draggingNode, EDGE_PAD);
      return;
    }
    if (aiming){ aimCurrent = {x:p.x,y:p.y}; }
  });

  function clearHold(){ if (holdTimer){ clearTimeout(holdTimer); holdTimer=null; } }

  canvas.addEventListener('pointerup', (e)=>{
    canvas.releasePointerCapture?.(e.pointerId);
    if (ui && (ui.tool === 'add' || ui.tool === 'delete')) { ui.setTool('aim'); } /*__AIM_RESET__*/
    clearHold();
    const p = getCanvasPos(canvas, e);

    if (draggingNode){ draggingNode=null; return; }
    if (!aiming) return;
    aiming=false;

    // spawn ripple
    spawnRipple(aimStart.x, aimStart.y, holdFired);
  });

  // ---------------- Audio timing helpers ----------------
  // (Optional) if we want to align things to loop boundaries later:
  function onLoop(loopStartTime){
    const { barLen } = getLoopInfo();
    // Queue respawns at exact offsets relative to this loop start
    repeatSpawns.forEach(r => {
      const atTime = loopStartTime + r.offset;
      pendingRespawns.push({ atTime, x: r.x, y: r.y, big: r.big });
    });
  }
  function reset(){
    ripples.length = 0;
  }

  // ---------------- Render Loop ----------------
  function draw(){
    ensureSized();
    const vw = canvas._vw ?? canvas.width;
    const vh = canvas._vh ?? canvas.height;
    ctx.clearRect(0,0,vw,vh);

    // release any pending respawns when their audio time is reached
    const audio = ensureAudioContext();
    for (let i = pendingRespawns.length - 1; i >= 0; --i) {
      if (audio.currentTime >= pendingRespawns[i].atTime) {
        const it = pendingRespawns.splice(i, 1)[0];
        spawnRipple(it.x, it.y, it.big, /*record*/false);
      }
    }

    // background subtle gradient
    const g = ctx.createRadialGradient(vw*0.5, vh*0.5, 10, vw*0.5, vh*0.5, Math.max(vw,vh)*0.6);
    g.addColorStop(0, '#0b0b0f');
    g.addColorStop(1, '#111');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,vw,vh);

    // ripples update & draw
    const now = ensureAudioContext().currentTime;
    for (let i = ripples.length-1; i>=0; --i){
      const r = ripples[i];
      const age = now - r.bornAt;
      r.r += r.spd; // px per frame (visually); audio is event-driven below
      // alpha fades with life
      const life01 = Math.min(1, age / r.life);
      const alpha = 1.0 - life01;

      // draw ring
      ctx.strokeStyle = `rgba(180,220,255,${alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI*2); ctx.stroke();

      // node intersections -> schedule notes
      nodes.forEach(n => {
        // distance from ripple center to node center
        const cx = n.x + n.w/2, cy = n.y + n.h/2;
        const d = Math.hypot(cx - r.x, cy - r.y);
        // trigger when ripple radius enters [d - band/2, d + band/2]
        const within = Math.abs(d - r.r) <= (r.thick*0.5);
        const cooldown = 0.12; // seconds
        const since = (n._lastHitAt != null) ? (now - n._lastHitAt) : Infinity;
        if (within && !n._ringStamp && since >= cooldown){
          // schedule now; could quantize using getLoopInfo() if needed
          triggerInstrument(ui.instrument, noteName(n.noteIndex), now);
          n.activeFlash = 1.0;
          n._ringStamp = r.r; // basic de-dup per ripple radius
          n._lastHitAt = now;
        }
        if (!within && n._ringStamp && Math.abs(d - r.r) > r.thick){
          // leave band -> allow future hits from other ripples
          n._ringStamp = null;
        }
      });

      // retire old ripple
      if (age >= r.life) ripples.splice(i,1);
    }

    // nodes draw
    nodes.forEach(n => {
      // base
      ctx.fillStyle = '#2b2f36';
      ctx.fillRect(n.x, n.y, n.w, n.h);
      // top/bottom strips
      drawNoteStripsAndLabel(ctx, n, noteName(n.noteIndex));
      // (retain hit areas below)
      
      // active flash
      if (n.activeFlash > 0){
        const a = n.activeFlash;
        ctx.strokeStyle = `rgba(255,255,255,${a})`;
        ctx.lineWidth = 3;
        ctx.strokeRect(n.x-2, n.y-2, n.w+4, n.h+4);
        n.activeFlash = Math.max(0, a - 0.06);
      }
    });

    // aiming guide
    if (aiming){
      ctx.strokeStyle = 'rgba(120,200,255,0.6)';
      ctx.beginPath();
      ctx.arc(aimStart.x, aimStart.y, Math.hypot(aimCurrent.x-aimStart.x, aimCurrent.y-aimStart.y), 0, Math.PI*2);
      ctx.stroke();
    }

    requestAnimationFrame(draw);
  }
  draw();

  return { reset, onLoop, element: canvas };
}
