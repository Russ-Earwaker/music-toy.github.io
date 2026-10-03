import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { MUSICAL_INSTRUMENT_TOYS, applyToyInstrument, readToySoundState, restoreToySoundState } from '../src/instrument-state.js';
import { createInstrumentPopupOwner } from '../src/instrument-popup-lifecycle.js';
import { createConnectionModel } from '../src/connections.js';
import { createStructureToyModel } from '../src/structure-toys.js';
import { createConnectionQuickAdd } from '../src/connection-quick-add.js';
import { createSequencerScheduler } from '../src/note-scheduler.js';
import { ensurePlaybackInstance, clearPlaybackInstancesForTests } from '../src/playback-instances.js';

class Element extends EventTarget {
  dataset = {}; children = []; isConnected = true; style = { setProperty() {} }; attrs = {};
  constructor(id = '', kind = 'loopgrid') { super(); this.id = id; this.dataset.toy = kind; }
  appendChild(node) { this.children.push(node); return node; }
  set innerHTML(_) { this.children = []; }
  querySelector(selector) { return this.children.find(n => n.className?.split(' ').includes(selector.slice(1))) || null; }
  setAttribute(k, v) { this.attrs[k] = v; }
}
globalThis.window = { addEventListener() {}, __TOY_AUDIO_GEN: {} };
globalThis.document = { createElement: () => new Element(), addEventListener() {} };
const { installInstrumentSelection, chooseToyInstrument, instrumentHeaderLabelSlot } = await import('../src/instrument-selection.js');
const source = name => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');

test('shared instrument colours are stable across compatible toys, update live, and leave logic neutral',async()=>{
 const {instrumentColour,INSTRUMENT_COLOURS}=await import('../src/instrument-colours.js');
 assert.equal(instrumentColour('PIANO'),instrumentColour('piano'));assert.equal(instrumentColour('retro_square'),instrumentColour('RETRO SQUARE'));
 assert.equal(new Set(Object.values(INSTRUMENT_COLOURS)).size,Object.keys(INSTRUMENT_COLOURS).length);
 for(const kind of MUSICAL_INSTRUMENT_TOYS){
  const panel=new Element(kind,kind),host=new Element();panel.dataset.instrument='piano';installInstrumentSelection(panel,host);
  assert.equal(panel.dataset.instrumentColour,instrumentColour('piano'));const before=panel.dataset.instrumentColour;
  applyToyInstrument(panel,'kalimba');assert.equal(panel.dataset.instrumentColour,instrumentColour('kalimba'));assert.notEqual(panel.dataset.instrumentColour,before);
  assert.equal(host.querySelector('.toy-instrument-name').textContent.toLowerCase(),'kalimba');
 }
 for(const kind of ['sequence','together','repeat','timeline','heartbeat']){const panel=new Element(kind,kind);installInstrumentSelection(panel,new Element());assert.equal(panel.dataset.instrumentColour,undefined);}
});
test('published palette covers catalogue IDs and stays independent of catalogue order',async()=>{
 const {instrumentColour,INSTRUMENT_COLOURS}=await import('../src/instrument-colours.js');
 const rows=readFileSync(new URL('../samples.csv',import.meta.url),'utf8').split(/\r?\n/),header=rows.shift().split(',');
 const ids=rows.filter(r=>r&&!r.startsWith('#')).map(r=>{const c=r.split(',');return(c[header.indexOf('instrument_id')]||c[header.indexOf('synth_id')]||'').trim().toLowerCase().replace(/[_-]+/g,' ');}).filter(Boolean);
 for(const id of ids)assert.ok(INSTRUMENT_COLOURS[id],id);
 assert.deepEqual(ids.map(instrumentColour),[...ids].reverse().map(instrumentColour).reverse());
 assert.equal(instrumentColour('future new sound'),instrumentColour('future new sound'));
});

