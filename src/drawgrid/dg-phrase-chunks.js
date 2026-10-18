import {guideGeneratedDrawgridPhrase} from './dg-melody-harmony.js';

// Split the normal four-bar generator's authored output into four ordinary
// one-bar toys. No phrase notes remain outside the resulting toy states.
export function hasDrawgridPhraseMaterial(state){
 return !!state?.nodes?.list?.some(rows=>rows?.length) || !!state?.strokes?.some(stroke=>(stroke.ptsN||stroke.__ptsN||[]).length);
}

// Generated contours can be cropped/exchanged in pieces. Keep those pieces
// in one drawable path, including the connecting seam; notes stay authoritative.
export function singleGeneratedDrawgridLine(state){
 if((state.strokes?.length||0)<2)return state;
 const strokes=state.strokes.filter(s=>(s.ptsN||s.__ptsN||[]).length);
 if(!strokes.length)return state;
 const points=strokes.flatMap(s=>s.ptsN||s.__ptsN||[]);
 const stroke={...strokes[0],ptsN:points,__ptsN:points};delete stroke.pts;
 return {...state,strokes:[stroke]};
}

// A newly created, empty toy is a place to generate melody, not an authored
// empty motif to copy four times. Keep this decision shared with regression tests.
export async function prepareDrawgridPhrase(seed,generate,options={}){
 const authored=hasDrawgridPhraseMaterial(seed);
 const preserveChunks=authored?seed.steps/8:0;
 const finish=states=>states.map((state,bar)=>bar<preserveChunks?state:singleGeneratedDrawgridLine(state));
 let states;
 if(authored)states=continueDrawgridPhrase(seed);
 else {
  const generated=await generate();
  if(!hasDrawgridPhraseMaterial(generated))throw new Error('Melody generation returned no notes. Please try Arrange again.');
  states=splitDrawgridPhrase(generated);
 }
 if(!options.harmony)return finish(states);
 const baselineDiagnostics=[];
 const guided=guideGeneratedDrawgridPhrase(states,{...options,diagnostics:baselineDiagnostics,preserveChunks});
 if(options.development===false||preserveChunks>=4){options.diagnostics?.push(...baselineDiagnostics);return finish(guided);}
 // A generated statement gets the same guidance as before. Every subsequent
 // bar is now derived from that statement, not from independent long-line bars.
 const variations=developDrawgridMotif(guided[0],options);
 const retained=Math.max(1,preserveChunks);
 for(let i=0;i<retained;i++)variations[i]=guided[i];
 options.diagnostics?.push(...baselineDiagnostics.filter(note=>note.bar<retained));
 return finish(guideGeneratedDrawgridPhrase(variations,{...options,preserveChunks:retained}));
}

export function developDrawgridMotif(statement,{random=Math.random}={}){
 const states=continueDrawgridPhrase(statement);
 function shiftColumn(state,col,semitones){
  const old=state.nodes.list[col];
  const fit=shift=>Math.max(Math.max(...old)-11,Math.min(Math.min(...old),shift));
  semitones=fit(semitones)||fit(-semitones);
  const mapping=new Map(old.map(row=>[row,row-semitones]));
  state.nodes.list[col]=[...new Set(old.map(row=>mapping.get(row)))];
  if(state.nodes.disabled?.[col])state.nodes.disabled[col]=state.nodes.disabled[col].map(row=>mapping.get(row)??row);
  if(state.manualOverrides?.[col])state.manualOverrides[col]=state.manualOverrides[col].map(row=>mapping.get(row)??row);
  if(state.nodes.groups?.[col])state.nodes.groups[col]=state.nodes.groups[col].map(([row,group])=>[mapping.get(row)??row,group]);
  const delta=old.length?(state.nodes.list[col].reduce((a,b)=>a+b,0)/state.nodes.list[col].length-old.reduce((a,b)=>a+b,0)/old.length)/12:0;
  for(const stroke of state.strokes||[])stroke.ptsN=(stroke.ptsN||stroke.__ptsN||[]).map(p=>({...p,
   ny:Math.max(0,Math.min(1,p.ny+delta*Math.max(0,1-Math.abs(p.nx*8-col-.5))))}));
 }
 const sounding=(state,col)=>state.nodes.active?.[col]!==false&&state.nodes.list[col]?.some(row=>!state.nodes.disabled?.[col]?.includes(row));
 // Close variation: retain rhythm and opening; change only a late passing cell.
 const close=states[1],weak=[7,5,3,1].find(col=>sounding(close,col));
 if(weak!=null)shiftColumn(close,weak,random()<.5?-1:1);
 // Development: the existing half-motif exchange plus a small register lift
 // in its answering half. No new independently random contour is introduced.
 const development=states[2];
 for(let col=4;col<8;col++)if(sounding(development,col)){
  const lift=development.nodes.list[col].some(row=>row<2)?-2:2;
  shiftColumn(development,col,lift);
 }
 // continueDrawgridPhrase already returns to the opening contour in bar four
 // and recalls the opening pitch at its ending; harmonic guidance resolves it.
 return states;
}

