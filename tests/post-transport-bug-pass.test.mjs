import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSequencerScheduler } from '../src/note-scheduler.js';
import {
  activatePlaybackInstanceForChainTurn,
  clearPlaybackInstancesForTests,
  deactivatePlaybackInstance,
  ensurePlaybackInstance,
  getPlaybackInstance,
  getPlaybackColumn,
  getPlaybackColumnWithinTurn,
} from '../src/playback-instances.js';
import { resolveSimpleRhythmPlayheadColumn } from '../src/simple-rhythm-timing.js';
import { createRandomLineStroke } from '../src/drawgrid/dg-randomizers.js';
import { createDrawGridLogicalGeometry } from '../src/drawgrid/drawgrid-viewport-space.js';
import { snapDrawGridStrokeLogical } from '../src/drawgrid/drawgrid-logical-snap.js';

test('Simple Rhythm stopped/new-scene visual is column zero despite retained transport tick', () => {
  const instance = ensurePlaybackInstance('visual', { startTick: 1000, loopLengthTicks: 384 });
  assert.equal(resolveSimpleRhythmPlayheadColumn({ running: false, instance, transportTick: 1192 }), 0);
  assert.equal(resolveSimpleRhythmPlayheadColumn({ running: true, instance, transportTick: 1048 }), 1);
});

test('an exact chain-turn boundary schedules local column zero once', () => {
  clearPlaybackInstancesForTests();
  const instance = activatePlaybackInstanceForChainTurn('grid', 768, { loopLengthTicks: 384 });
  assert.equal(getPlaybackColumn(instance, 768, 8), 0);
  const calls = [];
  const toy = { dataset: { steps: '8', toy: 'loopgrid' }, __chainJustActivated: true, __chainTurnStartTick: 768,
    __sequencerSchedule: (col, _time, metadata) => calls.push([col, metadata.eventTick]) };
  const scheduler = createSequencerScheduler({ ticksPerBar: 384 });
  scheduler.tick({ activeToyIds: new Set(['grid']), getToy: () => toy, currentTick: 770, lookaheadEndTick: 820, tickToAudioTime: tick => tick / 192 });
  scheduler.tick({ activeToyIds: new Set(['grid']), getToy: () => toy, currentTick: 771, lookaheadEndTick: 821, tickToAudioTime: tick => tick / 192 });
  assert.deepEqual(calls, [[0, 768], [1, 816]]);
});

test('fresh DrawGrid includes its first playable column on the first scheduler pass', () => {
  clearPlaybackInstancesForTests();
  activatePlaybackInstanceForChainTurn('draw', 500, { loopLengthTicks: 384 });
  const calls = [];
  const toy = { dataset: { steps: '8', toy: 'drawgrid' }, __chainJustActivated: true, __chainTurnStartTick: 500,
    __sequencerSchedule: col => calls.push(col) };
  createSequencerScheduler().tick({ activeToyIds: new Set(['draw']), getToy: () => toy, currentTick: 501, lookaheadEndTick: 550, tickToAudioTime: tick => tick });
  assert.equal(calls[0], 0);
});

test('DrawGrid Random logical stroke produces varying rows that follow its curve', () => {
  const geometry = createDrawGridLogicalGeometry({ cols: 8, rows: 12 });
  const values = [0.05, 0.1, 0.2, 0.35, 0.55, 0.75, 0.9, 0.8, 0.6];
  let index = 0;
  const stroke = createRandomLineStroke({ gridArea: geometry.gridRect, topPad: geometry.topPad, ch: geometry.cellHeight, cw: geometry.cellWidth, rows: 12 }, () => values[(index++) % values.length]);
  const map = snapDrawGridStrokeLogical({ stroke, geometry, strokeWidth: geometry.strokeWidth });
  const rows = map.nodes.map(set => [...set][0]);
  assert.equal(stroke.coordinateSpace, 'drawgrid-logical-v1');
  assert.ok(new Set(rows).size > 2, `expected curve-following rows, got ${rows}`);
  assert.ok(map.active.some(Boolean));
});

