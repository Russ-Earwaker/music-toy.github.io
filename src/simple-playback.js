// Own Simple's playback intent centrally; toy authoring helpers remain defensive.
// AudioContext time remains the only musical clock, even before audio is unlocked.
export function installSimplePlayback({uiMode,registry,document,window,unlock}){
 let disposed=false,queued=false;
 function ensurePlaying(){
  if(disposed||!uiMode.isSimple())return;
  for(const {transport} of registry.list())if(transport.state!=='playing'){
   void transport.play({resumeAudio:false}).catch(()=>{});
  }
 }
 function reconcile(){
  if(queued||disposed)return;queued=true;
  queueMicrotask(()=>{queued=false;ensurePlaying();});
 }
 const offMode=uiMode.subscribe(ensurePlaying),offRegistry=registry.subscribe(reconcile);
 const events=['transport:change','scene:load','scene:new','heartbeat:selection'];
 for(const type of events)document.addEventListener(type,reconcile);
 // Use the engine's existing resume path, inside each real user activation.
 function gesture(event){
  if(!uiMode.isSimple()||event.isTrusted===false||event.button>0)return;
  if(event.type==='keydown'&&(event.repeat||['Shift','Control','Alt','Meta'].includes(event.key)))return;
  try{void Promise.resolve(unlock()).catch(()=>{});}catch{}
  ensurePlaying();
 }
 for(const type of ['pointerdown','keydown','click'])window.addEventListener(type,gesture,true);
 ensurePlaying();
 return {ensurePlaying,dispose(){disposed=true;offMode();offRegistry();for(const type of events)document.removeEventListener(type,reconcile);for(const type of ['pointerdown','keydown','click'])window.removeEventListener(type,gesture,true);}};
}
