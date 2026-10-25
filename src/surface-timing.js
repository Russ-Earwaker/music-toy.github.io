import {quantizeForwardTick} from './ripplesynth-transport.js';

export const SURFACE_ANCHOR_TICKS=48;
export const SURFACE_OFFSET_TICKS=12;
// Quantise the phrase once. Relative offsets may coincide for a very fast swipe.
export function surfaceAnchor(tick,{strict=true}={}){
 return quantizeForwardTick(tick,0,96/SURFACE_ANCHOR_TICKS,{strict});
}
export function surfaceOffset(ticks){
 return Math.max(0,Math.round(ticks/SURFACE_OFFSET_TICKS)*SURFACE_OFFSET_TICKS);
}
