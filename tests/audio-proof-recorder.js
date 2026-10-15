// Test-only capture of the actual production audio buses, no alternate renderer.
import {ensureAudioContext,getToyGain} from '../src/audio-core.js';
import {transportRegistry} from '../src/transport-registry.js';
let recording=[];
window.__startAudioProof=async()=>{
 const ctx=ensureAudioContext();await ctx.resume();
 const snapshot=window.Persistence.getSnapshot(),root=snapshot.structureToys.find(n=>n.autoArrange?.root),master=document.getElementById(root.autoArrange.sourceIds.melody);
 transportRegistry.get(root.transportId||root.autoArrange.heartbeatId)?.returnToStart();
 recording=['mix','melody'].map(kind=>{
  const bus=getToyGain(kind==='mix'?'master':master.__audioToyId||master.dataset.audiotoyid||master.id),destination=ctx.createMediaStreamDestination(),chunks=[];
  bus.connect(destination);const recorder=new MediaRecorder(destination.stream);recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.start();return{kind,bus,destination,recorder,chunks};
 });
};
window.__saveAudioProof=async()=>{
 const ctx=ensureAudioContext(),stamp=new Date().toISOString().replace(/[:.]/g,'-'),files=[];
 for(const entry of recording){
  await new Promise(resolve=>{entry.recorder.onstop=resolve;entry.recorder.stop();});entry.bus.disconnect(entry.destination);
  const audio=await ctx.decodeAudioData(await new Blob(entry.chunks).arrayBuffer()),samples=audio.getChannelData(0),buffer=new ArrayBuffer(44+samples.length*2),view=new DataView(buffer);
  const chars=(offset,value)=>[...value].forEach((c,i)=>view.setUint8(offset+i,c.charCodeAt(0)));
  chars(0,'RIFF');view.setUint32(4,36+samples.length*2,true);chars(8,'WAVE');chars(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,audio.sampleRate,true);view.setUint32(28,audio.sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);chars(36,'data');view.setUint32(40,samples.length*2,true);
  for(let i=0;i<samples.length;i++)view.setInt16(44+i*2,Math.max(-1,Math.min(1,samples[i]))*32767,true);
  const bytes=new Uint8Array(buffer);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  const fileName=`auto-arrange-v1-4-${entry.kind}-${stamp}.wav`;
  const response=await fetch('http://localhost:5174/debug-output',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileName,encoding:'base64',text:btoa(binary)})});if(!response.ok)throw new Error('Audio export failed');files.push(fileName);
 }
 recording=[];return 'Saved actual audio: '+files.join(', ');
};
