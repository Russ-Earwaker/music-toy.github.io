import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { drawWaves, drawGenerator } from '../src/ripplesynth-waves.js';
import { createRippleParticles } from '../src/ripplesynth-particles.js';
import { drawBlocksSection } from '../src/ripplesynth-blocks.js';
import { makeGetBlockRects } from '../src/ripplesynth-rects.js';
import { createScheduler } from '../src/ripplesynth-scheduler.js';
import {ripplerCycleAtTick} from '../src/ripplesynth-transport.js';
import { handleBlockTap } from '../src/ripplesynth-zoomtap.js';
import { rippleNoteTime } from '../src/ripplesynth-audio.js';
import { createRipplerViewportSpace, doesRippleIntersectBlock } from '../src/rippler-viewport-space.js';

const source = readFileSync(new URL('../src/ripplesynth-core.js', import.meta.url), 'utf8');
// Run the production render path through the generator, before chain scheduling.
const start = source.indexOf('  function draw(){');
const end = source.indexOf('      // Draw preview generator', start);
assert.ok(start >= 0 && end > start);
const renderCode = source.slice(start, end) + '\n} finally {} }';

test('structural turn completion commits Rippler preview once and invalidates the old learned pattern',()=>{
 const blocks=[{nx:.1,ny:.2,noteIndex:1,active:true}],pattern=[new Set([0])],offsets=[new Map([[0,96]])];
 let edits=0;
 const context=vm.createContext({panel:{},__schedState:{},blocks,pattern,patternOffsets:offsets,
  hasPreviewState:true,previewBlocks:[{nx:.8,ny:.7,noteIndex:8,active:true}],
  previewGenerator:{placed:true,nx:.3,ny:.4},generator:{placed:true,nx:.5,ny:.5},
  recording:false,recordOnly:new Set([0]),ripples:[{startTick:0}],replayRippleKey:'old',touchPattern:()=>edits++});
 const apply=source.slice(source.indexOf('  function applyPreviewState()'),source.indexOf('  function randomizeAll('));
 const a=source.indexOf('  panel.__sequenceTurnEnded ='),b=source.indexOf('  lifecycle.addCleanup',a);
 vm.runInContext(apply+'\n'+source.slice(a,b),context);
 context.panel.__sequenceTurnEnded();
 assert.equal(blocks[0].nx,.8);assert.equal(blocks[0].noteIndex,8);assert.equal(context.generator.nx,.3);
 assert.equal(context.hasPreviewState,false);assert.equal(context.previewGenerator.placed,false);
 assert.equal(pattern[0].size,0);assert.equal(offsets[0].size,0);assert.equal(context.recording,true);
 assert.equal(context.ripples.length,0);assert.equal(edits,1);
 context.panel.__sequenceTurnEnded();assert.equal(edits,1,'preview must not commit again on later cycles');
});

test('consecutive Rippler occurrences re-enter activation even without an inactive frame',()=>{
 let occurrenceId='first',commits=0;
 const context=vm.createContext({panel:{id:'rippler'},isActiveInChain:true,
  __schedState:{wasActiveInChain:true,activeOccurrenceId:'first'},
  getPlaybackInstance:()=>({occurrenceId}),applyPreviewState:()=>commits++});
 const a=source.indexOf('        const occurrenceId ='),b=source.indexOf('            const startAt =',a);
 const code='{'+source.slice(a,b)+'\n}}';
 vm.runInContext(code,context);assert.equal(commits,0);
 occurrenceId='second';vm.runInContext(code,context);assert.equal(commits,1);
 context.__schedState.activeOccurrenceId='second';occurrenceId='third';vm.runInContext(code,context);assert.equal(commits,2);
});

