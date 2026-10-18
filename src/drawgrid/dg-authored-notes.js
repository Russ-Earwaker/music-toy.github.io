// Shared authored source notes. Rows are an editor projection, never identity.
import {DRAWGRID_VISIBLE_RANGE,DRAWGRID_MINOR_SUGGESTIONS,visiblePitchRange,foldedPitchRow,sourcePitchAtRow} from './dg-pitch-presentation.js';
import {restoreDrawgridDuration} from './dg-pattern-length.js';
export const LEGACY_PITCH_RANGE=DRAWGRID_VISIBLE_RANGE;
let serial=0;
const noteId=()=>`note:${globalThis.crypto?.randomUUID?.()||++serial}`;
export const pitchRange=panel=>panel?.__dgPitchRange||LEGACY_PITCH_RANGE;
export const sourceMidiToRow=midi=>foldedPitchRow(midi);
export const rowToSourceMidi=(row,range=LEGACY_PITCH_RANGE)=>range.maxMidi-row;
export function syncAuthoredNotes(panel,map){
 if(!panel)return [];
 const range=pitchRange(panel),previous=panel.__dgAuthoredNotes||[],notes=[];
 (map?.nodes||[]).forEach((rows,col)=>{for(const row of rows||[]){
  const existing=previous.filter(n=>n.col===col&&sourceMidiToRow(n.sourceMidi)===row);
  notes.push(...(existing.length?existing:[{id:noteId(),col,sourceMidi:rowToSourceMidi(row,range)}]));
 }});
 panel.__dgAuthoredNotes=notes;return notes;
}
export function authoredNotesAt(panel,col,row){return panel?.__dgAuthoredNotes?.filter(n=>n.col===col&&sourceMidiToRow(n.sourceMidi)===row)||[];}
export function authoredNoteAt(panel,col,row){return authoredNotesAt(panel,col,row)[0];}
export function moveAuthoredNote(panel,col,oldRow,newRow,{retainOld=false}={}){
 const note=authoredNoteAt(panel,col,oldRow);if(!note)return;
 if(retainOld)panel.__dgAuthoredNotes.push({...note,id:noteId(),sourceMidi:sourcePitchAtRow(newRow,note.sourceMidi)});
 else for(const matched of panel.__dgAuthoredNotes.filter(n=>n.col===col&&sourceMidiToRow(n.sourceMidi)===oldRow))matched.sourceMidi=sourcePitchAtRow(newRow,matched.sourceMidi);
}
export function authoredPerformanceOptions(panel,note){return panel?.__dgPreserveSourceRegister?{pitchShift:true,octave:Math.floor(note.sourceMidi/12)-1}:{};}
export function normalizeAuthoredState(state){
 const st=structuredClone(state||{}),legacyMidi=st.freePlay?.midi;
 const oldRange=st.pitchRange||LEGACY_PITCH_RANGE,range=visiblePitchRange(oldRange);
 const wasAbsolute=oldRange.maxMidi-oldRange.minMidi>11;
 let notes=st.authoredNotes;
 // Existing programmatic row editors may clone a saved state and replace its
 // masks (e.g. splitting a phrase). Recognize that explicit legacy edit rather
 // than replaying the copied, stale authored-note projection over its result.
 const changedProjection=st.authoredProjectionKey!=null&&st.authoredProjectionKey!==JSON.stringify(st.nodes?.list||[]);
 if(!Array.isArray(notes)||changedProjection){
  const previous=notes||[];
  notes=(st.nodes?.list||[]).flatMap((rows,col)=>rows.map(row=>{
   const matches=previous.filter(n=>n.col===col&&(wasAbsolute?oldRange.maxMidi-n.sourceMidi:sourceMidiToRow(n.sourceMidi))===row);
   return matches.length?matches:[{id:noteId(),col,sourceMidi:legacyMidi?.[`${col}:${row}`]??rowToSourceMidi(row,legacyMidi?LEGACY_PITCH_RANGE:oldRange)}];
  }).flat());
 }
 const cols=st.steps||st.nodes?.list?.length||8;
 const nodes={list:Array.from({length:cols},()=>[]),active:st.nodes?.active?.slice()||Array(cols).fill(false),disabled:Array.from({length:cols},()=>[]),groups:Array.from({length:cols},()=>[])};
 for(const note of notes){
  note.id||=noteId();const row=sourceMidiToRow(note.sourceMidi),oldRow=wasAbsolute?oldRange.maxMidi-note.sourceMidi:row;
  if(note.col<0||note.col>=cols)continue;
  if(!nodes.list[note.col].includes(row))nodes.list[note.col].push(row);
  if(st.nodes?.disabled?.[note.col]?.includes(oldRow))nodes.disabled[note.col].push(row);
  const group=st.nodes?.groups?.[note.col]?.find(([r])=>r===oldRow);if(group)nodes.groups[note.col].push([row,group[1]]);
 }
 st.nodes=nodes;st.authoredNotes=notes;st.pitchRange=range;
 st.pitchPresentation='folded-octave-v1';
 if(wasAbsolute&&st.manualOverrides)st.manualOverrides=st.manualOverrides.map(rows=>[...new Set(rows.map(row=>sourceMidiToRow(oldRange.maxMidi-row)))]);
 st.authoredProjectionKey=JSON.stringify(nodes.list);
 st.preserveSourceRegister=st.preserveSourceRegister??!!st.freePlay;
 if(legacyMidi)delete st.freePlay.midi;
 return st;
}
export function restoreAuthoredNotes(panel,state){
 restoreDrawgridDuration(panel,state);
 panel.__dgPitchRange={...state.pitchRange};panel.__dgAuthoredNotes=structuredClone(state.authoredNotes||[]);
 panel.__dgPreserveSourceRegister=!!state.preserveSourceRegister;
 panel.__dgSuggestedPitchClasses=state.suggestedPitchClasses||DRAWGRID_MINOR_SUGGESTIONS;
}
export function drawgridPatternFromState(state){
 const range=state.pitchRange||LEGACY_PITCH_RANGE;
 return {steps:state.steps,instrument:state.instrument,cols:(state.nodes?.list||[]).map((rows,col)=>({
  active:!!state.nodes.active?.[col],nodes:[...rows],disabled:[...(state.nodes.disabled?.[col]||[])],
  notes:rows.flatMap(row=>{const notes=state.authoredNotes?.filter(n=>n.col===col&&sourceMidiToRow(n.sourceMidi)===row);return (notes?.length?notes:[{col,sourceMidi:rowToSourceMidi(row,range)}]).map(n=>({...n,row}));}),
 }))};
}
