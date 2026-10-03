// Logical board units only. Layout never changes musical state.
export const MIN_NODE_GAP_X=144, MIN_CONNECTION_CORRIDOR=144, MIN_SIBLING_GAP_Y=72, CONNECTION_CONTROL_RADIUS=24;
export const ENDPOINT_CONTROL_RADIUS=26;
export const HEARTBEAT_OUTPUT_OFFSET=52;
export const GRAPH_HORIZONTAL_GAP=MIN_NODE_GAP_X, GRAPH_SIBLING_GAP=MIN_SIBLING_GAP_Y;
// Horizontal detours make wires and the local graph much longer. Prefer a
// compact corridor over equally-sized sideways displacement.
export const localPlacementCost = (dx,dy) => 2*dx*dx+dy*dy;
export const rectanglesOverlap=(a,b,gap=0)=>a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;
const union=rs=>{if(!rs.length)return null;const x=Math.min(...rs.map(r=>r.x)),y=Math.min(...rs.map(r=>r.y));return {x,y,width:Math.max(...rs.map(r=>r.x+r.width))-x,height:Math.max(...rs.map(r=>r.y+r.height))-y};};
export function clearVerticalSlot(desired,obstacles,gap=MIN_SIBLING_GAP_Y,minY=-Infinity){
  const rs=obstacles.filter(r=>desired.x<r.x+r.width+gap&&desired.x+desired.width+gap>r.x);
  const ys=[Math.max(minY,desired.y),...rs.flatMap(r=>[r.y-desired.height-gap,r.y+r.height+gap])].filter(y=>y>=minY).sort((a,b)=>Math.abs(a-desired.y)-Math.abs(b-desired.y)||b-a);
  return {...desired,y:ys.find(y=>!rs.some(r=>rectanglesOverlap({...desired,y},r,gap)))??desired.y};
}
// Weighted isotonic packing: minimum movement subject to socket order. Manual
// branches have stronger resistance, but can move to resolve inaccessible UI.
function orderedStarts(items,gap){
  let offset=0;const blocks=[],offsets=[];
  for(const [i,r]of items.entries()){
    offsets.push(offset);blocks.push({first:i,last:i,weight:r.weight,sum:(r.y-offset)*r.weight});offset+=r.height+gap;
    while(blocks.length>1&&blocks.at(-2).sum/blocks.at(-2).weight>blocks.at(-1).sum/blocks.at(-1).weight){const b=blocks.pop(),a=blocks.pop();blocks.push({first:a.first,last:b.last,weight:a.weight+b.weight,sum:a.sum+b.sum});}
  }
  const ys=[];for(const b of blocks)for(let i=b.first;i<=b.last;i++)ys[i]=b.sum/b.weight+offsets[i];return ys;
}
export function createGraphPlacement({model,getRect,setPosition=()=>{},getScope=()=>null,isManual=()=>false,getPortPoint=null,horizontalGap=MIN_NODE_GAP_X,siblingGap=MIN_SIBLING_GAP_Y}){
  horizontalGap=Math.max(horizontalGap,MIN_CONNECTION_CORRIDOR);
  const edges=id=>model.list().filter(c=>c.from.objectId===id).sort((a,b)=>(Number(a.from.portId.split(':')[1])||0)-(Number(b.from.portId.split(':')[1])||0));
  function descendants(id,seen=new Set()){if(seen.has(id))return seen;seen.add(id);for(const c of edges(id))descendants(c.to.objectId,seen);return seen;}
  function branchBounds(id,ps=null){return union([...descendants(id)].map(n=>ps?.get(n)||getRect(n)).filter(Boolean));}
  function depth(id,seen=new Set()){if(seen.has(id))throw new Error('Cyclic placement graph');const p=model.getParent(id);return p?1+depth(p.from.objectId,new Set(seen).add(id)):0;}
  const obstacles=(scope,excluded=new Set())=>model.getObjectIds().filter(id=>!excluded.has(id)&&getScope(id)===scope).map(getRect).filter(Boolean);
  function placeChild(id,size){
    const p=getRect(id);if(!p)return null;const last=edges(id).at(-1),b=last&&branchBounds(last.to.objectId);
    return {x:p.x+p.width+horizontalGap,y:model.getObject(id)?.structure&&b?b.y+b.height+siblingGap:p.y+p.height/2-size.height/2,...size,depth:depth(id)+1};
  }
  function placeStructure(desired,parentId){const p=getRect(parentId);return p?{...desired,x:p.x+p.width+horizontalGap,y:p.y+p.height/2-desired.height/2}:desired;}
  function corridor(c,ps){
    const a=ps?.get(c.from.objectId)||getRect(c.from.objectId),b=ps?.get(c.to.objectId)||getRect(c.to.objectId);if(!a||!b)return {ok:false};
    const point=(ep,r,out)=>getPortPoint?.(ep,r)||{x:out?r.x+r.width:r.x,y:r.y+r.height/2};
    const from=point(c.from,a,true),to=point(c.to,b,false),mid={x:(from.x+to.x)/2,y:(from.y+to.y)/2};
    const others=model.getObjectIds().filter(id=>getScope(id)===getScope(c.to.objectId)&&![c.from.objectId,c.to.objectId].includes(id)).map(id=>({id,rect:ps?.get(id)||getRect(id)})).filter(o=>o.rect);
    const controlBox=(point,radius)=>({x:point.x-radius,y:point.y-radius,width:radius*2,height:radius*2});
    const blocked=others.filter(o=>rectanglesOverlap(controlBox(mid,CONNECTION_CONTROL_RADIUS),o.rect)).map(o=>o.rect);
    const endpointBlocked=others.flatMap(o=>[from,to].filter(p=>rectanglesOverlap(controlBox(p,ENDPOINT_CONTROL_RADIUS),o.rect)).map(point=>({...o,point})));
    return {ok:b.x-a.x-a.width>=MIN_CONNECTION_CORRIDOR-1e-6&&!blocked.length&&!endpointBlocked.length,blocked,endpointBlocked,mid,a,b};
  }
  const hasUsableConnectionCorridor=id=>{const c=model.get(id);return !!c&&corridor(c).ok;};
  function targets(rootId,{explicit=false,onlyChild=null,scope=getScope(onlyChild||rootId),recentlyAttached=new Set()}={}){
    const root=getRect(rootId);if(!root)return [];
    function localDescendants(id,set=new Set()){if(set.has(id)||id!==rootId&&getScope(id)!==scope)return set;set.add(id);for(const c of edges(id))localDescendants(c.to.objectId,set);return set;}
    const ids=onlyChild?new Set([rootId,...localDescendants(onlyChild)]):localDescendants(rootId),original=new Map([...ids].map(id=>[id,getRect(id)]).filter(([,r])=>r)),ps=new Map([...original].map(([id,r])=>[id,{...r}]));
    let external=obstacles(scope,ids);
    const levels=new Map([[rootId,0]]),widths=[],columns=[root.x];
    function measure(id){const r=ps.get(id);if(!r)return;const level=levels.get(id);widths[level]=Math.max(widths[level]||0,r.width);for(const c of edges(id))if(ps.has(c.to.objectId)){levels.set(c.to.objectId,level+1);measure(c.to.objectId);}}
    measure(rootId);for(let i=1;i<widths.length;i++)columns[i]=columns[i-1]+widths[i-1]+horizontalGap;
    const translate=(id,dx,dy)=>{for(const n of localDescendants(id)){const r=ps.get(n);if(r){r.x+=dx;r.y+=dy;}}};
    const bounds=id=>branchBounds(id,ps),weight=id=>[...descendants(id)].reduce((s,n)=>s+(!recentlyAttached.has(id)&&isManual(n)?40:1),0);
    function openLocalSlot(desired,minY,parentRect) {
      if(!recentlyAttached.size)return;
      const roots=new Set();
      for(const id of model.getObjectIds()) {
        if(ids.has(id)||getScope(id)!==scope||!getRect(id))continue;
        let top=id,parent=model.getParent(top);
        while(parent&&!ids.has(parent.from.objectId)&&model.getObject(parent.from.objectId)?.ports.input){top=parent.from.objectId;parent=model.getParent(top);}
        roots.add(top);
      }
      for(const id of roots) {
        const branch=localDescendants(id),b=bounds(id);
        if(!b||!model.getObject(id)?.ports.input||[...branch].some(n=>isManual(n))||!rectanglesOverlap(desired,b,siblingGap))continue;
        const others=model.getObjectIds().filter(n=>!branch.has(n)&&getScope(n)===scope&&!ids.has(n)).map(n=>ps.get(n)||getRect(n)).filter(Boolean);
        const moved=clearVerticalSlot(b,[...others,parentRect,desired],siblingGap);
        const exile=clearVerticalSlot(desired,[...external,parentRect],siblingGap,minY);
        // Spend movement on a nearby automatic branch before exiling the new
        // child. Manual branches remain obstacles, not movable candidates.
        if(Math.abs(moved.y-b.y)>2*Math.abs(exile.y-desired.y)+siblingGap)continue;
        for(const n of branch)if(!ps.has(n)){const r=getRect(n);if(r){original.set(n,r);ps.set(n,{...r});}}
        translate(id,0,moved.y-b.y);
        external=model.getObjectIds().filter(n=>!ids.has(n)&&getScope(n)===scope).map(n=>ps.get(n)||getRect(n)).filter(Boolean);
      }
    }
    function repair(id,balance=true){
      const p=ps.get(id);if(!p)return;const children=edges(id).filter(c=>ps.has(c.to.objectId));
      for(const c of children){const childId=c.to.objectId,r=ps.get(childId),aligned=explicit||balance&&!isManual(childId),x=aligned?columns[levels.get(childId)]:p.x+p.width+horizontalGap;translate(childId,aligned||recentlyAttached.has(childId)?x-r.x:Math.max(0,x-r.x),0);repair(childId,balance);}
      if(!children.length)return;
      let items=children.map(c=>({...bounds(c.to.objectId),weight:weight(c.to.objectId)}));
      if(!explicit)for(let i=0;i<children.length;i++)if(recentlyAttached.has(children[i].to.objectId)){
        if(i>0)items[i].y=items[i-1].y+items[i-1].height+siblingGap;
        else if(items.length>1)items[i].y=items[i+1].y-items[i].height-siblingGap;
        else {const child=ps.get(children[i].to.objectId);items[i].y+=p.y+p.height/2-child.y-child.height/2;}
      }
      if(balance){
        // Stack complete descendant envelopes around the parent centre. Manual
        // branches retain their composition; automatic siblings fill their slots.
        const manual=children.map(c=>[...descendants(c.to.objectId)].some(n=>isManual(n)&&!recentlyAttached.has(c.to.objectId)));
        let y=p.y+p.height/2-(items.reduce((s,r)=>s+r.height,0)+(items.length-1)*siblingGap)/2;
        if(!explicit&&manual.some(Boolean)){
          const anchor=manual.indexOf(true),prefix=items.slice(0,anchor).reduce((s,r)=>s+r.height+siblingGap,0);
          y=items[anchor].y-prefix;
        }
        items=items.map((r,i)=>{const next={...r,y:explicit||!manual[i]?y:r.y};y+=r.height+siblingGap;return next;});
        if(children.length===1&&(explicit||!manual[0])){
          const child=ps.get(children[0].to.objectId);items[0].y=bounds(children[0].to.objectId).y+p.y+p.height/2-child.y-child.height/2;
        }
      }
      const ys=orderedStarts(items,siblingGap);let end=-Infinity;
      const group=union(children.map((c,i)=>({...bounds(c.to.objectId),y:ys[i]})));
      openLocalSlot(group,end,p);
      if(recentlyAttached.size&&!children.some(c=>[...descendants(c.to.objectId)].some(n=>isManual(n)&&!recentlyAttached.has(c.to.objectId)))) {
        // Keep an automatic sibling stack together around fixed obstacles,
        // rather than leaving an oversized hole between successive children.
        const slot=clearVerticalSlot(group,[...external,p],siblingGap);
        for(let i=0;i<ys.length;i++)ys[i]+=slot.y-group.y;
      }
      for(const [i,c]of children.entries()){
        const b=bounds(c.to.objectId),desired={...b,y:ys[i]};
        const placed=clearVerticalSlot(desired,[...external,p],siblingGap,end);
        translate(c.to.objectId,0,placed.y-b.y);end=placed.y+b.height+siblingGap;
      }
    }
    repair(rootId);
    // Validate actual control geometry. Unrelated blockers stay anchored; only
    // the obstructed downstream branch extends. Work is bounded by graph size.
    const cs=model.list().filter(c=>ids.has(c.from.objectId)&&ids.has(c.to.objectId));
    const stationaryWires=model.list().filter(c=>getScope(c.to.objectId)===scope&&![c.from.objectId,c.to.objectId].some(id=>ids.has(id)&&id!==rootId));
    const footprint=r=>({...r,x:r.x-ENDPOINT_CONTROL_RADIUS,width:r.width+ENDPOINT_CONTROL_RADIUS*2});
    for(let pass=0;pass<cs.length+stationaryWires.length+1;pass++){
      let changed=false;
      // New bodies and port hit areas must not cover an existing unrelated
      // wire's midpoint. Keep that wire and its endpoints stationary.
      const reserved=stationaryWires.map(c=>corridor(c,ps).mid).filter(Boolean).map(p=>({x:p.x-CONNECTION_CONTROL_RADIUS,y:p.y-CONNECTION_CONTROL_RADIUS,width:CONNECTION_CONTROL_RADIUS*2,height:CONNECTION_CONTROL_RADIUS*2}));
      for(const id of ids){
        if(id===rootId||!ps.has(id))continue;
        const r=ps.get(id),hit=footprint(r),control=reserved.find(box=>rectanglesOverlap(hit,box));if(!control)continue;
        const branch=localDescendants(id),b=bounds(id),parent=model.getParent(id),p=parent&&(ps.get(parent.from.objectId)||getRect(parent.from.objectId));
        const siblings=parent&&model.getObject(parent.from.objectId)?.structure?edges(parent.from.objectId):[];
        const index=siblings.findIndex(c=>c.to.objectId===id),prev=index>0?bounds(siblings[index-1].to.objectId):null,next=index>=0&&index<siblings.length-1?bounds(siblings[index+1].to.objectId):null;
        const otherRects=model.getObjectIds().filter(n=>!branch.has(n)&&getScope(n)===scope).map(n=>ps.get(n)||getRect(n)).filter(Boolean);
        const candidates=[{dx:control.x+control.width-hit.x+1e-5,dy:0},{dx:control.x-hit.x-hit.width-1e-5,dy:0},
          {dx:0,dy:control.y-hit.y-hit.height-1e-5},{dx:0,dy:control.y+control.height-hit.y+1e-5},
          ...otherRects.map(o=>({dx:o.x+o.width+siblingGap-b.x,dy:0}))];
        const valid=candidates.filter(({dx,dy})=>
          (!p||r.x+dx>=p.x+p.width+horizontalGap-1e-6)&&(!prev||b.y+dy>=prev.y+prev.height+siblingGap-1e-6)&&(!next||b.y+dy+b.height+siblingGap<=next.y+1e-6)
          &&!otherRects.some(o=>rectanglesOverlap({...b,x:b.x+dx,y:b.y+dy},o,siblingGap))
          &&![...branch].some(n=>{const node=ps.get(n);return node&&reserved.some(box=>rectanglesOverlap(footprint({...node,x:node.x+dx,y:node.y+dy}),box));}))
          .sort((a,b)=>localPlacementCost(a.dx,a.dy)-localPlacementCost(b.dx,b.dy)||b.dy-a.dy||a.dx-b.dx);
        if(valid.length){translate(id,valid[0].dx,valid[0].dy);changed=true;}
      }
      for(const c of cs){const q=corridor(c,ps);if(q.ok||!q.a)continue;
        for(const blocker of q.endpointBlocked){
          // An anchored source may already have a neighbour covering its port.
          // Move that immediate neighbour only when the endpoint is unusable.
          if(ids.has(blocker.id)||!model.getParent(blocker.id)&&!model.getObject(blocker.id)?.ports.input)continue;
          const branch=localDescendants(blocker.id);
          for(const id of branch)if(!ps.has(id)){const r=getRect(id);if(r){original.set(id,r);ps.set(id,{...r});}}
          const b=bounds(blocker.id),radius=ENDPOINT_CONTROL_RADIUS+2;
          const control={x:blocker.point.x-radius,y:blocker.point.y-radius,width:radius*2,height:radius*2};
          const otherRects=model.getObjectIds().filter(id=>!branch.has(id)&&getScope(id)===scope).map(id=>ps.get(id)||getRect(id)).filter(Boolean);
          const placed=clearVerticalSlot(b,[...otherRects,control],0);translate(blocker.id,0,placed.y-b.y);changed=true;
        }
        const dx=Math.max(0,q.a.x+q.a.width+horizontalGap-q.b.x,...q.blocked.map(r=>2*(r.x+r.width+CONNECTION_CONTROL_RADIUS-q.mid.x)+1));if(dx>0){translate(c.to.objectId,dx,0);changed=true;}}
      if(!changed)break;
      external=model.getObjectIds().filter(id=>!ids.has(id)&&getScope(id)===scope).map(id=>ps.get(id)||getRect(id)).filter(Boolean);
      const wasExplicit=explicit,wasAttached=recentlyAttached;explicit=false;recentlyAttached=new Set();repair(rootId,false);explicit=wasExplicit;recentlyAttached=wasAttached;
    }
    return [...ps].filter(([id,r])=>id!==rootId&&(Math.abs(r.x-original.get(id).x)>1e-6||Math.abs(r.y-original.get(id).y)>1e-6)).map(([id,r])=>({id,x:r.x,y:r.y,depth:depth(id)-depth(rootId)}));
  }
  function apply(id,options){const result=targets(id,options);for(const p of result)setPosition(p.id,p.x,p.y,{automatic:true});return result;}
  return {placeChild,placeStructure,branchBounds,descendants,hasUsableConnectionCorridor,targets,depth,
    repairConnection:(id,options={})=>{const c=model.get(id);return c?apply(c.from.objectId,{...options,onlyChild:c.to.objectId}):[];},
    repairSubgraph:(id,options={})=>apply(id,options),arrangeSubgraph:(id,options={})=>apply(id,{...options,explicit:true})};
}
