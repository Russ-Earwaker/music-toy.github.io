import assert from 'node:assert/strict';

export function verifyAuthoredMusicPlaythrough(data) {
 const audio=data.events.filter(e=>e.type==='music_mix_debug');
 const samples=data.events.filter(e=>e.type==='audio_sample_started');
 const summary=[];
 for(const [lane,type,minCommits] of [
  ['foundation_lane','music_missile_rewrite_committed_to_theme',2],
  ['secondary_loop_lane','pinball_bouncer_rewrite_committed_to_theme',2],
  ['primary_loop_lane','lead_ball_rewrite_committed_to_theme',1],
 ]) {
  const commits=data.events.filter(e=>e.type===type);
  assert.ok(commits.length>=minCommits,lane+' completed authoring');
  if(lane!=='primary_loop_lane') {
   for(let i=1;i<commits.length;i++) {
    const before=commits[i-1].payload.patternChain.join('');const after=commits[i].payload.patternChain.join('');
    assert.ok([...before].every((hit,index)=>hit!=='1'||after[index]==='1'),lane+' contributions accumulate');
   }
  } else assert.equal(commits[0].payload.incomingNotesByStep.filter(Boolean).length,8);
  const temporarySources=['music-missile-motif-loop','pinball-bouncer-motif-loop','lead-ball-motif-loop'];
  assert.ok(!audio.some(e=>e.payload.lane===lane&&e.stepIndex>commits[0].stepIndex&&temporarySources.includes(e.payload.source)),lane+' has one playback owner after commit');
  const canonical=audio.filter(e=>e.payload.lane===lane&&(e.payload.source==='performed_event'||e.payload.eventType==='player-lead-theme-direct'));
  assert.ok(canonical.length,lane+' canonical scheduling');
  let checked=0;
  for(let i=0;i<commits.length;i++) {
   const commit=commits[i];
   const pattern=lane==='primary_loop_lane'?commit.payload.incomingNotesByStep:commit.payload.patternChain.join('').split('').map(Number);
   const origin=lane==='primary_loop_lane'?commit.stepIndex+1:0;
   const end=commits[i+1]?.stepIndex??Math.max(...audio.map(e=>e.stepIndex))-2;
   for(let step=commit.stepIndex+2;step<end;step++) {
    const expected=pattern[((step-origin)%pattern.length+pattern.length)%pattern.length];
    const hits=canonical.filter(e=>e.stepIndex===step);
    assert.equal(hits.length,expected?1:0,lane+' authored note/rest at transport step '+step);
    if(expected){checked++;assert.ok(hits[0].payload.finalExecutionGain>0);if(lane==='primary_loop_lane')assert.deepEqual(hits[0].payload.notes,[expected]);}
   }
  }
  const finalPhase=data.musicPhases.at(-1).events.filter(e=>e.type==='music_mix_debug'&&e.payload.lane===lane);
  assert.ok(finalPhase.length>= (lane==='primary_loop_lane'?40:12),lane+' repeats beyond handoff');
  const actualSamples=samples.filter(e=>e.payload.lane===lane&&e.audio.state==='running'&&(e.audio.duration>0||e.audio.kind==='OscillatorNode'));
  assert.ok(actualSamples.length>=8,lane+' starts real audio voices repeatedly');
  summary.push({lane,commits:commits.length,canonicalEventsChecked:checked,actualVoicesStarted:actualSamples.length,finalPhaseEvents:finalPhase.length});
 }
 const impacts=data.events.filter(e=>e.type==='lead_ball_physical_impact'&&e.payload.queued);
 assert.ok(impacts.length>=8,'eight real target impacts');
 assert.equal(new Set(impacts.slice(0,8).map(e=>e.payload.enemyId)).size,8,'distinct targets, no overlapping duplicates');
 assert.ok(impacts.every(e=>Math.abs(Math.hypot(e.payload.velocity.x,e.payload.velocity.y)-1450)<1e-6),'preserved ball speed');
 return summary;
}
