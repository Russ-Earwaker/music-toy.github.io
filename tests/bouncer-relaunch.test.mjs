import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {patternLearningStartTick} from '../src/pattern-learning-anchor.js';
import {recordBouncerTrajectorySample,interpolateBouncerTrajectory} from '../src/bouncer-transport.js';

// Exercise the production launch, bar-transition and replay code without a
// browser/audio device. Collision events are supplied at the recorder boundary.
const main = readFileSync(new URL('../src/bouncer.main.js', import.meta.url), 'utf8');
function section(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `Missing production section: ${start}`);
  return source.slice(a, b);
}
const launchCode = section(main, '  function spawnBallFrom(', 'function setNextLaunchAt(');
const recorderCode = section(main, '  function stateSignature(', '  // Spawn debounce');

function harness() {
  const played = [];
  const clock = { currentTime: 0.25 };
  const recorder = { mode: 'record', pattern: [], signature: '', seen: new Set() };
  const context = vm.createContext({
    console, window: {}, DBG_RESPAWN: () => false,
    toyId: 'bouncer-test',
    panel: { id: 'bouncer-test', dataset: {}, dispatchEvent() {} }, blocks: [], edgeControllers: [],
    visQ: { loopRec: recorder }, lastLaunch: null, ball: null, nextLaunchAt: null,
    ensureAudioContext: () => clock, isRunning: () => true,
    getLoopInfo: () => ({ now: clock.currentTime, loopStartTime: 0, barLen: 2 }),
    getTransportState: () => ({ currentTick: Math.round(clock.currentTime * 192) }),
    audioTimeToTick: value => Math.round(value * 192),
    tickToAudioTime: tick => tick / 192,
    activatePlaybackInstance: (_id, tick) => ({ startTick: tick }),
    getPlaybackInstance: () => ({ startTick: 0 }),
    replayVisualEvents: { clear() {} },
    clearAllPendingHits() {},
    bumpToyAudioGen() {},
    nextBouncerRecordingStartTick: tick => (Math.floor(tick / 384) + 1) * 384,
    TICKS_PER_BAR: 384, TICKS_PER_BEAT: 96,
    ballR: () => 7, BOUNCER_BARS_PER_LIFE: 1, fx: {},
    shouldRunPhysics: true, isChained: false,
  });
  context.S = {
    visQ: context.visQ, getLoopInfo: context.getLoopInfo, instrument: 'test',
    getQuantDiv: () => 2,
    triggerInstrumentRaw: (instrument, note, when) => played.push({ note, when }),
  };
  vm.runInContext(`${recorderCode}\n${launchCode}`, context);
  return { context, clock, recorder, played };
}

test('successive manual launches retain the recorder object and discard the prior pattern', () => {
  const { context, clock, recorder } = harness();
  const sharedRecorder = recorder;
  for (const [index, note] of ['C4', 'E4', 'G4'].entries()) {
    const launchAt = index * 6 + 0.25;
    clock.currentTime = launchAt;
    context.spawnBallFrom({ x: 40 + index * 60, y: 90, vx: 120, vy: -80 });
    assert.equal(context.visQ.loopRec, sharedRecorder, 'keep shared recorder references valid');
    assert.equal(recorder.mode, 'record');
    assert.equal(recorder.pattern.length, 0, 'discard the previous launch pattern');
    context.onNewBar(context.getLoopInfo(), 0);
    recorder.pattern.push({ note, offsetTick: 96 });
    clock.currentTime = launchAt + 2;
    context.onNewBar(context.getLoopInfo(), 1);
    assert.equal(recorder.mode, 'replay');
    assert.equal(recorder.pattern[0].offsetTick, 96);
  }
});

test('automatic respawn preserves the recorded pattern and replay state', () => {
  const { context, recorder } = harness();
  recorder.mode = 'replay';
  recorder.pattern.push({ note: 'D4', offset: 0.5 });
  const pattern = recorder.pattern;
  const state = {};
  context.spawnBallFrom({ x: 30, y: 40, vx: 50, vy: 60 }, { isRespawn: true }, state);
  assert.equal(recorder.mode, 'replay');
  assert.equal(recorder.pattern, pattern);
  assert.equal(pattern.length, 1);
  assert.equal(state.nextLaunchAt, 2.25);
});

test('chain launches retain the exact handoff time despite a late frame', () => {
  const { context, clock, recorder } = harness();
  clock.currentTime = 2.29;
  const ball = context.spawnBallFrom({ x: 30, y: 40, vx: 50, vy: 60 }, { startAt: 2.25 });
  assert.equal(ball.spawnTime, 2.25);
  assert.equal(ball.flightEnd, 4.25);
  assert.equal(recorder.anchorStartTime, 2.25);
  clock.currentTime = 4.31;
  const next = context.spawnBallFrom({ x: 30, y: 40, vx: 50, vy: 60 }, { startAt: ball.flightEnd });
  assert.equal(next.flightEnd, 6.25, 'frame delays must not accumulate in the chain');
});

