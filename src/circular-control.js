// The same three layers used by Art Toys and the rest of Rhythmake.
export const CIRCULAR_BUTTON_HTML='<div class="c-btn-outer"></div><div class="c-btn-glow"></div><div class="c-btn-core"></div>';
const drawings={
 cube:'<path d="m12 2 9 5v10l-9 5-9-5V7l9-5Zm-9 5 9 5 9-5M12 12v10"/>',
 throw:'<circle cx="17" cy="7" r="4"/><path d="M3 21c0-8 4-13 9-14M6 12l6-5-7-2"/>',
 draw:'<path d="m5 19 2-6L17 3l4 4-10 10-6 2Zm3-6 3 3M15 5l4 4"/>',
 scissors:'<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m8 8 13 13M8 16 21 3"/>',
 paint:'<path d="m5 5 9 9 6-6-9-5-6 2Zm-2 10c-4 6 4 9 4 4 0-2-2-3-4-4Z"/><path d="m4 7-2 3 8 8 4-4"/>',
 heal:'<path d="M2 12h6l4-5 4 5h6M8 12l4 5 4-5M12 3v2M12 19v2"/>',
 straighten:'<path d="M2 16c5-18 7 16 12-4s7 4 8-6M3 21h18"/>',
 coil:'<path d="M3 14c1-12 18-11 18 0 0 9-15 8-15 0 0-6 11-6 11 0 0 4-7 4-7 0"/>',
 expand:'<path d="M9 3H3v6M15 3h6v6M3 15v6h6M21 15v6h-6M3 3l6 6M21 3l-6 6M3 21l6-6M21 21l-6-6"/>',
};
export function decorateCircularControl(button,{label,asset,icon,size=48}={}){
 button.type='button';button.classList.add('c-btn');button.setAttribute('aria-label',label);button.title=label;button.innerHTML=CIRCULAR_BUTTON_HTML;button.style.setProperty('--c-btn-size',size+'px');
 const svg=drawings[icon],url=asset?`./assets/UI/${asset}.png`:'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svg||drawings.draw}</svg>`);
 button.querySelector('.c-btn-core').style.setProperty('--c-btn-icon-url',`url("${url}")`);return button;
}

// Presets decorate existing buttons too, preserving classes, data and listeners.
const presets={clear:{label:'Clear',asset:'T_ButtonClear'},enter:{label:'Enter Board',asset:'T_ButtonEnter'},random:{label:'Random',asset:'T_ButtonRandom'},move:{label:'Move',asset:'T_ButtonDrag'},trash:{label:'Delete',asset:'T_ButtonTrash'}};
export function createControl(preset,{button=document.createElement('button'),...options}={}){
 const result=decorateCircularControl(button,{...presets[preset],...options});
 if(preset==='clear'&&!button.style.getPropertyValue('--accent'))button.style.setProperty('--accent','#f87171');
 return result;
}
export const createClearControl=options=>createControl('clear',options);
export const createEnterBoardControl=options=>createControl('enter',options);
export const createRandomControl=options=>createControl('random',options);
export const createMoveControl=options=>createControl('move',options);
export const createTrashControl=options=>createControl('trash',options);
