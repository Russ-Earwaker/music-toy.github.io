// src/chordwheel.js — 8-segment chord wheel + per-segment 16th-note strum grid (UI + sequencing stub)
import { initToyUI } from './toyui.js';
import { NUM_STEPS, getLoopInfo } from './audio-core.js';

// --- Roman numeral helper (major key) ---
function roman(deg) {
  const up  = {1:'I', 4:'IV', 5:'V'};
  const low = {2:'ii', 3:'iii', 6:'vi', 7:'vii'};
  return up[deg] || low[deg] || 'I';
}

const COLORS = [
  '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#f87171', '#22d3ee', '#eab308', '#fb7185'
];

export function createChordWheel(panel){
  initToyUI(panel, { toyName: 'Chord Wheel', defaultInstrument: 'AcousticGuitar' });
  // Robust instrument setup
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

  // --- Timeline for active slice ---
  const tl = buildTimeline();
  flex.appendChild(tl.root);

  // Mirror colors into header strip
  tl.setBarColors(COLORS);

  
  // ----- Harmony helpers -----
  const MAJOR_SCALE = [0,2,4,5,7,9,11]; // semitones from tonic
  function roman(deg){
    // In major key: I ii iii IV V vi vii° (° omitted visually here)
    const up = {1:'I',4:'IV',5:'V'}[deg];
    if (up) return up;
    return {2:'ii',3:'iii',6:'vi',7:'vii'}[deg] || 'I';
  }
  function degreeToTriadMidi(deg, tonic=60){ // tonic C4 default
    const idx = (deg-1) % 7;
    const root = tonic + MAJOR_SCALE[idx];
    const third = tonic + MAJOR_SCALE[(idx+2)%7];
    const fifth = tonic + MAJOR_SCALE[(idx+4)%7];
    // Drop voicing an octave for warmth
    return [root-12, third-12, fifth-12];
  }
  function maybeAddSeventh(triad){
    if (Math.random() < 0.25){ // 25% chance
      // add diatonic 7th above root (drop octave to keep compact)
      const rootMidi = triad[0]+12;
      const degIdx = MAJOR_SCALE.indexOf((rootMidi-60)%12);
      const seventh = 60 + MAJOR_SCALE[(degIdx+6)%7] - 12; // diatonic 7th one octave lower
      return [...triad, seventh];
    }
    return triad;
  }
  function buildChord(deg){ return maybeAddSeventh(degreeToTriadMidi(deg)); }

  // Build an 8-seg progression
  function randomProgression8(){
    // Choose a base 4-chord loop and repeat twice, with a small mutation chance
    const presets = [
      [1,5,6,4],   // I–V–vi–IV
      [1,6,4,5],   // I–vi–IV–V
      [6,4,1,5],   // vi–IV–I–V
      [2,5,1,6],   // ii–V–I–vi
      [1,4,5,4],   // I–IV–V–IV
      [1,5,4,5],   // I–V–IV–V
    ];
    const base = presets[Math.floor(Math.random()*presets.length)];
    let seq = base.concat(base);
    // Tiny chance to swap the last bar for V to create turnaround
    if (Math.random()<0.35) seq[7] = 5;
    // Tiny chance to replace bar 4 with ii (pre-dominant)
    if (Math.random()<0.25) seq[3] = 2;
    return seq;
  }

  // Per-segment pattern data (8 segments × 16 slots)
  // Tri-state per slot: 0=mute, 1=down, 2=up
  // Tri-state per slot: 0=mute, 1=down, 2=up
  const patterns = Array.from({length:8}, ()=> Array(16).fill(0));

  // State
  let activeSeg = 0;
  let progression = [1,5,6,4,1,5,6,4];
  tl.setActiveTab(activeSeg);
  tl.renderSlots(patterns[activeSeg]);

  // Hook up interactions
  tl.onToggle = (ix)=> { const cur = patterns[activeSeg][ix]||0; patterns[activeSeg][ix] = (cur+1)%3; tl.renderSlots(patterns[activeSeg]); };
  tl.onTab = (seg)=> { activeSeg = seg; tl.setActiveTab(seg); tl.renderSlots(patterns[seg]); };
  wheel.onPick = (seg)=> { activeSeg = seg; tl.setActiveTab(seg); tl.renderSlots(patterns[seg]); };


  // --- Simple chord engine (C major key; segments map to I V vi IV I V vi IV) ---
  const DEG_SEQ = [1,5,6,4, 1,5,6,4];
  function degreeToTriad(deg){
    // C major scale: C D E F G A B (0..6)
    const scale = [60, 62, 64, 65, 67, 69, 71]; // C4..B4
    const idx = (deg-1) % 7;
    const root = scale[idx] - 12; // drop an octave for warmth
    const third = scale[(idx+2)%7] - 12;
    const fifth = scale[(idx+4)%7] - 12;
    return [root, third, fifth];
  }
  function playChordStrike(direction='down'){
    const segDeg = progression[activeSeg] || 1;
    const chord = buildChord(segDeg);
    const order = (direction==='up') ? [...chord].reverse() : chord;
    import('./audio-trigger.js').then(({triggerNoteForToy})=>{
      const toyId = panel.dataset.toyid || panel.id;
      order.forEach((m,i)=> setTimeout(()=> triggerNoteForToy(toyId, m, 0.9-(i*0.1)), i*25));
    }).catch(()=>{});
  }

  // Randomize per active segment
  tl.onRand = ()=> {
    const strokeProb = 0.5 + Math.random()*0.3; // chance any slot is a stroke
    patterns[activeSeg] = Array.from({length:16}, ()=> {
      if (Math.random() > strokeProb) return 0; // mute
      return (Math.random() < 0.5) ? 1 : 2; // down or up
    });
    tl.renderSlots(patterns[activeSeg]);
  };

  // Clear
  tl.onClear = ()=> { patterns[activeSeg] = Array(16).fill(0); tl.renderSlots(patterns[activeSeg]); };

  
  // Header button events (Random applies across all segments in standard view)
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

  // --- Sequencer hook (visual only for now) ---
  panel.dataset.steps = String(NUM_STEPS); // keeps scheduler happy
  panel.__sequencerStep = function step(col){
    const info = getLoopInfo();
    const total16 = 16*8;
    const pos = Math.floor(info.phase01 * total16) % total16;
    const seg = Math.floor(pos/16);
    const ix  = pos % 16;

    // Visuals
    wheel.setHand(seg, info.phase01);
    if (seg === activeSeg) tl.highlight(ix);

    const st = (patterns[seg] && patterns[seg][ix]) || 0;
    // set activeSeg to drive which chord is played/labelled
    activeSeg = seg;
    if (st === 1) playChordStrike('down');
    else if (st === 2) playChordStrike('up');
  };

  // Expose minimal API
  const api = { get patterns(){ return patterns; }, setPattern(seg, arr){ patterns[seg] = arr.slice(0,16); } };
  panel.__toyInstance = api;
  return api;
}

