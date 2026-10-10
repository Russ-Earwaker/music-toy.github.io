import { createHarmonyLabModel } from './harmony-lab-model.js';
import { createChainSequenceAdapter } from './chain-sequence.js';
import { createSequencerScheduler } from './note-scheduler.js';
import { transportRegistry } from './transport-registry.js';
import { ensureAudioContext, setToyMuted, setToyVolume } from './audio-core.js';
import { triggerInstrument, cancelScheduledToySources } from './audio-samples.js';
import { normalizeContext } from './playback-context.js';
import { resolveChordAtTick } from './chord-progression.js';
import { createMelodyEvaluation, comparisonCycleTicks } from './harmony-lab-evaluation.js';
let labSerial=0;
// All pitch decisions come from triggerInstrument; all timing comes from the
// real tick transport, occurrence runtime and shared event scheduler.
export function createHarmonyLabPlayback({model=createHarmonyLabModel(),onChange=()=>{}}={}) {
  const prefix='harmony-lab-'+ ++labSerial, transport=transportRegistry.create({id:prefix,bpm:model.getState().bpm});
  const scheduler=createSequencerScheduler(), pending=[], history=[], logEvents=[];
  let runtimeError=null,evaluationEpoch=0,comparison=null,comparisonCompleted=false,logDropped=0;
  const evaluation=createMelodyEvaluation();
  function resetEvaluation(){evaluationEpoch++;evaluation.reset();logEvents.length=0;logDropped=0;}
  const modeError='HARMONY LAB ERROR: UI is Follow Chords but playback event is using Original mode.';
  function reportModeError(){runtimeError=modeError;console.error(modeError);onChange();}
  const panels=['bass','melody','drums'].map(part=>({id:prefix+'-'+part,dataset:{toy:part==='drums'?'loopgrid-drum':'loopgrid'},__seqRev:0,part}));
  const drums=Object.freeze([['lab-kick','lab-hat'],['lab-hat'],['lab-snare','lab-hat'],['lab-hat'],['lab-kick','lab-hat'],['lab-hat'],['lab-snare','lab-hat'],['lab-hat']].map(Object.freeze));
  for(const panel of panels){
    panel.__sequencerEventsInWindow=(from,to)=>{
      const s=model.getState(), source=panel.part==='drums'?drums:s[panel.part+'Notes'],step=panel.part==='drums'?48:96;
      const events=[];
      for(let i=Math.ceil(from/step);i*step<to;i++){
        const item=source[i%source.length];if(item==null)continue;
        const pitches=panel.part==='drums'?item:[item];
        pitches.forEach((note,voice)=>events.push({eventTick:i*step,eventKey:panel.part+':'+i+':'+voice,note}));
      }
      return events;
    };
    panel.__sequencerScheduleEvent=(event,when,metadata)=>{
      const s=model.getState(),part=panel.part;
      // Original is a lab-only context bypass, preserving occurrence identity,
      // tick, timbre, velocity and explicit Transpose.
      const occurrence=s.mode==='original'?{...metadata,context:normalizeContext({...metadata.context,harmony:null})}:metadata;
      // Read mode once at scheduling, from the same model that renders the UI.
      // Missing Follow context is a failure, never an implicit Original fallback.
      if(part!=='drums' && s.mode==='follow' && !resolveChordAtTick(occurrence.context,event.eventTick)){
        reportModeError();return;
      }
      triggerInstrument(part==='drums'?event.note:part==='bass'?s.bassInstrument:'pluck',part==='drums'?'C4':event.note,when,panel.id,
        {playbackOccurrence:occurrence,musicalRole:part==='drums'?'percussion':s[part+'Role'],...(part==='melody'?{env:{decaySec:.18,releaseSec:.08}}:{})},part==='drums'?.48:.6);
    };
  }
  const adapter=createChainSequenceAdapter({getToy:id=>panels.find(p=>p.id===id),chainState:new Map()});
  const ids={band:prefix+':band',progression:prefix+':progression',song:prefix+':song'};
  function sync(){
    const s=model.getState(),tick=transport.currentTick,options={transportId:transport.id};
    // A long-lived occurrence allows editable progressions of any supported
    // length to wrap via the resolver without a lab chord counter or restart.
    adapter.runtime.defineStructure(ids.band,'together',panels.map(p=>({toyId:p.id,durationTicks:Number.MAX_SAFE_INTEGER})),tick,options);
    adapter.runtime.defineModifier(ids.progression,'chord-progression',[{structureId:ids.band}],tick,{...options,chords:s.chords,stepTicks:s.stepTicks});
    const root={headId:ids.song,type:'transpose',semitones:s.transpose,transportId:transport.id,
      children:[{structureId:ids.progression}],members:panels.map(p=>p.id)};
    if(!adapter.hasSequence(ids.song)){
      adapter.runtime.defineModifier('sequence:'+ids.song,'transpose',root.children,tick,{...options,semitones:s.transpose});
      adapter.runtime.startStructure('sequence:'+ids.song,tick,{quantize:false});
    }
    adapter.sync(panels,transport.getState(),{runtimeRoots:[root]});
  }
  sync();
  function audible(part){const s=model.getState(),mix=s.mix[part];return mix.volume>0&&!mix.muted&&(s.soloPart===null||s.soloPart===part);}
  function record(detail){
    if(!panels.some(p=>p.id===detail.toyId)||!detail.pitchDecision||detail.pitchDecision.role==='percussion')return;
    // The production boundary emits this decision synchronously at scheduling.
    // Derive the table's mode from its resolved harmony, not from display state.
    const mode=detail.pitchDecision.resolvedChord?'follow':'original';
    if(model.getState().mode==='follow' && mode!=='follow'){reportModeError();return;}
    const part=panels.find(p=>p.id===detail.toyId).part;
    if(!audible(part))return;
    pending.push(Object.freeze({...detail.pitchDecision,when:detail.when,instrument:detail.instrument,velocity:detail.velocity,mode,part,evaluationEpoch}));
    pending.sort((a,b)=>a.when-b.when);
    if(pending.length>64)pending.splice(0,pending.length-64);
  }
  function updateSounding(){
    if(transport.state!=='playing')return;
    const now=ensureAudioContext().currentTime;
    while(pending.length&&pending[0].when<=now){
      const event=pending.shift();history.push(event);
      if(event.evaluationEpoch===evaluationEpoch){
        evaluation.record(event,model.getState().melodyNotes);
        const decision=event.part==='melody'?evaluation.inspect().latest:event;
        logEvents.push(decision);if(logEvents.length>4096){logEvents.shift();logDropped++;}
      }
      if(history.length>24)history.shift();
    }
  }
  function tick(){
    const now=transport.currentTick;
    let scheduleTick=now;
    updateSounding();
    if(comparison && now>=comparison.cycleTicks*2){transport.pause();silence();comparison=null;comparisonCompleted=true;}
    else if(comparison?.phase==='original' && now>=comparison.cycleTicks){
      panels.forEach(p=>cancelScheduledToySources(p.id));
      // This boundary deliberately waits until Original has finished. Preserve
      // its first Follow beat when the timer polls a few ticks after the edge.
      scheduleTick=comparison.cycleTicks;
      model.setMode('follow');comparison.phase='follow';
    }
    if(transport.state==='playing'){
      const horizon=now+Math.max(8,Math.ceil(transport.bpm*96/60*.12));
      const end=comparison?Math.min(horizon,comparison.cycleTicks*(comparison.phase==='original'?1:2)):horizon;
      scheduler.tick({transportId:transport.id,currentTick:scheduleTick,lookaheadEndTick:end,
        playbackTurns:adapter.turnsForLookahead(scheduleTick,end,transport.id),getToy:id=>panels.find(p=>p.id===id),tickToAudioTime:transport.tickToAudioTime});
    }
    updateSounding();return inspection();
  }
  function inspection(){
    const now=transport.currentTick;
    const turn=adapter.runtime.turnsInWindow('sequence:'+ids.song,now,now+1)[0];
    return {runtimeError,logEvents:logEvents.slice(),logDropped,comparisonCompleted,evaluation:evaluation.inspect(),comparison:comparison?{...comparison}:null,state:model.getState(),transport:transport.getState(),chord:turn?resolveChordAtTick(turn.context,now):model.resolveChord(now),
      latest:history.at(-1)??null,events:history.slice(),pendingCount:pending.length};
  }
  function applyMix(){
    const s=model.getState();
    for(let i=pending.length-1;i>=0;i--)if(!audible(pending[i].part))pending.splice(i,1);
    for(const panel of panels){
      const mix=s.mix[panel.part];setToyVolume(panel.id,mix.volume);
      setToyMuted(panel.id,transport.state!=='playing'||mix.muted||(s.soloPart!==null&&s.soloPart!==panel.part),.015);
    }
  }
  function silence(){
    panels.forEach(p=>{cancelScheduledToySources(p.id);setToyMuted(p.id,true);});
    pending.length=0;scheduler.resetTimeline(transport.currentTick,{includeBoundary:false});
  }
  return {
    model,transport,panels,adapter,scheduler,record,tick,inspect:inspection,
    resetEvaluation(){resetEvaluation();onChange();},
    async playFromStart(mode){
      transport.pause();silence();comparison=null;comparisonCompleted=false;model.setMode(mode==='ab'?'original':mode);
      resetEvaluation();transport.returnToStart();adapter.reset();scheduler.resetTimeline(0);history.length=0;sync();
      if(mode==='ab')comparison={phase:'original',cycleTicks:comparisonCycleTicks(model.getState())};
      await transport.play();applyMix();tick();onChange();
    },
    edit(action){const before=model.getState();action(model);const after=model.getState();
      if(before.preset!==after.preset||before.bassNotes!==after.bassNotes||before.melodyNotes!==after.melodyNotes||before.chords!==after.chords||before.stepTicks!==after.stepTicks||before.melodyRole!==after.melodyRole){resetEvaluation();comparison=null;}
      if(before.mode!==after.mode)comparison=null;panels.forEach(p=>p.__seqRev++);sync();applyMix();onChange();},
    async play(){await transport.play();applyMix();tick();onChange();},
    pause(){comparison=null;transport.pause();silence();onChange();},
    returnToStart(){comparison=null;resetEvaluation();const playing=transport.state==='playing';silence();transport.returnToStart();adapter.reset();scheduler.resetTimeline(0);history.length=0;sync();if(playing){applyMix();tick();}onChange();},
    setBpm(value){const playing=transport.state==='playing';silence();model.setBpm(value);transport.setBpm(model.getState().bpm);if(playing)applyMix();onChange();},
    reset(){comparisonCompleted=false;comparison=null;resetEvaluation();runtimeError=null;transport.pause();silence();model.reset();transport.setBpm(120);transport.returnToStart();adapter.reset();scheduler.resetTimeline(0);history.length=0;sync();onChange();},
    dispose(){transport.pause();silence();adapter.reset();scheduler.dispose();transportRegistry.remove(transport.id);}
  };
}
