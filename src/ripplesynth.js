// src/ripplesynth.js
import { resizeCanvasForDPR, getCanvasPos, noteList, clamp } from './utils.js';
import { ensureAudioContext, triggerInstrument } from './audio.js';
import { EDGE_PAD, randomizeRects, drawNoteStripsAndLabel, hitTopStrip, hitBottomStrip, findTopmostHit, drawBlock } from './toyhelpers.js';
import { initToyUI } from './toyui.js';

const NODE_SIZE = 44;
const MAX_EMITTERS = 3;
const MAX_NODES = 5;

export function createRippleSynth(target){
  const shell  = (typeof target === 'string') ? document.querySelector(target) : target;
  const canvas = shell.querySelector('canvas.bouncer-canvas') || shell.querySelector('canvas');
  const ctx    = canvas.getContext('2d');

  const ui = initToyUI(shell, {
    defaultInstrument: 'tone',
    addText: 'Add Node',
    delText: 'Delete',
    hintAdd: 'Click the canvas to add a note block',
    hintDelete: 'Click a handle or block to delete',
    showAdd: true,
    showDelete: true,
    deleteMode: 'until-empty',
    getDeletableCount: () => emitters.length + nodes.length
  });

  // --- Data ---
  let nodes = [
    { x: 100, y: 90,  w:NODE_SIZE, h:NODE_SIZE, noteIndex: noteList.indexOf('C4'), activeFlash:0 },
    { x: 260, y: 140, w:NODE_SIZE, h:NODE_SIZE, noteIndex: noteList.indexOf('E4'), activeFlash:0 },
    { x: 380, y: 80,  w:NODE_SIZE, h:NODE_SIZE, noteIndex: noteList.indexOf('G4'), activeFlash:0 },
  ];
  const noteName = (i)=> noteList[clamp(i,0,noteList.length-1)];

  let emitters = []; // {x,y}
  const ripples = []; // {x,y,r,spd,thick,life,bornAt}
  function spawnRipple(x,y){
    const now = ensureAudioContext().currentTime;
    ripples.push({ x, y, r: 0, spd: 4.8, thick: 10, life: 0.9, bornAt: now });
  }

  // --- Sizing ---
  function doResize(){ resizeCanvasForDPR(canvas, ctx); }
  requestAnimationFrame(() => {
    doResize();
    randomizeRects(nodes, canvas, EDGE_PAD);
  });
  window.addEventListener('resize', doResize);

  // --- Input ---
  let draggingNode=null, dragOff={x:0,y:0};
  let draggingEmitterIndex = -1;

  canvas.addEventListener('contextmenu', e=> e.preventDefault());

  function hitEmitter(p){
    for (let i=emitters.length-1;i>=0;--i){
      const e = emitters[i];
      const dx = p.x - e.x, dy = p.y - e.y;
      if (dx*dx + dy*dy <= 14*14) return i;
    }
    return -1;
  }

  canvas.addEventListener('pointerdown', (e)=>{
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    const pxy = getCanvasPos(canvas, e);

    // Delete mode: remove handle or node
    if (ui.tool === 'delete'){
      const di = hitEmitter(pxy);
      if (di !== -1){
        emitters.splice(di,1);
        ui.onDeleted && ui.onDeleted();
        if (nodes.length < MAX_NODES) ui.setAddEnabled && ui.setAddEnabled(true);
        return;
      }
      const dn = findTopmostHit(pxy, nodes);
      if (dn){
        nodes.splice(nodes.indexOf(dn), 1);
        ui.onDeleted && ui.onDeleted();
        if (nodes.length < MAX_NODES) ui.setAddEnabled && ui.setAddEnabled(true);
        return;
      }
      ui.onDeleted && ui.onDeleted();
      return;
    }

    // Drag an existing emitter?
    const eIdx = hitEmitter(pxy);
    if (eIdx !== -1){
      draggingEmitterIndex = eIdx;
      dragOff.x = pxy.x - emitters[eIdx].x; dragOff.y = pxy.y - emitters[eIdx].y;
      return;
    }

    // Node pitch strips or drag
    const n = findTopmostHit(pxy, nodes);
    if (n){
      if (hitTopStrip(pxy,n)){ n.noteIndex = clamp(n.noteIndex+1,0,noteList.length-1); return; }
      if (hitBottomStrip(pxy,n)){ n.noteIndex = clamp(n.noteIndex-1,0,noteList.length-1); return; }
      draggingNode = n;
      dragOff.x = pxy.x - n.x; dragOff.y = pxy.y - n.y;
      return;
    }

    // Empty canvas -> depends on tool
    if (ui.tool === 'add'){
      // Persistent add: place and stay in Add until we reach max, then exit and disable.
      if (nodes.length < MAX_NODES){
        nodes.push({ x: pxy.x - NODE_SIZE/2, y: pxy.y - NODE_SIZE/2, w:NODE_SIZE, h:NODE_SIZE, noteIndex: noteList.indexOf('C4'), activeFlash:0 });
      }
      if (nodes.length >= MAX_NODES){ ui.setAddEnabled && ui.setAddEnabled(false); ui.setTool && ui.setTool('aim'); }
      return;
    } else {
      // Aim mode: add a ripple handle (max 3)
      if (emitters.length < MAX_EMITTERS){
        emitters.push({ x: pxy.x, y: pxy.y });
      }
      return;
    }
  });

  canvas.addEventListener('pointermove', (e)=>{
    const p = getCanvasPos(canvas, e);
    if (draggingEmitterIndex !== -1){
      const em = emitters[draggingEmitterIndex];
      em.x = clamp(p.x - dragOff.x, EDGE_PAD, (canvas._vw ?? canvas.width)  - EDGE_PAD);
      em.y = clamp(p.y - dragOff.y, EDGE_PAD, (canvas._vh ?? canvas.height) - EDGE_PAD);
      return;
    }
    if (draggingNode){
      draggingNode.x = clamp(p.x - dragOff.x, EDGE_PAD, (canvas._vw ?? canvas.width)  - EDGE_PAD - draggingNode.w);
      draggingNode.y = clamp(p.y - dragOff.y, EDGE_PAD, (canvas._vh ?? canvas.height) - EDGE_PAD - draggingNode.h);
      return;
    }
  });

  canvas.addEventListener('pointerup', (e)=>{
    canvas.releasePointerCapture?.(e.pointerId);
    draggingNode = null;
    draggingEmitterIndex = -1;
  });

  // Loop: small stagger so ripples don't all fire at t=0
  function onLoop(){
    emitters.forEach((em, i) => {
      const delay = 120 + i * 120;
      setTimeout(() => spawnRipple(em.x, em.y), delay);
    });
  }
  function reset(){ ripples.length = 0; }

  // --- Render ---
  function draw(){
    const vw = canvas._vw ?? canvas.width;
    const vh = canvas._vh ?? canvas.height;
    ctx.clearRect(0,0,vw,vh);

    // background
    ctx.fillStyle = '#0f1116';
    ctx.fillRect(0,0,vw,vh);

    // ripples
    const now = ensureAudioContext().currentTime;
    for (let i = ripples.length-1; i>=0; --i){
      const r = ripples[i];
      const age = now - r.bornAt;
      r.r += r.spd;
      const life01 = Math.min(1, age / r.life);
      const alpha = 1.0 - life01;

      ctx.strokeStyle = `rgba(120,180,255,${alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI*2); ctx.stroke();

      // hits
      nodes.forEach(n => {
        const cx = n.x + n.w/2, cy = n.y + n.h/2;
        const d = Math.hypot(cx - r.x, cy - r.y);
        const within = Math.abs(d - r.r) <= (r.thick*0.5);
        const cooldown = 0.12;
        const since = (n._lastHitAt != null) ? (now - n._lastHitAt) : Infinity;
        if (within && !n._ringStamp && since >= cooldown){
          triggerInstrument(ui.instrument, noteName(n.noteIndex), now);
          n.activeFlash = 1.0;
          n._ringStamp = r.r;
          n._lastHitAt = now;
        }
        if (!within && n._ringStamp && Math.abs(d - r.r) > r.thick){
          n._ringStamp = null;
        }
      });

      if (age >= r.life) ripples.splice(i,1);
    }

    // nodes (orange) + centered labels only
    nodes.forEach(n => {
      drawBlock(ctx, n, { baseColor: '#ff8c00', active: n.activeFlash > 0 });
      drawNoteStripsAndLabel(ctx, n, ''); // remove top-left text
      // centered note
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const ns = Math.floor(Math.min(n.w, n.h) * 0.44);
      ctx.font = `${ns}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`;
      ctx.fillStyle = n.activeFlash > 0 ? '#000000' : '#ffffff';
      ctx.fillText(noteName(n.noteIndex), n.x + n.w/2, n.y + n.h/2 + 0.5);
      ctx.restore();

      if (n.activeFlash > 0){
        n.activeFlash = Math.max(0, n.activeFlash - 0.06);
      }
    });

    // emitter handles (blue)
    for (const em of emitters){
      ctx.beginPath();
      ctx.arc(em.x, em.y, 12, 0, Math.PI*2);
      ctx.fillStyle = '#42a5f5';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#0d47a1';
      ctx.stroke();
    }

    requestAnimationFrame(draw);
  }
  draw();

  return { reset, onLoop, element: canvas, setInstrument: (name)=> ui.setInstrument(name) };
}
