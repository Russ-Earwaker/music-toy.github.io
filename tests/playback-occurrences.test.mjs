import test from 'node:test';
import assert from 'node:assert/strict';
import { createStructureRuntime } from '../src/structure-runtime.js';
import {activeToyChord} from '../src/toy-chord-indicator.js';
import { createChainSequenceAdapter } from '../src/chain-sequence.js';
import { createSequencerScheduler } from '../src/note-scheduler.js';
import { composeContext, normalizeContext, getCurrentPlaybackOccurrence } from '../src/playback-context.js';
import { ensureAudioContext } from '../src/audio-core.js';
import { transportRegistry, MAIN_TRANSPORT_ID } from '../src/transport-registry.js';
import { clearPlaybackInstancesForTests, getPlaybackInstance, getPlaybackOccurrence,
  getPlaybackOccurrences, getPlaybackStepEvents } from '../src/playback-instances.js';

const leaf = (entryId, offsetTick = 0, durationTicks = 384, transposeSemitones = 0) =>
  ({ entryId, toyId: 'A', offsetTick, durationTicks, context: { transposeSemitones } });
const paused = tick => ({ currentTick: tick, state: 'paused' });
function harness(roots, { provider = false } = {}) {
  clearPlaybackInstancesForTests();
  const notes = [];
  const toy = { id: 'A', dataset: { toy: 'loopgrid', steps: '8' }, __seqRev: 0, pitch: 60 };
  const record = (step, when, metadata) => notes.push({ step, when, pitch: toy.pitch, metadata,
    boundary: getCurrentPlaybackOccurrence() });
  if (provider) {
    toy.__sequencerEventsInWindow = (from, to, instance) => getPlaybackStepEvents(instance, from, to, 8);
    toy.__sequencerScheduleEvent = (event, when, metadata) => record(event.step, when, metadata);
  } else toy.__sequencerSchedule = record;
  const adapter = createChainSequenceAdapter({ getToy: id => id === 'A' ? toy : null, chainState: new Map() });
  const scheduler = createSequencerScheduler();
  const sync = (tick = 0) => adapter.sync([toy], paused(tick), { runtimeRoots: roots });
  const schedule = (from, to, bpm = 120) => scheduler.tick({ currentTick: from, lookaheadEndTick: to,
    playbackTurns: adapter.turnsForLookahead(from, to), getToy: () => toy,
    tickToAudioTime: tick => tick * 60 / (96 * bpm) });
  sync();
  return { toy, notes, adapter, scheduler, roots, sync, schedule };
}
test('conflicting harmony occurrences follow the same deterministic visible playhead without merging context',()=>{
  const harmony=root=>({harmony:{originTick:0,stepTicks:384,chords:[{root,quality:'major'}]}});
  const h=harness([{headId:'composition',type:'timeline',members:['A'],children:[
    {...leaf('long',0,768),context:harmony('C')},
    {...leaf('later',384,768),context:harmony('F')},
  ]}]);
  try{
    h.adapter.turnsForLookahead(384,385);
    const selected=getPlaybackInstance('A');assert.equal(selected.startTick,384);
    assert.equal(activeToyChord({instance:selected,currentTick:384,playing:true,role:'melody'}),'F');
    assert.deepEqual(getPlaybackOccurrences('A').filter(i=>i.active).map(instance=>activeToyChord({instance,currentTick:384,playing:true,role:'melody'})).sort(),['C','F']);
    h.adapter.updateCurrent(100);assert.equal(activeToyChord({instance:getPlaybackInstance('A'),currentTick:100,playing:true,role:'melody'}),'C');
  }finally{h.scheduler.dispose();h.adapter.reset();}
});

const root = (children, type = 'timeline', extra = {}) =>
  ({ headId: 'composition', type, children, members: ['A'], ...extra });

test('A: one editable source has three sequential occurrences with independent 0/+5/+7 contexts', () => {
  const h = harness([root([leaf('first', 0, 384, 0), leaf('second', 384, 384, 5), leaf('third', 768, 384, 7)])]);
  const turns = h.adapter.turnsForLookahead(0, 1152);
  assert.deepEqual(turns.map(t => t.startTick), [0, 384, 768]);
  assert.equal(new Set(turns.map(t => t.occurrenceId)).size, 3);
  assert.deepEqual(turns.map(t => t.playbackInstance.context.transposeSemitones), [0, 5, 7]);
  assert.equal(new Set(turns.map(t => t.playbackInstance)).size, 3);
  const result = h.schedule(0, 1152);
  assert.equal(result.scheduled, 24);
  assert.equal(new Set(result.events.map(e => e.identity)).size, 24);
  assert.ok(h.notes.every(n => n.boundary === n.metadata && n.pitch === 60));
  assert.deepEqual([...new Set(h.notes.map(n => n.boundary.context.transposeSemitones))], [0, 5, 7]);
  assert.equal(getCurrentPlaybackOccurrence(), null);
  assert.equal(h.schedule(0, 1152).scheduled, 0);
  h.scheduler.dispose(); h.adapter.reset();
});

