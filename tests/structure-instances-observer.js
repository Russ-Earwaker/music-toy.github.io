// Test-only actions and observations. All linked copies are created through the
// normal board UI; edits use the public toy state and canonical graph model.
import {connectionModel as model} from '../src/connections.js';
import {structureToyModel as structures} from '../src/structure-toys.js';
import {getPanelTransport} from '../src/panel-transport.js';
import './chord-indicator-observer.js';
const report={kind:'structure-instances-browser',events:[],actions:[],relationships:[]};
report.errors=[];for(const key of ['warn','error']){const original=console[key].bind(console);console[key]=(...args)=>{report.errors.push(args.map(a=>a?.stack||String(a)).join(' '));original(...args);};}
window.__HARMONY_DEBUG=true;
window.addEventListener('toy:note',e=>{report.events.push(structuredClone(e.detail));if(report.events.length>4000)report.events.shift();parent.document.querySelector('#proof').textContent=JSON.stringify({notes:report.events.length,last:report.events.slice(-2)},null,2);});
const relationshipEvent=e=>{
 if(!e.target.closest('[data-structure-id],.toy-header'))return;
 setTimeout(()=>report.relationships.push({flashed:[...document.querySelectorAll('.relationship-flash')].map(p=>p.id),tethers:[...document.querySelectorAll('.relationship-tethers')].map(p=>({paths:p.querySelectorAll('path').length,pointer:getComputedStyle(p).pointerEvents}))}),50);
};
document.addEventListener('pointerup',relationshipEvent,true);document.addEventListener('keyup',relationshipEvent,true);
const record=kind=>report.actions.push({kind,eventCount:report.events.length,snapshot:window.Persistence.getSnapshot(),roots:structuredClone(window.__STRUCTURE_DEBUG?.instances?.filter(i=>!i.parentDefinitionId)||[])});
const input=objectId=>({objectId,portId:'input'});
const copies=()=>structures.list().filter(s=>s.masterStructureId==='phrase-proof-master').sort((a,b)=>a.structureInstanceNumber-b.structureInstanceNumber);
async function fixture(){
 const {payload}=await (await fetch('../resources/harmony-integration.scene.json')).json();return payload;
}
window.__structureProofActions={
 deleteTemplate(){const s=structures.list().find(s=>s.autoArrangePhrase&&!s.masterStructureId);if(!s)throw new Error('No generated Phrase');structures.remove(s.id);record('deleted-generated-template');return 'Original generated Phrase view deleted; A/B copies preserved.';},
 async restoreManual(){const p=await (await fetch('../resources/debug-output/structure-instances-2026-10-14T20-05-42-271Z.json')).json();if(!window.Persistence.applySnapshot(p.snapshot))throw new Error('Saved linked graph rejected');record('restored-linked-graph');return 'Saved linked graph restored.';},
 focusCopy(){const p=[...document.querySelectorAll('.toy-panel')].find(p=>p.dataset.sharedDefinitionId==='toy-definition:phrase-draw-1'&&p.dataset.linkedCopyNumber==='2');if(!p)throw new Error('No second Draw B copy');window.requestToyFocus?.(p,{center:true});window.centerBoardOnElement?.(p,.9,{duration:200});return 'Editing the visible Draw B.2 copy.';},
 async editCopy(){const p=[...document.querySelectorAll('.toy-panel')].find(p=>p.dataset.sharedDefinitionId==='toy-definition:phrase-draw-1'&&p.dataset.linkedCopyNumber==='2');if(!p?.__drawToy)throw new Error('Copy has no editable DrawGrid');const state=p.__drawToy.getState();state.nodes.list=Array.from({length:8},()=>[3]);state.nodes.active=Array(8).fill(true);state.nodes.disabled=Array.from({length:8},()=>[]);state.strokes=[];state.meta={preserveNodesOverStrokes:true};await p.__drawToy.setState(state);record('edited-copy-b');return 'Edited Draw B.2 directly.';},
 reorderCopy(){const s=copies().at(-1);if(!s)throw new Error('No second Phrase');const e=model.list('sequence').filter(e=>e.from.objectId===s.id).sort((a,b)=>a.from.portId.localeCompare(b.from.portId)),ordered=[e[0],e[2],e[1],e[3]];model.transaction(()=>{e.forEach(e=>model.disconnect(e.id));ordered.forEach((e,i)=>{const r=model.connect('sequence',{objectId:s.id,portId:'child:'+i},e.to);if(!r.ok)throw new Error(r.reason);});});record('reordered-copy');return 'Edited second Phrase ordering directly.';},
 moveCopy(){const s=copies().at(-1);structures.move(s.id,s.x+700,s.y+200);record('moved-copy');return 'Moved second Phrase only.';},
 deleteOriginal(){structures.remove('phrase-proof-master');record('deleted-original');return 'Original Phrase view deleted; linked views remain.';},
 async load(){
  const snap=await fixture(),source=snap.toys.find(t=>t.id==='proof-melody');
  snap.toys=Array.from({length:4},(_,i)=>({...structuredClone(source),id:'phrase-draw-'+i,toyName:'Draw '+['A','B','C','D'][i],ui:{left:'550px',top:(200+i*460)+'px'}}));
  snap.structureToys=[{id:'phrase-proof-master',type:'sequence',name:'Phrase Proof',x:200,y:220,outputCount:5,collapsed:false}];snap.chains=[];
  snap.connections=snap.toys.map((t,i)=>({id:'phrase-child-'+i,kind:'sequence',from:{objectId:'phrase-proof-master',portId:'child:'+i},to:input(t.id)}));
  window.Persistence.applySnapshot(snap);report.events=[];record('manual-loaded');
  window.centerBoardOnWorldPoint?.(400,380,.7,{duration:0});return 'Master loaded: header → Advanced → Create Linked Copy twice.';
 },
 contexts(){
  const list=copies();if(list.length!==2)throw new Error('Create two linked copies using the Sequence Advanced menu first.');
  model.transaction(()=>structures.suspend(()=>list.forEach((copy,i)=>{
   const chord=structures.createStandalone('chord-progression',{x:1000,y:200+i*1100,name:i?'B context':'A context',collapsed:true});
   structures.setProgression(chord.id,{chords:(i?['F','G','A','C']:['C','A','F','G']).map(root=>({root,quality:root==='A'?'minor':'major'}))});
   const a=model.connect('transport',{objectId:'main-heartbeat',portId:'output'},input(chord.id)),b=model.connect('sequence',{objectId:chord.id,portId:'child:0'},input(copy.id));if(!a.ok||!b.ok)throw new Error('Context connections failed.');
  })));
  list.forEach(s=>window.arrangeSubgraph?.(model.getParent(s.id).from.objectId));record('contexts');return 'Both copies powered with independent C/Am/F/G and F/G/Am/C contexts.';
 },
 async edit(){
  const p=document.getElementById('phrase-draw-2'),state=p.__drawToy.getState();state.strokes=[];state.nodes.list=Array.from({length:8},()=>[3]);state.nodes.active=Array(8).fill(true);state.nodes.disabled=Array.from({length:8},()=>[]);state.meta={preserveNodesOverStrokes:true};
  await p.__drawToy.setState(state);record('edited-c');return 'Draw C changed through normal source state; future notes should update in both copies.';
 },
 reorder(){
  model.transaction(()=>{model.list('sequence').filter(e=>e.from.objectId==='phrase-proof-master').forEach(e=>model.disconnect(e.id));[0,2,1,3].forEach((n,i)=>{const r=model.connect('sequence',{objectId:'phrase-proof-master',portId:'child:'+i},input('phrase-draw-'+n));if(!r.ok)throw new Error(r.reason);});});record('reordered');return 'Master order is now A/C/B/D in both copies.';
 },
 delete(){const first=copies()[0];if(!first)throw new Error('No linked copy');structures.remove(first.id);record('deleted-first');return 'First linked Sequence and its children removed; sibling and Masters retained.';},
 reload(){window.Persistence.markDirty();window.Persistence.flushAutosaveNow();record('before-reload');sessionStorage.setItem('structure-proof-report',JSON.stringify(report));location.reload();return 'Reloading saved graph';},
 async arrange(){
  const snap=await fixture();snap.toys=snap.toys.filter(t=>t.id!=='proof-melody');snap.structureToys=[];snap.chains=[];snap.connections=snap.toys.map(t=>({id:'fill-root-'+t.id,kind:'transport',from:{objectId:'main-heartbeat',portId:'output'},to:input(t.id)}));
  window.Persistence.applySnapshot(snap);report.events=[];record('arrange-loaded');return 'Missing-melody fixture loaded. Use the normal Arrange button.';
 },
 async save(){
  record('saved');const snapshot=window.Persistence.getSnapshot();
  const payload={...report,createdAt:new Date().toISOString(),snapshot,currentRelationship:{flashed:[...document.querySelectorAll('.relationship-flash')].map(p=>p.id),paths:document.querySelectorAll('.relationship-tethers path').length},chordIndicators:window.__chordIndicatorObservations,panels:[...document.querySelectorAll('.toy-panel')].map(p=>({id:p.id,masterToyId:p.dataset.masterToyId,structureInstanceId:p.dataset.structureInstanceId,name:p.dataset.toyName,volume:p.dataset.toyVolume,muted:p.dataset.toyMuted,editor:p.__drawToy?.getState?.()||p.__gridState,pattern:p.__seqPattern,activePattern:p.__seqPatternActive,controls:p.querySelectorAll('.toy-header button').length,transport:getPanelTransport(p)?.getState?.()}))};
  const fileName='structure-instances-'+payload.createdAt.replace(/[:.]/g,'-')+'.json',response=await fetch('http://localhost:5174/debug-output',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileName,text:JSON.stringify(payload,null,2)})});if(!response.ok)throw new Error('Save HTTP '+response.status);return 'Saved resources/debug-output/'+fileName;
 },
 async restore(){const action=report.actions.findLast(a=>a.snapshot.structureToys.some(s=>s.autoArrange?.root));const snapshot=action?.snapshot||(await (await fetch('../resources/debug-output/structure-instances-2026-10-14T19-25-44-874Z.json')).json()).snapshot;window.Persistence.applySnapshot(snapshot);record('restored-arrangement');return 'Saved arrangement restored.';}
};
const prior=sessionStorage.getItem('structure-proof-report');if(prior){const parsed=JSON.parse(prior);Object.assign(report,parsed);sessionStorage.removeItem('structure-proof-report');record('after-reload');}
