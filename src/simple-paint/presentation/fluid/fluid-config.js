import {DRAWGRID_POINTER_SCREEN_RADIUS} from '../../../drawgrid/drawgrid-pointer-radius.js';

export const HIGH_FLUID=Object.freeze({width:256,height:160,cellSize:8,coarseWidth:192,coarseHeight:128,coarseCellSize:12,
 radiusWorld:DRAWGRID_POINTER_SCREEN_RADIUS,pressureIterations:14,maxSpeed:320,viscosity:55,
 velocityDecay:2.4,disturbanceDecay:2.6,heightRecovery:4.0,heightSmoothing:65,
 restDepth:8,pressRate:48,closureDiffusion:420,lateLevelingDiffusion:1600,wakeDiffusion:12,domainFadeWorld:128,maxDt:1/30,substep:1/120,releaseCeilingMs:14000});

export function fluidGrid(coarse=false){
 const width=coarse?HIGH_FLUID.coarseWidth:HIGH_FLUID.width,height=coarse?HIGH_FLUID.coarseHeight:HIGH_FLUID.height;
 const cellSize=coarse?HIGH_FLUID.coarseCellSize:HIGH_FLUID.cellSize;
 return {width,height,cellSize,worldWidth:width*cellSize,worldHeight:height*cellSize};
}
export function fluidOrigin(point,grid){
 const quantum=grid.cellSize*8;
 return {x:Math.floor((point.x-grid.worldWidth/2)/quantum)*quantum,y:Math.floor((point.y-grid.worldHeight/2)/quantum)*quantum};
}
export function fluidRecenter(point,origin,grid){
 const margin=grid.cellSize*24,quantum=grid.cellSize*8;
 // Scroll only the amount needed to keep the finger inside the safe margin.
 // Recentring the entire domain used to discard half its history at once.
 const follow=(value,start,extent)=>value-start<margin?Math.floor((value-margin)/quantum)*quantum:
  value-start>extent-margin?Math.ceil((value-extent+margin)/quantum)*quantum:start;
 const x=follow(point.x,origin.x,grid.worldWidth),y=follow(point.y,origin.y,grid.worldHeight);
 return x===origin.x&&y===origin.y?origin:{x,y};
}