test('bar-boundary preview commit keeps Rippler recording until the new layout has completed its learning bar',()=>{
 let pending=true;const state={barStartAT:0,recording:false},ac={currentTime:2},rings=[];
 const scheduler=createScheduler({panel:{dataset:{}},ac,state,barSec:()=>2,generator:{placed:true},
  isPlaybackMuted:()=>false,sharedReplay:true,pattern:[],getPositionAtAudioTime:t=>t*192,
  applyPreviewState:()=>{if(!pending)return false;pending=false;state.recording=true;return true;},
  spawnRipple:()=>rings.push(ac.currentTime)});
 scheduler.tick();assert.equal(state.recording,true);assert.deepEqual(rings,[2]);
 ac.currentTime=3;scheduler.tick();assert.equal(state.recording,true);
 ac.currentTime=4;scheduler.tick();assert.equal(state.recording,false);
});

function fixture(placed) {
  const calls = { particles: 0, init: 0, waves: 0, generator: 0, times: [] };
  const ctx = new Proxy({ canvas: { width: 420, height: 420, clientWidth: 420, clientHeight: 420 } }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (key === 'arc') return (...args) => assert.ok(args.slice(0, 5).every(Number.isFinite));
      return () => {};
    },
  });
  const context = vm.createContext({
    lifecycle: { disposed: false }, startSection: () => () => {},
    panel: { dataset: {} }, window: {}, console,
    isRunning: () => true, ac: { currentTime: 1.5 }, __pausedNow: 1,
    getTransportState:()=>({currentTick:96}), TICKS_PER_BAR:384,
    syncReplayRipple(){},
    markPanelForDomCommit() {}, queueClassToggle() {}, queueDatasetSet() {},
    __schedState: {}, rippleNoteTime, generator: { placed, nx: 0.5, ny: 0.5, r: 10 },
    ripples: placed ? [{ x: 210, y: 210, startAT: 1, startTime: 1, speed: 200 }] : [],
    canvas: ctx.canvas, ctx, W: () => 420, H: () => 420,
    surfaceManager: { getCssW: () => 420, getCssH: () => 420, getDpr: () => 1 },
    createRipplerViewportSpace, doesRippleIntersectBlock,
    resizeCanvasForDPR() {}, didLayout: true, layoutBlocks() {},
    particlesInit: false, EDGE: 4,
    initParticles() { calls.init++; }, setParticleBounds() {},
    drawParticles() { calls.particles++; },
    drawWaves(...args) { calls.waves++; calls.times.push(args[3]); drawWaves(...args); },
    drawGenerator(...args) { calls.generator++; calls.times.push(args[4]); drawGenerator(...args); },
    BASE: 44, sizing: { scale: 1 }, boardScale: () => 1,
    blocks: [], getBlockRects: () => [], _loggedCubeOnce: true,
    drawBlocksSection() {}, noteList: [], hasPreviewState: false, previewBlocks: [],
    n2x: n => n * 420, n2y: n => n * 420, RING_SPEED: () => 200,
    NUM_STEPS: 8, stepSeconds: () => 0.25,
  });
  vm.runInContext(renderCode, context);
  return { context, calls };
}

function activationFixture() {
  const { context } = fixture(false);
  const block = { nx: 0.5, ny: 0.5, active: true, noteIndex: 0, flashDur: 0.18 };
  context.blocks = [block];
  context.getBlockRects = makeGetBlockRects(context.n2x, context.n2y, context.sizing, 44, context.blocks);
  context.drawBlocksSection = drawBlocksSection;
  const scales = [], whiteFlashes = [];
  context.ctx.scale = (x, y) => scales.push([x, y]);
  context.ctx.fillRect = (_x, _y, width, height) => {
    if (width === 44 && height === 44 && context.ctx.fillStyle === '#ffffff' && context.ctx.globalAlpha >= 0.25) {
      whiteFlashes.push(context.ctx.globalAlpha);
    }
  };
  function drawAt(time) {
    scales.length = whiteFlashes.length = 0;
    context.ac.currentTime = time;
    context.draw();
  }
  return { context, block, scales, whiteFlashes, drawAt };
}

