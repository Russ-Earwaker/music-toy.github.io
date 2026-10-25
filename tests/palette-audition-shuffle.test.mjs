import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window=new EventTarget();
const {createInstrumentAudition,PALETTE_PREVIEW_BUS}=await import('../src/instrument-audition.js');
import {getCurrentPlaybackOccurrence,withPlaybackOccurrence} from '../src/playback-context.js';
import {createPaletteState,DEFAULT_PAINT_SLOTS,PALETTE_KEY} from '../src/paint-palette-state.js';
import {instrumentColour,setInstrumentColour} from '../src/instrument-colours.js';

test('one audition uses isolated quiet engine bus, middle pitched note and unpitched percussion',async()=>{
 const calls=[],transport={tick:73,state:'stopped'},authored={notes:[]};
 const audition=createInstrumentAudition({resume:async()=>calls.push('resume'),volume:(...a)=>calls.push(['volume',...a]),cancel:id=>calls.push(['cancel',id]),trigger:(...args)=>{assert.equal(getCurrentPlaybackOccurrence(),null);calls.push(['sound',...args]);return true;}});
 for(const id of ['PIANO','DRUM KICK','HI-HAT CLOSED'])assert.equal(await withPlaybackOccurrence({id:'board'},()=>audition(id)),true);
 const sounds=calls.filter(c=>c[0]==='sound');assert.equal(sounds.length,3);
 for(const [i,sound]of sounds.entries()){
  assert.equal(sound[2],'C4');assert.equal(sound[4],PALETTE_PREVIEW_BUS);
  assert.equal(sound[5].pitched,i===0);assert.equal(sound[5].pitchShift,i===0);
  assert.equal(sound[5].env,undefined,'preview preserves the native instrument envelope and sample tail');
  assert.equal(sound[5].strumEnv,undefined);
 }
 assert.deepEqual(transport,{tick:73,state:'stopped'});assert.deepEqual(authored,{notes:[]});
 assert.ok(calls.filter(c=>c[0]==='volume').every(c=>c[2]===.5));
});

test('Shuffle uses canonical theme entries without duplicates, persists only slots and clears any tool',()=>{
 const writes=[],storage={getItem:()=>null,setItem:(k,v)=>writes.push([k,v])};
 const entries=DEFAULT_PAINT_SLOTS.map(id=>({id,themes:['Acoustic']}));entries.push({id:'LASER',themes:['Space']});
 setInstrumentColour('PIANO','#4499cc');const colour=instrumentColour('PIANO');
 for(const tool of ['instrument','randomise','eyedropper']){
  const p=createPaletteState({storage});if(tool==='instrument')p.selectSlot(0);else p.selectTool(tool);
  assert.equal(p.shuffle(entries,'Acoustic',()=>.99),true);
  assert.equal(p.state.slots.length,6);assert.equal(new Set(p.state.slots).size,6);
  assert.ok(p.state.slots.every((id,i)=>id!==DEFAULT_PAINT_SLOTS[i]&&entries.some(e=>e.id===id&&e.themes.includes('Acoustic'))));
  assert.equal(p.state.activePaletteTool,null);assert.equal(p.state.activePaintSlot,null);
  assert.equal(instrumentColour('PIANO'),colour);
  const saved=JSON.stringify(p.state.slots);assert.deepEqual(writes.at(-1),[PALETTE_KEY,saved]);
  assert.deepEqual(createPaletteState({storage:{getItem:()=>saved}}).state.slots,p.state.slots);
 }
 assert.ok(writes.every(([key])=>key===PALETTE_KEY));
});

test('small pools allow repeats; empty or unavailable theme leaves assignments intact',()=>{
 const p=createPaletteState({storage:null});const before=[...p.state.slots];
 assert.equal(p.shuffle([{id:'PIANO',themes:['A']}],'B'),false);assert.deepEqual(p.state.slots,before);
 assert.equal(p.shuffle([{id:'PIANO'},{id:'PIANO'}]),true);assert.deepEqual(p.state.slots,Array(6).fill('PIANO'));
});
