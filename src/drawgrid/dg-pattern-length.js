import {NUM_STEPS,TICKS_PER_BAR} from '../audio-core.js';
export const DEFAULT_DRAWGRID_STEPS=NUM_STEPS;
export const DRAWGRID_STEP_COUNTS = Object.freeze([8,16,32]);
// Preserve legacy 8/16-step subdivision timing; the long option is four bars
// of eighth-note slots, and is persisted simply as steps=32.
export const drawgridLoopLengthTicks = steps => Number(steps)===32 ? TICKS_PER_BAR*4 : TICKS_PER_BAR;
// An explicit authored ending is independent of note content. It truncates
// the pattern without squeezing its normal step spacing into a shorter loop.
export function drawgridNaturalDurationTicks(panel){
 const full=drawgridLoopLengthTicks(panel?.dataset?.steps),authored=Number(panel?.dataset?.authoredDurationTicks);
 return authored>0?Math.min(full,Math.max(1,Math.round(authored))):full;
}
export function restoreDrawgridDuration(panel,state={}){
 if(!panel?.dataset)return;
 // Normalize legacy Free Play state before it reaches either editor or linked
 // view playback. Drawing extent is visual metadata, not a shortened toy loop.
 const value=state.freePlay?0:Number(state.authoredDurationTicks);
 if(value>0)panel.dataset.authoredDurationTicks=String(Math.min(drawgridLoopLengthTicks(state.steps??panel.dataset.steps),Math.max(1,Math.round(value))));
 else delete panel.dataset.authoredDurationTicks;
}
export const toyLoopLengthTicks = (panel,instance) => panel?.dataset?.toy==='drawgrid' ? drawgridNaturalDurationTicks(panel) : instance?.loopLengthTicks||384;
