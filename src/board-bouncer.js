import {boardLaunch} from './simple-bouncer-physics.js';

// Board DOM/SVG is presentation only. Physical positions are logical world units;
// playback positions are sampled from canonical transport phase, never simulated.
export function installBoardBouncer({objects,controller,getWorld,getViewport,screenToWorld,createCapture,unlock,canInteract=()=>true,onRelevant=()=>{}}){
 const world=getWorld(),root=document.createElement('div');root.className='board-physical-objects';world.append(root);
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.classList.add('physical-motion-layer');root.append(svg);
 const aim=document.createElementNS(ns,'path');aim.classList.add('physical-launch-preview');svg.append(aim);
 const nodes=new Map(),trails=new Map();let armed=null,gesture=null,frame,lastRelevant=null;
 const hint=document.createElement('p');hint.className='bouncer-board-hint';hint.hidden=true;hint.setAttribute('role','status');document.body.append(hint);
 const show=text=>{hint.textContent=text;hint.hidden=false;};
 const relevant=()=>!!armed||objects.list().length>0;
 function render(){
  updateModes();
  const all=[...objects.list(),...(controller.handles?.()||[])],present=new Set(all.map(o=>o.id));
  for(const [id,node]of nodes)if(!present.has(id)){node.remove();nodes.delete(id);trails.get(id)?.remove();trails.delete(id);}
  for(const o of all){let node=nodes.get(o.id);
   if(!node){node=document.createElement('button');node.type='button';node.id=o.id;node.dataset.physicalId=o.id;node.className=`physical-object physical-${o.kind}`;
    node.addEventListener('keydown',e=>{e.stopPropagation();if(['cube','ball'].includes(o.kind)&&['Delete','Backspace'].includes(e.key)&&!controller.busy()){e.preventDefault();cancel();objects.remove(o.id);}if(e.key==='Enter'&&o.kind==='ball')arm({ballId:o.id});});
    if(o.kind!=='ball')node.addEventListener('pointerdown',e=>startCube(e,o.id));root.append(node);nodes.set(o.id,node);
   }
   node.setAttribute('aria-label',['start','target'].includes(o.kind)?`Ball ${o.kind==='start'?'Start':'Target'}`:o.kind==='cube'?`Cube · ${o.instrument}. Drag to move; Delete to remove.`:'Ball. Drag to throw; Delete to remove.');node.title=node.getAttribute('aria-label');
   const width=o.kind==='cube'?o.width:(o.radius||12)*2,height=o.kind==='cube'?o.height:(o.radius||12)*2;
   Object.assign(node.style,{left:o.x+'px',top:o.y+'px',width:width+'px',height:height+'px'});if(o.kind==='cube')node.style.setProperty('--cube-color',o.color);
  }
  const next=relevant();if(next!==lastRelevant){lastRelevant=next;onRelevant(next);}
 }
 function startCube(e,id){
  e.stopPropagation();if(e.button>0||controller.busy())return;e.preventDefault();
  const cube=objects.get(id)||controller.handles().find(h=>h.id===id),p=screenToWorld(e),node=nodes.get(id),offset={x:p.x-cube.x,y:p.y-cube.y};node.focus({preventScroll:true});node.setPointerCapture(e.pointerId);
  const move=ev=>{if(ev.pointerId!==e.pointerId)return;const point=screenToWorld(ev);const next={x:point.x-offset.x,y:point.y-offset.y};if(cube.containerId)controller.editHandle(cube.containerId,cube.kind,next);else objects.update(id,next);render();};
  const end=ev=>{if(ev.pointerId!==e.pointerId)return;for(const t of ['pointerup','pointercancel','lostpointercapture'])node.removeEventListener(t,end);node.removeEventListener('pointermove',move);};
  node.addEventListener('pointermove',move);for(const t of ['pointerup','pointercancel','lostpointercapture'])node.addEventListener(t,end);
 }
 function arm(options={}){
  if(!canInteract())return false;cancel();armed=options;
  const rect=getViewport().getBoundingClientRect(),point=screenToWorld({clientX:rect.left+rect.width*.47,clientY:rect.top+rect.height*.52,x:rect.left+rect.width*.47,y:rect.top+rect.height*.52});
  if(options.seed!==false&&!objects.near(point).length){for(const [dx,dy]of [[-110,-50],[110,15],[0,170]])objects.addCube(point.x+dx,point.y+dy,{scatter:true});}
  updateModes();document.body.classList.add('bouncer-board-armed');hint.hidden=true;onRelevant(true);updateModes();return true;
 }
 function updateModes(){for(const type of ['ball','cube'])for(const button of document.querySelectorAll('[data-toy-type="physical-'+type+'"]')){const active=!!armed&&(armed.mode||'ball')===type;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));}}
 function cancel(){gesture=null;armed=null;updateModes();aim.setAttribute('d','');hint.hidden=true;document.body.classList.remove('bouncer-board-armed');}
 const swallow=e=>{e.preventDefault();e.stopImmediatePropagation();};
 function down(e){
  if(e.target.closest?.('.toy-spawner-art,.toy-spawner-logic,.toy-spawner-game,.palette-handle')){cancel();return;}
  if(!canInteract()||e.button>0||gesture||!getViewport()?.contains(e.target))return;
  const ball=e.target.closest?.('.physical-ball'),cube=e.target.closest?.('.physical-cube');if(cube||e.target.closest?.('.physical-start,.physical-target'))return;
  if(!ball&&!armed)return;
  if(!ball&&e.target.closest?.('button,input,select,a,.toy-panel,.art-toy-panel,.heartbeat-toy,.container-toy'))return;
  if(controller.busy()){swallow(e);show('This throw is recording. Wait for the phrase to finish, or clear its capture.');return;}
  swallow(e);unlock();ball?.focus({preventScroll:true});const point=screenToWorld(e),ballId=ball?.dataset.physicalId||armed?.ballId||null;
  gesture={pointer:e.pointerId,start:point,current:point,ballId,containerId:armed?.containerId||null,mode:ball?'ball':armed?.mode||'ball'};getViewport().setPointerCapture?.(e.pointerId);
 }
 function move(e){if(e.pointerId!==gesture?.pointer)return;swallow(e);gesture.current=screenToWorld(e);if(gesture.mode==='cube')return;const {start:a,current:b}=gesture,length=Math.hypot(b.x-a.x,b.y-a.y)||1,ux=(b.x-a.x)/length,uy=(b.y-a.y)/length;
  aim.setAttribute('d',`M${a.x} ${a.y}L${b.x} ${b.y}m${-ux*20+uy*10} ${-uy*20-ux*10}L${b.x} ${b.y}l${-ux*20-uy*10} ${-uy*20+ux*10}`);
 }
 async function up(e){
  if(e.pointerId!==gesture?.pointer)return;swallow(e);const g=gesture,release=screenToWorld(e);gesture=null;aim.setAttribute('d','');
  if(g.mode==='cube'){if(Math.hypot(release.x-g.start.x,release.y-g.start.y)<6)objects.addCube(release.x,release.y);return;}
  if(Math.hypot(release.x-g.start.x,release.y-g.start.y)<6)return;
  const ball=objects.get(g.ballId)||objects.addBall(g.start.x,g.start.y);
  const containerId=g.containerId||(controller.data(ball.captureId)?ball.captureId:null);
  try{await createCapture({containerId,ballId:ball.id,launch:boardLaunch(g.start,release),release});hint.hidden=true;}
  catch(error){show(error.message);}
 }
 const unsubscribe=objects.subscribe(event=>{render();if(event.type==='add'&&event.scatter){nodes.get(event.object.id)?.animate?.([
  {transform:'translate(-50%,-50%) translate(-70px,-100px) rotate(-150deg)',opacity:.2},
  {transform:'translate(-50%,-50%) translate(6px,-10px) rotate(12deg)',offset:.78},
  {transform:'translate(-50%,-50%) rotate(0)',opacity:1},
 ],{duration:650,easing:'cubic-bezier(.2,.7,.35,1)'});}});
 const unsubscribeContainers=controller.subscribe?.(render)||(()=>{});
 function animate(){
  for(const ball of objects.list('ball')){
   const node=nodes.get(ball.id),view=controller.ballView(ball);if(!node)continue;
   if(gesture?.ballId!==ball.id)Object.assign(node.style,{left:view.position.x+'px',top:view.position.y+'px'});
   let trail=trails.get(ball.id);if(!trail){trail=document.createElementNS(ns,'polyline');trail.classList.add('physical-ball-trail');svg.prepend(trail);trails.set(ball.id,trail);}
   trail.setAttribute('points',[...view.trail,view.position].map(p=>`${p.x},${p.y}`).join(' '));
  }
  frame=requestAnimationFrame(animate);
 }
 const escape=e=>{if(e.key==='Escape'&&(armed||gesture)){swallow(e);cancel();}};
 window.addEventListener('pointerdown',down,true);window.addEventListener('pointermove',move,true);window.addEventListener('pointerup',up,true);
 window.addEventListener('pointercancel',cancel);window.addEventListener('blur',cancel);window.addEventListener('keydown',escape,true);
 window.addEventListener('scene:new',cancel);window.addEventListener('scene:load',cancel);
 render();animate();
 return {arm,cancel,isRelevant:relevant,get active(){return !!armed;},dispose(){unsubscribe();unsubscribeContainers();cancelAnimationFrame(frame);root.remove();hint.remove();window.removeEventListener('pointerdown',down,true);window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',up,true);window.removeEventListener('pointercancel',cancel);window.removeEventListener('blur',cancel);window.removeEventListener('keydown',escape,true);window.removeEventListener('scene:new',cancel);window.removeEventListener('scene:load',cancel);}};
}