test('all registered musical types get one shared control, never Structures, Heartbeat or the game mode', () => {
  const registered = [...source('main.js').matchAll(/^    '([^']+)':/gm)].map(m => m[1]);
  for (const kind of MUSICAL_INSTRUMENT_TOYS) {
    assert.ok(registered.includes(kind));
    const panel = new Element(kind, kind); panel.dataset.instrument = 'kalimba';
    const button = installInstrumentSelection(panel, panel);
    assert.equal(button.attrs['aria-label'], 'Choose Instrument: kalimba');
    assert.strictEqual(installInstrumentSelection(panel, panel), button);
    assert.equal(panel.children.length, 2);
    assert.equal(button.querySelector('.toy-instrument-name'), null);
    applyToyInstrument(panel, 'retro_square');
    assert.equal(panel.querySelector('.toy-instrument-name').textContent, 'retro square');
  }
  for (const kind of ['sequence', 'together', 'repeat', 'timeline', 'main-heartbeat', 'beat-swarm']) {
    const panel = new Element(kind, kind);
    assert.equal(installInstrumentSelection(panel, panel), null); assert.equal(applyToyInstrument(panel, 'tone'), false);
    assert.equal(panel.children.length, 0);
  }
});

test('header name stays inside the existing free space without moving either control group', () => {
  assert.deepEqual(instrumentHeaderLabelSlot(190, 340), { left: 202, width: 126 });
  assert.deepEqual(instrumentHeaderLabelSlot(190, 205), { left: 202, width: 0 });
});

test('a click owns one picker; cancelling or deleting during selection cannot edit a detached toy', async () => {
  const panel = new Element('toy'); let finish, opens = 0;
  const picker = () => { opens++; return new Promise(r => { finish = r; }); };
  const pending = chooseToyInstrument(panel, picker); await chooseToyInstrument(panel, picker);
  assert.equal(opens, 1); panel.isConnected = false; finish({ value: 'kalimba' }); await pending;
  assert.equal(panel.dataset.instrument, undefined); assert.equal(panel.__instrumentChoosing, false);
});

test('live instrument edit keeps committed notes and timing anchors, affects only the next scheduling window', () => {
  clearPlaybackInstancesForTests();
  const panel = new Element('live'); panel.dataset.steps = '8'; panel.__seqRev = 0;
  panel.__gridState = { steps: Array(8).fill(true), noteIndices: Array(8).fill(12) };
  // Use the actual grid edit handler and pattern builder, without its renderer.
  const code = source('grid-core.js');
  const rebuild = code.slice(code.indexOf('  function rebuildSeqPattern()'), code.indexOf('  // Initial snapshot'));
  const edits = code.slice(code.indexOf('  function setInstrument(name)'), code.indexOf('  const getNoteForStep'));
  vm.runInNewContext(`${rebuild}\n${edits}`, { panel, setToyInstrument() {} });
  applyToyInstrument(panel, 'kalimba');
  const instance = ensurePlaybackInstance(panel.id, { startTick: 192, loopLengthTicks: 384 });
  const before = { ...instance }, calls = [];
  panel.__sequencerSchedule = (column, time, metadata) => calls.push({ instrument: panel.__seqPatternActive.instrument, tick: metadata.eventTick });
  const scheduler = createSequencerScheduler({ ticksPerBar: 384 });
  const args = { activeToyIds: new Set([panel.id]), getToy: () => panel, tickToAudioTime: t => t / 192, audioTimeToTick: t => Math.round(t * 192) };
  scheduler.tick({ ...args, currentTick: 192, lookaheadEndTick: 300 });
  const committed = calls.map(c => ({ ...c })), reset = panel.__forceSchedulerReset; applyToyInstrument(panel, 'retro_square');
  assert.equal(panel.__forceSchedulerReset, reset);
  scheduler.tick({ ...args, currentTick: 240, lookaheadEndTick: 400 });
  assert.deepEqual(calls.slice(0, committed.length), committed); assert.ok(committed.every(c => c.instrument === 'kalimba'));
  assert.ok(calls.slice(committed.length).every(c => c.instrument === 'retro_square')); assert.ok(calls.length > committed.length);
  assert.equal(instance.startTick, before.startTick); assert.equal(instance.id, before.id); assert.equal(instance.generation, before.generation);
  assert.equal(instance.transportId, before.transportId);
});

