import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnectionModel, HEARTBEAT_PORTS } from '../src/connections.js';
import { createConnectionView } from '../src/connection-view.js';
import { MAIN_TRANSPORT_ID } from '../src/transport-registry.js';
import { createStructureToyModel, structureToyWidth,structureToyHeight,STRUCTURE_PORT_RADIUS,STRUCTURE_PLUS_RADIUS,STRUCTURE_PORT_HIT_RADIUS } from '../src/structure-toys.js';
import { clearCreationGraph } from '../src/creation-graph.js';

// Small event/DOM harness executes the real pointer handlers and SVG updates.
class Node {
  constructor(tag = 'div') { this.tagName = tag; this.attrs = new Map(); this.children = []; this.handlers = new Map(); this.style = {}; }
  getAttribute(k) { return this.attrs.get(k) ?? null; }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  append(...nodes) { for (const node of nodes) { node.remove(); node.parentNode = this; this.children.push(node); } }
  replaceChildren(...nodes) { for (const child of [...this.children]) child.remove(); this.append(...nodes); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(n => n !== this); this.parentNode = null; }
  addEventListener(k, fn) { let list = this.handlers.get(k); if (!list) this.handlers.set(k, list = new Set()); list.add(fn); }
  removeEventListener(k, fn) { this.handlers.get(k)?.delete(fn); }
  dispatchEvent(e) { for (const fn of this.handlers.get(e.type) ?? []) fn(e); }
  getBoundingClientRect() { return { left: 0, top: 0 }; }
  setPointerCapture() {}
}
const walk = (root, predicate) => [root, ...root.children.flatMap(n => walk(n, () => true))].filter(predicate);
const event = (type, x, y) => ({ type, button: 0, pointerId: 1, clientX: x, clientY: y, preventDefault() {}, stopPropagation() {} });


function editCard(node,x,y){tapCard(node,x,y);node.parentNode.children.find(n=>n.getAttribute('aria-label')==='Change structure type').dispatchEvent(event('pointerdown',x,y));}
function tapCard(node,x,y){node.dispatchEvent(event('pointerdown',x,y));let svg=node;while(svg&&svg.tagName!=='svg')svg=svg.parentNode;svg.dispatchEvent(event('pointerup',x,y));}

for (const [sourceStructure,targetStructure] of [[false,false],[false,true],[true,false],[true,true]]) {
  test(`${sourceStructure?'Structure':'toy'} → ${targetStructure?'Structure':'toy'} midpoint promotes its own relationship atomically`,()=>{
    const original=Object.fromEntries(['document','window','requestAnimationFrame','cancelAnimationFrame','CustomEvent'].map(k=>[k,globalThis[k]]));
    const document=new Node(),window=new Node();document.head=new Node('head');document.createElementNS=(ns,tag)=>new Node(tag);document.createElement=tag=>new Node(tag);
    Object.assign(globalThis,{document,window,requestAnimationFrame:()=>1,cancelAnimationFrame(){},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}}});
    let view,toys;
    try {
      const model=createConnectionModel(),viewport=new Node(),panels=[];
      model.registerObject(MAIN_TRANSPORT_ID,{ports:HEARTBEAT_PORTS,transportId:MAIN_TRANSPORT_ID});
      toys=createStructureToyModel(model);
      const saved=[];
      for(const [id,isStructure,x] of [['A',sourceStructure,100],['B',targetStructure,500]]){
        if(isStructure)saved.push({id,type:'sequence',x,y:200});
        else {panels.push({id,x});model.registerObject(id);}
      }
      toys.restore(saved);model.connect('transport',{objectId:MAIN_TRANSPORT_ID,portId:'output'},{objectId:'A',portId:'input'});
      const from={objectId:'A',portId:sourceStructure?'child:0':'output'},to={objectId:'B',portId:'input'};
      const c=model.connect('sequence',from,to).connection;
      let transform={scale:1,tx:0,ty:0};
      view=createConnectionView({model,structureToys:toys,getPanels:()=>panels,getContext:()=>({viewportEl:viewport,transform}),getToyPoint:(p,side)=>({x:p.x+(side==='right'?100:0),y:200}),getHeartbeatPoint:()=>({x:0,y:40})});view.render();
      const svg=viewport.children.find(n=>n.tagName==='svg'),menu=viewport.children.find(n=>n.className==='connection-menu');
      const midpoint=walk(svg,n=>n.getAttribute('class')==='connection-midpoint'&&n.parentNode.getAttribute('data-connection-id')===c.id)[0];
      const beforePoint={x:Number(midpoint.getAttribute('cx')),y:Number(midpoint.getAttribute('cy'))};
      transform={scale:.5,tx:40,ty:30};view.render();
      assert.equal(Number(midpoint.getAttribute('cx')),beforePoint.x*.5+40);assert.equal(Number(midpoint.getAttribute('cy')),beforePoint.y*.5+30);
      midpoint.dispatchEvent(event('pointerdown',350,200));
      assert.deepEqual(menu.children.map(n=>n.textContent),['Sequence','Together','Repeat','Timeline','Disconnect']);
      const observed=[];const stop=model.subscribe(e=>{if(e.type==='change')observed.push(model.list());});
      menu.children.find(n=>n.textContent==='Together').dispatchEvent({type:'click',stopPropagation(){}});stop();
      const promoted=toys.list().find(s=>!['A','B'].includes(s.id));assert.ok(promoted);assert.equal(promoted.type,'together');
      assert.equal(toys.get('A')?.type,sourceStructure?'sequence':undefined);assert.equal(toys.get('B')?.type,targetStructure?'sequence':undefined);
      assert.deepEqual(model.get(c.id).to,to);assert.equal(model.get(c.id).from.objectId,promoted.id);
      assert.deepEqual(model.getParent(promoted.id).from,from);assert.equal(model.getTransportId('B'),MAIN_TRANSPORT_ID);
      assert.equal(observed.length,1,'observers see only the complete promoted topology');assert.equal(model.list('transport').length,1);
      assert.equal(menu.hidden,true);
      const before=model.snapshot(),count=toys.list().length;
      editCard(walk(svg,n=>n.getAttribute('aria-label')==='Together structure')[0],350,200);
      menu.children.find(n=>n.textContent==='Sequence').dispatchEvent({type:'click',stopPropagation(){}});
      assert.equal(toys.get(promoted.id).type,'sequence');assert.equal(toys.list().length,count);assert.deepEqual(model.list(),before.connections,'body changes only this Structure type');
    } finally {view?.dispose();toys?.dispose();for(const[k,v]of Object.entries(original)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
  });
}

