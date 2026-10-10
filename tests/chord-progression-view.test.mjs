import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnectionModel, HEARTBEAT_PORTS } from '../src/connections.js';
import { createStructureToyModel } from '../src/structure-toys.js';
import { createConnectionView } from '../src/connection-view.js';
import { Node, walk, dom, CustomEvent, event } from './graph-ui-dom.mjs';


test('Chord Progression root insertion exposes touch chord editing, limits, duration, collapse and sockets',()=>{
 const keys=['document','window','CustomEvent','requestAnimationFrame','cancelAnimationFrame'];
 const before=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));
 Object.assign(globalThis,{...dom(),CustomEvent,requestAnimationFrame:()=>1,cancelAnimationFrame(){}});
 const model=createConnectionModel(),structures=createStructureToyModel(model),viewport=new Node();
 model.registerObject('A');model.registerObject('H',{ports:HEARTBEAT_PORTS,transportId:'H'});
 const edge=model.connect('transport',{objectId:'H',portId:'output'},{objectId:'A',portId:'input'}).connection;
 let flash=0;
 const view=createConnectionView({model,structureToys:structures,getPanels:()=>[{id:'A'}],
 getContext:()=>({viewportEl:viewport,transform:{scale:.5,tx:0,ty:0}}),getToyPoint:()=>({x:600,y:100}),
 getHeartbeatPoint:()=>({x:0,y:100}),getStructurePulse:()=>flash});
 try {
 view.render();walk(viewport,n=>n.getAttribute('class')==='connection-midpoint')[0].dispatchEvent(event('pointerdown'));
 const menu=walk(viewport,n=>n.className==='connection-menu')[0],choice=menu.children.find(n=>n.textContent==='Chord Progression');
 assert.equal(choice.className,'modifier-choice');choice.dispatchEvent(event('click'));
 const m=structures.list()[0],card=walk(viewport,n=>n.getAttribute('id')===m.id)[0];
 assert.equal(card.getAttribute('data-node-kind'),'modifier');assert.equal(model.get(edge.id).from.objectId,m.id);
 const control=label=>walk(card,n=>n.getAttribute('aria-label')===label)[0];
 const click=label=>walk(card,n=>n.tagName==='button'&&n.textContent===label)[0].dispatchEvent(event('click'));
 assert.equal(control('Chord 1 root').children.length,12);assert.equal(control('Chord 1 quality').children.length,2);
 assert.equal(control('Chord step duration').children.length,4);
 control('Chord 2 root').value='F#';control('Chord 2 root').dispatchEvent(event('change'));
 control('Chord 2 quality').value='major';control('Chord 2 quality').dispatchEvent(event('change'));
 assert.deepEqual(structures.get(m.id).chords[1],{root:'F#',quality:'major'});
 for(let i=0;i<4;i++)click('Add chord');assert.equal(structures.get(m.id).chords.length,8);
 assert.equal(walk(card,n=>n.textContent==='Add chord')[0].disabled,true);
 for(let i=8;i>1;i--)click('Remove '+i);assert.equal(structures.get(m.id).chords.length,1);
 assert.equal(walk(card,n=>n.textContent==='Remove 1')[0].disabled,true);
 control('Chord step duration').value='768';control('Chord step duration').dispatchEvent(event('change'));
 assert.equal(structures.get(m.id).stepTicks,768);assert.equal(walk(card,n=>n.getAttribute('class')==='structure-activation')[0].getAttribute('opacity'),'0');
 const object=walk(card,n=>n.getAttribute('class')==='chord-progression-editor')[0];
 assert.ok(object.getAttribute('transform').includes('scale(0.5)'));assert.equal(object.getAttribute('width'),'336');
 control('Collapse structure').dispatchEvent(event('pointerdown'));
 assert.equal(card.getAttribute('data-collapsed'),'true');assert.equal(object.getAttribute('display'),'none');
 assert.ok(card.children.some(n=>n.textContent==='Chords: C'));assert.ok(card.children.some(n=>n.textContent==='2 bars'));
 assert.equal(walk(viewport,n=>n.getAttribute('data-object-id')===m.id&&n.getAttribute('data-port-id')).length,2);
 card.children[0].dispatchEvent(event('keydown',0,0,{key:'Enter'}));assert.equal(structures.get(m.id).collapsed,false);
 flash=1;view.render();assert.equal(walk(card,n=>n.getAttribute('class')==='structure-activation')[0].getAttribute('opacity'),'1');
 }finally{view.dispose();structures.dispose();for(const[k,v]of Object.entries(before)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
});
