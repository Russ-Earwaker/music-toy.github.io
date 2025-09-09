// src/chordwheel.js — chord wheel with 16-step radial ring (per active segment)
import { initToyUI } from './toyui.js';
import { NUM_STEPS, getLoopInfo } from './audio-core.js';
import { triggerNoteForToy } from './audio-trigger.js';

function roman(deg){ const U={1:'I',4:'IV',5:'V'}, L={2:'ii',3:'iii',6:'vi',7:'vii'}; return U[deg]||L[deg]||'I'; }
const COLORS = ['#60a5fa','#34d399','#fbbf24','#a78bfa','#f87171','#22d3ee','#eab308','#fb7185'];
const CYCLE = [2,0,1,-1];

export function createChordWheel(panel){
  initToyUI(panel, { toyName: 'Chord Wheel', defaultInstrument: 'AcousticGuitar' });
  panel.dataset.toyid = panel.id || 'chordwheel-1';

  const body = panel.querySelector('.toy-body'); body.innerHTML = '';
  const wrap = el('div','cw-wrap'); const flex = el('div','cw-flex'); wrap.appendChild(flex); body.appendChild(wrap);

  const patterns = Array.from({length:8}, ()=> Array(16).fill(-1));
  let progression = [1,5,6,4, 1,5,6,4];
  let activeSeg = 0;

  const wheel = buildWheelWithRing(190,{
    onSlotToggle:(ix)=>{
      const cur = patterns[activeSeg][ix] ?? -1;
      const next = CYCLE[(CYCLE.indexOf(cur)+1)%CYCLE.length];
      patterns[activeSeg][ix]=next; wheel.renderStep(ix,next);
    },
    onPickSeg:(seg)=>{
      activeSeg=seg; wheel.setActiveSeg(seg);
      wheel.renderAllFromPattern(ix=>patterns[seg][ix]??-1);
    }
  });
  flex.appendChild(wheel.svg);

  wheel.setSliceColors(COLORS); wheel.setLabels(progression);
  wheel.setActiveSeg(activeSeg);
  wheel.renderAllFromPattern(ix=>patterns[activeSeg][ix]??-1);

  panel.addEventListener('toy-random',()=>{
    progression=randomProgression8(); wheel.setLabels(progression);
    for(let s=0;s<8;s++){ for(let i=0;i<16;i++){ const r=Math.random(); patterns[s][i]=(r<0.25)?-1:(r<0.5)?0:(r<0.75)?1:2; } }
    wheel.renderAllFromPattern(ix=>patterns[activeSeg][ix]??-1);
  });
  panel.addEventListener('toy-clear',()=>{ for(let s=0;s<8;s++) patterns[s].fill(-1); wheel.renderAllFromPattern(ix=>patterns[activeSeg][ix]??-1); });

  panel.dataset.steps=String(NUM_STEPS);
  let lastIx=-1,lastSeg=-1;
  panel.__sequencerStep=function(){
    const info=getLoopInfo(); const total16=16*8;
    const pos=Math.floor(info.phase01*total16)%total16;
    const seg=Math.floor(pos/16), ix=pos%16;

    wheel.setHand(seg,info.phase01);

    if(seg!==lastSeg){ wheel.setActiveSeg(seg); wheel.renderAllFromPattern(i=>patterns[seg][i]??-1); lastSeg=seg; }
    if(ix!==lastIx){ wheel.highlightStep(ix); lastIx=ix; }
    activeSeg=seg;

    const st=patterns[seg][ix];
    if(st!==-1){
      const chord=buildChord(progression[seg]||1);
      if(st===0){ chord.forEach((m,i)=> triggerNoteForToy(panel.dataset.toyid,m,0.95-i*0.06)); }
      else{ const order=(st===2)?[...chord].reverse():chord;
        order.forEach((m,i)=> setTimeout(()=> triggerNoteForToy(panel.dataset.toyid,m,0.9-i*0.08),i*14)); }
    }
  };

  function randomProgression8(){ const presets=[[1,5,6,4],[1,6,4,5],[6,4,1,5],[2,5,1,6],[1,4,5,4],[1,5,4,5]];
    const base=presets[Math.floor(Math.random()*presets.length)],seq=base.concat(base);
    if(Math.random()<0.35)seq[7]=5; if(Math.random()<0.25)seq[3]=2; return seq; }
  function buildChord(deg){ return maybeAddSeventh(degreeToTriadMidi(deg)); }
}