test('Bouncer learned replay admission is independent of render visibility', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /type === 'bouncer'[\s\S]*__bouncerPlaybackState/);
  assert.doesNotMatch(main.slice(main.indexOf("if (type === 'bouncer')"), main.indexOf("return false", main.indexOf("if (type === 'bouncer')"))), /visible|viewport|focus|offsetParent/);
});

test('two Bouncer chain turns alternate A-B-A-B without gaps or simultaneous active instances', () => {
  clearPlaybackInstancesForTests();
  const order = ['A', 'B', 'A', 'B'];
  let outgoing = null;
  for (let turn = 0; turn < order.length; turn++) {
    const toyId = order[turn];
    const startTick = turn * 384;
    if (outgoing) deactivatePlaybackInstance(outgoing);
    const instance = activatePlaybackInstanceForChainTurn(toyId, startTick, { loopLengthTicks: 384 });
    assert.equal(instance.startTick, startTick);
    assert.equal(getPlaybackColumn(instance, startTick, 8), 0);
    const other = toyId === 'A' ? 'B' : 'A';
    assert.notEqual(getPlaybackInstance(other)?.active, true, `${other} must be inactive during ${toyId}'s turn`);
    outgoing = toyId;
  }
});

test('DrawGrid-to-DrawGrid chain turns retain exact local-zero boundaries', () => {
  clearPlaybackInstancesForTests();
  const first = activatePlaybackInstanceForChainTurn('draw-a', 960, { loopLengthTicks: 384 });
  deactivatePlaybackInstance('draw-a');
  const second = activatePlaybackInstanceForChainTurn('draw-b', 1344, { loopLengthTicks: 384 });
  assert.equal(getPlaybackColumn(first, 960, 8), null);
  assert.equal(getPlaybackColumn(second, 1344, 8), 0);
  assert.equal(second.startTick - first.startTick, 384);
});

test('outgoing chain lookahead cannot schedule its next-loop first note at the incoming boundary', () => {
  clearPlaybackInstancesForTests();
  activatePlaybackInstanceForChainTurn('outgoing', 0, { loopLengthTicks: 384 });
  const outgoingCalls = [];
  const outgoing = {
    dataset: { steps: '8', toy: 'loopgrid' },
    __chainTurnEndTick: 384,
    __sequencerSchedule: (col, _time, metadata) => outgoingCalls.push([col, metadata.eventTick]),
  };
  const scheduler = createSequencerScheduler({ ticksPerBar: 384 });
  scheduler.tick({ activeToyIds: new Set(['outgoing']), getToy: () => outgoing,
    currentTick: 350, lookaheadEndTick: 410, tickToAudioTime: tick => tick });
  assert.deepEqual(outgoingCalls, [], 'column zero at tick 384 belongs exclusively to the incoming turn');

  deactivatePlaybackInstance('outgoing');
  activatePlaybackInstanceForChainTurn('incoming', 384, { loopLengthTicks: 384 });
  const incomingCalls = [];
  const incoming = { dataset: { steps: '8', toy: 'loopgrid' }, __chainJustActivated: true,
    __chainTurnStartTick: 384, __chainTurnEndTick: 768,
    __sequencerSchedule: (col, _time, metadata) => incomingCalls.push([col, metadata.eventTick]) };
  scheduler.tick({ activeToyIds: new Set(['incoming']), getToy: () => incoming,
    currentTick: 386, lookaheadEndTick: 430, tickToAudioTime: tick => tick });
  assert.deepEqual(incomingCalls, [[0, 384]]);
});

test('outgoing Simple Rhythm visual cannot wrap to column zero at the chain handoff', () => {
  clearPlaybackInstancesForTests();
  const outgoing = activatePlaybackInstanceForChainTurn('visual-outgoing', 0, { loopLengthTicks: 384 });
  assert.equal(getPlaybackColumnWithinTurn(outgoing, 383, 8, 384), 7);
  assert.equal(getPlaybackColumnWithinTurn(outgoing, 384, 8, 384), null,
    'the boundary tick belongs exclusively to the incoming toy visual');

  const incoming = activatePlaybackInstanceForChainTurn('visual-incoming', 384, { loopLengthTicks: 384 });
  assert.equal(getPlaybackColumnWithinTurn(incoming, 384, 8, 768), 0);
});
