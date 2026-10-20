import {decorateCircularControl} from './circular-control.js';
import {uiMode} from './ui-mode.js';
import {expressiveControl,setExpressiveControlsVisible,isExpressiveContainer} from './expressive-toy-chrome.js';
// Minimal foundation UI: choose a connected selection, Open (non-destructive),
// Expand (remove wrapper), and Delete (remove owned graph). No musical behavior.
export function installContainerBoard({containers,getWorld,getCandidates,onRender,onDirty,onOpenChange=()=>{},onExpand=()=>{},renderSurface=()=>{},disposeSurface=()=>{},handleInteraction=()=>{},mountVolume=()=>null,getScale=()=>1}){
 const cards=new Map();
 const style=document.createElement('style');style.textContent=`
 .container-toy{position:absolute;box-sizing:border-box;z-index:110;background:#172b40;border:2px solid #91c4e0;border-radius:20px;color:#eff9ff;padding:14px;font:14px system-ui;box-shadow:0 8px 24px #0005}
 .container-toy header{cursor:grab;touch-action:none;font-weight:650;margin-bottom:10px}.container-toy:not(.expressive-toy) button{margin:3px;padding:6px 9px}.container-toy .container-summary{font-size:12px;color:#b5cbda;margin-bottom:7px}
 .container-toy[data-open="true"]{transform:translateY(-170px)}
 .container-selection{position:fixed;z-index:20000;max-height:75vh;max-width:450px;overflow:auto;background:#142438;color:white;border:1px solid #9ec4df;border-radius:16px;padding:20px}.container-selection label{display:block;padding:6px}.container-selection p{max-width:350px}.container-selection button{margin:8px 4px;padding:8px}.container-select-button{position:fixed;right:18px;bottom:100px;z-index:1250;padding:10px 15px;border-radius:20px}
 body.internal-board-active .container-select-button,body.free-play-active .container-select-button{display:none}
 `;document.head.append(style);
 const select=document.createElement('button');select.type='button';select.textContent='Collapse Selection';select.className='container-select-button';document.body.append(select);
 function render(){
  const world=getWorld();if(!world)return;
  const records=containers.list(),present=new Set(records.map(c=>c.id));
  if(uiMode.isSimple()) { const opened=records.find(c=>c.presentation.state.open); if(opened){containers.open(opened.id,false);return;} }
  for(const [id,card]of cards)if(!present.has(id)){card.__containerVolume?.dispose();disposeSurface(id);card.remove();cards.delete(id);}
  for(const c of records){let card=cards.get(c.id);
   if(!card){card=document.createElement('section');card.id=c.id;card.className='container-toy';card.dataset.containerToy='';card.setAttribute('aria-label','Container Toy');
    const header=document.createElement('header'),title=document.createElement('span');title.className='container-title';header.append(title);
    const handle=expressiveControl(document.createElement('button'),{kind:'drag',label:'Simple Draw controls'});handle.classList.add('simple-container-handle');handle.setAttribute('aria-expanded','false');header.append(handle);card.append(header);
    const chrome=document.createElement('div');chrome.className='expressive-toy-controls';chrome.setAttribute('aria-label','Toy controls');card.append(chrome);
    const summary=document.createElement('div');summary.className='container-summary';card.append(summary);
    const surface=document.createElement('div');surface.className='container-surface';card.append(surface);
    for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])surface.addEventListener(type,event=>handleInteraction(c.id,event));
    const actions=document.createElement('div');actions.className='container-actions';actions.setAttribute('role','group');actions.setAttribute('aria-label','Container actions');actions.id=c.id+'-actions';handle.setAttribute('aria-controls',actions.id);chrome.append(actions);
    for(const [action,label]of [['open','Open'],['expand','Expand onto Board'],['delete','Delete Container']]){const b=action==='open'?expressiveControl(document.createElement('button'),{kind:'enter',label}):decorateCircularControl(document.createElement('button'),{label,asset:action==='delete'?'T_ButtonTrash':undefined,icon:'expand',size:62});b.dataset.containerAction=action;actions.append(b);}
    const toggle=()=>{if(!isExpressiveContainer(card.dataset.presentation))return;setExpressiveControlsVisible(card,card.dataset.controlsVisible!=='1');};
    handle.addEventListener('click',e=>{e.stopPropagation();if(e.detail===0)toggle();});
    card.addEventListener('keydown',e=>{if(e.key==='Escape')setExpressiveControlsVisible(card,false);});
    card.addEventListener('click',e=>{const action=e.target.closest('button')?.dataset.containerAction;if(!action)return;
     if(uiMode.isSimple() && action!=='delete')return;
     const before=containers.get(c.id);
     const result=action==='open'?containers.open(c.id,!containers.get(c.id).presentation.state.open):action==='expand'?containers.expand(c.id):containers.remove(c.id);
     if(result?.ok===false)showStatus(result.reason);
     else if(action==='open')onOpenChange(result);else if(action==='expand')onExpand(before);
    });
    header.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('button')&& !handle.contains(e.target))return;e.stopPropagation();e.preventDefault();const start=containers.get(c.id).bounds,scale=getScale()||1;let moved=false;header.setPointerCapture(e.pointerId);
     const move=ev=>{if(ev.pointerId!==e.pointerId)return;const rawX=ev.clientX-e.clientX,rawY=ev.clientY-e.clientY;if(!moved&&Math.abs(rawX)<6&&Math.abs(rawY)<6)return;if(!moved){containers.captureLayout(c.id);moved=true;}containers.move(c.id,start.x+rawX/scale,start.y+rawY/scale);};
     const end=ev=>{if(ev.pointerId!==e.pointerId)return;header.removeEventListener('pointermove',move);header.removeEventListener('pointerup',end);header.removeEventListener('pointercancel',end);header.removeEventListener('lostpointercapture',end);if(ev.type==='pointerup'&&!moved)toggle();};
     header.addEventListener('pointermove',move);header.addEventListener('pointerup',end);header.addEventListener('pointercancel',end);header.addEventListener('lostpointercapture',end);
    });cards.set(c.id,card);
   }
   if(card.parentElement!==world)world.append(card);
   const open=c.presentation.state.open;
   Object.assign(card.style,{left:c.bounds.x+'px',top:c.bounds.y+'px',width:(open?280:c.bounds.width)+'px',minHeight:(open?140:c.bounds.height)+'px'});card.dataset.open=String(open);
   card.style.setProperty('--simple-draw-height',c.bounds.height+'px');
   const expressive=isExpressiveContainer(c.presentation.type),label=c.presentation.type==='simple-bouncer'?'Simple Bouncer':c.presentation.type==='simple-draw'?'Simple Draw':'Container';
   card.dataset.presentation=c.presentation.type;card.classList.toggle('expressive-toy',expressive);card.querySelector('.container-title').textContent=label;card.setAttribute('aria-label',label);
   const handle=card.querySelector('.simple-container-handle');handle.hidden=!expressive;handle.setAttribute('aria-label',label+' controls');
   card.querySelector('[data-container-action="delete"]').hidden=expressive;
   card.querySelector('.container-surface').hidden=open;
   card.querySelector('[data-container-action="expand"]').disabled=!c.internalObjectIds.length;
   const openButton=card.querySelector('[data-container-action="open"]');openButton.setAttribute('aria-label',open?'Close':'Open');openButton.title=open?'Close — return to the drawing':'Open — inspect the contained graph';card.querySelector('[data-container-action="expand"]').title='Expand onto Board — remove the wrapper and reveal its toys';
   card.querySelector('.container-summary').textContent=`${c.internalObjectIds.length} objects · ${containers.durationOf(c.id)} ticks`;
   renderSurface(c.id,card.querySelector('.container-surface'));
   if(expressive){
    const strip=card.querySelector('.expressive-toy-controls'),tools=card.querySelector('.simple-draw-controls,.simple-bouncer-controls');
    if(tools&&tools.parentElement!==strip)strip.prepend(tools);
    if(!card.__containerVolume){const volume=document.createElement('div');volume.className='art-toy-volume';strip.insertBefore(volume,card.querySelector('.container-actions'));card.__containerVolume=mountVolume(volume,card);}
    card.__containerVolume?.sync();
   }
  }
  for(const {id}of getCandidates()){const node=document.getElementById(id);if(node)node.classList.toggle('container-internal-hidden',!containers.isVisible(id));}
  onRender?.();
 }
 const hide=document.createElement('style');hide.textContent='.container-internal-hidden{visibility:hidden!important;pointer-events:none!important}';document.head.append(hide);
 const status=document.createElement('p');status.setAttribute('role','status');status.style.cssText='position:fixed;bottom:150px;right:18px;z-index:20001;max-width:360px;background:#142438;color:white;padding:10px;border-radius:10px';status.hidden=true;document.body.append(status);
 function showStatus(message){status.textContent=message;status.hidden=false;}
 select.addEventListener('click',()=>{
  const dialog=document.createElement('dialog');dialog.className='container-selection';const title=document.createElement('h3');title.textContent='Collapse Selection';dialog.append(title);
  const hint=document.createElement('p');hint.textContent='Choose a connected graph with one entry and one exit. Its toys and music stay unchanged.';dialog.append(hint);
  const choices=getCandidates().filter(c=>!containers.owner(c.id));
  for(const c of choices){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=c.id;label.append(input,document.createTextNode(' '+c.label));dialog.append(label);}
  const result=document.createElement('p');result.setAttribute('role','status');dialog.append(result);
  const collapse=document.createElement('button');collapse.textContent='Collapse';collapse.addEventListener('click',()=>{const outcome=containers.collapse([...dialog.querySelectorAll('input:checked')].map(n=>n.value));if(outcome.ok){dialog.close();dialog.remove();}else result.textContent=outcome.reason;});
  const cancel=document.createElement('button');cancel.textContent='Cancel';cancel.addEventListener('click',()=>{dialog.close();dialog.remove();});dialog.append(collapse,cancel);dialog.addEventListener('cancel',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
 });
 const unsubscribe=containers.subscribe(()=>{render();onDirty?.();});render();
 return {render,cards:()=>[...cards.values()],dispose(){unsubscribe();for(const card of cards.values()){card.__containerVolume?.dispose();card.remove();}select.remove();status.remove();style.remove();hide.remove();}};
}
