import {createRandomLineStroke} from '../../src/drawgrid/dg-randomizers.js';
import {snapDrawGridStrokeLogical} from '../../src/drawgrid/drawgrid-logical-snap.js';
import {createDrawGridLogicalGeometry} from '../../src/drawgrid/drawgrid-viewport-space.js';
import {buildPalette} from '../../src/note-helpers.js';

export function seededRandom(seed){
 let value=seed>>>0;
 return ()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};
}

// The production long-line generator and logical snapper, with the same
// twelve chromatic rows and C-minor pentatonic snap palette as DrawGrid.
export function generatedMelody(seed){
 const geometry=createDrawGridLogicalGeometry({cols:32,rows:12});
 const stroke=createRandomLineStroke({cols:32,rows:12,gridArea:geometry.gridRect,
  topPad:geometry.topPad,ch:geometry.cellHeight,cw:geometry.cellWidth},seededRandom(seed));
 const map=snapDrawGridStrokeLogical({stroke,geometry,autoTune:true,
  chromaticPalette:buildPalette(48,Array.from({length:12},(_,i)=>i),1).reverse(),
  pentatonicPalette:buildPalette(48,[0,3,5,7,10],2).reverse()});
 return {steps:32,instrument:'PIANO',musicalRole:'melody',localTranspose:0,autotune:true,
  strokes:[{ptsN:stroke.__ptsN,color:'#5fb3ff',generatorId:1,isSpecial:true}],
  nodes:{active:map.active,list:map.nodes.map(s=>[...s]),disabled:map.disabled.map(s=>[...s]),groups:Array.from({length:32},()=>[])},
  manualOverrides:Array.from({length:32},()=>[])};
}
