import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {Node,walk,dom,CustomEvent,event} from './graph-ui-dom.mjs';
import {simpleCreationGroups} from '../src/simple-creation-palette.js';
import {createUIMode} from '../src/ui-mode.js';
import {decorateCircularControl} from '../src/circular-control.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const spawner=readFileSync(new URL('../src/toy-spawner.js',import.meta.url),'utf8').replace(/^import .*$/gm,'').replace('export const ToySpawner','const ToySpawner');
function fixture(){
 const {document,window}=dom(),board=new Node();board.id='board';board.className='board-viewport';document.body.append(board);
 const uiMode=createUIMode(),calls=[];let changed=()=>{};
 const clear=()=>{window.BouncerBoard.activeMode=null;document.body.classList.remove('bouncer-board-armed','simple-ripple-armed','simple-draw-creating','simple-drum-armed');};
 const g_bouncerBoard={arm:options=>{clear();window.BouncerBoard.activeMode=options.mode||'ball';document.body.classList.add('bouncer-board-armed');calls.push(['bouncer.arm',{...options}]);return true;},cancel:()=>{window.BouncerBoard.activeMode=null;document.body.classList.remove('bouncer-board-armed');}};
 const g_rippleBoard={arm:()=>{clear();document.body.classList.add('simple-ripple-armed');calls.push(['ripple.arm']);return true;},cancel:()=>document.body.classList.remove('simple-ripple-armed')};
 const g_simpleDrawCreation={arm:()=>{clear();document.body.classList.add('simple-draw-creating');calls.push(['paint.arm']);},cancel:()=>document.body.classList.remove('simple-draw-creating')};
 window.BouncerBoard={activeMode:null,isRelevant:()=>false};
 const g_drumBoard={createSet:()=>{calls.push(['drum.set']);return [];},arm:()=>{clear();document.body.classList.add('simple-drum-armed');calls.push(['drum.arm']);return true;},cancel:()=>document.body.classList.remove('simple-drum-armed')};
 const context={document,window,CustomEvent,console,uiMode,decorateCircularControl,simpleCreationGroups,g_drumBoard,g_bouncerBoard,g_rippleBoard,g_simpleDrawCreation,g_artInternal:{active:false},g_creationHeartbeatId:null,MAIN_TRANSPORT_ID:'main',
  activateBoardBouncer:()=>g_bouncerBoard.arm({}),isExperimentalEnabled:()=>true,EXPERIMENTAL_TOYS:[],
  screenToWorld:p=>p,toggleHelp:()=>false,isHelpActive:()=>false,overviewMode:{isActive:()=>false},setTimeout,clearTimeout,
  MutationObserver:class{constructor(callback){changed=callback;}observe(){}},
 };
 vm.createContext(context);
 const catalogStart=main.indexOf('const toyCatalog ='),factoryStart=main.indexOf('function createToyPanelAt('),catalogFunction=main.indexOf('function getToyCatalog()');
 vm.runInContext(main.slice(catalogStart,main.indexOf('\nfunction isExperimentalEnabled',catalogStart))+main.slice(factoryStart,main.indexOf('\n    g_bouncerBoard.cancel();\n    if (!type',factoryStart))+'\n}\n'+main.slice(catalogFunction,main.indexOf('\n}',catalogFunction)+2)+'\nglobalThis.entries=toyCatalog;',context);
 vm.runInContext(spawner,context);
 window.ToySpawner.configure({getCatalog:context.getToyCatalog,create:(type,options)=>{calls.push(['create',type]);return context.createToyPanelAt(type,options);}});
 window.ToySpawner.configureArt({getCatalog:()=>[{type:'flashCircle',name:'Flash Circle'}],create:type=>{calls.push(['art.create',type]);return {};}});
 document.querySelector('.toy-spawner-dock').getBoundingClientRect=()=>({left:1000});
 const menu=document.querySelector('.toy-spawner-menu');
 const cards=()=>walk(menu,n=>n.classList.contains('toy-spawner-item'));
 const click=type=>{const card=cards().find(c=>c.dataset.toyType===type);assert.ok(card,type);card.dispatchEvent(event('click'));};
 return {document,window,uiMode,calls,context,menu,cards,click,notify:()=>changed(),open:()=>window.ToySpawner.open()};
}