test('shared popup dismisses outside, Escape, replacement, deletion and New Creation; reset cancels interaction state',()=>{
  const original=Object.fromEntries(['document','window','requestAnimationFrame','cancelAnimationFrame','CustomEvent'].map(k=>[k,globalThis[k]]));
  const document=new Node(),window=new Node();document.head=new Node('head');document.createElementNS=(ns,tag)=>new Node(tag);document.createElement=tag=>new Node(tag);
  Object.assign(globalThis,{document,window,requestAnimationFrame:()=>1,cancelAnimationFrame(){},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}}});
  let view,toys;
  try {
    const model=createConnectionModel(),viewport=new Node();toys=createStructureToyModel(model);
    toys.restore([{id:'S',type:'sequence',x:100,y:100},{id:'R',type:'repeat',x:400,y:100}]);
    view=createConnectionView({model,structureToys:toys,getPanels:()=>[],getContext:()=>({viewportEl:viewport,transform:{scale:1,tx:0,ty:0}}),getToyPoint:()=>null,getHeartbeatPoint:()=>({x:0,y:0})});view.render();
    const svg=viewport.children.find(n=>n.tagName==='svg'),menu=viewport.children.find(n=>n.className==='connection-menu');
    const card=id=>walk(svg,n=>n.getAttribute('role')==='button'&&n.parentNode?.getAttribute('data-structure-id')===id)[0];
    const open=id=>editCard(card(id),100,100);
    open('S');document.dispatchEvent({type:'pointerdown',target:menu.children[0]});assert.equal(menu.hidden,false);
    document.dispatchEvent({type:'pointerdown',target:new Node()});assert.equal(menu.hidden,true);
    open('S');document.dispatchEvent({type:'keydown',key:'Escape'});assert.equal(menu.hidden,true);
    open('S');open('R');assert.equal(menu.children.filter(n=>n.getAttribute('aria-label')==='Repeat count').length,1);
    toys.remove('R');assert.equal(menu.hidden,true);
    open('S');const port=walk(svg,n=>n.getAttribute('data-object-id')==='S'&&n.getAttribute('data-port-id')==='child:0')[0];
    port.dispatchEvent(event('pointerdown',244,126));assert.equal(menu.hidden,true);assert.ok(model.getEditing());
    view.reset();clearCreationGraph({model,structures:toys,sequence:{reset(){}},adapter:{sync(){}}});view.render();
    assert.equal(menu.hidden,true);assert.equal(model.getEditing(),null);assert.equal(walk(svg,n=>n.getAttribute('class')==='connection-preview')[0].getAttribute('display'),'none');
    assert.equal(walk(svg,n=>n.getAttribute('data-structure-id')).length,0);
    // No retained owner when a restored scene reuses the same object ID.
    toys.restore([{id:'S',type:'sequence',x:100,y:100}]);view.render();assert.equal(menu.hidden,true);
    view.dispose();view=null;assert.equal(document.handlers.get('pointerdown').size,0);
  }finally{view?.dispose();toys?.dispose();for(const[k,v]of Object.entries(original)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
});

