import { MAIN_TRANSPORT_ID } from './transport-registry.js';
import { clearPlaybackInstances } from './playback-instances.js';

// Bulk removal must release source users before the normal Master delete guard.
export function orderCreationPanelRemoval(panels) {
  return [...panels].sort((a,b) => Number(!!b.dataset?.masterToyId) - Number(!!a.dataset?.masterToyId));
}

// Called after panel destruction and before saving the empty creation.
export function clearCreationGraph({ model, structures, sequence, adapter, clearScheduled = () => {} }) {
  sequence.reset();
  clearPlaybackInstances();
  clearScheduled();
  model.cancelDrag();
  structures.suspend(() => model.transaction(() => {
    structures.restore([]);
    for (const edge of model.list()) model.disconnect(edge.id);
    for (const id of model.getObjectIds()) {
      if (id === MAIN_TRANSPORT_ID) continue;
      model.removeObject(id);
    }
    adapter.sync([], { importLegacy: false, autoRoot: false });
  }));
}
