import {connectionModel as model} from '../src/connections.js';
import {structureToyModel as structures} from '../src/structure-toys.js';
import {getPanelTransport} from '../src/panel-transport.js';
import {auditArrangementInputs} from '../src/auto-arrange-inputs.js';
import {ensureAudioContext} from '../src/audio-core.js';
const proof=await fetch('../resources/debug-output/auto-arrange-browser-proof.json').then(r=>r.ok?r.json():{cases:[],errors:[]}).catch(()=>({cases:[],errors:[]}));let current=null;
window.__HARMONY_DEBUG=true;
const uxProof=await fetch('../resources/debug-output/arrange-ux-browser-proof.json').then(r=>r.ok?r.json():{cases:[]}).catch(()=>({cases:[]}));
for(const type of ['pointerdown','pointerup','click'])document.addEventListener(type,e=>{if(current)(current.inputEvents||=[]).push({type,target:e.target.tagName,css:e.target.getAttribute?.('class'),header:!!e.target.closest?.('.toy-header'),x:e.clientX,y:e.clientY});},true);
document.addEventListener('animationstart',e=>{if(current&&['arrange-authored','arrange-added','relationship-node-flash','relationship-fade','relationship-structure'].includes(e.animationName))(current.reveals||=[]).push({id:e.target.id,kind:e.animationName});},true);
window.addEventListener('error',e=>proof.errors.push(e.message));
window.addEventListener('unhandledrejection',e=>proof.errors.push(String(e.reason?.stack||e.reason)));
window.addEventListener('toy:note',e=>{
 if(!current)return;const note=e.detail,currentTime=ensureAudioContext().currentTime;
 current.notes.push({...structuredClone(note),leadMs:(note.when-currentTime)*1000});
});
const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
const panels=()=>Array.from(document.querySelectorAll('.toy-panel'));
function inspect(){
 if(!current){current={kind:'restored',input:[],notes:[]};proof.cases.push(current);}
 const root=structures.list().find(s=>s.autoArrange?.root),transport=root&&getPanelTransport(document.getElementById(root.id));
 Object.assign(current,{selection:window.__AUTO_ARRANGE_INPUT_DEBUG,root:root&&{id:root.id,durationTicks:structures.durationOf(root.id)},
  notesByRole:current.notes.reduce((r,n)=>{const role=n.pitchDecision?.role||'unknown';r[role]=(r[role]||0)+1;return r;},{}),
  currentTick:transport?.currentTick,playing:transport?.state,
  drawgridLines:panels().filter(p=>p.dataset.toy==='drawgrid').map(p=>({id:p.id,lines:p.__drawToy?.getState?.().strokes?.length,linked:p.dataset.sharedDefinitionId})),
  physics:panels().filter(p=>['bouncer','rippler'].includes(p.dataset.toy)).map(p=>({id:p.id,active:p.dataset.chainActive,sequence:p.__sequenceDefinitionId,snapshot:p.__getBouncerSnapshot?.()||p.__getRipplerSnapshot?.()})),
  objects:panels().map(p=>({id:p.id,type:p.dataset.toy,definition:p.dataset.sharedDefinitionId,parent:model.getParent(p.id)?.from.objectId,rooted:model.isRooted(p.id)}))});
 parent.document.querySelector('#proof').textContent=JSON.stringify({...current,notes:current.notes.slice(-12),errors:proof.errors},null,2);
 return 'Proof inspected: '+current.notes.length+' note events';
}
window.__arrangeInputQA={
 async saveUX(){
  inspect();const result=document.querySelector('.arrangement-result');
  const ui={kind:current.kind,input:current.input,summary:result?.querySelector('[role="status"]')?.textContent,
   markers:document.querySelectorAll('.linked-copy-marker').length,structureMarkers:document.querySelectorAll('svg .linked-copy-marker').length,
   reveals:current.reveals||[],inputEvents:current.inputEvents||[],highlighted:[...document.querySelectorAll('.arrange-authored')].map(p=>p.id),
   sections:[...document.querySelectorAll('[data-node-kind]')].filter(p=>['Intro','A','B','Outro'].includes(p.querySelector('.structure-name')?.textContent)).map(p=>({name:p.querySelector('.structure-name').textContent,x:p.getBoundingClientRect().x,y:p.getBoundingClientRect().y})),
   notesByRole:current.notesByRole,errors:proof.errors};uxProof.cases.push(ui);
  const response=await fetch('/_qa-ux',{method:'POST',body:JSON.stringify(uxProof)});if(!response.ok)throw Error('UX save failed');return 'UX observations saved';
 },
 async prepare(kind){
  // This harness runs on its own QA origin. It never opens or clears the user's
  // normal app origin. Reset only this test board via production persistence.
  const {payload}=await(await fetch('../resources/harmony-integration.scene.json')).json();
  Object.assign(payload,{toys:[],structureToys:[],connections:[],chains:[],sharedToyDefinitions:[],sharedSequenceDefinitions:[]});
  if(!window.Persistence.applySnapshot(payload))throw Error('Fixture reset rejected');
  for(let i=0;i<4;i++)await frame();
  const kinds=kind==='mixed'?['drawgrid','bouncer','rippler']:kind==='percussion'?['loopgrid','loopgrid','loopgrid-drum']:kind==='draw-rhythm'?['drawgrid','loopgrid']:kind==='bounce-ripple'?['bouncer','rippler']:[kind];
  current={kind,learningFix:true,input:[],notes:[]};proof.cases.push(current);
  for(const [i,type] of kinds.entries()){
   const p=window.MusicToyFactory.create(type,{centerX:400+i*450,centerY:350,instrument:['loopgrid','loopgrid-drum'].includes(type)?'DRUM KICK':'PIANO',autoCenter:false});
   for(let attempt=0;attempt<40&&typeof p.__sequencerStep!=='function';attempt++)await frame();
   if(type==='drawgrid'){
    const state=p.__drawToy.getState();state.steps=8;state.strokes=[];state.nodes={active:Array(8).fill(true),list:[7,5,4,5,7,9,6,11].map(row=>[row]),disabled:Array.from({length:8},()=>[])};state.meta={preserveNodesOverStrokes:true};await p.__drawToy.setState(state);
   }else p.dispatchEvent(new CustomEvent('toy-random',{bubbles:true}));
   for(let attempt=0;attempt<3;attempt++)await frame();
   getPanelTransport(p)?.pause();getPanelTransport(p)?.setBpm(240);
   current.input.push({id:p.id,type,role:p.dataset.musicalRole,audit:auditArrangementInputs([p]).map(({panel,...entry})=>entry)});
  }
  inspect();return 'Input ready — click normal Arrange, then Play';
 },inspect,
 async save(){inspect();const response=await fetch('/_qa-proof',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(proof)});if(!response.ok)throw Error('Save failed');return 'Saved resources/debug-output/auto-arrange-browser-proof.json';}
};
