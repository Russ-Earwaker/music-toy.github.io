import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {Node,walk,dom,CustomEvent,event} from './graph-ui-dom.mjs';
import {installHeartbeatView} from '../src/heartbeat-view.js';
import {heartbeatModel} from '../src/heartbeats.js';
import {MAIN_TRANSPORT_ID} from '../src/transport-registry.js';

test('Logic shares palette exclusivity, outside/Escape/New Creation dismissal and normal spawn conversion',()=>{
 const {document,window}=dom(),board=new Node();board.id='board';board.className='board-viewport';document.body.append(board);
 const context={document,window,CustomEvent,console,screenToWorld:p=>({x:p.x+500,y:p.y+300}),toggleHelp:()=>false,isHelpActive:()=>false,overviewMode:{isActive:()=>false},setTimeout,clearTimeout};
 vm.createContext(context);const source=readFileSync(new URL('../src/toy-spawner.js',import.meta.url),'utf8').replace(/^import .*$/gm,'').replace('export const ToySpawner','const ToySpawner');vm.runInContext(source,context);
 document.querySelector('.toy-spawner-dock').getBoundingClientRect=()=>({left:1000});
 const created=[];window.ToySpawner.configureLogic({getCatalog:()=>['Sequence','Together','Repeat','Timeline','Transpose','Chord Progression','Heartbeat'].map(name=>({type:name.toLowerCase().replace(' ','-'),name})),create:(type,options)=>{created.push({type,options});return {};}});
 const logic=document.querySelector('.toy-spawner-logic'),music=document.querySelector('.toy-spawner-toggle'),menu=document.querySelector('.toy-spawner-menu');
 assert.equal(logic.classList.contains('c-btn'),true);assert.ok(logic.querySelector('.c-btn-core').style['--c-btn-icon-url'].includes('T_ButtonLogic'));
 logic.dispatchEvent(event('click'));assert.equal(logic.getAttribute('aria-pressed'),'true');assert.deepEqual(walk(menu,n=>n.className==='toy-spawner-name').map(n=>n.textContent),['Sequence','Together','Repeat','Timeline','Transpose','Chord Progression','Heartbeat']);
 music.dispatchEvent(event('click'));assert.equal(menu.classList.contains('open'),true);assert.equal(logic.getAttribute('aria-pressed'),'false');assert.equal(music.getAttribute('aria-pressed'),'true');
 logic.dispatchEvent(event('click'));document.dispatchEvent(event('pointerdown',0,0,{target:board}));assert.equal(menu.classList.contains('open'),false);
 logic.dispatchEvent(event('click'));document.dispatchEvent(event('keydown',0,0,{key:'Escape'}));assert.equal(menu.classList.contains('open'),false);
 logic.dispatchEvent(event('click'));window.dispatchEvent(new CustomEvent('scene:new'));assert.equal(menu.classList.contains('open'),false);
 for(const type of ['sequence','together','repeat','timeline','transpose','chord-progression','heartbeat']){logic.dispatchEvent(event('click'));const card=walk(menu,n=>n.dataset.toyType===type)[0];card.dispatchEvent(event('click'));assert.equal(created.at(-1).type,type);assert.equal(created.at(-1).options.centerX,1000);assert.equal(created.at(-1).options.centerY,700);assert.equal(menu.classList.contains('open'),false);}
});

test('main Heartbeat has identity and life without duplicate controls; secondary retains controls and shared creation',()=>{
 const originals={document:globalThis.document,window:globalThis.window};const {document,window}=dom();Object.assign(globalThis,{document,window});
 const world=new Node();document.body.append(world);let record;
 try{const view=installHeartbeatView({getWorld:()=>world,getMainPoint:()=>({x:100,y:100}),getSpawnPoint:()=>({x:400,y:300})});view.render();
  const main=walk(world,n=>n.dataset.heartbeatId===MAIN_TRANSPORT_ID)[0];assert.ok(main);assert.ok(main.querySelector('strong').textContent.includes('Heartbeat'));assert.equal(walk(main,n=>n.tagName==='button'||n.tagName==='input').length,0);assert.equal(document.getElementById('add-heartbeat'),null);
  record=view.createHeartbeat();const secondary=walk(world,n=>n.dataset.heartbeatId===record.id)[0];assert.ok(secondary.querySelector('.heartbeat-play'));assert.ok(secondary.querySelector('input'));assert.ok(walk(secondary,n=>n.title==='Return this Heartbeat to Start').length);assert.equal(record.position.x,400);assert.equal(record.position.y,300);
  assert.equal(main.dataset.playing,'false');
 }finally{if(record)heartbeatModel.remove(record.id);Object.assign(globalThis,originals);}
});