test('shared SVG pointer engine connects, reconnects, deletes, preserves fan-out sockets and cleans listeners', () => {
  const original = Object.fromEntries(['document','window','requestAnimationFrame','cancelAnimationFrame','CustomEvent'].map(k => [k, globalThis[k]]));
  const document = new Node(), window = new Node();
  document.head = new Node('head'); document.createElementNS = (ns, tag) => new Node(tag); document.createElement = tag => new Node(tag);
  Object.assign(globalThis, { document, window, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } } });
  let view;
  try {
    const viewport = new Node();
    const model = createConnectionModel();
    const panels = [{id:'A',x:100},{id:'B',x:300},{id:'C',x:500}];
    for (const p of panels) model.registerObject(p.id);
    model.registerObject(MAIN_TRANSPORT_ID,{ports:HEARTBEAT_PORTS});
    let transform = {scale:1,tx:0,ty:0};
    const selection = [], quickAdds = []; document.addEventListener('connection:selected', e => selection.push(e.detail));
    view = createConnectionView({ model, getPanels:()=>panels, getContext:()=>({viewportEl:viewport,transform}),
      getToyPoint:(p,side)=>({x:p.x+(side==='right'?100:0),y:200}), getHeartbeatPoint:()=>({x:0,y:40}), onQuickAdd:point=>quickAdds.push(point) });
    view.render();
    const svg = viewport.children.find(n=>n.tagName==='svg');
    assert.equal(svg.style.overflow,'visible','only the board viewport clips sockets after native scrolling');
    const port = (id,side) => walk(svg,n=>n.getAttribute('data-object-id')===id && n.getAttribute('data-port-id')===side)[0];

    const drag = (source,x,y,targetX,targetY) => {
      source.dispatchEvent(event('pointerdown',x,y));
      svg.dispatchEvent(event('pointermove',targetX,targetY));
      svg.dispatchEvent(event('pointerup',targetX,targetY));
    };
    drag(port('A','output'),200,200,300,200);
    const connection = model.list('sequence')[0];
    assert.equal(connection.to.objectId,'B');
    const midpoint = walk(svg,n=>n.getAttribute('class')==='connection-midpoint')[0];
    const path = walk(svg,n=>n.getAttribute('class')==='connection-path')[0];
    assert.ok(svg.children.indexOf(midpoint.parentNode.parentNode) > svg.children.indexOf(path.parentNode.parentNode), 'crossing paths cannot intercept midpoint selection');
    view.select(connection.id);
    assert.deepEqual(selection.at(-1),{id:connection.id,kind:'sequence'});
    assert.equal(walk(svg,n=>n.getAttribute('class')==='connection-handle').length,0);
    drag(port('B','input'),300,200,500,200);
    assert.equal(model.get(connection.id).to.objectId,'C');
    assert.equal(model.list().length,1);
    // A tap on an occupied socket keeps its relationship.
    drag(port('A','output'),500,226,500,226);
    assert.ok(model.get(connection.id));
    const before = model.snapshot();
    transform={scale:.5,tx:20,ty:30}; panels[0].x=120; view.render();
    assert.equal(port('A','output').getAttribute('cx'),'130');
    assert.deepEqual(model.snapshot(),before);
    drag(port('A','output'),270,156,900,500);
    assert.equal(model.list().length,0);
    // Even while the newly made wire is selected, output remains a fan-out socket.
    // Native viewport scrolling moves SVG relative to the container's rectangle.
    svg.getBoundingClientRect = () => ({ left: -41, top: 0 });
    const hb = port(MAIN_TRANSPORT_ID,'output');
    drag(hb,31,50,129,130);
    drag(hb,31,50,229,130);
    assert.equal(model.list('transport').length,2);
    assert.equal(model.list('sequence').length,0);
    // The port layer sits above paths; a selected wire never intercepts unrelated sockets.

    for(const id of ['A','B','C'])for(const side of ['input','output']){
      const circle=port(id,side);
      assert.ok(circle,'both endpoint circles are always rendered');
      assert.equal(circle.getAttribute('r'),'6','socket radius follows board zoom');
      assert.notEqual(circle.getAttribute('display'),'none');
    }
    assert.equal(port('C','input').getAttribute('data-connected'),'true');
    drag(port('C','input'),229,130,129,130);
    assert.equal(model.getParent('C'),null,'grabbed input is detached');
    assert.equal(model.getParent('B').from.objectId,MAIN_TRANSPORT_ID,'opposite Heartbeat end remains attached');
    assert.deepEqual(quickAdds,[], 'connector drags never quick-create');
    const cOutput=port('C','output');
    cOutput.dispatchEvent(event('pointerdown',270,130));
    svg.dispatchEvent(event('pointerup',271,131));
    assert.deepEqual(quickAdds,[{objectId:'C',portId:'output'}]);
    cOutput.dispatchEvent(event('pointerdown',270,130));
    svg.dispatchEvent(event('pointermove',350,130));
    svg.dispatchEvent(event('pointerup',270,130));
    assert.equal(quickAdds.length,1,'a drag returning to its origin is still a drag');
    view.dispose(); view=null;
    assert.equal(viewport.children.length,0);
    assert.equal(window.handlers.get('blur').size,0);
    assert.equal(document.handlers.get('keydown').size,0);
  } finally {
    view?.dispose();
    for (const [key,value] of Object.entries(original)) {
      if (value===undefined) delete globalThis[key]; else globalThis[key]=value;
    }
  }
});

test('Timeline bars drag and snap in tick space; lossy conversion requires the explicit UI choice',()=>{
  const original=Object.fromEntries(['document','window','requestAnimationFrame','cancelAnimationFrame','CustomEvent'].map(k=>[k,globalThis[k]]));
  const document=new Node(),window=new Node();document.head=new Node('head');document.createElementNS=(ns,tag)=>new Node(tag);document.createElement=tag=>new Node(tag);
  Object.assign(globalThis,{document,window,requestAnimationFrame:()=>1,cancelAnimationFrame(){},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}}});
  let view,toys;
  try {
    const model=createConnectionModel(),viewport=new Node(),panels=[{id:'A',x:0},{id:'B',x:500},{id:'C',x:700}];
    panels.forEach(p=>model.registerObject(p.id));toys=createStructureToyModel(model,{getDuration:()=>384});
    const edge=model.connect('sequence',{objectId:'A',portId:'output'},{objectId:'B',portId:'input'}).connection;
    const s=toys.promote(edge.id,'timeline');model.connect('sequence',{objectId:s.id,portId:'child:1'},{objectId:'C',portId:'input'});
    view=createConnectionView({model,structureToys:toys,getPanels:()=>panels,getContext:()=>({viewportEl:viewport,transform:{scale:.5,tx:0,ty:0}}),getToyPoint:(p,side)=>({x:p.x+(side==='right'?100:0),y:200}),getHeartbeatPoint:()=>({x:0,y:0})});view.render();
    const svg=viewport.children.find(n=>n.tagName==='svg'),bar=walk(svg,n=>n.getAttribute('data-entry-port')==='child:1')[0];
    const timelineCard=walk(svg,n=>n.getAttribute('aria-label')==='Timeline structure')[0];
    assert.equal(Number(timelineCard.getAttribute('width')),structureToyWidth(toys.get(s.id))*.5);
    assert.equal(Number(timelineCard.parentNode.children.find(n=>n.getAttribute('class')==='structure-name').getAttribute('font-size')),9,'Structure text scales with the board without a separate font floor');
    // 768 ticks span 236 world pixels; at half zoom, 15 pixels move one beat.
    bar.dispatchEvent(event('pointerdown',100,100));svg.dispatchEvent(event('pointermove',85,100));svg.dispatchEvent(event('pointerup',85,100));
    assert.equal(toys.get(s.id).entries[1].offsetTick,288);
    assert.equal(bar.getAttribute('aria-valuenow'),'288');
    assert.equal(model.get(edge.id).from.objectId,s.id,'moving a bar never reconnects its wire');
    bar.dispatchEvent({type:'keydown',key:'ArrowLeft',preventDefault(){},stopPropagation(){}});assert.equal(toys.get(s.id).entries[1].offsetTick,192);
    editCard(walk(svg,n=>n.getAttribute('aria-label')==='Timeline structure')[0],100,100);
    const menu=viewport.children.find(n=>n.className==='connection-menu');menu.children.find(n=>n.textContent==='Sequence').dispatchEvent({type:'click',stopPropagation(){}});
    assert.equal(toys.get(s.id).type,'timeline');assert.equal(menu.hidden,false);
    assert.ok(menu.children.some(n=>n.textContent==='Convert to Sequence'));
    menu.children.find(n=>n.textContent==='Keep Timeline').dispatchEvent({type:'click',stopPropagation(){}});assert.equal(toys.get(s.id).type,'timeline');
    editCard(walk(svg,n=>n.getAttribute('aria-label')==='Timeline structure')[0],100,100);menu.children.find(n=>n.textContent==='Sequence').dispatchEvent({type:'click',stopPropagation(){}});
    menu.children.find(n=>n.textContent==='Convert to Sequence').dispatchEvent({type:'click',stopPropagation(){}});assert.equal(toys.get(s.id).type,'sequence');
    assert.equal(walk(svg,n=>n.getAttribute('data-entry-port')==='child:1').length,0);
  } finally {view?.dispose();toys?.dispose();for(const[k,v]of Object.entries(original)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
});

