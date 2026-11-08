import test from 'node:test';
import assert from 'node:assert/strict';
import {Node,dom,walk} from './graph-ui-dom.mjs';
import {createSimpleLoopPeriodButtons,syncSimpleLoopPeriodButtons} from '../src/simple-loop-period-buttons.js';
import {createDrumObjects} from '../src/simple-drum.js';
import {createRippleObjects} from '../src/simple-ripple.js';
import {createStringSurfaces} from '../src/string-surface.js';

for(const kind of ['drum','ripple','string','strum'])test(`${kind} loop buttons update canonical state and restore persisted selection`,()=>{
 const oldDocument=globalThis.document,oldQuery=Node.prototype.querySelectorAll;
 globalThis.document=dom().document;Node.prototype.querySelectorAll=function(selector){return walk(this,n=>n!==this&&n.matches(selector));};
 try{
  const objects=kind==='drum'?createDrumObjects():kind==='ripple'?createRippleObjects():createStringSurfaces();
  const o=objects.create({kind,periodLoops:2,start:{x:0,y:0},end:{x:200,y:0}});
  const root=createSimpleLoopPeriodButtons({value:2,onChange:periodLoops=>objects.update(o.id,{periodLoops})});
  const off=objects.subscribe(()=>syncSimpleLoopPeriodButtons(root,objects.get(o.id).authoredState.periodLoops));
  const buttons=root.querySelectorAll('button'),selected=()=>buttons.filter(b=>b.getAttribute('aria-pressed')==='true');
  assert.equal(root.querySelectorAll('select').length,0);assert.equal(selected()[0].textContent,'2');
  for(let period=1;period<=4;period++){
   buttons[period-1].onclick();assert.equal(objects.get(o.id).authoredState.periodLoops,period);assert.equal(selected().length,1);assert.equal(selected()[0],buttons[period-1]);
   assert.equal(buttons[period-1].getAttribute('aria-label'),period+(period===1?' loop':' loops'));
  }
  const saved=JSON.parse(JSON.stringify(objects.snapshot()));objects.restore(saved);assert.equal(objects.get(o.id).authoredState.periodLoops,4);assert.equal(selected()[0].textContent,'4');
  syncSimpleLoopPeriodButtons(root,4,true);assert.ok(buttons.every(b=>b.disabled));off();
 }finally{globalThis.document=oldDocument;Node.prototype.querySelectorAll=oldQuery;}
});
