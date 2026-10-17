// Split the normal four-bar generator's authored output into four ordinary
// one-bar toys. No phrase notes remain outside the resulting toy states.
export function hasDrawgridPhraseMaterial(state){
 return !!state?.nodes?.list?.some(rows=>rows?.length) || !!state?.strokes?.some(stroke=>(stroke.ptsN||stroke.__ptsN||[]).length);
}

// A newly created, empty toy is a place to generate melody, not an authored
// empty motif to copy four times. Keep this decision shared with regression tests.
export async function prepareDrawgridPhrase(seed,generate){
 if(hasDrawgridPhraseMaterial(seed))return continueDrawgridPhrase(seed);
 const generated=await generate();
 if(!hasDrawgridPhraseMaterial(generated))throw new Error('Melody generation returned no notes. Please try Arrange again.');
 return splitDrawgridPhrase(generated);
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
   state.strokes=[...cropStrokes(seed.strokes,.5,1,x=>x-.5),...cropStrokes(seed.strokes,0,.5,x=>x+.5)];
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
