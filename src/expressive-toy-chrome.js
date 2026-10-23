import {decorateCircularControl} from './circular-control.js';
export const isExpressiveContainer=type=>['simple-draw','simple-bouncer'].includes(type);

export function arrangeExpressiveSecondaryControls(controls){
 let row=controls.querySelector('.expressive-secondary');
 if(!row){row=document.createElement('div');row.className='expressive-secondary';controls.append(row);}
 for(const node of controls.querySelectorAll('.art-toy-volume,.art-toy-clear-btn'))if(node.parentElement!==row)row.append(node);
 return row;
}

// Art and content-sized containers share chrome; geometry remains owned by each toy.
export function expressiveControl(button,{kind,label}={}){
 const asset={drag:'T_ButtonDrag',clear:'T_ButtonClear',enter:'T_ButtonEnter'}[kind];
 decorateCircularControl(button,{label,asset});
 button.title={drag:'Drag / Show Controls',clear:'Clear',enter:'Enter Board'}[kind]||label;
 button.style.removeProperty('--c-btn-size');
 button.classList.add(kind==='drag'?'art-toy-drag-btn':'art-toy-btn',`art-toy-${kind==='enter'?'enter':kind}-btn`);
 if(kind==='clear')button.style.setProperty('--accent','#f87171');
 if(kind==='clear'||kind==='enter')button.style.order=kind==='clear'?'99':'100';
 return button;
}

export function setExpressiveControlsVisible(panel,visible){
 panel.dataset.controlsVisible=visible?'1':'0';
 const handle=panel.querySelector('.art-toy-drag-btn');
 handle?.classList.toggle('is-active',visible);
 handle?.setAttribute('aria-pressed',String(visible));
 handle?.setAttribute('aria-expanded',String(visible));
}