for (const provider of [false, true]) test(`B: overlapping same-source ${provider ? 'provider' : 'grid'} occurrences both schedule at the same tick`, () => {
  const h = harness([root([leaf('long', 0, 768), leaf('later', 384, 768, 5)])], { provider });
  h.schedule(0, 384);
  const turns = h.adapter.turnsForLookahead(384, 385);
  assert.equal(turns.length, 2);
  assert.equal(getPlaybackOccurrences('A').filter(i => i.active).length, 2);
  assert.equal(getPlaybackInstance('A').startTick, 384, 'the latest current occurrence owns the visible playhead');
  const result = h.schedule(384, 768);
  const simultaneous = result.events.filter(e => e.eventTick === 384);
  assert.equal(simultaneous.length, 2);
  assert.notEqual(simultaneous[0].occurrenceId, simultaneous[1].occurrenceId);
  assert.equal(result.scheduled, 8);
  assert.deepEqual(turns.map(t => t.playbackInstance.scheduledUntilTick), [768, 768]);
  assert.equal(h.schedule(384, 768).scheduled, 0);
  h.scheduler.dispose(); h.adapter.reset();
});

test('C: Repeat ×4 produces four distinct path identities using one source', () => {
  const h = harness([root([leaf('repeated')], 'repeat', { count: 4, context: { transposeSemitones: 5 } })]);
  const turns = h.adapter.turnsForLookahead(0, 1536);
  assert.deepEqual(turns.map(t => t.startTick), [0, 384, 768, 1152]);
  assert.equal(new Set(turns.map(t => t.occurrenceId)).size, 4);
  assert.equal(new Set(turns.map(t => JSON.stringify(t.structuralPath))).size, 4);
  assert.ok(turns.every(t => t.toyId === 'A' && t.context.transposeSemitones === 5));
  assert.equal(h.schedule(0, 1536).scheduled, 32);
  h.scheduler.dispose(); h.adapter.reset();
});

test('D: Together containing Timeline and Repeat keeps same-tick uses distinct and composes nested contexts', () => {
  const h = harness([]);
  h.adapter.runtime.defineStructure('timeline', 'timeline', [leaf('one'), leaf('two', 384)], 0,
    { context: { transposeSemitones: 2, velocityScale: 0.5, harmony: { originTick:0, stepTicks:384, chords:[{root:'C',quality:'major'}] } } });
  h.adapter.runtime.defineStructure('repeat', 'repeat', [leaf('repeat', 0, 384, 1)], 0,
    { count: 2, context: { transposeSemitones: 4, scale: [0, 2, 4] } });
  h.roots.push(root([{ entryId: 'timeline-branch', structureId: 'timeline', context: { transposeSemitones: 3 } },
    { entryId: 'repeat-branch', structureId: 'repeat', context: { transposeSemitones: 2 } }], 'together'));
  h.sync();
  const turns = h.adapter.turnsForLookahead(0, 768);
  assert.equal(turns.length, 4);
  assert.equal(new Set(turns.map(t => t.occurrenceId)).size, 4);
  assert.deepEqual(turns.map(t => t.context.transposeSemitones), [5, 5, 7, 7]);
  assert.equal(h.schedule(0, 768).scheduled, 32);
  assert.equal(h.notes.filter(n => n.metadata.eventTick === 0).length, 2);
  h.scheduler.dispose(); h.adapter.reset();
});

test('context composition is immutable, additive/multiplicative, and uses non-null child overrides', () => {
  const harmony = { progressionId:'M',originTick:96,stepTicks:384,chords:[{root:'C',quality:'major'}] };
  const original=structuredClone(harmony);
  const parent = normalizeContext({ transposeSemitones: 5, velocityScale: 0.5, harmony, scale: 'major' });
  harmony.chords[0].root = 'F';
  const child = composeContext(parent, { transposeSemitones: 2, velocityScale: 0.8, harmony: null, scale: 'minor' });
  assert.deepEqual(child, { transposeSemitones: 7, velocityScale: 0.4, harmony: original, scale: 'minor' });
  assert.deepEqual(composeContext(), { transposeSemitones: 0, velocityScale: 1, harmony: null, scale: null });
  assert.throws(() => { child.harmony.chords[0].root = 'F'; }, TypeError);
});