// ---------- UI builders ----------
function buildWheelSVG(radius){
  const size = radius*2+20;
  const svg = svgEl('svg', { viewBox:`0 0 ${size} ${size}`, class:'cw-wheel' });
  const cx = size/2, cy = size/2, r = radius;

  // background
  svg.appendChild(svgEl('circle', { cx, cy, r:r+6, fill:'#0b111c', stroke:'#1f2a3d'}));

  // slices
  const slices = [];
  for (let i=0;i<8;i++){
    const a0 = (i/8) * Math.PI*2 - Math.PI/2;
    const a1 = ((i+1)/8) * Math.PI*2 - Math.PI/2;
    const x0 = cx + r*Math.cos(a0), y0 = cy + r*Math.sin(a0);
    const x1 = cx + r*Math.cos(a1), y1 = cy + r*Math.sin(a1);
    const path = describeSlice(cx,cy, r-2, a0, a1);
    const p = svgEl('path', { d:path, fill: COLORS[i], opacity:.75, stroke:'#1e293b' });
    p.addEventListener('click', ()=> onPick(i));
    svg.appendChild(p);
    slices.push(p);
  }


  // labels
  const labels = ['I','V','vi','IV','I','V','vi','IV'];
  for (let i=0;i<8;i++){
    const aMid = ((i+0.5)/8) * Math.PI*2 - Math.PI/2;
    const tx = cx + (r*0.6)*Math.cos(aMid);
    const ty = cy + (r*0.6)*Math.sin(aMid) + 8;
    const t = svgEl('text', { x: tx, y: ty, 'text-anchor':'middle', 'font-size': '20', 'font-weight': '700', fill: '#e2e8f0' });
    t.textContent = labels[i];
    svg.appendChild(t);
  }

  // hand
  const hand = svgEl('line', { x1:cx, y1:cy, x2:cx, y2:cy-r, stroke:'#e2e8f0', 'stroke-width':4, 'stroke-linecap':'round'});

  svg.appendChild(hand);

  function setHand(seg /*0-7*/, phase01){
    // place hand roughly at segment start + local progress
    const local = (phase01*8) - Math.floor(phase01*8);
    const angle = ((seg + local)/8) * Math.PI*2 - Math.PI/2;
    const x = cx + (r-6)*Math.cos(angle), y = cy + (r-6)*Math.sin(angle);
    hand.setAttribute('x2', x); hand.setAttribute('y2', y);
  }

  let onPick = ()=>{};
  function setLabels(arr){
    // remove existing text nodes (simple approach: remove all <text>)
    Array.from(svg.querySelectorAll('text')).forEach(t=> t.remove());
    for (let i=0;i<8;i++){
      const aMid = ((i+0.5)/8) * Math.PI*2 - Math.PI/2;
      const tx = cx + (r*0.6)*Math.cos(aMid);
      const ty = cy + (r*0.6)*Math.sin(aMid) + 8;
      const t = svgEl('text', { x: tx, y: ty, 'text-anchor':'middle', 'font-size': '20', 'font-weight': '700', fill: '#e2e8f0' });
      t.textContent = roman(arr[i]||1);
      svg.appendChild(t);
    }
  }
  setLabels([1,5,6,4,1,5,6,4]);
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

  const tabs = el('div','cw-tabs');
  root.appendChild(tabs);

  const footer = el('div','cw-footer');
  const btnRand = el('button','cw-btn'); btnRand.textContent = 'Randomize';
  const btnClear= el('button','cw-btn'); btnClear.textContent = 'Clear';
  footer.append(btnRand, btnClear);
  root.appendChild(footer);

  // build tabs
  const tabEls = [];
  for (let i=0;i<8;i++){
    const t = el('div','cw-tab'); t.textContent = `Seg ${i+1}`;
    t.addEventListener('click', ()=> onTab(i));
    tabs.appendChild(t); tabEls.push(t);
  }

  // build 16 slots
  const slots = [];
  for (let i=0;i<16;i++){
    const s = el('div','cw-slot');
    s.innerHTML = ARROW_SVG(i%2===0 ? 'down':'up');
    s.addEventListener('click', ()=> onToggle(i));
    slots.push(s); slotGrid.appendChild(s);
  }

  // state callbacks
  let onToggle = ()=>{}; let onTab = ()=>{}; let onRand=()=>{}; let onClear=()=>{};
  btnRand.addEventListener('click', ()=>onRand());
  btnClear.addEventListener('click', ()=>onClear());

  function setBarColors(cols){
    heads.innerHTML='';
    cols.slice(0,8).forEach(c=>{
      const h = el('div','cw-head'); h.style.background = c; heads.appendChild(h);
    });
    tabEls.forEach((t,i)=> t.style.borderColor = shade(cols[i], .45));
  }
  function setActiveTab(ix){
    tabEls.forEach((t,i)=> t.classList.toggle('active', i===ix));
    // Also tint slot borders slightly
    slotGrid.style.borderColor = shade(tabEls[ix].style.borderColor || '#233049', .8);
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
    slots.forEach((s,i)=> s.style.outline = (i===ix)?'2px solid rgba(255,255,255,.15)':'none');
  }

  return { root, setBarColors, setActiveTab, renderSlots, highlight,
           onToggle: fn=>onToggle=fn, onTab: fn=>onTab=fn, onRand: fn=>onRand=fn, onClear: fn=>onClear=fn };
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
function shade(hex, amt){
  try{
    let c = hex.replace('#',''); if (c.length===3) c=c.split('').map(x=>x+x).join('');
    let r=parseInt(c.substring(0,2),16);
    let g=parseInt(c.substring(2,4),16);
    let b=parseInt(c.substring(4,6),16);
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  }catch(e){ return '#233049'; }
}