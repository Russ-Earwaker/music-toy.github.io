// One scoped fill initializer, through Simple Rhythm's normal random/update
// events. Regeneration reuses the authored Master and never calls this again.
export function initializeExtraRhythm(panel,mainRhythm){
 const main=mainRhythm?.__gridState?.steps||[],length=panel.__gridState?.steps?.length||8;
 let seed=main.reduce((s,on,i)=>(Math.imul(s,33)+(on?i+1:0))>>>0,1303),index=0;
 const random=()=>{
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const i=index++,probability=main[i%Math.max(1,main.length)]?0.25:i%2?0.85:0.45;
  return seed/4294967296<probability?0.25:0.75;
 };
 panel.dispatchEvent(new CustomEvent('toy-random',{detail:{random},bubbles:true}));
 const steps=Array.from(panel.__gridState?.steps||Array(length).fill(false));
 // A short supporting pattern must remain audible and distinct even when the
 // user's main pattern is silent or every step is enabled.
 if(steps.filter(Boolean).length<2){steps[1%length]=true;steps[(length-1)%length]=true;}
 if(steps.every((on,i)=>on===!!main[i]))steps[0]=!steps[0];
 panel.dispatchEvent(new CustomEvent('loopgrid:update',{detail:{steps,reason:'arrange-fill'},bubbles:true}));
 return steps;
}
