import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {Node,walk,dom,CustomEvent,event} from './graph-ui-dom.mjs';
import {features, PRESETS, canCreateToy, canCreateBackingToy, canUsePalette, canCreateShape} from '../src/runtime-config.js';
import {simpleCreationGroups} from '../src/simple-creation-palette.js';
import {createUIMode} from '../src/ui-mode.js';
import {simpleShapes,toyPreview} from '../src/simple-toy-preview.js';
import {decorateCircularControl} from '../src/circular-control.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const spawner=readFileSync(new URL('../src/toy-spawner.js',import.meta.url),'utf8').replace(/^import .*$/gm,'').replace('export const ToySpawner','const ToySpawner');
function fixture(config=features){
 Node.prototype.focus=function(){};
 const {document,window}=dom(),board=new Node();board.id='board';board.className='board-viewport';document.body.append(board);
 const uiMode=createUIMode({config}),calls=[];let changed=()=>{};
 const g_stringBoard={activeKind:null,arm:kind=>{clear();g_stringBoard.activeKind=kind;calls.push(['string.arm',kind]);},cancel:()=>{g_stringBoard.activeKind=null;}};
 const clear=()=>{g_stringBoard.activeKind=null;window.BouncerBoard.activeMode=null;window.BouncerBoard.activeShapeType=null;document.body.classList.remove('bouncer-board-armed','simple-ripple-armed','simple-draw-creating','simple-drum-armed');};
 const g_bouncerBoard={arm:options=>{clear();window.BouncerBoard.activeMode=options.mode||'ball';window.BouncerBoard.activeShapeType=options.mode==='cube'?(options.shapeType||'cube'):null;document.body.classList.add('bouncer-board-armed');calls.push(['bouncer.arm',{...options}]);return true;},cancel:()=>{window.BouncerBoard.activeMode=null;document.body.classList.remove('bouncer-board-armed');}};
 const g_rippleBoard={arm:()=>{clear();document.body.classList.add('simple-ripple-armed');calls.push(['ripple.arm']);return true;},cancel:()=>document.body.classList.remove('simple-ripple-armed')};
 const g_simpleDrawCreation={arm:()=>{clear();document.body.classList.add('simple-draw-creating');calls.push(['paint.arm']);},cancel:()=>document.body.classList.remove('simple-draw-creating')};
 window.BouncerBoard={activeMode:null,isRelevant:()=>false};
 const g_drumBoard={createSet:()=>{calls.push(['drum.set']);return [];},arm:()=>{clear();document.body.classList.add('simple-drum-armed');calls.push(['drum.arm']);return true;},cancel:()=>document.body.classList.remove('simple-drum-armed')};
 document.addEventListener('simple-creation:cancel',clear);
 const context={canCreateShape:type=>canCreateShape(type,config),simpleShapes,toyPreview,features:config,SIMPLE_TOY_BACKING:Symbol(),canCreateBackingToy:(type,owner)=>canCreateBackingToy(type,owner,config),canCreateToy:type=>canCreateToy(type,config),canUsePalette:palette=>canUsePalette(palette,config),document,window,CustomEvent,console,uiMode,decorateCircularControl,simpleCreationGroups,g_drumBoard,g_bouncerBoard,g_rippleBoard,g_simpleDrawCreation,g_stringBoard,g_artInternal:{active:false},g_creationHeartbeatId:null,MAIN_TRANSPORT_ID:'main',
  activateBoardBouncer:()=>g_bouncerBoard.arm({}),isExperimentalEnabled:()=>true,EXPERIMENTAL_TOYS:[],
  screenToWorld:p=>p,toggleHelp:()=>false,isHelpActive:()=>false,overviewMode:{isActive:()=>false},setTimeout,clearTimeout,queueMicrotask:fn=>fn(),
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

test('actual registry metadata groups Cube, Ball/Gravity/Ripple, Paint and four PLAY toys, without legacy Bouncer duplication',()=>{
 const f=fixture(),groups=simpleCreationGroups(f.context.entries);
 assert.deepEqual(groups.map(g=>[g.label,Array.from(g.entries,e=>e.name)]),[['PLACE',['Cube']],['TRIGGER',['Ball','Gravity Ball','Ripple']],['LOOP',['Paint']],['PLAY',['Drum','Drum Set','String','Strum']]]);
 f.open();assert.deepEqual(walk(f.menu,n=>n.tagName==='h3').map(n=>n.textContent),['PLACE','TRIGGER','LOOP','PLAY']);
 assert.deepEqual(f.cards().map(c=>c.getAttribute('aria-label')),['Shape','Ball','Gravity Ball','Ripple','Paint','Drum','Drum Set','String','Strum']);assert.equal(f.calls.length,0);
 for(const heading of walk(f.menu,n=>n.tagName==='h3'))heading.dispatchEvent(event('click'));assert.equal(f.calls.length,0);
 const play=walk(f.menu,n=>n.dataset.simpleCategory==='play')[0];assert.equal(walk(play,n=>n.tagName==='button').length,4);assert.equal(walk(play,n=>n.className==='simple-creation-empty').length,0);
});

test('selecting entries invokes existing main creation/arming paths without constructing replacement toys',()=>{
 const f=fixture();f.open();
 f.click('physical-cube');f.menu.querySelector('.shape-palette').querySelector('button').dispatchEvent(event('click'));assert.deepEqual(f.calls,[['create','physical-cube'],['bouncer.arm',{mode:'cube',seed:false,shapeType:'cube'}]]);
 f.calls.length=0;f.click('physical-ball');assert.deepEqual(f.calls,[['create','physical-ball'],['bouncer.arm',{mode:'ball',seed:true}]]);
 f.calls.length=0;f.click('physical-gravity-ball');assert.deepEqual(f.calls,[['create','physical-gravity-ball'],['bouncer.arm',{mode:'gravity',seed:true}]]);
 f.calls.length=0;f.click('simple-ripple');assert.deepEqual(f.calls,[['ripple.arm']]);
 f.calls.length=0;f.click('simple-draw');assert.deepEqual(f.calls,[['paint.arm']]);
 f.calls.length=0;f.click('simple-drum');assert.deepEqual(f.calls,[['drum.arm']]);
 f.calls.length=0;f.click('simple-drum-set');assert.deepEqual(f.calls,[['drum.set']]);
 f.calls.length=0;f.click('simple-string');assert.deepEqual(f.calls,[['string.arm','string']]);f.calls.length=0;f.click('simple-strum');assert.deepEqual(f.calls,[['string.arm','strum']]);
});

test('active creation mode is derived from existing state and survives rendering while Simple blocks the Art side route',()=>{
 const f=fixture();f.open();f.click('physical-ball');
 const active=()=>f.cards().filter(c=>c.getAttribute('aria-pressed')==='true').map(c=>c.dataset.toyType);
 assert.deepEqual(active(),['physical-ball']);f.window.ToySpawner.configure({});assert.deepEqual(active(),['physical-ball']);
 f.document.querySelector('.toy-spawner-art').dispatchEvent(event('click'));assert.equal(walk(f.menu,n=>n.tagName==='h3').length,4);assert.deepEqual(active(),['physical-ball']);
 f.document.querySelector('.toy-spawner-toggle').dispatchEvent(event('click'));assert.deepEqual(active(),['physical-ball']);assert.equal(f.document.querySelector('.toy-spawner-art').getAttribute('aria-pressed'),'false');
 f.click('physical-gravity-ball');assert.deepEqual(active(),['physical-gravity-ball']);f.click('simple-ripple');assert.deepEqual(active(),['simple-ripple']);f.document.body.classList.remove('simple-ripple-armed');f.notify();assert.deepEqual(active(),[]);
 f.click('simple-draw');assert.deepEqual(active(),['simple-draw']);f.document.body.classList.remove('simple-draw-creating');f.notify();assert.deepEqual(active(),[]);
});

test('Advanced preserves its flat registry view and its existing contextual availability',()=>{
 const f=fixture();f.uiMode.set('advanced');f.open();
 const expected=Array.from(f.context.getToyCatalog(),e=>e.name);
 assert.equal(walk(f.menu,n=>n.tagName==='h3').length,0);assert.equal(f.menu.querySelector('.simple-creation-group'),null);
 assert.deepEqual(f.cards().map(c=>c.querySelector('.toy-spawner-name').textContent),expected);
 assert.ok(expected.includes('Simple Bouncer'));assert.ok(expected.includes('Draw Line'));assert.ok(expected.includes('Drum Kit'));
 assert.ok(!expected.includes('Cube'));assert.ok(!expected.includes('Ball'));
 f.uiMode.set('simple');assert.deepEqual(f.cards().map(c=>c.getAttribute('aria-label')),['Shape','Ball','Gravity Ball','Ripple','Paint','Drum','Drum Set','String','Strum']);
});


test('playtest offers exactly nine working actions, removes unavailable dock buttons and rejects legacy creation',()=>{
 const f=fixture(PRESETS.simplePlaytest);f.open();
 assert.equal(f.uiMode.get(),'simple');f.uiMode.set('advanced');assert.equal(f.uiMode.get(),'simple');
 for(const cls of ['art','logic','game','arrange']) assert.equal(f.document.querySelector('.toy-spawner-'+cls),null);
 const types=f.cards().map(c=>c.dataset.toyType);
 assert.equal(types.length,9);
 for(const type of types){const before=f.calls.length;f.click(type);if(type==='physical-cube')f.menu.querySelector('.shape-palette').querySelector('button').dispatchEvent(event('click'));assert.ok(f.calls.length>before,type);}
 assert.equal(f.context.createToyPanelAt('drawgrid'),null);
 assert.equal(f.window.ToySpawner.openAdvancedLogic(),false);
});

test('persistent Shape chooser opens without placement, switches, deselects and cancels active placement when closed',()=>{
 const f=fixture();f.click('physical-cube');
 assert.deepEqual(simpleShapes.map(s=>s.id),['cube','circle','triangle','diamond','hexagon','star']);
 assert.ok(f.menu.querySelector('.shape-palette'));assert.equal(f.calls.length,0);
 const choose=id=>walk(f.menu.querySelector('.shape-palette'),n=>n.dataset.shapeType===id)[0].dispatchEvent(event('click'));
 const selected=()=>walk(f.menu.querySelector('.shape-palette'),n=>n.getAttribute('aria-pressed')==='true').map(n=>n.dataset.shapeType);
 assert.deepEqual(selected(),[]);
 choose('cube');assert.ok(f.menu.querySelector('.shape-palette'));assert.deepEqual(selected(),['cube']);assert.equal(f.calls.length,2);
 choose('circle');assert.deepEqual(selected(),['circle']);assert.equal(f.window.BouncerBoard.activeShapeType,'circle');
 choose('circle');assert.deepEqual(selected(),[]);assert.equal(f.window.BouncerBoard.activeMode,null);assert.ok(f.menu.querySelector('.shape-palette'));
 choose('triangle');f.click('physical-cube');assert.equal(f.menu.querySelector('.shape-palette'),null);assert.equal(f.window.BouncerBoard.activeShapeType,null);assert.equal(f.window.BouncerBoard.activeMode,null);
 f.click('physical-cube');assert.deepEqual(selected(),[]);
 f.click('simple-ripple');assert.equal(f.menu.querySelector('.shape-palette'),null);assert.equal(f.window.BouncerBoard.activeMode,null);
 f.click('physical-cube');choose('star');f.window.dispatchEvent(event('keydown',0,0,{key:'Escape'}));assert.equal(f.window.BouncerBoard.activeMode,null);assert.equal(f.menu.querySelector('.shape-palette'),null);
});

test('second click cancels creation and previews have no simulation or persistence dependencies',()=>{
 const f=fixture();f.click('simple-draw');f.click('simple-draw');
 assert.equal(f.document.body.classList.contains('simple-draw-creating'),false);
 for(const entry of f.context.entries.filter(e=>e.simpleCategory)){
  const preview=toyPreview(entry.type);assert.match(preview,/aria-hidden="true"/);assert.match(preview,/<(?:circle|path)/);
 }
 const source=readFileSync(new URL('../src/simple-toy-preview.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/requestAnimationFrame|setInterval|localStorage|Persistence|transport/);
 f.document.hidden=true;f.document.dispatchEvent(event('visibilitychange'));assert.ok(f.menu.classList.contains('previews-paused'));
 f.document.hidden=false;f.document.dispatchEvent(event('visibilitychange'));assert.equal(f.menu.classList.contains('previews-paused'),false);
 f.menu.querySelector('.toy-box-header').dispatchEvent(event('click'));assert.ok(f.menu.classList.contains('toy-box-collapsed'));
});

test('manifest-disabled entries and shapes are omitted from the creation surface',()=>{
 const config={...PRESETS.simplePlaytest,simpleToys:{...PRESETS.simplePlaytest.simpleToys,'physical-cube':false,'simple-strum':false}};
 const f=fixture(config);assert.equal(f.cards().length,7);
 assert.equal(f.cards().some(c=>['physical-cube','simple-strum'].includes(c.dataset.toyType)),false);
});

test('individual shape preset flags filter choices and canonical factory refuses disabled shapes',()=>{
 const config={...PRESETS.simplePlaytest,simpleShapes:{...PRESETS.simplePlaytest.simpleShapes,circle:false,star:false}};
 const f=fixture(config);f.click('physical-cube');
 assert.deepEqual(walk(f.menu.querySelector('.shape-palette'),n=>n.dataset.shapeType).map(n=>n.dataset.shapeType),['cube','triangle','diamond','hexagon']);
 assert.equal(f.context.createToyPanelAt('physical-cube',{shapeType:'circle'}),null);assert.equal(f.calls.length,0);
 const cubeDisabled=fixture({...config,simpleShapes:{...config.simpleShapes,cube:false}});
 assert.equal(cubeDisabled.context.createToyPanelAt('physical-cube'),null);assert.equal(cubeDisabled.calls.length,0);
});

test('closing the Toy Box or rebuilding its catalog clears Shape selection',()=>{
 for(const close of [f=>f.window.ToySpawner.close(),f=>vm.runInContext('renderCatalog()',f.context)]){
  const f=fixture();f.click('physical-cube');walk(f.menu.querySelector('.shape-palette'),n=>n.dataset.shapeType==='cube')[0].dispatchEvent(event('click'));
  assert.equal(f.window.BouncerBoard.activeMode,'cube');close(f);assert.equal(f.window.BouncerBoard.activeMode,null);assert.equal(f.window.BouncerBoard.activeShapeType,null);
  assert.equal(f.menu.querySelector('.shape-palette'),null);
 }
});

test('Advanced Art remains available, then switching to Simple leaves the Music palette active',()=>{
 const f=fixture();f.uiMode.set('advanced');f.document.querySelector('.toy-spawner-art').dispatchEvent(event('click'));
 assert.deepEqual(f.cards().map(c=>c.dataset.toyType),['flashCircle']);assert.equal(f.document.querySelector('.toy-spawner-art').getAttribute('aria-pressed'),'true');
 f.uiMode.set('simple');assert.equal(f.document.querySelector('.toy-spawner-art').getAttribute('aria-pressed'),'false');assert.ok(f.cards().some(c=>c.dataset.toyType==='simple-drum'));
});
