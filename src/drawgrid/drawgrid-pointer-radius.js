import {createDGTuning} from './dg-tuning.js';
import {DRAWGRID_LOGICAL_WIDTH,DRAWGRID_LOGICAL_HEIGHT} from './drawgrid-viewport-space.js';
// Shared effective interaction radius: the existing DrawGrid +50% poke multiplier.
export function drawGridPointerRadius(baseRadius, capRadius = Infinity) {
 return Math.min(baseRadius * 1.5, capRadius);
}
const size={w:DRAWGRID_LOGICAL_WIDTH,h:DRAWGRID_LOGICAL_HEIGHT};
export const DRAWGRID_POINTER_SCREEN_RADIUS=drawGridPointerRadius(
 createDGTuning(size).ghostRadiusToy(size),Math.max(8,Math.min(size.w,size.h)*.25));
// The normal 1:1 DrawGrid radius, expressed in CSS px, without board zoom or DPR.
