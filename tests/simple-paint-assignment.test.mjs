import test from 'node:test';
import assert from 'node:assert/strict';
import {createBoardObjectLayer} from '../src/board-object-layer.js';
import {createBoardPhysicalObjects} from '../src/board-physical-objects.js';
import {createDrumObjects} from '../src/simple-drum.js';
import {createDrumSet} from '../src/simple-drum-set.js';
import {createRippleObjects} from '../src/simple-ripple.js';
import {createStringSurfaces} from '../src/string-surface.js';
import {createPaletteState} from '../src/paint-palette-state.js';
import {resolvePaintTarget} from '../src/paint-target.js';
import {resolveBoardInteraction,createBoardObject} from '../src/board-object.js';
import {instrumentColour,applyInstrumentColour} from '../src/instrument-colours.js';

test('body and handle resolve the same current instrument owner; repaint preserves authored music',()=>{
 const objects=createBoardPhysicalObjects(),drums=createDrumObjects(),ripples=createRippleObjects(),strings=createStringSurfaces();
 const board=createBoardObjectLayer({objects,drums,ripples,strings,containers:{list:()=>[],get:()=>null}});
 const kit=createDrumSet(drums,{x:500,y:500});
 const owners=[...kit,ripples.create(),...['string','strum'].map(kind=>strings.create({kind,start:{x:0,y:0},end:{x:240,y:0},instrument:'KALIMBA'}))];
 const palette=createPaletteState({storage:null});
 let notifications=0;for(const store of [drums,ripples,strings])store.subscribe(()=>notifications++);
 for(const o of owners){
  const panel={id:o.id,dataset:{},closest(){return this;}};
  const before=board.get(o.id),strip=o=>{o=structuredClone(o);delete o.authoredState.instrument;delete o.capabilities.instrumentSource;delete o.authoredState.pattern?.instrument;return o;};
  for(const hit of [panel,{closest:()=>panel}]){
   const target=resolvePaintTarget(hit,board);assert.equal(target.id,o.id);
   palette.clear();palette.selectSlot(0);palette.beginStroke();assert.equal(palette.paint(target),true);
   assert.equal(board.get(o.id).capabilities.instrumentSource.instrumentId,'PIANO');
   const presentation={dataset:{},style:{setProperty(k,v){this[k]=v;}}};applyInstrumentColour(presentation,board.instrumentOwner(o.id).getInstrument());
   assert.equal(presentation.dataset.instrumentColour,instrumentColour('PIANO'));
   palette.selectTool('eyedropper');palette.beginStroke();assert.equal(palette.paint(target),true);assert.equal(palette.state.activePaintSlot,0);
   palette.selectTool('randomise');palette.beginStroke();palette.paint(target);assert.equal(board.instrumentOwner(o.id).getInstrument(),'PIANO');
  }
  assert.deepEqual(strip(board.get(o.id)),strip(before));
  if(o.capabilities.triggerReceiver){const event=resolveBoardInteraction(createBoardObject('cannon',{authoredState:{instrument:'BELL'}}),board.get(o.id),0,{progress:.5,lane:0});assert.equal(event.instrument,'PIANO');}
 }
 assert.equal(notifications,owners.length*2);
 const cube=objects.addCube(0,0);assert.equal(board.instrumentOwner(cube.id),null);
 assert.equal(resolvePaintTarget({closest:()=>({id:cube.id,dataset:{}})},board),null);
});
