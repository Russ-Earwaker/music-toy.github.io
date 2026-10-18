// Decorative paint on an empty page has no musical events yet. On drawing a
// string it transfers to that string's ordinary persisted paint/mute state.
let paint=[];
export const surfacePaint=()=>paint;
export function restoreSurfacePaint(value){paint=Array.isArray(value)?structuredClone(value):[];}