test('actual registry metadata groups Cube, Ball/Ripple, Paint and Drum under Play, without legacy Bouncer duplication',()=>{
 const f=fixture(),groups=simpleCreationGroups(f.context.entries);
 assert.deepEqual(groups.map(g=>[g.label,Array.from(g.entries,e=>e.name)]),[['PLACE',['Cube']],['TRIGGER',['Ball','Ripple']],['LOOP',['Paint']],['PLAY',['Drum','Drum Set']]]);
 f.open();assert.deepEqual(walk(f.menu,n=>n.tagName==='h3').map(n=>n.textContent),['PLACE','TRIGGER','LOOP','PLAY']);
 assert.deepEqual(f.cards().map(c=>c.getAttribute('aria-label')),['Cube','Ball','Ripple','Paint','Drum','Drum Set']);assert.equal(f.calls.length,0);
 for(const heading of walk(f.menu,n=>n.tagName==='h3'))heading.dispatchEvent(event('click'));assert.equal(f.calls.length,0);
 const play=walk(f.menu,n=>n.dataset.simpleCategory==='play')[0];assert.equal(walk(play,n=>n.tagName==='button').length,2);assert.equal(walk(play,n=>n.className==='simple-creation-empty').length,0);
});

test('selecting entries invokes existing main creation/arming paths without constructing replacement toys',()=>{
 const f=fixture();f.open();
 f.click('physical-cube');assert.deepEqual(f.calls,[['create','physical-cube'],['bouncer.arm',{mode:'cube',seed:false}]]);
 f.calls.length=0;f.click('physical-ball');assert.deepEqual(f.calls,[['create','physical-ball'],['bouncer.arm',{mode:'ball',seed:true}]]);
 f.calls.length=0;f.click('simple-ripple');assert.deepEqual(f.calls,[['ripple.arm']]);
 f.calls.length=0;f.click('simple-draw');assert.deepEqual(f.calls,[['paint.arm']]);
 f.calls.length=0;f.click('simple-drum');assert.deepEqual(f.calls,[['drum.arm']]);
 f.calls.length=0;f.click('simple-drum-set');assert.deepEqual(f.calls,[['drum.set']]);
});

test('active creation mode is derived from existing state and survives rendering and Simple/Art switching',()=>{
 const f=fixture();f.open();f.click('physical-ball');
 const active=()=>f.cards().filter(c=>c.getAttribute('aria-pressed')==='true').map(c=>c.dataset.toyType);
 assert.deepEqual(active(),['physical-ball']);f.window.ToySpawner.configure({});assert.deepEqual(active(),['physical-ball']);
 f.document.querySelector('.toy-spawner-art').dispatchEvent(event('click'));assert.equal(walk(f.menu,n=>n.tagName==='h3').length,0);assert.deepEqual(f.cards().map(c=>c.dataset.toyType),['flashCircle']);
 f.document.querySelector('.toy-spawner-toggle').dispatchEvent(event('click'));assert.deepEqual(active(),['physical-ball']);assert.equal(f.document.querySelector('.toy-spawner-art').getAttribute('aria-pressed'),'false');
 f.click('simple-ripple');assert.deepEqual(active(),['simple-ripple']);f.document.body.classList.remove('simple-ripple-armed');f.notify();assert.deepEqual(active(),[]);
 f.click('simple-draw');assert.deepEqual(active(),['simple-draw']);f.document.body.classList.remove('simple-draw-creating');f.notify();assert.deepEqual(active(),[]);
});

test('Advanced preserves its flat registry view and its existing contextual availability',()=>{
 const f=fixture();f.uiMode.set('advanced');f.open();
 const expected=Array.from(f.context.getToyCatalog(),e=>e.name);
 assert.equal(walk(f.menu,n=>n.tagName==='h3').length,0);assert.equal(f.menu.querySelector('.simple-creation-group'),null);
 assert.deepEqual(f.cards().map(c=>c.querySelector('.toy-spawner-name').textContent),expected);
 assert.ok(expected.includes('Simple Bouncer'));assert.ok(expected.includes('Draw Line'));assert.ok(expected.includes('Drum Kit'));
 assert.ok(!expected.includes('Cube'));assert.ok(!expected.includes('Ball'));
 f.uiMode.set('simple');assert.deepEqual(f.cards().map(c=>c.getAttribute('aria-label')),['Cube','Ball','Ripple','Paint','Drum','Drum Set']);
});