test('quick-add clones instrument and pitch metadata, including a Structure last-child reference', () => {
  const model = createConnectionModel(), panels = new Map();
  const a = new Element('A', 'bouncer'); panels.set(a.id, a); model.registerObject(a.id);
  applyToyInstrument(a, { value: 'kalimba', note: 'C5', octave: 5, pitchShift: true });
  const structures = createStructureToyModel(model, { getToyType: id => panels.get(id)?.dataset.toy });
  let serial = 0;
  const add = createConnectionQuickAdd({ model, structures, getToy: id => panels.get(id), createToy: (type, { soundState }) => {
    const p = new Element(`child${++serial}`, type); restoreToySoundState(p, soundState); panels.set(p.id, p); return p;
  } });
  const b = add({ objectId: a.id, portId: 'output' }); assert.deepEqual(readToySoundState(b), readToySoundState(a));
  const s = structures.promote(model.getParent(b.id).id, 'together');
  const c = add({ objectId: s.id, portId: 'child:1' }); assert.deepEqual(readToySoundState(c), readToySoundState(a));
  applyToyInstrument(a, 'retro_square'); assert.equal(b.dataset.instrument, 'kalimba'); assert.equal(c.dataset.instrument, 'kalimba');
  assert.equal(source('main.js').includes("nextToy.dataset.instrument = instrument"), false, 'legacy propagation is gone');
  assert.equal(source('main.js').includes('p.dataset.instrument = seedInstrument'), false, 'internal chain rebuild does not reset existing sounds');
  structures.dispose();
});

test('promotion, structure conversion and reparenting preserve each musical sound', () => {
  for (const type of ['sequence', 'together', 'repeat', 'timeline']) {
    const model = createConnectionModel(), a = new Element('A'), b = new Element('B');
    for (const p of [a, b]) { model.registerObject(p.id); applyToyInstrument(p, p.id === 'A' ? 'kalimba' : 'retro_square'); }
    const structures = createStructureToyModel(model);
    const edge = model.connect('sequence', { objectId: a.id, portId: 'output' }, { objectId: b.id, portId: 'input' }).connection;
    const before = [readToySoundState(a), readToySoundState(b)];
    const s = structures.promote(edge.id, type); assert.ok(s);
    model.disconnect(model.getParent(b.id).id);
    model.connect('sequence', { objectId: a.id, portId: 'output' }, { objectId: b.id, portId: 'input' });
    assert.deepEqual([readToySoundState(a), readToySoundState(b)], before); structures.dispose();
  }
});

test('sound state round-trips JSON and missing legacy fields retain the existing default', () => {
  for (const kind of MUSICAL_INSTRUMENT_TOYS) {
    const p = new Element(kind, kind); applyToyInstrument(p, { value: 'kalimba', octave: 4, pitchShift: true, note: 'C4' });
    const restored = new Element('restored', kind); restored.dataset.instrument = 'default';
    restoreToySoundState(restored, JSON.parse(JSON.stringify(readToySoundState(p))));
    assert.deepEqual(readToySoundState(restored), readToySoundState(p));
    const old = new Element('legacy', kind); old.dataset.instrument = 'existing-default'; restoreToySoundState(old, {});
    assert.equal(old.dataset.instrument, 'existing-default');
  }
});