function buildWheelWithRing(radius,api){
  const outerPad=70,size=radius*2+outerPad*2;
  const svg=svgEl('svg',{viewBox:`0 0 ${size} ${size}`,class:'cw-wheel'});
  const cx=size/2,cy=size/2,r=radius;

  svg.appendChild(svgEl('circle',{cx,cy,r:r+6,fill:'#0b111c',stroke:'#1f2a3d'}));
  const sliceGroup=svgEl('g',{class:'cw-slices'}); svg.appendChild(sliceGroup);
  const slicePaths=[];
  for(let i=0;i<8;i++){ const path=describeSlice(cx,cy,r-2,(i/8)*Math.PI*2-Math.PI/2,((i+1)/8)*Math.PI*2-Math.PI/2);
    const p=svgEl('path',{d:path,fill:COLORS[i],opacity:.75,stroke:'#1e293b','data-seg':i});
    p.addEventListener('click',()=>api.onPickSeg?.(i)); sliceGroup.appendChild(p); slicePaths.push(p); }

  const labelGroup=svgEl('g',{class:'cw-labels'}); svg.appendChild(labelGroup);
  function setLabels(arr){ while(labelGroup.firstChild)labelGroup.removeChild(labelGroup.firstChild);
    for(let i=0;i<8;i++){ const aMid=((i+0.5)/8)*Math.PI*2-Math.PI/2;
      const tx=cx+(r*0.58)*Math.cos(aMid),ty=cy+(r*0.58)*Math.sin(aMid)+8;
      const t=svgEl('text',{x:tx,y:ty,'text-anchor':'middle','font-size':'20','font-weight':'700',fill:'#e2e8f0'});
      t.textContent=roman(arr[i]||1); labelGroup.appendChild(t);} }

  const hand=svgEl('line',{x1:cx,y1:cy,x2:cx,y2:cy-r,stroke:'#e2e8f0','stroke-width':4,'stroke-linecap':'round'}); svg.appendChild(hand);

  const ringGroup=svgEl('g',{class:'cw-ring'}); svg.appendChild(ringGroup);
  const steps=[]; const ringR=r+40,iconLen=16;
  for(let ix=0;ix<16;ix++){ const a=(ix/16)*Math.PI*2-Math.PI/2;
    const x=cx+ringR*Math.cos(a),y=cy+ringR*Math.sin(a),deg=a*180/Math.PI+90;
    const g=svgEl('g',{class:'cw-slotring',transform:`translate(${x} ${y}) rotate(${deg})`,'data-ix':ix});
    g.setAttribute('role','button'); g.setAttribute('tabindex','0'); g.setAttribute('aria-label',`Step ${ix+1}`);
    const hit=svgEl('circle',{r:iconLen*0.9,fill:'transparent'}); g.appendChild(hit);
    const icon=svgEl('g',{class:'cw-icon'}); g.appendChild(icon);
    g.addEventListener('click',()=>api.onSlotToggle?.(ix));
    g.addEventListener('keydown',(e)=>{ if(e.code==='Space'||e.code==='Enter'){ e.preventDefault(); api.onSlotToggle?.(ix);} });
    ringGroup.appendChild(g); steps.push({g,icon}); }

  function setIconForState(icon,st){ while(icon.firstChild)icon.removeChild(icon.firstChild);
    if(st===-1){icon.appendChild(svgEl('circle',{r:6,fill:'none',stroke:'#94a3b8','stroke-width':1.8}));return;}
    if(st===0){icon.appendChild(svgEl('rect',{x:-7,y:-2.5,width:14,height:5,rx:2.5,fill:'#cbd5e1'}));return;}
    if(st===1){icon.appendChild(svgEl('path',{d:'M -7 -4 L 7 -4 L 0 8 Z',fill:'#fff'}));return;}
    if(st===2){icon.appendChild(svgEl('path',{d:'M -7 4 L 7 4 L 0 -8 Z',fill:'#fff'}));return;} }
  function renderStep(ix,st){ setIconForState(steps[ix].icon,st); }
  function renderAllFromPattern(getState){ for(let i=0;i<16;i++) renderStep(i,getState(i)); }
  function highlightStep(ix){ if(typeof highlightStep.last==='number'){const prev=steps[highlightStep.last]?.g;if(prev)prev.classList.remove('playing');}
    const cur=steps[ix]?.g;if(cur)cur.classList.add('playing'); highlightStep.last=ix; }
  function setActiveSeg(seg){ slicePaths.forEach((p,i)=>p.classList.toggle('active',i===seg)); }
  function setSliceColors(cols){ slicePaths.forEach((p,i)=>p.setAttribute('fill',cols[i]||'#6b7280')); }
  function setHand(seg,phase01){ const local=(phase01*8)-Math.floor(phase01*8);
    const angle=((seg+local)/8)*Math.PI*2-Math.PI/2;
    const x=cx+(r-6)*Math.cos(angle),y=cy+(r-6)*Math.sin(angle);
    hand.setAttribute('x2',x); hand.setAttribute('y2',y); }

  return{svg,setLabels,setHand,setSliceColors,setActiveSeg,renderStep,renderAllFromPattern,highlightStep};
}

const MAJOR_SCALE=[0,2,4,5,7,9,11];
function degreeToTriadMidi(deg,tonic=60){const i=(deg-1)%7;return[tonic+MAJOR_SCALE[i]-12,tonic+MAJOR_SCALE[(i+2)%7]-12,tonic+MAJOR_SCALE[(i+4)%7]-12];}
function maybeAddSeventh(triad){ if(Math.random()<0.25){ const rootMidi=triad[0]+12,pc=((rootMidi-60)%12+12)%12;
  let idx=MAJOR_SCALE.findIndex(v=>v===pc); if(idx<0)idx=0; const seventh=60+MAJOR_SCALE[(idx+6)%7]-12; return[...triad,seventh]; } return triad; }
function el(tag,cls){const n=document.createElement(tag);if(cls)n.className=cls;return n;}
function svgEl(tag,attrs={}){const n=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));return n;}
function describeSlice(cx,cy,r,a0,a1){const x0=cx+r*Math.cos(a0),y0=cy+r*Math.sin(a0),x1=cx+r*Math.cos(a1),y1=cy+r*Math.sin(a1);
  const large=(a1-a0)>Math.PI?1:0; return`M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`; }
