// src/ripplesynth.js
import { resizeCanvasForDPR, getCanvasPos, noteList, clamp } from './utils.js';
import { ensureAudioContext, triggerInstrument, getLoopInfo } from './audio.js';
import { NOTE_BTN_H, EDGE_PAD, randomizeRects, clampRectWithin, drawNoteStripsAndLabel, drawBlock, hitTopStrip, hitBottomStrip, findTopmostHit } from './toyhelpers.js';
import { initToyUI, DEFAULT_INSTRUMENTS } from './toyui.js';

const NODE_SIZE = 44;
const MAX_RIPPLES = 6;

// -------------------------------------------------------------
// Public factory
// -------------------------------------------------------------
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
  setTimeout(()=>{ try{ ui?.toast && ui.toast('Tap to add up to 3 blue sources; drag to move'); }catch(e){} }, 400);

  // ---------------- Data ----------------
  let nodes = [
    { x: 100, y:  90, w: NODE_SIZE, h: NODE_SIZE, noteIndex: noteList.indexOf('C4'), activeFlash: 0 },
    { x: 220, y: 140, w: NODE_SIZE, h: NODE_SIZE, noteIndex: noteList.indexOf('E4'), activeFlash: 0 },
    { x: 340, y:  80, w: NODE_SIZE, h: NODE_SIZE, noteIndex: noteList.indexOf('G4'), activeFlash: 0 },
  ];
  const noteName = (i)=> noteList[clamp(i,0,noteList.length-1)];

  // Ripple Sources (draggable emitters)
  const MAX_SOURCES = 3;
  const SRC_SIZE = 18;
  let sources = [];            // {x,y,w,h,offset}
  const pendingRespawns = [];  // { atTime, x, y }

  // Ripples (visual + hit detection)
  const ripples = []; // {x,y,r,spd,thick,bornAt,life}

  // ---------------- Size ----------------
  function ensureSized(){ if (!canvas._vw || !canvas._vh) resizeCanvasForDPR(canvas, ctx); }
  const doResize = ()=> resizeCanvasForDPR(canvas, ctx);
  requestAnimationFrame(()=>{
    doResize();
    if (nodes.length) randomizeRects(nodes, canvas, EDGE_PAD);
    const vw = canvas._vw ?? canvas.width, vh = canvas._vh ?? canvas.height;
    console.log('[ripplesynth] sized', vw, vh);
  });
  window.addEventListener('resize', doResize);

  // ---------------- Helpers ----------------
  function dist(ax, ay, bx, by){ const dx=ax-bx, dy=ay-by; return Math.hypot(dx,dy); }
  function pickHoverSource(p){
    let best=null, bestD=Infinity;
    for (const s of sources){
      const cx=s.x+s.w/2, cy=s.y+s.h/2;
      const r=s.w/2+6;
      const d=dist(p.x,p.y,cx,cy);
      if (d<=r && d<bestD){ best=s; bestD=d; }
    }
    return best;
  }
  const hitNode    = (p)=> findTopmostHit(p, nodes);
  const hitSource  = (p)=> findTopmostHit(p, sources);

  function addSourceAt(x, y){
    if (sources.length >= MAX_SOURCES) return null;
    const s = { x: x - SRC_SIZE/2, y: y - SRC_SIZE/2, w: SRC_SIZE, h: SRC_SIZE, offset: 0 };
    clampRectWithin(canvas, s, EDGE_PAD);
    const { loopStartTime, barLen } = getLoopInfo();
    const now = ensureAudioContext().currentTime;
    s.offset = ((now - loopStartTime) % barLen + barLen) % barLen;
    sources.push(s);
    // immediate feedback ripple
    spawnRipple(x, y, false, false);
    return s;
  }

  function addNodeAt(x,y,idx = Math.floor(Math.random()*noteList.length)){
    const vw = canvas._vw ?? canvas.width, vh = canvas._vh ?? canvas.height;
    const nx = clamp(x - NODE_SIZE/2, EDGE_PAD, vw - EDGE_PAD - NODE_SIZE);
    const ny = clamp(y - NODE_SIZE/2, EDGE_PAD, vh - EDGE_PAD - NODE_SIZE);
    nodes.push({ x:nx, y:ny, w:NODE_SIZE, h:NODE_SIZE, noteIndex: clamp(idx,0,noteList.length-1), activeFlash:0 });
  }
  function deleteNode(n){ nodes = nodes.filter(x=>x!==n); }

  function spawnRipple(x, y, _bigIgnored = false, record = true){
    const now   = ensureAudioContext().currentTime;
    const spd   = 2.4;
    const thick = 6;
    const life  = 1.0;
    if (ripples.length >= MAX_RIPPLES) ripples.shift();
    ripples.push({ x, y, r: 0, spd, thick, bornAt: now, life });
    // looping is driven by sources; 'record' not used
  }

  // ---------------- Input ----------------
  let draggingNode=null, dragOff={x:0,y:0}, moved=false;
  let draggingSource=null;
  let hoverSource=null;

  canvas.addEventListener('contextmenu', e=> e.preventDefault());

  canvas.addEventListener('pointerdown', (e)=>{
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    const p = getCanvasPos(canvas, e);
    moved=false;

    const s = hitSource(p);
    if (s){
      draggingSource = s;
      dragOff.x = p.x - s.x; dragOff.y = p.y - s.y;
      canvas.style.cursor = 'grabbing';
      return;
    }

    const n = hitNode(p);

    // tools
    if (ui.tool==='add'){
      if (n){ addNodeAt(p.x,p.y); ui.toast('Node added'); }
      else if (sources.length < MAX_SOURCES){ addSourceAt(p.x,p.y); ui.toast(`Source ${sources.length}/${MAX_SOURCES}`); }
      ui.setTool('aim'); // one-shot
      return;
    }
    if (ui.tool==='delete'){
      if (n){ deleteNode(n); ui.toast('Node deleted'); }
      else if (s){ sources = sources.filter(x=>x!==s); ui.toast('Source deleted'); }
      ui.setTool('aim');
      return;
    }

    // normal mode: node pitch or drag
    if (n){
      if (hitTopStrip(p, n)){ n.noteIndex = clamp(n.noteIndex+1,0,noteList.length-1); return; }
      if (hitBottomStrip(p, n)){ n.noteIndex = clamp(n.noteIndex-1,0,noteList.length-1); return; }
      draggingNode = n;
      dragOff.x = p.x - n.x; dragOff.y = p.y - n.y;
      return;
    }

    // empty → add a source if possible
    if (sources.length < MAX_SOURCES){
      addSourceAt(p.x, p.y);
      ui.toast(`Source ${sources.length}/${MAX_SOURCES}`);
    }
  });

  canvas.addEventListener('pointermove', (e)=>{
    const p = getCanvasPos(canvas, e);
    if (draggingSource){
      moved=true;
      draggingSource.x = p.x - dragOff.x; draggingSource.y = p.y - dragOff.y;
      clampRectWithin(canvas, draggingSource, EDGE_PAD);
      canvas.style.cursor = 'grabbing';
      return;
    }
    if (draggingNode){
      moved=true;
      draggingNode.x = p.x - dragOff.x; draggingNode.y = p.y - dragOff.y;
      clampRectWithin(canvas, draggingNode, EDGE_PAD);
      canvas.style.cursor = 'grabbing';
    } else {
      hoverSource = pickHoverSource(getCanvasPos(canvas, e));
      canvas.style.cursor = hoverSource ? 'grab' : 'default';
    }
  });

  canvas.addEventListener('pointerup', (e)=>{
    canvas.releasePointerCapture?.(e.pointerId);
    if (ui && (ui.tool === 'add' || ui.tool === 'delete')) { ui.setTool('aim'); } /*__AIM_RESET__*/
    if (draggingSource){ draggingSource=null; canvas.style.cursor = hoverSource ? 'grab' : 'default'; return; }
    if (draggingNode){ draggingNode=null; canvas.style.cursor = 'default'; return; }
  });

  // ---------------- Loop callbacks ----------------
  function onLoop(loopStartTime){
    const { barLen } = getLoopInfo();
    sources.forEach(s => {
      const atTime = loopStartTime + s.offset;
      pendingRespawns.push({ atTime, x: s.x + s.w/2, y: s.y + s.h/2 });
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

    

    // background subtle gradient
    const g = ctx.createRadialGradient(vw*0.5, vh*0.5, 10, vw*0.5, vh*0.5, Math.max(vw,vh)*0.6);
    g.addColorStop(0, '#0b0b0f');
    g.addColorStop(1, '#111');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,vw,vh);


    // release scheduled source spawns
    const audio = ensureAudioContext();
    for (let i = pendingRespawns.length - 1; i >= 0; --i) {
      if (audio.currentTime >= pendingRespawns[i].atTime) {
        const it = pendingRespawns.splice(i, 1)[0];
        spawnRipple(it.x, it.y, false, false);
      }
    }

    // draw sources (with grip + hover/drag affordances)
    sources.forEach(s=>{
      const cx = s.x + s.w/2, cy = s.y + s.h/2, r = s.w/2;
      const isHover = (hoverSource === s);
      const isDrag  = (draggingSource === s);

      // base orb
      ctx.fillStyle = '#3aa3ff';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();

      // glow ring
      const glowA = isDrag ? 0.9 : isHover ? 0.6 : 0.35;
      ctx.strokeStyle = `rgba(255,255,255,${glowA})`; ctx.lineWidth = isDrag ? 3 : 2;
      ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, Math.PI*2); ctx.stroke();

      // grip: three short lines centered
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
      const gw = Math.max(6, r * 0.7), gap = 3; const x0 = cx - gw/2, x1 = cx + gw/2;
      ctx.beginPath();
      ctx.moveTo(x0, cy - gap); ctx.lineTo(x1, cy - gap);
      ctx.moveTo(x0, cy);       ctx.lineTo(x1, cy);
      ctx.moveTo(x0, cy + gap); ctx.lineTo(x1, cy + gap);
      ctx.stroke();
    });
    // ripples update & draw
    const now = ensureAudioContext().currentTime;
    for (let i = ripples.length-1; i>=0; --i){
      const r = ripples[i];
      const age = now - r.bornAt;
      r.r += r.spd; // px per frame
      // alpha fades with life
      const life01 = Math.min(1, age / r.life);
      const alpha = 1.0 - life01;

      // draw ring
      ctx.strokeStyle = `rgba(180,220,255,${alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI*2); ctx.stroke();

      // node intersections -> schedule notes
      nodes.forEach(n => {
        const cx = n.x + n.w/2, cy = n.y + n.h/2;
        const d = Math.hypot(cx - r.x, cy - r.y);
        const within = Math.abs(d - r.r) <= (r.thick*0.5);
        const cooldown = 0.12; // seconds
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

      // retire old ripple
      if (age >= r.life) ripples.splice(i,1);
    }

    // nodes draw
    nodes.forEach(n => {
      drawBlock(ctx, n, { baseColor: '#ff8c00', active: n.activeFlash > 0 });
      drawNoteStripsAndLabel(ctx, n, noteName(n.noteIndex));
      if (n.activeFlash > 0){
        n.activeFlash = Math.max(0, n.activeFlash - 0.06);
      }
    });

    requestAnimationFrame(draw);
  }
  draw();

  return { reset, onLoop, element: canvas };
}
