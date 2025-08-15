import { ensureAudioContext, triggerInstrument, NUM_STEPS, stepSeconds } from './audio.js';
import { initToyUI } from './toyui.js';
import { initToySizing, drawBlock, drawNoteStripsAndLabel, NOTE_BTN_H, hitTopStrip, hitBottomStrip, randomizeRects, EDGE_PAD as EDGE } from './toyhelpers.js';

const BASE_BLOCK_SIZE = 48;
const HIT_COOLDOWN = 0.08;
const FLASH_DUR = 0.12; // quick flash synced to audio

// --- Notes ---
function noteIndexOf(name){ const i = noteList.indexOf(name); return (i>=0? i : Math.floor(noteList.length/2)); }
const C4_INDEX = noteIndexOf('C4');
const MAJOR_PENT = new Set([0,2,4,7,9]);
function pentIndices(center=C4_INDEX, radius=7){
  const arr=[];
  for (let off=-radius; off<=radius; off++){
    const idx = center + off;
    if (idx<0 || idx>=noteList.length) continue;
    const cls = ((off % 12) + 12) % 12;
    if (MAJOR_PENT.has(cls)) arr.push(idx);
  }
  return arr.length? arr : [center];
}
const PENTA = pentIndices(C4_INDEX, 7);
function randomPent(){ return PENTA[Math.floor(Math.random()*PENTA.length)]; }

