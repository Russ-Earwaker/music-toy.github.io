export function createHarmonyLabLog(snapshot,{createdAt=new Date().toISOString(),href=''}={}){
 return JSON.parse(JSON.stringify({
  schemaVersion:1,kind:'harmony-lab',createdAt,href,
  settings:snapshot.state,transport:snapshot.transport,
  comparison:snapshot.comparison,comparisonCompleted:snapshot.comparisonCompleted,
  diagnostics:snapshot.evaluation,runtimeError:snapshot.runtimeError,
  log:{scope:'Audible pitched events in the current comparison; reset with comparison statistics.',limit:4096,dropped:snapshot.logDropped??0,events:snapshot.logEvents??snapshot.events??[]}
 }));
}
export function harmonyLabLogFileName(createdAt){
 return 'harmony-lab-log-'+String(createdAt).replace(/[^a-zA-Z0-9-]/g,'-')+'.json';
}
export async function saveHarmonyLabLog(log,{endpoint='http://localhost:5174/debug-output',fetchImpl=fetch,timeoutMs=8000}={}){
 const fileName=harmonyLabLogFileName(log.createdAt),controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetchImpl(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
   body:JSON.stringify({fileName,text:JSON.stringify(log,null,2),meta:{kind:'harmony-lab',createdAt:log.createdAt}})});
  if(!response.ok)throw new Error('Results server returned HTTP '+response.status);
  return {fileName,endpoint};
 }finally{clearTimeout(timer);}
}
