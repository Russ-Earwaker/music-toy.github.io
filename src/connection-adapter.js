import { TOY_PORTS, HEARTBEAT_PORTS } from './connections.js';
import { MAIN_TRANSPORT_ID, transportRegistry } from './transport-registry.js';
import { getPlaybackInstance, rebasePlaybackTransport } from './playback-instances.js';
import { isObjectMusicallyActive, projectMusicalActiveState } from './graph-playback-state.js';

// DOM datasets remain a persistence/legacy-creation adapter, never wire state.
export function createConnectionAdapter(model, { getInstance = getPlaybackInstance, isPlaying = () => true, onSequenceChange = () => {}, onDetach = () => {}, onTransportChange = onDetach, rebaseInstance = rebasePlaybackTransport } = {}) {
  let panels = [], syncing = false;
  const known = new Set();
  const rootedState = new Map();
  model.registerObject(MAIN_TRANSPORT_ID, { ports: HEARTBEAT_PORTS, transportId: MAIN_TRANSPORT_ID });
  const point = (objectId, portId) => ({ objectId, portId });
  function project() {
    const inputs = new Map(), outputs = new Map();
    for (const c of model.list('sequence')) {
      inputs.set(c.to.objectId, c.from.objectId);
      outputs.set(c.from.objectId, c.to.objectId);
    }
    for (const panel of panels) {
      const values = { prevToyId: inputs.get(panel.id), chainParent: inputs.get(panel.id),
        nextToyId: outputs.get(panel.id), chainHasChild: outputs.has(panel.id) ? '1' : undefined };
      for (const [key, value] of Object.entries(values)) {
        if (value == null) { if (key in panel.dataset) delete panel.dataset[key]; }
        else if (panel.dataset[key] !== value) panel.dataset[key] = value;
      }
    }
  }
  function applyOwnership({transient=!!model.getEditing()?.suspended} = {}) {
    for (const panel of panels) {
      const transportId = model.getTransportId(panel.id);
      const rooted = !!transportId;
      let instance = getInstance(panel.id);
      if (!transient && rooted && instance && instance.transportId !== transportId) {
        onTransportChange(panel.id);
        const transport = transportRegistry.get(transportId);
        const tick = transport?.state === 'playing' ? transport.nextBeatTick() : transport?.currentTick || 0;
        instance = rebaseInstance(panel.id, transportId, tick) || instance;
        if (instance) instance.transportId = transportId;
        panel.__forceSchedulerReset = true;
        delete panel.__loopStartOverrideSec;
        delete panel.__chainStartAt;
      }
      if (!transient) { panel.dataset.transportId = transportId || ''; }
      if (!transient && !rooted) {
        if (rootedState.get(panel.id)) onDetach(panel.id);
        if (instance) instance.active = false;
      } else if (!transient && instance && model.getParent(panel.id)?.kind === 'transport'
        && !model.list('sequence').some(c => c.from.objectId === panel.id)) instance.active = true;
      rootedState.set(panel.id, rooted);
      projectMusicalActiveState(panel, isPlaying(transportId) && isObjectMusicallyActive(model, panel.id, instance));
    }
  }
  const unsubscribe = model.subscribe(event => {
    if (syncing || event.type !== 'change') return;
    project();
    applyOwnership({transient:!!event.transient});
    if (!event.transient) onSequenceChange();
    applyOwnership({transient:!!event.transient});
  });
  function sync(nextPanels, { importLegacy = true, autoRoot = true } = {}) {
      syncing = true;
      try {
        panels = [...nextPanels];
        const present = new Set(panels.map(p => p.id));
        for (const id of known) if (!present.has(id)) {
          model.removeObject(id); known.delete(id); rootedState.delete(id);
        }
        const added = panels.filter(panel => !known.has(panel.id));
        for (const panel of panels) {
          known.add(panel.id); model.registerObject(panel.id, { ports: TOY_PORTS });
        }
        if (importLegacy) {
          const desired = new Map();
          for (const panel of panels) {
            const parent = panel.dataset.prevToyId || panel.dataset.chainParent;
            if (parent && present.has(parent)) desired.set(`${parent}|${panel.id}`, [parent, panel.id]);
            const next = panel.dataset.nextToyId;
            if (next && present.has(next)) desired.set(`${panel.id}|${next}`, [panel.id, next]);
          }
          for (const c of model.list('sequence')) if (present.has(c.from.objectId) && present.has(c.to.objectId)
            && !desired.has(`${c.from.objectId}|${c.to.objectId}`)) model.disconnect(c.id);
          for (const [from, to] of desired.values()) {
            if (!model.list('sequence').some(c => c.from.objectId === from && c.to.objectId === to)) {
              model.connect('sequence', point(from, 'output'), point(to, 'input'));
            }
          }
        }
        for (const panel of added) {
          if (autoRoot && !model.getParent(panel.id)) model.connect('transport', point(panel.__creationHeartbeatId || MAIN_TRANSPORT_ID, 'output'), point(panel.id, 'input'));
        }
        project();
        applyOwnership();
      } finally { syncing = false; }
  }
  return {
    sync,
    restore(saved, nextPanels) {
      sync(nextPanels, { importLegacy: false, autoRoot: false });
      syncing = true;
      try {
        model.cancelDrag();
        model.transaction(() => {
          for (const c of model.list()) model.disconnect(c.id);
          // Older snapshots contain redundant ownership wires. Structural parents
          // win regardless of serialization order; intentionally absent roots stay absent.
          for (const c of [...saved].sort((a,b) => Number(a?.kind === 'sequence') - Number(b?.kind === 'sequence'))) {
            if (!c || !['sequence', 'transport'].includes(c.kind) || !c.from || !c.to) continue;
            model.connect(c.kind, c.from, c.to, { id: typeof c.id === 'string' ? c.id : null });
          }
        });
        project(); applyOwnership();
      } finally { syncing = false; }
      onSequenceChange();
      applyOwnership();
    },
    discoverOwnership() {
      syncing = true;
      try {
        // Root creation happens once at registration, never from active audio
        // state (which could resurrect a deliberately removed wire).
        applyOwnership();
      } finally { syncing = false; }
    },
    projectActiveState() {
      for (const panel of panels) projectMusicalActiveState(panel,
        isPlaying(model.getTransportId(panel.id)) && isObjectMusicallyActive(model, panel.id, getInstance(panel.id)));
    },
    project, applyOwnership, dispose: unsubscribe,
  };
}
