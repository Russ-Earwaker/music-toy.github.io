export const DRAWGRID_LINE_COLORS=Object.freeze([
 'rgba(95,179,255,0.95)','rgba(255,95,179,0.95)',
 'rgba(95,255,179,0.95)','rgba(255,220,95,0.95)',
]);
export const drawGridLineColor=index=>DRAWGRID_LINE_COLORS[index%DRAWGRID_LINE_COLORS.length];