test('midpoint relationship menu promotes Together, switches the same card and exposes dynamic shared child sockets', () => {
  const original = Object.fromEntries(['document','window','requestAnimationFrame','cancelAnimationFrame','CustomEvent'].map(k => [k, globalThis[k]]));
  const document = new Node(), window = new Node();
  document.head = new Node('head'); document.createElementNS = (ns,tag) => new Node(tag); document.createElement = tag => new Node(tag);
  Object.assign(globalThis,{document,window,requestAnimationFrame:()=>1,cancelAnimationFrame(){},CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}}});
  let view, toys;
  try {
    const model=createConnectionModel(),viewport=new Node();
    const panels=[{id:'A',x:100},{id:'B',x:500},{id:'C',x:700}];
    for(const p of panels)model.registerObject(p.id);
    model.registerObject(MAIN_TRANSPORT_ID,{ports:HEARTBEAT_PORTS});
    const toyPoint=(p,side)=>({x:p.x+(side==='right'?100:0),y:200});
    toys=createStructureToyModel(model,{getPosition:point=>toyPoint(panels.find(p=>p.id===point.objectId),point.portId==='input'?'left':'right')});
    const edge=model.connect('sequence',{objectId:'A',portId:'output'},{objectId:'B',portId:'input'}).connection;
    view=createConnectionView({model,structureToys:toys,getPanels:()=>panels,getContext:()=>({viewportEl:viewport,transform:{scale:1,tx:0,ty:0}}),getToyPoint:toyPoint,getHeartbeatPoint:()=>({x:0,y:40})});
    view.render(); view.select(edge.id);
    const menu=viewport.children.find(n=>n.className==='connection-menu');
    assert.equal(menu.hidden,false);
    assert.deepEqual(menu.children.map(n=>n.textContent),['Sequence','Together','Repeat','Timeline','Disconnect']);
    menu.children.find(n=>n.textContent==='Sequence').dispatchEvent({type:'click',stopPropagation(){}});
    const explicit=toys.list()[0];
    assert.equal(explicit.type,'sequence');assert.equal(explicit.provenance,'explicit');
    assert.equal(walk(viewport,n=>n.getAttribute('aria-label')==='Sequence structure').length,1);
    assert.equal(model.get(edge.id).from.objectId,explicit.id);
    editCard(walk(viewport,n=>n.getAttribute('aria-label')==='Sequence structure')[0],350,200);
    menu.children.find(n=>n.textContent==='Together').dispatchEvent({type:'click',stopPropagation(){}});
    const s=toys.list()[0],svg=viewport.children.find(n=>n.tagName==='svg');
    assert.equal(s.type,'together');assert.equal(menu.hidden,true);
    assert.equal(walk(svg,n=>n.getAttribute('aria-label')==='Together structure').length,1);
    const ports=()=>walk(svg,n=>n.getAttribute('data-object-id')===s.id);
    assert.ok(structureToyWidth(s)>=224);assert.ok(structureToyHeight(s)>=128);
    const plus=ports().find(n=>n.getAttribute('data-port-id')==='child:1'),inputPort=ports().find(n=>n.getAttribute('data-port-id')==='input');
    assert.equal(Number(plus.getAttribute('r')),STRUCTURE_PLUS_RADIUS);assert.equal(Number(inputPort.getAttribute('r')),STRUCTURE_PORT_RADIUS);
    assert.equal(Number(plus.parentNode.children[0].getAttribute('r')),STRUCTURE_PORT_HIT_RADIUS);
    assert.ok(STRUCTURE_PORT_HIT_RADIUS>STRUCTURE_PLUS_RADIUS);assert.ok(STRUCTURE_PLUS_RADIUS>=22);
    assert.deepEqual(ports().map(n=>n.getAttribute('data-port-id')),['input','child:0','child:1']);
    model.connect('sequence',{objectId:s.id,portId:'child:1'},{objectId:'C',portId:'input'});view.render();
    assert.equal(ports().length,4,'a new empty output becomes available');
    const card=walk(svg,n=>n.getAttribute('aria-label')==='Together structure')[0];
    editCard(card,350,200);
    menu.children.find(n=>n.textContent==='Sequence').dispatchEvent({type:'click',stopPropagation(){}});
    assert.equal(toys.list().length,1);assert.equal(toys.get(s.id).type,'sequence');
    assert.equal(walk(svg,n=>n.getAttribute('aria-label')==='Sequence structure').length,1);
    assert.equal(model.get(edge.id).to.objectId,'B');
    assert.equal(model.list('sequence').length,3);
    editCard(card,350,200);
    menu.children.find(n=>n.textContent==='Repeat').dispatchEvent({type:'click',stopPropagation(){}});
    assert.equal(toys.get(s.id).type,'repeat');assert.equal(toys.get(s.id).count,2);
    assert.equal(toys.list().length,2,'conversion preserves the old multi-child Sequence as a nested child');
    assert.equal(walk(svg,n=>n.getAttribute('aria-label')==='Repeat structure').length,1);
    assert.equal(walk(svg,n=>n.getAttribute('data-object-id')===s.id).length,2,'Repeat has input and just one child socket');
    const repeatCard=walk(svg,n=>n.getAttribute('aria-label')==='Repeat structure')[0];
    editCard(repeatCard,350,200);
    const count=menu.children.find(n=>n.getAttribute('aria-label')==='Repeat count');
    assert.equal(count.value,'2');count.value='4';count.dispatchEvent({type:'change'});
    assert.equal(toys.get(s.id).count,4);
    assert.equal(walk(svg,n=>n.textContent==='× 4').length,1);
  } finally {
    view?.dispose();toys?.dispose();
    for(const [key,value] of Object.entries(original)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
  }
});

