import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnectionModel, HEARTBEAT_PORTS } from '../src/connections.js';
import { createStructureToyModel } from '../src/structure-toys.js';
import { createConnectionView } from '../src/connection-view.js';
import { Node, walk, dom, CustomEvent, event } from './graph-ui-dom.mjs';

test('Transpose root promotion, touch stepper, collapsed value, sockets, drag and activation border share board conventions',()=>{
  const keys=['document','window','CustomEvent','requestAnimationFrame','cancelAnimationFrame'];
  const before=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
  Object.assign(globalThis,{...dom(),CustomEvent,requestAnimationFrame:()=>1,cancelAnimationFrame(){}});
  const model=createConnectionModel(),structures=createStructureToyModel(model),viewport=new Node();
  model.registerObject('A');model.registerObject('H',{ports:HEARTBEAT_PORTS,transportId:'H'});
  const edge=model.connect('transport',{objectId:'H',portId:'output'},{objectId:'A',portId:'input'}).connection;
  let flash=0;
  const view=createConnectionView({model,structureToys:structures,getPanels:()=>[{id:'A'}],
    getContext:()=>({viewportEl:viewport,transform:{scale:1,tx:0,ty:0}}),getToyPoint:()=>({x:600,y:100}),
    getHeartbeatPoint:()=>({x:0,y:100}),getStructurePulse:()=>flash});
  try {
    view.render();walk(viewport,n=>n.getAttribute('class')==='connection-midpoint')[0].dispatchEvent(event('pointerdown'));
    const menu=walk(viewport,n=>n.className==='connection-menu')[0];
    const choice=menu.children.find(n=>n.textContent==='Transpose');assert.equal(choice.className,'modifier-choice');
    choice.dispatchEvent(event('click'));
    const modifier=structures.list()[0],card=walk(viewport,n=>n.getAttribute('id')===modifier.id)[0];
    assert.equal(card.getAttribute('data-node-kind'),'modifier');
    assert.ok(card.children[0].getAttribute('class').includes('transpose'));
    assert.equal(model.get(edge.id).from.objectId,modifier.id);
    const steps=walk(card,n=>n.getAttribute('class')==='modifier-step');
    assert.equal(steps.length,2);assert.ok(steps.every(n=>n.getAttribute('width')==='44'&&n.getAttribute('height')==='44'));
    for(let i=0;i<5;i++)steps[1].dispatchEvent(event('pointerdown'));
    assert.equal(structures.get(modifier.id).semitones,5);
    assert.equal(walk(card,n=>n.getAttribute('class')==='structure-name modifier-value')[0].textContent,'+5');
    assert.equal(walk(card,n=>n.getAttribute('class')==='structure-activation')[0].getAttribute('opacity'),'0','value editing is not an activation');
    structures.setSemitones(modifier.id,12);view.render();assert.equal(steps[1].getAttribute('aria-disabled'),'true');
    steps[1].dispatchEvent(event('pointerdown'));assert.equal(structures.get(modifier.id).semitones,12);
    structures.setSemitones(modifier.id,5);
    const collapse=walk(card,n=>n.getAttribute('aria-label')==='Collapse structure')[0];collapse.dispatchEvent(event('pointerdown'));
    assert.equal(card.getAttribute('data-collapsed'),'true');
    assert.ok(card.children.some(n=>n.textContent==='Tr +5'));
    assert.equal(walk(viewport,n=>n.getAttribute('data-object-id')===modifier.id&&n.getAttribute('data-port-id')).length,2);
    const svg=walk(viewport,n=>n.tagName==='svg')[0],position=structures.get(modifier.id);
    card.children[0].dispatchEvent(event('pointerdown',10,10));svg.dispatchEvent(event('pointermove',90,30));svg.dispatchEvent(event('pointerup',90,30));
    assert.equal(structures.get(modifier.id).x,position.x+80);assert.equal(structures.get(modifier.id).y,position.y+20);
    card.children[0].dispatchEvent(event('pointerdown',90,30));svg.dispatchEvent(event('pointerup',90,30));
    assert.equal(structures.get(modifier.id).collapsed,false,'click expands a collapsed modifier');
    flash=1;view.render();assert.equal(walk(card,n=>n.getAttribute('class')==='structure-activation')[0].getAttribute('opacity'),'1');
  } finally {view.dispose();structures.dispose();for(const [key,value]of Object.entries(before)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
