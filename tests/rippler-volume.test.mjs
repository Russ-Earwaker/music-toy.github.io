import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const core = readFileSync(new URL('../src/ripplesynth-core.js', import.meta.url), 'utf8');
const audio = readFileSync(new URL('../src/toy-audio.js', import.meta.url), 'utf8');

test('Rippler head volume reaches all follower buses and survives their next activation', () => {
  const panels = [
    { id: 'RipplerHead', dataset: { toy: 'rippler', toyid: 'rippler' } },
    { id: 'RipplerChild', dataset: { toy: 'rippler', prevToyId: 'RipplerHead' } },
    { id: 'RipplerTail', dataset: { toy: 'rippler', prevToyId: 'RipplerChild' } },
    { id: 'OtherRippler', dataset: { toy: 'rippler' } },
  ];
  const a = core.indexOf('  const toyId =');
  const b = core.indexOf('  const triggerInstrument =', a);
  for (const panel of panels) {
    vm.runInNewContext(core.slice(a, b), { panel });
    assert.equal(panel.dataset.toyid, panel.id);
  }
  const volumes = new Map(), listeners = new Map();
  const context = vm.createContext({
    __toyState: new Map(),
    window: { addEventListener: (name, fn) => listeners.set(name, fn) },
    document: {
      getElementById: id => panels.find(p => p.id === id),
      querySelectorAll: () => panels,
    },
    setToyVolume: (id, value) => volumes.set(id.toLowerCase(), value),
    syncVolumeUI() {},
  });
  const start = audio.indexOf('function keyOf(');
  const end = audio.indexOf('// On transport pause', start);
  vm.runInContext(audio.slice(start, end), context);
  for (const value of [0.2, 0, 0.75]) {
    listeners.get('toy-volume')({ detail: { toyId: panels[0].dataset.toyid, value } });
    for (const panel of panels.slice(0, 3)) {
      assert.equal(volumes.get(panel.id.toLowerCase()), value);
      // Exercise the same gain restoration used when each Rippler's turn starts.
      const gain = { cancelScheduledValues() {}, setTargetAtTime(v) { this.value = v; } };
      const from = core.indexOf('            const gainNode = getToyGain(toyId);', core.indexOf('// --- Chain Activation Logic ---'));
      const to = core.indexOf('            __schedState.turnOver', from);
      vm.runInNewContext(core.slice(from, to), {
        toyId: panel.dataset.toyid, ac: { currentTime: 5 },
        getToyGain: () => ({ gain }), getToyVolume: id => volumes.get(id.toLowerCase()),
      });
      assert.equal(gain.value, value);
    }
    assert.equal(volumes.has('otherrippler'), false, 'unrelated toys retain their volume');
  }
});
