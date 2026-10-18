import {CHORD_ROOTS,resolveChordAtTick,chordLabel} from '../chord-progression.js';
import {deriveProgressionScale} from '../harmonic-adaptation.js';

export const MELODY_CHORD_WEIGHTS=Object.freeze({boundary:.93,strong:.82,long:.90,resolution:.94,weak:.20});
const pc=n=>((n%12)+12)%12;
const tones=chord=>chord?[0,chord.quality==='minor'?3:4,7].map(n=>pc(CHORD_ROOTS.indexOf(chord.root)+n)):[];
const pick=(values,candidate,random)=>{
 const weights=values.map(n=>1/(1+Math.abs(n-candidate))**2),total=weights.reduce((a,b)=>a+b,0);
 let cursor=random()*total;
 return values.find((_,i)=>(cursor-=weights[i])<0)??values.at(-1);
};

// Generation guidance only: never called by the runtime pitch resolver.
export function chooseGeneratedMelodyPitch({candidate,tick,durationTicks=48,harmony,
 previous=null,previousCandidate=null,resolution=false,minMidi=48,maxMidi=59,
 excluded=[],random=Math.random}){
 const context={harmony},chord=resolveChordAtTick(context,tick);
 if(!chord)return {pitch:candidate,chord:null,importance:'weak',chordTone:false};
 const boundary=(tick-harmony.originTick)%harmony.stepTicks===0;
 const importance=resolution?'resolution':boundary?'boundary':durationTicks>=96?'long':tick%96===0?'strong':'weak';
 const scale=deriveProgressionScale(harmony.chords).pitches;
 const originalLeap=previousCandidate==null?0:candidate-previousCandidate;
 const candidates=Array.from({length:maxMidi-minMidi+1},(_,i)=>minMidi+i).filter(n=>
  scale.includes(pc(n))&&!excluded.includes(n)&&Math.abs(n-candidate)<=3&&
  (previous==null||Math.abs(n-previous)<=Math.max(5,Math.abs(originalLeap)+1))&&
  (previous==null||Math.abs(originalLeap)<2||(n-previous)*originalLeap>=0));
 const chordTones=tones(chord);
 // A future chord boundary inside a held note prefers a common tone. Current
 // DrawGrid cells rearticulate; duration is explicit for generators with holds.
 const touched=[];
 const nextBoundary=harmony.originTick+(Math.floor((tick-harmony.originTick)/harmony.stepTicks)+1)*harmony.stepTicks;
 for(let t=nextBoundary;t<tick+durationTicks;t+=harmony.stepTicks)touched.push(tones(resolveChordAtTick(context,t)));
 if(resolution)touched.push(tones(resolveChordAtTick(context,tick+durationTicks)));
 const compatible=candidates.filter(n=>chordTones.includes(pc(n)));
 const common=compatible.filter(n=>touched.every(chord=>chord.includes(pc(n))));
 const prefer=common.length?common:compatible;
 const pool=random()<MELODY_CHORD_WEIGHTS[importance]&&prefer.length?prefer:candidates;
 const pitch=pool.length?pick(pool,candidate,random):candidate;
 return {pitch,chord:chordLabel(chord),importance,chordTone:chordTones.includes(pc(pitch)),
  crossesChordBoundary:touched.length>0};
}

export function guideGeneratedDrawgridPhrase(states,{harmony,preserveChunks=0,random=Math.random,diagnostics}={}){
 const result=structuredClone(states);
 const entries=states.flatMap((state,bar)=>(state.nodes?.list||[]).flatMap((rows,col)=>
  state.nodes.active?.[col]===false?[]:rows.filter(row=>!state.nodes.disabled?.[col]?.includes(row))
   .map(row=>({bar,col,row,slot:rows.indexOf(row),tick:bar*384+col*384/state.steps}))));
 let previous=null,previousCandidate=null;
 for(const [index,event] of entries.entries()){
  const {bar,col,row,slot,tick}=event,state=result[bar],candidate=59-row;
  if(bar<preserveChunks){previous=candidate;previousCandidate=candidate;continue;}
  const decision=chooseGeneratedMelodyPitch({candidate,tick,durationTicks:384/state.steps,harmony,
   previous,previousCandidate,resolution:index===entries.length-1,random,
   excluded:[...(state.nodes.disabled?.[col]||[]),...state.nodes.list[col].filter((_,i)=>i!==slot)].map(r=>59-r)});
  const nextRow=59-decision.pitch;
  state.nodes.list[col][slot]=nextRow;
  if(state.manualOverrides?.[col])state.manualOverrides[col]=state.manualOverrides[col].map(r=>r===row?nextRow:r);
  if(state.nodes.groups?.[col])state.nodes.groups[col]=state.nodes.groups[col].map(([r,group])=>[r===row?nextRow:r,group]);
  diagnostics?.push({...event,candidate,finalPitch:decision.pitch,...decision});
  previous=decision.pitch;previousCandidate=candidate;
 }
 // Keep each generated line near its new note contour without replacing its
 // authored colour, shape or persistence format. Nodes remain authoritative.
 for(let bar=preserveChunks;bar<result.length;bar++){
  const state=result[bar],old=states[bar];
  const delta=state.nodes.list.map((rows,col)=>rows.length&&old.nodes.list[col]?.length
   ?(rows.reduce((a,b)=>a+b,0)/rows.length-old.nodes.list[col].reduce((a,b)=>a+b,0)/old.nodes.list[col].length)/12:0);
  for(const stroke of state.strokes||[]){
   const points=stroke.ptsN||stroke.__ptsN||[];
   stroke.ptsN=points.map(p=>{const x=Math.max(0,Math.min(delta.length-1,p.nx*state.steps-.5)),a=Math.floor(x),b=Math.min(delta.length-1,a+1);
    return {...p,ny:Math.max(0,Math.min(1,p.ny+(delta[a]||0)*(1-(x-a))+(delta[b]||0)*(x-a)))};});
  }
  state.meta={...state.meta,preserveNodesOverStrokes:true};
 }
 return result;
}
