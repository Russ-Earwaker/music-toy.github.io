// src/chordwheel.js — chord wheel with 4‑state tap cycle (Up ↔ Neutral ↔ Down ↔ Gap)
import { initToyUI } from './toyui.js';
import { NUM_STEPS, getLoopInfo } from './audio-core.js';
import { triggerNoteForToy } from './audio-trigger.js'; // static import (perf-safe)

// --- Roman numeral helper (major key) ---
function roman(deg) {
  const up  = {1:'I', 4:'IV', 5:'V'};
  const low = {2:'ii', 3:'iii', 6:'vi', 7:'vii'};
  return up[deg] || low[deg] || 'I';
}

const COLORS = ['#60a5fa','#34d399','#fbbf24','#a78bfa','#f87171','#22d3ee','#eab308','#fb7185'];

export function createChordWheel(panel){
  initToyUI(panel, { toyName: 'Chord Wheel', defaultInstrument: 'AcousticGuitar' });
  panel.dataset.toyid = panel.id || 'chordwheel-1';
  panel.dataset.instrument = panel.dataset.instrument || 'acoustic_guitar';
  try{ panel.dispatchEvent(new CustomEvent('toy-instrument', { detail:{ value: panel.dataset.instrument }, bubbles:true })); }catch{}
  try{ panel.dispatchEvent(new CustomEvent('toy:instrument', { detail:{ name: panel.dataset.instrument, value: panel.dataset.instrument }, bubbles:true })); }catch{}

  // Build container
  const body = panel.querySelector('.toy-body');
  body.innerHTML = '';
  const wrap = el('div', 'cw-wrap');
  const flex = el('div', 'cw-flex');
  wrap.appendChild(flex);
  body.appendChild(wrap);

  // --- SVG Wheel (8 slices) ---
  const wheel = buildWheelSVG(180);
  flex.appendChild(wheel.svg);

  // --- Timeline (under wheel) ---
  const tl = buildTimeline();
  flex.appendChild(tl.root);
  tl.setBarColors(COLORS);

  // ----- Harmony helpers -----
  const MAJOR_SCALE = [0,2,4,5,7,9,11]; // semitones from tonic
  function degreeToTriadMidi(deg, tonic=60){ // tonic C4 default
    const idx = (deg-1) % 7;
    const root = tonic + MAJOR_SCALE[idx];
    const third = tonic + MAJOR_SCALE[(idx+2)%7];
    const fifth = tonic + MAJOR_SCALE[(idx+4)%7];
    return [root-12, third-12, fifth-12]; // drop an octave for warmth
  }
  function maybeAddSeventh(triad){
    if (Math.random() < 0.25){ // optional color
      const rootMidi = triad[0]+12;
      const pc = ((rootMidi - 60) % 12 + 12) % 12;
      let idx = 0; for (let i=0;i<7;i++){ if (MAJOR_SCALE[i]===pc) { idx=i; break; } }
      const seventh = 60 + MAJOR_SCALE[(idx+6)%7] - 12;
      return [...triad, seventh];
    }
    return triad;
  }
  function buildChord(deg){ return maybeAddSeventh(degreeToTriadMidi(deg)); }

  function randomProgression8(){
    const presets = [
      [1,5,6,4], [1,6,4,5], [6,4,1,5],
      [2,5,1,6], [1,4,5,4], [1,5,4,5],
    ];
    const base = presets[Math.floor(Math.random()*presets.length)];
    const seq = base.concat(base);
    if (Math.random()<0.35) seq[7] = 5;
    if (Math.random()<0.25) seq[3] = 2;
    return seq;
  }

  // Pattern states per segment (8 × 16):
  // -1 = gap (mute), 0 = neutral (block chord), 1 = down strum, 2 = up strum
  const patterns = Array.from({length:8}, ()=> Array(16).fill(-1)); // start silent until Random/taps

  // State
  let activeSeg = 0;
  let progression = [1,5,6,4,1,5,6,4];

  // Initial labels & render
  wheel.setLabels(progression);
  tl.renderSlots(patterns[activeSeg]);

  // Interactions
  tl.onToggle = (ix)=> {
    const cur = patterns[activeSeg][ix] ?? -1;
    // Cycle order: Up(2) → Neutral(0) → Down(1) → Gap(-1) → Up...
    const order = [2,0,1,-1];
    const next = order[(order.indexOf(cur)+1) % order.length];
    patterns[activeSeg][ix] = next;
    tl.renderSlots(patterns[activeSeg]);
  };
  wheel.onPick = (seg)=> { activeSeg = seg; tl.renderSlots(patterns[seg]); };

  // Randomize only active segment
  tl.onRand = ()=> {
    const p = [];
    for (let i=0;i<16;i++){
      const r = Math.random();
      p[i] = (r < 0.25) ? -1 : (r < 0.5) ? 0 : (r < 0.75 ? 1 : 2);
    }
    patterns[activeSeg] = p;
    tl.renderSlots(patterns[activeSeg]);
  };
  tl.onClear = ()=> { patterns[activeSeg] = Array(16).fill(-1); tl.renderSlots(patterns[activeSeg]); };

  // Header-wide random/clear
  panel.addEventListener('toy-random', ()=>{
    progression = randomProgression8();
    wheel.setLabels(progression);
    for (let seg=0; seg<8; seg++){
      const p = [];
      for (let i=0;i<16;i++){
        const r = Math.random();
        p[i] = (r < 0.25) ? -1 : (r < 0.5) ? 0 : (r < 0.75 ? 1 : 2);
      }
      patterns[seg] = p;
    }
    tl.renderSlots(patterns[activeSeg]);
  });
  panel.addEventListener('toy-clear', ()=>{
    for (let seg=0; seg<8; seg++) patterns[seg] = Array(16).fill(-1);
    tl.renderSlots(patterns[activeSeg]);
  });

  // Sequencer (perf-safe: highlight only when ix changes)
  let lastIx = -1;
  panel.dataset.steps = String(NUM_STEPS);
  panel.__sequencerStep = function step(){
    const info = getLoopInfo();
    const total16 = 16*8;
    const pos = Math.floor(info.phase01 * total16) % total16;
    const seg = Math.floor(pos/16);
    const ix  = pos % 16;

    wheel.setHand(seg, info.phase01);
    activeSeg = seg;

    if (ix !== lastIx){ tl.highlight(ix); lastIx = ix; }

    const st = (patterns[seg] && patterns[seg][ix]);
    if (st !== -1){
      const chord = buildChord(progression[seg]||1);
      if (st === 0){
        // Neutral block: near-simultaneous
        chord.forEach((m,i)=> triggerNoteForToy(panel.dataset.toyid || panel.id || 'chordwheel-1', m, 0.95 - i*0.06));
      } else {
        // Up/Down short roll for strum feel
        const order = (st===2) ? [...chord].reverse() : chord;
        order.forEach((m,i)=> setTimeout(()=> triggerNoteForToy(panel.dataset.toyid || panel.id || 'chordwheel-1', m, 0.9 - i*0.08), i*14));
      }
    }
  };
}

