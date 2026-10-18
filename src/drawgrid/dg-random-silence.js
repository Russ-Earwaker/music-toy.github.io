// Extracted from normal DrawGrid line Randomise: 35% rests, or a repeated
// eight-step 25% motif for four bars with 12% final-bar variation.
export function seededRandom(seed){let value=seed>>>0;return ()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};}
export function selectDrawGridSilence(nodes,{steps=8,seed=0,random=seededRandom(seed)}={}){
 const motif=steps===32?Array.from({length:8},()=>random()<.25):null;
 const mask=Array.from({length:steps},(_,c)=>motif?(c>=24&&random()<.12?!motif[c%8]:motif[c%8]):random()<.35);
 let selected=nodes.filter(n=>mask[n.col]);
 // The old line rule could silence everything. Both callers now retain at
 // least one eligible source event; a one-note phrase is never erased.
 const columns=[...new Set(nodes.map(n=>n.col))];
 if(selected.length===nodes.length&&selected.length){const survivor=nodes.at(-1).col;selected=selected.filter(n=>n.col!==survivor);}
 if(!selected.length&&columns.length>1){const col=columns[Math.floor(random()*columns.length)];selected=nodes.filter(n=>n.col===col);}
 return selected.map(n=>n.id);
}