test('Structure cards, sockets, plus hit regions and wires share interpolated geometry; drag takes over display',async()=>{
  const {createGraphLayoutAnimation}=await import('../src/graph-layout-animation.js');
  const original=Object.fromEntries(['document','window','requestAnimationFrame','cancelAnimationFrame','CustomEvent'].map(k=>[k,globalThis[k]]));
  const document=new Node(),window=new Node();document.head=new Node('head');document.createElementNS=(ns,tag)=>new Node(tag);document.createElement=tag=>new Node(tag);
  Object.assign(globalThis,{document,window,requestAnimationFrame:()=>1,cancelAnimationFrame(){},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}}});
  let view,toys;
  try{
    const model=createConnectionModel(),viewport=new Node();toys=createStructureToyModel(model);
    toys.restore([{id:'S',type:'sequence',x:100,y:100}]);model.registerObject('B');
    model.connect('sequence',{objectId:'S',portId:'child:0'},{objectId:'B',portId:'input'});
    let time=0;const animation=createGraphLayoutAnimation({now:()=>time});
    animation.move('S',{x:100,y:100},{x:300,y:200});toys.move('S',300,200,{manual:false});
    view=createConnectionView({model,structureToys:toys,getPanels:()=>[{id:'B'}],getContext:()=>({viewportEl:viewport,transform:{scale:1,tx:0,ty:0}}),getToyPoint:()=>({x:700,y:250}),getHeartbeatPoint:()=>({x:0,y:0}),getRenderedStructure:s=>({...s,...animation.position(s.id,s)}),onStructureDrag:id=>{const current=animation.cancel(id);toys.move(id,current.x,current.y,{manual:false});}});
    time=100;animation.tick();view.render();
    const svg=viewport.children.find(n=>n.tagName==='svg'),card=walk(svg,n=>n.getAttribute('class')==='structure-card sequence')[0];
    assert.equal(Number(card.getAttribute('x')),275);assert.equal(Number(card.getAttribute('y')),187.5);
    const socket=walk(svg,n=>n.getAttribute('data-object-id')==='S'&&n.getAttribute('data-port-id')==='child:0')[0];
    assert.equal(Number(socket.getAttribute('cx')),275+structureToyWidth(toys.get('S')));
    const wire=walk(svg,n=>n.getAttribute('class')==='connection-path')[0];assert.ok(wire.getAttribute('d').startsWith('M '+socket.getAttribute('cx')+' '+socket.getAttribute('cy')));
    const handle=walk(svg,n=>n.getAttribute('aria-label')==='Move structure')[0];
    assert.ok(handle,'move region exists');handle.dispatchEvent(event('pointerdown',280,200));assert.equal(animation.has('S'),false);assert.equal(toys.get('S').x,275);
    svg.dispatchEvent(event('pointermove',300,220));assert.equal(toys.get('S').x,295);assert.equal(toys.get('S').positionSource,'manual');
  }finally{view?.dispose();toys?.dispose();for(const[k,v]of Object.entries(original)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
});



