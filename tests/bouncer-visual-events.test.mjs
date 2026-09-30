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
