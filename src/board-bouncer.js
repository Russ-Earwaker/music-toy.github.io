import {BOUNCER_BASE_ORANGE,BOUNCER_IMPACT_ORANGE} from './bouncer-response-style.js';
import {boardLaunch,predictCannonTrajectory,CANNON_BARREL_LENGTH,BALL_LAUNCH_SPEED} from './simple-bouncer-physics.js';
import {seedTriggerCubes,triggerCreationPoint} from './trigger-starter-cubes.js';
import {createBoardInteractionHint,SIMPLE_PLACE_HINT_DELAY} from './simple-interaction-hint.js';
import {trajectoryPoints} from './trajectory-presentation.js';

// Board DOM/SVG is presentation only. Physical positions are logical world units;
// playback positions are sampled from canonical transport phase, never simulated.
export function installBoardBouncer({objects,controller,getCollisionObjects=()=>objects.list('cube'),getWorld,getViewport,screenToWorld,createCapture,unlock,getBpm=()=>120,canInteract=()=>true,onRelevant=()=>{},onArm=()=>{}}){
 const world=getWorld(),root=document.createElement('div');root.className='board-physical-objects';world.append(root);
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.classList.add('physical-motion-layer');root.append(svg);
 const aim=document.createElementNS(ns,'path');aim.classList.add('physical-launch-preview');svg.append(aim);
 const creationPath=document.createElementNS(ns,'polyline');creationPath.classList.add('physical-path-prediction','physical-creation-prediction');svg.append(creationPath);
 let previewKey=null;
 const drawTrajectory=(line,points)=>line.setAttribute('points',trajectoryPoints(points));
 function launchFor(g,release){
  const ball=objects.get(g.ballId),containerId=g.containerId||(controller.data(ball?.captureId)?ball.captureId:null),cannon=containerId&&controller.cannon?.(containerId);
  return {containerId,ballMode:controller.data(containerId)?.ballMode||ball?.ballMode||(g.mode==='gravity'?'gravity':'normal'),release:cannon?.endpoint||release,launch:boardLaunch(cannon||g.start,cannon?.endpoint||release)};
 }
 function updateCreationPreview(){
  if(!gesture||gesture.mode==='cube'||Math.hypot(gesture.current.x-gesture.start.x,gesture.current.y-gesture.start.y)<6){creationPath.setAttribute('points','');aim.setAttribute('d','');previewKey=null;return;}
  const {launch,containerId,ballMode}=launchFor(gesture,gesture.current),cubes=getCollisionObjects(),bars=controller.data(containerId)?.bars||1,bpm=getBpm(containerId);
  const key=JSON.stringify([ballMode,launch,bars,bpm,cubes.map(c=>[c.id,c.x,c.y,c.width,c.height,c.radius,c.sourceMidi,c.segments,c.surfaceRadius])]);
  if(key===previewKey)return;previewKey=key;
  drawTrajectory(creationPath,predictCannonTrajectory({launch,cubes,bars,bpm,ballMode}));
  const ux=launch.vx/BALL_LAUNCH_SPEED,uy=launch.vy/BALL_LAUNCH_SPEED,x=launch.x+ux*CANNON_BARREL_LENGTH,y=launch.y+uy*CANNON_BARREL_LENGTH;
  aim.setAttribute('d',`M${launch.x} ${launch.y}L${x} ${y}m${-ux*20+uy*10} ${-uy*20-ux*10}L${x} ${y}l${-ux*20-uy*10} ${-uy*20+ux*10}`);
 }
 const nodes=new Map(),trails=new Map(),predictions=new Map();let armed=null,gesture=null,frame,lastRelevant=null,teaching=null;
 const hint=document.createElement('p');hint.className='bouncer-board-hint';hint.hidden=true;hint.setAttribute('role','status');document.body.append(hint);
 const show=text=>{hint.textContent=text;hint.hidden=false;};
 const relevant=()=>!!armed||objects.list().length>0;
 function render(){
  updateModes();
  const all=objects.list(),present=new Set(all.map(o=>o.id));
  for(const [id,node]of nodes)if(!present.has(id)){node.remove();nodes.delete(id);trails.get(id)?.remove();trails.delete(id);}
  for(const o of all){let node=nodes.get(o.id);
   if(!node){node=document.createElement('button');node.type='button';node.id=o.id;node.dataset.physicalId=o.id;node.className=`physical-object physical-${o.kind}`;
    node.addEventListener('keydown',e=>{e.stopPropagation();if(['cube','ball'].includes(o.kind)&&['Delete','Backspace'].includes(e.key)){e.preventDefault();cancel();objects.remove(o.id);}if(e.key==='Enter'&&o.kind==='ball')arm({ballId:o.id});});
    if(o.kind!=='ball')node.addEventListener('pointerdown',e=>startCube(e,o.id));root.append(node);nodes.set(o.id,node);
   }
   node.dataset.ballMode=o.ballMode||'normal';node.textContent=o.kind==='ball'&&o.ballMode==='gravity'?'\u2193':'';
   node.setAttribute('aria-label',o.kind==='cube'?`Cube, note ${o.sourceMidi}. Drag to move; Delete to remove.`:(o.ballMode==='gravity'?'Gravity Ball.':'Ball.')+' Drag to throw; Delete to remove.');node.title=node.getAttribute('aria-label');
   const width=o.kind==='cube'?o.width:(o.radius||12)*2,height=o.kind==='cube'?o.height:(o.radius||12)*2;
   Object.assign(node.style,{left:o.x+'px',top:o.y+'px',width:width+'px',height:height+'px'});if(o.kind==='cube')node.style.setProperty('--cube-color',BOUNCER_BASE_ORANGE);
  }
  const next=relevant();if(next!==lastRelevant){lastRelevant=next;onRelevant(next);}
 }
 function startCube(e,id){
  e.stopPropagation();if(e.button>0)return;e.preventDefault();
  const cube=objects.get(id),p=screenToWorld(e),node=nodes.get(id),offset={x:p.x-cube.x,y:p.y-cube.y};node.focus({preventScroll:true});node.setPointerCapture(e.pointerId);
  objects.update(id,{drag:true});
  const move=ev=>{if(ev.pointerId!==e.pointerId)return;const point=screenToWorld(ev);const next={x:point.x-offset.x,y:point.y-offset.y};objects.update(id,next);render();};
  const end=ev=>{if(ev.pointerId!==e.pointerId)return;for(const t of ['pointerup','pointercancel','lostpointercapture'])node.removeEventListener(t,end);node.removeEventListener('pointermove',move);objects.update(id,{drag:false});};
  node.addEventListener('pointermove',move);for(const t of ['pointerup','pointercancel','lostpointercapture'])node.addEventListener(t,end);
 }
 function arm(options={}){
  if(!canInteract())return false;
  if(options.mode&&armed&&(armed.mode||'ball')===options.mode){cancel();return true;}
  cancel();onArm();armed=options;
  if((options.mode||'ball')!=='cube'&&options.seed!==false)seedTriggerCubes({objects,center:triggerCreationPoint({viewport:getViewport(),screenToWorld}),otherReceivers:getCollisionObjects().map(o=>o.boardObject)});
  if((options.mode||'ball')!=='cube'&&!options.ballId&&!options.containerId)teaching=createBoardInteractionHint({getWorld,getViewport,screenToWorld,label:'SWIPE',demo:'swipe',ballMode:options.mode==='gravity'?'gravity':'normal',getCubes:()=>options.mode==='gravity'?getCollisionObjects().map(o=>o.boardObject||o):objects.list('cube')});
  if(options.mode==='cube')teaching=createBoardInteractionHint({getWorld,getViewport,screenToWorld,label:'PLACE',demo:'tap',delay:objects.list('cube').length?SIMPLE_PLACE_HINT_DELAY:0});
  updateModes();document.body.classList.add('bouncer-board-armed');hint.hidden=true;onRelevant(true);updateModes();return true;
 }
 function updateModes(){for(const type of ['ball','gravity','cube'])for(const button of document.querySelectorAll('[data-toy-type="physical-'+(type==='gravity'?'gravity-ball':type)+'"]')){const active=!!armed&&(armed.mode||'ball')===type;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));}}
 function cancel(){teaching?.dispose();teaching=null;gesture=null;armed=null;previewKey=null;creationPath.setAttribute('points','');updateModes();aim.setAttribute('d','');hint.hidden=true;document.body.classList.remove('bouncer-board-armed');}
 const swallow=e=>{e.preventDefault();e.stopImmediatePropagation();};
 function down(e){
  if(e.target.closest?.('.toy-spawner-art,.toy-spawner-logic,.toy-spawner-game,.palette-handle')){cancel();return;}
  if(armed&&e.target.closest?.('button,input,select,a,.toy-panel,.art-toy-panel,.container-toy,.heartbeat-toy,.physical-object')){teaching?.dispose();teaching=null;}
  if(!canInteract()||e.button>0||gesture||!getViewport()?.contains(e.target))return;
  const ball=e.target.closest?.('.physical-ball'),cube=e.target.closest?.('.physical-cube');if(cube||e.target.closest?.('.cannon-aim,.cannon-barrel'))return;
  if(!ball&&!armed)return;
  if(!ball&&e.target.closest?.('button,input,select,a,.toy-panel,.art-toy-panel,.heartbeat-toy,.container-toy'))return;
  teaching?.dispose();teaching=null;swallow(e);unlock();ball?.focus({preventScroll:true});const point=screenToWorld(e),ballId=ball?.dataset.physicalId||armed?.ballId||null;
  gesture={pointer:e.pointerId,start:point,current:point,ballId,containerId:armed?.containerId||null,mode:ball?(objects.get(ballId)?.ballMode==='gravity'?'gravity':'ball'):armed?.mode||'ball'};getViewport().setPointerCapture?.(e.pointerId);
 }
 function move(e){if(e.pointerId!==gesture?.pointer)return;swallow(e);gesture.current=screenToWorld(e);updateCreationPreview();}
 async function up(e){
  if(e.pointerId!==gesture?.pointer)return;swallow(e);const g=gesture,release=screenToWorld(e);gesture=null;previewKey=null;creationPath.setAttribute('points','');aim.setAttribute('d','');
  if(g.mode==='cube'){if(Math.hypot(release.x-g.start.x,release.y-g.start.y)<6)objects.addCube(release.x,release.y);return;}
  if(Math.hypot(release.x-g.start.x,release.y-g.start.y)<6)return;
  const ball=objects.get(g.ballId)||objects.addBall(g.start.x,g.start.y,{ballMode:g.mode==='gravity'?'gravity':'normal'});
  const launch=launchFor({...g,ballId:ball.id},release);
  try{await createCapture({...launch,ballId:ball.id});hint.hidden=true;}
  catch(error){show(error.message);}
 }
 const unsubscribe=objects.subscribe(event=>{render();updateCreationPreview();if(event.type==='add'&&event.scatter){nodes.get(event.object.id)?.animate?.([
  {transform:'translate(-50%,-50%) translate(-70px,-100px) rotate(-150deg)',opacity:.2},
  {transform:'translate(-50%,-50%) translate(6px,-10px) rotate(12deg)',offset:.78},
  {transform:'translate(-50%,-50%) rotate(0)',opacity:1},
 ],{duration:650,easing:'cubic-bezier(.2,.7,.35,1)'});}});
 const unsubscribeContainers=controller.subscribe?.(render)||(()=>{});
 function animate(){
  if(gesture)updateCreationPreview();
  const present=new Set();
  for(const ball of objects.list('ball')){
   if(!ball.captureId||!controller.prediction)continue;present.add(ball.id);
   let line=predictions.get(ball.id);if(!line){line=document.createElementNS(ns,'polyline');line.classList.add('physical-path-prediction');line.setAttribute('data-capture-id',ball.captureId);svg.prepend(line);predictions.set(ball.id,line);}
   drawTrajectory(line,controller.prediction(ball.captureId));
  }
  for(const [id,line]of predictions)if(!present.has(id)){line.remove();predictions.delete(id);}
  const responses=controller.cubeResponses?.(),shared=controller.receiverResponses?.();
  for(const [id,node]of nodes)if(objects.get(id)?.kind==='cube'){
   const own=responses?.get(id),other=shared?.get(id),response={pending:own?.pending||other?.pending,flash:Math.max(own?.flash||0,other?.flash||0)},f=response.flash;
   node.style.setProperty('--cube-color',response.pending?BOUNCER_IMPACT_ORANGE:BOUNCER_BASE_ORANGE);
   node.style.setProperty('--cube-flash',String(f>0?.25+.55*f:0));
   node.style.transform='translate(-50%,-50%) scale('+(1+Math.sin((1-f)*Math.PI)*.1)+')';
  }
  for(const ball of objects.list('ball')){
   const node=nodes.get(ball.id),view=controller.ballView(ball);if(!node)continue;node.hidden=!!view.hidden;
   if(gesture?.ballId!==ball.id)Object.assign(node.style,{left:view.position.x+'px',top:view.position.y+'px'});
   let trail=trails.get(ball.id);if(!trail){trail=document.createElementNS(ns,'polyline');trail.classList.add('physical-ball-trail');svg.prepend(trail);trails.set(ball.id,trail);}
   trail.setAttribute('points',(view.hidden?[]:[...view.trail,view.position]).map(p=>`${p.x},${p.y}`).join(' '));
  }
  frame=requestAnimationFrame(animate);
 }
 const escape=e=>{if(e.key==='Escape'&&(armed||gesture)){swallow(e);cancel();}};
 const lost=e=>{if(e.pointerId===gesture?.pointer)cancel();};
 window.addEventListener('lostpointercapture',lost);
 window.addEventListener('pointerdown',down,true);window.addEventListener('pointermove',move,true);window.addEventListener('pointerup',up,true);
 window.addEventListener('pointercancel',cancel);window.addEventListener('blur',cancel);window.addEventListener('keydown',escape,true);
 window.addEventListener('scene:new',cancel);window.addEventListener('scene:load',cancel);
 render();animate();
 return {arm,cancel,isRelevant:relevant,get active(){return !!armed;},get activeMode(){return armed?(armed.mode||'ball'):null;},dispose(){cancel();window.removeEventListener('lostpointercapture',lost);unsubscribe();unsubscribeContainers();cancelAnimationFrame(frame);root.remove();hint.remove();window.removeEventListener('pointerdown',down,true);window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',up,true);window.removeEventListener('pointercancel',cancel);window.removeEventListener('blur',cancel);window.removeEventListener('keydown',escape,true);window.removeEventListener('scene:new',cancel);window.removeEventListener('scene:load',cancel);}};
}
