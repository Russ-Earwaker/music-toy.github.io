// The legacy Rhythm canvas has eight cubes. Captured finer subdivisions still
// use the same LoopGrid model and scheduler; expose every step in graph mode.
export function installDenseRhythmGrid(panel,host){
 if(!host)return;
 if(!document.getElementById('dense-rhythm-grid-style')){
  const style=document.createElement('style');style.id='dense-rhythm-grid-style';
  style.textContent='.rhythm-dense .sequencer-wrap canvas{visibility:hidden}.dense-rhythm-grid{position:absolute;inset:8px;display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:5px;z-index:4}.dense-rhythm-grid[hidden]{display:none}.dense-rhythm-grid button{min-width:0;min-height:24px;border:1px solid #967150;border-radius:6px;background:#29313a;color:#c7bcb2;font:11px system-ui;cursor:pointer;touch-action:manipulation}.dense-rhythm-grid button[aria-pressed=true]{background:#ee943e;color:#281d15}.dense-rhythm-grid button:focus-visible{outline:2px solid white}';
  document.head.append(style);
 }
 const grid=document.createElement('div');grid.className='dense-rhythm-grid';grid.setAttribute('role','group');grid.setAttribute('aria-label','Rhythm steps');host.append(grid);
 function render(){
  const steps=panel.__gridState?.steps||[];grid.hidden=steps.length<=8;panel.classList.toggle('rhythm-dense',!grid.hidden);
  if(grid.hidden)return;
  if(grid.children.length!==steps.length){grid.replaceChildren(...steps.map((_,i)=>{const b=document.createElement('button');b.type='button';b.textContent=String(i+1);b.setAttribute('aria-label',`Rhythm step ${i+1}`);b.onclick=()=>{const st=panel.__gridState;st.steps[i]=!st.steps[i];panel.dispatchEvent(new CustomEvent('loopgrid:update',{detail:{reason:'toggle',col:i,steps:[...st.steps]},bubbles:true}));};return b;}));}
  steps.forEach((value,i)=>grid.children[i].setAttribute('aria-pressed',String(value)));
 }
 panel.addEventListener('loopgrid:update',render);render();
 panel.addEventListener('toy:remove',()=>{panel.removeEventListener('loopgrid:update',render);grid.remove();},{once:true});
}