test('a stopped launch uses retained transport tick and captures the new launch signature', () => {
  const { context, clock, recorder } = harness();
  clock.currentTime = 42;
  context.isRunning = () => false;
  context.getTransportState = () => ({ currentTick: 0 });
  let activatedAt = null;
  context.activatePlaybackInstance = (_id, tick) => {
    activatedAt = tick;
    return { startTick: tick };
  };
  context.spawnBallFrom({ x: 40, y: 90, vx: 120, vy: -80 });
  assert.equal(activatedAt, 0, 'AudioContext wall time must not move stopped musical time');
  assert.equal(recorder.recordingStartTick, 0);
  assert.equal(recorder.signature, context.stateSignature(), 'the authored launch must not invalidate itself');
  assert.equal(recorder.trajectory[0].offsetTick, 0);
});

test('Bouncer records the complete first local bar before entering replay', () => {
  const { context, recorder } = harness();
  context.spawnBallFrom({ x: 40, y: 90, vx: 120, vy: -80 });
  recorder.trajectory.push({ offsetTick: 4, x: 44, y: 86, r: 7 });
  context.onNewBar(context.getLoopInfo(), 0);
  assert.equal(recorder.mode, 'record', 'local bar zero is the learning pass, not its completion');
  recorder.pattern.push({ note: 'C4', offsetTick: 96 });
  context.onNewBar(context.getLoopInfo(), 1);
  assert.equal(recorder.mode, 'replay');
});

test('a chained Bouncer hands off after learning instead of replaying its first turn twice', () => {
  const { context, recorder } = harness();
  const handoffs = [];
  context.CustomEvent = class {
    constructor(type, options) { this.type = type; this.detail = options?.detail; }
  };
  context.panel.dataset.nextToyId = 'bouncer-b';
  context.panel.dataset.chainActive = 'true';
  context.panel.dispatchEvent = event => handoffs.push(event);
  context.spawnBallFrom({ x: 40, y: 90, vx: 120, vy: -80 });
  recorder.trajectory.push({ offsetTick: 4, x: 44, y: 86, r: 7 });
  recorder.pattern.push({ note: 'C4', offsetTick: 96 });
  context.onNewBar(context.getLoopInfo(), 0);
  assert.equal(handoffs.filter(event => event.type === 'chain:next').length, 0);
  context.onNewBar(context.getLoopInfo(), 1);
  const nextEvents = handoffs.filter(event => event.type === 'chain:next');
  assert.equal(nextEvents.length, 1);
  assert.equal(nextEvents[0].detail.completedAt, 2.25);
});