export function createRippleSynth(panel){
  // --- Debug ---
  let DEBUG = /ripplerDebug=1/.test(location.search) || localStorage.getItem('ripplerDebug') === '1';
  function dbg(){ if (!DEBUG) return; try { console.log('[Rippler]', ...arguments); } catch {} }
  function dbgGroup(label, data){ if (!DEBUG) return; try { console.groupCollapsed('[Rippler]', label); console.log(data); console.groupEnd(); } catch {} }
  window.addEventListener('keydown', (e)=>{
    if ((e.metaKey || e.ctrlKey || e.shiftKey) && e.key.toLowerCase() === 'd'){
      DEBUG = !DEBUG; localStorage.setItem('ripplerDebug', DEBUG ? '1' : '0');
      console.log('[Rippler] DEBUG', DEBUG ? 'ON' : 'OFF');
    }
  });

  // --- Canvas & UI ---
  const shell  = panel;
  const host   = shell.querySelector('.toy-body') || shell;
    c.style.display = 'block';
    c.style.touchAction = 'none';
    host.appendChild(c);
    return c;
  })();
  let suspendAudio = false;          // mute scheduling while dragging generator

  let lastLoopProcessedAt = null;    // guard against duplicate onLoop processing

  // Precomputed phase offsets for each block (in steps from ripple start)
  let blockPhases = []; // integer steps per block

  // Helpers
  function getCurrentLoopStart(now){
    if (!generator || !generator.anchorTime) return null;
    const loopDur = NUM_STEPS * stepSeconds();
    const tA = generator.anchorTime;
    if (now <= tA + 1e-4) return tA;
    const n = Math.floor((now - tA) / loopDur);
    return tA + n * loopDur;
  }

  function computeSpeed(){
    const q = stepSeconds();
    const loopDur = NUM_STEPS * q;
    if (!generator){
      // fallback: center-to-nearest-edge
      const ccx = vw()/2, ccy = vh()/2;
      const minEdgeDistCenter = Math.min(ccx - EDGE, vw()-EDGE - ccx, ccy - EDGE, vh()-EDGE - ccy);
      return loopDur > 0 ? Math.max(0, minEdgeDistCenter) / loopDur : 0;
    }
    const gx = generator.x, gy = generator.y;
    const maxCorner = Math.max(
      Math.hypot(gx - 0,    gy - 0),
      Math.hypot(gx - vw(), gy - 0),
      Math.hypot(gx - 0,    gy - vh()),
      Math.hypot(gx - vw(), gy - vh())
    );
    return loopDur > 0 ? maxCorner / loopDur : 0;
  }

  function recalcBlockPhases(){
    blockPhases = new Array(blocks.length).fill(0);
    if (!generator) return;
    const q = stepSeconds();
    const speed = computeSpeed();
    const EPS = 1e-6;
    for (let i=0;i<blocks.length;i++){
      const b = blocks[i];
      const bx = b.x + b.w/2, by = b.y + b.h/2;
      const dist = Math.hypot(bx - generator.x, by - generator.y);
      const steps = (speed > 0) ? (dist / (speed * q)) : 0;
      let k = Math.ceil(steps - EPS);
      if (k < 0) k = 0;
      if (k > (NUM_STEPS-1)) k = NUM_STEPS-1;
      blockPhases[i] = k|0;
    }
    dbgGroup('recalcBlockPhases', { blockPhases });
  }

  function quantizeNextStep(now){
    const q = stepSeconds();
    if (gridEpoch != null){
      return gridEpoch + Math.ceil((now - gridEpoch) / q) * q;
    }
    if (lastLoopStartTime){
      return lastLoopStartTime + Math.ceil((now - lastLoopStartTime) / q) * q;
    }
    return Math.ceil(now / q) * q;
  }

  function enqueueRippleAt(t){
    const now = ensureAudioContext().currentTime;
    if (lastQueuedTime >= 0 && Math.abs(t - lastQueuedTime) < 1e-4){ dbg('enqueue dup-skip', {t}); return; }
    ripples.push({ startTime: t, firedFor: new Set() });
    lastQueuedTime = t;
    dbg('enqueue', { t, in: +(t-now).toFixed(3) });
  }

  // Just-in-time scheduler for recorded blocks
  function scheduleDueHits(now){
    if (!generator || currentLoopRippleStart == null) return;
    if (suspendAudio) return;
    const t0 = currentLoopRippleStart;
    const q = stepSeconds();
    const windowStart = now - 0.01;
    const windowEnd   = now + LOOKAHEAD;
    for (const i of enrolled){
      if (scheduledThisLoop.has(i)) continue;
      const phase = (blockPhases[i] | 0);
      const tHit = t0 + phase * q;
      if (tHit > windowStart && tHit <= windowEnd){
        const b = blocks[i];
        triggerInstrument(ui.instrument, noteList[b.noteIndex % noteList.length], tHit);
        b.flashAt = tHit;
        scheduledThisLoop.add(i);
      }
    }
  }

  // --- Input state ---
  let draggingGen = false;
  let draggingBlock = null;
  const dragOff = { x:0, y:0 };

  function pointerDown(e){
      const now = ensureAudioContext().currentTime;
      const tQ  = quantizeNextStep(now);
      generator.anchorTime = tQ;
      ripples.length = 0;
      recalcBlockPhases();
      // enroll all blocks
      enrolled = new Set(blocks.map((_,i)=>i));
      rejoinNextLoop.clear();
      scheduledThisLoop.clear();
      currentLoopRippleStart = tQ;
      enqueueRippleAt(tQ);
      const loopDur = NUM_STEPS * stepSeconds();
      generator.nextTime = tQ + loopDur;
      suspendAudio = false;
      e.preventDefault(); return;
    }

    // Block interactions (only once generator exists)
    for (let i = blocks.length-1; i>=0; i--){
      const b = blocks[i];
      if (p.x>=b.x && p.x<=b.x+b.w && p.y>=b.y && p.y<=b.y+b.h){
        if (sizing.scale > 1){
          if (hitTopStrip(p, b)){ b.noteIndex = (b.noteIndex + 1) % noteList.length; e.preventDefault(); return; }
          if (hitBottomStrip(p, b)){ b.noteIndex = (b.noteIndex - 1 + noteList.length) % noteList.length; e.preventDefault(); return; }
        }
        draggingBlock = b;
        dragOff.x = p.x - b.x; dragOff.y = p.y - b.y;
        // remove from recording while dragging
        const bi = i;
        enrolled.delete(bi);
        e.preventDefault(); return;
      }
    }

    // Handle drag on generator?
    const r = 12;
    if (p.x>=generator.x-r && p.x<=generator.x+r && p.y>=generator.y-r && p.y<=generator.y+r){
      draggingGen = true;
      dragOff.x = p.x - generator.x; dragOff.y = p.y - generator.y;
      // Mute and clear while dragging
      suspendAudio = true;
      ripples.length = 0;
      scheduledThisLoop.clear();
      currentLoopRippleStart = null;
      e.preventDefault(); return;
    }

    // Empty space: snap + quantized first hit
    generator.x = clamp(p.x, EDGE, vw()-EDGE);
    generator.y = clamp(p.y, EDGE, vh()-EDGE);
    const now = ensureAudioContext().currentTime;
    const tQ  = quantizeNextStep(now);
    generator.anchorTime = tQ;
    ripples.length = 0;
    recalcBlockPhases();
    enrolled = new Set(blocks.map((_,i)=>i));
    rejoinNextLoop.clear();
    scheduledThisLoop.clear();
    currentLoopRippleStart = tQ;
    enqueueRippleAt(tQ);
    const loopDur = NUM_STEPS * stepSeconds();
    generator.nextTime = tQ + loopDur;
      suspendAudio = false;
    e.preventDefault();
  }

  function pointerMove(e){
      const now = ensureAudioContext().currentTime;
      const tQ  = quantizeNextStep(now);
      generator.anchorTime = tQ;
      recalcBlockPhases();
      enrolled = new Set(blocks.map((_,i)=>i));
      rejoinNextLoop.clear();
      scheduledThisLoop.clear();
      currentLoopRippleStart = tQ;
      enqueueRippleAt(tQ);
      const loopDur = NUM_STEPS * stepSeconds();
      generator.nextTime = tQ + loopDur;
      suspendAudio = false;
    }
    if (draggingBlock){
      // compute new phase and rejoin in the next loop
      recalcBlockPhases();
      const idx = blocks.indexOf(draggingBlock);
      if (idx >= 0) { rejoinNextLoop.add(idx); }
    }
    draggingBlock = null; draggingGen = false;
  }

    const now = ensureAudioContext().currentTime;
    const prev = lastDrawTime || now;

    const cx = generator ? generator.x : vw()/2;
    const cy = generator ? generator.y : vh()/2;

    // Constant ripple speed: from generator to farthest corner over exactly one loop
    const q = stepSeconds();
    const loopDur = NUM_STEPS * q;
    const speed = computeSpeed();

    // Draw ripples and cull
            if (!suspendAudio && (draggingBlock === b || !enrolled.has(bi))){
              const ls = (gridEpoch != null ? gridEpoch : (lastLoopStartTime || now));
              const stepsLive = Math.floor((now - ls + 1e-4) / q) + 1;
              const tQlive = ls + stepsLive * q;
              triggerInstrument(ui.instrument, noteList[b.noteIndex % noteList.length], tQlive);
              b.flashAt = tQlive;
            }
          }
        }
      }
    }

    // Draw blocks
    for (const b of blocks){
      // flash precisely when its audio plays
      if (b.flashAt != null) {
        const f = (now - b.flashAt);
        if (f >= 0 && f <= FLASH_DUR) {
          b.activeFlash = 1.0 - (f / FLASH_DUR);
        } else if (f > FLASH_DUR && b.activeFlash > 0) {
          b.activeFlash = 0;
        }
      }
      drawBlock(ctx, b, { baseColor: '#ff8c00', active: b.activeFlash > 0 });
      if (sizing.scale > 1){ drawNoteStripsAndLabel(ctx, b, noteList[b.noteIndex % noteList.length]); }
      if (b.activeFlash > 0){
    // Leave ripples/currentLoopRippleStart/lastQueuedTime as-is so playback continues
  });

  panel.addEventListener('toy-reset', ()=>{
    ripples.length = 0;
    generator = null;
    blockPhases = [];
    enrolled.clear(); rejoinNextLoop.clear(); scheduledThisLoop.clear();
    currentLoopRippleStart = null; lastQueuedTime = -1;
    // Keep existing notes; just clear visual flashes
    for (const b of blocks){ b.activeFlash = 0; b.flashAt = null; }
  });

  // --- Loop hook ---
  function scheduleLoopRipple(loopStartTime){
    lastLoopStartTime = loopStartTime;
    if (gridEpoch == null) gridEpoch = loopStartTime;
    // No scheduling here; draw() derives loop timing from anchor every frame.
  }
  function onLoop(loopStartTime){ scheduleLoopRipple(loopStartTime); }

  // --- API ---
  function reset(){
    ripples.length = 0;
    generator = null;
    blockPhases = [];
    enrolled.clear(); rejoinNextLoop.clear(); scheduledThisLoop.clear();
    currentLoopRippleStart = null; lastQueuedTime = -1;
    for (const b of blocks){ b.activeFlash = 0; b.flashAt = null; }
  }
  function setInstrument(_name){ /* via UI */ }
  function destroy(){