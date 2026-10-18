// Minimal foundation UI: choose a connected selection, Open (non-destructive),
// Expand (remove wrapper), and Delete (remove owned graph). No musical behavior.
export function installContainerBoard({containers,getWorld,getCandidates,onRender,onDirty,onOpenChange=()=>{},onExpand=()=>{},renderSurface=()=>{},disposeSurface=()=>{},handleInteraction=()=>{},getScale=()=>1}){
 const cards=new Map();
 const style=document.createElement('style');style.textContent=`
 .container-toy{position:absolute;box-sizing:border-box;z-index:110;background:#172b40;border:2px solid #91c4e0;border-radius:20px;color:#eff9ff;padding:14px;font:14px system-ui;box-shadow:0 8px 24px #0005}
 .container-toy header{cursor:grab;touch-action:none;font-weight:650;margin-bottom:10px}.container-toy button{margin:3px;padding:6px 9px}.container-toy .container-summary{font-size:12px;color:#b5cbda;margin-bottom:7px}
 .container-toy[data-open="true"]{transform:translateY(-170px)}
 .container-selection{position:fixed;z-index:20000;max-height:75vh;max-width:450px;overflow:auto;background:#142438;color:white;border:1px solid #9ec4df;border-radius:16px;padding:20px}.container-selection label{display:block;padding:6px}.container-selection p{max-width:350px}.container-selection button{margin:8px 4px;padding:8px}.container-select-button{position:fixed;right:18px;bottom:100px;z-index:1250;padding:10px 15px;border-radius:20px}
 body.internal-board-active .container-select-button,body.free-play-active .container-select-button{display:none}
 `;document.head.append(style);
 const select=document.createElement('button');select.type='button';select.textContent='Collapse Selection';select.className='container-select-button';document.body.append(select);
 function render(){
  const world=getWorld();if(!world)return;
  const records=containers.list(),present=new Set(records.map(c=>c.id));
  for(const [id,card]of cards)if(!present.has(id)){disposeSurface(id);card.remove();cards.delete(id);}
  for(const c of records){let card=cards.get(c.id);
   if(!card){card=document.createElement('section');card.id=c.id;card.className='container-toy';card.dataset.containerToy='';card.setAttribute('aria-label','Container Toy');
    const header=document.createElement('header');header.textContent='Container';card.append(header);
    const summary=document.createElement('div');summary.className='container-summary';card.append(summary);
    const surface=document.createElement('div');surface.className='container-surface';card.append(surface);
    for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])surface.addEventListener(type,event=>handleInteraction(c.id,event));
    for(const [action,label]of [['open','Open'],['expand','Expand onto Board'],['delete','Delete Container']]){const b=document.createElement('button');b.type='button';b.dataset.containerAction=action;b.textContent=label;card.append(b);}
    card.addEventListener('click',e=>{const action=e.target.closest('button')?.dataset.containerAction;if(!action)return;
     const before=containers.get(c.id);
     const result=action==='open'?containers.open(c.id,!containers.get(c.id).presentation.state.open):action==='expand'?containers.expand(c.id):containers.remove(c.id);
     if(result?.ok===false)showStatus(result.reason);
     else if(action==='open')onOpenChange(result);else if(action==='expand')onExpand(before);
    });
    header.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.stopPropagation();e.preventDefault();containers.captureLayout(c.id);const start=containers.get(c.id).bounds,scale=getScale()||1;header.setPointerCapture(e.pointerId);
     const move=ev=>containers.move(c.id,start.x+(ev.clientX-e.clientX)/scale,start.y+(ev.clientY-e.clientY)/scale);
     const end=()=>{header.removeEventListener('pointermove',move);header.removeEventListener('pointerup',end);header.removeEventListener('pointercancel',end);};
     header.addEventListener('pointermove',move);header.addEventListener('pointerup',end);header.addEventListener('pointercancel',end);
    });cards.set(c.id,card);
   }
   if(card.parentElement!==world)world.append(card);
   const open=c.presentation.state.open;
   Object.assign(card.style,{left:c.bounds.x+'px',top:c.bounds.y+'px',width:(open?280:c.bounds.width)+'px',minHeight:(open?140:c.bounds.height)+'px'});card.dataset.open=String(open);
   card.style.setProperty('--simple-draw-height',c.bounds.height+'px');
   card.dataset.presentation=c.presentation.type;card.querySelector('header').textContent=c.presentation.type==='simple-draw'?'Simple Draw':'Container';card.setAttribute('aria-label',c.presentation.type==='simple-draw'?'Simple Draw':'Container Toy');
   card.querySelector('.container-surface').hidden=open;
   card.querySelector('[data-container-action="expand"]').disabled=!c.internalObjectIds.length;
   card.querySelector('[data-container-action="open"]').textContent=c.presentation.state.open?'Close':'Open';
   card.querySelector('.container-summary').textContent=`${c.internalObjectIds.length} objects · ${containers.durationOf(c.id)} ticks`;
   renderSurface(c.id,card.querySelector('.container-surface'));
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
 return {render,cards:()=>[...cards.values()],dispose(){unsubscribe();for(const card of cards.values())card.remove();select.remove();status.remove();style.remove();hide.remove();}};
}
