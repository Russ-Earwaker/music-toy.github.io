import test from 'node:test';
import assert from 'node:assert/strict';
import { handleBeatStepChangeRuntime } from '../src/beat-swarm/beat-swarm-beat-update-runtime.js';
import { processBeatSwarmStepEventsRuntime } from '../src/beat-swarm/beat-swarm-step-events.js';

// Exercise the real adapter, arbitration, queue and drain over repeated shared ticks.
for (const stage of ['silent', 'low', 'release', 'settle', 'peak']) {
 test('canonical authored layers repeat through director '+stage, () => {
  const played = [];let queue=[];
  const foundation = [1,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1];
  const accent = [0,1,0,0,0,0,0,0,0,0,0,0,1,0,0,0];
  const director={getLanePlan:()=>({__arrangementState:{intensityAuditionSection:stage}}),enqueueBeatEvent:e=>(queue.push(e),e),drainBeatEventsForStep:()=>{const out=queue;queue=[];return out}};
  const helpers={processBeatSwarmStepEventsRuntime,createLoggedPerformedBeatEvent:e=>e,executePerformedBeatEvent:e=>(played.push(e),true),isPlayerMusicThemeAuthored:id=>['bassDrive','accentRhythm','leadTheme'].includes(id),getPlayerSimpleRhythmThemePlaybackStep:(id,step)=>({active:!!(id==='bassDrive'?foundation:accent)[step%16],sequenceStep:step%16,localStep:step%8,phrasePartIndex:Math.floor(step%16/8),patternKey:'authored'}),getPlayerSimpleRhythmThemeInstrumentId:()=> 'DRUM KICK',getPlayerSimpleRhythmThemeNote:()=> 'C4',hasLeadBallAuthoredMotif:()=>true,createPrimaryLoopLaneEventRuntime:({stepIndex,beatIndex})=>stepIndex%4===0?{stepIndex,beatIndex,note:'C4',instrumentId:'RETRO SQUARE',role:'lead',sourceSystem:'music',actionType:'player-lead-theme-direct',payload:{musicLayer:'loops',musicLaneId:'primary_loop_lane',leadBallMotifDerived:true,leadAuthoringLiteralReplay:true,leadPlayerThemeSource:'leadTheme',ghostPlayback:true,musicProminence:'full'}}:null};
  for(let stepIndex=1;stepIndex<=128;stepIndex++)handleBeatStepChangeRuntime({stepIndex,beatIndex:Math.floor(stepIndex/2),barIndex:Math.floor(stepIndex/8),director,tick:{stepChanged:true},state:{lastSpawnerEnemyStepIndex:stepIndex-1,lastWeaponTuneStepIndex:stepIndex-1,preserveAuthoredAccentContinuity:true,literalLeadPlaybackActive:true},constants:{weaponTuneSteps:8},helpers});
  for(const [lane,pattern] of [['foundation_lane',foundation],['secondary_loop_lane',accent]]) {
   const events=played.filter(e=>e.payload?.musicLaneId===lane);
   assert.equal(events.length,pattern.filter(Boolean).length*8,lane);
   assert.ok(events.every(e=>pattern[e.stepIndex%16]),'respects authored rests');
  }
  assert.equal(played.filter(e=>e.payload?.musicLaneId==='primary_loop_lane').length,32);
 });
}
