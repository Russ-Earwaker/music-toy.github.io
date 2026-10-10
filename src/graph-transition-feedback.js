// Presentation only: select real edges crossed by a newly active runtime turn.
export function getActivationConnections(model, turn, previous) {
  if(!turn||!model.isRooted(turn.toyId))return [];
  const contexts=new Map((turn.structureContexts||[]).map(c=>[c.definitionId,c]));
  const old=new Map((previous?.structureContexts||[]).map(c=>[c.definitionId,c]));
  const edges=[],seen=new Set();let id=turn.toyId;
  while(id&&!seen.has(id)){
    seen.add(id);const edge=model.getParent(id);if(!edge)break;
    const structure=model.getObject(id)?.modifier || model.getObject(id)?.structure,context=structure&&contexts.get(structure.definitionId);
    if(id===turn.toyId || context&&old.get(structure.definitionId)?.startTick!==context.startTick)edges.push(edge);
    id=edge.from.objectId;
  }
  return edges;
}