function cropStrokes(strokes,start,end,mapX){
 return (strokes||[]).flatMap(stroke=>{
  const points=stroke.ptsN||stroke.__ptsN||[],segments=[];let current=[];
  const flush=()=>{if(current.length>1)segments.push({...stroke,ptsN:current});current=[];};
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],dx=b.nx-a.nx;let lo=0,hi=1;
   if(dx===0){if(a.nx<start||a.nx>end){flush();continue;}}
   else{const t1=(start-a.nx)/dx,t2=(end-a.nx)/dx;lo=Math.max(0,Math.min(t1,t2));hi=Math.min(1,Math.max(t1,t2));if(lo>hi){flush();continue;}}
   const at=t=>({nx:mapX(a.nx+dx*t),ny:a.ny+(b.ny-a.ny)*t}),first=at(lo),last=at(hi),previous=current.at(-1);
   if(Math.abs(first.nx-last.nx)<1e-8&&Math.abs(first.ny-last.ny)<1e-8)continue;
   if(previous&&(Math.abs(previous.nx-first.nx)>1e-8||Math.abs(previous.ny-first.ny)>1e-8))flush();
   if(!current.length)current.push(first);current.push(last);if(hi<1)flush();
  }
  flush();return segments;
 });
}

export function splitDrawgridPhrase(state){
 if(state.steps!==32)throw new Error('A four-part phrase needs 32 generated steps.');
 return Array.from({length:4},(_,bar)=>{
  const start=bar/4,end=(bar+1)/4;
  const strokes=cropStrokes(state.strokes,start,end,x=>(x-start)*4);
  return structuredClone({...state,steps:8,strokes,nodes:Object.fromEntries(Object.entries(state.nodes||{}).map(([key,values])=>[key,values.slice(bar*8,bar*8+8)])),manualOverrides:(state.manualOverrides||[]).slice(bar*8,bar*8+8),meta:{preserveNodesOverStrokes:true}});
 });
}

// A small deterministic continuation, not independent random loops. Preserve
// the seed verbatim; repeat its rhythm/range, exchange its half-bar motifs in
// the development bar, and return to its opening pitch at the phrase ending.
export function continueDrawgridPhrase(seed){
 // Older filled melodies used 32 steps; longer authored ideas are segmented
 // without dropping or retuning any notes. A 16-step seed supplies two chunks,
 // then repeats those motifs to complete the four-bar phrase.
 if([16,32].includes(seed.steps)){
  if(seed.steps===32)return splitDrawgridPhrase(seed);
  const strokes=[0,1].flatMap(part=>(seed.strokes||[]).map(stroke=>({
   ...stroke,ptsN:(stroke.ptsN||stroke.__ptsN||[]).map(p=>({...p,nx:(p.nx+part)/2}))
  })));
  const expanded=structuredClone({...seed,steps:32,strokes,
   nodes:Object.fromEntries(Object.entries(seed.nodes||{}).map(([key,values])=>[key,[...values,...values]])),
   manualOverrides:[...(seed.manualOverrides||[]),...(seed.manualOverrides||[])]});
  return splitDrawgridPhrase(expanded);
 }
 if(seed.steps!==8)throw new Error('A four-part Phrase needs an 8, 16 or 32-step idea.');
 const states=Array.from({length:4},()=>structuredClone(seed));
 for(let bar=1;bar<4;bar++){
  const state=states[bar];state.meta={...state.meta,preserveNodesOverStrokes:true};
  if(bar===2){
   for(const [key,values] of Object.entries(state.nodes||{}))if(Array.isArray(values))state.nodes[key]=[...values.slice(4),...values.slice(0,4)];
   if(state.manualOverrides?.length===8)state.manualOverrides=[...state.manualOverrides.slice(4),...state.manualOverrides.slice(0,4)];
   state.strokes=singleGeneratedDrawgridLine({strokes:[...cropStrokes(seed.strokes,.5,1,x=>x-.5),...cropStrokes(seed.strokes,0,.5,x=>x+.5)]}).strokes;
  }
  const list=state.nodes?.list;
  if(bar===3&&list){const opening=seed.nodes.list.find(rows=>rows?.length),last=list.findLastIndex(rows=>rows?.length);if(opening&&last>=0)list[last]=structuredClone(opening);}
 }
 return states;
}

// Repair saved continuations from the earlier nodes-only builder. Recover
// their visual motif without replacing any edited notes, rests or settings.
export function repairDrawgridPhraseStrokes(states){
 if(states.length!==4||states[0]?.steps!==8||!states[0].strokes?.some(s=>(s.ptsN||s.__ptsN||[]).length>1))return states;
 const visuals=continueDrawgridPhrase(states[0]);
 return states.map((state,i)=>i&&!state.strokes?.some(s=>(s.ptsN||s.__ptsN||[]).length>1)?{...state,strokes:structuredClone(visuals[i].strokes)}:state);
}

export function phraseChunkWithSeedSettings(chunk,seed){
 const {steps,strokes,nodes,manualOverrides,meta}=chunk;
 return structuredClone({...seed,steps,strokes,nodes,manualOverrides,meta});
}