test('admitted ripple radius follows transport ticks through pause, BPM and presentation changes',()=>{
  const {context}=fixture(true);
  const ring={x:120,y:140,playbackOnly:true,startTick:0,startAT:1};context.ripples=[ring];
  let tick=96;context.getTransportState=()=>({currentTick:tick});
  context.draw();const radius=ring.transportRadius;
  context.ac.currentTime=90;context.sizing.scale=2;context.draw();assert.equal(ring.transportRadius,radius);
  context.RING_SPEED=()=>400;context.draw();assert.equal(ring.transportRadius,radius);
  tick=192;context.draw();assert.equal(ring.transportRadius,2*radius);
});

test('a delayed frame records both same-pitch cubes and activates both on replay', () => {
  const { context } = fixture(false);
  const sounds = [];
  const blocks = [0, 1].map(() => ({ nx: 0.75, ny: 0.5, active: true, noteIndex: 0,
    vx: 0, vy: 0, flashEnd: 0, flashDur: 0.18 }));
  Object.assign(context, {
    blocks, recording: true, playbackMuted: false, dragMuteActive: false,
    generator: { placed: true, nx: 0.5, ny: 0.5 },
    ripples: [{ startAT: 0, speed: 200, lastHitRadius: 70 }],
    getBlockRects: () => blocks.map(() => ({ x: 310, y: 200, w: 20, h: 20 })),
    liveBlocks: new Set(), recordOnly: new Set(),
    pattern: Array.from({ length: 8 }, () => new Set()),
    patternOffsets: Array.from({ length: 8 }, () => new Map()),
    barStartAT: 0, barSec: () => 2, __getQuantDiv: () => 0,
    getLoopInfo: () => ({ beatLen: 0.5, loopStartTime: 0 }),
    currentInstrument: 'test', noteList: ['C4'],
    triggerInstrument: (_instrument, note, when) => sounds.push({ note, when }),
    __dbg() {}, touchPattern() {},
  });
  const a = source.indexOf('  function handleRingHits(');
  const b = source.indexOf('  function springBlocks(', a);
  vm.runInContext(source.slice(a, b), context);
  context.ac.currentTime = 0.65;
  context.handleRingHits(0.65);
  assert.equal(sounds.length, 2);
  assert.deepEqual([...context.pattern[2]], [0, 1]);
  context.handleRingHits(0.7);
  assert.equal(sounds.length, 2, 'each cube is hit only once per ripple');
  const replayStart = source.indexOf('  panel.__sequencerScheduleEvent =');
  const replayEnd = source.indexOf('\n  };', replayStart) + 5;
  const admitted=[];
  Object.assign(context,{toyId:'rippler-test',audioTimeToTick:t=>t,
    __rawTrig:(instrument,note,when,_id,options)=>{context.triggerInstrument(instrument,note,when);options.onPlaybackScheduled({when,note});},
    admittedToyVisual:(_panel,event,admission)=>admitted.push({...event,...admission}),
  });
  vm.runInContext(source.slice(replayStart, replayEnd), context);
  for (const blockIndex of context.pattern[2]) context.panel.__sequencerScheduleEvent({ blockIndex }, 2.65);
  assert.equal(sounds.length, 4);
  assert.deepEqual(admitted.map(e=>e.blockIndex),[0,1], 'both cubes retain distinct admitted replay activations');
  assert.ok(admitted.every(e=>e.when===2.65));
});

