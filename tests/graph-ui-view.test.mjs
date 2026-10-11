import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createConnectionModel,HEARTBEAT_PORTS} from '../src/connections.js';
import {createStructureToyModel} from '../src/structure-toys.js';
import {createConnectionView} from '../src/connection-view.js';
import {Node,walk,dom,CustomEvent,event} from './graph-ui-dom.mjs';
const input=objectId=>({objectId,portId:'input'}),out=(objectId,portId='output')=>({objectId,portId});
test('Timeline bars and Transpose duration use the source pattern, excluding its separate authored chain',()=>{
 const model=createConnectionModel();model.registerObject('source');model.registerObject('tail');model.connect('sequence',out('source'),input('tail'));
 const structures=createStructureToyModel(model,{getDuration:id=>id==='source'?384:768});
 try{
  const timeline=structures.createStandalone('timeline'),transpose=structures.createStandalone('transpose');
  for(const s of [timeline,transpose])model.connect('sequence',out(s.id,'child:0'),{objectId:'source',portId:'pattern'});
  assert.equal(structures.getTimelineEntries(timeline.id)[0].durationTicks,384);assert.equal(structures.durationOf(transpose.id),384);
  assert.equal(structures.durationOf('source'),1152);
 }finally{structures.dispose();}
});
function setup(fn,{world=false}={}){const keys=['document','window','requestAnimationFrame','cancelAnimationFrame','CustomEvent'],before=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));Object.assign(globalThis,{...dom(),CustomEvent,requestAnimationFrame:()=>1,cancelAnimationFrame(){}});let view,structures;try{const model=createConnectionModel(),viewport=new Node(),worldEl=world?new Node():null,transform={scale:1,tx:0,ty:0},panels=['A','B','C'].map((id,i)=>({id,x:300+i*600}));for(const p of panels)model.registerObject(p.id);model.registerObject('H',{ports:HEARTBEAT_PORTS,transportId:'H'});structures=createStructureToyModel(model);const pulses=new Set(),sourcePulses=new Map(),adds=[];view=createConnectionView({model,structureToys:structures,getPanels:()=>panels,getContext:()=>({viewportEl:viewport,worldEl,transform}),getToyPoint:(p,side)=>({x:p.x+(side==='right'?200:0),y:250}),getHeartbeatPoint:()=>({x:0,y:250}),getPulse:c=>pulses.has(c.id),getStructurePulse:id=>sourcePulses.get(id)||0,onQuickAdd:p=>adds.push(p)});fn({model,structures,view,viewport,worldEl,transform,panels,pulses,sourcePulses,adds});}finally{view?.dispose();structures?.dispose();for(const [k,v]of Object.entries(before)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}}
test('empty toy and Structure outputs share Extend layers; occupied endpoints retain cable gestures and all edges share pulse weight',()=>setup(({model,structures,view,viewport,pulses,adds})=>{
 const s=structures.createStandalone('sequence',{x:900,y:200});const connections=[model.connect('transport',out('H'),input('A')).connection,model.connect('sequence',out('A'),input(s.id)).connection,model.connect('sequence',out(s.id,'child:0'),input('B')).connection];view.render();
 const port=(id,p)=>walk(viewport,n=>n.getAttribute('data-object-id')===id&&n.getAttribute('data-port-id')===p)[0];
 for(const [id,p]of [['B','output'],[s.id,'child:1']]){const circle=port(id,p),fo=circle.parentNode.children.find(n=>n.tagName==='foreignObject'),button=fo.children[0];assert.equal(fo.getAttribute('display'),'inline');assert.equal(button.classList.contains('c-btn'),true);assert.ok(button.style.cssText.includes('T_ButtonExtend.png'));assert.deepEqual(button.children.map(n=>n.className),['c-btn-outer','c-btn-glow','c-btn-core','graph-endpoint-overlay']);assert.equal(circle.getAttribute('display'),'none');button.dispatchEvent(event('pointerdown',700,250,{pointerType:'touch'}));assert.equal(model.getEditing().fixed.objectId,id);const svg=walk(viewport,n=>n.tagName==='svg')[0];svg.dispatchEvent(event('pointerup',700,250,{pointerType:'touch'}));assert.equal(adds.at(-1).objectId,id);}
 const occupied=port(s.id,'child:0');assert.equal(occupied.getAttribute('display'),'none');const occupiedButton=occupied.parentNode.children.find(n=>n.tagName==='foreignObject').children[0];assert.ok(occupiedButton.style.cssText.includes('T_ButtonEmpty.png'));occupiedButton.dispatchEvent(event('pointerdown'));assert.equal(model.getEditing().connectionId,connections[2].id);model.cancelDrag();
 for(const edge of connections){const group=walk(viewport,n=>n.getAttribute('data-connection-id')===edge.id&&n.children.some(c=>c.getAttribute('class')==='connection-path'))[0];const path=group.children.find(c=>c.getAttribute('class')==='connection-path');assert.equal(path.getAttribute('stroke-width'),'6');pulses.add(edge.id);view.render();assert.equal(path.getAttribute('stroke-width'),'10');assert.equal(path.getAttribute('stroke'),'#f5fbff');assert.equal(group.children.find(c=>c.getAttribute('class')==='connection-transition').getAttribute('display'),'inline');pulses.delete(edge.id);view.render();}
 const css=document.head.children[0].textContent;assert.doesNotMatch(css,/transport .*stroke-dasharray/);
 const buttonCss=readFileSync(new URL('../circular-button.css',import.meta.url),'utf8');assert.match(buttonCss,/\.c-btn:hover \.c-btn-glow/);assert.match(buttonCss,/\.c-btn:active \.c-btn-core::after/);
}));
test('Heartbeat midpoint presents all Structure insertions and promotes the root instead of leaving a parallel wire',()=>setup(({model,structures,view,viewport})=>{
 const edge=model.connect('transport',out('H'),input('A')).connection;view.render();const midpoint=walk(viewport,n=>n.getAttribute('class')==='connection-midpoint'&&n.parentNode.getAttribute('data-connection-id')===edge.id)[0];midpoint.dispatchEvent(event('pointerdown'));const menu=walk(viewport,n=>n.className==='connection-menu')[0];assert.deepEqual(menu.children.map(n=>n.textContent),['Sequence','Together','Repeat','Advanced >','Disconnect']);menu.children[0].dispatchEvent(event('click'));const s=structures.list()[0];assert.equal(model.getParent(s.id).from.objectId,'H');assert.equal(model.getParent('A').from.objectId,s.id);assert.equal(model.list('transport').length,1);assert.equal(walk(viewport,n=>n.getAttribute('aria-label')==='Connection options').length,2);
}));

