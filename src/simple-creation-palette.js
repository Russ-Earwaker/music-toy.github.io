// A curated view over creation entries, not another set of creation modes.
export const SIMPLE_CREATION_CATEGORIES=Object.freeze([
 {id:'place',label:'PLACE'},
 {id:'trigger',label:'TRIGGER'},
 {id:'loop',label:'LOOP'},
 {id:'play',label:'PLAY'},
]);
export function simpleCreationGroups(entries){
 return SIMPLE_CREATION_CATEGORIES.map(category=>({...category,entries:entries.filter(entry=>entry.simpleCategory===category.id).sort((a,b)=>(a.simpleOrder||0)-(b.simpleOrder||0))}));
}
