import {supportsToyInstrument,applyToyInstrument} from './instrument-state.js';

export const PAINT_TARGET_SELECTOR='.toy-panel[data-toy],.container-toy,.simple-ripple-object,.simple-drum-object,.string-surface-object,.physical-object';
export const supportsPaintTarget=target=>!!target?.paintOwner||supportsToyInstrument(target?.dataset?.toy);
export const paintInstrument=target=>target?.paintOwner?target.paintOwner.getInstrument():target?.dataset?.instrument;
export const assignPaintInstrument=(target,id)=>target?.paintOwner?target.paintOwner.setInstrument(id):applyToyInstrument(target,id);

// Body, surface, and movement controls all resolve to one authored owner.
export function resolvePaintTarget(element,board=globalThis.window?.BoardObjects){
 const panel=element?.closest?.(PAINT_TARGET_SELECTOR);if(!panel)return null;
 const owner=board?.instrumentOwner?.(panel.id);
 if(owner)return {id:owner.id,element:panel,paintOwner:owner};
 return supportsToyInstrument(panel.dataset?.toy)?panel:null;
}
