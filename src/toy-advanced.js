// Shared presentation only: no transport, scheduling or authored-state changes.
export const ADVANCED_TOYS = Object.freeze(['drawgrid', 'bouncer', 'rippler', 'chordwheel', 'loopgrid', 'loopgrid-drum']);
let openPanel = null;
export function zoomOutPanel({restoreFocus = true} = {}) {
  const panel = openPanel;
  if (!panel) return;
  openPanel = null;
  panel.classList.remove('toy-zoomed');
  panel.querySelector('.toy-advanced-toggle')?.setAttribute('aria-expanded', 'false');
  panel.querySelector('.toy-advanced-panel')?.setAttribute('hidden', '');
  panel.dispatchEvent(new CustomEvent('toy-zoom', {detail:{zoomed:false}, bubbles:true}));
  if (restoreFocus && panel.isConnected) panel.querySelector('.toy-advanced-toggle')?.focus();
}
export function zoomInPanel(panel) {
  if (!panel || !ADVANCED_TOYS.includes(panel.dataset.toy) || !panel.querySelector('.toy-advanced-panel')) return;
  if (openPanel === panel) return;
  zoomOutPanel({restoreFocus:false});
  openPanel = panel;
  panel.classList.add('toy-zoomed');
  panel.querySelector('.toy-advanced-toggle').setAttribute('aria-expanded', 'true');
  const shelf = panel.querySelector('.toy-advanced-panel');
  shelf.style.top = ((panel.querySelector('.toy-header')?.offsetHeight || 80) + 8) + 'px';
  shelf.removeAttribute('hidden');
  panel.dispatchEvent(new CustomEvent('toy-zoom', {detail:{zoomed:true}, bubbles:true}));
  for(const key of ['musical','pattern','pitch','motion','timing','chords','randomise','reuse']){const group=shelf.querySelector('[data-group="'+key+'"]');if(group)shelf.append(group);}
  panel.querySelector('.toy-advanced-close').focus();
}
export function installToyAdvanced(panel) {
  if (!ADVANCED_TOYS.includes(panel.dataset.toy) || panel.querySelector('.toy-advanced-toggle')) return;
  const right = panel.querySelector('.toy-controls-right');
  if (!right) return;
  panel.classList.add('toy-advanced-inline');
  const toggle = document.createElement('button');
  toggle.type='button';toggle.className='toy-btn toy-mode-btn toy-advanced-toggle';
  toggle.textContent='Advanced >';toggle.setAttribute('aria-expanded','false');
  const shelf=document.createElement('section');shelf.className='toy-advanced-panel';shelf.hidden=true;
  shelf.id='advanced-'+panel.id;shelf.setAttribute('aria-label','Advanced controls');toggle.setAttribute('aria-controls',shelf.id);
  const heading=document.createElement('strong');heading.textContent='ADVANCED';
  const close=document.createElement('button');close.type='button';close.className='toy-btn toy-advanced-close';close.textContent='Close';
  const title=document.createElement('div');title.className='toy-advanced-heading';title.append(heading,close);shelf.append(title);
  toggle.addEventListener('click',event=>{event.stopPropagation();if(panel===openPanel)zoomOutPanel();else zoomInPanel(panel);});
  close.addEventListener('click',event=>{event.stopPropagation();zoomOutPanel();});
  for(const el of [toggle,shelf])el.addEventListener('pointerdown',event=>event.stopPropagation());
  shelf.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();event.preventDefault();zoomOutPanel();}});
  right.append(toggle);panel.append(shelf);
  const reuse=advancedGroup(panel,'reuse','Linked toys');
  const instance=document.createElement('button');instance.type='button';instance.className='toy-btn';instance.textContent='Create Linked Copy';
  instance.addEventListener('click',event=>{event.stopPropagation();zoomOutPanel();window.MusicToyFactory?.createInstance?.(panel,{focus:true});});reuse.append(instance);
}
export function advancedGroup(panel, key, label) {
  const shelf=panel.querySelector('.toy-advanced-panel');if(!shelf)return null;
  let group=shelf.querySelector('[data-group="'+key+'"]');
  if(!group){group=document.createElement('div');group.className='toy-advanced-group';group.dataset.group=key;
    const title=document.createElement('span');title.className='toy-advanced-label';title.textContent=label;group.append(title);shelf.append(group);}
  return group;
}
export function curateToyAdvanced(panel) {
  if(!panel.querySelector('.toy-advanced-panel'))return;
  for(const control of panel.querySelectorAll('[data-action="random-blocks"], [data-action="random-notes"], [data-action="random-cubes"]')){
    const group=advancedGroup(panel,'randomise','Randomise');
    control.classList.remove('c-btn');control.classList.add('toy-btn');control.textContent=control.dataset.action==='random-notes'?'Notes':'Pattern';
    control.setAttribute('aria-label','Randomise '+control.textContent.toLowerCase());control.style.marginLeft='0';group.append(control);
  }
  if(panel.dataset.toy==='chordwheel'){
    const group=advancedGroup(panel,'chords','Chords');
    if(!group.querySelector('.toy-advanced-hint')){const hint=document.createElement('span');hint.className='toy-advanced-hint';hint.textContent='Tap the inner chord arrows to change chords.';group.append(hint);}
  }
}
if(typeof document!=='undefined')document.addEventListener('keydown',event=>{if(event.key==='Escape'&&openPanel){event.preventDefault();zoomOutPanel();}});
