import {shapePreviewGeometry} from './simple-shapes.js';
export {simpleShapes} from './simple-shapes.js';
// Decorative SVG only: no board objects, audio, timers, or saved state.

export function toyPreview(type) {
 const pad=(x,y,delay=0)=>`<circle class="preview-pad" style="animation-delay:${delay}s" cx="${x}" cy="${y}" r="9"/>`;
 const strings=count=>Array.from({length:count},(_,i)=>`<path class="preview-string" style="animation-delay:${i*.18}s" d="M${count===1?32:18+i*10} 8 Q${count===1?32:18+i*10} 24 ${count===1?32:18+i*10} 40"/>`).join('');
 const art={
  'physical-cube':'<g class="preview-cube"><path d="m32 8 16 9v18l-16 9-16-9V17Z"/><path d="m16 17 16 9 16-9M32 26v18"/></g>',
  'physical-ball':'<path d="M8 30h12v7H8zM49 9v32"/><path class="preview-guide" d="m19 33 27-17-14-9"/><circle class="preview-ball" cx="19" cy="33" r="4"/>',
  'physical-gravity-ball':'<path d="m7 31 10-7 4 6-10 7M12 42h44"/><path class="preview-guide" d="M18 29Q35-12 44 39q4-16 10 0"/><circle class="preview-gravity" cx="18" cy="29" r="4"/>',
  'simple-ripple':'<circle cx="27" cy="25" r="3"/><circle class="preview-ripple" cx="27" cy="25" r="7"/><circle class="preview-target" cx="51" cy="25" r="5"/>',
  'simple-draw':'<path class="preview-paint" d="M8 33Q16 5 28 26T55 15"/><g class="preview-notes"><circle cx="18" cy="20" r="3"/><circle cx="36" cy="29" r="3"/><circle cx="52" cy="20" r="3"/></g><path class="preview-pointer" d="m4 27 8 3-6 5Z"/>',
  'simple-drum':`${pad(32,25)}<circle class="preview-ripple" cx="32" cy="25" r="13"/><path class="preview-tap" d="m30 6 2 8 2-8"/>`,
  'simple-drum-set':`${pad(18,17)}${pad(43,17,.45)}${pad(30,34,.9)}<path d="m7 36 9-1m31 0 9 1"/>`,
  'simple-string':`${strings(1)}<path d="M26 15h12M26 24h12M26 33h12"/><path class="preview-swipe" d="M12 26h40m-6-4 6 4-6 4"/>`,
  'simple-strum':`${strings(4)}<path class="preview-swipe" d="M8 25h48m-6-4 6 4-6 4"/>`,
 };
 const shape=type.startsWith('shape:')?`<g class="preview-cube">${shapePreviewGeometry(type.slice(6))}</g>`:null;
 return `<svg class="toy-preview" viewBox="0 0 64 50" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${shape||art[type]||''}</svg>`;
}