test('source edits, pause/resume scheduler resets, and BPM changes retain overlapping identities and anchors', () => {
  const h = harness([root([leaf('long', 0, 768), leaf('later', 384, 768, 7)])]);
  h.schedule(0, 480);
  const before = h.adapter.turnsForLookahead(384, 768).map(t => t.playbackInstance);
  h.toy.pitch = 65; h.toy.__seqRev++;
  h.sync(400);
  h.scheduler.resetTimeline(480);
  const result = h.schedule(480, 768, 90);
  const after = h.adapter.turnsForLookahead(480, 768).map(t => t.playbackInstance);
  assert.deepEqual(after, before);
  assert.deepEqual(after.map(i => [i.startTick, i.context.transposeSemitones]), [[0, 0], [384, 7]]);
  assert.ok(result.events.every(e => e.definitionRevision === 1));
  assert.ok(h.notes.filter(n => n.metadata.eventTick >= 480).every(n => n.pitch === 65 && n.when === n.metadata.eventTick * 60 / (96 * 90)));
  h.scheduler.dispose(); h.adapter.reset();
});

test('removing one overlapping relationship invalidates its occurrences while keeping the other source use', () => {
  const h = harness([root([leaf('remove', 0, 768), leaf('keep', 384, 768, 7)])]);
  const turns = h.adapter.turnsForLookahead(384, 768);
  const [removed, kept] = turns.map(t => t.playbackInstance);
  h.roots[0].children.shift(); h.sync(400);
  assert.equal(getPlaybackOccurrence(removed.occurrenceId), null);
  assert.equal(getPlaybackOccurrence(kept.occurrenceId), kept);
  assert.equal(kept.active, true);
  assert.equal(getPlaybackInstance('A'), kept);
  const result = h.schedule(400, 768);
  assert.ok(result.scheduled > 0);
  assert.ok(result.events.every(e => e.occurrenceId === kept.occurrenceId));
  h.scheduler.dispose(); h.adapter.reset();
});

test('removing or retriggering one root never cancels an unrelated root using the same source', () => {
  const h = harness([root([leaf('first', 0, 768)], 'timeline'),
    root([leaf('second', 0, 768, 7)], 'timeline', { headId: 'other' })]);
  const original = h.adapter.turnsForLookahead(0, 768);
  const kept = original.find(t => t.definitionId === 'sequence:other').playbackInstance;
  h.adapter.retrigger('composition', paused(96), { quantize: false });
  assert.equal(getPlaybackOccurrence(kept.occurrenceId), kept);
  h.roots.shift(); h.sync(100);
  assert.equal(getPlaybackOccurrence(kept.occurrenceId), kept);
  assert.ok(h.schedule(100, 768).events.every(e => e.occurrenceId === kept.occurrenceId));
  h.scheduler.dispose(); h.adapter.reset();
});

test('explicit slot IDs preserve duplicate source paths during live deletion and reject ambiguous IDs', () => {
  const r = createStructureRuntime();
  assert.throws(() => r.defineSequence('bad', [leaf('same'), leaf('same')]), /Duplicate/);
  r.defineStructure('T', 'timeline', [leaf('one'), leaf('two', 384)]);
  r.startSequence('T', 0, { quantize: false, context: { transposeSemitones: 2 } });
  const before = r.turnsInWindow('T', 384, 385)[0];
  r.defineStructure('T', 'timeline', [leaf('two', 384)], 400);
  const after = r.turnsInWindow('T', 400, 401)[0];
  assert.equal(after.occurrenceId, before.occurrenceId);
  assert.equal(after.context.transposeSemitones, 2);
});

test('plain Timeline references retain the surviving occurrence when an earlier use of the same source is removed', () => {
  const first = { toyId: 'A', offsetTick: 0, durationTicks: 768 };
  const second = { toyId: 'A', offsetTick: 384, durationTicks: 768 };
  const h = harness([root([first, second])]);
  const [removed, kept] = h.adapter.turnsForLookahead(384, 768).map(t => t.playbackInstance);
  h.roots[0].children = [second]; h.sync(400);
  assert.equal(getPlaybackOccurrence(removed.occurrenceId), null);
  assert.equal(getPlaybackOccurrence(kept.occurrenceId), kept);
  assert.ok(h.schedule(400, 768).events.every(e => e.occurrenceId === kept.occurrenceId));
  h.scheduler.dispose(); h.adapter.reset();
});