test('collapsed Structures keep connecting and quick-add; selection expands, outside collapse respects active gestures',async()=>{
 const {createGraphBranchDrag}=await import('../src/graph-branch-drag.js');
 const {createGraphPlacement}=await import('../src/graph-placement.js');
 const original=Object.fromEntries(['document','window','requestAnimationFrame','cancelAnimationFrame','CustomEvent'].map(k=>[k,globalThis[k]]));
 const document=new Node(),window=new Node();document.head=new Node('head');document.createElementNS=(ns,tag)=>new Node(tag);document.createElement=tag=>new Node(tag);
 Object.assign(globalThis,{document,window,requestAnimationFrame:()=>1,cancelAnimationFrame(){},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}}});
 let view,toys;
 try{
  const model=createConnectionModel(),viewport=new Node(),panels=[{id:'A',x:0,y:150},{id:'B',x:600,y:150},{id:'D',x:0,y:350}];
  for(const panel of panels)model.registerObject(panel.id);
  toys=createStructureToyModel(model);toys.restore([{id:'S',type:'together',x:300,y:100,collapsed:true},{id:'R',type:'repeat',x:900,y:300,count:4,collapsed:true}]);
  const edge=(a,b,port='output')=>model.connect('sequence',{objectId:a,portId:port},{objectId:b,portId:'input'});
  edge('A','S');edge('S','B','child:0');
  const get=id=>toys.get(id)||panels.find(p=>p.id===id),layout=createGraphPlacement({model,getRect:id=>({...get(id),width:100,height:100})});
  const drag=createGraphBranchDrag({descendants:layout.descendants,getPosition:get,setPosition:(id,x,y,{manual})=>{if(toys.get(id))toys.move(id,x,y,{manual});else Object.assign(get(id),{x,y});}});
  let added=0;
  view=createConnectionView({model,structureToys:toys,getPanels:()=>panels,getContext:()=>({viewportEl:viewport,transform:{scale:1,tx:0,ty:0}}),getToyPoint:(p,side)=>({x:p.x+(side==='right'?100:0),y:p.y}),getHeartbeatPoint:()=>({x:-100,y:0}),onStructureDrag:id=>drag.start(id),onStructureMove:(id,x,y)=>drag.move(id,x,y),onStructureDragEnd:()=>drag.end(),onQuickAdd:point=>{const p={id:'new'+(++added),x:600,y:500};panels.push(p);model.registerObject(p.id);assert.equal(edge(point.objectId,p.id,point.portId).ok,true);}});
  view.render();const svg=viewport.children.find(n=>n.tagName==='svg'),menu=viewport.children.find(n=>n.className==='connection-menu');
  const card=id=>walk(svg,n=>n.getAttribute('class')?.startsWith('structure-card')&&n.parentNode.getAttribute('data-structure-id')===id)[0];
  const port=(id,which)=>walk(svg,n=>n.getAttribute('data-object-id')===id&&n.getAttribute('data-port-id')===which)[0];
  const d=port('D','output');d.dispatchEvent(event('pointerdown',100,350));assert.ok(model.getEditing());assert.equal(toys.get('S').collapsed,true);
  const input=port('S','input');svg.dispatchEvent(event('pointermove',Number(input.getAttribute('cx')),Number(input.getAttribute('cy'))));svg.dispatchEvent(event('pointerup',Number(input.getAttribute('cx')),Number(input.getAttribute('cy'))));assert.equal(model.getParent('S').from.objectId,'D');assert.equal(toys.get('S').collapsed,true);
  const plus=port('S','child:1');plus.dispatchEvent(event('pointerdown',428,196));svg.dispatchEvent(event('pointerup',428,196));assert.equal(added,1);assert.equal(toys.get('S').collapsed,true);assert.ok(port('S','child:2'));
  tapCard(card('S'),320,120);assert.equal(toys.get('S').collapsed,false);assert.equal(menu.hidden,true);
  tapCard(card('S'),320,120);assert.equal(menu.hidden,true);
  card('S').dispatchEvent(event('pointerdown',320,120));
  document.dispatchEvent({type:'pointerdown',target:new Node()});assert.equal(toys.get('S').collapsed,false,'drag gesture protects expansion');
  svg.dispatchEvent(event('pointermove',370,160));assert.equal(toys.get('S').x,350);assert.equal(get('B').x,650);assert.equal(get('A').x,0);assert.equal(toys.get('S').positionSource,'manual');
  svg.dispatchEvent(event('pointerup',370,160));document.dispatchEvent({type:'pointerdown',target:new Node()});assert.equal(toys.get('S').collapsed,true);
  card('S').dispatchEvent(event('pointerdown',370,160));svg.dispatchEvent(event('pointerup',370,160));assert.equal(toys.get('S').collapsed,false);
  editCard(card('S'),370,160);assert.equal(menu.hidden,false);assert.ok(!menu.children.some(n=>n.textContent==='Delete structure'));
  document.dispatchEvent({type:'pointerdown',target:menu.children[0]});assert.equal(toys.get('S').collapsed,false,'popup keeps owner expanded');
  card('R').dispatchEvent(event('pointerdown',920,320));svg.dispatchEvent(event('pointerup',920,320));assert.equal(toys.get('S').collapsed,true);assert.equal(toys.get('R').collapsed,false);
  const minimise=walk(svg,n=>n.getAttribute('aria-label')==='Collapse structure'&&n.parentNode.getAttribute('data-structure-id')==='R')[0];minimise.dispatchEvent(event('pointerdown',1000,305));assert.equal(toys.get('R').collapsed,true);
 }finally{view?.dispose();toys?.dispose();for(const[k,v]of Object.entries(original)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
});


