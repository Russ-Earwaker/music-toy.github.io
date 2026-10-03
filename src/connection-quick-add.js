import { MAIN_TRANSPORT_ID } from './transport-registry.js';
import { readToySoundState } from './instrument-state.js';

// Creation/placement stays in the existing toy factory; every resulting wire
// goes through the same port validation as a connector drag.
export function createConnectionQuickAdd({ model, structures, getToy, createToy, removeToy = () => {}, pickToy = () => {} }) {
  return point => {
    const port = model.getPort(point);
    if (port?.direction !== 'out' || model.list().some(c => c.from.objectId === point.objectId && c.from.portId === point.portId)
      || point.objectId === MAIN_TRANSPORT_ID) return null;
    const structure = structures?.get(point.objectId), source = getToy(point.objectId);
    const type = structure ? structure.lastChildType : source?.dataset?.toy;
    if (!type) { pickToy(point); return null; }
    const reference = structure ? getToy(structure.lastChildId) : source;
    const toy = createToy(type, { point, source, structure, reference, soundState: readToySoundState(reference) });
    if (!toy) return null;
    model.registerObject(toy.id);
    const result = model.connect('sequence', point, { objectId: toy.id, portId: 'input' });
    if (!result.ok) { model.removeObject(toy.id); removeToy(toy); return null; }
    // The child inherits through its new upstream edge; no parallel root wire.
    return toy;
  };
}
