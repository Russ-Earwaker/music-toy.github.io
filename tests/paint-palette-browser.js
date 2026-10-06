import { installPaintPalette } from '../src/paint-palette.js';
installPaintPalette();
const result=document.querySelector('#result'), board=document.querySelector('main');
const a=document.querySelector('#a'), b=document.querySelector('#b');
let calls=0, randomCalls=0, panCalls=0;
for(const panel of [a,b]) {
 panel.addEventListener('toy-instrument',()=>calls++);
 panel.addEventListener('toy-random',()=>randomCalls++);
}
board.addEventListener('pointerdown',()=>panCalls++);
const pointer=(target,type,x,y,id=101)=>target.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:'touch',isPrimary:true,clientX:x,clientY:y,button:0,buttons:type==='pointerup'?0:1,bubbles:true,cancelable:true}));
const centre=el=>{const r=el.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};};
document.querySelector('#run').addEventListener('click',async()=>{
 const passed=[];
 const check=(ok,name)=>{if(!ok)throw new Error(name);passed.push(name);result.textContent=passed.map(n=>'PASS '+n).join('\n');};
 try {
  const root=document.querySelector('#paint-palette'),handle=root.querySelector('.palette-handle');
  const wells=[...root.querySelectorAll('.palette-well')];
  check(wells.length===6,'exactly six wells, collapsed by default');
  handle.click();wells[0].click();
  const p=centre(a),q=centre(b);
  pointer(a,'pointerdown',p.x,p.y);pointer(board,'pointermove',q.x,q.y);
  pointer(board,'pointermove',p.x,p.y);pointer(board,'pointermove',q.x,q.y);pointer(board,'pointerup',q.x,q.y);
  check(calls===2 && a.dataset.instrument===b.dataset.instrument,'touch sweep paints both toys exactly once');
  check(wells[0].getAttribute('aria-pressed')==='true','paint stays equipped after release');
  check(panCalls===0,'painting never starts board pan');
  wells[0].click();check(!document.body.classList.contains('palette-equipped'),'tap selected well clears');
  wells[0].click();pointer(board,'pointerdown',850,400);pointer(board,'pointermove',850,450);pointer(board,'pointerup',850,450);
  check(document.body.classList.contains('palette-equipped') && panCalls===0,'empty-board drag retains tool without pan');
  pointer(board,'pointerdown',850,400);pointer(board,'pointerup',850,400);
  check(!document.body.classList.contains('palette-equipped'),'empty-board tap clears');
  root.querySelector('[data-tool=randomise]').click();const instrument=a.dataset.instrument;
  pointer(a,'pointerdown',p.x,p.y);pointer(board,'pointermove',q.x,q.y);pointer(board,'pointermove',p.x,p.y);pointer(board,'pointerup',p.x,p.y);
  check(randomCalls===2 && a.dataset.instrument===instrument,'Randomise delegates once per toy and retains instrument');
  root.querySelector('[data-tool=eyedropper]').click();const previous=calls;
  pointer(a,'pointerdown',p.x,p.y);pointer(board,'pointermove',q.x,q.y);pointer(board,'pointerup',q.x,q.y);
  check(wells[0].getAttribute('aria-pressed')==='true' && calls===previous,'Eyedropper equips matching paint without painting rest of sampling stroke');
  for(const panel of document.querySelectorAll('[data-toy=sequence],[data-toy=main-heartbeat]')) {
   const c=centre(panel);pointer(panel,'pointerdown',c.x,c.y);pointer(panel,'pointerup',c.x,c.y);
   check(!panel.dataset.instrument,`${panel.dataset.toy} ignores paint`);
  }
  const before=root.getBoundingClientRect();board.style.transform='translate(40px,20px) scale(.7)';
  check(root.getBoundingClientRect().left===before.left && root.getBoundingClientRect().bottom===before.bottom,'palette remains fixed during pan and zoom');board.style.transform='';
  const wellPoint=centre(wells[0]);pointer(wells[0],'pointerdown',wellPoint.x,wellPoint.y);
  await new Promise(resolve=>setTimeout(resolve,600));pointer(wells[0],'pointerup',wellPoint.x,wellPoint.y);
  check(!!document.querySelector('.palette-config[open]'),'long-press opens instrument/colour configuration');
  const colour=document.querySelector('.palette-config input');colour.value='#dd7788';colour.dispatchEvent(new Event('input',{bubbles:true}));
  check(a.dataset.instrumentColour==='#dd7788' && b.dataset.instrumentColour==='#dd7788' && wells[0].style.getPropertyValue('--paint')==='#dd7788','colour configuration updates all shared toy owners and well');
  document.querySelector('.palette-choose').click();
  for(let i=0;i<40 && !document.querySelector('#inst-picker .inst-grid button');i++) await new Promise(resolve=>setTimeout(resolve,50));
  check(!!document.querySelector('#inst-picker .inst-grid button') && !document.querySelector('.palette-config').open,'configuration uses shared instrument picker above released modal');
  document.querySelector('#inst-picker .inst-cancel').click();
  await new Promise(resolve=>setTimeout(resolve,0));
  check(document.querySelector('.palette-config').open,'cancelling shared picker returns to paint configuration');
  document.querySelector('.palette-done').click();
  wells[0].click();pointer(a,'pointerdown',p.x,p.y);window.dispatchEvent(new CustomEvent('scene:new'));
  pointer(board,'pointerup',p.x,p.y);
  check(!document.body.classList.contains('palette-equipped'),'New Creation clears equipped tool and active stroke');
  result.textContent=`${passed.length} browser checks passed\n`+result.textContent;
 }catch(error){result.textContent+='\nFAIL '+error.message;console.error(error);}
});
