export const DRUM_SET_LAYOUT=Object.freeze([
 {label:'Kick',instrument:'DRUM KICK',x:45,y:170},
 {label:'Snare',instrument:'DRUM SNARE 1',x:-70,y:0},
 {label:'Hi-Hat',instrument:'HI-HAT CLOSED',x:-285,y:-10},
 {label:'High Tom',instrument:'DRUM SNARE 2',x:-100,y:-170},
 {label:'Low Tom',instrument:'DRUM BASS',x:100,y:-170},
 {label:'Cymbal',instrument:'HI-HAT OPEN',x:285,y:-10},
]);
export function createDrumSet(objects,center){return DRUM_SET_LAYOUT.map(d=>objects.create({...d,x:center.x+d.x,y:center.y+d.y,periodLoops:1,volume:0.8}));}
