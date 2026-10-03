export const STRUCTURE_TYPES = Object.freeze(['sequence', 'together', 'repeat', 'timeline']);
export const MAX_REPEAT_COUNT = 1024;
export const normalizeRepeatCount = value => {
  const count = Number(value ?? 2);
  return Math.min(MAX_REPEAT_COUNT, Math.max(1, Number.isFinite(count) ? Math.trunc(count) : 2));
};
export const structureTypeLabel = type => ({sequence:'Sequence',together:'Together',repeat:'Repeat',timeline:'Timeline'}[type]);
export function structureDuration(type, children, count = 2) {
  if (type === 'repeat') return (children[0]?.durationTicks || 0) * normalizeRepeatCount(count);
  if (type === 'sequence') return children.reduce((sum,c)=>sum+c.durationTicks,0);
  return Math.max(0,...children.map(c=>(type === 'timeline' ? c.offsetTick || 0 : 0)+c.durationTicks));
}
