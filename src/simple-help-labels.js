// Simple components declare identification metadata; no second toy manifest lives here.
// Only explicit functional copy belongs in Simple; Advanced retains legacy name labels.
export function simpleHelpLabel(target){
 const label=(target.dataset.simpleHelp||'').trim();
 if(!label||label==='auto')return '';
 if(target.dataset.simpleHelpDetail!=='true')for(let p=target.parentElement;p;p=p.parentElement)if(p.dataset.simpleHelpGroup==='true')return '';
 return label;
}

export function collectSimpleHelpTargets(root=document,win=window){
 const styles=new WeakMap(),style=n=>{if(!styles.has(n))styles.set(n,win.getComputedStyle(n));return styles.get(n);};
 const items=[];
 for(const target of root.querySelectorAll('[data-simple-help],[data-help-label]')){
  const label=simpleHelpLabel(target);if(!label||!target.isConnected)continue;
  let visible=true;
  for(let node=target;node;node=node.parentElement){
   const s=style(node);
   if(node.hidden||node.dataset.helpIgnore==='true'||s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse'||Number(s.opacity)===0){visible=false;break;}
  }
  if(!visible)continue;
  let r=target.getBoundingClientRect();
  // Some control strips position every child absolutely and have no own height.
  if(target.dataset.simpleHelpGroup==='true'&&(r.width<1||r.height<1)){
   const boxes=[...target.querySelectorAll('*')].filter(n=>{const s=style(n);return !n.hidden&&s.display!=='none'&&s.visibility!=='hidden';}).map(n=>n.getBoundingClientRect()).filter(b=>b.width>0&&b.height>0);
   if(boxes.length){const left=Math.min(...boxes.map(b=>b.left)),top=Math.min(...boxes.map(b=>b.top)),right=Math.max(...boxes.map(b=>b.right)),bottom=Math.max(...boxes.map(b=>b.bottom));r={left,top,right,bottom,width:right-left,height:bottom-top};}
  }
  if(r.width<1||r.height<1||r.right<=0||r.bottom<=0||r.left>=win.innerWidth||r.top>=win.innerHeight)continue;
  // Clip palette contents and off-board targets against actual scroll/viewport surfaces.
  for(let node=target.parentElement;node;node=node.parentElement){
   const s=style(node),box=node.getBoundingClientRect();
   if((/hidden|clip|auto|scroll/.test(s.overflowX)&& (r.right<=box.left||r.left>=box.right))||(/hidden|clip|auto|scroll/.test(s.overflowY)&&(r.bottom<=box.top||r.top>=box.bottom))){visible=false;break;}
  }
  if(visible&&typeof root.elementFromPoint==='function'){
   const inset=Math.min(4,r.width/4,r.height/4),samples=[[(r.left+r.right)/2,(r.top+r.bottom)/2],[r.left+inset,r.top+inset],[r.right-inset,r.top+inset],[r.left+inset,r.bottom-inset],[r.right-inset,r.bottom-inset]];
   visible=samples.some(([x,y])=>{if(x<0||y<0||x>=win.innerWidth||y>=win.innerHeight)return false;const hit=root.elementFromPoint(x,y),blocker=hit?.closest?.('#paint-palette,.toy-spawner-menu,.toy-spawner-dock button,#topbar,dialog,.expressive-toy-controls');return !blocker||blocker.contains(target)||target.contains(blocker);});
  }
  const edgeRoot=target.closest('#paint-palette,.shape-palette,.toy-spawner-menu'),edge=edgeRoot?.getBoundingClientRect();
  let position=target.dataset.helpPosition||(target.closest('#paint-palette')?'right':target.closest('.toy-spawner-dock')?'left':target.closest('#topbar')?'bottom':'top');
  const chooser=edgeRoot?.querySelector?.('.shape-palette');
  if(chooser&&edge&&win.innerWidth-edge.right>=100&&r.top>=chooser.getBoundingClientRect().top-24)position='right';
  if(visible)items.push({target,label,edge:edge?{left:edge.left,right:edge.right}:null,rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height},position});
 }
 return items;
}