// ---------- UI builders ----------
function buildWheelSVG(radius){
  const size = radius*2+20;
  const svg = svgEl('svg', { viewBox:`0 0 ${size} ${size}`, class:'cw-wheel' });
  const cx = size/2, cy = size/2, r = radius;

  svg.appendChild(svgEl('circle', { cx, cy, r:r+6, fill:'#0b111c', stroke:'#1f2a3d'}));

  for (let i=0;i<8;i++){
    const a0 = (i/8) * Math.PI*2 - Math.PI/2;
    const a1 = ((i+1)/8) * Math.PI*2 - Math.PI/2;
    const path = describeSlice(cx,cy, r-2, a0, a1);
    const p = svgEl('path', { d:path, fill: COLORS[i], opacity:.75, stroke:'#1e293b' });
    p.addEventListener('click', ()=> onPick(i));
    svg.appendChild(p);
  }

  const labelGroup = svgEl('g', { class:'cw-labels' });
  svg.appendChild(labelGroup);

  const hand = svgEl('line', { x1:cx, y1:cy, x2:cx, y2:cy-r, stroke:'#e2e8f0', 'stroke-width':4, 'stroke-linecap':'round'});
  svg.appendChild(hand);

  function setHand(seg /*0-7*/, phase01){
    const local = (phase01*8) - Math.floor(phase01*8);
    const angle = ((seg + local)/8) * Math.PI*2 - Math.PI/2;
    const x = cx + (r-6)*Math.cos(angle), y = cy + (r-6)*Math.sin(angle);
    hand.setAttribute('x2', x); hand.setAttribute('y2', y);
  }
  function setLabels(arr){
    while (labelGroup.firstChild) labelGroup.removeChild(labelGroup.firstChild);
    for (let i=0;i<8;i++){
      const aMid = ((i+0.5)/8) * Math.PI*2 - Math.PI/2;
      const tx = cx + (r*0.6)*Math.cos(aMid);
      const ty = cy + (r*0.6)*Math.sin(aMid) + 8;
      const t = svgEl('text', { x: tx, y: ty, 'text-anchor':'middle', 'font-size': '20', 'font-weight': '700', fill: '#e2e8f0' });
      t.textContent = roman(arr[i]||1);
      labelGroup.appendChild(t);
    }
  }
  setLabels([1,5,6,4,1,5,6,4]);

  let onPick = ()=>{};
  return { svg, setHand, setLabels, onPick: (fn)=> (onPick=fn) };
}

