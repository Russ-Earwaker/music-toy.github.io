import { noteMidi } from './harmonic-adaptation.js';
// Inspection of captured production decisions only; no pitch adaptation here.
export function createMelodyEvaluation(){
 let events=[],latest=null,pass=[],completedPass=[],passCycle=null,previous={},stats;
 function reset(){events=[];latest=null;pass=[];completedPass=[];passCycle=null;previous={};stats={played:0,changed:0,movementTotal:0,largestMovement:0,repeatedTotal:0,repeatedPreserved:0,contourTotal:0,contourPreserved:0,newLeaps:0};}
 reset();
 function record(event,source){
  if(event.part!=='melody')return;
  const movement=noteMidi(event.adaptedNote)-noteMidi(event.sourceNote),changed=movement!==0;
  const prev=previous[event.mode],adjacent=prev&&event.eventTick-prev.eventTick===96;
  const sourceDirection=adjacent?Math.sign(noteMidi(event.sourceNote)-noteMidi(prev.sourceNote)):null;
  const adaptedDirection=adjacent?Math.sign(noteMidi(event.adaptedNote)-noteMidi(prev.adaptedNote)):null;
  const directions=['down','repeat','up'],contour=adjacent?(sourceDirection===adaptedDirection?directions[sourceDirection+1]+' kept':directions[sourceDirection+1]+' → '+directions[adaptedDirection+1]):'First note / after rest or gap';
  latest=Object.freeze({...event,movement,changed,previousAdaptedNote:prev?.adaptedNote??null,contour});
  previous[event.mode]=latest;
  if(event.mode!=='follow')return;
  stats.played++;stats.changed+=Number(changed);stats.movementTotal+=Math.abs(movement);stats.largestMovement=Math.max(stats.largestMovement,Math.abs(movement));
  if(adjacent){
   if(sourceDirection===0){stats.repeatedTotal++;stats.repeatedPreserved+=Number(adaptedDirection===0);}
   else{stats.contourTotal++;stats.contourPreserved+=Number(sourceDirection===adaptedDirection);}
   if(Math.abs(noteMidi(event.adaptedNote)-noteMidi(prev.adaptedNote))>5&&Math.abs(noteMidi(event.sourceNote)-noteMidi(prev.sourceNote))<=5)stats.newLeaps++;
  }
  const cycle=Math.floor(event.eventTick/(source.length*96));
  if(cycle!==passCycle){passCycle=cycle;pass=source.map(n=>n==null?'—':null);}
  pass[Math.floor(event.eventTick/96)%source.length]=event.adaptedNote;
  if(pass.every(note=>note!==null))completedPass=pass.slice();
  events.push(latest);if(events.length>64)events.shift();
 }
 return {reset,record,inspect:()=>({latest,events:events.slice(),pass:(completedPass.length?completedPass:pass).slice(),stats:{...stats,changeRate:stats.played?100*stats.changed/stats.played:0,averageMovement:stats.changed?stats.movementTotal/stats.changed:0}})};
}
export function comparisonCycleTicks(state){
 const gcd=(a,b)=>b?gcd(b,a%b):a;
 return [state.melodyNotes.length*96,state.bassNotes.length*96,state.chords.length*state.stepTicks,384].reduce((a,b)=>a/gcd(a,b)*b,1);
}
