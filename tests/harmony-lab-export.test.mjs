import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarmonyLabLog,harmonyLabLogFileName,saveHarmonyLabLog} from '../src/harmony-lab-export.js';
test('export retains complete comparison events, actual decisions, settings and independent stats snapshot',()=>{
 const source={state:{mode:'follow',melodyNotes:['F#4'],chords:[{root:'C',quality:'major'}],soloPart:'melody'},
 transport:{state:'paused',currentTick:3072},comparison:null,comparisonCompleted:true,runtimeError:null,
 evaluation:{stats:{played:14,changed:8},pass:['F4']},logDropped:0,
 events:[{eventTick:1536}],logEvents:Array.from({length:28},(_,i)=>({eventTick:i*96,part:'melody',mode:i<14?'original':'follow',sourceNote:'F#4',adaptedNote:i<14?'F#4':'F4',finalNote:i<14?'F#4':'F4',resolvedChord:i<14?null:{root:'C',quality:'major'}}))};
 const log=createHarmonyLabLog(source,{createdAt:'2026-10-10T12:34:56.000Z',href:'http://localhost/harmony-lab/'});
 assert.equal(log.log.events.length,28);assert.equal(log.diagnostics.stats.changed,8);assert.equal(log.comparisonCompleted,true);
 assert.equal(log.log.events.at(-1).resolvedChord.root,'C');assert.equal(log.log.events.at(-1).adaptedNote,'F4');
 source.state.melodyNotes[0]='G4';source.logEvents[0].sourceNote='G4';
 assert.equal(log.settings.melodyNotes[0],'F#4');assert.equal(log.log.events[0].sourceNote,'F#4');
 assert.match(harmonyLabLogFileName(log.createdAt),/^harmony-lab-log-[a-zA-Z0-9-]+.json$/);
});
test('Save logs posts the JSON file through the same debug-output server contract',async()=>{
 let request;
 const log=createHarmonyLabLog({state:{mode:'follow'},logEvents:[],evaluation:{stats:{played:0}}},{createdAt:'2026-10-10T12:34:56.000Z'});
 const result=await saveHarmonyLabLog(log,{fetchImpl:async(url,options)=>{request={url,options};return{ok:true};}});
 assert.equal(request.url,'http://localhost:5174/debug-output');assert.equal(request.options.method,'POST');
 const body=JSON.parse(request.options.body);assert.equal(body.fileName,result.fileName);assert.deepEqual(JSON.parse(body.text),log);assert.equal(body.meta.kind,'harmony-lab');
});
test('failed server responses and network errors do not report a saved file',async()=>{
 await assert.rejects(saveHarmonyLabLog({createdAt:'test'},{fetchImpl:async()=>({ok:false,status:500})}),/HTTP 500/);
 await assert.rejects(saveHarmonyLabLog({createdAt:'test'},{fetchImpl:async()=>{throw new Error('offline');}}),/offline/);
});