test('initially disabled cubes join the loop after enabling in either view', () => {
  for (const zoomed of [false, true]) {
    const { context, block, scales, drawAt } = activationFixture();
    const sounds = [];
    block.active = false;
    block.vx = block.vy = block.flashEnd = 0;
    Object.assign(context, {
      recording: false, playbackMuted: false, dragMuteActive: false,
      liveBlocks: new Set(), recordOnly: new Set(),
      pattern: Array.from({ length: 8 }, () => new Set()),
      patternOffsets: Array.from({ length: 8 }, () => new Map()),
      barStartAT: 1, barSec: () => 2, rectScale: () => 1,
      __getQuantDiv: () => 4,
      getLoopInfo: () => ({ beatLen: 0.5, loopStartTime: 1 }),
      currentInstrument: 'test', noteList: ['C4'],
      triggerInstrument: (_instrument, note, when) => sounds.push({ note, when }),
      __dbg() {}, requestPanelPulse() {},
    });
    context.__schedState.recordOnly = context.recordOnly;
    // Exercise the actual click paths, including the standard-view callback.
    if (zoomed) {
      handleBlockTap([block], 0, { y: 22 }, { y: 0, h: 44 }, {
        noteList: context.noteList, ac: context.ac, pattern: context.pattern,
        trigger: context.triggerInstrument, instrument: 'test', __schedState: context.__schedState,
      });
    } else {
      const a = source.indexOf('    onBlockTapStd:');
      const b = source.indexOf('    onBlockDrag:', a);
      assert.ok(a >= 0 && b > a);
      vm.runInContext('({' + source.slice(a, b) + '}).onBlockTapStd(0, {});', context);
    }
    assert.equal(block.active, true);
    assert.ok(context.recordOnly.has(0));
    sounds.length = 0; // Ignore the click audition.
    context.generator.placed = true;
    context.ripples = [{ startAT: 1, speed: 200 }];
    const a = source.indexOf('  function handleRingHits(');
    const b = source.indexOf('  function springBlocks(', a);
    assert.ok(a >= 0 && b > a);
    vm.runInContext(source.slice(a, b), context);
    // Cube and source overlap: the new ripple reaches the cube immediately.
    context.ac.currentTime = 1.01;
    context.handleRingHits(1.01);
    assert.equal(sounds.length, 1, 'the queued recording plays its first hit');
    assert.ok(context.pattern[0].has(0), 'the enabled cube enters the pattern');
    assert.equal(context.recordOnly.has(0), false);
    drawAt(sounds[0].when + 0.09);
    assert.ok(scales.some(([x]) => x > 1), 'the newly enabled cube animates');
    context.ripples = [{ startAT: 1, speed: 200 }];
    context.handleRingHits(1.01);
    assert.equal(sounds.length, 1, 'ordinary playback does not duplicate scheduled notes');
    const scheduler = createScheduler({
      panel: context.panel, ac: context.ac, NUM_STEPS: 8,
      pattern: context.pattern, patternOffsets: context.patternOffsets,
      blocks: [block], noteList: context.noteList, getInstrument: () => 'test',
      triggerInstrument: context.triggerInstrument,
      state: { barStartAT: 3 }, stepSeconds: context.stepSeconds,
      getLoopInfo: context.getLoopInfo, getQuantDiv: () => 4,
    });
    scheduler.prescheduleNow();
    assert.equal(sounds.length, 2, 'the cube plays again on the following loop');
    drawAt(sounds[1].when + 0.09);
    assert.ok(scales.some(([x]) => x > 1), 'loop playback animates too');
  }
});

