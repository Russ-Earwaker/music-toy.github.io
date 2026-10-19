// Convert screen pointers through CSS zoom into normalized authored content.
// Canvas backing pixels/DPR never participate in interaction geometry.
export function contentPointer(event,canvas,geometry){
 const rect=canvas.getBoundingClientRect();
 return {x:((event.clientX-rect.left)/rect.width*canvas.clientWidth-geometry.x)/geometry.width,y:((event.clientY-rect.top)/rect.height*canvas.clientHeight-geometry.y)/geometry.height};
}