function describeSlice(cx, cy, r, a0, a1){
  const x0 = cx + r*Math.cos(a0), y0 = cy + r*Math.sin(a0);
  const x1 = cx + r*Math.cos(a1), y1 = cy + r*Math.sin(a1);
  const large = (a1-a0) > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
}

function buildTimeline(){
  const root = el('div','cw-timeline');
  const heads = el('div','cw-bar-heads');
  root.appendChild(heads);

  const slotGrid = el('div','cw-grid');
  root.appendChild(slotGrid);

  const footer = el('div','cw-footer');
  const btnRand = el('button','cw-btn'); btnRand.textContent = 'Randomize';
  const btnClear= el('button','cw-btn'); btnClear.textContent = 'Clear';
  footer.append(btnRand, btnClear);
  root.appendChild(footer);

  // build 8 heads
  for (let i=0;i<8;i++){
    const h = el('div','cw-head'); heads.appendChild(h);
  }

  // 16 slots
  const slots = [];
  for (let i=0;i<16;i++){
    const s = el('div','cw-slot');
    s.innerHTML = iconForState(-1); // start silent (gap)
    s.addEventListener('click', ()=> onToggle(i));
    slots.push(s); slotGrid.appendChild(s);
  }

  // callbacks
  let onToggle = ()=>{}; let onRand=()=>{}; let onClear=()=>{};
  btnRand.addEventListener('click', ()=>onRand());
  btnClear.addEventListener('click', ()=>onClear());

  function setBarColors(cols){
    const hs = heads.querySelectorAll('.cw-head');
    hs.forEach((h,i)=> h.style.background = cols[i] || '#94a3b8');
  }
  function renderSlots(states){
    slots.forEach((s,i)=> {
      const st = states[i] ?? -1;
      s.classList.toggle('active', st!==-1);
      s.dataset.state = String(st);
      s.innerHTML = iconForState(st);
    });
  }
  function highlight(ix){
    slots.forEach((s,i)=> s.style.outline = (i===ix)?'2px solid rgba(255,255,255,.15)':'none');
  }

  return { root, setBarColors, renderSlots, highlight,
           onToggle: fn=>onToggle=fn, onRand: fn=>onRand=fn, onClear: fn=>onClear=fn };
}

function iconForState(st){
  if (st===2)   return `<svg class="cw-arrow" viewBox="0 0 100 100" style="transform:rotate(180deg); pointer-events:none"><path d="M50 12 L50 68 L34 52 L28 58 L50 82 L72 58 L66 52 L50 68 Z"/></svg>`;
  if (st===1)   return `<svg class="cw-arrow" viewBox="0 0 100 100" style="pointer-events:none"><path d="M50 12 L50 68 L34 52 L28 58 L50 82 L72 58 L66 52 L50 68 Z"/></svg>`;
  if (st===0)   return `<div class="cw-neutral"></div>`;
  /* st === -1 */return `<div class="cw-gap"></div>`;
}

// small helpers
function el(tag, cls){ const n = document.createElement(tag); if (cls) n.className = cls; return n; }
function svgEl(tag, attrs={}){ const n = document.createElementNS('http://www.w3.org/2000/svg', tag); Object.entries(attrs).forEach(([k,v])=> n.setAttribute(k,v)); return n; }
