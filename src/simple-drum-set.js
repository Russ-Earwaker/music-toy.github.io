import {nearbyFreeRect} from './graph-placement.js';
export const DRUM_SET_LAYOUT=Object.freeze([
 {label:'Kick',instrument:'DRUM KICK',x:45,y:170},
 {label:'Snare',instrument:'DRUM SNARE 1',x:-70,y:0},
 {label:'Hi-Hat',instrument:'HI-HAT CLOSED',x:-285,y:-10},
 {label:'High Tom',instrument:'DRUM SNARE 2',x:-100,y:-170},
 {label:'Low Tom',instrument:'DRUM BASS',x:100,y:-170},
 {label:'Cymbal',instrument:'HI-HAT OPEN',x:285,y:-10},
]);
// Includes the always-visible ring and left-hand control handle, in board units.
export function drumSetFootprint(center){
 const left=Math.min(...DRUM_SET_LAYOUT.map(d=>d.x-130)),top=Math.min(...DRUM_SET_LAYOUT.map(d=>d.y-64));
 const right=Math.max(...DRUM_SET_LAYOUT.map(d=>d.x+64)),bottom=Math.max(...DRUM_SET_LAYOUT.map(d=>d.y+64));
 return {x:center.x+left,y:center.y+top,width:right-left,height:bottom-top};
}
export function createDrumSet(objects,center,obstacles=objects.list().map(o=>({x:o.transform.x-130,y:o.transform.y-64,width:194,height:128}))){
 const desired=drumSetFootprint(center),free=nearbyFreeRect(desired,obstacles,24);
 if(!free)return [];
 center={x:center.x+free.x-desired.x,y:center.y+free.y-desired.y};
return DRUM_SET_LAYOUT.map(d=>objects.create({...d,x:center.x+d.x,y:center.y+d.y,periodLoops:1,volume:0.8}));}