test('first ripple and replay share quantisation even when launched between transport beats', () => {
  for (const div of [0, 2, 4]) {
    for (const loopInfo of [{ beatLen: 0.5, loopStartTime: 0 }, null]) {
      const { context, block, scales, drawAt } = activationFixture();
      const sounds = [];
      const startAt = 1.073, hitAt = startAt + 0.031;
      block.vx = block.vy = block.flashEnd = 0;
      Object.assign(context, {
        recording: true, playbackMuted: false, dragMuteActive: false,
        liveBlocks: new Set(), recordOnly: new Set(),
        pattern: Array.from({ length: 8 }, () => new Set()),
        patternOffsets: Array.from({ length: 8 }, () => new Map()),
        barStartAT: startAt, barSec: () => 2, rectScale: () => 1,
        __getQuantDiv: () => div, getLoopInfo: () => loopInfo,
        currentInstrument: 'test', noteList: ['C4'],
        triggerInstrument: (_instrument, _note, when) => sounds.push(when),
        __dbg() {}, requestPanelPulse() {},
      });
      context.generator.placed = true;
      context.ripples = [{ startAT: startAt, speed: 200 }];
      context.ac.currentTime = hitAt;
      const a = source.indexOf('  function handleRingHits(');
      const b = source.indexOf('  function springBlocks(', a);
      vm.runInContext(source.slice(a, b), context);
      context.handleRingHits(hitAt);
      assert.equal(sounds.length, 1);
      const expectedOffset = div ? 0.5 / div + 0.0004 : 0.0315;
      assert.ok(Math.abs(sounds[0] - startAt - expectedOffset) < 1e-9);
      if (div) {
        drawAt(hitAt);
        assert.equal(scales.length, 0, 'activation waits for the quantised note');
        drawAt(sounds[0] + 0.09);
        assert.ok(scales.some(([x]) => x > 1));
      }
      createScheduler({
        panel: context.panel, ac: context.ac, NUM_STEPS: 8,
        pattern: context.pattern, patternOffsets: context.patternOffsets,
        blocks: [block], noteList: context.noteList, getInstrument: () => 'test',
        triggerInstrument: context.triggerInstrument, state: { barStartAT: startAt + 2 },
        stepSeconds: context.stepSeconds, barSec: context.barSec,
        getLoopInfo: context.getLoopInfo, getQuantDiv: () => div,
      }).prescheduleNow();
      assert.equal(sounds.length, 2);
      assert.ok(Math.abs(sounds[1] - sounds[0] - 2) < 1e-9, 'replay preserves first-pass timing');
    }
  }
});

test('scheduled note activation uses the shared white flash and scale bounce at audio time', () => {
  const { block, scales, whiteFlashes, drawAt } = activationFixture();
  block._visFlashAt = 2;
  drawAt(1.99);
  assert.equal(scales.length, 0, 'do not animate during audio lookahead');
  drawAt(2);
  assert.ok(whiteFlashes.length > 0, 'flash on the note onset');
  drawAt(2.09);
  assert.ok(scales.some(([x, y]) => Math.abs(x - 1.1) < 1e-6 && x === y));
  drawAt(2.2);
  assert.equal(scales.length, 0, 'the activation finishes instead of restarting each frame');
  block._visFlashAt = 4;
  drawAt(4.09);
  assert.ok(scales.some(([x]) => x > 1), 'later loop repetitions activate again');
});

test('replay scheduler reaches the shared activation renderer', () => {
  const { context, block, scales, drawAt } = activationFixture();
  const sounds = [];
  const scheduler = createScheduler({
    panel: context.panel, ac: context.ac, NUM_STEPS: 1,
    pattern: [new Set([0])], patternOffsets: [new Map([[0, 0.5]])],
    blocks: [block], noteList: ['C4'], getInstrument: () => 'test',
    triggerInstrument: (_instrument, note, when) => sounds.push({ note, when }),
    state: { barStartAT: 2 }, stepSeconds: () => 0.25,
    getLoopInfo: () => ({ beatLen: 0.5 }), getQuantDiv: () => 0,
  });
  scheduler.prescheduleNow();
  assert.equal(sounds.length, 1);
  drawAt(sounds[0].when - 0.01);
  assert.equal(scales.length, 0);
  drawAt(sounds[0].when + 0.09);
  assert.ok(scales.some(([x]) => x > 1));
});

test('expired activations do not flash late after a stalled frame', () => {
  const { block, scales, whiteFlashes, drawAt } = activationFixture();
  block._visFlashAt = 2;
  drawAt(3);
  assert.equal(scales.length, 0);
  assert.equal(whiteFlashes.length, 0);
});

