import test from 'node:test';
import assert from 'node:assert/strict';
class Element extends EventTarget {
 constructor(tag='div'){super();this.tagName=tag;this.children=[];this.dataset={};this.attrs=new Map();this.style={};this.className='';this.id='';this.isConnected=true;this.classList={contains:c=>this.className.split(' ').includes(c),add:c=>{if(!this.classList.contains(c))this.className+=' '+c;},remove:c=>{this.className=this.className.split(' ').filter(x=>x!==c).join(' ');}};}
 setAttribute(k,v){this.attrs.set(k,String(v));}getAttribute(k){return this.attrs.get(k)??null;}removeAttribute(k){this.attrs.delete(k);}
 set hidden(v){if(v)this.setAttribute('hidden','');else this.removeAttribute('hidden');}get hidden(){return this.attrs.has('hidden');}
 append(...nodes){for(const n of nodes){if(n.parentElement)n.parentElement.children=n.parentElement.children.filter(x=>x!==n);n.parentElement=this;this.children.push(n);}}appendChild(n){this.append(n);return n;}focus(){document.activeElement=this;}
 querySelector(s){return this.querySelectorAll(s)[0]??null;}
 querySelectorAll(s){const match=e=>s.startsWith('.')?e.classList.contains(s.slice(1)):s.startsWith('[data-group=')?e.dataset.group===s.split('"')[1]:false;return this.children.flatMap(e=>[...(match(e)?[e]:[]),...e.querySelectorAll(s)]);}
}
const doc=new EventTarget();doc.createElement=tag=>new Element(tag);globalThis.document=doc;
const {ADVANCED_TOYS,installToyAdvanced,curateToyAdvanced,zoomInPanel,zoomOutPanel}=await import('../src/toy-advanced.js');
function panel(kind){const p=new Element();p.dataset.toy=kind;p.id=kind;p.source={notes:['C3','E3'],generatorIds:[1,2]};p.style={left:'40px',width:'480px'};const header=new Element();header.className='toy-header';header.offsetHeight=80;const right=new Element();right.className='toy-controls-right';header.append(right);p.append(header);installToyAdvanced(p);return p;}
test('Advanced appears only on compatible musical Master toys',()=>{
 for(const kind of [...ADVANCED_TOYS,'loopgrid','loopgrid-drum','heartbeat','transpose'])assert.equal(!!panel(kind).querySelector('.toy-advanced-toggle'),ADVANCED_TOYS.includes(kind));
});
test('Simple Rhythm Advanced offers linked Instances without pitched controls',()=>{
 const p=panel('loopgrid'),shelf=p.querySelector('.toy-advanced-panel'),groups=shelf.querySelectorAll('[data-group="reuse"]');
 assert.equal(groups.length,1);assert.equal(groups[0].children[1].textContent,'Create Linked Copy');
 assert.equal(p.querySelector('.musical-role-control'),null);assert.equal(p.querySelector('.local-transpose-control'),null);
 const before=structuredClone(p.source),calls=[];globalThis.window={MusicToyFactory:{createInstance:(master,options)=>calls.push({master,options})}};
 groups[0].children[1].dispatchEvent(new Event('click'));assert.equal(calls[0].master,p);assert.equal(calls[0].options.focus,true);assert.deepEqual(p.source,before);delete globalThis.window;
});
test('open/close is keyboard accessible, idempotent and leaves source data and geometry untouched',()=>{
 const p=panel('drawgrid'),before=JSON.stringify([p.source,p.style]),parent=p.parentElement,events=[];p.addEventListener('toy-zoom',e=>events.push(e.detail.zoomed));
 p.querySelector('.toy-advanced-toggle').dispatchEvent(new Event('click'));zoomInPanel(p);
 assert.equal(p.querySelector('.toy-advanced-toggle').getAttribute('aria-expanded'),'true');assert.equal(p.querySelector('.toy-advanced-panel').hidden,false);
 assert.equal(JSON.stringify([p.source,p.style]),before);assert.equal(p.parentElement,parent);assert.equal(document.activeElement,p.querySelector('.toy-advanced-close'));
 p.querySelector('.toy-advanced-close').dispatchEvent(new Event('click'));assert.deepEqual(events,[true,false]);assert.equal(p.querySelector('.toy-advanced-panel').hidden,true);
 assert.equal(document.activeElement,p.querySelector('.toy-advanced-toggle'));assert.equal(JSON.stringify([p.source,p.style]),before);
});
test('opening another toy closes the previous one and Escape returns to Basic',()=>{
 const a=panel('bouncer'),b=panel('rippler');zoomInPanel(a);zoomInPanel(b);assert.equal(a.classList.contains('toy-zoomed'),false);
 const escape=new Event('keydown');Object.defineProperty(escape,'key',{value:'Escape'});document.dispatchEvent(escape);assert.equal(b.classList.contains('toy-zoomed'),false);assert.equal(b.querySelector('.toy-advanced-panel').hidden,true);
 zoomInPanel(panel('loopgrid'));zoomOutPanel();
});

