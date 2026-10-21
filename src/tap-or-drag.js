// Shared pointer gesture: a tap performs on release; crossing 6 CSS pixels moves.
export function installTapOrDrag(element,{getPosition,screenToWorld,move,onTap,onDragStart=()=>{},onDragMove=()=>{},onDragEnd=()=>{},canInteract=()=>true,threshold=6}){
 let gesture=null;
 const point=e=>screenToWorld({x:e.clientX,y:e.clientY});
 const down=e=>{
  if(gesture||e.button>0||!canInteract())return;e.preventDefault();e.stopPropagation();
  gesture={pointerId:e.pointerId,screen:{x:e.clientX,y:e.clientY},start:point(e),position:{...getPosition()},moved:false};
  try{element.setPointerCapture?.(e.pointerId);}catch{} // Synthetic/AT input may have no active browser pointer.
 };
 const update=e=>{
  const g=gesture;if(!g||e.pointerId!==g.pointerId)return;e.stopPropagation();
  if(!g.moved&&Math.hypot(e.clientX-g.screen.x,e.clientY-g.screen.y)<threshold)return;
  if(!g.moved){g.moved=true;onDragStart(e);}
  const p=point(e);move(g.position.x+p.x-g.start.x,g.position.y+p.y-g.start.y);onDragMove(e);
 };
 const end=e=>{
  if(e.pointerId!==gesture?.pointerId)return;e.stopPropagation();
  if(e.type==='pointerup')update(e);
  const g=gesture;gesture=null;
  if(g.moved)onDragEnd(e,e.type!=='pointerup');else if(e.type==='pointerup')onTap(e);
 };
 const click=e=>{
  e.stopPropagation();
  // Pointer taps already performed on pointerup. Keyboard/AT activation is click-only.
  if(e.detail===0&&!e.pointerType&&canInteract())onTap(e);
 };
 const handlers={pointerdown:down,pointermove:update,pointerup:end,pointercancel:end,lostpointercapture:end,click};
 for(const [type,fn]of Object.entries(handlers))element.addEventListener(type,fn);
 return ()=>{if(gesture?.moved)onDragEnd({pointerId:gesture.pointerId},true);gesture=null;for(const [type,fn]of Object.entries(handlers))element.removeEventListener(type,fn);};
}
