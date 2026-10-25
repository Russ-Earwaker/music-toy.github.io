// Content is canonical; selecting Draw is transient interaction state only.
export function simplePaintState(hasLine,drawing=false){
 const state=hasLine?'AUTHORED_SCISSORS':drawing?'DRAW_ACTIVE':'EMPTY_IDLE';
 return {state,canvas:hasLine,draw:!hasLine,drawSelected:!hasLine&&drawing,scissors:hasLine,scissorsSelected:hasLine,coil:hasLine,clear:hasLine};
}
