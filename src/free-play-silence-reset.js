// Bulk operations select a line's existing events/paint; they never rebuild it.
export const healLineCuts=line=>({cuts:Object.fromEntries(line.source.events.map(n=>[n.id,false])),randomCutIds:[]});
export function wipeLinePaint(paint,lineId){
 return {removed:paint.filter(s=>s.owner===lineId),remaining:paint.filter(s=>s.owner!==lineId)};
}
