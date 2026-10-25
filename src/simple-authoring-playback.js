// Authoring may start/resume a transport, but never seeks it or changes its clock.
// Share in-flight starts when two Simple actions complete together.
const starting=new WeakMap();
export function ensureTransportPlayingForSimpleAuthoring(transport){
 if(!transport||transport.state==='playing')return false;
 if(starting.has(transport))return starting.get(transport);
 let play;try{play=transport.play();}catch(error){return Promise.reject(error);}
 const task=Promise.resolve(play).then(result=>result!==false&&transport.state==='playing').finally(()=>{if(starting.get(transport)===task)starting.delete(transport);});
 starting.set(transport,task);return task;
}
