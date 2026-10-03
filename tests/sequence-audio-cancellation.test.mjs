import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureAudioContext, registerActiveNode, withActiveNodeCollector } from '../src/audio-core.js';

globalThis.window = {};
const { triggerInstrument, cancelScheduledToySources, trackScheduledToySource } = await import('../src/audio-samples.js');

test('Sequence retrigger can cancel queued synth voices without stopping playing voices or unrelated toys', () => {
  const param = () => ({ value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} });
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
