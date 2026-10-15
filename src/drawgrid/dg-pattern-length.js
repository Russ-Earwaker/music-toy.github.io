export const DRAWGRID_STEP_COUNTS = Object.freeze([8,16,32]);
// Preserve legacy 8/16-step subdivision timing; the long option is four bars
// of eighth-note slots, and is persisted simply as steps=32.
export const drawgridLoopLengthTicks = steps => Number(steps)===32 ? 1536 : 384;
export const toyLoopLengthTicks = (panel,instance) => panel?.dataset?.toy==='drawgrid'&&(Number(panel.dataset.steps)===32||panel.__drawGridPlayer||panel.__drawToy) ? drawgridLoopLengthTicks(panel.dataset.steps) : instance?.loopLengthTicks||384;
