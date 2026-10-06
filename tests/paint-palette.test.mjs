import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPaletteState, randomisePaintToy, segmentHitsRect, PALETTE_KEY, DEFAULT_PAINT_SLOTS } from '../src/paint-palette-state.js';
import { MUSICAL_INSTRUMENT_TOYS } from '../src/instrument-state.js';

class Panel extends EventTarget {
 constructor(id, toy='loopgrid') { super(); this.id=id; this.dataset={toy,instrument:'tone',instrumentNote:'D4'}; }
}
const memory = () => ({ value:null, getItem(){return this.value;},setItem(key,value){assert.equal(key,PALETTE_KEY);this.value=value;} });

test('every default uses an exact case-sensitive catalogue ID registered by the audio loader',()=>{
 const rows=readFileSync(new URL('../samples.csv',import.meta.url),'utf8').split(/\r?\n/);
 const headers=rows.shift().split(',');
 const ids=new Set(rows.filter(row=>row && !row.startsWith('#')).map(row=>{
  const columns=row.split(',');
  return columns[headers.indexOf('instrument_id')]?.trim() || columns[headers.indexOf('instrument')]?.trim() || columns[headers.indexOf('synth_id')]?.trim();
 }));
 assert.equal(DEFAULT_PAINT_SLOTS.length,6);
 for(const id of DEFAULT_PAINT_SLOTS) assert.ok(ids.has(id),`Audio lookup must resolve exact ID: ${id}`);
});
test('previously persisted default colour keys migrate to audio IDs and save the repair',()=>{
 const storage=memory();storage.value=JSON.stringify(['piano','kalimba','pluck','bell','drum kick','hi hat closed']);
 const p=createPaletteState({storage});assert.deepEqual(p.state.slots,[...DEFAULT_PAINT_SLOTS]);
 assert.deepEqual(JSON.parse(storage.value),[...DEFAULT_PAINT_SLOTS]);
 storage.value=JSON.stringify(['piano','DJEMBE BASS',null,'RETRO SQUARE','DRUM KICK','HI-HAT CLOSED']);
 assert.deepEqual(createPaletteState({storage}).state.slots,['PIANO','DJEMBE BASS',null,'RETRO SQUARE','DRUM KICK','HI-HAT CLOSED']);
});