test('all endpoints share visible and touch hit diameters, Empty artwork and centered socket overlays',()=>setup(({model,structures,view,viewport})=>{
 const s=structures.createStandalone('sequence');
 model.connect('transport',out('H'),input('A'));model.connect('sequence',out('A'),input(s.id));model.connect('sequence',out(s.id,'child:0'),input('B'));view.render();
 for(const circle of walk(viewport,n=>n.getAttribute('data-port-id'))){
  const group=circle.parentNode,hit=group.children[0],fo=group.children.find(n=>n.tagName==='foreignObject'),button=fo.children[0];
  assert.equal(circle.getAttribute('r'),'26');assert.equal(hit.getAttribute('r'),'32');assert.equal(fo.getAttribute('width'),'64');assert.ok(button.style.cssText.includes('--c-btn-size:52px'));
  const extending=button.getAttribute('data-extend')==='true';assert.ok(button.style.cssText.includes(extending?'T_ButtonExtend.png':'T_ButtonEmpty.png'));
  assert.equal(button.children.at(-1).className,'graph-endpoint-overlay');
 }
 const socket=walk(viewport,n=>n.getAttribute('data-object-id')===s.id&&n.getAttribute('data-port-id')==='child:0')[0];
 const button=socket.parentNode.children.find(n=>n.tagName==='foreignObject').children[0];assert.equal(button.children.at(-1).textContent,'1');
 const edge=model.getParent('B');button.dispatchEvent(event('pointerdown',0,0,{pointerType:'touch'}));assert.equal(model.getEditing().connectionId,edge.id);assert.equal(model.getEditing().fixed.objectId,'B');model.cancelDrag();
}));
test('Structure border overlay follows traversal feedback and stays idle through selection, collapse and type edits',()=>setup(({structures,view,viewport,sourcePulses})=>{
 const s=structures.createStandalone('sequence');view.render();
 const border=()=>walk(viewport,n=>n.getAttribute('class')==='structure-activation'&&n.parentNode.getAttribute('id')===s.id)[0];
 assert.equal(border().getAttribute('opacity'),'0');structures.setCollapsed(s.id,true);structures.setType(s.id,'together');view.render();assert.equal(border().getAttribute('opacity'),'0');
 sourcePulses.set(s.id,1);view.render();assert.equal(border().getAttribute('opacity'),'1');assert.equal(border().getAttribute('stroke-width'),'8');
 sourcePulses.set(s.id,.125);view.render();assert.equal(border().getAttribute('opacity'),'0.125');
 sourcePulses.clear();view.render();assert.equal(border().getAttribute('opacity'),'0');
}));

