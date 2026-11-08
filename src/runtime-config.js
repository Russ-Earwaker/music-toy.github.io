import {simpleShapes as shapeMetadata} from './simple-shapes.js';
// Runtime context only. Never serialize this manifest into projects or preferences.
const simpleShapes=Object.fromEntries(shapeMetadata.map(shape=>[shape.id,true]));
const backingToys = Object.freeze({'simple-draw': Object.freeze(['drawgrid'])});
const simpleToys = {'physical-cube':true,'physical-ball':true,'physical-gravity-ball':true,'simple-ripple':true,'simple-draw':true,'simple-drum':true,'simple-drum-set':true,'simple-string':true,'simple-strum':true};
function freeze(value) {
 for(const child of Object.values(value)) if(child && typeof child==='object') freeze(child);
 return Object.freeze(value);
}
export const PRESETS = freeze({
 normal: {
  interface:{simple:true,advanced:true,modeSwitcher:true,forcedMode:null}, simpleToys, simpleShapes,
  creation:{legacy:true,logic:true,game:true}, systems:{art:true,paintPalette:true,guide:true}, titleSuffix:''
 },
 simplePlaytest: {
  interface:{simple:true,advanced:false,modeSwitcher:false,forcedMode:'simple'}, simpleToys, simpleShapes,
  creation:{legacy:false,logic:false,game:false}, systems:{art:false,paintPalette:true,guide:true}, titleSuffix:' \u2014 Simple Playtest'
 }
});
export function resolvePreset(search='', warn=console.warn) {
 const name=new URLSearchParams(search).get('preset');
 if(!name || name==='normal') return PRESETS.normal;
 if(name==='simple-playtest') return PRESETS.simplePlaytest;
 warn('[Rhythmake] Unknown preset "'+name+'"; using normal.');
 return PRESETS.normal;
}
export const features=resolvePreset(globalThis.location?.search);
// Presentation preference only; deliberately separate from project/preset data.
export function resolveRenderQuality(search='') {
 return new URLSearchParams(search).get('quality')==='high'?'high':'standard';
}
export const renderQuality=resolveRenderQuality(globalThis.location?.search);
export function canCreateToy(type, config=features) {
 return Object.hasOwn(config.simpleToys,type) ? config.simpleToys[type] : config.creation.legacy;
}
export function canCreateShape(type,config=features){
 return canCreateToy('physical-cube',config)&&config.simpleShapes?.[type]===true;
}
// Hidden implementation toys are allowed only for enabled Simple features.
export function canCreateBackingToy(type, owner, config=features) {
 return !!config.simpleToys[owner] && (backingToys[owner]?.includes(type) ?? false);
}
export function canUsePalette(palette, config=features) {
 if(palette==='music') return true;
 if(palette==='art') return config.systems.art;
 return !!config.creation[palette];
}

// Temporary production-only presentation switch; experiment renderers remain available.
export const simplePaintDrawEffects = false;