test('six configurable wells persist, while equipped tool and stroke do not',()=>{
 const storage=memory(), palette=createPaletteState({storage});
 assert.equal(palette.state.slots.length,6);
 palette.configure(1,'pad'); palette.configure(4,null); palette.selectSlot(1); palette.paint(new Panel('a'));
 const reloaded=createPaletteState({storage});
 assert.deepEqual(reloaded.state.slots,palette.state.slots);
 assert.equal(reloaded.state.activePaletteTool,null); assert.equal(reloaded.state.strokeVisitedToyIds.size,0);
 for (const saved of ['{}','["piano"]','bad json']) { storage.value=saved; assert.equal(createPaletteState({storage}).state.slots.length,6); }
});
test('paint stays equipped after strokes; a second tap or clear puts it down',()=>{
 const p=createPaletteState();p.selectSlot(0);p.beginStroke();p.paint(new Panel('a'));p.endStroke();
 assert.equal(p.state.activePaletteTool,'instrument'); assert.equal(p.state.activePaintSlot,0);
 p.selectSlot(0);assert.equal(p.state.activePaletteTool,null);
 p.selectTool('randomise');p.clear();assert.equal(p.state.activePaletteTool,null);
});
test('a continuous stroke paints multiple toys once each through existing assignment events, preserving pitch',()=>{
 const p=createPaletteState(), a=new Panel('a'), b=new Panel('b'); let changes=0;
 for (const panel of [a,b]) panel.addEventListener('toy-instrument',()=>changes++);
 p.selectSlot(1);p.beginStroke();
 for (const panel of [a,a,b,b,a]) p.paint(panel);
 assert.equal(changes,2);assert.equal(a.dataset.instrument,'KALIMBA');assert.equal(b.dataset.instrument,'KALIMBA');
 assert.equal(a.dataset.instrumentNote,'D4');assert.equal(a.dataset.instrumentPersisted,'1');
 p.endStroke();p.beginStroke();p.paint(a);assert.equal(changes,3);
});
test('Randomise invokes every supported toy’s existing event/API once, and retains its instrument',()=>{
 for (const kind of MUSICAL_INSTRUMENT_TOYS) {
  const panel=new Panel(kind,kind);let calls=0;
  if (['drawgrid','loopgrid','loopgrid-drum'].includes(kind)) panel.__toyRandomMusic=()=>calls++;
  else panel.addEventListener('toy-random',()=>calls++);
  const p=createPaletteState();p.selectTool('randomise');p.beginStroke();p.paint(panel);p.paint(panel);
  assert.equal(calls,1,kind);assert.equal(panel.dataset.instrument,'tone',kind);
 }
});
test('all tools ignore Structures, Heartbeat and BeatSwarm',()=>{
 for (const tool of ['instrument','randomise','eyedropper']) for (const kind of ['sequence','repeat','timeline','together','main-heartbeat','heartbeat','beat-swarm']) {
  const p=createPaletteState(); if(tool==='instrument')p.selectSlot(0);else p.selectTool(tool);
  const panel=new Panel(kind,kind);assert.equal(p.paint(panel),false);assert.equal(randomisePaintToy(panel),false);
  assert.equal(panel.dataset.instrument,'tone');assert.equal(p.state.strokeVisitedToyIds.size,0);
 }
});
test('eyedropper selects an existing matching instrument without altering slots',()=>{
 const p=createPaletteState(), panel=new Panel('a');panel.dataset.instrument='PIANO';
 const before=[...p.state.slots];p.selectTool('eyedropper');p.paint(panel);
 assert.deepEqual(p.state.slots,before);assert.equal(p.state.activePaintSlot,0);assert.equal(p.state.activePaletteTool,'instrument');
});
test('eyedropper fills first empty well, then replaces last-used well when full',()=>{
 const p=createPaletteState(), panel=new Panel('a');panel.dataset.instrument='pad';
 p.configure(2,null);p.configure(4,null);p.selectTool('eyedropper');p.paint(panel);
 assert.equal(p.state.activePaintSlot,2);assert.equal(p.state.slots[2],'pad');assert.equal(p.state.slots[4],null);
 p.configure(4,'tone');p.selectSlot(3);p.endStroke();p.selectTool('eyedropper');panel.dataset.instrument='xylophone';p.paint(panel);
 assert.equal(p.state.activePaintSlot,3);assert.equal(p.state.slots[3],'xylophone');
});
test('eyedropper full-well fallback starts with first well',()=>{
 const p=createPaletteState(), panel=new Panel('a');panel.dataset.instrument='pad';p.selectTool('eyedropper');p.paint(panel);
 assert.equal(p.state.slots[0],'pad');
});
test('New Creation clear resets visited set and equipped tool without losing well assignments',()=>{
 const p=createPaletteState();p.selectSlot(0);p.paint(new Panel('a'));const slots=[...p.state.slots];p.clear();
 assert.equal(p.state.activePaletteTool,null);assert.equal(p.state.activePaintSlot,null);assert.equal(p.state.strokeVisitedToyIds.size,0);assert.deepEqual(p.state.slots,slots);
});
test('sparse pointer segments catch crossed small toys and miss nearby toys deterministically',()=>{
 const rect={left:10,right:20,top:10,bottom:20};
 assert.equal(segmentHitsRect({x:0,y:15},{x:30,y:15},rect),true);
 assert.equal(segmentHitsRect({x:30,y:15},{x:0,y:15},rect),true);
 assert.equal(segmentHitsRect({x:0,y:0},{x:30,y:30},rect),true);
 assert.equal(segmentHitsRect({x:0,y:5},{x:30,y:5},rect),false);
 assert.equal(segmentHitsRect({x:15,y:15},{x:15,y:15},rect),true);
});
test('instrument overrides update every shared owner, allow identical colours, and survive module reload',async()=>{
 const values=new Map();globalThis.localStorage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 const panels=[new Panel('a'),new Panel('b'),new Panel('c')];panels[2].dataset.instrument='piano';
 for(const panel of panels)panel.style={setProperty(k,v){this[k]=v;}};
 globalThis.document={querySelectorAll:()=>panels};globalThis.window=new EventTarget();
 const colours=await import('../src/instrument-colours.js?override-test');
 colours.setInstrumentColour('tone','#112233');
 assert.equal(panels[0].dataset.instrumentColour,'#112233');assert.equal(panels[1].style['--instrument-colour'],'#112233');
 assert.notEqual(panels[2].dataset.instrumentColour,'#112233');
 colours.setInstrumentColour('piano','#112233');assert.equal(colours.instrumentColour('piano'),'#112233');
 const reload=await import('../src/instrument-colours.js?override-reload');assert.equal(reload.instrumentColour('TONE'),'#112233');
 assert.equal(reload.setInstrumentColour('tone','invalid'),false);
 delete globalThis.localStorage;delete globalThis.document;delete globalThis.window;
});
test('integration wires screen-space UI, long press, empty-board clear, and scene reset',()=>{
 const ui=readFileSync(new URL('../src/paint-palette.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../paint-palette.css',import.meta.url),'utf8');
 assert.match(css,/#paint-palette\s*\{ position:fixed/);assert.match(ui,/document.body.appendChild\(root\)/);
 assert.match(ui,/setTimeout\(.*configure\(i\).*550/);assert.match(ui,/openInstrumentPicker\(\{ panel: dialog/);
 assert.match(ui,/stroke.empty && !stroke.moved && !stroke.painted/);assert.match(ui,/if \(clear\) palette.clear\(\)/);
 assert.match(ui,/window.addEventListener\('scene:new',reset\)/);
});