const area=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
export function placeSimpleHelpLabels(entries,width,height){
 const placed=[],margin=6,gap=8;
 for(const entry of entries){
  const r=entry.rect,w=Math.min(entry.width,width-2*margin),h=entry.height;let best=null;
  for(const dir of [...new Set([entry.position,'top','bottom','left','right'])])for(const offset of [0,-24,24,-48,48,-80,80,-120,120,-180,180,-260,260]){
   const horizontal=dir==='top'||dir==='bottom';
   const preferredEdge=dir===entry.position?entry.edge:null;
   let left=horizontal?(r.left+r.right-w)/2+offset:dir==='left'?(preferredEdge?.left??r.left)-w-gap:(preferredEdge?.right??r.right)+gap;
   let top=horizontal?(dir==='top'?r.top-h-gap:r.bottom+gap):(r.top+r.bottom-h)/2+offset;
   left=Math.max(margin,Math.min(width-margin-w,left));top=Math.max(margin,Math.min(height-margin-h,top));
   const box={left,top,right:left+w,bottom:top+h};
   const cost=(dir===entry.position?0:16)+area(box,r)*60+placed.reduce((n,p)=>n+area(box,p.box)*30,0)+entries.reduce((n,e)=>n+(e===entry?0:area(box,e.rect)*3),0)+Math.hypot(left+w/2-(r.left+r.right)/2,top+h/2-(r.top+r.bottom)/2)*.08;
   if(!best||cost<best.cost)best={box,dir,cost};
  }
  placed.push({...best,entry});
 }
 return placed;
}

const sessions=new WeakMap();
export function renderSimpleHelpLabels(host,root=document,win=window){
 let session=sessions.get(host);if(!session){session={nodes:new Map(),signature:''};sessions.set(host,session);}
 const entries=collectSimpleHelpTargets(root,win),present=new Set(entries.map(e=>e.target));
 for(const [target,nodes]of session.nodes)if(!present.has(target)){nodes.callout.remove();nodes.connector.remove();session.nodes.delete(target);}
 let changed=false;
 for(const entry of entries){
  let nodes=session.nodes.get(entry.target);
  if(!nodes||nodes.callout.parentElement!==host){
   const callout=root.createElement('div'),connector=root.createElement('div');callout.className='toy-help-callout';connector.className='toy-help-connector';
   callout.style.pointerEvents=connector.style.pointerEvents='none';callout.__helpTarget=connector.__helpTarget=entry.target;
   host.append(connector,callout);nodes={callout,connector};session.nodes.set(entry.target,nodes);changed=true;
  }
  if(nodes.callout.textContent!==entry.label){nodes.callout.textContent=entry.label;changed=true;}
  entry.width=nodes.callout.offsetWidth;entry.height=nodes.callout.offsetHeight;entry.nodes=nodes;
 }
 const signature=JSON.stringify([win.innerWidth,win.innerHeight,entries.map(e=>[e.label,e.rect,e.edge,e.width,e.height,e.position])]);
 if(!changed&&session.signature===signature)return;session.signature=signature;
 for(const {box,dir,entry}of placeSimpleHelpLabels(entries,win.innerWidth,win.innerHeight)){
  const {callout,connector}=entry.nodes,r=entry.rect;callout.dataset.position=dir;callout.dataset.target=entry.target.id||'';
  callout.style.left=box.left+'px';callout.style.top=box.top+'px';
  const x=Math.max(box.left,Math.min(box.right,(r.left+r.right)/2)),y=Math.max(box.top,Math.min(box.bottom,(r.top+r.bottom)/2));
  const tx=Math.max(r.left,Math.min(r.right,x)),ty=Math.max(r.top,Math.min(r.bottom,y)),dx=tx-x,dy=ty-y;
  connector.style.left=x+'px';connector.style.top=y+'px';connector.style.width=Math.hypot(dx,dy)+'px';connector.style.transform=`rotate(${Math.atan2(dy,dx)*180/Math.PI}deg)`;
 }
}
