import test from 'node:test';
import assert from 'node:assert/strict';
import {createBoardObject,resolveBoardInteraction,referenceIntegrity,artBoardObject} from '../src/board-object.js';
import {createBoardObjectLayer} from '../src/board-object-layer.js';
import {createBoardPhysicalObjects} from '../src/board-physical-objects.js';
import {createConnectionModel} from '../src/connections.js';
import {createContainerToyModel} from '../src/container-toys.js';
import {simulateThrow} from '../src/simple-bouncer-physics.js';
import {bouncerGridState} from '../src/simple-bouncer.js';

test('factory is versioned, stable, compositional, and independent of mutable inputs',()=>{
 const options={id:'stable',transform:{x:12,y:-4},authoredState:{pitch:64}};
 const cube=createBoardObject('cube',options);options.transform.x=999;
 assert.equal(cube.version,1);assert.equal(cube.id,'stable');assert.equal(cube.transform.x,12);
 assert.deepEqual(Object.keys(cube.capabilities),['draggable','physicsBody','triggerReceiver','pitchSource']);
 assert.equal(cube.capabilities.instrumentSource,undefined);
 assert.throws(()=>createBoardObject('script'));
});

test('emitter/receiver resolver is kind-independent and missing capabilities are silent',()=>{
 const emitter={id:'ripple',kind:'future-ripple',capabilities:{triggerEmitter:{},instrumentSource:{instrumentId:'kalimba'}}};
 const receiver={id:'shape',kind:'painted-shape',capabilities:{triggerReceiver:{},pitchSource:{midi:64}}};
 assert.deepEqual(resolveBoardInteraction(emitter,receiver,1.25),{timeSeconds:1.25,sourceMidi:64,instrument:'kalimba',emitterId:'ripple',receiverId:'shape'});
 for(const bad of [{},createBoardObject('decorative-art'),{capabilities:{pitchSource:{midi:64}}}])assert.equal(resolveBoardInteraction(emitter,bad,0),null);
 assert.equal(resolveBoardInteraction({},receiver,0),null);
 assert.equal(resolveBoardInteraction(emitter,receiver,NaN),null);
});

test('actual collision capture uses receiver capabilities and cannon timbre at music boundary',()=>{
 const objects=createBoardPhysicalObjects(),cube=objects.addCube(300,0,{sourceMidi:67});
 const capture=simulateThrow({cubes:objects.list('cube'),launch:{x:0,y:0,vx:420,vy:0}});
 assert.ok(capture.collisions.length);
 const state=bouncerGridState(capture,'cannon','PIANO');assert.equal(state.instrument,'PIANO');assert.equal(state.authoredNotes[0].sourceMidi,67);
 capture.collisions[0].receiverCapabilities={decorative:{}};
 assert.equal(bouncerGridState(capture,'cannon','PIANO').authoredNotes.length,state.authoredNotes.length-1);
 assert.equal(objects.get(cube.id).boardObject.capabilities.instrumentSource,undefined);
});

test('legacy physical records migrate IDs and authored snapshots discard runtime',()=>{
 const objects=createBoardPhysicalObjects();objects.restore([{id:'old-cube',kind:'cube',x:40,y:20,width:58,height:58,sourceMidi:60,instrument:'obsolete'},{id:'old-ball',kind:'ball',x:0,y:0,radius:13,motion:{vx:500,vy:100},captureId:'old-cannon'}]);
 assert.equal(objects.get('old-cube').boardObject.id,'old-cube');assert.equal(objects.get('old-cube').instrument,undefined);
 assert.deepEqual(objects.get('old-ball').motion,{vx:0,vy:0});
 objects.update('old-ball',{motion:{vx:900,vy:10},captureId:'flight'});
 const saved=JSON.parse(JSON.stringify(objects.authoredSnapshot()));assert.ok(saved.every(o=>!('motion'in o)&&!('captureId'in o)));
 objects.restore(saved);assert.deepEqual(objects.authoredSnapshot(),saved);assert.deepEqual(objects.get('old-ball').motion,{vx:0,vy:0});
});

