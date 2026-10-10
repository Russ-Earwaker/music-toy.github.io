import { createHarmonyLabLog, harmonyLabLogFileName, saveHarmonyLabLog } from './harmony-lab-export.js';
import { createHarmonyLabPlayback } from './harmony-lab-playback.js';
import { LAB_PROGRESSIONS, isHarmonyLabEnabled } from './harmony-lab-model.js';
import { createChordProgressionControls } from './chord-progression-editor.js';
import { chordLabel } from './chord-progression.js';
import { initAudioAssets } from './audio-samples.js';
if(isHarmonyLabEnabled(location.href))await startLab();
async function startLab(){
  const el=id=>document.getElementById(id);
  el('access').hidden=true;el('lab').hidden=false;window.__HARMONY_DEBUG=true;
  const lab=createHarmonyLabPlayback({onChange:()=>render()}),noteListener=e=>lab.record(e.detail);
  window.addEventListener('toy:note',noteListener);
  const editor=createChordProgressionControls({
    get:()=>lab.model.getState(),setProgression:(id,value)=>lab.edit(model=>model.setProgression(value))
  },'lab',()=>render());
  el('progression').append(editor.body);
  let lastEvents=null,lastMelodyEvents=undefined,differences=false;
  const signed=value=>value>0?'+'+value:String(value);
  function render(snapshot=lab.inspect()){
    const s=snapshot.state,t=snapshot.transport;
    for(const [id,value] of [['bass-notes',s.bassText],['melody-notes',s.melodyText],['bass-role',s.bassRole],['melody-role',s.melodyRole],['preset',s.preset],['transpose',s.transpose],['bpm',s.bpm],['bass-instrument',s.bassInstrument]])
      if(document.activeElement!==el(id))el(id).value=String(value);
    for(const part of ['bass','melody','drums']){
      if(document.activeElement!==el(part+'-level'))el(part+'-level').value=String(Math.round(s.mix[part].volume*100));
      el(part+'-level-value').textContent=Math.round(s.mix[part].volume*100)+'%';
      el(part+'-mute').setAttribute('aria-pressed',s.mix[part].muted);
      el(part+'-solo').setAttribute('aria-pressed',s.soloPart===part);
    }
    el('original').setAttribute('aria-pressed',s.mode==='original');el('follow').setAttribute('aria-pressed',s.mode==='follow');
    el('selected-mode').textContent='Selected mode: '+(s.mode==='follow'?'Follow Chords':'Original');
    if(snapshot.runtimeError)el('error').textContent=snapshot.runtimeError;
    el('mode-note').textContent=s.mode==='original'?'Authored notes. Same instruments, rhythm and velocity.':'Production Follow Chords. Authored source remains unchanged.';
    el('source-bass').textContent='Bass: '+s.bassNotes.map(n=>n??'—').join(' ');
    el('source-melody').textContent='Melody: '+s.melodyNotes.map(n=>n??'—').join(' ');
    el('play').textContent=t.state==='playing'?'Pause':'Play';
    el('position').textContent='Bar '+(t.currentBar+1)+' · Beat '+(t.currentBeat%4+1);
    el('chord').textContent='Now: '+(snapshot.chord?chordLabel(snapshot.chord):'—');
    editor.render(s);
    const progressionIndex=LAB_PROGRESSIONS.findIndex(p=>JSON.stringify(p.chords)===JSON.stringify(s.chords));
    if(document.activeElement!==el('progression-preset'))el('progression-preset').value=progressionIndex<0?'custom':String(progressionIndex);
    el('comparison-status').textContent=snapshot.comparison?'A/B: '+(snapshot.comparison.phase==='original'?'Original':'Follow')+' · '+(snapshot.comparison.cycleTicks/384)+' bars per pass':snapshot.comparisonCompleted?'A/B complete · Original then Follow':'Each quick-play starts at tick zero.';
    const evaluation=snapshot.evaluation,stats=evaluation.stats,melody=evaluation.latest;
    const pattern=notes=>notes.map((n,i)=>(i>0&&i%4===0?'| ':'')+(n??'·')).join(' ');
    el('melody-source-pattern').textContent=pattern(s.melodyNotes.map(n=>n??'—'));
    el('melody-adapted-pattern').textContent=pattern(evaluation.pass.length?evaluation.pass:s.melodyNotes.map(n=>n==null?'—':null));
    for(const [id,value] of [['played',stats.played],['changed',stats.changed],['rate',Number(stats.changeRate.toFixed(2))+'%'],['average',stats.averageMovement.toFixed(2)+' st'],['largest',stats.largestMovement+' st'],['repeated',stats.repeatedPreserved+' / '+stats.repeatedTotal],['contour',stats.contourPreserved+' / '+stats.contourTotal],['leaps',stats.newLeaps]])el('stats-'+id).textContent=value;
    for(const [id,value] of [['source',melody?.sourceNote],['chord',melody?.resolvedChord?chordLabel(melody.resolvedChord):null],['scale',melody?.scale?melody.scale.root+' '+melody.scale.quality:null],['adapted',melody?.adaptedNote],['movement',melody?signed(melody.movement)+' st':null],['previous',melody?.previousAdaptedNote],['contour',melody?.contour],['final',melody?.finalNote]])el('melody-'+id).textContent=value??'—';
    if(lastMelodyEvents!==evaluation.events.at(-1)){
      lastMelodyEvents=evaluation.events.at(-1);el('melody-events').replaceChildren();
      let boundary=null;
      for(const event of evaluation.events){
        const block=Math.floor(event.eventTick/s.stepTicks),label=chordLabel(event.resolvedChord);
        if(block!==boundary){const row=document.createElement('tr'),cell=document.createElement('th');row.className='chord-boundary';cell.colSpan=6;cell.textContent=label+' · chord boundary at tick '+block*s.stepTicks;row.append(cell);el('melody-events').append(row);boundary=block;}
        const row=document.createElement('tr');row.className=event.changed?'melody-row changed':'melody-row kept';
        for(const value of [event.eventTick,event.sourceNote,event.adaptedNote,event.changed?'yes':'no',signed(event.movement),label]){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}el('melody-events').append(row);
      }
    }
    const p=snapshot.latest;
    for(const [id,value] of [['source',p?.sourceNote],['role',p?.role],['resolved-chord',p?.resolvedChord?chordLabel(p.resolvedChord):null],['adapted',p?.adaptedNote],['offset',p?signed(p.transpose):null],['final',p?.finalNote]])el(id).textContent=value??'—';
    el('decision-status').textContent=p?(p.part==='bass'?'Bass':'Melody')+' · '+(p.mode==='follow'?'Follow Chords':'Original')+' · tick '+p.eventTick:'Press Play to inspect pitch decisions.';
    if(lastEvents!==p){
      lastEvents=p;el('events').replaceChildren();
      for(const e of [...snapshot.events].reverse()){
        const row=document.createElement('tr');
        for(const value of [e.eventTick,e.part+' / '+(e.mode==='follow'?'Follow':'Original'),e.role,e.sourceNote,e.resolvedChord?chordLabel(e.resolvedChord):'—',e.adaptedNote,signed(e.transpose),e.finalNote]){
          const cell=document.createElement('td');cell.textContent=String(value);row.append(cell);
        }el('events').append(row);
      }
    }
  }
  function clearError(){el('error').textContent='';for(const part of ['bass','melody'])el(part+'-notes').removeAttribute('aria-invalid');}
  el('differences').addEventListener('click',()=>{
    differences=!differences;el('differences').setAttribute('aria-pressed',differences);el('melody-evaluation').classList.toggle('differences-on',differences);
    el('difference-note').textContent=differences?'Changed notes highlighted; kept notes dimmed. Audio mode is unchanged.':'Choose Differences to highlight harmony changes. Transpose is excluded from movement.';
  });
  el('progression-preset').addEventListener('change',e=>lab.edit(model=>model.loadProgression(Number(e.target.value))));
  for(const [id,mode] of [['play-original','original'],['play-follow','follow'],['play-ab','ab']])el(id).addEventListener('click',async()=>{try{await lab.playFromStart(mode);}catch(error){el('error').textContent='Playback could not start: '+error.message;}});
  const logSnapshot=()=>createHarmonyLabLog(lab.tick(),{href:location.href});
  async function resultsEndpoint(){
    let override=window.__DEBUG_OUTPUT_URL;
    try{override=override||window.parent.__DEBUG_OUTPUT_URL;}catch{}
    if(override)return override;
    try{
      const response=await fetch(new URL('../resources/perf-lab-auto.json',import.meta.url));
      if(response.ok){const config=await response.json();return config.debugOutputUrl||config.postUrlDebug||'http://localhost:5174/debug-output';}
    }catch{}
    return 'http://localhost:5174/debug-output';
  }
  el('save-logs').addEventListener('click',async()=>{
    const snapshot=logSnapshot();el('save-logs').disabled=true;el('log-save-status').textContent='Saving logs…';
    try{
      const result=await saveHarmonyLabLog(snapshot,{endpoint:await resultsEndpoint()});
      el('log-save-status').textContent='Saved '+result.fileName+' (resources/debug-output on the default server).';
    }catch(error){el('log-save-status').textContent='Save failed: '+error.message+'. Check the results server, or use Download logs JSON.';}
    finally{el('save-logs').disabled=false;}
  });
  el('download-logs').addEventListener('click',()=>{
    const snapshot=logSnapshot(),url=URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'})),link=document.createElement('a');
    link.href=url;link.download=harmonyLabLogFileName(snapshot.createdAt);link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  el('reset-comparison').addEventListener('click',()=>lab.resetEvaluation());
  el('original').addEventListener('click',()=>lab.edit(model=>model.setMode('original')));
  el('follow').addEventListener('click',()=>lab.edit(model=>model.setMode('follow')));
  for(const part of ['bass','melody']){
    el(part+'-role').addEventListener('change',e=>lab.edit(model=>model.setRole(part,e.target.value)));
    el(part+'-notes').addEventListener('input',e=>{
      try{lab.edit(model=>model.setNotes(part,e.target.value));e.target.removeAttribute('aria-invalid');el('error').textContent='';}
      catch(error){e.target.setAttribute('aria-invalid','true');el('error').textContent=error.message;}
    });
  }
  el('bass-instrument').addEventListener('change',e=>lab.edit(model=>model.setBassInstrument(e.target.value)));
  for(const part of ['bass','melody','drums']){
    el(part+'-level').addEventListener('input',e=>lab.edit(model=>model.setMix(part,{volume:Number(e.target.value)/100})));
    el(part+'-mute').addEventListener('click',()=>lab.edit(model=>model.setMix(part,{muted:!model.getState().mix[part].muted})));
    el(part+'-solo').addEventListener('click',()=>lab.edit(model=>model.setSolo(model.getState().soloPart===part?null:part)));
  }
  el('preset').addEventListener('change',e=>{clearError();lab.edit(model=>model.loadPreset(e.target.value));});
  el('transpose').addEventListener('input',e=>{if(e.target.value!=='')lab.edit(model=>model.setTranspose(e.target.value));});
  el('transpose').addEventListener('change',()=>{el('transpose').value=String(lab.model.getState().transpose);});
  el('bpm').addEventListener('input',e=>{if(e.target.value!=='')lab.setBpm(e.target.value);});
  el('bpm').addEventListener('change',e=>{lab.setBpm(e.target.value);e.target.value=String(lab.model.getState().bpm);});
  el('play').addEventListener('click',async()=>{try{if(lab.transport.state==='playing')lab.pause();else await lab.play();}catch(error){el('error').textContent='Playback could not start: '+error.message;}});
  el('start').addEventListener('click',()=>lab.returnToStart());
  el('reset').addEventListener('click',()=>{clearError();lab.reset();});
  const embedded = window.parent !== window;
  const menuMessage = event => {
    if (embedded && event.source === window.parent && event.origin === location.origin && event.data?.type === 'rhythmake:harmony-lab:pause') lab.pause();
  };
  const menuShortcut = event => {
    if (embedded && event.ctrlKey && event.shiftKey && String(event.key).toLowerCase() === 'p') {
      event.preventDefault();
      window.parent.postMessage({ type: 'rhythmake:harmony-lab:toggle' }, location.origin);
    }
  };
  window.addEventListener('message', menuMessage);
  window.addEventListener('keydown', menuShortcut);
  render();
  const timer=setInterval(()=>render(lab.tick()),25);
  window.addEventListener('pagehide',()=>{clearInterval(timer);window.removeEventListener('toy:note',noteListener);window.removeEventListener('message',menuMessage);window.removeEventListener('keydown',menuShortcut);lab.dispose();},{once:true});
  try{await initAudioAssets('./instruments.csv');for(const id of ['play','play-original','play-follow','play-ab'])el(id).disabled=false;}
  catch(error){el('error').textContent='Audio could not load: '+error.message;}
}