test('reset cancels a scheduled activation before it reaches the renderer', () => {
  const { context, block, scales, whiteFlashes, drawAt } = activationFixture();
  block._visFlashAt = 2;
  block.pulse = block.cflash = 1;
  context.pattern = [new Set()];
  context.patternOffsets = [new Map()];
  const a = source.indexOf('  function reset(){');
  const b = source.indexOf('  // Advanced-only actions', a);
  assert.ok(a >= 0 && b > a);
  vm.runInContext(source.slice(a, b), context);
  context.reset();
  drawAt(2.09);
  assert.equal(scales.length, 0);
  assert.equal(whiteFlashes.length, 0);
});

test('Rippler initializes its field once and draws particles before any tap', () => {
  const { context, calls } = fixture(false);
  context.draw();
  context.draw();
  assert.equal(calls.init, 1);
  assert.equal(calls.particles, 2);
});

test('particle fields stay independent and retain their distribution across resize', () => {
  const first = createRippleParticles(), second = createRippleParticles();
  const dots = [];
  const ctx = { save() {}, restore() {}, fillRect(x, y) { dots.push([x, y]); } };
  first.initParticles(420, 420, 4, 56);
  first.drawParticles(ctx, 1, [], null, []);
  const original = dots.splice(0);
  assert.equal(original.length, 56);
  second.initParticles(100, 100, 4, 8);
  second.drawParticles(ctx, 1, [], null, []);
  assert.equal(dots.splice(0).length, 8);
  first.setParticleBounds(210, 210);
  first.drawParticles(ctx, 1, [], null, []);
  assert.deepEqual(dots.splice(0), original.map(([x, y]) => [x / 2, y / 2]));
  first.setParticleBounds(0, 0);
  first.drawParticles(ctx, 1, [], null, []);
  assert.deepEqual(dots, original.map(([x, y]) => [x / 2, y / 2]));
});

test('wave rendering balances canvas state with zero, one and multiple ripples', () => {
  for (const count of [0, 1, 3]) {
    let depth = 0;
    const ctx = new Proxy({
      canvas: { width: 840, height: 840, clientWidth: 420, clientHeight: 420 },
      save() { depth++; }, restore() { assert.ok(depth > 0); depth--; },
      createRadialGradient: () => ({ addColorStop() {} }),
    }, { get: (target, key) => key in target ? target[key] : () => {} });
    const ripples = Array.from({ length: count }, () => ({ startAT: 1, speed: 200 }));
    drawWaves(ctx, 420, 420, 1.5, 200, ripples, 8, () => 0.25);
    assert.equal(depth, 0);
  }
});

test('a quick tap places the source before audio resume settles', async () => {
  const a = source.indexOf("  lifecycle.listen(canvas, 'pointerdown',", source.indexOf('  const input ='));
  const b = source.indexOf("  lifecycle.listen(canvas, 'pointermove'", a);
  assert.ok(a >= 0 && b > a);
  let onDown, resolveAudio, placements = 0, spawns = 0;
  const pendingAudio = new Promise(resolve => { resolveAudio = resolve; });
  const generator = { placed: false, nx: 0.5, ny: 0.5, r: 10 };
  const context = vm.createContext({
    lifecycle: { disposed: false, listen(_target, _name, handler) { onDown = handler; } },
    canvas: {}, resumeAudioContextIfNeeded: () => pendingAudio,
    generator, getCanvasPos: () => ({ x: 80, y: 90 }), n2x: x => x, n2y: y => y,
    isZoomed: () => false, sizing: { scale: 1 }, panel: { dataset: {} },
    input: { pointerDown() { placements++; generator.placed = true; } },
    pattern: [new Set()], patternOffsets: [new Map()], isRunning: () => true,
    spawnRipple() { spawns++; }, ac: { currentTime: 1 }, stepSeconds: () => 0.25,
  });
  vm.runInContext(source.slice(a, b), context);
  onDown({ isTrusted: true });
  assert.equal(placements, 1);
  assert.equal(spawns, 1);
  resolveAudio();
  await pendingAudio;
  assert.equal(placements, 1);
});