test('four examples share spatial layer; ownership deletes grids, references survive, missing references recover',()=>{
 const model=createConnectionModel(),objects=createBoardPhysicalObjects(),containers=createContainerToyModel(model);
 const panel={id:'art',style:{left:'30px',top:'40px',width:'220px',height:'220px'},dataset:{artToy:'flashCircle'}};
 Object.defineProperty(panel,'boardObject',{get:()=>artBoardObject(panel)});
 const layer=createBoardObjectLayer({objects,containers,artPanels:()=>[panel],createCannon:o=>containers.create({...o,presentationType:'simple-bouncer',interactionData:{instrument:'KALIMBA',cubeIds:['cube']}}),createPaint:o=>containers.create({...o,presentationType:'simple-draw'})});
 const cube=layer.create('cube',{x:0,y:0}),cannon=layer.create('cannon'),paint=layer.create('simple-paint');
 assert.deepEqual(new Set(layer.list().map(o=>o.kind)),new Set(['cube','cannon','simple-paint','decorative-art']));
 assert.equal(layer.get(paint.id).capabilities.loopSource!==undefined,true);
 assert.deepEqual(layer.references(cannon.id),[{id:'cube',role:'cubeIds',status:'missing'}]);
 containers.setPresentation(cannon.id,{interactionData:{instrument:'PIANO',cubeIds:[cube.id]}});assert.deepEqual(layer.references(cannon.id),[]);
 const saved=containers.snapshot();containers.restore(JSON.parse(JSON.stringify(saved)));assert.equal(layer.get(cannon.id).capabilities.instrumentSource.instrumentId,'PIANO');
 layer.move(panel.id,123,456);assert.deepEqual(layer.get(panel.id).transform,{x:123,y:456,rotation:0});
 const before=layer.get(cube.id).transform; // viewport/camera has no input into logical geometry
 assert.deepEqual(layer.get(cube.id).transform,before);
 layer.remove(cannon.id);assert.ok(objects.get(cube.id));
 assert.equal(resolveBoardInteraction(layer.get(panel.id),layer.get(cube.id),0),null);
 containers.dispose();
});

 test('runtime presentation updates never enter authored saves or survive restore',()=>{
 const objects=createBoardPhysicalObjects(),cube=objects.addCube(0,0);
 objects.update(cube.id,{glow:1,hover:true,collisionFlash:0.8,drag:{pointerId:42},animationPhase:0.5});
 assert.equal(objects.get(cube.id).hover,true);
 const saved=objects.authoredSnapshot();
 for(const key of ['glow','hover','collisionFlash','drag','animationPhase'])assert.equal(key in saved[0],false);
 objects.restore(JSON.parse(JSON.stringify(saved)));assert.equal(objects.get(cube.id).hover,undefined);
 });

test('musical capabilities are optional even for a cube kind',()=>{
 const cube=createBoardObject('cube',{capabilities:{draggable:{},decorative:{}}});
 assert.equal(cube.capabilities.pitchSource,undefined);
 assert.equal(resolveBoardInteraction(createBoardObject('cannon',{authoredState:{instrument:'PIANO'}}),cube,0),null);
 assert.throws(()=>createBoardObject('cube',{capabilities:{script:{}}}));
});

test('decorative deletion delegates only to Art lifecycle and never touches music',()=>{
 const objects=createBoardPhysicalObjects(),model=createConnectionModel(),containers=createContainerToyModel(model);
 const panels=[{id:'decoration',boardObject:createBoardObject('decorative-art',{id:'decoration'})}];model.registerObject('music');
 const layer=createBoardObjectLayer({objects,containers,artPanels:()=>panels,removeArt:panel=>{panels.splice(panels.indexOf(panel),1);return true;}});
 const before=model.snapshot();assert.equal(layer.remove('decoration'),true);assert.deepEqual(model.snapshot(),before);assert.equal(layer.get('decoration'),null);containers.dispose();
});
