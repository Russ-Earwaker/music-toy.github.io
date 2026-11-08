import test from 'node:test';
import assert from 'node:assert/strict';
import {simpleHelpLabel,collectSimpleHelpTargets,placeSimpleHelpLabels} from '../src/simple-help-labels.js';

function node(label,rect={left:100,top:100,right:140,bottom:140,width:40,height:40},parent=null){
 return {dataset:label?{simpleHelp:label}:{},isConnected:true,parentElement:parent,hidden:false,attrs:{},textContent:'',title:'',getAttribute(k){return this.attrs[k]??null;},closest:()=>null,getBoundingClientRect:()=>rect};
}
function environment(nodes,width=600,height=400){return {root:{querySelectorAll:()=>nodes},win:{innerWidth:width,innerHeight:height,getComputedStyle:n=>({display:'block',visibility:'visible',opacity:'1',overflowX:'visible',overflowY:'visible',...n.css})}};}

test('Simple ignores automatic and legacy name labels; explicit functional copy is retained',()=>{
 const target=node('auto');target.attrs['aria-label']='Scissors';assert.equal(simpleHelpLabel(target),'');target.dataset={helpLabel:'Volume'};assert.equal(simpleHelpLabel(target),'');target.dataset.simpleHelp='Drag to aim the launch.';assert.equal(simpleHelpLabel(target),'Drag to aim the launch.');
});
test('shape choices and sound wells do not need their own labels',()=>{
 for(const name of ['Cube','Triangle','Piano','Bell']){const option=node();option.attrs['aria-label']=name;option.textContent=name;assert.equal(simpleHelpLabel(option),'');}
});
test('group descriptions suppress nested controls except meaningful special actions',()=>{
 const group=node('Choose a sound and how often to repeat.');group.dataset.simpleHelpGroup='true';
 const loop=node('Choose how many loops before repeating.',undefined,group);assert.equal(simpleHelpLabel(loop),'');
 const clear=node('Erase the recorded pattern.',undefined,group);clear.dataset.simpleHelpDetail='true';assert.equal(simpleHelpLabel(clear),'Erase the recorded pattern.');
});
for(const state of ['hidden','display','opacity','visibility','removed'])test(`Help omits ${state} ancestors and deleted targets`,()=>{
 const parent=node(),target=node('Draw',undefined,parent),e=environment([target]);
 if(state==='hidden')parent.hidden=true;if(state==='display')parent.css={display:'none'};if(state==='opacity')parent.css={opacity:'0'};if(state==='visibility')parent.css={visibility:'hidden'};if(state==='removed')target.isConnected=false;
 assert.deepEqual(collectSimpleHelpTargets(e.root,e.win),[]);
});
test('viewport and scrolling palette clips filter unavailable targets',()=>{
 const clip=node(null,{left:0,top:0,right:80,bottom:80,width:80,height:80});clip.css={overflowX:'hidden',overflowY:'hidden'};
 const off=node('Drum',undefined,clip),on=node('Shape',{left:10,top:10,right:50,bottom:50,width:40,height:40},clip),e=environment([off,on]);assert.deepEqual(collectSimpleHelpTargets(e.root,e.win).map(e=>e.label),['Shape']);
});
test('dynamic state and camera geometry are read fresh without mutating targets',()=>{
 let rect={left:100,top:100,right:140,bottom:140,width:40,height:40};const t=node('Draw');t.getBoundingClientRect=()=>rect;const e=environment([t]),before=JSON.stringify(t.dataset);
 assert.equal(collectSimpleHelpTargets(e.root,e.win)[0].rect.left,100);rect={...rect,left:200,right:280,width:80};assert.equal(collectSimpleHelpTargets(e.root,e.win)[0].rect.width,80);assert.equal(JSON.stringify(t.dataset),before);
 t.dataset.simpleHelp='Scissors';assert.equal(collectSimpleHelpTargets(e.root,e.win)[0].label,'Scissors');
});
test('compact screen layout avoids target and label overlap near all screen edges',()=>{
 const entries=[{left:0,top:0,right:40,bottom:40},{left:280,top:0,right:320,bottom:40},{left:0,top:200,right:40,bottom:240},{left:280,top:200,right:320,bottom:240}].map(rect=>({rect,width:90,height:24,position:'top'}));
 const placed=placeSimpleHelpLabels(entries,320,240),overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
 for(let i=0;i<placed.length;i++){const p=placed[i];assert.ok(p.box.left>=0&&p.box.right<=320&&p.box.top>=0&&p.box.bottom<=240);assert.equal(overlap(p.box,p.entry.rect),false);for(let j=0;j<i;j++)assert.equal(overlap(p.box,placed[j].box),false);}
});

test('opaque screen UI suppresses covered board labels without hiding its own targets',()=>{
 const t=node('Shape');t.contains=()=>false;const e=environment([t]);e.root.elementFromPoint=()=>({closest:()=>({contains:()=>false})});assert.deepEqual(collectSimpleHelpTargets(e.root,e.win),[]);
 e.root.elementFromPoint=()=>({closest:()=>({contains:()=>true})});assert.equal(collectSimpleHelpTargets(e.root,e.win).length,1);
});
