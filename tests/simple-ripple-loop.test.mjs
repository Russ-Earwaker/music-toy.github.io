import test from 'node:test';
import assert from 'node:assert/strict';
import {createRippleObjects} from '../src/simple-ripple.js';
import {createLoopingRippleController} from '../src/simple-ripple-loop.js';
import {createBoardObject} from '../src/board-object.js';
import {createTickTransport} from '../src/tick-transport.js';
import {createReceiverResponses,receiverTriggerResponse} from '../src/board-receiver-response.js';
const receiver=(id,d)=>createBoardObject('cube',{id,transform:{x:d,y:0},bounds:{radius:0},authoredState:{pitch:60}});
function fixture(period=1){
 const context={currentTime:0,state:'running'},objects=createRippleObjects(),events=[],responses=createReceiverResponses(),cancelled=[],dragging=new Set(),feedback=[];
 let connected=true,receivers=[receiver('near',150),receiver('mid',300),receiver('far',719)];
 const transport=createTickTransport({id:'main',getContext:()=>context,emit:e=>controller?.transportChanged('main',e.type)});
 let controller=createLoopingRippleController({objects,getReceivers:()=>receivers,isReceiverDragging:id=>dragging.has(id),getTransport:()=>connected?transport:null,schedule:e=>events.push(e),respond:(e,t)=>{feedback.push(e);responses.enqueue(e,t);},cancel:id=>{cancelled.push(id);responses.clear(id);}});
 const ripple=objects.create();objects.update(ripple.id,{periodLoops:period});
 return {objects,ripple,events,transport,controller,responses,cancelled,context,dragging,feedback,
  at(tick){context.currentTime=transport.tickToAudioTime(tick);controller.tick();},
  setReceivers:r=>{receivers=r;},connect:value=>{connected=value;controller.tick();},
  async play(){await transport.play();controller.tick();}};
}
for(let loops=1;loops<=4;loops++)test(`${loops} loop duration equals repeat; geometry quantises once per cycle`,async()=>{
 const f=fixture(loops);await f.play();const duration=loops*384;
 for(let tick=0;tick<duration*2;tick+=6)f.at(tick);
 assert.equal(f.events.length,6);assert.deepEqual(f.events.map(e=>e.receiverId),['near','mid','far','near','mid','far']);
 assert.ok(f.events.every(e=>e.eventTick%48===0||e.eventTick%duration===duration-1));
 assert.equal(new Set(f.events.map(e=>`${e.cycleStart}:${e.receiverId}`)).size,6);
 f.at(duration*2);assert.equal(f.controller.visibleWaves()[0].radius,0);
 f.at(duration*2+duration/2);assert.equal(f.controller.visibleWaves()[0].radius,360);
});
test('pause freezes, resume preserves phase, tempo changes mapping, return resets',async()=>{
 const f=fixture(2);await f.play();f.at(192);f.transport.pause();const radius=f.controller.visibleWaves()[0].radius,count=f.events.length;
 f.context.currentTime+=10;f.controller.tick();assert.equal(f.events.length,count);assert.equal(f.controller.visibleWaves()[0].radius,radius);
 await f.transport.play();assert.equal(f.controller.visibleWaves()[0].radius,radius);
 f.transport.setBpm(60);assert.equal(f.controller.visibleWaves()[0].radius,radius);
 f.context.currentTime+=1;f.controller.tick();assert.equal(f.transport.currentTick,288);
 f.transport.returnToStart();assert.equal(f.controller.visibleWaves()[0].radius,0);f.controller.tick();assert.equal(f.controller.visibleWaves()[0].radius,0);
});
test('cycle snapshots geometry and pitch; new period applies after current cycle',async()=>{
 const f=fixture();await f.play();f.at(24);f.setReceivers([receiver('near',600)]);f.objects.update(f.ripple.id,{periodLoops:2});
 for(let tick=30;tick<384;tick+=6)f.at(tick);
 assert.equal(f.events[0].intendedTick,80);assert.equal(f.events.length,3);
 f.at(384);assert.equal(f.controller.visibleWaves()[0].radius,0);f.at(768);assert.equal(f.controller.visibleWaves()[0].radius,360);
 for(let tick=774;tick<1152;tick+=6)f.at(tick);
 assert.equal(f.events.length,4);assert.equal(f.events[3].intendedTick,1024);
});
test('disconnect cancels and reconnect rejoins phase without catchup',async()=>{
 const f=fixture();await f.play();f.at(72);f.connect(false);const count=f.events.length;
 f.at(800);assert.equal(f.events.length,count);assert.deepEqual(f.controller.visibleWaves(),[]);
 f.connect(true);assert.ok(f.controller.visibleWaves()[0].radius>0);assert.equal(f.events.length,count);
 f.at(864);assert.equal(f.events.length,count+1);assert.ok(f.events.at(-1).eventTick>=800);
});
test('final slot remains in half-open cycle and is neither dropped nor duplicated',async()=>{
 const f=fixture();f.setReceivers([receiver('edge',720)]);await f.play();
 for(let tick=0;tick<=800;tick++)f.at(tick);
 assert.deepEqual(f.events.map(e=>e.eventTick),[383,767]);assert.deepEqual(f.events.map(e=>e.cycleStart),[0,384]);
});
test('uncommitted instrument/volume changes stay emitter-owned; art remains silent',async()=>{
 const f=fixture();f.setReceivers([receiver('near',150),createBoardObject('decorative-art',{id:'art'})]);await f.play();
 f.objects.update(f.ripple.id,{instrument:'KALIMBA',volume:0.3});f.at(80);
 assert.equal(f.events.length,1);assert.equal(f.events[0].instrument,'KALIMBA');assert.equal(f.events[0].volume,0.3);
 assert.equal(f.events[0].emitterId,f.ripple.id);assert.equal(f.events[0].sourceMidi,60);
});
test('shared receiver response aligns feedback with sound and preserves Cannon envelope',async()=>{
 const f=fixture();await f.play();f.at(80);assert.equal(f.responses.responses().get('near').pending,true);assert.equal(f.responses.responses().get('near').flash,0);
 f.at(96);assert.equal(f.responses.responses().get('near').flash,1);f.at(116);assert.equal(f.responses.responses().get('near').flash,0.5);
 assert.deepEqual(receiverTriggerResponse({tick:116,intendedTick:80,eventTick:96}),{pending:false,flash:0.5});
});
test('period persists, old scenes default to one, invalid values restore atomically',()=>{
 const f=fixture(4),saved=f.objects.snapshot();f.objects.restore(saved);assert.equal(f.objects.get(f.ripple.id).authoredState.periodLoops,4);
 delete saved[0].authoredState.periodLoops;f.objects.restore(saved);assert.equal(f.objects.get(f.ripple.id).authoredState.periodLoops,1);
 saved[0].authoredState.periodLoops=0;assert.throws(()=>f.objects.restore(saved));assert.equal(f.objects.list().length,1);
});
import {createConnectionModel,HEARTBEAT_PORTS} from '../src/connections.js';
import {installRippleConnections,migrateRippleConnections} from '../src/simple-ripple-connections.js';
test('Ripple uses real transport ports, selected Heartbeat, and isolated removal',()=>{
 const model=createConnectionModel(),objects=createRippleObjects();
 model.registerObject('heartbeat',{ports:HEARTBEAT_PORTS,transportId:'clock'});
 const off=installRippleConnections({objects,model,getHeartbeat:()=>({id:'heartbeat'})});
 const a=objects.create(),b=objects.create();assert.equal(model.getTransportId(a.id),'clock');
 assert.equal(model.getPort({objectId:a.id,portId:'output'}),null);
 assert.equal(model.connect('sequence',{objectId:a.id,portId:'output'},{objectId:b.id,portId:'input'}).ok,false);
 const saved=model.snapshot().connections;model.disconnect(model.getParent(a.id).id);assert.equal(model.getTransportId(a.id),null);
 objects.update(a.id,{volume:0.4});assert.equal(model.getTransportId(a.id),null);
 objects.remove(a.id);assert.equal(model.getObject(a.id),null);assert.equal(model.getTransportId(b.id),'clock');assert.equal(saved.length,2);off();
});
test('old manual Ripples gain default roots; saved intentional disconnections stay absent',()=>{
 const objects=createRippleObjects(),r=objects.create(),current=objects.snapshot(),old=structuredClone(current);delete old[0].authoredState.periodLoops;
 assert.deepEqual(migrateRippleConnections([],current,'main-heartbeat'),[]);
 const wires=migrateRippleConnections([],old,'main-heartbeat');assert.equal(wires.length,1);assert.equal(wires[0].from.objectId,'main-heartbeat');assert.equal(wires[0].to.objectId,r.id);
 assert.equal(migrateRippleConnections(wires,old,'main-heartbeat').length,1);
});
test('late polling does not replay previous cycles; multiple emitters remain independent',async()=>{
 const f=fixture();const other=f.objects.create({instrument:'KALIMBA'});await f.play();f.at(90);
 assert.equal(f.events.length,2);assert.equal(new Set(f.events.map(e=>e.emitterId)).size,2);
 f.at(5000);const after=f.events.length;f.controller.tick();assert.equal(f.events.length,after);
 assert.equal(f.controller.visibleWaves().length,2);f.objects.remove(other.id);assert.equal(f.controller.visibleWaves().length,1);
});
test('duplicate receiver entries cannot duplicate a cycle attack; future receiver kinds work',async()=>{
 const f=fixture(),r={...receiver('shared',150),kind:'future-shape'};f.setReceivers([r,r]);await f.play();
 for(let tick=0;tick<768;tick+=6)f.at(tick);assert.deepEqual(f.events.map(e=>e.eventTick),[96,480]);
});
test('new receiver ahead of travelling wave joins this cycle with quantised sound and feedback',async()=>{
 const f=fixture();f.setReceivers([]);await f.play();f.at(100);
 f.setReceivers([receiver('new',300)]);f.controller.tick();f.at(170);
 assert.equal(f.events.length,1);assert.equal(f.events[0].receiverId,'new');assert.equal(f.events[0].intendedTick,160);assert.equal(f.events[0].eventTick,192);
 f.at(192);assert.equal(f.responses.responses().get('new').flash,1);
 for(let tick=198;tick<384;tick+=6)f.at(tick);assert.equal(f.events.length,1);
 for(let tick=384;tick<600;tick+=6)f.at(tick);assert.deepEqual(f.events.map(e=>e.eventTick),[192,576]);
});
test('new receiver behind wave waits until next cycle even if quantised slot is still ahead',async()=>{
 const f=fixture();f.setReceivers([]);await f.play();f.at(170);
 f.setReceivers([receiver('late',300)]);f.controller.tick();f.at(180);assert.equal(f.events.length,0);
 // Moving the newly observed receiver ahead does not change this decision.
 f.setReceivers([receiver('late',600)]);
 for(let tick=186;tick<384;tick+=6)f.at(tick);assert.equal(f.events.length,0);
 for(let tick=384;tick<740;tick+=6)f.at(tick);assert.equal(f.events.length,1);assert.equal(f.events[0].eventTick,720);
});
test('discovering receivers preserves committed indices and existing geometry snapshots',async()=>{
 const f=fixture();f.setReceivers([receiver('old',150),receiver('outside',800)]);await f.play();f.at(80);assert.equal(f.events.length,1);
 f.setReceivers([receiver('old',600),receiver('outside',300),receiver('new',240),receiver('new',240)]);
 for(let tick=86;tick<384;tick+=6)f.at(tick);
 assert.deepEqual(f.events.map(e=>[e.receiverId,e.eventTick]),[['old',96],['new',144]]);
});
test('new receiver at wavefront can trigger during current quantisation window',async()=>{
 const f=fixture();f.setReceivers([]);await f.play();f.at(128);f.setReceivers([receiver('crest',240)]);f.controller.tick();
 assert.equal(f.events.length,1);assert.equal(f.events[0].eventTick,144);f.controller.tick();assert.equal(f.events.length,1);
});
test('held receiver follows live geometry until wave contact and attacks only once',async()=>{
 const f=fixture();f.setReceivers([receiver('moving',600)]);await f.play();f.at(60);f.dragging.add('moving');f.controller.tick();
 f.setReceivers([receiver('moving',300)]);f.at(100);assert.equal(f.events.length,0);
 f.at(170);assert.equal(f.events.length,1);assert.equal(f.events[0].eventTick,192);
 f.setReceivers([receiver('moving',600)]);f.at(180);f.setReceivers([receiver('moving',100)]);f.at(210);
 assert.equal(f.events.length,1);f.at(216);assert.ok(f.responses.responses().get('moving').flash>0);
});
test('dragging across wave in either direction resolves current contact',async()=>{
 for(const [from,to]of [[600,100],[50,500]]){
  const f=fixture();f.setReceivers(from===50?[]:[receiver('cross',from)]);await f.play();
  if(from===50){f.setReceivers([]);f.at(100);f.setReceivers([receiver('cross',from)]);}else f.at(100);
  f.dragging.add('cross');f.controller.tick();const before=f.events.length;
  f.setReceivers([receiver('cross',to)]);f.controller.tick();f.at(120);assert.equal(f.events.length,before+1);assert.equal(f.events.at(-1).eventTick,144);
 }
});
test('drag release ahead of wave latches new position; release beyond range stays silent',async()=>{
 for(const distance of [300,900]){
  const f=fixture();f.setReceivers([receiver('moving',600)]);await f.play();f.at(50);f.dragging.add('moving');f.controller.tick();
  f.setReceivers([receiver('moving',distance)]);f.at(60);f.dragging.delete('moving');f.controller.tick();
  for(let tick=66;tick<384;tick+=6)f.at(tick);
  assert.deepEqual(f.events.map(e=>e.eventTick),distance===300?[192]:[]);
 }
});
test('starting drag cancels committed old-position note and rebuilds other pending notes',async()=>{
 const f=fixture();f.setReceivers([receiver('moving',150),receiver('other',160)]);await f.play();f.at(70);
 assert.equal(f.events.length,1);assert.equal(f.feedback.length,2);
 f.dragging.add('moving');f.controller.tick();assert.ok(f.cancelled.includes(f.ripple.id));
 f.setReceivers([receiver('moving',600),receiver('other',160)]);f.at(90);
 assert.equal(f.events.at(-1).receiverId,'other');assert.equal(f.events.at(-1).eventTick,96);
 f.at(100);assert.equal(f.events.filter(e=>e.receiverId==='moving').length,1);
});
test('same pitch and tick plays once while all receivers flash; distinct pitches and ticks survive',async()=>{
 const f=fixture(),a=receiver('a',150),b=receiver('b',160),c=receiver('c',160),d=receiver('d',300);c.capabilities.pitchSource.midi=67;
 f.setReceivers([a,b,c,d]);await f.play();f.at(80);assert.equal(f.events.length,2);assert.equal(f.feedback.length,3);
 f.at(96);for(const id of ['a','b','c'])assert.equal(f.responses.responses().get(id).flash,1);
 f.at(170);assert.equal(f.events.length,3);assert.equal(f.events.at(-1).eventTick,192);
});
test('same-instrument Ripples share simultaneous notes; cancellation transfers unstarted voice',async()=>{
 const f=fixture();f.setReceivers([receiver('shared',150)]);const other=f.objects.create();await f.play();f.at(80);
 assert.equal(f.events.length,1);assert.equal(f.feedback.length,2);const owner=f.events[0].emitterId;
 f.objects.remove(owner);f.controller.tick();assert.equal(f.events.length,2);assert.notEqual(f.events.at(-1).emitterId,owner);
 assert.equal(f.events.at(-1).eventTick,96);assert.equal(f.controller.visibleWaves().length,1);
});
test('different instruments retain their sound; muted emitter cannot consume shared attack',async()=>{
 const f=fixture();f.setReceivers([receiver('shared',150)]);f.objects.update(f.ripple.id,{muted:true});const audible=f.objects.create();const kalimba=f.objects.create({instrument:'KALIMBA'});await f.play();f.at(80);
 assert.deepEqual(f.events.map(e=>e.emitterId),[audible.id,kalimba.id]);assert.equal(f.feedback.length,3);
});
test('drag cannot retrigger final-slot receiver after its attack has sounded',async()=>{
 const f=fixture();f.setReceivers([receiver('edge',720)]);await f.play();f.at(365);assert.equal(f.events.length,1);
 f.at(383);f.dragging.add('edge');f.controller.tick();f.setReceivers([receiver('edge',100)]);f.controller.tick();assert.equal(f.events.length,1);
});