test('deleting a nested runtime branch leaves the sibling branch using the same source scheduled', () => {
  const h = harness([]);
  h.adapter.runtime.defineStructure('keep', 'timeline', [leaf('same')]);
  h.adapter.runtime.defineStructure('remove', 'repeat', [leaf('same')], 0, { count: 2 });
  h.roots.push(root([{ entryId: 'keep-path', structureId: 'keep' },
    { entryId: 'remove-path', structureId: 'remove' }], 'together'));
  h.sync();
  const original = h.adapter.turnsForLookahead(0, 384);
  const kept = original.find(t => t.structureDefinitionIds.includes('keep')).playbackInstance;
  const removed = original.find(t => t.structureDefinitionIds.includes('remove')).playbackInstance;
  h.adapter.terminateStructure('remove');
  const result = h.schedule(0, 384);
  assert.equal(getPlaybackOccurrence(removed.occurrenceId), null);
  assert.equal(getPlaybackOccurrence(kept.occurrenceId), kept);
  assert.equal(result.scheduled, 8);
  assert.ok(result.events.every(e => e.occurrenceId === kept.occurrenceId));
  h.scheduler.dispose(); h.adapter.reset();
});

test('releasing a source from a Structure creates a neutral standalone occurrence with a valid audio identity', () => {
  const h = harness([root([leaf('modified', 0, 384, 7)])]);
  const owned = getPlaybackInstance('A');
  h.roots.pop(); h.sync(48);
  const standalone = getPlaybackInstance('A');
  assert.notEqual(standalone.occurrenceId, owned.occurrenceId);
  assert.equal(standalone.structureInstanceId, undefined);
  assert.equal(getPlaybackOccurrence(standalone.occurrenceId), standalone);
  assert.deepEqual(standalone.context, normalizeContext());
  assert.equal(h.scheduler.tick({ activeToyIds: new Set(['A']), getToy: () => h.toy,
    currentTick: 48, lookaheadEndTick: 384, tickToAudioTime: tick => tick / 192 }).scheduled, 7);
  h.scheduler.dispose(); h.adapter.reset(); clearPlaybackInstancesForTests();
});

test('overlapping contexts survive real owning transport pause/resume and BPM changes', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = { AudioContext: class { currentTime = 0; state = 'running'; resume() { return Promise.resolve(); } } };
  const transport = transportRegistry.get(MAIN_TRANSPORT_ID), ctx = ensureAudioContext();
  transport.pause(); transport.setBpm(120); transport.seekTick(0);
  const h = harness([root([leaf('long', 0, 768, 5), leaf('later', 384, 768, 7)])]);
  try {
    await transport.play(); ctx.currentTime = 2.25;
    const tick = transport.currentTick;
    assert.equal(tick, 432);
    h.sync(tick);
    const before = h.adapter.turnsForLookahead(tick, 480).map(t => t.playbackInstance);
    transport.pause(); ctx.currentTime += 10;
    h.adapter.sync([h.toy], transport.getState(), { runtimeRoots: h.roots });
    assert.equal(transport.currentTick, tick);
    transport.setBpm(73); await transport.play();
    h.scheduler.resetTimeline(tick, { includeBoundary: false });
    const result = h.scheduler.tick({ transportId: MAIN_TRANSPORT_ID, currentTick: tick, lookaheadEndTick: 768,
      playbackTurns: h.adapter.turnsForLookahead(tick, 768, MAIN_TRANSPORT_ID), getToy: () => h.toy,
      tickToAudioTime: transport.tickToAudioTime });
    const after = h.adapter.turnsForLookahead(tick, 768).map(t => t.playbackInstance);
    assert.deepEqual(after, before);
    assert.deepEqual(after.map(i => [i.startTick, i.context.transposeSemitones]), [[0, 5], [384, 7]]);
    assert.ok(result.events.every(e => e.eventTick > tick));
    assert.ok(h.notes.every(n => n.when === transport.tickToAudioTime(n.metadata.eventTick)));
  } finally {
    transport.pause(); h.scheduler.dispose(); h.adapter.reset();
    globalThis.window = previousWindow;
  }
});
