export const RIPPLE_PORTS={input:{direction:'in',accepts:['transport'],capacity:{transport:1},parentCapacity:1}};
export function installRippleConnections({objects,model,getHeartbeat}){
 let registered=new Set();
 function sync(event){
  const ids=new Set(objects.list().map(o=>o.id));
  for(const id of registered)if(!ids.has(id))model.removeObject(id);
  for(const id of ids)if(!model.getObject(id))model.registerObject(id,{ports:RIPPLE_PORTS});
  registered=ids;
  if(event?.type==='add')model.connect('transport',{objectId:getHeartbeat().id,portId:'output'},{objectId:event.object.id,portId:'input'});
 }
 const off=objects.subscribe(sync);sync();return off;
}

// Before this timing pass Ripple had no transport port or saved connection.
// Only those older records gain a default root; new deliberate disconnections survive.
export function migrateRippleConnections(connections,ripples,heartbeatId){
 if(!Array.isArray(connections))return connections;
 return [...connections,...(ripples||[]).filter(o=>o.authoredState?.periodLoops==null&&!connections.some(c=>c.to?.objectId===o.id)).map(o=>({
  kind:'transport',from:{objectId:heartbeatId,portId:'output'},to:{objectId:o.id,portId:'input'},
 }))];
}