test('world SVG and nodes share one camera parent; camera changes leave path geometry and socket coordinates untouched',()=>setup(({model,view,worldEl,transform,panels})=>{
 model.connect('sequence',out('A'),input('B'));view.render();const svg=worldEl.children.find(n=>n.tagName==='svg');assert.ok(svg);
 const wire=walk(svg,n=>n.getAttribute('class')==='connection-path')[0],port=walk(svg,n=>n.getAttribute('data-object-id')==='A'&&n.getAttribute('data-port-id')==='output')[0];
 const original=wire.getAttribute('d'),originalX=port.getAttribute('cx');let writes=0,reads=0;
 const set=wire.setAttribute.bind(wire);wire.setAttribute=(k,v)=>{if(k==='d')writes++;set(k,v);};svg.getBoundingClientRect=()=>{reads++;return {left:100,top:50};};
 for(const camera of [{scale:.5,tx:100,ty:50},{scale:2,tx:-500,ty:900},{scale:1.25,tx:220,ty:-60}]){
  Object.assign(transform,camera);worldEl.style.transform='matrix('+[camera.scale,0,0,camera.scale,camera.tx,camera.ty].join(',')+')';view.render();
  assert.equal(svg.parentNode,worldEl);assert.equal(wire.getAttribute('d'),original);assert.equal(port.getAttribute('cx'),originalX);
 }
 assert.equal(writes,0);assert.equal(reads,0,'camera render needs no client layout reads');
 panels[1].x+=80;view.render();assert.notEqual(wire.getAttribute('d'),original);assert.equal(writes,1,'displayed layout motion still updates cable geometry');
 const midpoint=walk(svg,n=>n.getAttribute('class')==='connection-midpoint')[0];assert.equal(midpoint.getAttribute('r'),'16');assert.equal(midpoint.parentNode.children[0].getAttribute('r'),'28');
},{world:true}));
test('world cable reconnection maps client pointers correctly after pan and zoom',()=>setup(({model,view,worldEl,transform})=>{
 const edge=model.connect('sequence',out('A'),input('B')).connection;Object.assign(transform,{scale:.5,tx:100,ty:50});view.render();
 const svg=worldEl.children.find(n=>n.tagName==='svg');svg.getBoundingClientRect=()=>({left:100,top:50});
 const circle=walk(svg,n=>n.getAttribute('data-object-id')==='B'&&n.getAttribute('data-port-id')==='input')[0],button=circle.parentNode.children.find(n=>n.tagName==='foreignObject').children[0];
 button.dispatchEvent(event('pointerdown',550,175));svg.dispatchEvent(event('pointermove',850,175));
 const path=walk(svg,n=>n.getAttribute('class')==='connection-path')[0];assert.ok(path.getAttribute('d').endsWith('1500 250'));
 svg.dispatchEvent(event('pointerup',850,175));assert.equal(model.get(edge.id).to.objectId,'C');assert.equal(model.get(edge.id).from.objectId,'A');
},{world:true}));