test('Bouncer bar transitions are disabled while transport is stopped', () => {
  const render = readFileSync(new URL('../src/bouncer-render.js', import.meta.url), 'utf8');
  assert.match(render, /if \(isRunning\(\) && S && typeof S\.getLoopInfo/);
});

test('randomising an inactive follower replaces the saved launch and discards its previous replay',()=>{
 const {context,recorder}=harness();
 context.panel.dataset.prevToyId='A';context.panel.dataset.chainActive='false';
 Object.assign(context,{
  handle:{x:20,y:30,vx:1,vy:2},physW:()=>300,physH:()=>300,EDGE:4,
  shouldDeferChanges:()=>false,hasPreviewState:()=>false,
  doRandomCubes:()=>{},doRandomNotes:()=>{},circleRectHit:()=>false,
  velFrom:()=>({vx:9,vy:-4}),
 });
 context.lastLaunch={x:20,y:30,vx:1,vy:2};context.ball={x:21,y:31};
 recorder.mode='replay';recorder.pattern=[{note:'C4',offsetTick:48}];recorder.trajectory=[{x:20,y:30,offsetTick:0}];
 const commit=section(main,'  function commitHandleLaunch(','  function applyPreviewState(');
 const random=section(main,'  function doRandom(options','  function doRandomCubes(');
 vm.runInContext(commit+'\n'+random,context);
 context.doRandom();
 assert.deepEqual({...context.lastLaunch},{x:context.handle.x,y:context.handle.y,vx:9,vy:-4});
 assert.equal(context.ball,null);assert.equal(context.nextLaunchAt,null);
 assert.equal(recorder.mode,'record');assert.equal(recorder.pattern.length,0);assert.equal(recorder.trajectory.length,0);
 const next=context.spawnBallFrom(context.lastLaunch,{startAt:2});
 assert.equal(next.x,context.handle.x);assert.equal(next.y,context.handle.y);
 assert.equal(next.spawnTime,2);
});

test('deferred follower randomisation keeps the current shot until applying the new launch and trajectory together',()=>{
 const {context,recorder}=harness();
 const oldBall={x:20,y:30};context.ball=oldBall;context.handle={x:20,y:30};
 recorder.mode='replay';recorder.pattern=[{note:'C4'}];recorder.trajectory=[{x:20,y:30}];
 context.previewState={blocks:[],edgeControllers:[],handle:{x:180,y:140,vx:6,vy:-7,userPlaced:true}};
 context.clearPreviewState=()=>{context.previewState=null;};context.syncBlockAnchors=()=>{};
 const code=section(main,'  function commitHandleLaunch(','  function isBouncerChained(');
 vm.runInContext(code,context);
 assert.equal(context.ball,oldBall);assert.equal(recorder.mode,'replay');
 context.applyPreviewState();
 assert.deepEqual({...context.lastLaunch},{x:180,y:140,vx:6,vy:-7});
 assert.equal(context.ball,null);assert.equal(recorder.mode,'record');assert.equal(recorder.trajectory.length,0);
 assert.equal(context.previewState,null);
});

function managedHeadRandomHarness(active){
 const h=harness(),{context,recorder}=h;
 Object.assign(context,{
  handle:{x:20,y:30,vx:1,vy:2,userPlaced:true},physW:()=>300,physH:()=>300,EDGE:4,
  doRandomCubes:()=>{},doRandomNotes:()=>{},circleRectHit:()=>false,
  velFrom:()=>({vx:9,vy:-4}),previewState:null,syncBlockAnchors(){},patternLearningStartTick,
 });
 context.panel.__sequenceDefinitionId='root';context.panel.dataset.nextToyId='B';context.panel.dataset.chainActive=active?'true':'false';
 context.panel.classList={add(){},remove(){}};
 const instance={active,structureTurnId:'A-turn',startTick:768,endTick:1152};
 context.getPlaybackInstance=()=>instance;
 context.activatePlaybackInstance=()=>assert.fail('Random must not replace a structure occurrence');
 context.lastLaunch={x:20,y:30,vx:1,vy:2};context.ball={x:21,y:31};
 recorder.mode='replay';recorder.pattern=[{note:'C4',offsetTick:48}];recorder.trajectory=[{x:20,y:30,offsetTick:0},{x:80,y:70,offsetTick:192}];
 vm.runInContext(section(main,'  function cloneBlock(','  function isBouncerChained(')+'\n'+
  section(main,'  function shouldDeferChanges(','  const isAdvanced =')+'\n'+
  section(main,'  function doRandom(options','  function doRandomCubes('),context);
 return {...h,instance};
}

test('Random on a waiting chain head learns at its next assigned turn and keeps moving on successive returns',()=>{
 const {context,recorder,clock,instance}=managedHeadRandomHarness(false);
 clock.currentTime=2.5; // B is playing. A must not launch into an inactive recording window.
 context.doRandom();assert.equal(context.ball,null);assert.equal(recorder.trajectory.length,0);
 const start={...context.lastLaunch};
 instance.active=true;clock.currentTime=4;context.onNewBar(context.getLoopInfo(),0);
 assert.equal(recorder.recordingStartTick,768);
 const ball=context.spawnBallFrom(start,{startAt:4});
 for(let offset=12;offset<384;offset+=12){
  ball.x=start.x+offset/4;ball.y=start.y+offset/8;
  recordBouncerTrajectorySample(recorder.trajectory,ball,768+offset,768);
 }
 clock.currentTime=6;context.onNewBar(context.getLoopInfo(),1);assert.equal(recorder.mode,'replay');
 assert.ok(recorder.trajectory.length>2);
 const saved=JSON.stringify(recorder.trajectory);
 for(const turnStart of [1536,2304,3072]){
  instance.startTick=turnStart;instance.endTick=turnStart+384;clock.currentTime=turnStart/192;
  context.onNewBar(context.getLoopInfo(),(turnStart-768)/384);
  const a=interpolateBouncerTrajectory(recorder.trajectory,48),b=interpolateBouncerTrajectory(recorder.trajectory,192);
  assert.notEqual(a.x,b.x,'replay must move rather than interpolate one stale launch sample');
  assert.equal(JSON.stringify(recorder.trajectory),saved);
 }
});

test('Random on the playing chain head defers its launch and preserves the current learned shot until turn end',()=>{
 const {context,recorder}=managedHeadRandomHarness(true),ball=context.ball,launch=context.lastLaunch;
 context.doRandom();assert.equal(context.ball,ball);assert.equal(context.lastLaunch,launch);
 assert.equal(recorder.mode,'replay');assert.ok(context.previewState.handle);
 context.applyPreviewState();assert.equal(context.ball,null);assert.equal(recorder.mode,'record');
 assert.equal(recorder.trajectory.length,0);assert.equal(context.lastLaunch.x,context.handle.x);
});