test('Structure sockets reconnect occupied children, create from spare, and outside toys/wires collapse selection',()=>{
 const saved=Object.fromEntries(['document','window','requestAnimationFrame','cancelAnimationFrame','CustomEvent'].map(k=>[k,globalThis[k]]));
 const document=new Node(),window=new Node();document.head=new Node();document.createElementNS=(_,tag)=>new Node(tag);document.createElement=tag=>new Node(tag);
 Object.assign(globalThis,{document,window,requestAnimationFrame:()=>1,cancelAnimationFrame(){},CustomEvent:class{constructor(type,o){this.type=type;this.detail=o.detail;}}});
 let view,toys;
 try{
  const model=createConnectionModel(),viewport=new Node(),panels=[{id:'B',x:600},{id:'C',x:900}];panels.forEach(p=>model.registerObject(p.id));
  toys=createStructureToyModel(model);toys.restore([{id:'S',type:'together',x:100,y:100,collapsed:true},{id:'R',type:'sequence',x:300,y:400,collapsed:true}]);
  const original=model.connect('sequence',{objectId:'S',portId:'child:0'},{objectId:'B',portId:'input'}).connection;
  const drops=[];view=createConnectionView({model,structureToys:toys,getPanels:()=>panels,getContext:()=>({viewportEl:viewport,transform:{scale:1,tx:0,ty:0}}),getToyPoint:p=>({x:p.x,y:200}),getHeartbeatPoint:()=>({x:0,y:0}),onStructureDragEnd:(e,canceled)=>drops.push({e,canceled})});view.render();
  const svg=viewport.children.find(n=>n.tagName==='svg'),menu=viewport.children.find(n=>n.className==='connection-menu');
  const port=(id,p)=>walk(svg,n=>n.getAttribute('data-object-id')===id&&n.getAttribute('data-port-id')===p)[0];
  const card=id=>walk(svg,n=>n.getAttribute('class')?.startsWith('structure-card')&&n.parentNode.getAttribute('id')===id)[0];
  const drag=(n,to)=>{n.dispatchEvent(event('pointerdown',Number(n.getAttribute('cx')),Number(n.getAttribute('cy'))));svg.dispatchEvent(event('pointermove',Number(to.getAttribute('cx')),Number(to.getAttribute('cy'))));svg.dispatchEvent(event('pointerup',Number(to.getAttribute('cx')),Number(to.getAttribute('cy'))));};
  drag(port('S','child:0'),port('R','child:0'));assert.equal(model.get(original.id).from.objectId,'R');assert.equal(model.get(original.id).to.objectId,'B');assert.equal(model.list().length,1);
  drag(port('S','child:1'),port('C','input'));assert.equal(model.list().length,2);assert.equal(model.getParent('C').from.portId,'child:1');
  tapCard(card('S'),130,140);assert.equal(menu.hidden,true);assert.equal(drops.at(-1).canceled,true);
  document.dispatchEvent({type:'pointerdown',target:port('B','input')});assert.equal(toys.get('S').collapsed,true);
  tapCard(card('S'),130,140);document.dispatchEvent({type:'pointerdown',target:walk(svg,n=>n.getAttribute('class')==='connection-path')[0]});assert.equal(toys.get('S').collapsed,true);
  editCard(card('S'),130,140);document.dispatchEvent({type:'pointerdown',target:card('R')});assert.equal(menu.hidden,true);assert.equal(toys.get('S').collapsed,true);tapCard(card('R'),330,440);assert.equal(toys.get('R').collapsed,false);
 }finally{view?.dispose();toys?.dispose();for(const[k,v]of Object.entries(saved)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
});


test('connected sockets pull the original wire from its opposite fixed end; Escape and invalid drops restore',()=>{
 const saved=Object.fromEntries(['document','window','requestAnimationFrame','cancelAnimationFrame','CustomEvent'].map(k=>[k,globalThis[k]]));
 const document=new Node(),window=new Node();document.head=new Node();document.createElementNS=(_,tag)=>new Node(tag);document.createElement=tag=>new Node(tag);
 Object.assign(globalThis,{document,window,requestAnimationFrame:()=>1,cancelAnimationFrame(){},CustomEvent:class{constructor(type,o){this.type=type;this.detail=o.detail;}}});
 let view;
 try{
  const model=createConnectionModel(),viewport=new Node(),panels=[{id:'A',x:100},{id:'B',x:400},{id:'C',x:700}];panels.forEach(p=>model.registerObject(p.id));model.registerObject(MAIN_TRANSPORT_ID,{ports:HEARTBEAT_PORTS,transportId:MAIN_TRANSPORT_ID});
  model.connect('transport',{objectId:MAIN_TRANSPORT_ID,portId:'output'},{objectId:'A',portId:'input'});
  const edge=model.connect('sequence',{objectId:'A',portId:'output'},{objectId:'B',portId:'input'}).connection;
  const changes=[];model.subscribe(e=>{if(e.type==='change')changes.push(e);});let layoutFreezes=0,adds=0;
  view=createConnectionView({model,getPanels:()=>panels,getContext:()=>({viewportEl:viewport,transform:{scale:1,tx:0,ty:0}}),getToyPoint:(p,side)=>({x:p.x+(side==='right'?100:0),y:200}),getHeartbeatPoint:()=>({x:0,y:40}),onConnectionDrag:()=>layoutFreezes++,onQuickAdd:()=>adds++});view.render();
  const svg=viewport.children.find(n=>n.tagName==='svg'),port=(id,p)=>walk(svg,n=>n.getAttribute('data-object-id')===id&&n.getAttribute('data-port-id')===p)[0];
  const wire=()=>walk(svg,n=>n.getAttribute('class')==='connection-path'&&n.parentNode.getAttribute('data-connection-id')===edge.id)[0];
  port('B','input').dispatchEvent(event('pointerdown',400,200));assert.equal(model.isRooted('B'),true,'tap has not detached');
  svg.dispatchEvent(event('pointermove',550,270));assert.equal(model.isRooted('B'),false);assert.equal(model.get(edge.id),edge);assert.equal(model.snapshot().connections.length,2);assert.equal(model.list().length,1);
  assert.equal(wire().parentNode.getAttribute('display'),'inline');assert.ok(wire().getAttribute('d').startsWith('M 200 200 '));assert.ok(wire().getAttribute('d').endsWith('550 270'));
  assert.equal(walk(svg,n=>n.getAttribute('class')==='connection-preview')[0].getAttribute('display'),'none');
  const loose=walk(svg,n=>n.getAttribute('class')==='connection-loose-endpoint')[0];assert.equal(loose.getAttribute('cx'),'550');assert.equal(loose.getAttribute('cy'),'270');
  assert.equal(changes.at(-1).transient,true);assert.equal(layoutFreezes,1);document.dispatchEvent({type:'keydown',key:'Escape'});assert.equal(model.get(edge.id),edge);assert.equal(model.isRooted('B'),true);assert.equal(loose.getAttribute('display'),'none');
  port('A','output').dispatchEvent(event('pointerdown',200,200));svg.dispatchEvent(event('pointermove',650,250));assert.ok(wire().getAttribute('d').startsWith('M 650 250 '));assert.ok(wire().getAttribute('d').endsWith('400 200'));
  svg.dispatchEvent(event('pointerup',800,200));assert.equal(model.get(edge.id).from.objectId,'C');assert.equal(model.get(edge.id).to.objectId,'B');assert.equal(model.snapshot().connections.length,2);assert.equal(changes.at(-1).type,'change');assert.notEqual(changes.at(-1).transient,true);
  port('B','input').dispatchEvent(event('pointerdown',400,200));svg.dispatchEvent(event('pointermove',550,260));svg.dispatchEvent(event('pointercancel',550,260));assert.equal(model.get(edge.id).from.objectId,'C');
  port('B','input').dispatchEvent(event('pointerdown',400,200));svg.dispatchEvent(event('pointermove',550,260));svg.dispatchEvent(event('pointerup',800,200));assert.equal(model.get(edge.id).to.objectId,'B','invalid output destination restores');
  port('B','input').dispatchEvent(event('pointerdown',400,200));svg.dispatchEvent(event('pointermove',600,300));svg.dispatchEvent(event('pointerup',600,300));assert.equal(model.get(edge.id),null);assert.equal(adds,0);
 }finally{view?.dispose();for(const[k,v]of Object.entries(saved)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
});


for (const target of ['board','toy','connection','another Structure','new Structure']) {
 test('newly created Structure immediately participates in click-off collapse: '+target,()=>{
  const saved=Object.fromEntries(['document','window','requestAnimationFrame','cancelAnimationFrame','CustomEvent'].map(k=>[k,globalThis[k]]));
  const document=new Node(),window=new Node();document.head=new Node();document.createElementNS=(_,tag)=>new Node(tag);document.createElement=tag=>new Node(tag);
  Object.assign(globalThis,{document,window,requestAnimationFrame:()=>1,cancelAnimationFrame(){},CustomEvent:class{constructor(type,o){this.type=type;this.detail=o.detail;}}});
  let view,toys;
  try{
   const model=createConnectionModel(),viewport=new Node(),panels=[{id:'A',x:100},{id:'B',x:600},{id:'C',x:1000},{id:'D',x:1400}];panels.forEach(p=>model.registerObject(p.id));
   toys=createStructureToyModel(model);toys.restore([{id:'R',type:'repeat',x:800,y:400,collapsed:true}]);
   const link=(a,b)=>model.connect('sequence',{objectId:a,portId:'output'},{objectId:b,portId:'input'}).connection;
   const edge=link('A','B');
   view=createConnectionView({model,structureToys:toys,getPanels:()=>panels,getContext:()=>({viewportEl:viewport,transform:{scale:1,tx:0,ty:0}}),getToyPoint:(p,side)=>({x:p.x+(side==='right'?100:0),y:200}),getHeartbeatPoint:()=>({x:0,y:40})});view.render();
   const svg=viewport.children.find(n=>n.tagName==='svg'),menu=viewport.children.find(n=>n.className==='connection-menu');
   view.select(edge.id);menu.children.find(n=>n.textContent==='Together').dispatchEvent({type:'click',stopPropagation(){}});
   const created=toys.list().find(s=>s.id!=='R'),card=id=>walk(svg,n=>n.getAttribute('class')?.startsWith('structure-card')&&n.parentNode.getAttribute('id')===id)[0];
   assert.ok(created);assert.equal(created.collapsed,false);assert.ok(card(created.id).getAttribute('class').includes(' selected'));assert.equal(menu.hidden,true,'creation selects without opening the type menu');
   // No initial body tap on the created card.
   if(target==='new Structure'){
    const next=toys.promote(link('C','D').id,'sequence');assert.equal(toys.get(created.id).collapsed,true);assert.equal(toys.get(next.id).collapsed,false);assert.ok(card(next.id).getAttribute('class').includes(' selected'));
   }else{
    const elsewhere=target==='another Structure'?card('R'):target==='connection'?walk(svg,n=>n.getAttribute('class')==='connection-path')[0]:target==='toy'?Object.assign(new Node(),{id:'B'}):viewport;
    document.dispatchEvent({type:'pointerdown',target:elsewhere});assert.equal(toys.get(created.id).collapsed,true);
    if(target==='another Structure'){tapCard(card('R'),820,440);assert.equal(toys.get('R').collapsed,false);assert.ok(card('R').getAttribute('class').includes(' selected'));}
   }
  }finally{view?.dispose();toys?.dispose();for(const[k,v]of Object.entries(saved)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
 });
}

test('created Structure protects its own sockets and popup, and deletion/reset clear the creation selection',()=>{
 const saved=Object.fromEntries(['document','window','requestAnimationFrame','cancelAnimationFrame','CustomEvent'].map(k=>[k,globalThis[k]]));
 const document=new Node(),window=new Node();document.head=new Node();document.createElementNS=(_,tag)=>new Node(tag);document.createElement=tag=>new Node(tag);
 Object.assign(globalThis,{document,window,requestAnimationFrame:()=>1,cancelAnimationFrame(){},CustomEvent:class{constructor(type,o){this.type=type;this.detail=o.detail;}}});
 let view,toys;
 try{
  const model=createConnectionModel(),viewport=new Node(),panels=[{id:'A',x:0},{id:'B',x:700}];panels.forEach(p=>model.registerObject(p.id));toys=createStructureToyModel(model);
  view=createConnectionView({model,structureToys:toys,getPanels:()=>panels,getContext:()=>({viewportEl:viewport,transform:{scale:1,tx:0,ty:0}}),getToyPoint:p=>({x:p.x,y:200}),getHeartbeatPoint:()=>({x:0,y:0})});view.render();
  const edge=model.connect('sequence',{objectId:'A',portId:'output'},{objectId:'B',portId:'input'}).connection,created=toys.promote(edge.id,'together');
  const svg=viewport.children.find(n=>n.tagName==='svg'),menu=viewport.children.find(n=>n.className==='connection-menu');
  const own=walk(svg,n=>n.getAttribute('data-object-id')===created.id)[0];document.dispatchEvent({type:'pointerdown',target:own});assert.equal(toys.get(created.id).collapsed,false);
  const type=walk(svg,n=>n.getAttribute('aria-label')==='Change structure type')[0];document.dispatchEvent({type:'pointerdown',target:type});type.dispatchEvent(event('pointerdown',100,100));assert.equal(menu.hidden,false);
  document.dispatchEvent({type:'pointerdown',target:menu.children[0]});assert.equal(toys.get(created.id).collapsed,false);
  toys.remove(created.id);assert.equal(menu.hidden,true);toys.restore([{...created,collapsed:true}]);view.render();document.dispatchEvent({type:'pointerdown',target:viewport});assert.equal(toys.get(created.id).collapsed,true,'deleted creation selection does not survive ID reuse');
  const second=toys.promote(model.connect('sequence',{objectId:'A',portId:'output'},{objectId:'B',portId:'input'}).connection.id,'sequence');assert.equal(toys.get(second.id).collapsed,false);
  view.reset();clearCreationGraph({model,structures:toys,sequence:{reset(){}},adapter:{sync(){}}});assert.equal(walk(svg,n=>n.getAttribute('class')?.includes('structure-card')).length,0);assert.equal(menu.hidden,true);
 }finally{view?.dispose();toys?.dispose();for(const[k,v]of Object.entries(saved)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
});