test('owned popup dismisses on Escape, deletion, outside/selection and New Creation cancellation, without leaked observers', () => {
  for (const action of ['Escape', 'dispose', 'detach', 'outside', 'selection', 'reset']) {
    const panel = new Element(), doc = new EventTarget(); doc.body = {};
    let callback, disconnected = false, closes = [];
    class Observer { constructor(cb) { callback = cb; } observe() {} disconnect() { disconnected = true; } }
    const popup = createInstrumentPopupOwner({ panel, document: doc, Observer, onClose: result => closes.push(result) });
    if (action === 'Escape') { const e = new Event('keydown'); e.key = 'Escape'; doc.dispatchEvent(e); }
    else if (action === 'dispose') panel.dispatchEvent(new Event('toy:dispose'));
    else if (action === 'detach') { panel.isConnected = false; callback(); }
    else popup.close(action === 'selection' ? { value: 'kalimba' } : null);
    popup.close(); assert.equal(closes.length, 1); assert.equal(disconnected, true); assert.equal(popup.closed, true);
    doc.dispatchEvent(new Event('keydown')); assert.equal(closes.length, 1);
  }
  assert.match(source('main.js'), /window\.clearCreationGraph = \(\) => \{\s*closeInstrumentPicker\(\)/);
  assert.match(source('instrument-picker.js'), /backdrop\.onclick = \(\)=> session\.close\(null\)/);
});

test('initial instrument resolution preserves a saved choice while the catalog is still loading', () => {
  const s = source('toyui.js'),a = s.indexOf("  let initialInstrument ="),b = s.indexOf('  // Apply initial instrument', a);
  const panel = new Element('saved', 'chordwheel'); panel.dataset.instrument = 'KALIMBA';
  const value = vm.runInNewContext(`${s.slice(a,b)}\ninitialInstrument`, { panel, defaultInstrument: 'Acoustic Guitar', sel: null, getAllIds: () => [], console });
  assert.equal(value, 'KALIMBA');
});

test('actual Rippler persistence hook retains pitch metadata when the runtime snapshot hook is installed', () => {
  const s = source('persistence.js');
  const pitch = s.slice(s.indexOf('function applyInstrumentPitch'), s.indexOf('\nfunction ', s.indexOf('function applyInstrumentPitch')+10));
  const apply = s.slice(s.indexOf('function applyRippler'), s.indexOf('\nfunction snapDrawGrid'));
  const panel = new Element('rippler', 'rippler'); let received;
  panel.__applyRipplerSnapshot = state => { received = state; panel.dataset.instrument = state.instrument; };
  const state = { instrument: 'KALIMBA', instrumentPitchShift: true, instrumentOctave: 5, instrumentNote: 'C5' };
  vm.runInNewContext(`${pitch}\n${apply}\napplyRippler(panel,state)`, { panel, state, console });
  assert.strictEqual(received, state);
  assert.deepEqual(readToySoundState(panel), { instrument: 'KALIMBA', instrumentPitchShift: '1', instrumentOctave: '5', instrumentNote: 'C5' });
});

test('Chord Wheel scene restore notifies its live definition and reserializes the selected sound', () => {
  const s = source('persistence.js');
  const snapshots = s.slice(s.indexOf('const ToySnapshotters ='), s.indexOf('export function getSnapshot'));
  const pitch = s.slice(s.indexOf('function applyInstrumentPitch'), s.indexOf('\nfunction ', s.indexOf('function applyInstrumentPitch')+10));
  const panel = new Element('wheel', 'chordwheel'); panel.dataset.instrument = 'tone'; let definitionInstrument = 'tone';
  panel.addEventListener('toy-instrument', () => { definitionInstrument = panel.dataset.instrument; });
  const noop = () => {};
  const result = vm.runInNewContext(`${pitch}\n${snapshots}\nToySnapshotters.chordwheel.apply(panel,state); ToySnapshotters.chordwheel.snap(panel);`, {
    panel, state: { instrument: 'KALIMBA', instrumentPitchShift: true, instrumentOctave: 5, instrumentNote: 'C5' },
    applyToyInstrument, console, snapInstrumentPitch: readToySoundState,
    snapLoopGrid: noop, applyLoopGrid: noop, snapBouncer: noop, applyBouncer: noop,
    snapRippler: noop, applyRippler: noop, snapDrawGrid: noop, applyDrawGrid: noop,
  });
  assert.equal(definitionInstrument, 'KALIMBA'); assert.equal(result.instrument, 'KALIMBA'); assert.equal(result.instrumentOctave, '5');
});