test('placing a generator draws waves and the source without aborting the frame', () => {
  const { context, calls } = fixture(true);
  assert.doesNotThrow(() => context.draw());
  assert.equal(calls.waves, 1);
  assert.equal(calls.generator, 1);
  assert.deepEqual(calls.times, [1.5, 1.5]);
  context.isRunning = () => false;
  context.ac.currentTime = 10;
  context.draw();
  assert.deepEqual(calls.times.slice(-2), [1, 1], 'paused visuals use the paused audio time');
});

test('ripple turns last one bar regardless of source position and handoff delay', () => {
  const { context } = fixture(false);
  Object.assign(context, {
    toyId: 'test', previewGenerator: {}, lastSpawnPerf: -1,
    barSec: () => 2, localStorage: { getItem: () => null },
    audioTimeToTick: t => t * 192,
    window: { __ripplerUserArmed: true },
  });
  context.generator.placed = true;
  const a = source.indexOf('  function spawnRipple(');
  const b = source.indexOf('  const pattern =', a);
  // Include only the function, before the clock/pattern declarations.
  const end = source.indexOf('  let particlesInit =', a);
  assert.ok(a >= 0 && end > a && b > end);
  vm.runInContext(source.slice(a, end), context);
  for (const nx of [0, 0.5, 1]) {
    context.generator.nx = nx;
    context.ac.currentTime += 3;
    const at = context.ac.currentTime - 0.04;
    context.spawnRipple(true, at);
    assert.equal(context.ripples.at(-1).startAT, at);
    assert.equal(context.__schedState.chainAdvanceAt, at + 2);
  }
});

test('Rippler launches one wave at cycle start while admitted notes only flash their impacted cubes',()=>{
 const instance={active:true,startTick:0,loopLengthTicks:384,sourcePhaseOriginTick:0,occurrenceId:'turn-1'};
 const rings=[],blocks=[{},{},{}],events=[];
 const context=vm.createContext({recording:false,generator:{placed:true,nx:.5,ny:.5},
  ripplerCycleAtTick,getPlaybackInstance:()=>instance,panel:{id:'rippler',dispatchEvent:e=>events.push(e)},
  CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}},
  n2x:n=>n*300,n2y:n=>n*300,tickToAudioTime:t=>t/192,
  RING_SPEED:()=>200,W:()=>300,H:()=>300,barSec:()=>2,ripples:rings,blocks});
 const a=source.indexOf('  let replayRippleKey ='),b=source.indexOf('  const RING_SPEED',a);
 const c=source.indexOf('  panel.__applyPlaybackVisual ='),d=source.indexOf('  panel.__getRipplerPlaybackVisualState',c);
 vm.runInContext(source.slice(a,b)+'\n'+source.slice(c,d),context);
 context.syncReplayRipple(0);assert.equal(rings.length,1);assert.equal(rings[0].startTick,0);
 for(const [blockIndex,tick] of [[0,48],[1,144],[2,288]]){
  context.syncReplayRipple(tick);
  context.panel.__applyPlaybackVisual({blockIndex,eventTick:tick,dueTick:tick,when:tick/192});
  assert.equal(blocks[blockIndex].flashEnd,tick/192+.18);assert.equal(rings.length,1);
 }
 context.syncReplayRipple(384);assert.equal(rings.length,2);assert.equal(rings[1].startTick,384);
 context.syncReplayRipple(3900);assert.equal(rings.length,3,'a delayed frame creates only the current wave');
 assert.equal(rings[2].startTick,3840);assert.equal(events.length,3);
 instance.active=false;context.syncReplayRipple(4300);assert.equal(rings.length,3);
 instance.active=true;instance.startTick=4400;instance.endTick=4608;context.syncReplayRipple(4399);assert.equal(rings.length,3);
 context.syncReplayRipple(4500);assert.equal(rings.at(-1).startTick,4224,'late entry uses shared phase rather than restarting the ring');
});
