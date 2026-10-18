import {sourceMidiToRow,normalizeAuthoredState} from './drawgrid/dg-authored-notes.js';
import {DRAWGRID_VISIBLE_RANGE} from './drawgrid/dg-pitch-presentation.js';
import {makeAuthoredStroke} from './drawgrid/dg-authored-stroke.js';
import {LINE_DURATION_TICKS,LINE_STEP_COUNT,LINE_STEP_TICKS,linePointAt,clamp01,createLineSource,FREE_PLAY_PITCH_CLASSES} from './free-play-line.js';
import {drawgridLoopLengthTicks,DEFAULT_DRAWGRID_STEPS} from './drawgrid/dg-pattern-length.js';
import {midiToName} from './note-helpers.js';

// DrawGrid nodes and their per-node registers are the only playable source.
// Provenance describes the original geometry, never playback duration or events.
export function lineDrawGridStates(source,strokeId){
 return Array.from({length:Math.ceil(source.durationTicks/LINE_DURATION_TICKS)},(_,bar)=>{
  const start=bar*LINE_DURATION_TICKS,durationTicks=Math.min(LINE_DURATION_TICKS,source.durationTicks-start),events=source.events.filter(e=>e.offsetTick>=start&&e.offsetTick<start+LINE_DURATION_TICKS);
  const authoredNotes=events.map((event,i)=>({id:`${strokeId}:note:${bar*LINE_STEP_COUNT+i}`,col:(event.offsetTick-start)/LINE_STEP_TICKS,sourceMidi:event.midi,...(event.scissorMuted?{scissorMuted:true}:{}),...(event.paintCovered?{paintCovered:true}:{})}));
  const list=Array.from({length:LINE_STEP_COUNT},()=>[]);for(const note of authoredNotes)list[note.col]=[sourceMidiToRow(note.sourceMidi,DRAWGRID_VISIBLE_RANGE)];
  return {steps:LINE_STEP_COUNT,instrument:source.instrument,autotune:true,pitchRange:{...DRAWGRID_VISIBLE_RANGE},pitchPresentation:'folded-octave-v1',suggestedPitchClasses:[...FREE_PLAY_PITCH_CLASSES],preserveSourceRegister:true,authoredNotes,authoredProjectionKey:JSON.stringify(list),
   authoredDurationTicks:durationTicks<drawgridLoopLengthTicks(LINE_STEP_COUNT)?durationTicks:0,
   meta:{preserveNodesOverStrokes:true},strokes:[makeAuthoredStroke(source.events,source.durationTicks,{startTick:start,durationTicks,range:DRAWGRID_VISIBLE_RANGE})],
   nodes:{list,active:list.map(n=>!!n.length),disabled:list.map(()=>[]),groups:list.map(()=>[])},
   freePlay:{strokeId,bar,startTick:start,durationTicks,phraseDurationTicks:source.durationTicks,
    ...(bar===0?{path:structuredClone(source.path),visualEvents:source.events.map(({midi,offsetTick})=>({midi,offsetTick})),straightened:false,paint:(source.paint||[]).map(({eventIndices,...stamp})=>({...structuredClone(stamp),...(eventIndices?{notes:eventIndices.map(i=>`${strokeId}:note:${i}`)}:{})}))}:{} )}};
 });
}
// One-time import of coordinate-keyed prototypes; no playback lookup survives.
export function prepareFreePlayDrawGridState(state){
 const st=normalizeAuthoredState(state);
 if(st.freePlay){
  // Import old provenance-only partial endings into ordinary DrawGrid state.
  if(st.authoredDurationTicks==null&&st.freePlay.durationTicks>0&&st.freePlay.durationTicks<drawgridLoopLengthTicks(st.steps))st.authoredDurationTicks=st.freePlay.durationTicks;
  st.suggestedPitchClasses||=[...FREE_PLAY_PITCH_CLASSES];
  // Migrate the old absolute-height drawing once. Read its frozen ink, not the
  // edited notes, so source edits never reshape the original generated stroke.
  if(state.pitchPresentation!=='folded-octave-v1'&&state.pitchRange?.maxMidi-state.pitchRange?.minMidi>11){
   st.strokes=(st.strokes||[]).map(stroke=>{
    if(!stroke.noteDriven||!stroke.ptsN?.length)return stroke;
    const duration=st.freePlay.durationTicks,points=stroke.ptsN;
    const ticks=[...Array.from({length:8},(_,i)=>i*LINE_STEP_TICKS).filter(t=>t<duration),duration];
    const local=t=>t<=336?(t/48+.5)/8:.9375+(t-336)/48*.0625;
    const frozen=ticks.map(t=>{const x=local(t),p=points.reduce((a,b)=>Math.abs(b.nx-x)<Math.abs(a.nx-x)?b:a);return {offsetTick:t,midi:Math.round(state.pitchRange.maxMidi+.5-p.ny*(state.pitchRange.maxMidi-state.pitchRange.minMidi+1))};});
    return {...stroke,...makeAuthoredStroke(frozen,duration,{durationTicks:duration,range:st.pitchRange,color:stroke.color})};
   });
  }
 }
 if(st.freePlay&&!st.strokes?.length&&st.authoredNotes.length){
  const events=st.authoredNotes.map(n=>({...n,offsetTick:n.col*LINE_STEP_TICKS}));
  st.strokes=[makeAuthoredStroke(events,st.freePlay.durationTicks,{durationTicks:st.freePlay.durationTicks,range:st.pitchRange})];
  st.meta={...st.meta,preserveNodesOverStrokes:true};
 }
 return st;
}
export function drawGridLineSource(panels){
 const ordered=[...panels].sort((a,b)=>a.__freePlayDrawGrid.bar-b.__freePlayDrawGrid.bar),first=ordered[0]?.__freePlayDrawGrid;
 if(!first?.path)return null;
 const events=[];
 for(const panel of ordered){
  const meta=panel.__freePlayDrawGrid,pattern=panel.__seqPattern;
  (pattern?.cols||[]).forEach((column,col)=>{
   if(!column.active)return;
   for(const row of column.nodes||[]){if(column.disabled?.includes(row))continue;
    const offsetTick=meta.startTick+col*LINE_STEP_TICKS;if(offsetTick>=first.phraseDurationTicks)continue;
    const authoredNotes=column.notes?.filter(n=>n.row===row)||panel.__dgAuthoredNotes?.filter(n=>n.col===col&&sourceMidiToRow(n.sourceMidi)===row)||[];
    for(const authored of authoredNotes){
    const midi=authored.sourceMidi,pathDistance=offsetTick/first.phraseDurationTicks*first.path.totalLength;
    events.push({...linePointAt(first.path,pathDistance),id:authored.id,scissorMuted:!!authored.scissorMuted,paintCovered:!!authored.paintCovered,midi,note:midiToName(midi),offsetTick,pathDistance});
    }
   }
  });
 }
 // The line is a static drawing. Edited notes remain the only playback source.
 const visualEvents=first.visualEvents || createLineSource(first.path.points).events;
 return {version:3,instrument:ordered[0].dataset.instrument,path:first.path,paint:first.paint||[],visualEvents,durationTicks:first.phraseDurationTicks,events:events.sort((a,b)=>a.offsetTick-b.offsetTick)};
}
export function applyFreePlayDrawGrid(panel,metadata){
 if(!metadata)return;
 panel.__freePlayDrawGrid=structuredClone(metadata);
 panel.dataset.freePlayStrokeId=metadata.strokeId;
}
// Follow the normal grid/chain cycle. Hold the completed drawing during its
// trailing rests; the stroke endpoint must never restart playback or the view.
export function strokePhase(source,tick,cycleTicks=drawgridLoopLengthTicks(DEFAULT_DRAWGRID_STEPS)){
 return source.durationTicks&&cycleTicks>0?clamp01(((tick%cycleTicks)+cycleTicks)%cycleTicks/source.durationTicks):0;
}
