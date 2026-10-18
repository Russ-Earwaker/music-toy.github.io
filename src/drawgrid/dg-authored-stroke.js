import {drawGridLineColor} from './dg-line-style.js';
import {createFoldedPitchCurve} from './dg-pitch-presentation.js';
import {DEFAULT_DRAWGRID_STEPS,drawgridLoopLengthTicks} from './dg-pattern-length.js';
const bar=drawgridLoopLengthTicks(DEFAULT_DRAWGRID_STEPS),step=bar/DEFAULT_DRAWGRID_STEPS;
// Slot centers agree with the ordinary DrawGrid node renderer. Only the final
// half-cell is compressed so a full bar's curve ends inside its grid rectangle.
export const authoredTickX=t=>t<=bar-step?(t/step+.5)/DEFAULT_DRAWGRID_STEPS:1-.5/DEFAULT_DRAWGRID_STEPS+(t-(bar-step))/step*.5/DEFAULT_DRAWGRID_STEPS;
export function makeAuthoredStroke(events,phraseDuration,{startTick=0,durationTicks=bar,range,color=drawGridLineColor(0)}={}){
 const curve=createFoldedPitchCurve(events,phraseDuration),end=startTick+durationTicks;
 const ticks=[...new Set([startTick,end,...events.filter(e=>e.offsetTick>=startTick&&e.offsetTick<=end).map(e=>e.offsetTick),...Array.from({length:257},(_,i)=>startTick+i/256*durationTicks)])].sort((a,b)=>a-b);
 return {ptsN:ticks.map(t=>({nx:authoredTickX(t-startTick),ny:(59-curve(t)+.5)/12})),color,isSpecial:false,overlayColorize:false,noteDriven:true};
}
