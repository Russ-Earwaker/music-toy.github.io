// Presentation adapters issue edits against canonical internal toys. They never
// return a second pattern or supply scheduler events for the wrapper.
export function createContainerPresentations({containers,readInternal,applyInternalEdit}){
 const adapters=new Map(),types=new Map();
 const context=id=>{const container=containers.get(id);if(!container)throw new Error('Container not found.');return {container,readInternal:objectId=>{if(!container.internalObjectIds.includes(objectId))throw new Error('Object is outside this container.');return readInternal(objectId);}};};
 return {
  register(type,adapter){if(adapters.has(type))throw new Error('Presentation already registered.');adapters.set(type,adapter);return ()=>adapters.delete(type);},
  renderSurface(id,host){const ctx=context(id);types.set(id,ctx.container.presentation.type);return adapters.get(ctx.container.presentation.type)?.renderSurface?.(host,ctx);},
  disposeSurface(id){adapters.get(types.get(id))?.disposeSurface?.(id);types.delete(id);},
  handleInteraction(id,event){const ctx=context(id),adapter=adapters.get(ctx.container.presentation.type);if(!adapter)return;
   const intent=adapter.handleInteraction?.(event,ctx),edits=adapter.mapInteractionToInternalEdit?.(intent,ctx)||[];
   // Validate every target before applying any edit.
   if(edits.some(edit=>!ctx.container.internalObjectIds.includes(edit.objectId)))throw new Error('Edit target is outside the container.');
   for(const edit of edits)applyInternalEdit(edit.objectId,edit.edit);
  },
 };
}
