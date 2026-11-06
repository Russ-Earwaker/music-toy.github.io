import {DRAWGRID_POINTER_SCREEN_RADIUS} from '../../../drawgrid/drawgrid-pointer-radius.js';

export const HIGH_FLUID=Object.freeze({width:192,height:128,cellSize:8,coarseWidth:128,coarseHeight:96,coarseCellSize:12,
 radiusWorld:DRAWGRID_POINTER_SCREEN_RADIUS,pressureIterations:14,maxSpeed:320,viscosity:55,densityDiffusion:420,
 velocityDecay:2.4,disturbanceDecay:1.25,heightRecovery:4.0,heightSmoothing:65,surfaceDepth:12,maxDt:1/30,substep:1/120,releaseCeilingMs:14000});

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
 const margin=grid.cellSize*24;
 return point.x-origin.x<margin||point.y-origin.y<margin||point.x-origin.x>grid.worldWidth-margin||point.y-origin.y>grid.worldHeight-margin?fluidOrigin(point,grid):origin;
}
