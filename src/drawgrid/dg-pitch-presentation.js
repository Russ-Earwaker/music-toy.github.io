import {createPitchCurve} from '../pitch-curve.js';

export const DRAWGRID_VISIBLE_RANGE=Object.freeze({minMidi:48,maxMidi:59});
export const DRAWGRID_MINOR_SUGGESTIONS=Object.freeze([0,3,5,7,10]);
export const pitchClass=midi=>((midi%12)+12)%12;
export const visiblePitchRange=range=>{
 const minMidi=Math.floor((range?.minMidi??48)/12)*12;
 return {minMidi,maxMidi:minMidi+11};
};
export const foldedPitchRow=midi=>11-pitchClass(midi);
export const foldedPitchY=midi=>(foldedPitchRow(midi)+.5)/12;
export const sourcePitchAtRow=(row,sourceMidi)=>Math.floor(sourceMidi/12)*12+11-row;
// Fold the musical nodes BEFORE interpolation, so octave wraps are smooth
// transitions between displayed rows rather than discontinuities in a curve.
export function createFoldedPitchCurve(events,durationTicks){
 return createPitchCurve(events.map(e=>({...e,sourceMidi:48+pitchClass(e.sourceMidi??e.midi)})),durationTicks);
}
