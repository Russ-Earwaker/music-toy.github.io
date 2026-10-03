import test from 'node:test';
import assert from 'node:assert/strict';
import { createBouncerVisualEventQueue } from '../src/bouncer-visual-events.js';

test('Bouncer replay flashes wait for their AudioContext event time', () => {
  const queue = createBouncerVisualEventQueue();
  queue.enqueue({ audioTime: 10.5, playbackInstanceId: 'turn-a', blockIndex: 2 });
  assert.deepEqual(queue.drain(10.49, 'turn-a'), []);
  assert.deepEqual(queue.drain(10.5, 'turn-a'), [
    { audioTime: 10.5, playbackInstanceId: 'turn-a', blockIndex: 2 },
  ]);
});

test('Bouncer replay flashes from an expired playback instance are discarded', () => {
  const queue = createBouncerVisualEventQueue();
  queue.enqueue({ audioTime: 12, playbackInstanceId: 'old-turn', blockIndex: 0 });
  assert.deepEqual(queue.drain(11, 'new-turn'), []);
  assert.equal(queue.size, 0);
});

test('prepared Sequence turn flashes survive lookahead until that occurrence becomes current', () => {
  const queue = createBouncerVisualEventQueue();
  queue.enqueue({ audioTime: 12, playbackInstanceId: 'next-turn', blockIndex: 0 });
  assert.deepEqual(queue.drain(11, 'current-turn', { isUpcomingInstance: id => id === 'next-turn' }), []);
  assert.equal(queue.size, 1);
  assert.equal(queue.drain(12, 'next-turn').length, 1);
  assert.equal(queue.size, 0);
});
