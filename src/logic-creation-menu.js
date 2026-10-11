import { logicNodeLabel } from './modifier-types.js';

export const BASIC_LOGIC_TYPES = Object.freeze(['sequence', 'together', 'repeat']);
export const ADVANCED_LOGIC_GROUPS = Object.freeze([
  Object.freeze({label:'Structure', types:Object.freeze(['timeline'])}),
  Object.freeze({label:'Musical', types:Object.freeze(['chord-progression', 'transpose'])}),
]);
const descriptions = {
  sequence:'Play one after another.', together:'Play at the same time.', repeat:'Repeat a pattern.',
  timeline:'Arrange when parts begin.', 'chord-progression':'Set a chord progression for a branch.',
  transpose:'Shift pitches across a branch.',
};
export function logicCreationEntry(type) {
  return {type, name:logicNodeLabel(type), description:descriptions[type],
    size:{width:type==='chord-progression'?360:type==='timeline'?440:224,height:type==='chord-progression'?360:144}};
}

let activePopup = null;
export function closeAdvancedLogic({restoreFocus=true}={}) {
  activePopup?.close(restoreFocus);
}
// Shared presentation for empty-space creation and connection insertion.
// Choosing delegates to the caller's existing factory/promotion path.
export function openAdvancedLogic({anchor, returnFocus=anchor, onChoose, onHeartbeat}={}) {
  closeAdvancedLogic({restoreFocus:false});
  const popup=document.createElement('section');popup.className='advanced-logic-popup';
  popup.setAttribute('role','dialog');popup.setAttribute('aria-label','Advanced Logic');
  const heading=document.createElement('div');heading.className='advanced-logic-heading';
  const title=document.createElement('strong');title.textContent='ADVANCED LOGIC';
  const closeButton=document.createElement('button');closeButton.type='button';closeButton.textContent='Close';
  closeButton.setAttribute('aria-label','Close Advanced Logic');heading.append(title,closeButton);popup.append(heading);
  const makeGroup=(label, entries)=>{
    const group=document.createElement('div');group.className='advanced-logic-group';
    const name=document.createElement('strong');name.textContent=label.toUpperCase();group.append(name);
    for(const entry of entries){const button=document.createElement('button');button.type='button';button.textContent=entry.name;
      button.addEventListener('click',event=>{event.stopPropagation();closeAdvancedLogic();entry.choose();});group.append(button);}
    popup.append(group);
  };
  for(const group of ADVANCED_LOGIC_GROUPS)makeGroup(group.label,group.types.map(type=>({name:logicNodeLabel(type),choose:()=>onChoose?.(type)})));
  // Existing independent transport creation is available only to the dock.
  if(onHeartbeat)makeGroup('Transport',[{name:'Independent Heartbeat',choose:onHeartbeat}]);
  const outside=event=>{if(!popup.contains(event.target))closeAdvancedLogic();};
  const keyboard=event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeAdvancedLogic();}
    if(event.key==='Tab'){
      const buttons=popup.querySelectorAll('button'),first=buttons[0],last=buttons[buttons.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  };
  const record={close(restoreFocus){
    document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',keyboard,true);
    popup.remove();if(activePopup===record)activePopup=null;
    if(restoreFocus&&returnFocus?.isConnected)returnFocus.focus?.();
  }};
  activePopup=record;
  popup.addEventListener('pointerdown',event=>event.stopPropagation());
  closeButton.addEventListener('click',()=>closeAdvancedLogic());
  document.body.append(popup);
  const at=anchor?.getBoundingClientRect?.()||{left:window.innerWidth/2,top:window.innerHeight/2,bottom:window.innerHeight/2};
  popup.style.left=Math.max(8,Math.min(window.innerWidth-popup.offsetWidth-8,at.left))+'px';
  popup.style.top=Math.max(8,Math.min(window.innerHeight-popup.offsetHeight-8,at.bottom+8))+'px';
  document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',keyboard,true);
  closeButton.focus();return popup;
}
