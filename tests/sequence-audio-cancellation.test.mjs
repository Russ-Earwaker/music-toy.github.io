import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureAudioContext, registerActiveNode, withActiveNodeCollector } from '../src/audio-core.js';
import { createPlaybackInstanceForStructureTurn, invalidatePlaybackOccurrence } from '../src/playback-instances.js';
import { withPlaybackOccurrence, getCurrentPlaybackOccurrence } from '../src/playback-context.js';

globalThis.window = {};
const { triggerInstrument, cancelScheduledToySources, trackScheduledToySource } = await import('../src/audio-samples.js');

test('Sequence retrigger can cancel queued synth voices without stopping playing voices or unrelated toys', () => {
  const param = () => ({ value: 1, setValueAtTime(value) { this.value = value; }, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} });
  class FakeAudioContext {
    currentTime = 0;
    destination = {};
    nodes = [];
    createGain() { return { gain: param(), connect() { return this; } }; }
    createOscillator() {
      const node = { frequency: param(), stopCalls: [], connect(target) { return target; },
        start(time) { this.startTime = time; }, stop(time) { this.stopCalls.push(time); } };
      this.nodes.push(node);
      return node;
    }
  }
  globalThis.window = { AudioContext: FakeAudioContext };
  const ctx = ensureAudioContext();
  triggerInstrument('tone', 'C4', 0, 'sequence-head');
  triggerInstrument('tone', 'D4', 1, 'sequence-head');
  triggerInstrument('tone', 'E4', 1, 'unrelated');
  const [playing, pending, unrelated] = ctx.nodes;
  assert.deepEqual([playing.startTime, pending.startTime, unrelated.startTime], [0.001, 1, 1]);
  ctx.currentTime = 0.1;
  cancelScheduledToySources('sequence-head');
  assert.equal(playing.stopCalls.length, 1, 'retain the original envelope stop of a sounding note');
  assert.equal(pending.stopCalls.length, 2, 'cancel the old performance voice before its scheduled onset');
  assert.equal(pending.stopCalls.at(-1), undefined);
  assert.equal(unrelated.stopCalls.length, 1);
  const strumNoise = { stops: 0, stop() { this.stops++; } };
  trackScheduledToySource('sequence-head', strumNoise, 1);
  cancelScheduledToySources('sequence-head');
  assert.equal(strumNoise.stops, 1, 'cancel directly scheduled toy sources such as strum noise');
});

test('node collection is synchronous and restores its previous owner even when construction throws', () => {
  const collected = [];
  const node = { addEventListener() {} };
  assert.throws(() => withActiveNodeCollector(value => collected.push(value), () => {
    registerActiveNode(node);
    throw new Error('construction failed');
  }), /construction failed/);
  registerActiveNode({ addEventListener() {} });
  assert.deepEqual(collected, [node]);
});

test('playback visualization receives the admitted audio onset and resolved pitch once, never a cancelled occurrence',()=>{
  const ctx=ensureAudioContext(), admitted=[];
  const instance=createPlaybackInstanceForStructureTurn({id:'visual-admission',toyId:'visual-source',startTick:0,durationTicks:384,
    transportId:'main-heartbeat',generation:0,context:{transposeSemitones:7}});
  const occurrence={occurrenceId:instance.occurrenceId,generation:instance.generation,context:instance.context};
  const initial=ctx.nodes.length;
  withPlaybackOccurrence(occurrence,()=>triggerInstrument('tone','C4',ctx.currentTime-1,'visual-source',{onPlaybackScheduled:event=>admitted.push(event)}));
  assert.equal(admitted.length,1);
  assert.equal(admitted[0].when,ctx.nodes[initial].startTime);
  assert.equal(admitted[0].note,'G4');
  assert.equal(admitted[0].occurrence.occurrenceId,instance.occurrenceId);
  invalidatePlaybackOccurrence(instance.occurrenceId);
  withPlaybackOccurrence(occurrence,()=>triggerInstrument('tone','C4',ctx.currentTime,'visual-source',{onPlaybackScheduled:event=>admitted.push(event)}));
  assert.equal(admitted.length,1);assert.equal(ctx.nodes.length,initial+1);
});

test('final audio boundary carries independent contexts and cancels only the removed same-source occurrence', () => {
  const ctx = ensureAudioContext(), notes = [];
  globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail; } };
  window.dispatchEvent = event => { if (event.type === 'toy:note') notes.push(event.detail); };
  const make = (id, transposeSemitones) => createPlaybackInstanceForStructureTurn({ id, toyId: 'shared-source',
    startTick: 0, durationTicks: 768, transportId: 'main-heartbeat', generation: 0, context: { transposeSemitones } });
  const a = make('audio-one', 0), b = make('audio-two', 7);
  const metadata = instance => ({ occurrenceId: instance.occurrenceId, generation: instance.generation, context: instance.context });
  const initial = ctx.nodes.length;
  withPlaybackOccurrence(metadata(a), () => triggerInstrument('tone', 'C4', 1, 'shared-source'));
  withPlaybackOccurrence(metadata(b), () => triggerInstrument('tone', 'C4', 1, 'shared-source'));
  const [first, second] = ctx.nodes.slice(initial);
  assert.deepEqual(notes.map(n => [n.occurrenceId, n.context.transposeSemitones, n.note]),
    [['audio-one', 0, 'C4'], ['audio-two', 7, 'G4']]);
  assert.ok(Math.abs(second.frequency.value / first.frequency.value - Math.pow(2,7/12)) < 1e-10, 'context changes played pitch without changing the source note');
  invalidatePlaybackOccurrence(a.occurrenceId);
  assert.equal(first.stopCalls.length, 2);
  assert.equal(second.stopCalls.length, 1, 'the other occurrence remains scheduled');
  assert.equal(getCurrentPlaybackOccurrence(), null);
  invalidatePlaybackOccurrence(b.occurrenceId);
});

test('deferred legacy audio gates capture context and discard only an invalidated occurrence', async () => {
  window.addEventListener = () => {};
  const { gateTriggerForToy } = await import('../src/toy-audio.js');
  const timers = new Map(), calls = [];
  const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  let serial = 1;
  globalThis.setTimeout = callback => { const id = serial++; timers.set(id, callback); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  try {
    const make = (id, transposeSemitones) => createPlaybackInstanceForStructureTurn({ id, toyId: 'gated-source',
      startTick: 0, durationTicks: 768, transportId: 'main-heartbeat', generation: 0, context: { transposeSemitones } });
    const a = make('gate-one', 5), b = make('gate-two', 7);
    const metadata = instance => ({ occurrenceId: instance.occurrenceId, generation: instance.generation, context: instance.context });
    const gate = gateTriggerForToy('gated-source', () => calls.push(getCurrentPlaybackOccurrence()));
    withPlaybackOccurrence(metadata(a), () => gate('tone', 'C4', 1));
    withPlaybackOccurrence(metadata(b), () => gate('tone', 'C4', 1));
    assert.equal(timers.size, 2);
    invalidatePlaybackOccurrence(a.occurrenceId);
    assert.equal(timers.size, 1);
    for (const callback of timers.values()) callback();
    assert.deepEqual(calls.map(c => [c.occurrenceId, c.context.transposeSemitones]), [['gate-two', 7]]);
    assert.equal(getCurrentPlaybackOccurrence(), null);
    invalidatePlaybackOccurrence(b.occurrenceId);
  } finally {
    globalThis.setTimeout = originalSet; globalThis.clearTimeout = originalClear;
  }
});
