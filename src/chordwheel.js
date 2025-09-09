// src/chordwheel.js — stable build (no dynamic imports), no tabs, simple highlighting
import { initToyUI } from './toyui.js';
import { NUM_STEPS, getLoopInfo } from './audio-core.js';
import { triggerNoteForToy } from './audio-trigger.js'; // static import to avoid per-tick dynamic import

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

  // Wheel (top)
  const wheel = buildWheelSVG(180);
  flex.appendChild(wheel.svg);

  // Timeline (under wheel)
  const tl = buildTimeline();
  flex.appendChild(tl.root);

  // Colors
  tl.setBarColors(COLORS);

  // Harmony helpers
  const MAJOR_SCALE = [0,2,4,5,7,9,11];
  function degreeToTriadMidi(deg, tonic=60){
    const idx = (deg-1) % 7;
    const root = tonic + MAJOR_SCALE[idx];
    const third = tonic + MAJOR_SCALE[(idx+2)%7];
    const fifth = tonic + MAJOR_SCALE[(idx+4)%7];
    return [root-12, third-12, fifth-12];
  }
  function maybeAddSeventh(triad){
    if (Math.random() < 0.25){
      const rootMidi = triad[0]+12;
      const pc = ((rootMidi-60)%12+12)%12;
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

  // Patterns: 0=mute, 1=down, 2=up
  const patterns = Array.from({length:8}, ()=> Array(16).fill(0));

  // State
  let activeSeg = 0;
  let progression = [1,5,6,4,1,5,6,4];
  wheel.setLabels(progression);
  tl.renderSlots(patterns[activeSeg]);

  // Interactions
  tl.onToggle = (ix)=> { const cur = patterns[activeSeg][ix]||0; patterns[activeSeg][ix] = (cur+1)%3; tl.renderSlots(patterns[activeSeg]); };
  wheel.onPick = (seg)=> { activeSeg = seg; tl.renderSlots(patterns[seg]); };

  // Randomize active segment
  tl.onRand = ()=> {
    const strokeProb = 0.5 + Math.random()*0.3;
    patterns[activeSeg] = Array.from({length:16}, ()=> (Math.random()>strokeProb) ? 0 : (Math.random()<0.5?1:2));
    tl.renderSlots(patterns[activeSeg]);
  };
  tl.onClear = ()=> { patterns[activeSeg] = Array(16).fill(0); tl.renderSlots(patterns[activeSeg]); };

  // Header-wide random/clear
  panel.addEventListener('toy-random', ()=>{
    progression = randomProgression8();
    wheel.setLabels(progression);
    const strokeProb = 0.45 + Math.random()*0.35;
    for (let seg=0; seg<8; seg++){
      patterns[seg] = Array.from({length:16}, ()=> (Math.random()>strokeProb) ? 0 : (Math.random()<0.5?1:2));
    }
    tl.renderSlots(patterns[activeSeg]);
  });
  panel.addEventListener('toy-clear', ()=>{
    for (let seg=0; seg<8; seg++) patterns[seg] = Array(16).fill(0);
    tl.renderSlots(patterns[activeSeg]);
  });

  // Sequencer (perf-safe: only update highlight when ix changes)
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

    const st = (patterns[seg] && patterns[seg][ix]) || 0;
    if (st){
      const chord = buildChord(progression[seg]||1);
      const order = (st===2) ? [...chord].reverse() : chord;
      const toyId = panel.dataset.toyid || panel.id || 'chordwheel-1';
      // Very short roll for strum feel; tiny amount of timeouts
      order.forEach((m,i)=> setTimeout(()=> triggerNoteForToy(toyId, m, 0.9 - i*0.08), i*14));
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
    s.innerHTML = ARROW_SVG(i%2===0 ? 'down':'up');
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
      const st = states[i]||0;
      s.classList.toggle('active', st!==0);
      const svg = s.querySelector('svg');
      if (svg) svg.style.transform = (st===2 ? 'rotate(180deg)' : '');
      s.dataset.state = String(st);
    });
  }
  function highlight(ix){
    const prev = heads.querySelector('.cw-head.active');
    if (prev) prev.classList.remove('active');
    // outline current slot only (less DOM churn)
    slots.forEach((s,i)=> s.style.outline = (i===ix)?'2px solid rgba(255,255,255,.15)':'none');
  }

  return { root, setBarColors, renderSlots, highlight,
           onToggle: fn=>onToggle=fn, onRand: fn=>onRand=fn, onClear: fn=>onClear=fn };
}

function ARROW_SVG(kind){
  const rotate = kind==='down' ? '' : 'transform:rotate(180deg)';
  return `<svg class="cw-arrow" viewBox="0 0 100 100" style="${rotate}; pointer-events:none">
    <path d="M50 12 L50 68 L34 52 L28 58 L50 82 L72 58 L66 52 L50 68 Z"/>
  </svg>`;
}

// small helpers
function el(tag, cls){ const n = document.createElement(tag); if (cls) n.className = cls; return n; }
function svgEl(tag, attrs={}){ const n = document.createElementNS('http://www.w3.org/2000/svg', tag); Object.entries(attrs).forEach(([k,v])=> n.setAttribute(k,v)); return n; }