test('repeated initialization leaves one Advanced toggle and one Chord Wheel instruction',()=>{
 const p=panel('chordwheel');installToyAdvanced(p);curateToyAdvanced(p);curateToyAdvanced(p);
 assert.equal(p.querySelectorAll('.toy-advanced-toggle').length,1);
 assert.equal(p.querySelectorAll('.toy-advanced-panel').length,1);
 assert.equal(p.querySelectorAll('.toy-advanced-hint').length,1);
});

test('DrawGrid musical controls belong to Advanced and author role/transpose independently',async()=>{
 const {installMusicalRoleUI}=await import('../src/musical-role-ui.js');
 const p=panel('drawgrid');globalThis.window={};installMusicalRoleUI(p);installMusicalRoleUI(p);
 const role=p.querySelector('.musical-role-control'),transpose=p.querySelector('.local-transpose-control');
 assert.equal(role.parentElement.parentElement.dataset.group,'musical');
 assert.equal(p.querySelector('.toy-controls-right').querySelector('.musical-role-control'),null);
 assert.deepEqual(role.children.map(o=>[o.value,o.textContent]),[['melody','Melody'],['accompaniment','Accompaniment']]);
 assert.equal(p.dataset.musicalRole,'melody');assert.equal(p.dataset.localTranspose,'0');
 role.value='accompaniment';role.dispatchEvent(new Event('change'));transpose.value='3';transpose.dispatchEvent(new Event('change'));
 assert.equal(p.dataset.musicalRole,'accompaniment');assert.equal(p.dataset.localTranspose,'3');
 p.dataset.instrument='PIANO';p.dispatchEvent(new Event('toy:instrument'));assert.equal(role.value,'accompaniment');
 assert.equal(p.querySelectorAll('.musical-role-control').length,1);assert.deepEqual(p.source.notes,['C3','E3']);
 delete globalThis.window;
});

test('legacy generator IDs survive save/load and Advanced cannot change the playback map',async()=>{
 const {createDgMapRegen}=await import('../src/drawgrid/dg-map-regen.js');
 const {createDgStateIo}=await import('../src/drawgrid/dg-state-io.js');
 const {upgradeDrawGridStrokes}=await import('../src/drawgrid/drawgrid-stroke-persistence.js');
 const p=panel('drawgrid'),strokes=[{generatorId:1,isSpecial:true,pts:[{x:20,y:40},{x:700,y:80}]},{generatorId:2,isSpecial:false,pts:[{x:20,y:300},{x:700,y:340}]}];
 const state={panel:p,cols:2,currentCols:2,strokes,persistentDisabled:[new Set(),new Set()],manualOverrides:[],autoTune:true};
 const regen=createDgMapRegen({state,deps:{snapToGridFromStroke:s=>({nodes:[new Set([s.generatorId+6]),new Set([s.generatorId+6])]}),fillGapsInNodeArray:x=>x,DG:{log(){}},drawNodes(){},drawGrid(){},emitDrawgridUpdate(){}}});
 const notes=()=>state.currentMap.nodes.map(s=>[...s]);
 regen.regenerateMapFromStrokes();const before=notes(),authored=JSON.stringify(strokes);zoomInPanel(p);regen.regenerateMapFromStrokes();assert.deepEqual(notes(),before);zoomOutPanel();regen.regenerateMapFromStrokes();assert.deepEqual(notes(),before);assert.equal(JSON.stringify(strokes),authored);
 const saved=createDgStateIo({state}).captureState();const restored=upgradeDrawGridStrokes(saved.strokes);assert.deepEqual(restored.map(s=>[s.generatorId,s.isSpecial]),[[1,true],[2,false]]);
});
